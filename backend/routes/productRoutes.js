const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const adminController = require('../controllers/adminController');
const variantController = require('../controllers/variantController');
const { authenticateAdminToken, optionalAuth } = require('../middleware/auth');

router.get('/', productController.getProducts);
router.get('/:id', optionalAuth, productController.getProductById);

// Admin-only product mutation
router.post('/', authenticateAdminToken, productController.createProduct);
router.put('/:id/status', authenticateAdminToken, productController.setPublishStatus);
router.put('/:id/stock', authenticateAdminToken, adminController.updateProductStock);
router.put('/:id', authenticateAdminToken, productController.updateProduct);
router.delete('/:id', authenticateAdminToken, productController.deleteProduct);

// Reviews & Views
router.get('/:id/reviews', productController.getReviews);
router.post('/:id/reviews', optionalAuth, productController.createReview);
router.post('/:id/view', optionalAuth, productController.recordView);

// Product variant stock routes
router.get('/:id/variants', variantController.getVariants);
router.put('/:id/variants/bulk', authenticateAdminToken, variantController.bulkUpsertVariants);
router.put('/:id/variants/stock', authenticateAdminToken, variantController.updateVariantStock);
router.put('/:id/variants', authenticateAdminToken, variantController.upsertVariant);
router.delete('/:id/variants', authenticateAdminToken, variantController.deleteVariant);

module.exports = router;

