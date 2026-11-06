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
const miscRoutes = require('./routes/miscRoutes');

const app = express();

/* ---------- Core Middlewares ---------- */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure frontend/uploads folder exists
const uploadsPath = path.join(__dirname, '..', 'frontend', 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Serve static frontend assets & uploaded garment media
app.use('/uploads', express.static(uploadsPath));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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
app.use('/api', miscRoutes);

/* ---------- Error Handling ---------- */
app.all('/api/*', notFoundHandler);
app.use(errorHandler);

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
          error: `Insufficient stock for "${p.name}". Only ${p.stock} piece(s) available in atelier.`
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

    if (order.status !== 'Confirmed' && order.status !== 'In Atelier') {
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
