const express = require('express');
const router = express.Router();
const miscController = require('../controllers/miscController');
const categoryController = require('../controllers/categoryController');
const orderController = require('../controllers/orderController');
const cartController = require('../controllers/cartController');
const productController = require('../controllers/productController');
const upload = require('../middleware/upload');
const { authenticateAdminToken, optionalAuth } = require('../middleware/auth');

router.get('/health', miscController.getHealth);
router.get('/banners', miscController.getBanners);
router.get('/collections', miscController.getCollections);
router.post('/newsletter', miscController.subscribeNewsletter);
router.post('/contact', miscController.submitContact);

router.get('/types', categoryController.getTypes);
router.get('/payment/config', orderController.getPaymentConfig);

router.post('/upload', authenticateAdminToken, upload.any(), productController.uploadImage);
router.post('/activity/cart', optionalAuth, cartController.trackCartActivity);

module.exports = router;

