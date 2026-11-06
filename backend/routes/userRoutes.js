const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const orderController = require('../controllers/orderController');
const wishlistController = require('../controllers/wishlistController');
const { authenticateCustomerToken, authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// User Addresses
router.get('/addresses', async (req, res) => {
  try {
    const list = await userModel.getUserAddresses(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve saved addresses.' });
  }
});

router.post('/addresses', async (req, res) => {
  const { recipientName, phone, addressLine1, city, state, pincode } = req.body || {};
  if (!recipientName || !phone || !addressLine1 || !city || !state || !pincode) {
    return res.status(400).json({ error: 'All address fields are required.' });
  }
  try {
    const addr = await userModel.createUserAddress(req.user.id, req.body);
    res.status(201).json(addr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/addresses/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid address ID' });
  try {
    const ok = await userModel.deleteUserAddress(req.user.id, id);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Orders
router.get('/orders', orderController.getUserOrders);

// User Wishlist
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist', wishlistController.addToWishlist);
router.delete('/wishlist/:productId', wishlistController.removeFromWishlist);

module.exports = router;

