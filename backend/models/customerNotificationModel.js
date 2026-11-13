const { query } = require('../config/db');

/**
 * SATINOSTITCH Smart Notifications Model
 * Handles:
 * 1. Order Confirmation
 * 2. Shipping Updates
 * 3. Back-in-Stock Alerts
 * 4. Promotional Privileges
 */

async function createNotification({
  userId = null,
  type, // 'order_confirmation' | 'shipping_update' | 'back_in_stock' | 'promotional'
  title,
  message,
  badge = 'Atelier Update',
  icon = 'bell',
  image = 'images/emblem.png',
  link = '#',
  metadata = {}
}) {
  const sql = `
    INSERT INTO customer_notifications (
      user_id, type, title, message, badge, icon, image, link, metadata, is_read, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW())
    RETURNING *;
  `;
  const res = await query(sql, [
    userId,
    type,
    title,
    message,
    badge,
    icon,
    image,
    link,
    JSON.stringify(metadata || {})
  ]);
  return res.rows[0];
}

async function getNotificationsForUser(userId, limit = 25) {
  let sql;
  let params;

  if (userId) {
    sql = `
      SELECT id, user_id, type, title, message, badge, icon, image, link, metadata, is_read, created_at
      FROM customer_notifications
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    params = [userId, limit];
  } else {
    // For guest visitors, retrieve global concierge notifications (user_id IS NULL)
    sql = `
      SELECT id, user_id, type, title, message, badge, icon, image, link, metadata, is_read, created_at
      FROM customer_notifications
      WHERE user_id IS NULL
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    params = [limit];
  }

  const res = await query(sql, params);

  // If no notifications exist yet, seed a default welcoming suite covering all 4 types
  if (res.rows.length === 0) {
    await seedDefaultSmartNotifications(userId);
    const refreshed = await query(sql, params);
    return refreshed.rows;
  }

  return res.rows;
}

async function markNotificationRead(id, userId = null) {
  const numId = Number(id);
  if (isNaN(numId)) return null;

  let sql;
  let params;
  if (userId) {
    sql = `UPDATE customer_notifications SET is_read = TRUE WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) RETURNING *;`;
    params = [numId, userId];
  } else {
    sql = `UPDATE customer_notifications SET is_read = TRUE WHERE id = $1 RETURNING *;`;
    params = [numId];
  }
  const res = await query(sql, params);
  return res.rows[0] || null;
}

async function markAllNotificationsRead(userId = null) {
  if (userId) {
    await query(`UPDATE customer_notifications SET is_read = TRUE WHERE user_id = $1 OR user_id IS NULL;`, [userId]);
  } else {
    await query(`UPDATE customer_notifications SET is_read = TRUE WHERE user_id IS NULL;`);
  }
  return true;
}

async function clearNotifications(userId = null) {
  if (userId) {
    await query(`DELETE FROM customer_notifications WHERE user_id = $1;`, [userId]);
  }
  return true;
}

async function subscribeBackInStock({ productId, userId = null, email }) {
  const pId = Number(productId);
  if (isNaN(pId) || !email) {
    throw new Error('Valid Product ID and patron email are required.');
  }

  const sql = `
    INSERT INTO back_in_stock_subscriptions (product_id, user_id, email, notified, created_at)
    VALUES ($1, $2, $3, false, NOW())
    RETURNING *;
  `;
  const res = await query(sql, [pId, userId, email.trim().toLowerCase()]);
  return res.rows[0];
}

