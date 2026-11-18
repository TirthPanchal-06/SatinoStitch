const returnModel = require('../models/returnModel');
const activityModel = require('../models/activityModel');
const adminUpgradeModel = require('../models/adminUpgradeModel');
const customerNotificationModel = require('../models/customerNotificationModel');

/* ============================================================
   Customer Return Endpoints
   ============================================================ */
async function getEligibleOrders(req, res) {
  try {
    const eligibleOrders = await returnModel.getEligibleOrdersForUser(req.user.id, req.user.email);
    res.json({
      orders: eligibleOrders,
      reasons: returnModel.RETURN_REASONS
    });
  } catch (err) {
    console.error('[Return Controller - getEligibleOrders]:', err);
    res.status(500).json({ error: 'Failed to retrieve eligible orders for return.' });
  }
}

async function getMyReturns(req, res) {
  try {
    const returns = await returnModel.getUserReturns(req.user.id, req.user.email);
    const summary = {
      total: returns.length,
      pending: returns.filter(r => r.status === 'Pending').length,
      approved: returns.filter(r => r.status === 'Approved').length,
      processing: returns.filter(r => r.status === 'Processing').length,
      completed: returns.filter(r => r.status === 'Completed').length,
      rejected: returns.filter(r => r.status === 'Rejected').length
    };
    res.json({ returns, summary });
  } catch (err) {
    console.error('[Return Controller - getMyReturns]:', err);
    res.status(500).json({ error: 'Failed to retrieve your return history.' });
  }
}

async function submitReturnRequest(req, res) {
  const { orderId, orderItemId, productId, quantity, reason, comments } = req.body || {};

  try {
    const created = await returnModel.createReturnRequest({
      userId: req.user.id,
      userEmail: req.user.email,
      orderId,
      orderItemId,
      productId,
      quantity,
      reason,
      comments
    });

    // Notify admin immediately
    adminUpgradeModel.createAdminNotification({
      type: 'return',
      title: `New Return Request ${created.returnCode}`,
      message: `${created.customerName} requested return for "${created.productName}" (${created.size} · ${created.color}, Qty ${created.quantity}) from Order #${created.orderId} — Reason: ${created.reason}`,
      link: 'admin.html?tab=returns'
    }).catch(() => {});

    // Notify customer confirmation
    customerNotificationModel.createNotification({
      userId: req.user.id,
      type: 'shipping_update',
      title: `Return Request Submitted (${created.returnCode})`,
      message: `Your return request for "${created.productName}" (Order #${created.orderId}) is now Pending review by our atelier concierge.`,
      badge: '↩ Return Requested',
      icon: 'package',
      image: created.productImage || 'images/emblem-white.png',
      link: 'returns.html',
      metadata: { returnId: created.id, returnCode: created.returnCode, orderId: created.orderId, status: 'Pending' }
    }).catch(() => {});

    // Log customer activity
    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'return_request',
      description: `Return request ${created.returnCode} submitted for "${created.productName}" (${created.size} · ${created.color}, Qty ${created.quantity}) on Order #${created.orderId}`,
      metadata: { returnId: created.id, returnCode: created.returnCode, orderId: created.orderId, productId: created.productId, reason: created.reason }
    }).catch(() => {});

    res.status(201).json({
      message: `Return request ${created.returnCode} submitted successfully. Our atelier team will review it shortly.`,
      returnRequest: created
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not submit return request.' });
  }
}

/* ============================================================
   Administrator Return Management Endpoints
   ============================================================ */
async function getAllReturnsAdmin(req, res) {
  try {
    const status = req.query.status || 'all';
    const search = req.query.search || '';
    const [returns, stats] = await Promise.all([
      returnModel.getAllReturnsAdmin({ status, search }),
      returnModel.getReturnStats()
    ]);
    res.json({ returns, stats });
  } catch (err) {
    console.error('[Return Controller - getAllReturnsAdmin]:', err);
    res.status(500).json({ error: 'Failed to retrieve return requests.' });
  }
}

async function updateReturnStatusAdmin(req, res) {
  const id = Number(req.params.id);
  const { status, adminNotes, restockInventory = true } = req.body || {};

  if (isNaN(id) || !status) {
    return res.status(400).json({ error: 'Valid return request ID and target status are required.' });
  }

  try {
    const updated = await returnModel.updateReturnStatus(id, {
      status,
      adminNotes: adminNotes !== undefined ? adminNotes : null,
      restockInventory
    });

    if (!updated) {
      return res.status(404).json({ error: 'Return request not found.' });
    }

    // Notify customer immediately of synchronized status change
    if (updated.userId) {
      const statusCopy = {
        Approved: {
          title: `Return Approved (${updated.returnCode})`,
          badge: '✓ Return Approved',
          msg: `Your return request for "${updated.productName}" (Order #${updated.orderId}) has been approved. Reverse pickup will be scheduled shortly.`
        },
        Processing: {
          title: `Return In Processing (${updated.returnCode})`,
          badge: '⚙ Processing Return',
          msg: `Your returned creation "${updated.productName}" (Order #${updated.orderId}) is currently being inspected and processed at our atelier.`
        },
        Completed: {
          title: `Return Completed & Refunded (${updated.returnCode})`,
          badge: '✓ Return Completed',
          msg: `Your return for "${updated.productName}" (Order #${updated.orderId}) is complete. Refund of ₹${Number(updated.refundAmount || 0).toLocaleString('en-IN')} has been finalized.`
        },
        Rejected: {
          title: `Return Request Update (${updated.returnCode})`,
          badge: '✕ Return Rejected',
          msg: `Your return request for "${updated.productName}" (Order #${updated.orderId}) could not be approved.${updated.adminNotes ? ` Concierge Note: ${updated.adminNotes}` : ''}`
        }
      }[updated.status];

      if (statusCopy) {
        customerNotificationModel.createNotification({
          userId: updated.userId,
          type: 'shipping_update',
          title: statusCopy.title,
          message: statusCopy.msg,
          badge: statusCopy.badge,
          icon: 'package',
          image: updated.productImage || 'images/emblem-white.png',
          link: 'returns.html',
          metadata: { returnId: updated.id, returnCode: updated.returnCode, orderId: updated.orderId, status: updated.status }
        }).catch(() => {});
      }
    }

    // Log admin resolution activity
    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'return_status_update',
      description: `Return ${updated.returnCode} (Order #${updated.orderId}) updated to "${updated.status}" by ${req.user?.name || 'Administrator'}`,
      metadata: { returnId: updated.id, returnCode: updated.returnCode, orderId: updated.orderId, status: updated.status, adminNotes: updated.adminNotes }
    }).catch(() => {});

    res.json({
      message: `Return request ${updated.returnCode} updated to "${updated.status}".`,
      returnRequest: updated
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not update return status.' });
  }
}

module.exports = {
  getEligibleOrders,
  getMyReturns,
  submitReturnRequest,
  getAllReturnsAdmin,
  updateReturnStatusAdmin
};
