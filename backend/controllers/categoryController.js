const categoryModel = require('../models/categoryModel');
const productModel = require('../models/productModel');

async function getCategories(req, res) {
  try {
    const list = await categoryModel.getCategories();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve couture collections.' });
  }
}

async function getTypes(req, res) {
  try {
    const types = await productModel.getTypes();
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve garment silhouettes.' });
  }
}

async function createCategory(req, res) {
  const { name, slug, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  try {
    const cat = await categoryModel.createCategory({ slug, name, description });
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateCategory(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid category ID' });
  try {
    const cat = await categoryModel.updateCategory(id, req.body);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteCategory(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid category ID' });
  try {
    const ok = await categoryModel.deleteCategory(id);
    if (!ok) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true, message: 'Category removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getCategories,
  getTypes,
  createCategory,
  updateCategory,
  deleteCategory
};

