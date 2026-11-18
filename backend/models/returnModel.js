const { pool, query } = require('../config/db');
const variantModel = require('./variantModel');

const RETURN_STATUSES = ['Pending', 'Approved', 'Processing', 'Completed', 'Rejected'];

const RETURN_REASONS = [
  'Size or Fit Issue',
  'Colour or Design Mismatch',
  'Damaged or Defective Garment',
  'Fabric Quality Not as Expected',
  'Received Wrong Item',
  'Occasion Cancelled / Changed Mind',
  'Other'
];

function mapReturnRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    returnCode: r.return_code,
    return_code: r.return_code,
    orderId: r.order_id,
    order_id: r.order_id,
    orderItemId: r.order_item_id,
    order_item_id: r.order_item_id,
    productId: r.product_id,
    product_id: r.product_id,
    userId: r.user_id,
    user_id: r.user_id,
    customerName: r.customer_name,
    customer_name: r.customer_name,
    customerEmail: r.customer_email,
    customer_email: r.customer_email,
    customerPhone: r.customer_phone,
    customer_phone: r.customer_phone,
    productName: r.product_name,
    product_name: r.product_name,
    productImage: r.product_image || r.current_product_image || 'images/p1.jpg',
    product_image: r.product_image || r.current_product_image || 'images/p1.jpg',
    size: r.size,
    color: r.color || 'Standard',
    quantity: Number(r.quantity || 1),
    unitPrice: Number(r.unit_price || 0),
    refundAmount: Number(r.refund_amount || 0),
    refund_amount: Number(r.refund_amount || 0),
    reason: r.reason,
    comments: r.comments || '',
    status: r.status,
    adminNotes: r.admin_notes || '',
    admin_notes: r.admin_notes || '',
    restocked: Boolean(r.restocked),
    requestedAt: r.requested_at,
    requested_at: r.requested_at,
    reviewedAt: r.reviewed_at,
    reviewed_at: r.reviewed_at,
    completedAt: r.completed_at,
    completed_at: r.completed_at,
    updatedAt: r.updated_at,
    updated_at: r.updated_at,
    orderStatus: r.order_status || null,
    orderDate: r.order_date || null,
    orderTotal: r.order_total !== undefined ? Number(r.order_total) : null,
    paymentMethod: r.payment_method || null,
    trackingNumber: r.tracking_number || null
  };
}

function generateReturnCode() {
  return 'RET-' + Math.floor(100000 + Math.random() * 900000);
}

/**
 * Returns all delivered orders for a customer along with per-item return eligibility.
 */
async function getEligibleOrdersForUser(userId, userEmail = null) {
  const ordersRes = await query(
    `SELECT
       o.id,
       o.user_id,
       o.customer_name,
       o.customer_email,
       o.customer_phone,
       o.total,
       o.status,
       o.payment_method,
       o.payment_status,
       o.tracking_number,
       o.created_at,
       COALESCE(
         json_agg(
           json_build_object(
             'orderItemId', oi.id,
             'productId', oi.product_id,
             'productName', oi.product_name,
             'image', oi.image,
             'size', oi.size,
             'color', oi.color,
             'price', oi.price,
             'quantity', oi.quantity,
             'total', oi.total
           )
           ORDER BY oi.id ASC
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE (o.user_id = $1 OR ($2::varchar IS NOT NULL AND LOWER(o.customer_email) = LOWER($2)))
       AND o.status IN ('Delivered', 'Returned')
     GROUP BY o.id
     ORDER BY o.created_at DESC;`,
    [Number(userId), userEmail || null]
  );

  const existingRes = await query(
    `SELECT id, return_code, order_id, order_item_id, product_id, quantity, status, reason, requested_at
     FROM return_requests
     WHERE user_id = $1 OR ($2::varchar IS NOT NULL AND LOWER(customer_email) = LOWER($2))
     ORDER BY requested_at DESC;`,
    [Number(userId), userEmail || null]
  );

  const returnsByItem = new Map();
  for (const rr of existingRes.rows) {
    const key = `${rr.order_id}::${rr.order_item_id || rr.product_id}`;
    if (!returnsByItem.has(key)) returnsByItem.set(key, []);
    returnsByItem.get(key).push(rr);
  }

  return ordersRes.rows.map(o => {
    const items = (Array.isArray(o.items) ? o.items : []).map(it => {
      const key = `${o.id}::${it.orderItemId || it.productId}`;
      const linked = returnsByItem.get(key) || [];
      const activeReturnedQty = linked
        .filter(r => r.status !== 'Rejected')
        .reduce((sum, r) => sum + Number(r.quantity || 0), 0);
      const purchasedQty = Number(it.quantity || 1);
      const remainingQty = Math.max(0, purchasedQty - activeReturnedQty);
      const latestReturn = linked[0] || null;

      return {
        orderItemId: it.orderItemId,
        productId: it.productId,
        productName: it.productName,
        image: it.image || 'images/p1.jpg',
        size: it.size || 'M',
        color: it.color || 'Standard',
        unitPrice: Number(it.price || 0),
        purchasedQty,
        returnedQty: activeReturnedQty,
        remainingReturnableQty: remainingQty,
        eligible: o.status === 'Delivered' && remainingQty > 0,
        latestReturnStatus: latestReturn ? latestReturn.status : null,
        latestReturnCode: latestReturn ? latestReturn.return_code : null
      };
    });

    return {
      orderId: o.id,
      status: o.status,
      total: Number(o.total || 0),
      paymentMethod: o.payment_method,
      trackingNumber: o.tracking_number,
      orderDate: o.created_at,
      hasEligibleItems: items.some(it => it.eligible),
      items
    };
  });
}

