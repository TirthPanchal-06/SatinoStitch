const couponModel = require('../models/couponModel');

async function getCoupon(req, res) {
  const code = req.params.code;
  try {
    const c = await couponModel.getCouponByCode(code);
    if (!c || !c.is_active) {
      return res.status(404).json({ error: `Promotional code "${code}" is invalid or expired.` });
    }
    res.json({
      code: c.code,
      discount_percent: c.discount_percent,
      min_order_amount: Number(c.min_order_amount),
      description: c.description
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function validateCoupon(req, res) {
  const code = req.params.code;
  const subtotal = Number(req.query.subtotal || 0);

  try {
    const c = await couponModel.getCouponByCode(code);
    if (!c || !c.is_active) {
      return res.status(404).json({ valid: false, error: 'Invalid or expired promotional code.' });
    }

    if (subtotal < Number(c.min_order_amount)) {
      return res.status(400).json({
        valid: false,
        error: `Code "${c.code}" requires a minimum commission value of ₹${Number(c.min_order_amount).toLocaleString('en-IN')}.`
      });
    }

    const discountAmount = Math.round((subtotal * c.discount_percent) / 100);
    res.json({
      valid: true,
      code: c.code,
      discountPercent: c.discount_percent,
      minOrderAmount: Number(c.min_order_amount),
      discountAmount,
      description: c.description
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAllCoupons(req, res) {
  try {
    const coupons = await couponModel.getAllCoupons();
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createCoupon(req, res) {
  const { code, discountPercent, minOrderAmount, description, isActive } = req.body || {};
  if (!code || !discountPercent) {
    return res.status(400).json({ error: 'Code and discount percentage are required.' });
  }
  try {
    const created = await couponModel.createCoupon({
      code,
      discountPercent,
      minOrderAmount,
      description,
      isActive: isActive !== undefined ? isActive : true
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateCoupon(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid coupon ID' });
  try {
    const updated = await couponModel.updateCoupon(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Coupon not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteCoupon(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid coupon ID' });
  try {
    const ok = await couponModel.deleteCoupon(id);
    res.json({ ok, message: 'Coupon deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getCoupon,
  validateCoupon,
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon
};