async function triggerBackInStockNotifications(productId, newStock) {
  const pId = Number(productId);
  if (isNaN(pId) || newStock <= 0) return 0;

  // 1. Get product details
  const prodRes = await query(`SELECT id, name, price, image, fabric, col FROM products WHERE id = $1;`, [pId]);
  if (prodRes.rows.length === 0) return 0;
  const product = prodRes.rows[0];

  // 2. Find pending subscribers
  const subsRes = await query(
    `SELECT id, user_id, email FROM back_in_stock_subscriptions WHERE product_id = $1 AND notified = FALSE;`,
    [pId]
  );

  let notifiedCount = 0;
  for (const sub of subsRes.rows) {
    await createNotification({
      userId: sub.user_id,
      type: 'back_in_stock',
      title: `${product.name} is Back in Stock!`,
      message: `Artisanal replenishment: ${newStock} pieces now available in ${product.fabric || 'pure silk'}. Reserve your size before this limited edition wave closes.`,
      badge: '✨ Restock Alert',
      icon: 'sparkles',
      image: product.image,
      link: `product.html?id=${product.id}`,
      metadata: { productId: product.id, stock: newStock, price: product.price }
    });
    notifiedCount++;
  }

  // Mark subscriptions as notified
  if (subsRes.rows.length > 0) {
    await query(`UPDATE back_in_stock_subscriptions SET notified = TRUE WHERE product_id = $1;`, [pId]);
  }

  // Also broadcast a global restock notification for general patrons
  await createNotification({
    userId: null,
    type: 'back_in_stock',
    title: `Atelier Restock: ${product.name}`,
    message: `Limited edition replenishment: ${newStock} units available for immediate white-glove dispatch.`,
    badge: '✨ Back in Stock',
    icon: 'sparkles',
    image: product.image,
    link: `product.html?id=${product.id}`,
    metadata: { productId: product.id, stock: newStock }
  });

  return notifiedCount;
}

/**
 * Seeds default smart notifications ensuring representation across all 4 types:
 * 1. Order Confirmation
 * 2. Shipping Updates
 * 3. Back-in-Stock Alerts
 * 4. Promotional Privilege
 */
async function seedDefaultSmartNotifications(userId = null) {
  const defaults = [
    {
      type: 'order_confirmation',
      title: 'Haute Couture Order Confirmed (#SS-84920)',
      message: 'Your bridal commission is confirmed. Senior master artisan assigned for hand-tailoring and gold zardozi finishing.',
      badge: '📦 Order Confirmed',
      icon: 'package',
      image: 'images/p1_front.jpg',
      link: 'account.html?tab=orders',
      metadata: { orderId: 'SS-84920', total: 6490, status: 'Confirmed' }
    },
    {
      type: 'shipping_update',
      title: 'White-Glove Dispatch: Tracking #SS-EXP-847291',
      message: 'Your silk trousseau parcel has departed our Jaipur Atelier via Bluedart Apex Express. Estimated delivery within 48 hours.',
      badge: '🚚 Dispatched',
      icon: 'truck',
      image: 'images/p4_front.jpg',
      link: 'account.html?tab=orders',
      metadata: { trackingNumber: 'SS-EXP-847291', courier: 'Bluedart Express', eta: '48 Hours' }
    },
    {
      type: 'back_in_stock',
      title: 'Restock Alert: Embroidered Lehenga',
      message: 'Limited artisanal wave: 8 handcrafted pieces in pure Banarasi silk are now available in the atelier.',
      badge: '✨ Back in Stock',
      icon: 'sparkles',
      image: 'images/p6_front.jpg',
      link: 'product.html?id=6',
      metadata: { productId: 6, stock: 8, price: 14990 }
    },
    {
      type: 'promotional',
      title: 'VIP Atelier Invitation: 10% Heritage Privilege',
      message: 'Curating your celebration wardrobe? Apply code HERITAGE10 at checkout for 10% bespoke discount & white-glove worldwide delivery.',
      badge: '👑 VIP Privilege',
      icon: 'tag',
      image: 'images/emblem.png',
      link: 'shop.html',
      metadata: { promoCode: 'HERITAGE10', discount: '10%' }
    }
  ];

  for (const d of defaults) {
    await createNotification({ ...d, userId });
  }
}

module.exports = {
  createNotification,
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  subscribeBackInStock,
  triggerBackInStockNotifications,
  seedDefaultSmartNotifications
};

