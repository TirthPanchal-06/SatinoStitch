const variantModel = require('../models/variantModel');
const productModel = require('../models/productModel');
const activityModel = require('../models/activityModel');
const customerNotificationModel = require('../models/customerNotificationModel');

async function getVariants(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });

  try {
    const variants = await variantModel.getVariantsByProductId(id);
    res.json({ productId: id, variants });
  } catch (err) {
    console.error('[Variant Controller - getVariants]:', err);
    res.status(500).json({ error: 'Failed to load product variants.' });
  }
}

async function bulkUpsertVariants(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });

  const { variants, replaceMissing = true } = req.body || {};
  if (!Array.isArray(variants)) {
    return res.status(400).json({ error: 'An array of variants is required.' });
  }

  try {
    const existingProduct = await productModel.getProductById(id);
    if (!existingProduct) return res.status(404).json({ error: 'Garment not found.' });

    const prevStock = Number(existingProduct.stock || 0);
    const result = await variantModel.bulkUpsertVariants(id, variants, { replaceMissing });

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'inventory_update',
      description: `Updated ${result.variants.length} size/color variants for "${existingProduct.name}" (Total stock: ${result.totalStock})`,
      metadata: { productId: id, variantCount: result.variants.length, totalStock: result.totalStock }
    }).catch(() => {});

    if (prevStock <= 0 && result.totalStock > 0) {
      customerNotificationModel.triggerBackInStockNotifications(id, result.totalStock).catch(() => {});
    }

    res.json({
      message: `Saved ${result.variants.length} variant(s) with total stock of ${result.totalStock} units.`,
      productId: id,
      ...result
    });
  } catch (err) {
    console.error('[Variant Controller - bulkUpsertVariants]:', err);
    res.status(500).json({ error: err.message || 'Failed to save product variants.' });
  }
}

async function upsertVariant(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });

  const { size, colorName, color_name, colorHex, color_hex, stock = 0, isActive = true } = req.body || {};
  const resolvedColor = colorName || color_name;
  if (!size || !resolvedColor) {
    return res.status(400).json({ error: 'Size and color name are required.' });
  }

  try {
    const existingProduct = await productModel.getProductById(id);
    if (!existingProduct) return res.status(404).json({ error: 'Garment not found.' });

    const result = await variantModel.upsertVariant(id, {
      size,
      colorName: resolvedColor,
      colorHex: colorHex || color_hex || '#5B1835',
      stock,
      isActive
    });

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'inventory_update',
      description: `Saved variant (${size} / ${resolvedColor}: ${result.variant.stock} units) for "${existingProduct.name}"`,
      metadata: { productId: id, size, colorName: resolvedColor, stock: result.variant.stock }
    }).catch(() => {});

    if (result.totalStock > 0 && Number(existingProduct.stock || 0) <= 0) {
      customerNotificationModel.triggerBackInStockNotifications(id, result.totalStock).catch(() => {});
    }

    res.json({
      message: `Variant (${size} / ${resolvedColor}) saved.`,
      ...result
    });
  } catch (err) {
    console.error('[Variant Controller - upsertVariant]:', err);
    res.status(500).json({ error: err.message || 'Failed to save variant.' });
  }
}

async function updateVariantStock(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });

  const { variantId, size, colorName, color_name, stock, delta, isActive } = req.body || {};
  const resolvedColor = colorName || color_name;

  if (variantId === undefined && (!size || !resolvedColor)) {
    return res.status(400).json({ error: 'Provide variantId or size and colorName.' });
  }
  if (stock === undefined && delta === undefined && isActive === undefined) {
    return res.status(400).json({ error: 'Provide stock, delta, or isActive to update.' });
  }

  try {
    const existingProduct = await productModel.getProductById(id);
    if (!existingProduct) return res.status(404).json({ error: 'Garment not found.' });

    const prevStock = Number(existingProduct.stock || 0);
    const result = await variantModel.updateVariantStock(id, {
      variantId,
      size,
      colorName: resolvedColor,
      stock,
      delta,
      isActive
    });

    if (!result) {
      return res.status(404).json({ error: 'Variant combination not found for this product.' });
    }

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'inventory_update',
      description: `Adjusted variant stock (${result.variant.size} / ${result.variant.colorName}) for "${existingProduct.name}" to ${result.variant.stock} units`,
      metadata: {
        productId: id,
        variantId: result.variant.id,
        size: result.variant.size,
        colorName: result.variant.colorName,
        stock: result.variant.stock,
        totalStock: result.totalStock
      }
    }).catch(() => {});

    if (prevStock <= 0 && result.totalStock > 0) {
      customerNotificationModel.triggerBackInStockNotifications(id, result.totalStock).catch(() => {});
    }

    res.json({
      message: 'Variant stock updated successfully.',
      ...result
    });
  } catch (err) {
    console.error('[Variant Controller - updateVariantStock]:', err);
    res.status(500).json({ error: err.message || 'Failed to update variant stock.' });
  }
}

async function deleteVariant(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });

  const variantId = req.body?.variantId ?? req.query?.variantId;
  const size = req.body?.size ?? req.query?.size;
  const colorName = req.body?.colorName ?? req.body?.color_name ?? req.query?.colorName;

  if (variantId === undefined && (!size || !colorName)) {
    return res.status(400).json({ error: 'Provide variantId or size and colorName to remove.' });
  }

  try {
    const result = await variantModel.deleteVariant(id, { variantId, size, colorName });
    if (!result.deleted) {
      return res.status(404).json({ error: 'Variant not found.' });
    }

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'inventory_update',
      description: `Removed variant from product #${id} (Remaining total stock: ${result.totalStock})`,
      metadata: { productId: id, variantId, size, colorName, totalStock: result.totalStock }
    }).catch(() => {});

    res.json({
      message: 'Variant removed successfully.',
      ...result
    });
  } catch (err) {
    console.error('[Variant Controller - deleteVariant]:', err);
    res.status(500).json({ error: err.message || 'Failed to remove variant.' });
  }
}

module.exports = {
  getVariants,
  bulkUpsertVariants,
  upsertVariant,
  updateVariantStock,
  deleteVariant
};
