const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { optionalAuth, authenticateCustomerToken } = require('../middleware/auth');

// Public / Personalized Recommendations (takes optional user token or guest session)
router.get('/outfits', optionalAuth, recommendationController.getOutfits);
router.get('/product/:id/pairings', optionalAuth, recommendationController.getProductPairings);

// Patron Preferences
router.get('/preferences', optionalAuth, recommendationController.getPreferences);
router.put('/preferences', authenticateCustomerToken, recommendationController.updatePreferences);

module.exports = router;

