const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Public Auth Endpoints
router.post('/register', authController.customerRegister);
router.post('/login', authController.universalLogin);
router.post('/customer/login', authController.customerLogin);
router.post('/admin/login', authController.adminLogin);

// Protected Auth Endpoints
router.get('/me', authenticateToken, authController.getMe);
router.put('/profile', authenticateToken, authController.updateProfile);
router.put('/password', authenticateToken, authController.updatePassword);

module.exports = router;

