const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateAdminToken, optionalAuth } = require('../middleware/auth');

router.get('/', productController.getProducts);
router.get('/:id', optionalAuth, productController.getProductById);

// Admin-only product mutation
router.post('/', authenticateAdminToken, productController.createProduct);
router.put('/:id', authenticateAdminToken, productController.updateProduct);
router.delete('/:id', authenticateAdminToken, productController.deleteProduct);

// Reviews & Views
router.get('/:id/reviews', productController.getReviews);
router.post('/:id/reviews', optionalAuth, productController.createReview);
router.post('/:id/view', optionalAuth, productController.recordView);

module.exports = router;

