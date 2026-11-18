const { pool, query } = require('../config/db');
const variantModel = require('./variantModel');

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
        total, payment_method, payment_status, status, tracking_number, estimated_delivery,
        payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature,
        fraud_score, fraud_status, fraud_flags, client_ip, risk_level,
        taxable_amount, cgst_amount, sgst_amount, igst_amount, total_gst,
        gst_type, gst_pricing_mode, gst_breakdown
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Confirmed', $14, NOW() + INTERVAL '4 days',
        $15, $16, $17, $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29, $30, $31::jsonb
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
      trackingNumber,
      orderData.paymentId || null,
      orderData.razorpayOrderId || null,
      orderData.razorpayPaymentId || null,
      orderData.razorpaySignature || null,
      orderData.fraudScore || 0,
      orderData.fraudStatus || 'clean',
      JSON.stringify(orderData.fraudFlags || []),
      orderData.clientIp || null,
      orderData.riskLevel || 'low',
      orderData.taxableAmount || 0,
      orderData.cgstAmount || 0,
      orderData.sgstAmount || 0,
      orderData.igstAmount || 0,
      orderData.totalGst || 0,
      orderData.gstType || 'intra',
      orderData.gstPricingMode || 'inclusive',
      JSON.stringify(orderData.gstBreakdown || {})
    ]);

    const order = orderRes.rows[0];

    const insertItemSql = `
      INSERT INTO order_items (
        order_id, product_id, product_name, image, size, color, price, quantity, total,
        gst_rate, gst_type, hsn_code, taxable_amount, cgst_amount, sgst_amount, igst_amount, gst_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17);
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
        item.total || ((item.price || 0) * (item.qty || 1)),
        item.gstRate !== undefined ? Number(item.gstRate) : 5,
        item.gstType || 'auto',
        item.hsnCode || '6204',
        item.taxableAmount !== undefined ? Number(item.taxableAmount) : ((item.price || 0) * (item.qty || 1)),
        item.cgstAmount !== undefined ? Number(item.cgstAmount) : 0,
        item.sgstAmount !== undefined ? Number(item.sgstAmount) : 0,
        item.igstAmount !== undefined ? Number(item.igstAmount) : 0,
        item.gstAmount !== undefined ? Number(item.gstAmount) : 0
      ]);

      // Atomic variant-wise inventory deduction (auto-syncs products.stock)
      if (item.id) {
        await variantModel.deductVariantStock(
          client,
          Number(item.id),
          item.size || 'M',
          item.color || null,
          Math.max(1, parseInt(item.qty || item.quantity || 1, 10))
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
            'total', oi.total,
            'gstRate', COALESCE(oi.gst_rate, 5),
            'gstType', COALESCE(oi.gst_type, 'auto'),
            'hsnCode', COALESCE(oi.hsn_code, '6204'),
            'taxableAmount', COALESCE(oi.taxable_amount, oi.total),
            'cgstAmount', COALESCE(oi.cgst_amount, 0),
            'sgstAmount', COALESCE(oi.sgst_amount, 0),
            'igstAmount', COALESCE(oi.igst_amount, 0),
            'gstAmount', COALESCE(oi.gst_amount, 0)
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
            'total', oi.total,
            'gstRate', COALESCE(oi.gst_rate, 5),
            'gstType', COALESCE(oi.gst_type, 'auto'),
            'hsnCode', COALESCE(oi.hsn_code, '6204'),
            'taxableAmount', COALESCE(oi.taxable_amount, oi.total),
            'cgstAmount', COALESCE(oi.cgst_amount, 0),
            'sgstAmount', COALESCE(oi.sgst_amount, 0),
            'igstAmount', COALESCE(oi.igst_amount, 0),
            'gstAmount', COALESCE(oi.gst_amount, 0)
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

async function updateOrderFraudReview(id, fraudStatus, notes = '') {
  const sql = `
    UPDATE orders
    SET fraud_status = $2,
        status = CASE WHEN $2 = 'approved' THEN 'Confirmed' WHEN $2 = 'blocked' THEN 'Cancelled' ELSE status END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [id, fraudStatus]);
  return res.rows[0] || null;
}

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  updateOrderPaymentStatus,
  updateOrderFraudReview
};

