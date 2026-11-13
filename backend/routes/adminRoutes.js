const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const couponController = require('../controllers/couponController');
const { authenticateAdminToken } = require('../middleware/auth');

// All admin routes strictly require an authenticated Atelier Administrator token
router.use(authenticateAdminToken);

router.get('/analytics', adminController.getAnalytics);
router.get('/activities', adminController.getActivities);
router.get('/activity', adminController.getActivities);
router.get('/inventory', adminController.getInventory);
router.put('/products/:id/stock', adminController.updateProductStock);

router.get('/users', adminController.getAllUsers);
router.put('/users/:id/role', adminController.updateUserRole);

router.get('/orders', adminController.getAllOrders);
router.put('/orders/:id/status', adminController.updateOrderStatus);
router.put('/orders/:id/payment', adminController.updateOrderPaymentStatus);

router.get('/coupons', couponController.getAllCoupons);
router.post('/coupons', couponController.createCoupon);
router.put('/coupons/:id', couponController.updateCoupon);
router.delete('/coupons/:id', couponController.deleteCoupon);

/* Upgraded Business Management Routes */
router.get('/queries', adminController.getSupportQueries);
router.put('/queries/:id', adminController.updateSupportQuery);

router.get('/settings', adminController.getWebsiteSettings);
router.put('/settings/password', adminController.updateAdminPassword);
router.put('/settings/:key', adminController.updateWebsiteSetting);

router.get('/notifications', adminController.getAdminNotifications);
router.put('/notifications/read-all', adminController.markAllNotificationsRead);
router.delete('/notifications', adminController.clearNotifications);
router.delete('/notifications/:id', adminController.clearNotifications);

router.get('/users/:id/orders', adminController.getUserOrdersAdmin);
router.get('/health', adminController.getSystemHealth);

module.exports = router;
