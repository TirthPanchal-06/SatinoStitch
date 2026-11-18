/**
 * SATINOSTITCH — Centralized Reusable GST & Tax Calculation Engine
 * Shared single source of truth for Backend (Node.js) and Frontend (Browser).
 *
 * Supports:
 *  - GST Rates: 2.5% (CGST / SGST / split), 2.5%, 5% (CGST 2.5% + SGST 2.5% / IGST 5%), and 0% Exempt
 *  - Tax Modes: Auto (Intra-State CGST+SGST vs Inter-State IGST), CGST+SGST, IGST, CGST-only, SGST-only
 *  - Pricing Modes: Tax-Inclusive (preserves existing retail prices) & Tax-Exclusive (adds GST on top)
 *  - Exact 2-decimal rounding with penny-reconciled splits & duplicate-tax prevention
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SatinoGST = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUPPORTED_GST_RATES = [0, 2.5, 5];
  const VALID_GST_TYPES = ['auto', 'cgst_sgst', 'igst', 'cgst_only', 'sgst_only', 'exempt'];
  const VALID_PRICING_MODES = ['inclusive', 'exclusive'];
  const VALID_STORE_TAX_MODES = ['auto', 'cgst_sgst', 'igst'];

  const DEFAULT_GST_CONFIG = {
    enabled: true,
    gstin: '24AAECS1234P1Z8',
    sellerState: 'Gujarat',
    sellerStateCode: '24',
    pricingMode: 'exclusive',
    taxMode: 'auto',
    defaultGstRate: 5,
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5,
    supportedRates: [0, 2.5, 5],
    defaultHsnCode: '6204'
  };

  const INDIAN_STATES = [
    { name: 'Gujarat', code: '24' },
    { name: 'Maharashtra', code: '27' },
    { name: 'Delhi', code: '07' },
    { name: 'Karnataka', code: '29' },
    { name: 'Tamil Nadu', code: '33' },
    { name: 'Rajasthan', code: '08' },
    { name: 'Uttar Pradesh', code: '09' },
    { name: 'West Bengal', code: '19' },
    { name: 'Telangana', code: '36' },
    { name: 'Madhya Pradesh', code: '23' },
    { name: 'Punjab', code: '03' },
    { name: 'Haryana', code: '06' },
    { name: 'Kerala', code: '32' },
    { name: 'Bihar', code: '10' },
    { name: 'Andhra Pradesh', code: '37' },
    { name: 'Assam', code: '18' },
    { name: 'Odisha', code: '21' },
    { name: 'Goa', code: '30' },
    { name: 'Chandigarh', code: '04' }
  ];

  const PRODUCT_GST_OPTIONS = [
    { rate: 5, type: 'auto', label: '5% GST — Auto (2.5% CGST + 2.5% SGST / 5% IGST)' },
    { rate: 5, type: 'cgst_sgst', label: '5% GST — CGST 2.5% + SGST 2.5% (Intra-State)' },
    { rate: 5, type: 'igst', label: '5% GST — IGST 5% (Inter-State)' },
    { rate: 2.5, type: 'cgst_only', label: '2.5% GST — CGST 2.5%' },
    { rate: 2.5, type: 'sgst_only', label: '2.5% GST — SGST 2.5%' },
    { rate: 2.5, type: 'auto', label: '2.5% GST — Auto (1.25% CGST + 1.25% SGST / 2.5% IGST)' },
    { rate: 0, type: 'exempt', label: '0% — GST Exempt' }
  ];

  function round2(value) {
    const n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function normalizeRate(rate, fallback = 5) {
    if (rate === null || rate === undefined || rate === '') return fallback;
    const n = Number(rate);
    if (!isFinite(n)) return fallback;
    if (SUPPORTED_GST_RATES.includes(n)) return n;
    // Snap to closest supported rate if a slight float discrepancy exists
    for (const r of SUPPORTED_GST_RATES) {
      if (Math.abs(r - n) < 0.001) return r;
    }
    return fallback;
  }

  function normalizeGstType(type, fallback = 'auto') {
    const clean = String(type || '').trim().toLowerCase();
    return VALID_GST_TYPES.includes(clean) ? clean : fallback;
  }

  function normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const pricingMode = VALID_PRICING_MODES.includes(src.pricingMode) ? src.pricingMode : DEFAULT_GST_CONFIG.pricingMode;
    const taxMode = VALID_STORE_TAX_MODES.includes(src.taxMode) ? src.taxMode : DEFAULT_GST_CONFIG.taxMode;
    const defaultGstRate = normalizeRate(src.defaultGstRate, DEFAULT_GST_CONFIG.defaultGstRate);
    const cgstRate = src.cgstRate !== undefined ? round2(Number(src.cgstRate)) : round2(defaultGstRate / 2);
    const sgstRate = src.sgstRate !== undefined ? round2(Number(src.sgstRate)) : round2(defaultGstRate / 2);
    const igstRate = src.igstRate !== undefined ? round2(Number(src.igstRate)) : defaultGstRate;

    return {
      enabled: src.enabled !== false,
      gstin: String(src.gstin || DEFAULT_GST_CONFIG.gstin).trim(),
      sellerState: String(src.sellerState || DEFAULT_GST_CONFIG.sellerState).trim(),
      sellerStateCode: String(src.sellerStateCode || DEFAULT_GST_CONFIG.sellerStateCode).trim(),
      pricingMode,
      taxMode,
      defaultGstRate,
      cgstRate,
      sgstRate,
      igstRate,
      supportedRates: [...SUPPORTED_GST_RATES],
      defaultHsnCode: String(src.defaultHsnCode || DEFAULT_GST_CONFIG.defaultHsnCode).trim()
    };
  }

  function normalizeStateName(state) {
    const s = String(state || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'gj' || s === '24') return 'gujarat';
    if (s === 'mh' || s === '27') return 'maharashtra';
    if (s === 'dl' || s === '07' || s === 'new delhi') return 'delhi';
    if (s === 'ka' || s === '29') return 'karnataka';
    if (s === 'tn' || s === '33') return 'tamil nadu';
    if (s === 'rj' || s === '08') return 'rajasthan';
    if (s === 'up' || s === '09') return 'uttar pradesh';
    if (s === 'wb' || s === '19') return 'west bengal';
    return s;
  }

  function isIntraStateSupply(customerState, sellerState) {
    const cust = normalizeStateName(customerState);
    const seller = normalizeStateName(sellerState || DEFAULT_GST_CONFIG.sellerState);
    if (!cust) return true; // Default preview to seller home state until customer selects another state
    return cust === seller;
  }

  function resolveEffectiveTaxRule(itemGstRate, itemGstType, config, customerState) {
    const cfg = normalizeConfig(config);
    if (!cfg.enabled) {
      return { rate: 0, mode: 'exempt', cgstRate: 0, sgstRate: 0, igstRate: 0 };
    }

    const type = normalizeGstType(itemGstType, 'auto');
    if (type === 'exempt') {
      return { rate: 0, mode: 'exempt', cgstRate: 0, sgstRate: 0, igstRate: 0 };
    }

    const rate = normalizeRate(itemGstRate, cfg.defaultGstRate);
    if (rate <= 0) {
      return { rate: 0, mode: 'exempt', cgstRate: 0, sgstRate: 0, igstRate: 0 };
    }

    if (type === 'cgst_only') {
      return { rate, mode: 'cgst_only', cgstRate: rate, sgstRate: 0, igstRate: 0 };
    }
    if (type === 'sgst_only') {
      return { rate, mode: 'sgst_only', cgstRate: 0, sgstRate: rate, igstRate: 0 };
    }
    if (type === 'igst') {
      return { rate, mode: 'inter', cgstRate: 0, sgstRate: 0, igstRate: rate };
    }
    if (type === 'cgst_sgst') {
      const half = round2(rate / 2);
      return { rate, mode: 'intra', cgstRate: half, sgstRate: half, igstRate: 0 };
    }

    // Standard 'auto' mode follows store taxMode & Place of Supply
    let useInter = false;
    if (cfg.taxMode === 'igst') {
      useInter = true;
    } else if (cfg.taxMode === 'cgst_sgst') {
      useInter = false;
    } else {
      useInter = !isIntraStateSupply(customerState, cfg.sellerState);
    }

    if (useInter) {
      return { rate, mode: 'inter', cgstRate: 0, sgstRate: 0, igstRate: rate };
    }
    const half = round2(rate / 2);
    return { rate, mode: 'intra', cgstRate: half, sgstRate: half, igstRate: 0 };
  }

  function computeLineGst(netLineAmount, rule, pricingMode) {
    const net = round2(Math.max(0, Number(netLineAmount || 0)));
    const rate = Number(rule.rate || 0);

    let taxableAmount = net;
    let totalTax = 0;
    let linePayable = net;

    if (rate > 0) {
      if (pricingMode === 'exclusive') {
        taxableAmount = net;
        totalTax = round2((taxableAmount * rate) / 100);
        linePayable = round2(taxableAmount + totalTax);
      } else {
        // Inclusive pricing: extract taxable base and GST cleanly without double-charging
        taxableAmount = round2(net / (1 + rate / 100));
        totalTax = round2(net - taxableAmount);
        linePayable = net;
      }
    }

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (totalTax > 0) {
      if (rule.mode === 'cgst_only') {
        cgstAmount = totalTax;
      } else if (rule.mode === 'sgst_only') {
        sgstAmount = totalTax;
      } else if (rule.mode === 'inter') {
        igstAmount = totalTax;
      } else {
        // Penny-exact 50/50 CGST + SGST split (guarantees cgst + sgst === totalTax)
        cgstAmount = round2(totalTax / 2);
        sgstAmount = round2(totalTax - cgstAmount);
      }
    }

    return {
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstAmount: round2(cgstAmount + sgstAmount + igstAmount),
      linePayable
    };
  }

  function describeProductGst(product, config, customerState) {
    const cfg = normalizeConfig(config);
    const price = round2(Number(product?.price || 0));
    const gstRate = product?.gstRate ?? product?.gst_rate ?? cfg.defaultGstRate;
    const gstType = product?.gstType ?? product?.gst_type ?? 'auto';
    const hsnCode = product?.hsnCode ?? product?.hsn_code ?? cfg.defaultHsnCode;
    const rule = resolveEffectiveTaxRule(gstRate, gstType, cfg, customerState);
    const calc = computeLineGst(price, rule, cfg.pricingMode);

    let label = 'GST Exempt (0%)';
    if (rule.rate > 0) {
      const modeText = cfg.pricingMode === 'inclusive' ? 'Inclusive of' : 'Plus';
      if (rule.mode === 'cgst_only') label = `${modeText} ${rule.cgstRate}% CGST`;
      else if (rule.mode === 'sgst_only') label = `${modeText} ${rule.sgstRate}% SGST`;
      else if (rule.mode === 'inter') label = `${modeText} ${rule.igstRate}% IGST`;
      else label = `${modeText} ${rule.rate}% GST (${rule.cgstRate}% CGST + ${rule.sgstRate}% SGST)`;
    }

    return {
      unitPrice: price,
      gstRate: rule.rate,
      gstType: normalizeGstType(gstType, 'auto'),
      effectiveMode: rule.mode,
      hsnCode,
      pricingMode: cfg.pricingMode,
      cgstRate: rule.cgstRate,
      sgstRate: rule.sgstRate,
      igstRate: rule.igstRate,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      totalGst: calc.gstAmount,
      finalUnitPrice: calc.linePayable,
      label
    };
  }

  /**
   * Authoritative centralized order-level GST calculation.
   * Ensures exact rounding and prevents duplicate tax application.
   */
  function calculateOrderGst({
    items = [],
    discount = 0,
    shippingFee = null,
    customerState = null,
    config = DEFAULT_GST_CONFIG,
    taxAlreadyApplied = false
  } = {}) {
    const cfg = normalizeConfig(config);
    const safeItems = Array.isArray(items) ? items : [];

    // Guard against duplicate tax calculation if caller passes an already-computed breakdown
    if (taxAlreadyApplied) {
      throw new Error('Duplicate GST calculation prevented: tax has already been applied.');
    }

    const lineGrosses = safeItems.map(it => {
      const price = round2(Number(it.price || 0));
      const qty = Math.max(1, parseInt(it.qty || it.quantity || 1, 10) || 1);
      return { it, price, qty, gross: round2(price * qty) };
    });

    const subtotal = round2(lineGrosses.reduce((s, x) => s + x.gross, 0));
    const safeDiscount = round2(Math.min(subtotal, Math.max(0, Number(discount || 0))));

    // Proportionally allocate discount across lines with penny-exact adjustment on final item
    let allocatedDiscount = 0;
    const computedItems = lineGrosses.map((entry, idx) => {
      const isLast = idx === lineGrosses.length - 1;
      let itemDiscount = 0;
      if (safeDiscount > 0 && subtotal > 0) {
        itemDiscount = isLast
          ? round2(safeDiscount - allocatedDiscount)
          : round2((entry.gross / subtotal) * safeDiscount);
        allocatedDiscount = round2(allocatedDiscount + itemDiscount);
      }

      const netLine = round2(Math.max(0, entry.gross - itemDiscount));
      const rawRate = entry.it.gstRate ?? entry.it.gst_rate ?? cfg.defaultGstRate;
      const rawType = entry.it.gstType ?? entry.it.gst_type ?? 'auto';
      const hsnCode = entry.it.hsnCode ?? entry.it.hsn_code ?? cfg.defaultHsnCode;
      const rule = resolveEffectiveTaxRule(rawRate, rawType, cfg, customerState);
      const tax = computeLineGst(netLine, rule, cfg.pricingMode);

      return {
        productId: entry.it.id || entry.it.productId || null,
        name: entry.it.name || entry.it.product_name || 'Bespoke Garment',
        size: entry.it.size || 'M',
        color: entry.it.color || null,
        image: entry.it.image || null,
        price: entry.price,
        quantity: entry.qty,
        grossTotal: entry.gross,
        discountAllocated: itemDiscount,
        netLineAmount: netLine,
        hsnCode,
        gstRate: rule.rate,
        gstType: normalizeGstType(rawType, 'auto'),
        effectiveMode: rule.mode,
        cgstRate: rule.cgstRate,
        sgstRate: rule.sgstRate,
        igstRate: rule.igstRate,
        taxableAmount: tax.taxableAmount,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        gstAmount: tax.gstAmount,
        linePayable: tax.linePayable
      };
    });

    const taxableAmount = round2(computedItems.reduce((s, x) => s + x.taxableAmount, 0));
    const cgstAmount = round2(computedItems.reduce((s, x) => s + x.cgstAmount, 0));
    const sgstAmount = round2(computedItems.reduce((s, x) => s + x.sgstAmount, 0));
    const igstAmount = round2(computedItems.reduce((s, x) => s + x.igstAmount, 0));
    const totalGst = round2(cgstAmount + sgstAmount + igstAmount);
    const itemsPayable = round2(computedItems.reduce((s, x) => s + x.linePayable, 0));

    // Preserve existing shipping rule: complimentary over ₹3,000 net, otherwise ₹150
    const netBeforeShipping = round2(Math.max(0, subtotal - safeDiscount));
    const resolvedShipping = shippingFee !== null && shippingFee !== undefined
      ? round2(Math.max(0, Number(shippingFee)))
      : ((!subtotal || netBeforeShipping >= 3000) ? 0 : 150);

    const grandTotal = round2(itemsPayable + resolvedShipping);

    // Determine dominant supply type label for summary & invoice display
    const hasCgst = cgstAmount > 0;
    const hasSgst = sgstAmount > 0;
    const hasIgst = igstAmount > 0;
    let supplyType = 'exempt';
    if (hasIgst && (hasCgst || hasSgst)) supplyType = 'mixed';
    else if (hasIgst) supplyType = 'inter';
    else if (hasCgst && hasSgst) supplyType = 'intra';
    else if (hasCgst) supplyType = 'cgst_only';
    else if (hasSgst) supplyType = 'sgst_only';

    // Aggregate per-rate tax slabs for invoice summary
    const slabMap = new Map();
    computedItems.forEach(it => {
      const key = `${it.gstRate}|${it.effectiveMode}`;
      if (!slabMap.has(key)) {
        slabMap.set(key, {
          rate: it.gstRate,
          mode: it.effectiveMode,
          cgstRate: it.cgstRate,
          sgstRate: it.sgstRate,
          igstRate: it.igstRate,
          taxableAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          gstAmount: 0
        });
      }
      const slab = slabMap.get(key);
      slab.taxableAmount = round2(slab.taxableAmount + it.taxableAmount);
      slab.cgstAmount = round2(slab.cgstAmount + it.cgstAmount);
      slab.sgstAmount = round2(slab.sgstAmount + it.sgstAmount);
      slab.igstAmount = round2(slab.igstAmount + it.igstAmount);
      slab.gstAmount = round2(slab.gstAmount + it.gstAmount);
    });

    return {
      taxApplied: true,
      enabled: cfg.enabled,
      gstin: cfg.gstin,
      sellerState: cfg.sellerState,
      sellerStateCode: cfg.sellerStateCode,
      placeOfSupply: (customerState && String(customerState).trim()) ? String(customerState).trim() : cfg.sellerState,
      pricingMode: cfg.pricingMode,
      supplyType,
      subtotal,
      discount: safeDiscount,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalGst,
      shippingFee: resolvedShipping,
      grandTotal,
      slabs: Array.from(slabMap.values()),
      items: computedItems
    };
  }

  return {
    SUPPORTED_GST_RATES,
    VALID_GST_TYPES,
    VALID_PRICING_MODES,
    VALID_STORE_TAX_MODES,
    DEFAULT_GST_CONFIG,
    INDIAN_STATES,
    PRODUCT_GST_OPTIONS,
    round2,
    normalizeRate,
    normalizeGstType,
    normalizeConfig,
    normalizeStateName,
    isIntraStateSupply,
    resolveEffectiveTaxRule,
    describeProductGst,
    calculateOrderGst
  };
}));
