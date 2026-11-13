const recommendationModel = require('../models/recommendationModel');

async function getOutfits(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Optional client history passed as JSON string or comma-separated IDs
    let clientHistory = [];
    if (req.query.history) {
      try {
        clientHistory = JSON.parse(req.query.history);
      } catch {
        clientHistory = req.query.history.split(',').map(Number).filter(Boolean);
      }
    }

    // Optional dynamic preferences passed in query
    let preferences = null;
    if (req.query.prefs) {
      try {
        preferences = JSON.parse(req.query.prefs);
      } catch (e) { }
    }

    const mood = req.query.mood || null;
    const limit = Math.min(10, parseInt(req.query.limit || '4', 10));

    const outfits = await recommendationModel.generateOutfitRecommendations({
      userId,
      ip,
      clientHistory,
      preferences,
      mood,
      limit
    });

    const browsingProfile = await recommendationModel.getUserBrowsingProfile(userId, ip, clientHistory);
    const purchaseProfile = await recommendationModel.getUserPurchaseProfile(userId);
    const userPrefs = await recommendationModel.getUserPreferences(userId);

    res.json({
      outfits,
      profile: {
        isLoggedIn: Boolean(userId),
        viewCount: browsingProfile.viewCount,
        orderCount: purchaseProfile.orderCount,
        topOccasions: browsingProfile.topOccasions,
        topCategories: browsingProfile.topCategories,
        recentPurchases: purchaseProfile.recentPurchases,
        preferences: preferences || userPrefs
      }
    });
  } catch (err) {
    console.error('[Recommendation Controller] getOutfits Error:', err);
    res.status(500).json({ error: 'Failed to generate tailored outfit recommendations.' });
  }
}

async function getProductPairings(req, res) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Valid Product ID is required.' });

    const pairings = await recommendationModel.getProductPairings(id);
    if (!pairings) return res.status(404).json({ error: 'Garment not found.' });

    res.json(pairings);
  } catch (err) {
    console.error('[Recommendation Controller] getProductPairings Error:', err);
    res.status(500).json({ error: 'Failed to calculate complementary pairings.' });
  }
}

async function getPreferences(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const prefs = await recommendationModel.getUserPreferences(userId);
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updatePreferences(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to save persistent preferences.' });
    }
    const updated = await recommendationModel.saveUserPreferences(userId, req.body || {});
    res.json({ message: 'Style preferences updated successfully.', preferences: updated });
  } catch (err) {
    console.error('[Recommendation Controller] updatePreferences Error:', err);
    res.status(500).json({ error: 'Failed to save style preferences.' });
  }
}

module.exports = {
  getOutfits,
  getProductPairings,
  getPreferences,
  updatePreferences
};

