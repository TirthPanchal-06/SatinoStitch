const { query } = require('../config/db');

async function getCategories() {
  const sql = `
    SELECT 
      c.id, 
      c.slug, 
      c.name, 
      c.description,
      COUNT(p.id)::int AS products_count
    FROM categories c
    LEFT JOIN products p ON p.cat = c.slug
    GROUP BY c.id
    ORDER BY c.id ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

async function createCategory({ slug, name, description }) {
  const cleanSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const sql = `
    INSERT INTO categories (slug, name, description)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const res = await query(sql, [cleanSlug, name, description || null]);
  return res.rows[0];
}

async function updateCategory(id, { slug, name, description }) {
  const sql = `
    UPDATE categories
    SET slug = COALESCE($2, slug),
        name = COALESCE($3, name),
        description = COALESCE($4, description)
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [id, slug, name, description]);
  return res.rows[0] || null;
}

async function deleteCategory(id) {
  const sql = `DELETE FROM categories WHERE id = $1 RETURNING id;`;
  const res = await query(sql, [id]);
  return res.rowCount > 0;
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
};

