const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

async function createUser({ name, email, password, phone, role = 'customer' }) {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  const sql = `
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, email, phone, role, created_at;
  `;
  const res = await query(sql, [name, email.toLowerCase().trim(), hash, phone || null, role]);
  return res.rows[0];
}

async function getUserByEmail(email) {
  const sql = `SELECT * FROM users WHERE LOWER(email) = LOWER($1);`;
  const res = await query(sql, [email.trim()]);
  return res.rows[0] || null;
}

async function getUserById(id) {
  const sql = `SELECT id, name, email, phone, role, created_at, updated_at FROM users WHERE id = $1;`;
  const res = await query(sql, [id]);
  return res.rows[0] || null;
}

async function updateUserProfile(id, { name, phone }) {
  const sql = `
    UPDATE users
    SET name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, email, phone, role;
  `;
  const res = await query(sql, [id, name, phone]);
  return res.rows[0];
}

async function updateUserPassword(id, hashedPassword) {
  const sql = `
    UPDATE users
    SET password_hash = $2,
        updated_at = NOW()
    WHERE id = $1;
  `;
  await query(sql, [id, hashedPassword]);
  return true;
}

async function getAllUsers() {
  const sql = `
    SELECT 
      u.id, 
      u.name, 
      u.email, 
      u.phone, 
      u.role, 
      u.created_at,
      COUNT(o.id)::int AS orders_count,
      COALESCE(SUM(o.total), 0)::numeric AS total_spent
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    GROUP BY u.id
    ORDER BY (u.role = 'admin') DESC, u.created_at DESC;
  `;
  const res = await query(sql);
  return res.rows;
}

async function updateUserRole(id, role) {
  const allowed = ['customer', 'admin', 'curator'];
  if (!allowed.includes(role)) {
    throw new Error(`Role must be one of: ${allowed.join(', ')}`);
  }
  const sql = `
    UPDATE users
    SET role = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, email, role;
  `;
  const res = await query(sql, [id, role]);
  return res.rows[0];
}

/* User Addresses */
async function getUserAddresses(userId) {
  const sql = `
    SELECT * FROM user_addresses
    WHERE user_id = $1
    ORDER BY is_default DESC, created_at DESC;
  `;
  const res = await query(sql, [userId]);
  return res.rows;
}

async function createUserAddress(userId, addr) {
  if (addr.isDefault) {
    await query('UPDATE user_addresses SET is_default = false WHERE user_id = $1;', [userId]);
  }
  const sql = `
    INSERT INTO user_addresses (
      user_id, label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;
  const res = await query(sql, [
    userId,
    addr.label || 'Home',
    addr.recipientName || addr.name,
    addr.phone,
    addr.addressLine1 || addr.address || addr.line1,
    addr.addressLine2 || addr.line2 || null,
    addr.city,
    addr.state,
    addr.pincode || addr.pin,
    Boolean(addr.isDefault)
  ]);
  return res.rows[0];
}

async function deleteUserAddress(userId, addrId) {
  const sql = `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id;`;
  const res = await query(sql, [addrId, userId]);
  return res.rowCount > 0;
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  updateUserPassword,
  getAllUsers,
  updateUserRole,
  getUserAddresses,
  createUserAddress,
  deleteUserAddress
};

