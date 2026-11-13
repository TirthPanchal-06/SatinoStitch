const { testConnection, query } = require('../config/db');
const env = require('../config/env');
const adminUpgradeModel = require('../models/adminUpgradeModel');

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

async function getCollections(req, res) {
  let counts = { wedding: 8, festive: 4, everyday: 3, work: 3 };
  try {
    const dbCounts = await query('SELECT col, COUNT(*)::int AS count FROM products GROUP BY col;');
    if (dbCounts && dbCounts.rows) {
      dbCounts.rows.forEach(r => {
        if (r.col) counts[r.col] = r.count;
      });
    }
  } catch (e) {
    console.warn('[Collections] Using fallback counts:', e.message);
  }

  res.json([
    {
      id: 'wedding',
      key: 'wedding',
      name: 'Wedding Edit',
      tagline: 'Bridal Symphony & Zardozi',
      desc: 'Royal Banarasi silk sarees, bespoke bridal lehengas and gold zari sets.',
      text: 'Royal Banarasi silk sarees, bespoke bridal lehengas and gold zari sets.',
      image: 'images/wedding-edit.jpg',
      img: 'images/wedding-edit.jpg',
      count: counts.wedding || 8,
      itemCount: `${counts.wedding || 8} Creations`,
      filter: { col: 'wedding' }
    },
    {
      id: 'festive',
      key: 'festive',
      name: 'Festive Wear',
      tagline: 'Heritage Bandhani & Zari',
      desc: 'Handcrafted bandhani, lustrous satin and antique gold artisanal craft.',
      text: 'Handcrafted bandhani, lustrous satin and antique gold artisanal craft.',
      image: 'images/p2_front.jpg',
      img: 'images/p2_front.jpg',
      count: counts.festive || 4,
      itemCount: `${counts.festive || 4} Creations`,
      filter: { col: 'festive' }
    },
    {
      id: 'everyday',
      key: 'everyday',
      name: 'Everyday Cotton',
      tagline: 'Mulmul Prints & Pure Chanderi',
      desc: 'Breathable Mulmul hand-block prints, pure Chanderi kurtas and easy drape.',
      text: 'Breathable Mulmul hand-block prints, pure Chanderi kurtas and easy drape.',
      image: 'images/p5_front.jpg',
      img: 'images/p5_front.jpg',
      count: counts.everyday || 3,
      itemCount: `${counts.everyday || 3} Creations`,
      filter: { col: 'everyday' }
    },
    {
      id: 'work',
      key: 'work',
      name: 'Work Wardrobe',
      tagline: 'Liquid Satin & Sartorial Linen',
      desc: 'Sartorial linen check blazers, tailored trousers and pleated crepe tailoring.',
      text: 'Sartorial linen check blazers, tailored trousers and pleated crepe tailoring.',
      image: 'images/p9_front.jpg',
      img: 'images/p9_front.jpg',
      count: counts.work || 3,
      itemCount: `${counts.work || 3} Creations`,
      filter: { col: 'work' }
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

async function submitContact(req, res) {
  const { name, email, phone, message, subject, type } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and inquiry message are required.' });
  }

  try {
    const saved = await adminUpgradeModel.createSupportQuery({
      name,
      email,
      phone: phone || null,
      subject: subject || 'Atelier Customer Inquiry',
      message,
      type: type || 'contact'
    });

    // Notify admin dashboard
    adminUpgradeModel.createAdminNotification({
      type: 'query',
      title: `New Inquiry: ${name}`,
      message: `${name} (${email}): "${message.slice(0, 70)}${message.length > 70 ? '...' : ''}"`,
      link: 'admin.html?tab=support'
    }).catch(() => { });

    res.json({
      ok: true,
      message: 'Your inquiry has reached our senior couture concierge. Expect a response within 4 hours.',
      queryId: saved.id
    });
  } catch (err) {
    console.error('[Submit Contact Error]:', err);
    res.status(500).json({ error: 'Failed to submit inquiry. Please try again.' });
  }
}

async function getPublicSettings(req, res) {
  try {
    const settings = await adminUpgradeModel.getAllWebsiteSettings();
    res.json(settings);
  } catch (err) {
    res.json({
      announcement: {
        tickerText: 'COMPLIMENTARY EXPRESS SHIPPING ON ORDERS OVER ₹3,000',
        promoCode: 'HERITAGE10',
        promoDiscount: '10% OFF'
      },
      hero_banner: {
        pill: 'Handcrafted Heritage & Sartorial Couture',
        headline: 'Woven for weddings, cut for every day.',
        subheadline: 'Pure Banarasi silk, heritage bandhani and artisanal hand-block prints, paired alongside precision tailoring and liquid satin for the rest of the week. One wardrobe, two timeless traditions.'
      }
    });
  }
}

module.exports = {
  getHealth,
  getBanners,
  getCollections,
  subscribeNewsletter,
  submitContact,
  getPublicSettings
};

