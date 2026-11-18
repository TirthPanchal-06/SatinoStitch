const gstService = require('../services/gstService');
const productModel = require('../models/productModel');
const couponModel = require('../models/couponModel');
const activityModel = require('../models/activityModel');

async function getPublicGstConfig(req, res) {
  try {
    const config = await gstService.getGstConfig();
    res.json({
      ...config,
      options: gstService.PRODUCT_GST_OPTIONS,
      states: gstService.INDIAN_STATES
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve GST configuration.' });
  }
}

async function updateAdminGstConfig(req, res) {
  try {
    const updated = await gstService.saveGstConfig(req.body || {});

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'setting_update',
      description: `GST configuration updated (Default: ${updated.defaultGstRate}%, Mode: ${updated.pricingMode}, Tax: ${updated.taxMode}, State: ${updated.sellerState}) by ${req.user?.name || 'Administrator'}`,
      metadata: { gstConfig: updated }
    }).catch(() => {});

    res.json({
      message: 'GST & Tax configuration saved successfully.',
      config: updated
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message || 'Could not update GST configuration.' });
  }
}

async function previewGstCalculation(req, res) {
  const { items, couponCode, customerState, discount: explicitDiscount } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required for GST calculation.' });
  }

  try {
    const enrichedItems = [];
    for (const item of items) {
      const pid = Number(item.id || item.productId);
      const prod = !isNaN(pid) ? await productModel.getProductById(pid) : null;
      enrichedItems.push({
        id: prod ? prod.id : pid || null,
        name: prod ? prod.name : (item.name || 'Garment'),
        price: prod ? (prod.activeDiscount ? prod.activeDiscount.discountedPrice : prod.price) : Number(item.price || 0),
        quantity: Math.max(1, parseInt(item.qty || item.quantity || 1, 10) || 1),
        size: item.size || 'M',
        color: item.color || null,
        gstRate: prod ? prod.gstRate : item.gstRate,
        gstType: prod ? prod.gstType : item.gstType,
        hsnCode: prod ? prod.hsnCode : item.hsnCode
      });
    }

    const subtotal = enrichedItems.reduce((s, it) => s + (it.price * it.quantity), 0);
    let discount = Number(explicitDiscount || 0);
    if (!discount && couponCode) {
      const c = await couponModel.getCouponByCode(String(couponCode).toUpperCase().trim());
      if (c && c.is_active && subtotal >= Number(c.min_order_amount)) {
        discount = Math.round((subtotal * c.discount_percent) / 100);
      }
    }

    const breakdown = await gstService.calculateOrderTax({
      items: enrichedItems,
      discount,
      customerState: customerState || null
    });

    res.json(breakdown);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'GST calculation failed.' });
  }
}

module.exports = {
  getPublicGstConfig,
  updateAdminGstConfig,
  previewGstCalculation
};
