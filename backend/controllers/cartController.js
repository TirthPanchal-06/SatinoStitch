const cartModel = require('../models/cartModel');
const activityModel = require('../models/activityModel');

async function getCart(req, res) {
  try {
    const items = await cartModel.getUserCart(req.user.id);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve shopping bag.' });
  }
}

async function addToCart(req, res) {
  const { productId, size, color, quantity } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'Product ID is required.' });

  try {
    const item = await cartModel.addToUserCart(req.user.id, {
      productId,
      size: size || 'M',
      color: color || null,
      quantity: quantity || 1
    });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'cart_add',
      description: `Added product #${productId} (${size || 'M'}) to bag`,
      metadata: { productId, size, color, quantity }
    }).catch(() => {});

    res.status(201).json({ message: 'Garment added to your bespoke bag.', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateCartItem(req, res) {
  const id = Number(req.params.id);
  const { quantity } = req.body || {};
  if (isNaN(id) || quantity === undefined) {
    return res.status(400).json({ error: 'Valid Item ID and quantity are required.' });
  }
  try {
    const item = await cartModel.updateCartItemQuantity(req.user.id, id, quantity);
    res.json({ message: 'Bag item updated.', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function removeCartItem(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid Item ID' });
  try {
    const ok = await cartModel.removeCartItem(req.user.id, id);
    res.json({ ok, message: 'Garment removed from bag.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function clearCart(req, res) {
  try {
    await cartModel.clearUserCart(req.user.id);
    res.json({ ok: true, message: 'Shopping bag cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function syncCart(req, res) {
  const { items } = req.body || {};
  try {
    const synced = await cartModel.syncUserCart(req.user.id, items || []);
    res.json({ message: 'Bag synchronized.', items: synced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function trackCartActivity(req, res) {
  const { productId, productName, action, size, color } = req.body || {};
  const userId = req.user ? req.user.id : null;
  const userName = req.user ? req.user.name : 'Anonymous Shopper';

  activityModel.logCustomerActivity({
    userId,
    userName,
    activityType: action === 'remove' ? 'cart_remove' : 'cart_add',
    description: `${action === 'remove' ? 'Removed' : 'Added'} "${productName || 'Garment'}" (${size || 'M'}) in shopping bag`,
    metadata: { productId, size, color }
  }).catch(() => {});

  res.json({ ok: true });
}

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  syncCart,
  trackCartActivity
};

