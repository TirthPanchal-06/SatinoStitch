/**
 * SATINOSTITCH — Centralized Backend GST Service
 * Wraps the shared pure GST engine (frontend/js/gst.js) with PostgreSQL configuration storage.
 */
const gstEngine = require('../../frontend/js/gst');
const adminUpgradeModel = require('../models/adminUpgradeModel');

const GST_SETTINGS_KEY = 'gst_config';

async function getGstConfig() {
  try {
    const raw = await adminUpgradeModel.getWebsiteSetting(GST_SETTINGS_KEY);
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return gstEngine.normalizeConfig(parsed);
    }
  } catch (err) {
    console.warn('[GST Service] Falling back to default GST config:', err.message);
  }
  return gstEngine.normalizeConfig(gstEngine.DEFAULT_GST_CONFIG);
}

async function saveGstConfig(input) {
  const current = await getGstConfig();
  const merged = gstEngine.normalizeConfig({ ...current, ...(input || {}) });

  // Validate GSTIN format lightly if provided
  if (merged.gstin && merged.gstin.length > 25) {
    const err = new Error('GSTIN registration number is too long.');
    err.statusCode = 400;
    throw err;
  }
  if (!gstEngine.SUPPORTED_GST_RATES.includes(merged.defaultGstRate)) {
    const err = new Error(`Unsupported default GST rate. Supported rates: ${gstEngine.SUPPORTED_GST_RATES.join('%, ')}%.`);
    err.statusCode = 400;
    throw err;
  }

  // Keep cgstRate, sgstRate, igstRate aligned with defaultGstRate unless explicitly overridden cleanly
  if (input && input.defaultGstRate !== undefined && input.cgstRate === undefined && input.sgstRate === undefined) {
    merged.cgstRate = gstEngine.round2(merged.defaultGstRate / 2);
    merged.sgstRate = gstEngine.round2(merged.defaultGstRate / 2);
    merged.igstRate = merged.defaultGstRate;
  }

  await adminUpgradeModel.setWebsiteSetting(GST_SETTINGS_KEY, merged);
  return merged;
}

async function calculateOrderTax({ items, discount = 0, shippingFee = null, customerState = null, config = null, taxAlreadyApplied = false }) {
  const activeConfig = config ? gstEngine.normalizeConfig(config) : await getGstConfig();
  return gstEngine.calculateOrderGst({
    items,
    discount,
    shippingFee,
    customerState,
    config: activeConfig,
    taxAlreadyApplied
  });
}

module.exports = {
  ...gstEngine,
  getGstConfig,
  saveGstConfig,
  calculateOrderTax
};
