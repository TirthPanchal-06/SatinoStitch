const orderModel = require('../models/orderModel');
const productModel = require('../models/productModel');
const couponModel = require('../models/couponModel');
const cartModel = require('../models/cartModel');
const activityModel = require('../models/activityModel');
const adminUpgradeModel = require('../models/adminUpgradeModel');
const customerNotificationModel = require('../models/customerNotificationModel');
const { evaluateOrderFraud } = require('../services/fraudDetectionService');
const { verifyRazorpaySignature } = require('../services/paymentVerificationService');
const { getClientIp } = require('../middleware/rateLimiter');
const env = require('../config/env');

async function getPaymentConfig(req, res) {
  res.json({
    razorpayKeyId: env.RAZORPAY_KEY_ID,
    upiVpa: env.UPI_VPA,
    merchantName: env.MERCHANT_NAME
  });
}

async function createOrder(req, res) {
  const { customer, items, paymentMethod, couponCode, paymentStatus, paymentId } = req.body || {};

  if (!customer || !customer.name || !customer.email || !customer.phone) {
    return res.status(400).json({ error: 'Complete customer contact details are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customer.email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const line1 = (customer.line1 || customer.address || customer.street || (req.body.shippingAddress && (req.body.shippingAddress.line1 || req.body.shippingAddress.address || req.body.shippingAddress.addressLine1)) || '').trim();
  const pincode = (customer.pincode || customer.pin || customer.postalCode || (req.body.shippingAddress && (req.body.shippingAddress.pincode || req.body.shippingAddress.pin || req.body.shippingAddress.postalCode)) || '').trim();
  const city = (customer.city || (req.body.shippingAddress && req.body.shippingAddress.city) || '').trim();
  const state = (customer.state || (req.body.shippingAddress && req.body.shippingAddress.state) || 'Gujarat').trim();

  if (!line1 || !city || !pincode) {
    return res.status(400).json({ error: 'Full delivery shipping address (address, city, and PIN code) is required.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your shopping bag contains no items.' });
  }

  try {
    // 1. Validate items and inventory stock
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const p = await productModel.getProductById(Number(item.id || item.productId));
      if (!p) {
        return res.status(400).json({ error: `Creation with ID "${item.id || item.productId}" is no longer in catalog.` });
      }
      const qty = Math.max(1, parseInt(item.qty || item.quantity || 1, 10));
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
      const c = await couponModel.getCouponByCode(String(activeCoupon).toUpperCase().trim());
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
      line2: customer.line2 || (req.body.shippingAddress && req.body.shippingAddress.line2) || '',
      city,
      state,
      pincode
    };

    const userId = req.user ? req.user.id : null;
    const clientIp = getClientIp(req);
    const resolvedPaymentMethod = paymentMethod || 'cod';

    // Verify cryptographic payment signature if paying by card/Razorpay
    if (resolvedPaymentMethod === 'card' && (req.body.razorpayPaymentId || req.body.paymentId)) {
      const payId = req.body.razorpayPaymentId || req.body.paymentId;
      const rzpCheck = verifyRazorpaySignature({
        razorpayOrderId: req.body.razorpayOrderId || req.body.orderId,
        razorpayPaymentId: payId,
        razorpaySignature: req.body.razorpaySignature,
        clientIp
      });

      if (!rzpCheck.isValid) {
        return res.status(400).json({
          error: rzpCheck.error || 'Payment signature verification failed. Transaction rejected.'
        });
      }
    }

    const resolvedPaymentStatus = (resolvedPaymentMethod === 'cod')
      ? 'pending'
      : (paymentStatus || (req.body && req.body.paymentStatus) || 'paid');

    // 5. Run Fraud & Risk Scoring Engine
    const fraudResult = await evaluateOrderFraud({
      customer,
      items: validatedItems,
      total: grandTotal,
      paymentMethod: resolvedPaymentMethod,
      paymentId: paymentId || req.body.razorpayPaymentId || null,
      clientIp
    });

    // 6. Persist order & order items to PostgreSQL
    const order = await orderModel.createOrder({
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
      paymentMethod: resolvedPaymentMethod,
      paymentStatus: resolvedPaymentStatus,
      status: fraudResult.riskLevel === 'high' ? 'Under Verification' : 'Confirmed',
      trackingNumber,
      paymentId: paymentId || req.body.razorpayPaymentId || null,
      razorpayOrderId: req.body.razorpayOrderId || null,
      razorpayPaymentId: req.body.razorpayPaymentId || null,
      razorpaySignature: req.body.razorpaySignature || null,
      fraudScore: fraudResult.score,
      fraudStatus: fraudResult.fraudStatus,
      fraudFlags: fraudResult.flags,
      clientIp,
      riskLevel: fraudResult.riskLevel,
      items: validatedItems
    });

    // 7. Clear user's server cart if authenticated
    if (userId) {
      await cartModel.clearUserCart(userId).catch(() => { });
    }

    // 8. Log activity
    activityModel.logCustomerActivity({
      userId,
      userName: customer.name,
      activityType: 'order_placed',
      description: `New commission Order #${order.id} placed by ${customer.name} (Total: ₹${grandTotal.toLocaleString('en-IN')}, Risk: ${fraudResult.riskLevel.toUpperCase()})`,
      metadata: { orderId: order.id, total: grandTotal, paymentMethod: resolvedPaymentMethod, riskLevel: fraudResult.riskLevel }
    }).catch(() => { });

    // High Risk Fraud Alert for Atelier Administration
    if (fraudResult.riskLevel === 'high') {
      adminUpgradeModel.createAdminNotification({
        type: 'alert',
        title: `Security Alert: High-Risk Order #${order.id}`,
        message: `Fraud score ${fraudResult.score}/100. Anomalies detected: ${fraudResult.flags.join('; ')}`,
        link: 'admin.html?tab=orders'
      }).catch(() => {});
    }

    // Customer Smart Notification: Order Confirmation
    customerNotificationModel.createNotification({
      userId: userId || null,
      type: 'order_confirmation',
      title: `Haute Couture Order Confirmed (#${order.id})`,
      message: `Commission for ${customer.name} reserved for ₹${grandTotal.toLocaleString('en-IN')}. Master atelier artisan assigned for precision stitching & packaging.`,
      badge: '📦 Order Confirmed',
      icon: 'package',
      image: validatedItems[0]?.image || 'images/emblem.png',
      link: `account.html?tab=orders&id=${order.id}`,
      metadata: { orderId: order.id, total: grandTotal, status: 'Confirmed' }
    }).catch(() => { });

    // Real-time admin notification
    adminUpgradeModel.createAdminNotification({
      type: 'order',
      title: `New Order #${order.id}`,
      message: `${customer.name} placed order for ₹${grandTotal.toLocaleString('en-IN')} via ${resolvedPaymentMethod.toUpperCase()} (${validatedItems.length} items)`,
      link: `admin.html?tab=admin-orders&order=${order.id}`
    }).catch(() => { });

    // Check for stock alerts
    for (const item of validatedItems) {
      productModel.getProductById(Number(item.id)).then(pCheck => {
        if (pCheck && pCheck.stock <= 3) {
          adminUpgradeModel.createAdminNotification({
            type: 'stock',
            title: `Low Stock: ${pCheck.name}`,
            message: `Only ${pCheck.stock} units remaining in inventory. Restock recommended.`,
            link: 'admin.html?tab=inventory'
          }).catch(() => { });
        }
      }).catch(() => { });
    }

    activityModel.logCustomerActivity({
      userId,
      userName: customer.name,
      activityType: 'payment',
      description: `Payment recorded for Order #${order.id} via ${resolvedPaymentMethod.toUpperCase()} (Status: ${resolvedPaymentStatus})`,
      metadata: { orderId: order.id, paymentMethod: resolvedPaymentMethod, paymentStatus: resolvedPaymentStatus, paymentId: paymentId || null, total: grandTotal }
    }).catch(() => { });

    res.status(201).json({
      ok: true,
      message: 'Your order has been officially confirmed and commissioned at the atelier.',
      id: order.id,
      trackingNumber: order.tracking_number,
      total: order.total,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      order: {
        id: order.id,
        trackingNumber: order.tracking_number,
        total: order.total,
        status: order.status,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        fraudScore: order.fraud_score,
        fraud_score: order.fraud_score,
        riskLevel: order.risk_level,
        risk_level: order.risk_level,
        fraudStatus: order.fraud_status,
        estimatedDelivery: order.estimated_delivery
      }
    });
  } catch (err) {
    console.error('[Create Order Error]:', err);
    res.status(500).json({ error: err.message || 'Could not process order.' });
  }
}

async function getOrderById(req, res) {
  const id = req.params.id;
  try {
    const order = await orderModel.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found in atelier manifests.' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUserOrders(req, res) {
  try {
    const orders = await orderModel.getUserOrders(req.user.id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve patron commissions.' });
  }
}

async function cancelOrder(req, res) {
  const id = req.params.id;
  const { reason } = req.body || {};

  try {
    const order = await orderModel.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status === 'Cancelled') {
      return res.status(400).json({ error: 'Order has already been cancelled.' });
    }
    if (order.status === 'Delivered') {
      return res.status(400).json({ error: 'Delivered orders cannot be cancelled. Please initiate a return instead.' });
    }

    const updated = await orderModel.updateOrderStatus(
      id,
      'Cancelled',
      null,
      reason || 'Cancelled by Patron',
      null
    );

    // Restock items
    if (Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item.product_id) {
          await productModel.updateProductStock(item.product_id, item.quantity).catch(() => { });
        }
      }
    }

    activityModel.logCustomerActivity({
      userId: req.user ? req.user.id : order.user_id,
      userName: req.user ? req.user.name : order.customer_name,
      activityType: 'order_cancelled',
      description: `Order #${id} was cancelled. Reason: ${reason || 'Not specified'}`,
      metadata: { orderId: id, reason }
    }).catch(() => { });

    res.json({ message: `Order #${id} has been successfully cancelled.`, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function returnOrder(req, res) {
  const id = req.params.id;
  const { reason } = req.body || {};

  try {
    const order = await orderModel.getOrderById(id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status !== 'Delivered') {
      return res.status(400).json({ error: 'Returns can only be requested for delivered orders.' });
    }

    const updated = await orderModel.updateOrderStatus(
      id,
      'Returned',
      null,
      null,
      reason || 'Return requested by Patron'
    );

    activityModel.logCustomerActivity({
      userId: req.user ? req.user.id : order.user_id,
      userName: req.user ? req.user.name : order.customer_name,
      activityType: 'order_returned',
      description: `Return requested for Order #${id}. Reason: ${reason || 'Not specified'}`,
      metadata: { orderId: id, reason }
    }).catch(() => { });

    res.json({ message: `Return request submitted for Order #${id}. Courier pickup will be scheduled.`, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function verifyPayment(req, res) {
  const razorpayOrderId = req.body?.razorpayOrderId || req.body?.razorpay_order_id;
  const razorpayPaymentId = req.body?.razorpayPaymentId || req.body?.razorpay_payment_id;
  const razorpaySignature = req.body?.razorpaySignature || req.body?.razorpay_signature;
  const orderId = req.body?.orderId || req.body?.order_id;
  const clientIp = getClientIp(req);

  const verification = verifyRazorpaySignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    clientIp
  });

  if (!verification.isValid) {
    return res.status(400).json({
      error: verification.error || 'Payment signature verification failed. Potential tampering detected.',
      verified: false
    });
  }

  if (orderId) {
    await orderModel.updateOrderPaymentStatus(orderId, 'paid').catch(() => {});
  }

  res.json({
    success: true,
    verified: true,
    message: 'Payment cryptographically verified.',
    verification
  });
}

module.exports = {
  getPaymentConfig,
  createOrder,
  verifyPayment,
  getOrderById,
  getUserOrders,
  cancelOrder,
  returnOrder
};

