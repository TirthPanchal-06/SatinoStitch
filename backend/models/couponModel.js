const { query } = require('../config/db');

async function getCouponByCode(code) {
  if (!code) return null;
  const sql = `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1);`;
  const res = await query(sql, [code.trim()]);
  return res.rows[0] || null;
}

async function getAllCoupons() {
  const sql = `SELECT * FROM coupons ORDER BY created_at DESC;`;
  const res = await query(sql);
  return res.rows;
}

async function createCoupon({ code, discountPercent, minOrderAmount = 0, description = null, isActive = true }) {
  const sql = `
    INSERT INTO coupons (code, discount_percent, min_order_amount, is_active, description)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const res = await query(sql, [
    code.toUpperCase().trim(),
    parseInt(discountPercent, 10),
    Number(minOrderAmount) || 0,
    Boolean(isActive),
    description
  ]);
  return res.rows[0];
}

async function updateCoupon(id, { discountPercent, minOrderAmount, isActive, description }) {
  const sql = `
    UPDATE coupons
    SET discount_percent = COALESCE($2, discount_percent),
        min_order_amount = COALESCE($3, min_order_amount),
        is_active = COALESCE($4, is_active),
        description = COALESCE($5, description)
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [id, discountPercent, minOrderAmount, isActive, description]);
  return res.rows[0] || null;
}

async function deleteCoupon(id) {
  const sql = `DELETE FROM coupons WHERE id = $1 RETURNING id;`;
  const res = await query(sql, [id]);
  return res.rowCount > 0;
}

module.exports = {
  getCouponByCode,
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon
};

