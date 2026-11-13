const analyticsModel = require('../models/analyticsModel');
const activityModel = require('../models/activityModel');
const productModel = require('../models/productModel');
const userModel = require('../models/userModel');
const orderModel = require('../models/orderModel');
const adminUpgradeModel = require('../models/adminUpgradeModel');
const customerNotificationModel = require('../models/customerNotificationModel');
const securityAuditService = require('../services/securityAuditService');
const { testConnection, query } = require('../config/db');

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

    // Trigger Smart Back-in-Stock Notifications if replenished
    if (Number(stock) > 0) {
      customerNotificationModel.triggerBackInStockNotifications(id, stock).catch(() => { });
    }

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

    // Trigger Smart Shipping Update Notification for Customer
    if (updated.user_id && ['Dispatched', 'In Transit', 'Out for Delivery', 'Delivered', 'Processing'].includes(status)) {
      customerNotificationModel.createNotification({
        userId: updated.user_id,
        type: 'shipping_update',
        title: `White-Glove Dispatch: Order #${updated.id} is ${status}`,
        message: `Your couture parcel status is now "${status}". Tracking: ${updated.tracking_number || 'SS-EXP-2026'}. Courier Partner: Bluedart Apex Express.`,
        badge: status === 'Delivered' ? '✓ Delivered' : '🚚 Shipping Update',
        icon: 'truck',
        image: 'images/emblem.png',
        link: `account.html?tab=orders&id=${updated.id}`,
        metadata: { orderId: updated.id, status, trackingNumber: updated.tracking_number }
      }).catch(() => { });
    }

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

/* ============================================================
   Support Queries Controller
   ============================================================ */
