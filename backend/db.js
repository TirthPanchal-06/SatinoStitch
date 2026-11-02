require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'satinostitch',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

async function query(text, params) {
  return await pool.query(text, params);
}

async function testConnection() {
  try {
    const res = await pool.query(
      'SELECT current_database() AS database_name, current_user AS database_user, NOW() AS db_time, version() AS version;'
    );
    const row = res.rows[0];
    return {
      connected: true,
      database: row.database_name,
      user: row.database_user,
      time: row.db_time,
      version: row.version
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

function parseJson(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function mapProductRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    cat: row.cat,
    categoryName: row.category_name,
    type: row.type,
    col: row.col,
    price: Number(row.price),
    old: row.old_price != null ? Number(row.old_price) : undefined,
    c1: row.c1,
    c2: row.c2,
    pat: row.pat,
    tag: row.tag,
    rating: Number(row.rating || 5.0),
    reviews: Number(row.reviews || 0),
    stock: Number(row.stock || 0),
    image: row.image,
    images: parseJson(row.images, [row.image]),
    fabric: row.fabric,
    desc: row.description,
    sizes: parseJson(row.sizes, ['XS', 'S', 'M', 'L', 'XL']),
    colors: parseJson(row.colors, [
      { name: 'Primary Shade', hex: row.c1 || '#5B1835' },
      { name: 'Accent Shade', hex: row.c2 || '#C6A15B' }
    ])
  };
}

/* ==========================================================================
   Products & Catalog Queries
   ========================================================================== */
async function getProducts({ cat, col, type, q, search, max, min, sort, in_stock } = {}) {
  const conditions = [];
  const values = [];

  if (cat && cat !== 'all') {
    values.push(cat);
    conditions.push(`p.cat = $${values.length}`);
  }

  if (col && col !== 'all') {
    values.push(col);
    conditions.push(`p.col = $${values.length}`);
  }

  if (type && type !== 'all') {
    values.push(type);
    conditions.push(`p.type = $${values.length}`);
  }

  if (in_stock === 'true' || in_stock === true) {
    conditions.push(`p.stock > 0`);
  }

  const searchTerm = (q || search || '').trim();
  if (searchTerm) {
    values.push(`%${searchTerm}%`);
    const idx = values.length;
    conditions.push(
      `(p.name ILIKE $${idx} OR p.description ILIKE $${idx} OR p.fabric ILIKE $${idx} OR p.type ILIKE $${idx} OR p.pat ILIKE $${idx} OR p.tag ILIKE $${idx})`
    );
  }

  const maxPrice = Number(max);
  if (!isNaN(maxPrice) && maxPrice > 0) {
    values.push(maxPrice);
    conditions.push(`p.price <= $${values.length}`);
  }

  const minPrice = Number(min);
  if (!isNaN(minPrice) && minPrice > 0) {
    values.push(minPrice);
    conditions.push(`p.price >= $${values.length}`);
  }

  let orderBy = 'p.id ASC';
  if (sort === 'low') {
    orderBy = 'p.price ASC, p.id ASC';
  } else if (sort === 'high') {
    orderBy = 'p.price DESC, p.id ASC';
  } else if (sort === 'rating') {
    orderBy = 'p.rating DESC, p.reviews DESC';
  } else if (sort === 'new') {
    orderBy = 'p.id ASC';
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      p.*,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY ${orderBy};
  `;

  const res = await pool.query(sql, values);
  return res.rows.map(mapProductRow);
}

async function getProductById(id) {
  const sql = `
    SELECT 
      p.*,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1;
  `;
  const res = await pool.query(sql, [id]);
  return res.rows[0] ? mapProductRow(res.rows[0]) : null;
}

async function createProduct(data) {
  const sql = `
    INSERT INTO products (
      name, category_id, cat, type, col, price, old_price,
      c1, c2, pat, tag, rating, reviews, stock, image, images, fabric, description, sizes, colors
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    ) RETURNING *;
  `;
  const values = [
    data.name,
    data.categoryId || null,
    data.cat || 'ethnic',
    data.type || 'Suit sets',
    data.col || 'everyday',
    data.price,
    data.old || null,
    data.c1 || '#5B1835',
    data.c2 || '#C6A15B',
    data.pat || 'plain',
    data.tag || 'New',
    data.rating || 5.0,
    data.reviews || 0,
    data.stock || 10,
    data.image || 'images/p1.jpg',
    JSON.stringify(data.images || [data.image || 'images/p1.jpg']),
    data.fabric || '',
    data.desc || data.description || '',
    JSON.stringify(data.sizes || ['XS', 'S', 'M', 'L', 'XL']),
    JSON.stringify(data.colors || [{ name: 'Primary Shade', hex: data.c1 || '#5B1835' }])
  ];
  const res = await pool.query(sql, values);
  return mapProductRow(res.rows[0]);
}

async function updateProduct(id, data) {
  const fields = [];
  const values = [];

  const mappings = {
    name: 'name',
    cat: 'cat',
    type: 'type',
    col: 'col',
    price: 'price',
    old: 'old_price',
    c1: 'c1',
    c2: 'c2',
    pat: 'pat',
    tag: 'tag',
    stock: 'stock',
    image: 'image',
    fabric: 'fabric'
  };

  for (const [key, col] of Object.entries(mappings)) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }

  if (data.desc !== undefined || data.description !== undefined) {
    values.push(data.desc || data.description);
    fields.push(`description = $${values.length}`);
  }

  if (data.images !== undefined) {
    values.push(JSON.stringify(data.images));
    fields.push(`images = $${values.length}`);
  }

  if (data.sizes !== undefined) {
    values.push(JSON.stringify(data.sizes));
    fields.push(`sizes = $${values.length}`);
  }

  if (data.colors !== undefined) {
    values.push(JSON.stringify(data.colors));
    fields.push(`colors = $${values.length}`);
  }

  if (!fields.length) return getProductById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const sql = `
    UPDATE products
    SET ${fields.join(', ')}
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const res = await pool.query(sql, values);
  return res.rows[0] ? mapProductRow(res.rows[0]) : null;
}

async function deleteProduct(id) {
  const res = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id;', [id]);
  return res.rowCount > 0;
}

async function updateProductStock(id, qtyChange) {
  const sql = `
    UPDATE products
    SET stock = GREATEST(0, stock + $2),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, stock;
  `;
  const res = await pool.query(sql, [id, qtyChange]);
  return res.rows[0];
}

async function getCategories() {
  const sql = `
    SELECT 
      c.id,
      c.slug,
      c.name,
      c.description,
      COUNT(p.id)::int AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id, c.slug, c.name, c.description
    ORDER BY c.id ASC;
  `;
  const res = await pool.query(sql);
  return res.rows;
}

async function getTypes() {
  const sql = `SELECT DISTINCT type FROM products ORDER BY type ASC;`;
  const res = await pool.query(sql);
  return res.rows.map(r => r.type);
}

/* ==========================================================================
   Product Reviews Queries
   ========================================================================== */
async function getProductReviews(productId) {
  const sql = `
    SELECT 
      id, product_id, user_name, rating, title, comment, verified_purchase, created_at
    FROM product_reviews
    WHERE product_id = $1
    ORDER BY created_at DESC;
  `;
  const res = await pool.query(sql, [productId]);
  return res.rows;
}

async function createProductReview({ productId, userId, userName, rating, title, comment }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertSql = `
      INSERT INTO product_reviews (product_id, user_id, user_name, rating, title, comment, verified_purchase)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *;
    `;
    const reviewRes = await client.query(insertSql, [productId, userId || null, userName, rating, title, comment]);

    // Recalculate average rating & reviews count for product
    const statsSql = `
      SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*)::int as total_reviews
      FROM product_reviews
      WHERE product_id = $1;
    `;
    const statsRes = await client.query(statsSql, [productId]);
    const avgRating = statsRes.rows[0].avg_rating || rating;
    const totalReviews = statsRes.rows[0].total_reviews || 1;

    await client.query(
      `UPDATE products SET rating = $1, reviews = $2, updated_at = NOW() WHERE id = $3;`,
      [avgRating, totalReviews, productId]
    );

    await client.query('COMMIT');
    return reviewRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ==========================================================================
   Coupons Queries
   ========================================================================== */
async function getCouponByCode(code) {
  const sql = `
    SELECT code, discount_percent, min_order_amount, is_active, description
    FROM coupons
    WHERE UPPER(code) = UPPER($1) AND is_active = true;
  `;
  const res = await pool.query(sql, [code]);
  return res.rows[0] || null;
}

/* ==========================================================================
   Users & Authentication Queries
   ========================================================================== */
async function createUser({ name, email, passwordHash, phone, role = 'customer' }) {
  const sql = `
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, email, phone, role, created_at;
  `;
  const res = await pool.query(sql, [name, email.toLowerCase().trim(), passwordHash, phone || null, role]);
  return res.rows[0];
}

async function getUserByEmail(email) {
  const sql = `SELECT * FROM users WHERE LOWER(email) = LOWER($1);`;
  const res = await pool.query(sql, [email.trim()]);
  return res.rows[0] || null;
}

async function getUserById(id) {
  const sql = `SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1;`;
  const res = await pool.query(sql, [id]);
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
  const res = await pool.query(sql, [id, name, phone]);
  return res.rows[0];
}

/* ==========================================================================
   User Addresses Queries
   ========================================================================== */
async function getUserAddresses(userId) {
  const sql = `
    SELECT * FROM user_addresses
    WHERE user_id = $1
    ORDER BY is_default DESC, created_at DESC;
  `;
  const res = await pool.query(sql, [userId]);
  return res.rows;
}

async function createUserAddress(userId, addr) {
  if (addr.isDefault) {
    await pool.query('UPDATE user_addresses SET is_default = false WHERE user_id = $1;', [userId]);
  }
  const sql = `
    INSERT INTO user_addresses (
      user_id, label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;
  const res = await pool.query(sql, [
    userId,
    addr.label || 'Home',
    addr.recipientName || addr.name,
    addr.phone,
    addr.addressLine1 || addr.line1,
    addr.addressLine2 || addr.line2 || '',
    addr.city,
    addr.state,
    addr.pincode,
    !!addr.isDefault
  ]);
  return res.rows[0];
}

async function deleteUserAddress(id, userId) {
  const res = await pool.query('DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return res.rowCount > 0;
}

/* ==========================================================================
   Orders & Tracking Queries
   ========================================================================== */
async function createOrder(orderData, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderId = 'SS' + Date.now().toString().slice(-7);
    const trackingNumber = 'TRK-SS-' + Math.floor(100000 + Math.random() * 900000);

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

    for (const item of items) {
      await client.query(insertItemSql, [
        orderId,
        item.id || null,
        item.name || 'Bespoke Garment',
        item.image || 'images/p1.jpg',
        item.size || 'M',
        item.color || 'Selected Shade',
        item.price,
        item.qty || item.quantity || 1,
        item.price * (item.qty || item.quantity || 1)
      ]);

      // Decrement inventory stock
      if (item.id) {
        await client.query(
          `UPDATE products SET stock = GREATEST(0, stock - $2), updated_at = NOW() WHERE id = $1;`,
          [item.id, item.qty || item.quantity || 1]
        );
      }
    }

    await client.query('COMMIT');
    return { ...order, items };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOrderById(id, userId = null) {
  let orderSql = `SELECT * FROM orders WHERE id = $1`;
  const params = [id];
  if (userId) {
    orderSql += ` AND user_id = $2`;
    params.push(userId);
  }

  const orderRes = await pool.query(orderSql, params);
  const order = orderRes.rows[0];
  if (!order) return null;

  const itemsRes = await pool.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC;`, [id]);
  order.items = itemsRes.rows;
  order.shipping_address = parseJson(order.shipping_address, {});
  return order;
}

async function getUserOrders(userId) {
  const sql = `
    SELECT o.*,
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
        ) FILTER (WHERE oi.id IS NOT NULL), '[]'
      ) as items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = $1
    GROUP BY o.id
    ORDER BY o.created_at DESC;
  `;
  const res = await pool.query(sql, [userId]);
  return res.rows.map(r => ({
    ...r,
    shipping_address: parseJson(r.shipping_address, {})
  }));
}

async function getAllOrders() {
  const sql = `
    SELECT o.*, COUNT(oi.id)::int as item_count
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC;
  `;
  const res = await pool.query(sql);
  return res.rows.map(r => ({
    ...r,
    shipping_address: parseJson(r.shipping_address, {})
  }));
}

async function updateOrderStatus(orderId, status, { cancelReason, returnReason, trackingNumber } = {}) {
  const fields = ['status = $2', 'updated_at = NOW()'];
  const values = [orderId, status];

  if (cancelReason !== undefined) {
    values.push(cancelReason);
    fields.push(`cancel_reason = $${values.length}`);
  }
  if (returnReason !== undefined) {
    values.push(returnReason);
    fields.push(`return_reason = $${values.length}`);
  }
  if (trackingNumber !== undefined) {
    values.push(trackingNumber);
    fields.push(`tracking_number = $${values.length}`);
  }

  const sql = `
    UPDATE orders
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;
  const res = await pool.query(sql, values);
  return res.rows[0] || null;
}

/* ==========================================================================
   User Wishlist Queries
   ========================================================================== */
async function getUserWishlist(userId) {
  const sql = `
    SELECT p.*, c.name AS category_name
    FROM user_wishlists w
    JOIN products p ON w.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE w.user_id = $1
    ORDER BY w.created_at DESC;
  `;
  const res = await pool.query(sql, [userId]);
  return res.rows.map(mapProductRow);
}

async function addToWishlist(userId, productId) {
  const sql = `
    INSERT INTO user_wishlists (user_id, product_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, product_id) DO NOTHING;
  `;
  await pool.query(sql, [userId, productId]);
  return true;
}

async function removeFromWishlist(userId, productId) {
  const sql = `DELETE FROM user_wishlists WHERE user_id = $1 AND product_id = $2;`;
  await pool.query(sql, [userId, productId]);
  return true;
}

module.exports = {
  pool,
  query,
  testConnection,
  mapProductRow,
  // Products
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  getCategories,
  getTypes,
  // Reviews
  getProductReviews,
  createProductReview,
  // Coupons
  getCouponByCode,
  // Users & Auth
  createUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  // Addresses
  getUserAddresses,
  createUserAddress,
  deleteUserAddress,
  // Orders
  createOrder,
  getOrderById,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  // Wishlist
  getUserWishlist,
  addToWishlist,
  removeFromWishlist
};
