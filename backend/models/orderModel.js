const { pool, query } = require('../config/db');

async function createOrder(orderData, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderId = orderData.id || ('SS' + Math.floor(1000000 + Math.random() * 9000000));
    const trackingNumber = orderData.trackingNumber || ('IND-COUT-' + Math.floor(10000000 + Math.random() * 90000000));
    const lineItems = items || orderData.items || [];

    const insertOrderSql = `
      INSERT INTO orders (
        id, user_id, customer_name, customer_email, customer_phone,
        shipping_address, subtotal, discount, coupon_code, shipping_fee,
        total, payment_method, payment_status, status, tracking_number, estimated_delivery
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Confirmed', $14, NOW() + INTERVAL '4 days'
      ) RETURNING *;
    `;

    const orderRes = await client.query(insertOrderSql, [
      orderId,
      orderData.userId || null,
      orderData.customerName,
      orderData.customerEmail,
      orderData.customerPhone || null,
      JSON.stringify(orderData.shippingAddress),
      orderData.subtotal,
      orderData.discount || 0,
      orderData.couponCode || null,
      orderData.shippingFee || 0,
      orderData.total,
      orderData.paymentMethod || 'cod',
      orderData.paymentStatus || 'pending',
      trackingNumber
    ]);

    const order = orderRes.rows[0];

    const insertItemSql = `
      INSERT INTO order_items (
        order_id, product_id, product_name, image, size, color, price, quantity, total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

    for (const item of lineItems) {
      await client.query(insertItemSql, [
        orderId,
        item.id || null,
        item.name || 'Bespoke Garment',
        item.image || null,
        item.size || 'M',
        item.color || null,
        item.price || 0,
        item.qty || item.quantity || 1,
        item.total || ((item.price || 0) * (item.qty || 1))
      ]);

      // Atomic inventory deduction
      if (item.id) {
        await client.query(
          `UPDATE products SET stock = GREATEST(0, stock - $2), updated_at = NOW() WHERE id = $1;`,
          [Number(item.id), Math.max(1, parseInt(item.qty || 1, 10))]
        );
      }
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOrderById(id) {
  const orderSql = `SELECT * FROM orders WHERE id = $1;`;
  const orderRes = await query(orderSql, [id]);
  const order = orderRes.rows[0];
  if (!order) return null;

  const itemsSql = `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC;`;
  const itemsRes = await query(itemsSql, [id]);
  order.items = itemsRes.rows;
  return order;
}

async function getUserOrders(userId) {
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

async function getAllOrders() {
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
    GROUP BY o.id
    ORDER BY o.created_at DESC;
  `;
  const res = await query(sql);
  return res.rows;
}

async function updateOrderStatus(id, status, trackingNumber, cancelReason, returnReason) {
  const sql = `
    UPDATE orders
    SET status = COALESCE($2, status),
        tracking_number = COALESCE($3, tracking_number),
        cancel_reason = COALESCE($4, cancel_reason),
        return_reason = COALESCE($5, return_reason),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [id, status, trackingNumber || null, cancelReason || null, returnReason || null]);
  return res.rows[0] || null;
}

async function updateOrderPaymentStatus(id, paymentStatus) {
  const sql = `
    UPDATE orders
    SET payment_status = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [id, paymentStatus]);
  return res.rows[0] || null;
}

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  updateOrderPaymentStatus
};

