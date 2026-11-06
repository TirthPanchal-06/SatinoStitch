const { query } = require('../config/db');

function mapProductRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    cat: r.cat,
    type: r.type,
    col: r.col,
    price: Number(r.price),
    oldPrice: r.old_price ? Number(r.old_price) : null,
    c1: r.c1,
    c2: r.c2,
    pat: r.pat,
    tag: r.tag,
    rating: Number(r.rating || 5.0),
    reviews: Number(r.reviews || 0),
    stock: Number(r.stock || 0),
    image: r.image,
    images: Array.isArray(r.images) ? r.images : (typeof r.images === 'string' ? JSON.parse(r.images || '[]') : [r.image]),
    fabric: r.fabric,
    desc: r.description,
    description: r.description,
    sizes: Array.isArray(r.sizes) ? r.sizes : (typeof r.sizes === 'string' ? JSON.parse(r.sizes || '["XS","S","M","L","XL"]') : ["XS","S","M","L","XL"]),
    colors: Array.isArray(r.colors) ? r.colors : (typeof r.colors === 'string' ? JSON.parse(r.colors || '[]') : []),
    viewsCount: Number(r.views_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

async function getProducts({ cat, type, col, c1, c2, sort, search, limit = 50, offset = 0 } = {}) {
  let sql = `SELECT * FROM products WHERE 1=1`;
  const params = [];
  let idx = 1;

  if (cat && cat !== 'all') {
    sql += ` AND cat = $${idx++}`;
    params.push(cat);
  }
  if (type) {
    sql += ` AND LOWER(type) = LOWER($${idx++})`;
    params.push(type);
  }
  if (col) {
    sql += ` AND col = $${idx++}`;
    params.push(col);
  }
  if (c1) {
    sql += ` AND (c1 = $${idx} OR c2 = $${idx})`;
    idx++;
    params.push(c1);
  }
  if (search) {
    sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(description) LIKE $${idx} OR LOWER(fabric) LIKE $${idx} OR LOWER(type) LIKE $${idx})`;
    idx++;
    params.push(`%${search.toLowerCase().trim()}%`);
  }

  // Sorting
  if (sort === 'price-asc') {
    sql += ` ORDER BY price ASC`;
  } else if (sort === 'price-desc') {
    sql += ` ORDER BY price DESC`;
  } else if (sort === 'rating') {
    sql += ` ORDER BY rating DESC, reviews DESC`;
  } else if (sort === 'popular') {
    sql += ` ORDER BY views_count DESC, reviews DESC`;
  } else {
    sql += ` ORDER BY id ASC`;
  }

  sql += ` LIMIT $${idx++} OFFSET $${idx++};`;
  params.push(limit, offset);

  const res = await query(sql, params);
  return res.rows.map(mapProductRow);
}

async function getProductById(id) {
  const num = Number(id);
  if (isNaN(num)) return null;
  const sql = `SELECT * FROM products WHERE id = $1;`;
  const res = await query(sql, [num]);
  return mapProductRow(res.rows[0]);
}

async function createProduct(data) {
  const sql = `
    INSERT INTO products (
      name, cat, type, col, price, old_price, c1, c2, pat, tag, rating, reviews, stock,
      image, images, fabric, description, sizes, colors
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19
    ) RETURNING *;
  `;
  const defaultSizes = data.sizes || ['XS', 'S', 'M', 'L', 'XL'];
  const defaultColors = data.colors || (data.c1 ? [{ name: 'Primary Shade', hex: data.c1 }] : [{ name: 'Classic Gold', hex: '#C6A15B' }]);
  const gallery = data.images || (data.image ? [data.image] : ['images/p1.jpg']);

  const res = await query(sql, [
    data.name,
    data.cat || 'ethnic',
    data.type || 'Garment',
    data.col || 'heritage',
    Number(data.price),
    data.oldPrice ? Number(data.oldPrice) : null,
    data.c1 || '#C6A15B',
    data.c2 || null,
    data.pat || 'Classic',
    data.tag || null,
    data.rating || 5.0,
    data.reviews || 0,
    data.stock !== undefined ? parseInt(data.stock, 10) : 10,
    data.image || 'images/p1.jpg',
    JSON.stringify(gallery),
    data.fabric || 'Pure Handloom Silk',
    data.desc || data.description || '',
    JSON.stringify(defaultSizes),
    JSON.stringify(defaultColors)
  ]);
  return mapProductRow(res.rows[0]);
}

async function updateProduct(id, data) {
  const current = await getProductById(id);
  if (!current) return null;

  const sql = `
    UPDATE products
    SET name = COALESCE($2, name),
        cat = COALESCE($3, cat),
        type = COALESCE($4, type),
        col = COALESCE($5, col),
        price = COALESCE($6, price),
        old_price = COALESCE($7, old_price),
        c1 = COALESCE($8, c1),
        c2 = COALESCE($9, c2),
        pat = COALESCE($10, pat),
        tag = COALESCE($11, tag),
        stock = COALESCE($12, stock),
        image = COALESCE($13, image),
        images = COALESCE($14, images),
        fabric = COALESCE($15, fabric),
        description = COALESCE($16, description),
        sizes = COALESCE($17, sizes),
        colors = COALESCE($18, colors),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const res = await query(sql, [
    id,
    data.name,
    data.cat,
    data.type,
    data.col,
    data.price !== undefined ? Number(data.price) : undefined,
    data.oldPrice !== undefined ? Number(data.oldPrice) : undefined,
    data.c1,
    data.c2,
    data.pat,
    data.tag,
    data.stock !== undefined ? parseInt(data.stock, 10) : undefined,
    data.image,
    data.images ? JSON.stringify(data.images) : undefined,
    data.fabric,
    data.desc || data.description,
    data.sizes ? JSON.stringify(data.sizes) : undefined,
    data.colors ? JSON.stringify(data.colors) : undefined
  ]);
  return mapProductRow(res.rows[0]);
}

async function deleteProduct(id) {
  const sql = `DELETE FROM products WHERE id = $1 RETURNING id;`;
  const res = await query(sql, [id]);
  return res.rowCount > 0;
}

async function updateProductStock(id, stockChange) {
  const sql = `
    UPDATE products
    SET stock = GREATEST(0, stock + $2),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, stock;
  `;
  const res = await query(sql, [id, stockChange]);
  return res.rows[0] || null;
}

async function setProductStock(id, newStock) {
  const sql = `
    UPDATE products
    SET stock = GREATEST(0, $2),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, stock;
  `;
  const res = await query(sql, [id, parseInt(newStock, 10)]);
  return res.rows[0] || null;
}

async function getTypes() {
  const sql = `SELECT DISTINCT type FROM products ORDER BY type ASC;`;
  const res = await query(sql);
  return res.rows.map(r => r.type);
}

/* Reviews */
async function getProductReviews(productId) {
  const sql = `
    SELECT id, product_id, user_name, rating, title, comment, verified_purchase, created_at
    FROM product_reviews
    WHERE product_id = $1
    ORDER BY created_at DESC;
  `;
  const res = await query(sql, [productId]);
  return res.rows;
}

async function createProductReview(productId, { userId, userName, rating, title, comment }) {
  const insertSql = `
    INSERT INTO product_reviews (product_id, user_id, user_name, rating, title, comment, verified_purchase)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    RETURNING *;
  `;
  const res = await query(insertSql, [
    productId,
    userId || null,
    userName || 'Patron of the Atelier',
    parseInt(rating, 10),
    title || null,
    comment
  ]);

  // Recalculate average rating & reviews count
  const statsSql = `
    UPDATE products
    SET rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM product_reviews WHERE product_id = $1),
        reviews = (SELECT COUNT(*)::int FROM product_reviews WHERE product_id = $1)
    WHERE id = $1
    RETURNING rating, reviews;
  `;
  await query(statsSql, [productId]);
  return res.rows[0];
}

/* Product View Tracking */
async function recordProductView(productId, userId, ipAddress) {
  await query(
    `INSERT INTO product_views (product_id, user_id, ip_address) VALUES ($1, $2, $3);`,
    [productId, userId || null, ipAddress || null]
  ).catch(() => {});

  await query(
    `UPDATE products SET views_count = views_count + 1 WHERE id = $1;`,
    [productId]
  ).catch(() => {});
}

/* Inventory Summary */
async function getInventorySummary() {
  const sql = `
    SELECT 
      id, name, cat, type, price, stock,
      CASE 
        WHEN stock = 0 THEN 'Out of Stock'
        WHEN stock <= 3 THEN 'Critical Low'
        WHEN stock <= 5 THEN 'Low Stock'
        ELSE 'Healthy'
      END AS status
    FROM products
    ORDER BY stock ASC, id ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

module.exports = {
  mapProductRow,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  setProductStock,
  getTypes,
  getProductReviews,
  createProductReview,
  recordProductView,
  getInventorySummary
};

