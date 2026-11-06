require('.env').config();
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
async function getProducts(filters = {}) {
  const cat = filters.cat || filters.category;
  const col = filters.col || filters.collection;
  const type = filters.type;
  const in_stock = filters.in_stock != null ? filters.in_stock : filters.inStock;
  const q = filters.q || filters.search;
  const max = filters.max != null ? filters.max : filters.maxPrice;
  const min = filters.min != null ? filters.min : filters.minPrice;
  const sort = filters.sort;

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

  if (in_stock === 'true' || in_stock === true || in_stock === 1 || in_stock === '1') {
    conditions.push(`p.stock > 0`);
  }

  const searchTerm = (q || '').trim();
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

    const orderId = orderData.id || ('SS' + Date.now().toString().slice(-7));
    const trackingNumber = orderData.trackingNumber || ('TRK-SS-' + Math.floor(100000 + Math.random() * 900000));
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

async function updateOrderPaymentStatus(orderId, paymentStatus) {
  const sql = `
    UPDATE orders
    SET payment_status = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await pool.query(sql, [orderId, paymentStatus]);
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

/* ==========================================================================
   User Cart Queries (Module 4)
   ========================================================================== */
async function getUserCart(userId) {
  const sql = `
    SELECT 
      ci.id,
      ci.user_id,
      ci.product_id,
      ci.size,
      ci.color,
      ci.quantity,
      ci.created_at,
      ci.updated_at,
      p.name,
      p.price::numeric AS price,
      p.old_price::numeric AS old_price,
      p.image,
      p.stock,
      p.fabric,
      p.cat,
      (p.price * ci.quantity)::numeric AS line_total
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.user_id = $1
    ORDER BY ci.created_at ASC;
  `;
  const res = await pool.query(sql, [userId]);
  return res.rows.map(r => ({
    id: Number(r.id),
    userId: Number(r.user_id),
    productId: Number(r.product_id),
    name: r.name,
    size: r.size,
    color: r.color,
    quantity: Number(r.quantity),
    price: Number(r.price),
    oldPrice: r.old_price ? Number(r.old_price) : null,
    image: r.image,
    stock: Number(r.stock),
    fabric: r.fabric,
    cat: r.cat,
    lineTotal: Number(r.line_total),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

async function addToUserCart(userId, { productId, size = 'M', color = null, quantity = 1 }) {
  const numPid = Number(productId);
  const numQty = Math.max(1, Number(quantity) || 1);
  const safeColor = color || 'Selected Shade';
  const safeSize = size || 'M';

  const p = await getProductById(numPid);
  if (!p) throw new Error('Product not found.');
  if (p.stock <= 0) throw new Error('Selected garment is currently sold out.');

  const sql = `
    INSERT INTO cart_items (user_id, product_id, size, color, quantity)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, product_id, size, color)
    DO UPDATE SET 
      quantity = cart_items.quantity + EXCLUDED.quantity,
      updated_at = NOW()
    RETURNING *;
  `;
  const res = await pool.query(sql, [userId, numPid, safeSize, safeColor, numQty]);
  return res.rows[0];
}

async function updateCartItemQuantity(userId, cartItemId, quantity) {
  const numQty = Number(quantity);
  if (numQty <= 0) {
    await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2;', [cartItemId, userId]);
    return null;
  }
  const sql = `
    UPDATE cart_items
    SET quantity = $1, updated_at = NOW()
    WHERE id = $2 AND user_id = $3
    RETURNING *;
  `;
  const res = await pool.query(sql, [numQty, cartItemId, userId]);
  return res.rows[0] || null;
}

async function removeCartItem(userId, cartItemId) {
  const sql = `DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id;`;
  const res = await pool.query(sql, [cartItemId, userId]);
  return res.rowCount > 0;
}

async function clearUserCart(userId) {
  await pool.query('DELETE FROM cart_items WHERE user_id = $1;', [userId]);
  return true;
}

async function syncUserCart(userId, guestItems = []) {
  if (!Array.isArray(guestItems) || !guestItems.length) return getUserCart(userId);
  for (const item of guestItems) {
    if (item && item.id) {
      try {
        await addToUserCart(userId, {
          productId: item.id,
          size: item.size || 'M',
          color: item.color || null,
          quantity: item.qty || 1
        });
      } catch {}
    }
  }
  return getUserCart(userId);
}

/* ==========================================================================
   Inventory & Category Management (Admin)
   ========================================================================== */
async function getInventorySummary() {
  const statsSql = `
    SELECT 
      COUNT(*)::int AS total_products,
      COALESCE(SUM(stock), 0)::int AS total_stock,
      COUNT(*) FILTER (WHERE stock <= 3 AND stock > 0)::int AS low_stock_count,
      COUNT(*) FILTER (WHERE stock = 0)::int AS out_of_stock_count
    FROM products;
  `;
  const itemsSql = `
    SELECT id, name, cat, type, price, stock, image
    FROM products
    ORDER BY stock ASC, id ASC;
  `;
  const [statsRes, itemsRes] = await Promise.all([
    pool.query(statsSql),
    pool.query(itemsSql)
  ]);
  return {
    summary: statsRes.rows[0],
    items: itemsRes.rows.map(r => ({
      ...r,
      id: Number(r.id),
      price: Number(r.price),
      stock: Number(r.stock)
    }))
  };
}

async function setProductStock(productId, stock) {
  const numStock = Math.max(0, parseInt(stock, 10) || 0);
  const sql = `UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, stock;`;
  const res = await pool.query(sql, [numStock, productId]);
  return res.rows[0] || null;
}

async function createCategory({ slug, name, description }) {
  const sql = `
    INSERT INTO categories (slug, name, description)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const res = await pool.query(sql, [slug.toLowerCase().trim(), name.trim(), description || '']);
  return res.rows[0];
}

