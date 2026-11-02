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

// Setup Multer for Image Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'frontend', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'garment-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
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
   Health Check
   ========================================================================== */
app.get('/api/health', async (req, res) => {
  const dbHealth = await db.testConnection();
  const isHealthy = dbHealth.connected;

  let counts = { products: 0, categories: 0, users: 0, orders: 0 };
  if (isHealthy) {
    try {
      const pCount = await db.query('SELECT COUNT(*)::int AS count FROM products;');
      const cCount = await db.query('SELECT COUNT(*)::int AS count FROM categories;');
      const uCount = await db.query('SELECT COUNT(*)::int AS count FROM users;');
      const oCount = await db.query('SELECT COUNT(*)::int AS count FROM orders;');
      counts = {
        products: pCount.rows[0].count,
        categories: cCount.rows[0].count,
        users: uCount.rows[0].count,
        orders: oCount.rows[0].count
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
      subtitle: 'Pure Banarasi zari silk sarees, hand-embroidered bridal lehengas, and sand-washed tailoring.',
      image: 'images/hero-banner.jpg',
      ctaText: 'Explore Collection',
      ctaLink: 'shop.html?col=wedding'
    },
    {
      id: 'wedding-edit',
      badge: 'The Trousseau Edit',
      title: 'Regal Banarasi & Zardozi Craft',
      subtitle: 'Heirloom weaves and 16-kali flared lehengas crafted by master Varanasi weavers.',
      image: 'images/wedding-edit.jpg',
      ctaText: 'View Bridal Creations',
      ctaLink: 'shop.html?col=wedding'
    },
    {
      id: 'sartorial-pret',
      badge: 'Contemporary Pret',
      title: 'Sartorial Linen & Fluid Satin',
      subtitle: 'Italian peaked lapels, sand houndstooth checks, and effortless day-to-evening dresses.',
      image: 'images/p9.jpg',
      ctaText: 'Discover Tailoring',
      ctaLink: 'shop.html?cat=western'
    }
  ]);
});

app.get('/api/collections', async (req, res) => {
  const collections = [
    {
      key: 'wedding',
      name: 'Wedding Edit',
      tagline: 'The Royal Trousseau',
      text: 'Royal Banarasi silk sarees, bridal lehengas and gold zari sets.',
      img: 'images/wedding-edit.jpg'
    },
    {
      key: 'festive',
      name: 'Festive Wear',
      tagline: 'Artisanal Celebrations',
      text: 'Heritage bandhani, lustrous satin and antique gold craft.',
      img: 'images/p4.jpg'
    },
    {
      key: 'everyday',
      name: 'Everyday Cotton',
      tagline: 'Pure & Breathable',
      text: 'Breathable Mulmul hand-block prints and pure Chanderi kurtas.',
      img: 'images/p5.jpg'
    },
    {
      key: 'work',
      name: 'Work Wardrobe',
      tagline: 'Sartorial Elegance',
      text: 'Sartorial linen check blazers and pleated crepe tailoring.',
      img: 'images/p9.jpg'
    }
  ];

  try {
    for (const c of collections) {
      const countRes = await db.query('SELECT COUNT(*)::int AS count FROM products WHERE col = $1;', [c.key]);
      c.count = countRes.rows[0].count;
    }
  } catch {
    collections.forEach(c => c.count = 3);
  }

  res.json(collections);
});

app.post('/api/newsletter', (req, res) => {
  const { email } = req.body;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email address required.' });
  }
  res.json({ ok: true, message: 'Welcome to the SATINOSTITCH VIP Atelier private list.' });
});

/* ==========================================================================
   Module 2: Products & Catalogue (CRUD & Image Uploads)
   ========================================================================== */
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

