const wishlistModel = require('../models/wishlistModel');
const activityModel = require('../models/activityModel');

async function getWishlist(req, res) {
  try {
    const list = await wishlistModel.getUserWishlist(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve wishlist.' });
  }
}

async function addToWishlist(req, res) {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'Product ID is required.' });

  try {
    const entry = await wishlistModel.addToWishlist(req.user.id, productId);

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'wishlist_add',
      description: `Saved garment #${productId} to personal wishlist`,
      metadata: { productId }
    }).catch(() => {});

    res.status(201).json({ message: 'Saved to your personal collection.', entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function removeFromWishlist(req, res) {
  const productId = Number(req.params.productId);
  if (isNaN(productId)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const ok = await wishlistModel.removeFromWishlist(req.user.id, productId);

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'wishlist_remove',
      description: `Removed garment #${productId} from wishlist`,
      metadata: { productId }
    }).catch(() => {});

    res.json({ ok, message: 'Removed from personal collection.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist
};

