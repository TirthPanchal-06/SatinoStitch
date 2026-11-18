const express = require('express');
const router = express.Router();
const gstController = require('../controllers/gstController');

router.get('/config', gstController.getPublicGstConfig);
router.post('/calculate', gstController.previewGstCalculation);

module.exports = router;
