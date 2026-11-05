const { query, pool } = require('../config/db');

async function getUserCart(userId) {
  const sql = `
    SELECT 
      ci.id,
      ci.product_id AS "productId",
      ci.size,
      ci.color,
      ci.quantity,
      p.name,
      p.price,
      p.image,
      p.stock,
      p.cat,
      (ci.quantity * p.price) AS total
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = $1
    ORDER BY ci.created_at ASC;
  `;
  const res = await query(sql, [userId]);
  return res.rows;
}

async function addToUserCart(userId, { productId, size = 'M', color = null, quantity = 1 }) {
  const sql = `
    INSERT INTO cart_items (user_id, product_id, size, color, quantity)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, product_id, size, color)
    DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()
    RETURNING *;
  `;
  const res = await query(sql, [userId, Number(productId), size, color, Math.max(1, parseInt(quantity, 10))]);
  return res.rows[0];
}

async function updateCartItemQuantity(userId, itemId, quantity) {
  const qty = parseInt(quantity, 10);
  if (qty <= 0) {
    return removeCartItem(userId, itemId);
  }
  const sql = `
    UPDATE cart_items
    SET quantity = $3, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await query(sql, [itemId, userId, qty]);
  return res.rows[0] || null;
}

async function removeCartItem(userId, itemId) {
  const sql = `DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id;`;
  const res = await query(sql, [itemId, userId]);
  return res.rowCount > 0;
}

async function clearUserCart(userId) {
  const sql = `DELETE FROM cart_items WHERE user_id = $1;`;
  await query(sql, [userId]);
  return true;
}

async function syncUserCart(userId, items) {
  if (!Array.isArray(items)) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cart_items WHERE user_id = $1;', [userId]);

    for (const item of items) {
      if (!item.id && !item.productId) continue;
      const pid = Number(item.id || item.productId);
      const qty = Math.max(1, parseInt(item.qty || item.quantity || 1, 10));
      const size = item.size || 'M';
      const color = item.color || null;

      await client.query(
        `INSERT INTO cart_items (user_id, product_id, size, color, quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, product_id, size, color)
         DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity;`,
        [userId, pid, size, color, qty]
      );
    }

    await client.query('COMMIT');
    return getUserCart(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getUserCart,
  addToUserCart,
  updateCartItemQuantity,
  removeCartItem,
  clearUserCart,
  syncUserCart
};

