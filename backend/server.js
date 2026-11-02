require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory catalog helper and temporary order store
const loadProducts = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8'));
const orders = [];

// Middleware setup
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check endpoint: verifies server and PostgreSQL database connectivity
app.get('/api/health', async (req, res) => {
  const dbHealth = await db.testConnection();
  const isHealthy = dbHealth.connected;

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
          version: dbHealth.version
        }
      : {
          status: 'disconnected',
          name: process.env.DB_NAME || 'satinostitch',
          error: dbHealth.error
        }
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

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

// 404 handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Start application server
const server = app.listen(PORT, async () => {
  console.log(`SATINOSTITCH server running at http://localhost:${PORT}`);
  const dbStatus = await db.testConnection();
  if (dbStatus.connected) {
    console.log(`[PostgreSQL] Connected successfully to database: "${dbStatus.database}" as user: "${dbStatus.user}"`);
  } else {
    console.warn(`[PostgreSQL] Connection warning: ${dbStatus.error}`);
  }
});

module.exports = { app, server };