async function getSupportQueries(req, res) {
  try {
    const status = req.query.status || null;
    const queries = await adminUpgradeModel.getSupportQueries(status);
    res.json(queries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve customer inquiries.' });
  }
}

async function updateSupportQuery(req, res) {
  const id = Number(req.params.id);
  const { status, adminNotes } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid query ID.' });

  try {
    const updated = await adminUpgradeModel.updateSupportQuery(id, { status, adminNotes });
    if (!updated) return res.status(404).json({ error: 'Support query not found.' });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'support_query_update',
      description: `Support inquiry #${id} updated to "${status}" by Administrator ${req.user.name}`,
      metadata: { queryId: id, status }
    }).catch(() => { });

    res.json({ message: 'Support inquiry updated successfully.', query: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ============================================================
   Website Content Management Controller
   ============================================================ */
async function getWebsiteSettings(req, res) {
  try {
    const settings = await adminUpgradeModel.getAllWebsiteSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve website settings.' });
  }
}

async function updateWebsiteSetting(req, res) {
  const key = req.params.key;
  const { value } = req.body || {};
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Setting key and value are required.' });
  }

  try {
    const updated = await adminUpgradeModel.setWebsiteSetting(key, value);
    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'setting_update',
      description: `Website setting "${key}" updated by Administrator ${req.user.name}`,
      metadata: { settingKey: key }
    }).catch(() => { });

    res.json({ message: `Setting "${key}" updated successfully.`, setting: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ============================================================
   Admin Notifications Controller
   ============================================================ */
async function getAdminNotifications(req, res) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const result = await adminUpgradeModel.getAdminNotifications(limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
}

async function markAllNotificationsRead(req, res) {
  try {
    await adminUpgradeModel.markAllNotificationsRead();
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function clearNotifications(req, res) {
  try {
    const id = req.params.id ? Number(req.params.id) : null;
    await adminUpgradeModel.clearAdminNotifications(id);
    res.json({ success: true, message: id ? 'Notification removed.' : 'All notifications cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ============================================================
   Customer Purchase History for Customer Profile
   ============================================================ */
async function getUserOrdersAdmin(req, res) {
  const userId = Number(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID.' });

  try {
    const orders = await adminUpgradeModel.getUserOrdersForAdmin(userId);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user order history.' });
  }
}

/* ============================================================
   Admin Password Management
   ============================================================ */
async function updateAdminPassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  try {
    await adminUpgradeModel.updateAdminPassword(req.user.id, currentPassword, newPassword);
    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'admin_password_changed',
      description: `Administrator ${req.user.name} changed their account security credentials.`,
      metadata: { adminId: req.user.id }
    }).catch(() => { });

    res.json({ success: true, message: 'Administrator security credentials updated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* ============================================================
   System & Database Health Monitor
   ============================================================ */
async function getSystemHealth(req, res) {
  try {
    const dbHealth = await testConnection();
    const isHealthy = dbHealth.success;

    let counts = { products: 0, categories: 0, users: 0, orders: 0, queries: 0, notifications: 0 };
    if (isHealthy) {
      const [p, c, u, o, q, n] = await Promise.all([
        query('SELECT COUNT(*)::int AS count FROM products;'),
        query('SELECT COUNT(*)::int AS count FROM categories;'),
        query('SELECT COUNT(*)::int AS count FROM users;'),
        query('SELECT COUNT(*)::int AS count FROM orders;'),
        query('SELECT COUNT(*)::int AS count FROM support_queries;'),
        query('SELECT COUNT(*)::int AS count FROM admin_notifications;')
      ]);
      counts = {
        products: p.rows[0].count,
        categories: c.rows[0].count,
        users: u.rows[0].count,
        orders: o.rows[0].count,
        queries: q.rows[0].count,
        notifications: n.rows[0].count
      };
    }

    const memoryUsage = process.memoryUsage();

    res.json({
      status: isHealthy ? 'healthy' : 'degraded',
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`
      },
      database: {
        status: isHealthy ? 'connected' : 'disconnected',
        name: dbHealth.database,
        user: dbHealth.user,
        serverTime: dbHealth.time,
        ...counts
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to inspect system health.' });
  }
}

/* ============================================================
   Security & Fraud Management Controller
   ============================================================ */
async function getSecurityAuditLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const eventType = req.query.eventType || null;
    const severity = req.query.severity || null;
    const logs = await securityAuditService.getAuditLogs({ limit, eventType, severity });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve security audit logs.' });
  }
}

async function getSecurityStats(req, res) {
  try {
    const stats = await securityAuditService.getSecurityStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve security statistics.' });
  }
}

async function reviewOrderFraud(req, res) {
  const { id } = req.params;
  const { decision, notes } = req.body || {};
  if (!decision || !['approved', 'blocked'].includes(decision)) {
    return res.status(400).json({ error: 'Valid decision ("approved" or "blocked") is required.' });
  }

  try {
    const updated = await orderModel.updateOrderFraudReview(id, decision, notes);
    if (!updated) return res.status(404).json({ error: 'Order not found.' });

    securityAuditService.logSecurityEvent({
      eventType: 'ADMIN_FRAUD_REVIEW',
      severity: decision === 'blocked' ? 'WARNING' : 'INFO',
      userId: req.user.id,
      userEmail: req.user.email,
      path: `/api/admin/orders/${id}/fraud-review`,
      method: 'PUT',
      details: { orderId: id, decision, notes }
    }).catch(() => {});

    res.json({
      success: true,
      message: `Commission Order #${id} fraud status updated to "${decision.toUpperCase()}".`,
      order: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function unlockUserAccount(req, res) {
  const { id } = req.params;
  try {
    const unlocked = await userModel.unlockUser(id);
    if (!unlocked) return res.status(404).json({ error: 'User account not found.' });

    securityAuditService.logSecurityEvent({
      eventType: 'ADMIN_ACCOUNT_UNLOCKED',
      severity: 'INFO',
      userId: req.user.id,
      userEmail: req.user.email,
      path: `/api/admin/users/${id}/unlock`,
      method: 'POST',
      details: { unlockedUserId: id, unlockedEmail: unlocked.email }
    }).catch(() => {});

    res.json({
      success: true,
      message: `Account for ${unlocked.name} (${unlocked.email}) successfully unlocked.`,
      user: unlocked
    });
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
  updateOrderPaymentStatus,
  getSupportQueries,
  updateSupportQuery,
  getWebsiteSettings,
  updateWebsiteSetting,
  getAdminNotifications,
  markAllNotificationsRead,
  clearNotifications,
  getUserOrdersAdmin,
  updateAdminPassword,
  getSystemHealth,
  getSecurityAuditLogs,
  getSecurityStats,
  reviewOrderFraud,
  unlockUserAccount
};

