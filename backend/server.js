require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { initializeDatabase } = require('./db/init');
const {
  generateToken,
  authenticateToken,
  optionalAuth,
  requireAdmin
} = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Multer for Image Uploads with strict MIME and size limits
const uploadDir = path.join(__dirname, '..', 'frontend', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'garment-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Fallback in-memory catalog
const loadFallbackProducts = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf8'));
  } catch {
    return [];
  }
};

/* ==========================================================================
   Health Check & Diagnostics
   ========================================================================== */
app.get('/api/health', async (req, res) => {
  const dbHealth = await db.testConnection();
  const isHealthy = dbHealth.connected;

  let counts = { products: 0, categories: 0, users: 0, orders: 0, cartItems: 0 };
  if (isHealthy) {
    try {
      const pCount = await db.query('SELECT COUNT(*)::int AS count FROM products;');
      const cCount = await db.query('SELECT COUNT(*)::int AS count FROM categories;');
      const uCount = await db.query('SELECT COUNT(*)::int AS count FROM users;');
      const oCount = await db.query('SELECT COUNT(*)::int AS count FROM orders;');
      const cartCount = await db.query('SELECT COUNT(*)::int AS count FROM cart_items;');
      counts = {
        products: pCount.rows[0].count,
        categories: cCount.rows[0].count,
        users: uCount.rows[0].count,
        orders: oCount.rows[0].count,
        cartItems: cartCount.rows[0].count
      };
    } catch (e) {
      console.warn('[PostgreSQL] Could not fetch table counts for health check:', e.message);
    }
  }

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    message: isHealthy
      ? 'SATINOSTITCH server and PostgreSQL database are healthy'
      : 'SATINOSTITCH server running, but database connection failed',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    server: { status: 'online', port: Number(PORT) },
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
        name: process.env.DB_NAME || 'satinostitch',
        error: dbHealth.error
      }
  });
});

/* ==========================================================================
   Module 1: Home, Promotional Banners & Collections
   ========================================================================== */
app.get('/api/banners', (req, res) => {
  res.json([
    {
      id: 'heritage-couture',
      badge: 'Haute Couture 2026',
      title: 'Where Royal Weaves Meet Sharp Sartorial Lines',
      subtitle: 'Pure Banarasi zari, hand-pleated satin, and bespoke modern pret tailored for grand entrances.',
      cta: 'Explore The Atelier',
      link: 'shop.html',
      secondaryCta: 'Curated Wedding Edit',
      secondaryLink: 'collections.html?c=wedding',
      bg: 'linear-gradient(135deg, rgba(91,24,53,0.92) 0%, rgba(28,23,21,0.95) 100%)'
    },
    {
      id: 'festive-chanderi',
      badge: 'Festive Capsule',
      title: 'Aangan Festive & Heirloom Chanderi',
      subtitle: 'Lustrous silks illuminated by hand-block gold foil and delicate gota patti borders.',
      cta: 'Discover Festive Edit',
      link: 'shop.html?col=festive',
      secondaryCta: 'View Lookbook',
      secondaryLink: 'collections.html?c=festive',
      bg: 'linear-gradient(135deg, rgba(198,161,91,0.9) 0%, rgba(91,24,53,0.95) 100%)'
    }
  ]);
});

app.get('/api/collections', (req, res) => {
  res.json([
    {
      key: 'wedding',
      name: 'The Royal Banarasi & Wedding Edit',
      tagline: 'Imperial silhouettes woven with pure gold zari threads.',
      image: 'images/wedding-edit.jpg',
      badge: 'Bridal Couture'
    },
    {
      key: 'festive',
      name: 'Noor-e-Zari Festive Capsule',
      tagline: 'Heirloom bandhani and molten tissue silk for gala evenings.',
      image: 'images/p4.jpg',
      badge: 'Festive Pret'
    },
    {
      key: 'everyday',
      name: 'Aangan Breathable Chanderi',
      tagline: 'Featherlight pure Mulmul hand-block prints and timeless kurtas.',
      image: 'images/p5.jpg',
      badge: 'Artisanal Pret'
    },
    {
      key: 'work',
      name: 'Sovereign Sartorial Suiting',
      tagline: 'Sharp checkered linen blazers and pleated crepe silhouettes.',
      image: 'images/p9.jpg',
      badge: 'Contemporary Pret'
    }
  ]);
});

app.post('/api/newsletter', (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  res.json({
    ok: true,
    message: 'Welcome to the SATINOSTITCH VIP Atelier. Your invitation and styling dispatch have been sent.'
  });
});

