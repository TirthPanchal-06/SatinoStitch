const analyticsModel = require('../models/analyticsModel');
const activityModel = require('../models/activityModel');
const productModel = require('../models/productModel');
const userModel = require('../models/userModel');
const orderModel = require('../models/orderModel');

async function getAnalytics(req, res) {
  try {
    const data = await analyticsModel.getAdminAnalytics();
    res.json(data);
  } catch (err) {
    console.error('[Admin Analytics Error]:', err);
    res.status(500).json({ error: 'Failed to compute atelier analytics.' });
  }
}

async function getActivities(req, res) {
  const limit = Math.min(100, parseInt(req.query.limit || '30', 10));
  const type = req.query.type || null;
  try {
    const activities = await activityModel.getCustomerActivities(limit, type);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve activity stream.' });
  }
}

async function getInventory(req, res) {
  try {
    const summary = await productModel.getInventorySummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve atelier inventory.' });
  }
}

async function updateProductStock(req, res) {
  const id = Number(req.params.id);
  const { stock } = req.body || {};
  if (isNaN(id) || stock === undefined) {
    return res.status(400).json({ error: 'Valid Product ID and stock value are required.' });
  }
  try {
    const updated = await productModel.setProductStock(id, stock);
    if (!updated) return res.status(404).json({ error: 'Product not found.' });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'inventory_update',
      description: `Stock adjusted for "${updated.name}" to ${updated.stock} units by Administrator ${req.user.name}`,
      metadata: { productId: id, newStock: updated.stock }
    }).catch(() => { });

    res.json({ message: 'Stock updated successfully.', product: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAllUsers(req, res) {
  try {
    const users = await userModel.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve patron accounts.' });
  }
}

async function updateUserRole(req, res) {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (isNaN(id) || !role) {
    return res.status(400).json({ error: 'Valid user ID and target role are required.' });
  }
  try {
    const updated = await userModel.updateUserRole(id, role);
    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'role_change',
      description: `Role for user ${updated.email} updated to "${role}" by ${req.user.name}`,
      metadata: { targetUserId: id, role }
    }).catch(() => { });

    res.json({ message: `Role updated to "${role}".`, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAllOrders(req, res) {
  try {
    const orders = await orderModel.getAllOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch atelier order manifests.' });
  }
}

async function updateOrderStatus(req, res) {
  const id = req.params.id;
  const { status, trackingNumber, cancelReason, returnReason } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }

  try {
    const updated = await orderModel.updateOrderStatus(id, status, trackingNumber, cancelReason, returnReason);
    if (!updated) return res.status(404).json({ error: 'Order not found.' });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'order_status_update',
      description: `Order #${id} status changed to "${status}" by Administrator ${req.user.name}`,
      metadata: { orderId: id, status, trackingNumber }
    }).catch(() => { });

    res.json({ message: `Order #${id} updated to ${status}.`, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateOrderPaymentStatus(req, res) {
  const id = req.params.id;
  const { paymentStatus } = req.body || {};
  if (!paymentStatus) {
    return res.status(400).json({ error: 'Payment status is required.' });
  }

  try {
    const updated = await orderModel.updateOrderPaymentStatus(id, paymentStatus);
    if (!updated) return res.status(404).json({ error: 'Order not found.' });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'payment_status_update',
      description: `Order #${id} payment marked as "${paymentStatus.toUpperCase()}" by ${req.user.name}`,
      metadata: { orderId: id, paymentStatus }
    }).catch(() => { });

    res.json({ message: `Order #${id} payment marked as ${paymentStatus}.`, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAnalytics,
  getActivities,
  getInventory,
  updateProductStock,
  getAllUsers,
  updateUserRole,
  getAllOrders,
  updateOrderStatus,
  updateOrderPaymentStatus
};

