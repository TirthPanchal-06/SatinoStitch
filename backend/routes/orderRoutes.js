const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const adminController = require('../controllers/adminController');
const { optionalAuth, authenticateAdminToken } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/rateLimiter');

router.post('/', checkoutLimiter, optionalAuth, orderController.createOrder);
router.post('/verify-payment', checkoutLimiter, orderController.verifyPayment);
router.get('/:id', orderController.getOrderById);
router.post('/:id/cancel', optionalAuth, orderController.cancelOrder);
router.post('/:id/return', optionalAuth, orderController.returnOrder);

// Status and payment fulfillment routes (supported under both /api/orders and /api/admin/orders)
router.put('/:id/status', authenticateAdminToken, adminController.updateOrderStatus);
router.put('/:id/payment', authenticateAdminToken, adminController.updateOrderPaymentStatus);

module.exports = router;