/* ==========================================================================
   Module 2: Product Catalogue, Search, Filters & Categories
   ========================================================================== */
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.json(categories);
  } catch (err) {
    console.error('[API] Categories error:', err);
    res.json([
      { id: 1, slug: 'ethnic', name: 'Ethnic Couture', count: 7 },
      { id: 2, slug: 'western', name: 'Western Pret', count: 5 }
    ]);
  }
});

// Category Admin CRUD
app.post('/api/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { slug, name, description } = req.body || {};
    if (!slug || !name) {
      return res.status(400).json({ error: 'Category slug and name are required.' });
    }
    const cat = await db.createCategory({ slug, name, description });
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid category ID' });
  try {
    const updated = await db.updateCategory(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Category not found.' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid category ID' });
  try {
    const deleted = await db.deleteCategory(id);
    if (!deleted) return res.status(404).json({ error: 'Category not found.' });
    res.json({ ok: true, message: `Category ${id} deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/types', async (req, res) => {
  try {
    const types = await db.getTypes();
    res.json(types);
  } catch (err) {
    res.json(['Suit sets', 'Kurtas', 'Sarees', 'Lehengas', 'Dresses', 'Tops & blazers', 'Bottoms']);
  }
});

app.get('/api/products', async (req, res) => {
  const { cat, col, type, q, max, min, sort, inStock } = req.query;

  try {
    const products = await db.getProducts({
      category: cat,
      collection: col,
      type,
      search: q,
      maxPrice: max,
      minPrice: min,
      sort,
      inStock: inStock === 'true' || inStock === '1'
    });
    res.json(products);
  } catch (err) {
    console.warn('[PostgreSQL] Fallback to in-memory catalog:', err.message);
    let list = loadFallbackProducts();
    if (cat) list = list.filter(p => p.cat === cat);
    if (col) list = list.filter(p => p.col === col);
    if (type) list = list.filter(p => p.type === type);
    if (max) list = list.filter(p => p.price <= Number(max));
    if (q) {
      const term = q.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(term) || (p.fabric && p.fabric.toLowerCase().includes(term)));
    }
    if (sort === 'low') list.sort((a, b) => a.price - b.price);
    else if (sort === 'high') list.sort((a, b) => b.price - a.price);
    res.json(list);
  }
});

app.get('/api/products/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const product = await db.getProductById(id);
    if (product) {
      // Record view in real-time
      db.recordProductView(id, req.user ? req.user.id : null, req.ip).catch(() => { });
      return res.json(product);
    }
  } catch (err) {
    const fallback = loadFallbackProducts().find(p => p.id === id);
    if (fallback) return res.json(fallback);
  }

  res.status(404).json({ error: 'Product not found' });
});

// Product CRUD (Admin / Curator Protected)
app.post('/api/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, cat, type, col, price, old, fabric, desc, image, stock, c1, c2, pat, tag, sizes, colors } = req.body || {};
    if (!name || !price) {
      return res.status(400).json({ error: 'Garment name and active selling price are required.' });
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: 'Price must be a positive numeric value.' });
    }

    const newProduct = await db.createProduct({
      name: name.trim(),
      cat: cat || 'ethnic',
      type: type || 'Suit sets',
      col: col || 'everyday',
      price: numPrice,
      old: old ? Number(old) : null,
      fabric: fabric || 'Pure handwoven textile',
      desc: desc || '',
      image: image || 'images/p1.jpg',
      stock: stock != null ? Math.max(0, parseInt(stock, 10)) : 10,
      c1: c1 || '#5B1835',
      c2: c2 || '#C6A15B',
      pat: pat || 'plain',
      tag: tag || 'New Arrival',
      sizes: sizes || ['XS', 'S', 'M', 'L', 'XL'],
      colors: colors || [{ name: 'Primary Shade', hex: c1 || '#5B1835' }]
    });
    res.status(201).json(newProduct);
  } catch (err) {
    console.error('[API] Create product error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const updated = await db.updateProduct(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('[API] Update product error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const deleted = await db.deleteProduct(id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true, message: `Product ${id} removed from atelier catalog.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Image Upload Endpoint (Multer with Authenticated Access)
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }
  const relativePath = 'uploads/' + req.file.filename;
  res.json({
    ok: true,
    url: relativePath,
    filename: req.file.filename,
    size: req.file.size
  });
});

/* ==========================================================================
   Inventory Management (Admin)
   ========================================================================== */

/* ==========================================================================
   Real-Time Analytics & Customer Activity Intelligence (Admin)
   ========================================================================== */
app.get('/api/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const analytics = await db.getAdminAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error('[API] Admin analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/activities', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit || 30;
    const type = req.query.type || null;
    const activities = await db.getCustomerActivities(limit, type);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/view', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
  try {
    const userId = req.user ? req.user.id : null;
    const ip = req.ip || req.connection?.remoteAddress;
    await db.recordProductView(id, userId, ip);

    const product = await db.getProductById(id);
    if (product) {
      db.logCustomerActivity({
        userId,
        userName: req.user ? req.user.name : 'Guest Patron',
        activityType: 'product_view',
        description: `Patron viewed garment: "${product.name}" (${product.cat === 'ethnic' ? 'Ethnic' : 'Western'})`,
        metadata: { productId: id, name: product.name }
      }).catch(() => { });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activity/cart', optionalAuth, async (req, res) => {
  const { productId, size, color, quantity } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'Product ID required' });
  try {
    const product = await db.getProductById(Number(productId));
    const userId = req.user ? req.user.id : null;
    const userName = req.user ? req.user.name : 'Guest Patron';
    db.logCustomerActivity({
      userId,
      userName,
      activityType: 'cart_add',
      description: `Added "${product ? product.name : 'Garment'}" (Size: ${size || 'M'}, Qty: ${quantity || 1}) to shopping bag`,
      metadata: { productId: Number(productId), size, color, quantity }
    }).catch(() => { });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await db.getInventorySummary();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id/stock', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { stock } = req.body || {};
  if (isNaN(id) || stock == null) {
    return res.status(400).json({ error: 'Valid product ID and stock count are required.' });
  }
  try {
    const updated = await db.setProductStock(id, stock);
    if (!updated) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Module 3: Product Details & Reviews
   ========================================================================== */
app.get('/api/products/:id/reviews', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const reviews = await db.getProductReviews(id);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

app.post('/api/products/:id/reviews', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  const { rating, title, comment, name } = req.body || {};
  if (!rating || !comment) {
    return res.status(400).json({ error: 'Rating (1-5) and review feedback are required.' });
  }

  const numRating = parseInt(rating, 10);
  if (numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
  }

  try {
    const authorName = (req.user && req.user.name) || name || 'Verified Patron';
    const userId = req.user ? req.user.id : null;

    const review = await db.createProductReview({
      productId: id,
      userId,
      userName: authorName,
      rating: numRating,
      title: title || 'Atelier Feedback',
      comment,
      verifiedPurchase: !!req.user
    });

    db.getProductById(id).then(p => {
      db.logCustomerActivity({
        userId,
        userName: authorName,
        activityType: 'review',
        description: `Verified ${numRating}★ review submitted for "${p ? p.name : 'Creation'}" by ${authorName}: "${title || 'Patron Review'}"`,
        metadata: { productId: id, rating: numRating, title }
      }).catch(() => { });
    }).catch(() => { });

    res.status(201).json(review);
  } catch (err) {
    console.error('[API] Create review error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Module 4: Customer Cart (Persistent Server-Side)
   ========================================================================== */
app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    const items = await db.getUserCart(req.user.id);
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    res.json({
      ok: true,
      items,
      itemCount,
      subtotal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cart', authenticateToken, async (req, res) => {
  const { productId, size, color, quantity } = req.body || {};
  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  try {
    const item = await db.addToUserCart(req.user.id, {
      productId: Number(productId),
      size: size || 'M',
      color: color || null,
      quantity: Number(quantity) || 1
    });

    db.getProductById(Number(productId)).then(prod => {
      db.logCustomerActivity({
        userId: req.user.id,
        userName: req.user.name,
        activityType: 'cart_add',
        description: `Added "${prod ? prod.name : 'Garment'}" (Size: ${size || 'M'}, Qty: ${quantity || 1}) to shopping bag`,
        metadata: { productId: Number(productId), size, color, quantity }
      }).catch(() => { });
    }).catch(() => { });

    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/cart/:id', authenticateToken, async (req, res) => {
  const cartItemId = Number(req.params.id);
  const { quantity } = req.body || {};
  if (isNaN(cartItemId) || quantity == null) {
    return res.status(400).json({ error: 'Cart item ID and quantity are required.' });
  }

  try {
    const item = await db.updateCartItemQuantity(req.user.id, cartItemId, Number(quantity));
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart/:id', authenticateToken, async (req, res) => {
  const cartItemId = Number(req.params.id);
  if (isNaN(cartItemId)) return res.status(400).json({ error: 'Invalid cart item ID.' });

  try {
    const ok = await db.removeCartItem(req.user.id, cartItemId);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart', authenticateToken, async (req, res) => {
  try {
    await db.clearUserCart(req.user.id);
    res.json({ ok: true, message: 'Shopping bag cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cart/sync', authenticateToken, async (req, res) => {
  const { items } = req.body || {};
  try {
    const cart = await db.syncUserCart(req.user.id, items || []);
    res.json({ ok: true, items: cart });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Coupons & Promotions (User & Admin)
   ========================================================================== */
app.get('/api/coupons/:code', async (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const subtotal = Number(req.query.subtotal || 0);

  try {
    const coupon = await db.getCouponByCode(code);
    if (!coupon || !coupon.is_active) {
      return res.status(404).json({ error: 'Invalid or expired promotional code.' });
    }

    if (subtotal < Number(coupon.min_order_amount)) {
      return res.status(400).json({
        error: `Code ${code} requires a minimum order value of ₹${Number(coupon.min_order_amount).toLocaleString('en-IN')}.`
      });
    }

    const discountAmount = Math.round((subtotal * coupon.discount_percent) / 100);
    res.json({
      valid: true,
      code: coupon.code,
      discountPercent: coupon.discount_percent,
      discountAmount,
      description: coupon.description
    });
  } catch (err) {
    res.status(500).json({ error: 'Coupon validation failed.' });
  }
});

// Admin Coupon Management
app.get('/api/admin/coupons', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const coupons = await db.getAllCoupons();
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/coupons', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { code, discountPercent, minOrderAmount, description } = req.body || {};
    if (!code || !discountPercent) {
      return res.status(400).json({ error: 'Coupon code and discount percentage are required.' });
    }
    const coupon = await db.createCoupon({ code, discountPercent, minOrderAmount, description });
    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/coupons/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid coupon ID' });
  try {
    const updated = await db.updateCoupon(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Coupon not found.' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/coupons/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid coupon ID' });
  try {
    const ok = await db.deleteCoupon(id);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Orders, Checkout & Order Management
   ========================================================================== */
app.post('/api/orders', optionalAuth, async (req, res) => {
  const { customer, items, paymentMethod, couponCode } = req.body || {};

  if (!customer || !customer.name || !customer.email || !customer.phone) {
    return res.status(400).json({ error: 'Complete customer contact details are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customer.email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const line1 = customer.line1 || customer.address;
  const pincode = customer.pincode || customer.pin;
  if (!line1 || !customer.city || !customer.state || !pincode) {
    return res.status(400).json({ error: 'Full delivery shipping address is required.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your shopping bag contains no items.' });
  }

  try {
    // 1. Validate items and inventory stock
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const p = await db.getProductById(Number(item.id));
      if (!p) {
        return res.status(400).json({ error: `Creations with ID "${item.id}" is no longer in catalog.` });
      }
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      if (p.stock < qty) {
        return res.status(400).json({
          error: `Insufficient stock for "${p.name}". Only ${p.stock} piece(s) available In Workshop.`
        });
      }

      const itemTotal = p.price * qty;
      subtotal += itemTotal;
      validatedItems.push({
        id: p.id,
        name: p.name,
        price: p.price,
        qty,
        size: item.size || 'M',
        color: item.color || null,
        image: p.image,
        total: itemTotal
      });
    }

    // 2. Validate Coupon
    let discount = 0;
    const activeCoupon = couponCode || req.body.promo || (customer && customer.promo);
    if (activeCoupon) {
      const c = await db.getCouponByCode(String(activeCoupon).toUpperCase().trim());
      if (c && c.is_active && subtotal >= Number(c.min_order_amount)) {
        discount = Math.round((subtotal * c.discount_percent) / 100);
      }
    }

    // 3. Shipping logic: Complimentary over ₹3,000 net, otherwise ₹150
    const netForShipping = subtotal - discount;
    const shippingFee = (!subtotal || netForShipping >= 3000) ? 0 : 150;
    const grandTotal = Math.max(0, netForShipping + shippingFee);

    // 4. Generate Unique Order ID & Courier Tracking Number
    const orderNumber = 'SS' + Math.floor(1000000 + Math.random() * 9000000);
    const trackingNumber = 'IND-COUT-' + Math.floor(10000000 + Math.random() * 90000000);

    const shippingAddress = {
      recipient: customer.name,
      phone: customer.phone,
      line1,
      line2: customer.line2 || '',
      city: customer.city,
      state: customer.state,
      pincode
    };

    const userId = req.user ? req.user.id : null;

    // 5. Persist order & order items to PostgreSQL
    const order = await db.createOrder({
      id: orderNumber,
      userId,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      shippingAddress,
      subtotal,
      discount,
      couponCode: couponCode || null,
      shippingFee,
      total: grandTotal,
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: (paymentMethod === 'cod') ? 'pending' : 'paid',
      status: 'Confirmed',
      trackingNumber,
      items: validatedItems
    });

    // 6. Stock is already atomically decremented inside db.createOrder within the SQL transaction.

    // 7. If user is authenticated, automatically clear their server-side cart
    if (userId) {
      await db.clearUserCart(userId).catch(() => { });
    }

    // Log order placed and payment activities
    db.logCustomerActivity({
      userId,
      userName: customer.name,
      activityType: 'order_placed',
      description: `New commission Order #${order.id} placed by ${customer.name} (Total: ₹${grandTotal.toLocaleString('en-IN')})`,
      metadata: { orderId: order.id, total: grandTotal, paymentMethod }
    }).catch(() => { });

    db.logCustomerActivity({
      userId,
      userName: customer.name,
      activityType: 'payment',
      description: `Payment verified for Order #${order.id} via ${(paymentMethod || 'cod').toUpperCase()} (Status: ${(paymentMethod === 'cod') ? 'pending' : 'paid'})`,
      metadata: { orderId: order.id, paymentMethod, paymentStatus: (paymentMethod === 'cod') ? 'pending' : 'paid', total: grandTotal }
    }).catch(() => { });

    res.status(201).json({
      ok: true,
      message: 'Your order has been officially confirmed and commissioned at the atelier.',
      order: {
        id: order.id,
        trackingNumber: order.tracking_number,
        total: order.total,
        status: order.status,
        estimatedDelivery: order.estimated_delivery
      }
    });
  } catch (err) {
    console.error('[API] Order placement error:', err);
    res.status(500).json({ error: err.message || 'Could not process order.' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin All Orders Management
app.get('/api/admin/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Update Order Status
app.put('/api/orders/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const { status, trackingNumber } = req.body || {};
  if (!status) return res.status(400).json({ error: 'New status is required.' });

  try {
    const prevOrder = await db.getOrderById(req.params.id);
    if (!prevOrder) return res.status(404).json({ error: 'Order not found.' });

    const updated = await db.updateOrderStatus(req.params.id, status, { trackingNumber });
    if (!updated) return res.status(404).json({ error: 'Order not found.' });

    // Stock synchronization: If transitioning to Cancelled from non-cancelled, restore stock
    if (status === 'Cancelled' && prevOrder.status !== 'Cancelled') {
      if (prevOrder.items && prevOrder.items.length) {
        for (const item of prevOrder.items) {
          if (item.product_id) {
            await db.updateProductStock(item.product_id, item.quantity);
          }
        }
      }
    }

    // Payment sync: If delivering COD order, mark payment as paid
    if (status === 'Delivered' && (prevOrder.payment_status === 'pending' || !prevOrder.payment_status)) {
      await db.updateOrderPaymentStatus(req.params.id, 'paid');
    }

    db.logCustomerActivity({
      userId: req.user.id,
      userName: 'Atelier Master',
      activityType: status === 'Cancelled' ? 'cancellation' : 'order_status_update',
      description: `Order #${req.params.id} fulfillment status changed from "${prevOrder.status}" to "${status}"`,
      metadata: { orderId: req.params.id, previousStatus: prevOrder.status, newStatus: status }
    }).catch(() => { });

    res.json({ ok: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Update Order Payment Status
app.put('/api/orders/:id/payment', authenticateToken, requireAdmin, async (req, res) => {
  const { paymentStatus } = req.body || {};
  if (!paymentStatus) return res.status(400).json({ error: 'Payment status is required.' });

  try {
    const updated = await db.updateOrderPaymentStatus(req.params.id, paymentStatus);
    if (!updated) return res.status(404).json({ error: 'Order not found.' });

    db.logCustomerActivity({
      userId: req.user.id,
      userName: 'Atelier Master',
      activityType: 'payment_status_update',
      description: `Payment status for Order #${req.params.id} updated to "${paymentStatus}"`,
      metadata: { orderId: req.params.id, paymentStatus }
    }).catch(() => { });

    res.json({ ok: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer & Admin: Order Cancellation
app.post('/api/orders/:id/cancel', optionalAuth, async (req, res) => {
  const orderId = req.params.id;
  const { reason } = req.body || {};

  try {
    const order = await db.getOrderById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status !== 'Confirmed' && order.status !== 'In Workshop') {
      return res.status(400).json({
        error: `Order cannot be cancelled in status "${order.status}". Dispatched orders may be returned after delivery.`
      });
    }

    const updated = await db.updateOrderStatus(orderId, 'Cancelled', {
      cancelReason: reason || 'Cancelled by patron request'
    });

    db.logCustomerActivity({
      userId: req.user ? req.user.id : null,
      userName: req.user ? req.user.name : order.customer_name,
      activityType: 'cancellation',
      description: `Order #${orderId} cancelled: ${reason || 'Patron request'}. Stock restored to catalog.`,
      metadata: { orderId, reason }
    }).catch(() => { });

    // Restock items in PostgreSQL
    if (order.items && order.items.length) {
      for (const item of order.items) {
        if (item.product_id) {
          await db.updateProductStock(item.product_id, item.quantity);
        }
      }
    }

    res.json({ ok: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Order Return
app.post('/api/orders/:id/return', optionalAuth, async (req, res) => {
  const orderId = req.params.id;
  const { reason } = req.body || {};

  try {
    const order = await db.getOrderById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status !== 'Delivered') {
      return res.status(400).json({
        error: `Return requests are only eligible for delivered garments. Current status: ${order.status}`
      });
    }

    const updated = await db.updateOrderStatus(orderId, 'Return Requested', {
      returnReason: reason || 'Return initiated by patron'
    });

    db.logCustomerActivity({
      userId: req.user ? req.user.id : null,
      userName: req.user ? req.user.name : order.customer_name,
      activityType: 'return',
      description: `Return requested for Order #${orderId}: ${reason || 'Exchange requested'}. Courier pickup scheduled.`,
      metadata: { orderId, reason }
    }).catch(() => { });

    res.json({ ok: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Module 5: Customer Authentication, Profiles, Addresses & RBAC
   ========================================================================= */

// Public Registration: Strictly customer-only (Public admin registration disabled)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  // Security Check: Public admin registration is strictly disabled!
  if (role && String(role).toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Public registration for administrator privileges is forbidden.' });
  }

  try {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Force role to 'customer' for all public registrations
    const user = await db.createUser({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone || null,
      role: 'customer'
    });

    const token = generateToken(user);

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Authentication: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'No account found with this email address.' });
    }

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) {
      return res.status(401).json({ error: 'Incorrect password. Please verify your credentials.' });
    }

    const token = generateToken(user);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User profile not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const updated = await db.updateUserProfile(req.user.id, { name, phone });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Password Change
app.put('/api/auth/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  try {
    const user = await db.getUserByEmail(req.user.email);
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password does not match.' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.updateUserPassword(req.user.id, newHash);
    res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Saved Addresses
app.get('/api/user/addresses', authenticateToken, async (req, res) => {
  try {
    const addresses = await db.getUserAddresses(req.user.id);
    res.json(addresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/addresses', authenticateToken, async (req, res) => {
  try {
    const addr = await db.createUserAddress(req.user.id, req.body || {});
    res.status(201).json(addr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await db.deleteUserAddress(Number(req.params.id), req.user.id);
    res.json({ ok: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Order History
app.get('/api/user/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await db.getUserOrders(req.user.id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wishlist
app.get('/api/user/wishlist', authenticateToken, async (req, res) => {
  try {
    const list = await db.getUserWishlist(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/wishlist', authenticateToken, async (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'Product ID required.' });
  try {
    await db.addToWishlist(req.user.id, Number(productId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user/wishlist/:productId', authenticateToken, async (req, res) => {
  try {
    await db.removeFromWishlist(req.user.id, Number(req.params.productId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Administration (Admin Only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { role } = req.body || {};
  if (!role || !['customer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Valid role ("customer" or "admin") is required.' });
  }
  try {
    const updated = await db.updateUserRole(userId, role);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contact inquiry submission
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !message) {
    return res.status(400).json({ error: 'Valid name, email, and message are required.' });
  }
  res.json({ ok: true });
});

/* ==========================================================================
   Centralized Error Handling & 404 Route Handling
   ========================================================================== */

// 404 handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found.` });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Atelier Server Error]', err.stack || err.message || err);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error occurred.' : (err.message || 'Server error.')
  });
});

// Start application server & auto-initialize database
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
