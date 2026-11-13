const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

/* ============================================================
   Support Queries Model
   ============================================================ */

async function getSupportQueries(statusFilter = null) {
  let sql = 'SELECT * FROM support_queries';
  const params = [];
  if (statusFilter && statusFilter !== 'all') {
    sql += ' WHERE status = $1';
    params.push(statusFilter);
  }
  sql += ' ORDER BY created_at DESC';
  const res = await query(sql, params);
  return res.rows;
}

async function getSupportQueryById(id) {
  const sql = 'SELECT * FROM support_queries WHERE id = $1;';
  const res = await query(sql, [id]);
  return res.rows[0] || null;
}

async function createSupportQuery({ name, email, phone = null, subject = null, message, type = 'general' }) {
  const sql = `
    INSERT INTO support_queries (name, email, phone, subject, message, type, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'new')
    RETURNING *;
  `;
  const res = await query(sql, [name, email, phone, subject, message, type]);
  return res.rows[0];
}

async function updateSupportQuery(id, { status, adminNotes }) {
  const sql = `
    UPDATE support_queries
    SET status = COALESCE($2, status),
        admin_notes = COALESCE($3, admin_notes),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [id, status || null, adminNotes !== undefined ? adminNotes : null]);
  return res.rows[0] || null;
}

/* ============================================================
   Website Settings Model
   ============================================================ */

async function getAllWebsiteSettings() {
  const res = await query('SELECT key, value, updated_at FROM website_settings ORDER BY key ASC;');
  const dict = {};
  for (const row of res.rows) {
    dict[row.key] = row.value;
  }
  return dict;
}

async function getWebsiteSetting(key) {
  const res = await query('SELECT value FROM website_settings WHERE key = $1;', [key]);
  return res.rows[0] ? res.rows[0].value : null;
}

async function setWebsiteSetting(key, value) {
  const sql = `
    INSERT INTO website_settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = NOW()
    RETURNING *;
  `;
  const res = await query(sql, [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  return res.rows[0];
}

/* ============================================================
   Admin Notifications Model
   ============================================================ */

async function getAdminNotifications(limit = 30) {
  const notifsSql = `
    SELECT * FROM admin_notifications
    ORDER BY created_at DESC
    LIMIT $1;
  `;
  const countSql = `
    SELECT COUNT(*)::int AS unread
    FROM admin_notifications
    WHERE is_read = false;
  `;
  const [notifsRes, countRes] = await Promise.all([
    query(notifsSql, [limit]),
    query(countSql)
  ]);
  return {
    notifications: notifsRes.rows,
    unreadCount: countRes.rows[0]?.unread || 0
  };
}

async function markAllNotificationsRead() {
  await query('UPDATE admin_notifications SET is_read = true WHERE is_read = false;');
  return true;
}

async function clearAdminNotifications(id = null) {
  if (id) {
    await query('DELETE FROM admin_notifications WHERE id = $1;', [id]);
  } else {
    await query('DELETE FROM admin_notifications;');
  }
  return true;
}

async function createAdminNotification({ type, title, message, link = null }) {
  const sql = `
    INSERT INTO admin_notifications (type, title, message, link, is_read)
    VALUES ($1, $2, $3, $4, false)
    RETURNING *;
  `;
  const res = await query(sql, [type, title, message, link]);
  return res.rows[0];
}

/* ============================================================
   Customer Purchase History for Customer Profile
   ============================================================ */

async function getUserOrdersForAdmin(userId) {
  const sql = `
    SELECT 
      o.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'productId', oi.product_id,
            'name', oi.product_name,
            'image', oi.image,
            'size', oi.size,
            'color', oi.color,
            'price', oi.price,
            'quantity', oi.quantity,
            'total', oi.total
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = $1
    GROUP BY o.id
    ORDER BY o.created_at DESC;
  `;
  const res = await query(sql, [userId]);
  return res.rows;
}

/* ============================================================
   Admin Password Management
   ============================================================ */

async function updateAdminPassword(adminId, currentPassword, newPassword) {
  const userSql = 'SELECT password_hash FROM users WHERE id = $1;';
  const userRes = await query(userSql, [adminId]);
  if (!userRes.rows[0]) {
    throw new Error('Administrator account not found.');
  }

  const valid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
  if (!valid) {
    throw new Error('Current password does not match.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;', [hash, adminId]);
  return true;
}

module.exports = {
  getSupportQueries,
  getSupportQueryById,
  createSupportQuery,
  updateSupportQuery,
  getAllWebsiteSettings,
  getWebsiteSetting,
  setWebsiteSetting,
  getAdminNotifications,
  markAllNotificationsRead,
  clearAdminNotifications,
  createAdminNotification,
  getUserOrdersForAdmin,
  updateAdminPassword
};
