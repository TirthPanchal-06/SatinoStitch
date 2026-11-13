const express = require('express');
const router = express.Router();
const customerNotificationController = require('../controllers/customerNotificationController');
const { optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, customerNotificationController.getNotifications);
router.put('/read-all', optionalAuth, customerNotificationController.markAllRead);
router.put('/:id/read', optionalAuth, customerNotificationController.markRead);
router.delete('/', optionalAuth, customerNotificationController.clearAll);
router.post('/back-in-stock-subscribe', optionalAuth, customerNotificationController.subscribeBackInStock);

module.exports = router;
