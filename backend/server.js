/**
 * SATINOSTITCH — Haute Couture & Sartorial Western Pret
 * Modular Express Server Architecture
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const { testConnection } = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { securityHeaders, webAttackShield } = require('./middleware/security');
const { globalApiLimiter } = require('./middleware/rateLimiter');

// Modular Route Handlers
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const couponRoutes = require('./routes/couponRoutes');
const userRoutes = require('./routes/userRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const miscRoutes = require('./routes/miscRoutes');

const app = express();

/* ---------- Security & Hardening Middlewares ---------- */
// 1. Enterprise Security Headers (CSP, HSTS, XSS, FrameGuard)
app.use(securityHeaders);

/* ---------- Core Request Parsers ---------- */
// Guard against ReDoS and large payload exhaustion (2MB safe limit)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Ensure frontend/uploads folder exists
const uploadsPath = path.join(__dirname, '..', 'frontend', 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Serve static frontend assets & uploaded garment media
app.use('/uploads', express.static(uploadsPath));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

/* ---------- API Attack Shield & Rate Limiting ---------- */
// Global rate limiting & web attack payload inspection on all /api endpoints
app.use('/api', globalApiLimiter);
app.use('/api', webAttackShield);

/* ---------- API Routes Mounting ---------- */
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/user', userRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', miscRoutes);

/* ---------- Error Handling ---------- */
app.all('/api/*', notFoundHandler);
app.use(errorHandler);

/* ---------- Server Lifecycle ---------- */
const PORT = env.PORT;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`◇ SATINOSTITCH Atelier Server running at http://localhost:${PORT}`);
    console.log(`◇ Mode: ${env.NODE_ENV} | Port: ${PORT}`);
    console.log(`======================================================`);

    const health = await testConnection();
    if (health.success) {
      console.log(`✓ PostgreSQL Connected: "${health.database}" as user "${health.user}"`);
    } else {
      console.error(`✗ PostgreSQL Connection Failure:`, health.error);
    }
  });
}

module.exports = app;