/**
 * Creates a validated return request linked to the original order and product.
 */
async function createReturnRequest({
  userId,
  userEmail = null,
  orderId,
  orderItemId = null,
  productId = null,
  quantity = 1,
  reason,
  comments = ''
}) {
  const cleanOrderId = String(orderId || '').trim();
  const cleanReason = String(reason || '').trim();
  const cleanComments = String(comments || '').trim().slice(0, 1000);
  const reqQty = parseInt(quantity, 10) || 1;

  if (!cleanOrderId) {
    const err = new Error('Order ID is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!cleanReason || cleanReason.length < 3) {
    const err = new Error('Please select or provide a valid return reason.');
    err.statusCode = 400;
    throw err;
  }
  if (reqQty < 1) {
    const err = new Error('Return quantity must be at least 1.');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify order exists and belongs to the authenticated customer
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE;`,
      [cleanOrderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      const err = new Error('Order not found.');
      err.statusCode = 404;
      throw err;
    }

    const ownsById = userId && order.user_id && Number(order.user_id) === Number(userId);
    const ownsByEmail = userEmail && order.customer_email && order.customer_email.toLowerCase() === String(userEmail).toLowerCase();
    if (!ownsById && !ownsByEmail) {
      const err = new Error('You are not authorized to request a return for this order.');
      err.statusCode = 403;
      throw err;
    }

    if (order.status !== 'Delivered') {
      const err = new Error(`Only delivered orders are eligible for return requests (current order status: ${order.status}).`);
      err.statusCode = 400;
      throw err;
    }

    // 2. Locate the specific purchased order item
    const itemsRes = await client.query(
      `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC;`,
      [cleanOrderId]
    );
    const orderItems = itemsRes.rows;
    if (!orderItems.length) {
      const err = new Error('No purchased products found on this order.');
      err.statusCode = 400;
      throw err;
    }

    let targetItem = null;
    if (orderItemId) {
      targetItem = orderItems.find(it => Number(it.id) === Number(orderItemId));
    } else if (productId) {
      targetItem = orderItems.find(it => Number(it.product_id) === Number(productId));
    } else if (orderItems.length === 1) {
      targetItem = orderItems[0];
    }

    if (!targetItem) {
      const err = new Error('Selected product item was not found in this order.');
      err.statusCode = 400;
      throw err;
    }

    // 3. Prevent duplicate / excess return quantity for this order item
    const existingRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS active_qty
       FROM return_requests
       WHERE order_id = $1
         AND order_item_id = $2
         AND status != 'Rejected';`,
      [cleanOrderId, targetItem.id]
    );
    const alreadyRequested = Number(existingRes.rows[0]?.active_qty || 0);
    const maxRemaining = Math.max(0, Number(targetItem.quantity || 1) - alreadyRequested);

    if (maxRemaining <= 0) {
      const err = new Error(`A return request has already been submitted for "${targetItem.product_name}" from Order #${cleanOrderId}.`);
      err.statusCode = 400;
      throw err;
    }
    if (reqQty > maxRemaining) {
      const err = new Error(`Only ${maxRemaining} unit(s) of "${targetItem.product_name}" remain eligible for return on Order #${cleanOrderId}.`);
      err.statusCode = 400;
      throw err;
    }

    // 4. Compute refund & generate unique return code
    const unitPrice = Number(targetItem.price || 0);
    const refundAmount = Math.round(unitPrice * reqQty * 100) / 100;
    const returnCode = generateReturnCode();

    const insertRes = await client.query(
      `INSERT INTO return_requests (
         return_code, order_id, order_item_id, product_id, user_id,
         customer_name, customer_email, customer_phone,
         product_name, product_image, size, color, quantity,
         unit_price, refund_amount, reason, comments, status
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16, $17, 'Pending'
       ) RETURNING *;`,
      [
        returnCode,
        cleanOrderId,
        targetItem.id,
        targetItem.product_id || null,
        userId || order.user_id || null,
        order.customer_name,
        order.customer_email,
        order.customer_phone || null,
        targetItem.product_name,
        targetItem.image || 'images/p1.jpg',
        targetItem.size || 'M',
        targetItem.color || 'Standard',
        reqQty,
        unitPrice,
        refundAmount,
        cleanReason.slice(0, 150),
        cleanComments || null
      ]
    );

    // Record return reason on parent order without breaking order status lifecycle
    await client.query(
      `UPDATE orders
       SET return_reason = COALESCE(NULLIF(return_reason, ''), $2),
           updated_at = NOW()
       WHERE id = $1;`,
      [cleanOrderId, cleanReason.slice(0, 150)]
    );

    await client.query('COMMIT');
    return mapReturnRow({
      ...insertRes.rows[0],
      order_status: order.status,
      order_date: order.created_at,
      order_total: order.total,
      payment_method: order.payment_method,
      tracking_number: order.tracking_number
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getUserReturns(userId, userEmail = null) {
  const res = await query(
    `SELECT
       r.*,
       o.status AS order_status,
       o.created_at AS order_date,
       o.total AS order_total,
       o.payment_method,
       o.tracking_number,
       p.image AS current_product_image
     FROM return_requests r
     JOIN orders o ON o.id = r.order_id
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.user_id = $1 OR ($2::varchar IS NOT NULL AND LOWER(r.customer_email) = LOWER($2))
     ORDER BY r.requested_at DESC;`,
    [Number(userId), userEmail || null]
  );
  return res.rows.map(mapReturnRow);
}

async function getAllReturnsAdmin({ status = null, search = null } = {}) {
  let sql = `
    SELECT
      r.*,
      o.status AS order_status,
      o.created_at AS order_date,
      o.total AS order_total,
      o.payment_method,
      o.tracking_number,
      p.image AS current_product_image
    FROM return_requests r
    JOIN orders o ON o.id = r.order_id
    LEFT JOIN products p ON p.id = r.product_id
    WHERE 1=1
  `;
  const params = [];
  let idx = 1;

  if (status && status !== 'all') {
    sql += ` AND LOWER(r.status) = LOWER($${idx++})`;
    params.push(status);
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).trim().toLowerCase()}%`;
    sql += ` AND (
      LOWER(r.return_code) LIKE $${idx}
      OR LOWER(r.order_id) LIKE $${idx}
      OR LOWER(r.customer_name) LIKE $${idx}
      OR LOWER(r.customer_email) LIKE $${idx}
      OR LOWER(r.product_name) LIKE $${idx}
      OR LOWER(r.reason) LIKE $${idx}
    )`;
    idx++;
    params.push(q);
  }

  sql += ` ORDER BY r.requested_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapReturnRow);
}

async function getReturnStats() {
  const res = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
      COUNT(*) FILTER (WHERE status = 'Processing')::int AS processing,
      COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
      COALESCE(SUM(refund_amount) FILTER (WHERE status = 'Completed'), 0)::numeric AS total_refunded
    FROM return_requests;
  `);
  const row = res.rows[0] || {};
  return {
    total: Number(row.total || 0),
    pending: Number(row.pending || 0),
    approved: Number(row.approved || 0),
    processing: Number(row.processing || 0),
    completed: Number(row.completed || 0),
    rejected: Number(row.rejected || 0),
    totalRefunded: Number(row.total_refunded || 0)
  };
}

async function getReturnById(id) {
  const num = Number(id);
  if (isNaN(num)) return null;
  const res = await query(
    `SELECT
       r.*,
       o.status AS order_status,
       o.created_at AS order_date,
       o.total AS order_total,
       o.payment_method,
       o.tracking_number,
       p.image AS current_product_image
     FROM return_requests r
     JOIN orders o ON o.id = r.order_id
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.id = $1;`,
    [num]
  );
  return mapReturnRow(res.rows[0]);
}

async function updateReturnStatus(id, { status, adminNotes = null, restockInventory = true }) {
  const numId = Number(id);
  if (isNaN(numId)) {
    const err = new Error('Invalid return request ID.');
    err.statusCode = 400;
    throw err;
  }

  const matchedStatus = RETURN_STATUSES.find(s => s.toLowerCase() === String(status || '').trim().toLowerCase());
  if (!matchedStatus) {
    const err = new Error(`Invalid return status. Allowed: ${RETURN_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  let shouldRestockInfo = null;

  try {
    await client.query('BEGIN');

    const curRes = await client.query(`SELECT * FROM return_requests WHERE id = $1 FOR UPDATE;`, [numId]);
    const current = curRes.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }

    if (current.status === 'Completed' && matchedStatus !== 'Completed') {
      const err = new Error('Completed return requests cannot be reverted to an earlier status.');
      err.statusCode = 400;
      throw err;
    }

    const markReviewed = matchedStatus !== 'Pending' && !current.reviewed_at;
    const markCompleted = matchedStatus === 'Completed' && !current.completed_at;
    const willRestock = matchedStatus === 'Completed' && !current.restocked && restockInventory !== false && Boolean(current.product_id);

    const updRes = await client.query(
      `UPDATE return_requests
       SET status = $2,
           admin_notes = COALESCE($3, admin_notes),
           reviewed_at = CASE WHEN $4 THEN NOW() ELSE reviewed_at END,
           completed_at = CASE WHEN $5 THEN NOW() ELSE completed_at END,
           restocked = CASE WHEN $6 THEN TRUE ELSE restocked END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *;`,
      [
        numId,
        matchedStatus,
        adminNotes !== null && adminNotes !== undefined ? String(adminNotes).trim().slice(0, 1000) : null,
        markReviewed,
        markCompleted,
        willRestock
      ]
    );

    const updatedRow = updRes.rows[0];

    if (willRestock) {
      shouldRestockInfo = {
        productId: current.product_id,
        size: current.size,
        color: current.color,
        quantity: Number(current.quantity || 1)
      };
    }

    // If return is Completed, synchronize parent order status to 'Returned' when all order items are completed returns
    if (matchedStatus === 'Completed') {
      const orderQtyRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS total_qty FROM order_items WHERE order_id = $1;`,
        [current.order_id]
      );
      const completedRetQtyRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS returned_qty
         FROM return_requests
         WHERE order_id = $1 AND status = 'Completed';`,
        [current.order_id]
      );
      const totalOrdered = Number(orderQtyRes.rows[0]?.total_qty || 0);
      const totalReturned = Number(completedRetQtyRes.rows[0]?.returned_qty || 0);

      if (totalOrdered > 0 && totalReturned >= totalOrdered) {
        await client.query(
          `UPDATE orders
           SET status = 'Returned',
               payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
               updated_at = NOW()
           WHERE id = $1;`,
          [current.order_id]
        );
      }
    }

    await client.query('COMMIT');

    // Perform variant-aware inventory restock after transaction commit
    if (shouldRestockInfo) {
      await variantModel.restockVariantStock(
        shouldRestockInfo.productId,
        shouldRestockInfo.size,
        shouldRestockInfo.color,
        shouldRestockInfo.quantity
      ).catch(err => console.warn('[Return Restock Warning]:', err.message));
    }

    return getReturnById(updatedRow.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  RETURN_STATUSES,
  RETURN_REASONS,
  mapReturnRow,
  getEligibleOrdersForUser,
  createReturnRequest,
  getUserReturns,
  getAllReturnsAdmin,
  getReturnStats,
  getReturnById,
  updateReturnStatus
};