async function updateCategory(id, { name, description }) {
  const sql = `
    UPDATE categories
    SET 
      name = COALESCE($1, name),
      description = COALESCE($2, description)
    WHERE id = $3
    RETURNING *;
  `;
  const res = await pool.query(sql, [name ? name.trim() : null, description, id]);
  return res.rows[0] || null;
}

async function deleteCategory(id) {
  const res = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id;', [id]);
  return res.rowCount > 0;
}

/* ==========================================================================
   Coupon Management (Admin)
   ========================================================================== */
async function getAllCoupons() {
  const sql = `SELECT * FROM coupons ORDER BY created_at DESC;`;
  const res = await pool.query(sql);
  return res.rows.map(r => ({
    id: Number(r.id),
    code: r.code,
    discountPercent: Number(r.discount_percent),
    minOrderAmount: Number(r.min_order_amount || 0),
    isActive: !!r.is_active,
    description: r.description,
    createdAt: r.created_at
  }));
}

async function createCoupon({ code, discountPercent, minOrderAmount = 0, description = '' }) {
  const sql = `
    INSERT INTO coupons (code, discount_percent, min_order_amount, description)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const res = await pool.query(sql, [
    code.toUpperCase().trim(),
    Number(discountPercent),
    Number(minOrderAmount) || 0,
    description
  ]);
  return res.rows[0];
}

async function updateCoupon(id, { discountPercent, minOrderAmount, isActive, description }) {
  const sql = `
    UPDATE coupons
    SET 
      discount_percent = COALESCE($1, discount_percent),
      min_order_amount = COALESCE($2, min_order_amount),
      is_active = COALESCE($3, is_active),
      description = COALESCE($4, description)
    WHERE id = $5
    RETURNING *;
  `;
  const res = await pool.query(sql, [discountPercent, minOrderAmount, isActive, description, id]);
  return res.rows[0] || null;
}

async function deleteCoupon(id) {
  const res = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id;', [id]);
  return res.rowCount > 0;
}

/* ==========================================================================
   User & Patron Administration (Security & RBAC)
   ========================================================================== */
async function getAllUsers() {
  const sql = `
    SELECT id, name, email, phone, role, created_at, updated_at
    FROM users
    ORDER BY id ASC;
  `;
  const res = await pool.query(sql);
  return res.rows.map(r => ({
    id: Number(r.id),
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

async function updateUserRole(userId, role) {
  const sql = `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role;`;
  const res = await pool.query(sql, [role, userId]);
  return res.rows[0] || null;
}

async function updateUserPassword(userId, newPasswordHash) {
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;', [newPasswordHash, userId]);
  return true;
}

/* ==========================================================================
   Customer Activity Logging & Audit Feed
   ========================================================================== */
async function logCustomerActivity({ userId = null, userName = null, activityType, description, metadata = {} }) {
  try {
    const sql = `
      INSERT INTO customer_activities (user_id, user_name, activity_type, description, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, user_id, user_name, activity_type, description, metadata, created_at;
    `;
    const res = await pool.query(sql, [
      userId ? Number(userId) : null,
      userName || (userId ? 'VIP Patron' : 'Guest Patron'),
      activityType,
      description,
      JSON.stringify(metadata)
    ]);
    return res.rows[0];
  } catch (err) {
    console.warn('[Activity Log Warning]', err.message);
    return null;
  }
}

async function getCustomerActivities(limit = 30, activityType = null) {
  let sql = `
    SELECT ca.id, ca.user_id, ca.user_name, ca.activity_type, ca.description, ca.metadata, ca.created_at,
           u.email AS user_email
    FROM customer_activities ca
    LEFT JOIN users u ON ca.user_id = u.id
  `;
  const params = [];
  if (activityType && activityType !== 'all') {
    params.push(activityType);
    sql += ` WHERE ca.activity_type = $${params.length} `;
  }
  const cleanLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  params.push(cleanLimit);
  sql += ` ORDER BY ca.created_at DESC LIMIT $${params.length};`;
  const res = await pool.query(sql, params);
  return res.rows;
}

/* ==========================================================================
   Product Views & Demand Tracking
   ========================================================================== */
async function recordProductView(productId, userId = null, ipAddress = null) {
  const pId = Number(productId);
  if (isNaN(pId)) return false;
  try {
    // Atomically increment views_count on the product
    await pool.query('UPDATE products SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1;', [pId]);
    // Record view timestamp log
    await pool.query(
      'INSERT INTO product_views (product_id, user_id, ip_address, created_at) VALUES ($1, $2, $3, NOW());',
      [pId, userId ? Number(userId) : null, ipAddress || null]
    );
    return true;
  } catch (err) {
    console.warn('[Product View Warning]', err.message);
    return false;
  }
}

/* ==========================================================================
   Live Admin Analytics & Real-Time Business Intelligence
   ========================================================================== */
async function getAdminAnalytics() {
  // 1. Revenue & Order KPIs (Excluding Cancelled orders from net/gross calculations)
  const revRes = await pool.query(`
    SELECT 
      COALESCE(SUM(total), 0)::numeric AS gross_revenue,
      COALESCE(SUM(subtotal - discount), 0)::numeric AS net_revenue,
      COUNT(*)::int AS valid_orders_count,
      COALESCE(AVG(total), 0)::numeric AS average_order_value
    FROM orders
    WHERE status != 'Cancelled';
  `);
  const rev = revRes.rows[0];

  // 2. Orders Status Distribution
  const statusRes = await pool.query(`
    SELECT status, COUNT(*)::int AS count
    FROM orders
    GROUP BY status;
  `);
  const statusCounts = {
    'Confirmed': 0,
    'In Workshop': 0,
    'Dispatched': 0,
    'Delivered': 0,
    'Cancelled': 0,
    'Return Requested': 0
  };
  let totalOrdersAll = 0;
  statusRes.rows.forEach(r => {
    totalOrdersAll += r.count;
    if (statusCounts[r.status] !== undefined) statusCounts[r.status] = r.count;
    else statusCounts[r.status] = r.count;
  });

  // 3. User & Patron Metrics
  const usersRes = await pool.query(`
    SELECT 
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE role = 'customer')::int AS total_customers,
      COUNT(*) FILTER (WHERE role = 'admin')::int AS total_admins
    FROM users;
  `);
  const userStats = usersRes.rows[0];

  // 4. Inventory Metrics
  const invRes = await pool.query(`
    SELECT 
      COUNT(*)::int AS total_products,
      COALESCE(SUM(stock), 0)::int AS total_stock,
      COUNT(*) FILTER (WHERE stock <= 5)::int AS low_stock_count,
      COUNT(*) FILTER (WHERE stock = 0)::int AS out_of_stock_count,
      COALESCE(SUM(views_count), 0)::int AS total_views
    FROM products;
  `);
  const invStats = invRes.rows[0];

  // 5. Daily Sales Graph Data (grouped by date)
  const dailyRes = await pool.query(`
    SELECT 
      TO_CHAR(created_at, 'YYYY-MM-DD') AS key,
      TO_CHAR(created_at, 'Mon DD') AS label,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total), 0)::numeric AS revenue
    FROM orders
    WHERE status != 'Cancelled'
    GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), TO_CHAR(created_at, 'Mon DD')
    ORDER BY key ASC;
  `);

  // 6. Weekly Sales Graph Data
  const weeklyRes = await pool.query(`
    SELECT 
      TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS key,
      'Wk of ' || TO_CHAR(DATE_TRUNC('week', created_at), 'Mon DD') AS label,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total), 0)::numeric AS revenue
    FROM orders
    WHERE status != 'Cancelled'
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY key ASC;
  `);

  // 7. Monthly Sales Graph Data
  const monthlyRes = await pool.query(`
    SELECT 
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS key,
      TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS label,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total), 0)::numeric AS revenue
    FROM orders
    WHERE status != 'Cancelled'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY key ASC;
  `);

  // 8. Best-Selling Products (Ranked by actual units sold and revenue from non-cancelled orders)
  const bsRes = await pool.query(`
    SELECT 
      oi.product_id,
      oi.product_name,
      oi.image,
      COALESCE(p.cat, 'ethnic') AS cat,
      COALESCE(p.type, 'Couture') AS type,
      COALESCE(p.price, MAX(oi.price))::numeric AS price,
      COALESCE(p.stock, 0)::int AS stock,
      COALESCE(p.views_count, 0)::int AS views_count,
      SUM(oi.quantity)::int AS total_sold,
      SUM(oi.total)::numeric AS total_revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE o.status != 'Cancelled'
    GROUP BY oi.product_id, oi.product_name, oi.image, p.cat, p.type, p.price, p.stock, p.views_count
    ORDER BY total_sold DESC, total_revenue DESC
    LIMIT 6;
  `);

  // 9. Most-Viewed Products & Product Demand
  const mvRes = await pool.query(`
    SELECT 
      p.id, p.name, p.cat, p.type, p.price::numeric, p.stock, p.image,
      COALESCE(p.views_count, 0)::int AS views_count,
      p.rating, p.reviews
    FROM products p
    ORDER BY p.views_count DESC, p.id ASC
    LIMIT 6;
  `);

  // 10. Low-Stock Alerts
  const lowRes = await pool.query(`
    SELECT id, name, cat, type, price::numeric, stock, image
    FROM products
    WHERE stock <= 5
    ORDER BY stock ASC, id ASC;
  `);

  // 11. Recent Orders with details & payment
  const recentOrdersRes = await pool.query(`
    SELECT o.*, COUNT(oi.id)::int AS item_count
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 10;
  `);

  // 12. Recent Customer Activities
  const actRes = await pool.query(`
    SELECT ca.id, ca.user_id, ca.user_name, ca.activity_type, ca.description, ca.metadata, ca.created_at,
           u.email AS user_email
    FROM customer_activities ca
    LEFT JOIN users u ON ca.user_id = u.id
    ORDER BY ca.created_at DESC
    LIMIT 25;
  `);

  // 13. Demand & Stock Breakdown by Category
  const catRes = await pool.query(`
    SELECT 
      cat,
      COUNT(*)::int AS product_count,
      COALESCE(SUM(stock), 0)::int AS total_stock,
      COALESCE(SUM(views_count), 0)::int AS total_views
    FROM products
    GROUP BY cat;
  `);

  const kpisObj = {
    grossRevenue: Number(rev.gross_revenue) || 0,
    netRevenue: Number(rev.net_revenue) || 0,
    validOrdersCount: Number(rev.valid_orders_count) || 0,
    totalOrdersAll,
    averageOrderValue: Math.round(Number(rev.average_order_value) || 0),
    totalCustomers: userStats.total_customers,
    totalProducts: invStats.total_products,
    totalStock: invStats.total_stock,
    lowStockCount: invStats.low_stock_count,
    outOfStockCount: invStats.out_of_stock_count,
    totalViews: invStats.total_views,
    statusCounts
  };

  return {
    summary: kpisObj,
    kpis: kpisObj,
    salesGraphs: {
      daily: dailyRes.rows.map(r => ({ key: r.key, label: r.label, orders: r.orders, revenue: Number(r.revenue) })),
      weekly: weeklyRes.rows.map(r => ({ key: r.key, label: r.label, orders: r.orders, revenue: Number(r.revenue) })),
      monthly: monthlyRes.rows.map(r => ({ key: r.key, label: r.label, orders: r.orders, revenue: Number(r.revenue) }))
    },
    bestSellers: bsRes.rows.map(r => ({
      productId: r.product_id,
      product_id: r.product_id,
      name: r.product_name,
      product_name: r.product_name,
      image: r.image || 'images/p1.jpg',
      cat: r.cat,
      type: r.type,
      price: Number(r.price),
      stock: r.stock,
      viewsCount: r.views_count,
      views_count: r.views_count,
      totalSold: r.total_sold,
      total_sold: r.total_sold,
      totalRevenue: Number(r.total_revenue),
      total_revenue: Number(r.total_revenue)
    })),
    mostViewed: mvRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      cat: r.cat,
      type: r.type,
      price: Number(r.price),
      stock: r.stock,
      image: r.image || 'images/p1.jpg',
      viewsCount: r.views_count,
      views_count: r.views_count,
      rating: Number(r.rating) || 5.0,
      reviews: r.reviews || 0
    })),
    lowStockAlerts: lowRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      cat: r.cat,
      type: r.type,
      price: Number(r.price),
      stock: r.stock,
      image: r.image || 'images/p1.jpg'
    })),
    recentOrders: recentOrdersRes.rows,
    recentActivities: actRes.rows,
    demandByCategory: catRes.rows
  };
}

/**
 * SATINOSTITCH Database Gateway & Model Aggregator
 * Provides unified access to all models and database pool.
 */
const { pool, query, testConnection } = require('./config/db');
const productModel = require('./models/productModel');
const categoryModel = require('./models/categoryModel');
const userModel = require('./models/userModel');
const orderModel = require('./models/orderModel');
const cartModel = require('./models/cartModel');
const wishlistModel = require('./models/wishlistModel');
const couponModel = require('./models/couponModel');
const activityModel = require('./models/activityModel');
const analyticsModel = require('./models/analyticsModel');

module.exports = {
  // Pool & Raw Query
  pool,
  query,
  testConnection,

  // Products
  mapProductRow: productModel.mapProductRow,
  getProducts: productModel.getProducts,
  getProductById: productModel.getProductById,
  createProduct: productModel.createProduct,
  updateProduct: productModel.updateProduct,
  deleteProduct: productModel.deleteProduct,
  updateProductStock: productModel.updateProductStock,
  setProductStock: productModel.setProductStock,
  getTypes: productModel.getTypes,
  getProductReviews: productModel.getProductReviews,
  createProductReview: productModel.createProductReview,
  recordProductView: productModel.recordProductView,
  getInventorySummary: productModel.getInventorySummary,

  // Categories
  getCategories: categoryModel.getCategories,
  createCategory: categoryModel.createCategory,
  updateCategory: categoryModel.updateCategory,
  deleteCategory: categoryModel.deleteCategory,

  // Users & Auth
  createUser: userModel.createUser,
  getUserByEmail: userModel.getUserByEmail,
  getUserById: userModel.getUserById,
  updateUserProfile: userModel.updateUserProfile,
  updateUserPassword: userModel.updateUserPassword,
  getAllUsers: userModel.getAllUsers,
  updateUserRole: userModel.updateUserRole,

  // User Addresses
  getUserAddresses: userModel.getUserAddresses,
  createUserAddress: userModel.createUserAddress,
  deleteUserAddress: userModel.deleteUserAddress,

  // Orders
  createOrder: orderModel.createOrder,
  getOrderById: orderModel.getOrderById,
  getUserOrders: orderModel.getUserOrders,
  getAllOrders: orderModel.getAllOrders,
  updateOrderStatus: orderModel.updateOrderStatus,
  updateOrderPaymentStatus: orderModel.updateOrderPaymentStatus,

  // Cart
  getUserCart: cartModel.getUserCart,
  addToUserCart: cartModel.addToUserCart,
  updateCartItemQuantity: cartModel.updateCartItemQuantity,
  removeCartItem: cartModel.removeCartItem,
  clearUserCart: cartModel.clearUserCart,
  syncUserCart: cartModel.syncUserCart,

  // Wishlist
  getUserWishlist: wishlistModel.getUserWishlist,
  addToWishlist: wishlistModel.addToWishlist,
  removeFromWishlist: wishlistModel.removeFromWishlist,

  // Coupons
  getCouponByCode: couponModel.getCouponByCode,
  getAllCoupons: couponModel.getAllCoupons,
  createCoupon: couponModel.createCoupon,
  updateCoupon: couponModel.updateCoupon,
  deleteCoupon: couponModel.deleteCoupon,

  // Activities & Analytics
  logCustomerActivity: activityModel.logCustomerActivity,
  getCustomerActivities: activityModel.getCustomerActivities,
  getAdminAnalytics: analyticsModel.getAdminAnalytics
};
