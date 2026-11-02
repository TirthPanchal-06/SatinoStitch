require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { initializeDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory catalog helper (used for fallback if database is ever unreachable)
const loadFallbackProducts = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8'));
  } catch {
    return [];
  }
};
const orders = [];

// Middleware setup
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check endpoint: verifies server and PostgreSQL database connectivity
app.get('/api/health', async (req, res) => {
  const dbHealth = await db.testConnection();
  const isHealthy = dbHealth.connected;

  let counts = { products: 0, categories: 0 };
  if (isHealthy) {
    try {
      const pCountRes = await db.query('SELECT COUNT(*)::int AS count FROM products;');
      const cCountRes = await db.query('SELECT COUNT(*)::int AS count FROM categories;');
      counts.products = pCountRes.rows[0].count;
      counts.categories = cCountRes.rows[0].count;
    } catch (e) {
      console.warn('[PostgreSQL] Could not fetch table counts for health check:', e.message);
    }
  }

  const response = {
    status: isHealthy ? 'ok' : 'degraded',
    message: isHealthy
      ? 'SATINOSTITCH server and PostgreSQL database are healthy'
      : 'SATINOSTITCH server is running, but database connection failed',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    server: {
      status: 'online',
      port: Number(PORT)
    },
    database: isHealthy
      ? {
          status: 'connected',
          name: dbHealth.database,
          user: dbHealth.user,
          serverTime: dbHealth.time,
          version: dbHealth.version,
          productsCount: counts.products,
          categoriesCount: counts.categories
        }
      : {
          status: 'disconnected',
          name: process.env.DB_NAME || 'satinostitch',
          error: dbHealth.error
        }
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

// Categories endpoint: fetch all categories with product counts from PostgreSQL
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.json(categories);
  } catch (err) {
    console.error('[API] /api/categories error:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories from database' });
  }
});

// Unique garment types endpoint
app.get('/api/types', async (req, res) => {
  try {
    const types = await db.getTypes();
    res.json(types);
  } catch (err) {
    console.error('[API] /api/types error:', err.message);
    // Fallback
    const fallbackTypes = [...new Set(loadFallbackProducts().map(p => p.type))].sort();
    res.json(fallbackTypes);
  }
});

// Product catalog endpoint: dynamic search, filters, and sorting powered by PostgreSQL
app.get('/api/products', async (req, res) => {
  const { cat, col, type, q, search, max, min, sort } = req.query;

  try {
    const products = await db.getProducts({
      cat,
      col,
      type,
      q: q || search,
      max,
      min,
      sort
    });
    res.json(products);
  } catch (err) {
    console.warn('[PostgreSQL] Query failed, falling back to JSON catalog:', err.message);
    let items = loadFallbackProducts().filter(p => {
      const matchCat = !cat || cat === 'all' || p.cat === cat;
      const matchCol = !col || col === 'all' || p.col === col;
      const matchType = !type || type === 'all' || p.type === type;
      const maxPrice = Number(max);
      const matchPrice = isNaN(maxPrice) || p.price <= maxPrice;
      const searchTerm = (q || search || '').trim().toLowerCase();
      const matchSearch = !searchTerm || (p.name + p.type + p.fabric + (p.desc || '')).toLowerCase().includes(searchTerm);
      return matchCat && matchCol && matchType && matchPrice && matchSearch;
    });

    if (sort === 'low') items.sort((a, b) => a.price - b.price);
    if (sort === 'high') items.sort((a, b) => b.price - a.price);
    if (sort === 'rating') items.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    res.json(items);
  }
});

// Single product lookup
app.get('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const product = await db.getProductById(id);
    if (product) {
      return res.json(product);
    }
  } catch (err) {
    console.warn('[PostgreSQL] getProductById failed, trying fallback:', err.message);
    const fallback = loadFallbackProducts().find(p => p.id === id);
    if (fallback) {
      return res.json(fallback);
    }
  }

  res.status(404).json({ error: 'Product not found' });
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
app.post('/api/orders', async (req, res) => {
  const { customer, items } = req.body || {};
  if (!customer || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Customer information and items are required.' });
  }

  try {
    let catalog = [];
    try {
      catalog = await db.getProducts();
    } catch {
      catalog = loadFallbackProducts();
    }

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
  } catch (err) {
    console.error('[API] /api/orders error:', err.message);
    res.status(500).json({ error: 'Order processing error' });
  }
});

// 404 handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Start application server & initialize database schema
const server = app.listen(PORT, async () => {
  console.log(`SATINOSTITCH server running at http://localhost:${PORT}`);
  try {
    await initializeDatabase();
    console.log('[PostgreSQL] Database tables initialized and ready.');
  } catch (err) {
    console.warn('[PostgreSQL] Database initialization warning:', err.message);
  }
});

module.exports = { app, server };
