const productDiscountModel = require('../models/productDiscountModel');
const activityModel = require('../models/activityModel');

async function getAllProductDiscounts(req, res) {
  try {
    const status = req.query.status || 'all';
    const search = req.query.search || '';
    const data = await productDiscountModel.getAllDiscountsAdmin({ status, search });
    res.json(data);
  } catch (err) {
    console.error('[Product Discount Controller - list]:', err);
    res.status(500).json({ error: 'Failed to retrieve selected product discounts.' });
  }
}

async function createProductDiscount(req, res) {
  try {
    const created = await productDiscountModel.createDiscount(req.body || {}, req.user?.id || null);

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'discount_created',
      description: `Created product discount "${created.name}" (${created.discountType === 'percentage' ? `${created.discountValue}%` : `₹${created.discountValue}`} OFF) across ${created.productCount} selected product(s)`,
      metadata: { discountId: created.id, productIds: created.productIds, status: created.status }
    }).catch(() => {});

    res.status(201).json({
      message: `Discount "${created.name}" applied to ${created.productCount} selected product(s).`,
      discount: created
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not create product discount.' });
  }
}

async function updateProductDiscount(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid discount ID.' });

  try {
    const updated = await productDiscountModel.updateDiscount(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Product discount not found.' });

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'discount_updated',
      description: `Updated product discount "${updated.name}" (${updated.status}) for ${updated.productCount} product(s)`,
      metadata: { discountId: updated.id, productIds: updated.productIds, status: updated.status }
    }).catch(() => {});

    res.json({
      message: `Discount "${updated.name}" updated (${updated.status}).`,
      discount: updated
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not update product discount.' });
  }
}

async function deleteProductDiscount(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid discount ID.' });

  try {
    const ok = await productDiscountModel.deleteDiscount(id);
    if (!ok) return res.status(404).json({ error: 'Product discount not found.' });

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'discount_deleted',
      description: `Removed selected product discount #${id} by ${req.user?.name || 'Administrator'}`,
      metadata: { discountId: id }
    }).catch(() => {});

    res.json({ ok: true, message: 'Product discount removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not remove product discount.' });
  }
}

module.exports = {
  getAllProductDiscounts,
  createProductDiscount,
  updateProductDiscount,
  deleteProductDiscount
};
