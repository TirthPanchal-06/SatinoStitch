const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticateCustomerToken, authenticateToken } = require('../middleware/auth');

// Support customer token (or general token) for cart operations
router.use(authenticateToken);

router.get('/', cartController.getCart);
router.post('/', cartController.addToCart);
router.put('/:id', cartController.updateCartItem);
router.delete('/:id', cartController.removeCartItem);
router.delete('/', cartController.clearCart);
router.post('/sync', cartController.syncCart);

module.exports = router;

