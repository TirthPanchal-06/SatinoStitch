const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { authenticateCustomerToken } = require('../middleware/auth');

// Customer Return Management routes (strictly authenticated customer patron sessions)
router.use(authenticateCustomerToken);

router.get('/eligible', returnController.getEligibleOrders);
router.get('/my', returnController.getMyReturns);
router.post('/', returnController.submitReturnRequest);

module.exports = router;
