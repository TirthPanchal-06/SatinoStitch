const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Public Auth Endpoints with Strict Brute-Force Rate Limiting
router.post('/register', authLimiter, authController.customerRegister);
router.post('/login', authLimiter, authController.universalLogin);
router.post('/customer/login', authLimiter, authController.customerLogin);
router.post('/admin/login', authLimiter, authController.adminLogin);

// Protected Auth Endpoints
router.get('/me', authenticateToken, authController.getMe);
router.put('/profile', authenticateToken, authController.updateProfile);
router.put('/password', authenticateToken, authController.updatePassword);

module.exports = router;

