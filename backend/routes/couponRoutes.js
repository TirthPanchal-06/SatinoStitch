const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');

router.get('/:code', couponController.getCoupon);
router.get('/validate/:code', couponController.validateCoupon);

module.exports = router;

