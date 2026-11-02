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
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
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
    rating: Number(row.rating),
    reviews: Number(row.reviews),
    stock: Number(row.stock),
    image: row.image,
    fabric: row.fabric,
    desc: row.description
  };
}

async function getProducts({ cat, col, type, q, search, max, min, sort } = {}) {
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
      p.id,
      p.name,
      p.cat,
      c.name AS category_name,
      p.type,
      p.col,
      p.price,
      p.old_price,
      p.c1,
      p.c2,
      p.pat,
      p.tag,
      p.rating,
      p.reviews,
      p.stock,
      p.image,
      p.fabric,
      p.description
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
      p.id,
      p.name,
      p.cat,
      c.name AS category_name,
      p.type,
      p.col,
      p.price,
      p.old_price,
      p.c1,
      p.c2,
      p.pat,
      p.tag,
      p.rating,
      p.reviews,
      p.stock,
      p.image,
      p.fabric,
      p.description
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1;
  `;
  const res = await pool.query(sql, [id]);
  return res.rows[0] ? mapProductRow(res.rows[0]) : null;
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
  const sql = `
    SELECT DISTINCT type
    FROM products
    ORDER BY type ASC;
  `;
  const res = await pool.query(sql);
  return res.rows.map(r => r.type);
}

module.exports = {
  pool,
  query,
  testConnection,
  getProducts,
  getProductById,
  getCategories,
  getTypes,
  mapProductRow
};
