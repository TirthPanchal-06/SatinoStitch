const { testConnection, query } = require('../config/db');
const env = require('../config/env');

async function getHealth(req, res) {
  const dbHealth = await testConnection();
  const isHealthy = dbHealth.success;

  let counts = { products: 0, categories: 0, users: 0, orders: 0, cartItems: 0 };
  if (isHealthy) {
    try {
      const pCount = await query('SELECT COUNT(*)::int AS count FROM products;');
      const cCount = await query('SELECT COUNT(*)::int AS count FROM categories;');
      const uCount = await query('SELECT COUNT(*)::int AS count FROM users;');
      const oCount = await query('SELECT COUNT(*)::int AS count FROM orders;');
      const cartCount = await query('SELECT COUNT(*)::int AS count FROM cart_items;');
      counts = {
        products: pCount.rows[0].count,
        categories: cCount.rows[0].count,
        users: uCount.rows[0].count,
        orders: oCount.rows[0].count,
        cartItems: cartCount.rows[0].count
      };
    } catch (e) {
      console.warn('[Health Check] Table counts error:', e.message);
    }
  }

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    message: isHealthy
      ? 'SATINOSTITCH server and PostgreSQL database are healthy'
      : 'SATINOSTITCH server running, but database connection failed',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    server: { status: 'online', port: env.PORT },
    database: isHealthy
      ? {
        status: 'connected',
        name: dbHealth.database,
        user: dbHealth.user,
        serverTime: dbHealth.time,
        version: dbHealth.version,
        ...counts
      }
      : {
        status: 'disconnected',
        name: env.DB_NAME,
        error: dbHealth.error
      }
  });
}

function getBanners(req, res) {
  res.json([
    {
      id: 1,
      title: 'Royal Banarasi & Liquid Satin',
      subtitle: 'Winter Couture Edition 2026',
      desc: 'Handcrafted luxury sarees, lehengas, and tailored western pret with artisanal precision.',
      image: 'images/hero-banner.jpg',
      badge: 'Heritage & Western Haute Couture',
      ctaText: 'Explore Atelier Creations',
      ctaLink: 'shop.html'
    },
    {
      id: 2,
      title: 'The Royal Wedding Edit',
      subtitle: 'Bridal & Groomsmen Couturiers',
      desc: 'Regal bridal silhouettes, zardozi embroidery, and bespoke brocade sherwanis.',
      image: 'images/wedding-edit.jpg',
      badge: 'Exclusive Atelier Commission',
      ctaText: 'Discover Wedding Edit',
      ctaLink: 'collections.html'
    }
  ]);
}

function getCollections(req, res) {
  res.json([
    {
      id: 'heritage',
      name: 'Royal Heritage Silk',
      tagline: 'Timeless Zardozi & Brocade',
      desc: 'Woven in royal Varanasi atriums with pure silver and gold zari threads.',
      image: 'images/wedding-edit.jpg',
      itemCount: '18 Creations',
      filter: { col: 'heritage' }
    },
    {
      id: 'wedding',
      name: 'Bridal Symphony',
      tagline: 'Magnificent Ceremonial Coutures',
      desc: 'Bespoke bridal lehengas adorned with artisanal craftsmanship.',
      image: 'images/p1.jpg',
      itemCount: '12 Creations',
      filter: { col: 'wedding' }
    },
    {
      id: 'modern',
      name: 'Liquid Satin & Sartorial Linen',
      tagline: 'Refined Contemporary Western Pret',
      desc: 'Precision tailoring meeting sumptuous drape for sophisticated wardrobes.',
      image: 'images/p2.jpg',
      itemCount: '15 Creations',
      filter: { col: 'modern' }
    }
  ]);
}

function subscribeNewsletter(req, res) {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  res.json({
    ok: true,
    message: 'Welcome to SATINOSTITCH Gazette. Your private welcome gift code HERITAGE10 is ready.'
  });
}

function submitContact(req, res) {
  const { name, email, phone, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and inquiry message are required.' });
  }
  res.json({
    ok: true,
    message: 'Your inquiry has reached our senior couture concierge. Expect a response within 4 hours.'
  });
}

module.exports = {
  getHealth,
  getBanners,
  getCollections,
  subscribeNewsletter,
  submitContact
};

