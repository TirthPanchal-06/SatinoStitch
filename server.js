const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory catalog helper and temporary order store
const loadProducts = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8'));
const orders = [];

// Middleware setup
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Product catalog endpoint: supports category and collection filtering
app.get('/api/products', (req, res) => {
  const { cat, col } = req.query;
  const items = loadProducts().filter(p => (!cat || p.cat === cat) && (!col || p.col === col));
  res.json(items);
});

// Single product lookup
app.get('/api/products/:id', (req, res) => {
  const product = loadProducts().find(p => p.id === Number(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// Contact inquiry submission
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !message) {
    return res.status(400).json({ error: 'Valid name, email, and message are required.' });
  }
  res.json({ ok: true });
});

// Order checkout and placement
app.post('/api/orders', (req, res) => {
  const { customer, items } = req.body || {};
  if (!customer || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Customer information and items are required.' });
  }

  const catalog = loadProducts();
  const total = items.reduce((sum, item) => {
    const match = catalog.find(p => p.id === item.id);
    return sum + (match?.price || 0) * item.qty;
  }, 0);

  const order = {
    id: 'SS' + Date.now().toString().slice(-7),
    customer,
    items,
    total,
    placedAt: new Date().toISOString()
  };

  orders.push(order);
  res.status(201).json({ id: order.id, total });
});

// Start application server
app.listen(PORT, () => {
  console.log(`SATINOSTITCH server running at http://localhost:${PORT}`);
});
