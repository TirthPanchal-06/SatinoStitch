const { query } = require('../config/db');
const { mapProductRow } = require('./productModel');

async function getUserWishlist(userId) {
  const sql = `
    SELECT 
      w.id AS wishlist_id,
      w.created_at AS saved_at,
      p.*
    FROM user_wishlists w
    JOIN products p ON p.id = w.product_id
    WHERE w.user_id = $1
    ORDER BY w.created_at DESC;
  `;
  const res = await query(sql, [userId]);
  return res.rows.map(r => ({
    wishlistId: r.wishlist_id,
    savedAt: r.saved_at,
    product: mapProductRow(r)
  }));
}

async function addToWishlist(userId, productId) {
  const sql = `
    INSERT INTO user_wishlists (user_id, product_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, product_id) DO NOTHING
    RETURNING *;
  `;
  const res = await query(sql, [userId, Number(productId)]);
  return res.rows[0] || null;
}

async function removeFromWishlist(userId, productId) {
  const sql = `
    DELETE FROM user_wishlists
    WHERE user_id = $1 AND product_id = $2
    RETURNING id;
  `;
  const res = await query(sql, [userId, Number(productId)]);
  return res.rowCount > 0;
}

module.exports = {
  getUserWishlist,
  addToWishlist,
  removeFromWishlist
};