app.get('/api/types', async (req, res) => {
  try {
    const types = await db.getTypes();
    res.json(types);
  } catch {
    const fallbackTypes = [...new Set(loadFallbackProducts().map(p => p.type))].sort();
    res.json(fallbackTypes);
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await db.getProducts(req.query);
    res.json(products);
  } catch (err) {
    console.warn('[PostgreSQL] Product fetch fallback:', err.message);
    const { cat, col, type, q, search, max, sort } = req.query;
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

app.get('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const product = await db.getProductById(id);
    if (product) return res.json(product);
  } catch (err) {
    const fallback = loadFallbackProducts().find(p => p.id === id);
    if (fallback) return res.json(fallback);
  }

  res.status(404).json({ error: 'Product not found' });
});

// Product CRUD: Create Product (Admin / Atelier)
app.post('/api/products', optionalAuth, async (req, res) => {
  try {
    const { name, cat, type, col, price, old, fabric, desc, image, stock, c1, c2, pat, tag, sizes, colors } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required.' });
    }
    const newProduct = await db.createProduct({
      name,
      cat: cat || 'ethnic',
      type: type || 'Suit sets',
      col: col || 'everyday',
      price: Number(price),
      old: old ? Number(old) : null,
      fabric,
      desc,
      image: image || 'images/p1.jpg',
      stock: stock ? Number(stock) : 10,
      c1: c1 || '#5B1835',
      c2: c2 || '#C6A15B',
      pat: pat || 'plain',
      tag: tag || 'New',
      sizes: sizes || ['XS', 'S', 'M', 'L', 'XL'],
      colors: colors || [{ name: 'Primary Shade', hex: c1 || '#5B1835' }]
    });
    res.status(201).json(newProduct);
  } catch (err) {
    console.error('[API] Create product error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Product CRUD: Update Product
app.put('/api/products/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const updated = await db.updateProduct(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('[API] Update product error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Product CRUD: Delete Product
app.delete('/api/products/:id', optionalAuth, async (req, res) => {
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

// Image Upload Endpoint (Multer)
app.post('/api/upload', upload.single('image'), (req, res) => {
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

  const { name, rating, title, comment } = req.body;
  const numRating = Number(rating);
  if (!comment || isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Please provide a valid rating (1-5) and feedback comment.' });
  }

  const userName = req.user ? req.user.name : (name || 'Verified Patron');
  const userId = req.user ? req.user.id : null;

  try {
    const review = await db.createProductReview({
      productId: id,
      userId,
      userName,
      rating: numRating,
      title: title || 'Patron Review',
      comment
    });
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Module 4: Cart, Coupons & Checkout
   ========================================================================== */
app.get('/api/coupons/:code', async (req, res) => {
  const code = req.params.code;
  try {
    const coupon = await db.getCouponByCode(code);
    if (!coupon) {
      return res.status(404).json({ error: 'Invalid or expired promotional code.' });
    }
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ error: 'Coupon verification error.' });
  }
});

// Order Placement API
app.post('/api/orders', optionalAuth, async (req, res) => {
  const { customer, items, promo, shippingAddress, paymentMethod } = req.body || {};

  if (!customer || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Customer details and bag items are required.' });
  }

  try {
    // 1. Fetch catalog items to verify live prices and stock
    let catalog = await db.getProducts();
    if (!catalog || !catalog.length) catalog = loadFallbackProducts();

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const match = catalog.find(p => p.id === Number(item.id));
      if (!match) {
        return res.status(400).json({ error: `Product ID ${item.id} is no longer available in our active catalog.` });
      }
      if (match.stock < (item.qty || 1)) {
        return res.status(400).json({
          error: `Insufficient stock for "${match.name}". Only ${match.stock} available.`
        });
      }
      const itemPrice = match.price;
      const qty = item.qty || item.quantity || 1;
      subtotal += itemPrice * qty;

      validatedItems.push({
        id: match.id,
        name: match.name,
        image: match.image,
        price: itemPrice,
        size: item.size || 'M',
        color: item.color || (match.colors?.[0]?.name) || 'Selected Shade',
        qty
      });
    }

    // 2. Coupon discount verification
    let discount = 0;
    let couponCode = null;
    const code = (promo || '').trim().toUpperCase();
    if (code) {
      const coupon = await db.getCouponByCode(code);
      if (coupon && subtotal >= Number(coupon.min_order_amount || 0)) {
        discount = Math.round((subtotal * coupon.discount_percent) / 100);
        couponCode = coupon.code;
      }
    }

    // 3. Shipping fee calculation (Free above ₹3000)
    const netSubtotal = subtotal - discount;
    const shippingFee = netSubtotal >= 3000 || netSubtotal === 0 ? 0 : 150;
    const total = netSubtotal + shippingFee;

    // 4. Create Order in PostgreSQL
    const orderData = {
      userId: req.user ? req.user.id : null,
      customerName: customer.name || (req.user ? req.user.name : 'Valued Patron'),
      customerEmail: customer.email || (req.user ? req.user.email : 'patron@example.com'),
      customerPhone: customer.phone || null,
      shippingAddress: shippingAddress || {
        recipient: customer.name,
        line1: customer.address || customer.street || 'Address on record',
        city: customer.city || 'City',
        state: customer.state || 'State',
        pincode: customer.pincode || customer.zip || '000000',
        phone: customer.phone
      },
      subtotal,
      discount,
      couponCode,
      shippingFee,
      total,
      paymentMethod: paymentMethod || customer.payment || 'cod',
      paymentStatus: (paymentMethod === 'card' || paymentMethod === 'upi') ? 'paid' : 'pending'
    };

    const savedOrder = await db.createOrder(orderData, validatedItems);
    res.status(201).json({
      id: savedOrder.id,
      trackingNumber: savedOrder.tracking_number,
      total: Number(savedOrder.total),
      subtotal: Number(savedOrder.subtotal),
      discount: Number(savedOrder.discount),
      shippingFee: Number(savedOrder.shipping_fee),
      status: savedOrder.status,
      estimatedDelivery: savedOrder.estimated_delivery
    });
  } catch (err) {
    console.error('[API] /api/orders error:', err);
    res.status(500).json({ error: 'Order placement failed: ' + err.message });
  }
});

// Single Order & Tracking Lookup
app.get('/api/orders/:id', optionalAuth, async (req, res) => {
  const orderId = req.params.id;
  try {
    const order = await db.getOrderById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Module 5: Customer Account, Authentication, Profiles, Addresses & Orders
   ========================================================================== */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.createUser({ name, email, passwordHash, phone });
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

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
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
    const { name, phone } = req.body;
    const updated = await db.updateUserProfile(req.user.id, { name, phone });
    res.json(updated);
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
    const addr = await db.createUserAddress(req.user.id, req.body);
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

// Customer Order History & Tracking
app.get('/api/user/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await db.getUserOrders(req.user.id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Order Actions: Cancellation
app.post('/api/orders/:id/cancel', optionalAuth, async (req, res) => {
  const orderId = req.params.id;
  const { reason } = req.body;

  try {
    const order = await db.getOrderById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status !== 'Confirmed' && order.status !== 'In Atelier') {
      return res.status(400).json({
        error: `Order cannot be cancelled in status "${order.status}". Dispatched orders may be returned after delivery.`
      });
    }

    const updated = await db.updateOrderStatus(orderId, 'Cancelled', {
      cancelReason: reason || 'Cancelled by patron request'
    });

    // Restock items
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

// Order Actions: Return Request
app.post('/api/orders/:id/return', optionalAuth, async (req, res) => {
  const orderId = req.params.id;
  const { reason } = req.body;

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

    res.json({ ok: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Wishlist Sync with DB
app.get('/api/user/wishlist', authenticateToken, async (req, res) => {
  try {
    const list = await db.getUserWishlist(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/wishlist', authenticateToken, async (req, res) => {
  const { productId } = req.body;
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

// Contact inquiry submission
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !message) {
    return res.status(400).json({ error: 'Valid name, email, and message are required.' });
  }
  res.json({ ok: true });
});

// 404 handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
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
