const customerNotificationModel = require('../models/customerNotificationModel');

async function getNotifications(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const notifications = await customerNotificationModel.getNotificationsForUser(userId);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    // Categorized counts for UI filter tabs
    const counts = {
      all: notifications.length,
      orders: notifications.filter(n => n.type === 'order_confirmation' || n.type === 'shipping_update').length,
      stock: notifications.filter(n => n.type === 'back_in_stock').length,
      promos: notifications.filter(n => n.type === 'promotional').length
    };

    res.json({
      notifications,
      unreadCount,
      counts
    });
  } catch (err) {
    console.error('[Customer Notification Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
}

async function markRead(req, res) {
  try {
    const id = Number(req.params.id);
    const userId = req.user ? req.user.id : null;
    const updated = await customerNotificationModel.markNotificationRead(id, userId);
    res.json({ success: true, notification: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function markAllRead(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    await customerNotificationModel.markAllNotificationsRead(userId);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function clearAll(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    await customerNotificationModel.clearNotifications(userId);
    res.json({ success: true, message: 'All notifications cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function subscribeBackInStock(req, res) {
  try {
    const { productId, email } = req.body || {};
    const userId = req.user ? req.user.id : null;
    const userEmail = email || req.user?.email;

    if (!productId || !userEmail) {
      return res.status(400).json({ error: 'Product ID and email address are required.' });
    }

    const sub = await customerNotificationModel.subscribeBackInStock({
      productId,
      userId,
      email: userEmail
    });

    res.json({
      success: true,
      message: 'Subscription confirmed! You will receive an instant Smart Notification when this piece is restocked in the atelier.',
      subscription: sub
    });
  } catch (err) {
    console.error('[Back-in-Stock Subscription Error]:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  clearAll,
  subscribeBackInStock
};

