const express = require('express');
const router = express.Router();
const miscController = require('../controllers/miscController');
const categoryController = require('../controllers/categoryController');
const orderController = require('../controllers/orderController');
const cartController = require('../controllers/cartController');
const productController = require('../controllers/productController');
const upload = require('../middleware/upload');
const { authenticateAdminToken, optionalAuth } = require('../middleware/auth');
const { contactLimiter } = require('../middleware/rateLimiter');

router.get('/health', miscController.getHealth);
router.get('/banners', miscController.getBanners);
router.get('/collections', miscController.getCollections);
router.get('/settings', miscController.getPublicSettings);
router.post('/newsletter', contactLimiter, miscController.subscribeNewsletter);
router.post('/newsletter/subscribe', contactLimiter, miscController.subscribeNewsletter);
router.post('/contact', contactLimiter, miscController.submitContact);

router.get('/types', categoryController.getTypes);
router.get('/payment/config', orderController.getPaymentConfig);

router.post('/upload', authenticateAdminToken, upload.any(), productController.uploadImage);
router.post('/activity/cart', optionalAuth, cartController.trackCartActivity);

module.exports = router;

