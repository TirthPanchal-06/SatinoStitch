/**
 * SATINOSTITCH — Corporate A4 Invoice Service & PDF Generator
 *
 * Generates single-order, print-ready A4 Tax Invoice PDFs dynamically from
 * PostgreSQL order, product, GST, and store settings records.
 * - Guarantees 1 unique persistent invoice number per order (no duplicates).
 * - Supports both new orders (persisted GST snapshot) and historical orders.
 * - Supports multi-product automatic A4 pagination with repeated table headers.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pool, query } = require('../config/db');
const orderModel = require('../models/orderModel');
const adminUpgradeModel = require('../models/adminUpgradeModel');
const gstService = require('./gstService');
const env = require('../config/env');

const COMPANY_LEGAL_NAME = 'SATINOSTITCH ATELIER LUXE PVT LTD';
const COMPANY_BRAND_NAME = 'SATINOSTITCH';
const COMPANY_TAGLINE = 'Haute Couture Ethnic & Sartorial Pret';

const LOGO_CANDIDATES = [
  path.resolve(__dirname, '../../frontend/images/emblem-gold.png'),
  path.resolve(__dirname, '../../frontend/images/emblem.png')
];

const FONT_CANDIDATES = [
  {
    regular: 'C:\\Windows\\Fonts\\segoeui.ttf',
    bold: 'C:\\Windows\\Fonts\\segoeuib.ttf',
    italic: 'C:\\Windows\\Fonts\\segoeuii.ttf'
  },
  {
    regular: 'C:\\Windows\\Fonts\\arial.ttf',
    bold: 'C:\\Windows\\Fonts\\arialbd.ttf',
    italic: 'C:\\Windows\\Fonts\\ariali.ttf'
  },
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    italic: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf'
  }
];

function resolvePdfFonts() {
  for (const set of FONT_CANDIDATES) {
    if (fs.existsSync(set.regular) && fs.existsSync(set.bold)) {
      return {
        regular: set.regular,
        bold: set.bold,
        italic: fs.existsSync(set.italic) ? set.italic : set.regular,
        currencyPrefix: '₹'
      };
    }
  }
  return {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    currencyPrefix: 'Rs. '
  };
}

function resolveLogoPath() {
  for (const p of LOGO_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function formatINR(amount, prefix = '₹') {
  const num = round2(amount);
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${num < 0 ? '-' : ''}${prefix}${formatted}`;
}

function numberToWordsINR(amount) {
  const val = round2(Math.max(0, Number(amount || 0)));
  const rupees = Math.floor(val);
  const paise = Math.round((val - rupees) * 100);

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function under1000(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (n % 10 !== 0 ? ones[n % 10] + ' ' : '');
    return ones[Math.floor(n / 100)] + ' Hundred ' + (n % 100 !== 0 ? under1000(n % 100) : '');
  }

  function convertInt(n) {
    if (n === 0) return 'Zero';
    let w = '';
    const crore = Math.floor(n / 10000000);
    let rem = n % 10000000;
    const lakh = Math.floor(rem / 100000);
    rem %= 100000;
    const thousand = Math.floor(rem / 1000);
    rem %= 1000;
    if (crore > 0) w += under1000(crore) + 'Crore ';
    if (lakh > 0) w += under1000(lakh) + 'Lakh ';
    if (thousand > 0) w += under1000(thousand) + 'Thousand ';
    if (rem > 0) w += under1000(rem);
    return w.trim();
  }

  let result = `Rupees ${convertInt(rupees)}`;
  if (paise > 0) {
    result += ` and ${convertInt(paise)} Paise`;
  }
  return `${result} Only`;
}

function buildSku(item) {
  if (item.sku && String(item.sku).trim()) return String(item.sku).trim().toUpperCase();
  const pid = item.product_id || item.productId || item.id || 0;
  const pidPart = String(pid).padStart(3, '0');
  const sizePart = String(item.size || 'STD')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'STD';
  const colorRaw = String(item.color || 'STD').trim();
  const colorPart = colorRaw
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'STD';
  return `SS-${pidPart}-${sizePart}-${colorPart}`;
}

function parseJsonSafe(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function formatAddressLines(addr = {}, fallbackState = 'Gujarat') {
  if (!addr || typeof addr !== 'object') return [];
  const lines = [];
  const line1 = String(addr.line1 || addr.address || addr.street || '').trim();
  const line2 = String(addr.line2 || addr.landmark || '').trim();
  const city = String(addr.city || '').trim();
  const state = String(addr.state || fallbackState || '').trim();
  const pincode = String(addr.pincode || addr.pin || addr.postalCode || '').trim();
  const country = String(addr.country || 'India').trim();

  if (line1) lines.push(line1);
  if (line2) lines.push(line2);
  const cityState = [city, state].filter(Boolean).join(', ');
  const regionLine = [cityState, pincode ? `- ${pincode}` : ''].filter(Boolean).join(' ');
  if (regionLine) lines.push(regionLine);
  if (country && lines.length > 0) lines.push(country);
  return lines;
}

function addressesDiffer(a, b) {
  if (!a || !b) return false;
  const norm = (x) => formatAddressLines(x, '').join('|').toLowerCase().replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  return Boolean(na && nb && na !== nb);
}

/**
 * Ensures every order has exactly one persistent, non-duplicating invoice record.
 */
async function ensureInvoiceRecord(orderId, orderCreatedAt = null) {
  const existing = await query(
    'SELECT id, invoice_number, order_id, issued_at FROM invoices WHERE order_id = $1;',
    [orderId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize invoice sequence allocation to prevent duplicate sequence numbers under concurrency
    await client.query('LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE;');

    const recheck = await client.query(
      'SELECT id, invoice_number, order_id, issued_at FROM invoices WHERE order_id = $1;',
      [orderId]
    );
    if (recheck.rows[0]) {
      await client.query('COMMIT');
      return recheck.rows[0];
    }

    const maxRes = await client.query(`
      SELECT COALESCE(MAX(
        CASE
          WHEN invoice_number ~ '^INV-[0-9]+$' THEN SUBSTRING(invoice_number FROM '[0-9]+$')::int
          ELSE 0
        END
      ), 0) AS max_seq
      FROM invoices;
    `);
    const nextSeq = Number(maxRes.rows[0]?.max_seq || 0) + 1;
    const invoiceNumber = `INV-${String(nextSeq).padStart(3, '0')}`;

    const inserted = await client.query(
      `INSERT INTO invoices (invoice_number, order_id, issued_at)
       VALUES ($1, $2, COALESCE($3, NOW()))
       ON CONFLICT (order_id) DO NOTHING
       RETURNING id, invoice_number, order_id, issued_at;`,
      [invoiceNumber, orderId, orderCreatedAt]
    );

    if (inserted.rows[0]) {
      await client.query('COMMIT');
      return inserted.rows[0];
    }

    const fallback = await client.query(
      'SELECT id, invoice_number, order_id, issued_at FROM invoices WHERE order_id = $1;',
      [orderId]
    );
    await client.query('COMMIT');
    return fallback.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Builds the complete structured invoice object dynamically from DB records.
 */
async function getInvoiceDataForOrder(orderId) {
  const order = await orderModel.getOrderById(orderId);
  if (!order) return null;

  const [invoiceRecord, settings, gstConfig] = await Promise.all([
    ensureInvoiceRecord(order.id, order.created_at),
    adminUpgradeModel.getAllWebsiteSettings().catch(() => ({})),
    gstService.getGstConfig().catch(() => ({ ...gstService.DEFAULT_GST_CONFIG }))
  ]);

  const storeInfo = (settings && settings.store_info && typeof settings.store_info === 'object')
    ? settings.store_info
    : {};

  // Enrich order items with live product metadata (description, fabric, type, hsn) without altering order amounts
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const productIds = [...new Set(rawItems.map(it => Number(it.product_id || it.productId)).filter(n => !isNaN(n) && n > 0))];
  const productMap = new Map();
  if (productIds.length > 0) {
    const prodRes = await query(
      'SELECT id, name, type, fabric, description, hsn_code, gst_rate, gst_type FROM products WHERE id = ANY($1::int[]);',
      [productIds]
    );
    for (const p of prodRes.rows) {
      productMap.set(Number(p.id), p);
    }
  }

  const shippingAddr = parseJsonSafe(order.shipping_address, {});
  const billingAddr = parseJsonSafe(order.billing_address, null) || shippingAddr;
  const savedBreakdown = parseJsonSafe(order.gst_breakdown, {});

  const sellerState = savedBreakdown.sellerState || gstConfig.sellerState || 'Gujarat';
  const sellerStateCode = savedBreakdown.sellerStateCode || gstConfig.sellerStateCode || '24';
  const sellerGstin = savedBreakdown.gstin || gstConfig.gstin || '24AAECS1234P1Z8';
  const placeOfSupply = savedBreakdown.placeOfSupply || shippingAddr.state || sellerState;

  const subtotal = round2(order.subtotal || order.total || 0);
  const privilegeDiscount = round2(order.discount || 0);
  const shippingFee = round2(order.shipping_fee !== undefined && order.shipping_fee !== null ? order.shipping_fee : 0);
  const afterDiscountAmount = round2(Math.max(0, subtotal - privilegeDiscount));

  // Always compute GST on the after-discount taxable amount (exclusive mode: Taxable = Subtotal - Discounts, Final = Taxable + GST + Shipping)
  const effectivePricingMode = gstConfig.pricingMode === 'inclusive' ? 'inclusive' : 'exclusive';
  const savedMode = order.gst_pricing_mode || savedBreakdown.pricingMode || null;
  const hasMatchingSavedSnapshot = Boolean(
    savedMode === effectivePricingMode &&
    ((savedBreakdown && savedBreakdown.supplyType) || Number(order.taxable_amount || 0) > 0 || Number(order.total_gst || 0) > 0) &&
    (effectivePricingMode !== 'exclusive' || Math.abs(round2(order.taxable_amount || 0) - afterDiscountAmount) < 0.05)
  );

  let computedTax = null;
  if (!hasMatchingSavedSnapshot) {
    computedTax = await gstService.calculateOrderTax({
      items: rawItems.map(it => {
        const prod = productMap.get(Number(it.product_id || it.productId));
        return {
          id: it.product_id || it.productId || null,
          name: it.product_name || it.name || prod?.name || 'Artisanal Creation',
          price: Number(it.price || 0),
          quantity: Number(it.quantity || it.qty || 1),
          gstRate: it.gst_rate !== undefined && it.gst_rate !== null ? Number(it.gst_rate) : (prod?.gst_rate ?? gstConfig.defaultGstRate),
          gstType: it.gst_type || prod?.gst_type || 'auto',
          hsnCode: it.hsn_code || prod?.hsn_code || gstConfig.defaultHsnCode || '6204'
        };
      }),
      discount: privilegeDiscount,
      shippingFee,
      customerState: placeOfSupply,
      config: { ...gstConfig, pricingMode: effectivePricingMode }
    });
  }

  const taxData = hasMatchingSavedSnapshot
    ? {
        gstin: sellerGstin,
        sellerState,
        sellerStateCode,
        placeOfSupply,
        pricingMode: effectivePricingMode,
        supplyType: order.gst_type || savedBreakdown.supplyType || 'intra',
        taxableAmount: round2(order.taxable_amount || savedBreakdown.taxableAmount || afterDiscountAmount),
        cgstAmount: round2(order.cgst_amount || savedBreakdown.cgstAmount || 0),
        sgstAmount: round2(order.sgst_amount || savedBreakdown.sgstAmount || 0),
        igstAmount: round2(order.igst_amount || savedBreakdown.igstAmount || 0),
        totalGst: round2(order.total_gst || savedBreakdown.totalGst || 0),
        slabs: Array.isArray(savedBreakdown.slabs) ? savedBreakdown.slabs : [],
        grandTotal: round2(order.total || 0)
      }
    : {
        ...computedTax,
        gstin: sellerGstin,
        sellerState,
        sellerStateCode,
        placeOfSupply,
        pricingMode: effectivePricingMode,
        grandTotal: effectivePricingMode === 'exclusive'
          ? round2(computedTax.taxableAmount + computedTax.totalGst + shippingFee)
          : round2(order.total || computedTax.grandTotal || 0)
      };

  // Build enriched line items
  let totalProductDiscount = 0;
  const items = rawItems.map((it, idx) => {
    const prod = productMap.get(Number(it.product_id || it.productId));
    const computedItem = computedTax && Array.isArray(computedTax.items) ? computedTax.items[idx] : null;
    const savedItem = savedBreakdown && Array.isArray(savedBreakdown.items) ? savedBreakdown.items[idx] : null;

    const qty = Math.max(1, Number(it.quantity || it.qty || 1));
    const unitPrice = round2(it.price || 0);
    const originalUnitPrice = round2(it.originalPrice || savedItem?.originalPrice || unitPrice);
    const lineProductDisc = originalUnitPrice > unitPrice
      ? round2((originalUnitPrice - unitPrice) * qty)
      : round2(it.productDiscountSavings || savedItem?.productDiscountSavings || 0);
    totalProductDiscount = round2(totalProductDiscount + lineProductDisc);

    const gstRate = it.gst_rate !== undefined && it.gst_rate !== null
      ? Number(it.gst_rate)
      : (computedItem ? Number(computedItem.gstRate) : Number(prod?.gst_rate ?? gstConfig.defaultGstRate));

    const lineTaxable = (it.taxable_amount !== undefined && Number(it.taxable_amount) > 0)
      ? round2(it.taxable_amount)
      : (computedItem ? round2(computedItem.taxableAmount) : round2(unitPrice * qty));

    const lineGst = (it.gst_amount !== undefined && (Number(it.gst_amount) > 0 || gstRate === 0))
      ? round2(it.gst_amount)
      : (computedItem ? round2(computedItem.gstAmount) : 0);

    const lineTotal = round2(unitPrice * qty);

    const descParts = [];
    if (prod?.description) {
      const cleanDesc = String(prod.description).replace(/\s+/g, ' ').trim();
      descParts.push(cleanDesc.length > 85 ? cleanDesc.slice(0, 82).trim() + '...' : cleanDesc);
    } else if (prod?.fabric || prod?.type) {
      descParts.push([prod.type, prod.fabric].filter(Boolean).join(' · '));
    }

    return {
      serial: idx + 1,
      productId: it.product_id || it.productId || null,
      name: it.product_name || it.name || prod?.name || 'Artisanal Creation',
      description: descParts.join(' '),
      sku: buildSku(it),
      hsnCode: it.hsn_code || prod?.hsn_code || (computedItem ? computedItem.hsnCode : '6204'),
      size: it.size || 'Standard',
      color: it.color || 'Standard',
      quantity: qty,
      originalUnitPrice,
      unitPrice,
      discount: lineProductDisc,
      gstRate,
      taxableAmount: lineTaxable,
      gstAmount: lineGst,
      lineTotal
    };
  });

  const grossSubtotal = round2(subtotal + totalProductDiscount);
  const grandTotal = hasMatchingSavedSnapshot
    ? round2(order.total || taxData.grandTotal || 0)
    : round2(taxData.grandTotal || 0);

  // Detect any additional charges (e.g. gift wrap / COD surcharge if order.total exceeds expected sum)
  const expectedBeforeExtra = taxData.pricingMode === 'exclusive'
    ? round2(taxData.taxableAmount + taxData.totalGst + shippingFee)
    : round2(Math.max(0, subtotal - privilegeDiscount) + shippingFee);
  const additionalCharges = grandTotal - expectedBeforeExtra > 0.5
    ? round2(grandTotal - expectedBeforeExtra)
    : 0;

  // Compute readable tax rate labels from slabs
  const slabs = Array.isArray(taxData.slabs) ? taxData.slabs : [];
  const cgstRates = [...new Set(slabs.filter(s => Number(s.cgstAmount) > 0).map(s => s.cgstRate))];
  const sgstRates = [...new Set(slabs.filter(s => Number(s.sgstAmount) > 0).map(s => s.sgstRate))];
  const igstRates = [...new Set(slabs.filter(s => Number(s.igstAmount) > 0).map(s => s.igstRate))];

  const invoiceDate = new Date(order.created_at || invoiceRecord.issued_at || Date.now());
  const invoiceNumber = invoiceRecord.invoice_number;
  const safeFilename = `SATINOSTITCH_${invoiceNumber.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;

  const supportPhone = storeInfo.support_phone || storeInfo.phone || env.SUPPORT_PHONE || '+91 98765 43210';
  const supportEmail = storeInfo.support_email || storeInfo.email || env.SUPPORT_EMAIL || 'concierge@satinostitch.com';
  const supportHours = storeInfo.support_hours || storeInfo.hours || env.SUPPORT_HOURS || '10:00 AM to 5:00 PM';
  const companyAddress = storeInfo.address || `Ring Road Textile District, Surat, ${sellerState} 395002, India`;

  const customerGstin = order.customer_gstin || billingAddr.gstin || shippingAddr.gstin || null;

  return {
    invoiceNumber,
    filename: safeFilename,
    invoiceDate: invoiceDate.toISOString(),
    invoiceDateFormatted: invoiceDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }),
    orderId: order.id,
    trackingNumber: order.tracking_number || `IND-COUT-${order.id}`,
    orderStatus: order.status || 'Confirmed',
    paymentMethod: String(order.payment_method || 'COD').toUpperCase(),
    paymentStatus: String(order.payment_status || 'pending').toUpperCase(),
    paymentId: order.razorpay_payment_id || order.payment_id || null,
    couponCode: order.coupon_code || null,
    company: {
      brandName: COMPANY_BRAND_NAME,
      legalName: COMPANY_LEGAL_NAME,
      tagline: storeInfo.tagline || COMPANY_TAGLINE,
      address: companyAddress,
      phone: supportPhone,
      email: supportEmail,
      supportHours,
      gstin: sellerGstin,
      state: sellerState,
      stateCode: sellerStateCode
    },
    customer: {
      name: order.customer_name || billingAddr.recipient || 'Valued Patron',
      email: order.customer_email || '',
      phone: order.customer_phone || billingAddr.phone || shippingAddr.phone || '',
      gstin: customerGstin,
      billingAddressLines: formatAddressLines(billingAddr, sellerState),
      shippingAddressLines: formatAddressLines(shippingAddr, sellerState),
      hasDifferentShippingAddress: addressesDiffer(billingAddr, shippingAddr)
    },
    items,
    summary: {
      subtotal: grossSubtotal,
      netOrderSubtotal: subtotal,
      productDiscount: totalProductDiscount,
      privilegeDiscount,
      couponCode: order.coupon_code || null,
      netTaxableAmount: taxData.taxableAmount,
      cgstAmount: taxData.cgstAmount,
      sgstAmount: taxData.sgstAmount,
      igstAmount: taxData.igstAmount,
      cgstLabel: cgstRates.length === 1 ? `Central GST (CGST ${cgstRates[0]}%)` : 'Central GST (CGST)',
      sgstLabel: sgstRates.length === 1 ? `State GST (SGST ${sgstRates[0]}%)` : 'State GST (SGST)',
      igstLabel: igstRates.length === 1 ? `Integrated GST (IGST ${igstRates[0]}%)` : 'Integrated GST (IGST)',
      totalGst: taxData.totalGst,
      shippingFee,
      additionalCharges,
      finalAmount: grandTotal,
      amountInWords: numberToWordsINR(grandTotal),
      placeOfSupply,
      supplyType: taxData.igstAmount > 0 && taxData.cgstAmount === 0 ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)',
      pricingMode: taxData.pricingMode === 'exclusive' ? 'Tax-Exclusive' : 'Tax-Inclusive MRP'
    }
  };
}

/**
 * Generates a clean, executive-grade A4 PDF Buffer for a single order invoice.
 */
function generateInvoicePdfBuffer(inv) {
  return new Promise((resolve, reject) => {
    try {
      const fonts = resolvePdfFonts();
      const logoPath = resolveLogoPath();
      const cur = (n) => formatINR(n, fonts.currencyPrefix);

      // A4 dimensions: 595.28 x 841.89 pt
      const MARGIN = 36;
      const PAGE_W = 595.28;
      const PAGE_H = 841.89;
      const CONTENT_W = PAGE_W - MARGIN * 2; // 523.28 pt
      const FOOTER_SAFE_Y = PAGE_H - 46;     // Running footer sits below this line

      // Luxury Minimal Corporate Palette
      const C = {
        ink: '#1C1917',
        body: '#374151',
        muted: '#6B7280',
        wine: '#5B1F2A',
        gold: '#A68243',
        border: '#E5E7EB',
        borderStrong: '#D1D5DB',
        softBg: '#F9F8F5',
        headerBg: '#1F1B18',
        green: '#166534',
        white: '#FFFFFF'
      };

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `SATINOSTITCH Tax Invoice ${inv.invoiceNumber}`,
          Author: inv.company.legalName,
          Subject: `Tax Invoice ${inv.invoiceNumber} for Order ${inv.orderId}`,
          Creator: 'SATINOSTITCH Invoice Engine'
        }
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Register fonts if TTF paths
      const F_REG = 'BodyRegular';
      const F_BOLD = 'BodyBold';
      const F_ITALIC = 'BodyItalic';
      if (fonts.regular !== 'Helvetica') {
        doc.registerFont(F_REG, fonts.regular);
        doc.registerFont(F_BOLD, fonts.bold);
        doc.registerFont(F_ITALIC, fonts.italic);
      } else {
        doc.registerFont(F_REG, 'Helvetica');
        doc.registerFont(F_BOLD, 'Helvetica-Bold');
        doc.registerFont(F_ITALIC, 'Helvetica-Oblique');
      }

      // Draw subtle top corporate accent bar on current page
      const drawTopAccentBar = () => {
        doc.save();
        doc.rect(0, 0, PAGE_W, 4).fill(C.wine);
        doc.rect(0, 4, PAGE_W, 1.5).fill(C.gold);
        doc.restore();
      };

      drawTopAccentBar();

      // =========================================================================
      // SECTION A: COMPANY HEADER & INVOICE METADATA
      // =========================================================================
      let y = 24;
      const leftColW = 315;
      const rightColX = MARGIN + leftColW + 14;
      const rightColW = CONTENT_W - leftColW - 14;

      // Left: Logo + Company Identity
      let textX = MARGIN;
      if (logoPath) {
        // Subtle crisp framed crest for the gold emblem so it reads cleanly on white paper
        doc.save();
        doc.roundedRect(MARGIN, y, 48, 48, 5).fillAndStroke('#1F1B18', C.gold);
        doc.image(logoPath, MARGIN + 6, y + 7, { fit: [36, 34], align: 'center', valign: 'center' });
        doc.restore();
        textX = MARGIN + 58;
      }

      const brandTextW = leftColW - (textX - MARGIN);
      doc.font(F_BOLD).fontSize(15).fillColor(C.wine)
        .text(inv.company.brandName, textX, y - 1, { width: brandTextW });

      let leftY = doc.y;
      doc.font(F_BOLD).fontSize(8.2).fillColor(C.ink)
        .text(inv.company.legalName, textX, leftY + 1, { width: brandTextW });
      leftY = doc.y;

      doc.font(F_REG).fontSize(7.6).fillColor(C.muted)
        .text(inv.company.address, textX, leftY + 2, { width: brandTextW, lineGap: 1.5 });
      leftY = doc.y;

      doc.font(F_REG).fontSize(7.6).fillColor(C.body)
        .text(`Phone: ${inv.company.phone}  |  Email: ${inv.company.email}`, textX, leftY + 2, { width: brandTextW });
      leftY = doc.y;

      doc.font(F_BOLD).fontSize(7.8).fillColor(C.ink)
        .text(`GSTIN: ${inv.company.gstin}  |  State: ${inv.company.state} (${inv.company.stateCode})`, textX, leftY + 2, { width: brandTextW });
      leftY = Math.max(doc.y, y + 52);

      // Right: Prominent INVOICE Heading + Structured Invoice Details Box
      doc.font(F_BOLD).fontSize(18).fillColor(C.ink)
        .text('TAX INVOICE', rightColX, y - 2, { width: rightColW, align: 'right' });

      const metaBoxY = y + 22;
      const metaRows = [
        ['Invoice No.', inv.invoiceNumber],
        ['Invoice Date', inv.invoiceDateFormatted],
        ['Order ID', `#${inv.orderId}`],
        ['Place of Supply', inv.summary.placeOfSupply]
      ];

      const metaBoxH = metaRows.length * 14.5 + 10;
      doc.save();
      doc.roundedRect(rightColX, metaBoxY, rightColW, metaBoxH, 4).fillAndStroke(C.softBg, C.border);
      doc.restore();

      let my = metaBoxY + 6;
      for (const [label, val] of metaRows) {
        doc.font(F_REG).fontSize(7.6).fillColor(C.muted)
          .text(label, rightColX + 8, my, { width: 78 });
        doc.font(F_BOLD).fontSize(7.8).fillColor(C.ink)
          .text(String(val), rightColX + 86, my, { width: rightColW - 94, align: 'right' });
        my += 14.5;
      }

      y = Math.max(leftY, metaBoxY + metaBoxH) + 12;

      // Crisp horizontal divider
      doc.save();
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(1).strokeColor(C.gold).stroke();
      doc.restore();
      y += 12;

      // =========================================================================
      // SECTION B: CUSTOMER, BILLING & SHIPPING INFORMATION
      // =========================================================================
      const cardGap = 12;
      const cardW = (CONTENT_W - cardGap) / 2;
      const shipCardX = MARGIN + cardW + cardGap;

      // Prepare text blocks to measure exact height for equal-height side-by-side cards
      const billingAddrText = inv.customer.billingAddressLines.length
        ? inv.customer.billingAddressLines.join('\n')
        : 'Address on file';
      const shippingAddrText = inv.customer.shippingAddressLines.length
        ? inv.customer.shippingAddressLines.join('\n')
        : billingAddrText;

      const billingContactLines = [];
      if (inv.customer.phone) billingContactLines.push(`Phone: ${inv.customer.phone}`);
      if (inv.customer.email) billingContactLines.push(`Email: ${inv.customer.email}`);
      if (inv.customer.gstin) billingContactLines.push(`Customer GSTIN: ${inv.customer.gstin}`);

      const shipMetaLines = [
        `Payment: ${inv.paymentMethod} (${inv.paymentStatus})`,
        `Tracking AWB: ${inv.trackingNumber}`,
        `Tax Regime: ${inv.summary.supplyType} · ${inv.summary.pricingMode}`
      ];
      if (inv.paymentId) shipMetaLines.push(`Payment Ref: ${inv.paymentId}`);

      doc.font(F_REG).fontSize(8);
      const billAddrH = doc.heightOfString(billingAddrText, { width: cardW - 20, lineGap: 1.5 });
      const billContactH = billingContactLines.length
        ? doc.heightOfString(billingContactLines.join('\n'), { width: cardW - 20, lineGap: 1.5 }) + 4
        : 0;
      const leftCardContentH = 16 + 14 + billAddrH + billContactH + 14;

      const shipAddrH = inv.customer.hasDifferentShippingAddress
        ? doc.heightOfString(shippingAddrText, { width: cardW - 20, lineGap: 1.5 }) + 14
        : doc.heightOfString(shippingAddrText, { width: cardW - 20, lineGap: 1.5 }) + 14;
      const shipMetaH = doc.heightOfString(shipMetaLines.join('\n'), { width: cardW - 20, lineGap: 1.5 }) + 6;
      const rightCardContentH = 16 + shipAddrH + shipMetaH + 12;

      const infoCardH = Math.max(leftCardContentH, rightCardContentH, 92);

      // Draw equal-height cards
      doc.save();
      doc.roundedRect(MARGIN, y, cardW, infoCardH, 4).fillAndStroke(C.white, C.border);
      doc.roundedRect(shipCardX, y, cardW, infoCardH, 4).fillAndStroke(C.white, C.border);
      // Subtle top label strip inside cards
      doc.rect(MARGIN + 1, y + 1, cardW - 2, 18).fill(C.softBg);
      doc.rect(shipCardX + 1, y + 1, cardW - 2, 18).fill(C.softBg);
      doc.restore();

      // Left Card: Billing Details
      doc.font(F_BOLD).fontSize(7.5).fillColor(C.wine)
        .text('BILLED TO (CUSTOMER DETAILS)', MARGIN + 10, y + 6, { width: cardW - 20 });
      let cyL = y + 24;
      doc.font(F_BOLD).fontSize(9.5).fillColor(C.ink)
        .text(inv.customer.name, MARGIN + 10, cyL, { width: cardW - 20 });
      cyL = doc.y + 2;
      doc.font(F_REG).fontSize(8).fillColor(C.body)
        .text(billingAddrText, MARGIN + 10, cyL, { width: cardW - 20, lineGap: 1.5 });
      cyL = doc.y + 4;
      if (billingContactLines.length) {
        doc.font(F_REG).fontSize(7.8).fillColor(C.muted)
          .text(billingContactLines.join('\n'), MARGIN + 10, cyL, { width: cardW - 20, lineGap: 1.5 });
      }

      // Right Card: Shipping & Fulfillment Details
      const shipTitle = inv.customer.hasDifferentShippingAddress
        ? 'SHIPPED TO (DIFFERENT ADDRESS)'
        : 'SHIPPING & FULFILLMENT DETAILS';
      doc.font(F_BOLD).fontSize(7.5).fillColor(C.wine)
        .text(shipTitle, shipCardX + 10, y + 6, { width: cardW - 20 });
      let cyR = y + 24;
      if (!inv.customer.hasDifferentShippingAddress) {
        doc.font(F_ITALIC).fontSize(7.4).fillColor(C.muted)
          .text('Same as Billing Address:', shipCardX + 10, cyR, { width: cardW - 20 });
        cyR = doc.y + 1;
      }
      doc.font(F_REG).fontSize(8).fillColor(C.body)
        .text(shippingAddrText, shipCardX + 10, cyR, { width: cardW - 20, lineGap: 1.5 });
      cyR = doc.y + 5;
      doc.font(F_REG).fontSize(7.6).fillColor(C.muted)
        .text(shipMetaLines.join('\n'), shipCardX + 10, cyR, { width: cardW - 20, lineGap: 1.5 });

      y += infoCardH + 14;

      // =========================================================================
      // SECTION C: PRODUCT DETAILS TABLE (10 DEDICATED COLUMNS, MULTI-PAGE SAFE)
      // =========================================================================
      // Total width = 523.28 pt
      const cols = [
        { key: 'serial',    label: '#',                  w: 20,    align: 'center' },
        { key: 'product',   label: 'Product & Description', w: 135.28, align: 'left' },
        { key: 'sku',       label: 'SKU',                w: 56,    align: 'left' },
        { key: 'size',      label: 'Size',               w: 30,    align: 'center' },
        { key: 'color',     label: 'Color',              w: 48,    align: 'left' },
        { key: 'qty',       label: 'Qty',                w: 24,    align: 'center' },
        { key: 'unitPrice', label: 'Unit Price',         w: 54,    align: 'right' },
        { key: 'discount',  label: 'Discount',           w: 44,    align: 'right' },
        { key: 'gstRate',   label: 'GST',                w: 34,    align: 'center' },
        { key: 'amount',    label: 'Amount',             w: 78,    align: 'right' }
      ];

      let colX = MARGIN;
      for (const col of cols) {
        col.x = colX;
        colX += col.w;
      }

      const drawContinuationHeader = () => {
        drawTopAccentBar();
        doc.font(F_BOLD).fontSize(9.5).fillColor(C.wine)
          .text(inv.company.legalName, MARGIN, 20, { width: 300 });
        doc.font(F_REG).fontSize(8.2).fillColor(C.muted)
          .text(`Tax Invoice ${inv.invoiceNumber}  |  Order #${inv.orderId}  (Continued)`, MARGIN + 260, 21, {
            width: CONTENT_W - 260,
            align: 'right'
          });
        doc.save();
        doc.moveTo(MARGIN, 36).lineTo(MARGIN + CONTENT_W, 36).lineWidth(0.75).strokeColor(C.gold).stroke();
        doc.restore();
        return 46;
      };

      const drawTableHeader = (startY) => {
        const headerH = 24;
        doc.save();
        doc.rect(MARGIN, startY, CONTENT_W, headerH).fill(C.headerBg);
        doc.restore();

        doc.font(F_BOLD).fontSize(7.4).fillColor(C.white);
        for (const col of cols) {
          doc.text(col.label, col.x + 3, startY + 7.5, {
            width: col.w - 6,
            align: col.align,
            lineBreak: false
          });
        }
        return startY + headerH;
      };

      y = drawTableHeader(y);

      const itemsList = inv.items.length > 0 ? inv.items : [{
        serial: 1,
        name: 'Artisanal Couture Garment',
        description: 'Bespoke SATINOSTITCH Creation',
        sku: 'SS-000-STD',
        hsnCode: '6204',
        size: 'Standard',
        color: 'Standard',
        quantity: 1,
        originalUnitPrice: inv.summary.finalAmount,
        unitPrice: inv.summary.finalAmount,
        discount: 0,
        gstRate: 5,
        lineTotal: inv.summary.finalAmount
      }];

      for (let i = 0; i < itemsList.length; i++) {
        const it = itemsList[i];
        const padX = 3;
        const padY = 6;

        // Calculate dynamic row height so no text clips or overlaps
        const prodColW = cols[1].w - padX * 2;
        doc.font(F_BOLD).fontSize(8);
        const nameH = doc.heightOfString(it.name, { width: prodColW, lineGap: 1 });
        doc.font(F_REG).fontSize(6.8);
        const subDesc = [it.description, `HSN: ${it.hsnCode}`].filter(Boolean).join(' · ');
        const descH = doc.heightOfString(subDesc, { width: prodColW, lineGap: 1 });

        doc.font(F_REG).fontSize(7.2);
        const skuH = doc.heightOfString(it.sku, { width: cols[2].w - padX * 2 });
        const colorH = doc.heightOfString(it.color, { width: cols[4].w - padX * 2 });

        const rowH = Math.max(24, nameH + descH + padY * 2 + 2, skuH + padY * 2, colorH + padY * 2);

        // Page break BEFORE row if it would overflow into footer zone
        if (y + rowH > FOOTER_SAFE_Y - 8) {
          doc.addPage();
          y = drawContinuationHeader();
          y = drawTableHeader(y);
        }

        // Subtle zebra striping for readability
        if (i % 2 === 1) {
          doc.save();
          doc.rect(MARGIN, y, CONTENT_W, rowH).fill('#FAFAF9');
          doc.restore();
        }

        // Bottom hairline border
        doc.save();
        doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).lineWidth(0.5).strokeColor(C.border).stroke();
        doc.restore();

        const cellY = y + padY;

        // 1. Serial
        doc.font(F_REG).fontSize(7.8).fillColor(C.muted)
          .text(String(it.serial), cols[0].x + padX, cellY, { width: cols[0].w - padX * 2, align: 'center' });

        // 2. Product Name + Description + HSN
        doc.font(F_BOLD).fontSize(8).fillColor(C.ink)
          .text(it.name, cols[1].x + padX, cellY, { width: prodColW, lineGap: 1 });
        doc.font(F_REG).fontSize(6.8).fillColor(C.muted)
          .text(subDesc, cols[1].x + padX, doc.y + 1, { width: prodColW, lineGap: 1 });

        // 3. SKU
        doc.font(F_REG).fontSize(7).fillColor(C.body)
          .text(it.sku, cols[2].x + padX, cellY, { width: cols[2].w - padX * 2, align: 'left' });

        // 4. Size
        doc.font(F_BOLD).fontSize(7.6).fillColor(C.ink)
          .text(String(it.size), cols[3].x + padX, cellY, { width: cols[3].w - padX * 2, align: 'center' });

        // 5. Color
        doc.font(F_REG).fontSize(7.4).fillColor(C.body)
          .text(String(it.color), cols[4].x + padX, cellY, { width: cols[4].w - padX * 2, align: 'left' });

        // 6. Quantity
        doc.font(F_BOLD).fontSize(7.8).fillColor(C.ink)
          .text(String(it.quantity), cols[5].x + padX, cellY, { width: cols[5].w - padX * 2, align: 'center' });

        // 7. Unit Price (shows original price if line had a product discount, else unitPrice)
        doc.font(F_REG).fontSize(7.6).fillColor(C.body)
          .text(cur(it.originalUnitPrice > it.unitPrice ? it.originalUnitPrice : it.unitPrice),
            cols[6].x + padX, cellY, { width: cols[6].w - padX * 2, align: 'right' });

        // 8. Discount
        doc.font(F_REG).fontSize(7.4).fillColor(it.discount > 0 ? C.green : C.muted)
          .text(it.discount > 0 ? `-${cur(it.discount)}` : '—',
            cols[7].x + padX, cellY, { width: cols[7].w - padX * 2, align: 'right' });

        // 9. GST %
        doc.font(F_REG).fontSize(7.6).fillColor(C.body)
          .text(`${it.gstRate}%`, cols[8].x + padX, cellY, { width: cols[8].w - padX * 2, align: 'center' });

        // 10. Final Line Amount
        doc.font(F_BOLD).fontSize(8).fillColor(C.ink)
          .text(cur(it.lineTotal), cols[9].x + padX, cellY, { width: cols[9].w - padX * 2, align: 'right' });

        y += rowH;
      }

      // Crisp bottom border under table
      doc.save();
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(1).strokeColor(C.borderStrong).stroke();
      doc.restore();
      y += 14;

      // =========================================================================
      // SECTION D: PAYMENT & TAX SUMMARY + AMOUNT IN WORDS
      // =========================================================================
      const s = inv.summary;
      const summaryRows = [
        { label: 'Subtotal', value: cur(s.subtotal), color: C.body, bold: false }
      ];
      if (s.productDiscount > 0) {
        summaryRows.push({ label: 'Product Discount', value: `- ${cur(s.productDiscount)}`, color: C.green, bold: true });
      }
      if (s.privilegeDiscount > 0) {
        const privLabel = s.couponCode ? `Privilege Discount (${s.couponCode})` : 'Privilege Discount';
        summaryRows.push({ label: privLabel, value: `- ${cur(s.privilegeDiscount)}`, color: C.green, bold: true });
      }
      summaryRows.push({
        label: (s.productDiscount > 0 || s.privilegeDiscount > 0) ? 'Taxable Amount (After Discount)' : 'Net Taxable Amount',
        value: cur(s.netTaxableAmount),
        color: C.ink,
        bold: true
      });

      if (s.cgstAmount > 0) {
        summaryRows.push({ label: s.cgstLabel, value: cur(s.cgstAmount), color: C.body, bold: false });
      }
      if (s.sgstAmount > 0) {
        summaryRows.push({ label: s.sgstLabel, value: cur(s.sgstAmount), color: C.body, bold: false });
      }
      if (s.igstAmount > 0) {
        summaryRows.push({ label: s.igstLabel, value: cur(s.igstAmount), color: C.body, bold: false });
      }
      summaryRows.push({ label: 'Total GST', value: cur(s.totalGst), color: C.ink, bold: true });
      summaryRows.push({
        label: 'Shipping Charges',
        value: s.shippingFee === 0 ? 'FREE' : cur(s.shippingFee),
        color: s.shippingFee === 0 ? C.green : C.body,
        bold: s.shippingFee === 0
      });
      if (s.additionalCharges > 0) {
        summaryRows.push({ label: 'Additional Charges', value: cur(s.additionalCharges), color: C.body, bold: false });
      }

      const summaryTableH = summaryRows.length * 16 + 34; // rows + prominent final total bar
      const footerBlockH = 104;                           // terms + signatory
      const neededTotalH = summaryTableH + 14 + footerBlockH;

      // Ensure summary + signatory never get awkwardly clipped across pages
      if (y + neededTotalH > FOOTER_SAFE_Y) {
        if (y + summaryTableH > FOOTER_SAFE_Y) {
          doc.addPage();
          y = drawContinuationHeader();
        }
      }

      const leftNotesW = 248;
      const sumBoxX = MARGIN + leftNotesW + 18;
      const sumBoxW = CONTENT_W - leftNotesW - 18;

      // Left column: Amount in Words + Tax/Payment Declaration
      const wordsText = s.amountInWords;
      doc.font(F_ITALIC).fontSize(8.2);
      const wordsTextH = doc.heightOfString(wordsText, { width: leftNotesW - 20, lineGap: 1.5 });
      const wordsBoxH = Math.max(46, wordsTextH + 26);

      doc.save();
      doc.roundedRect(MARGIN, y, leftNotesW, wordsBoxH, 4).fillAndStroke(C.softBg, C.border);
      doc.rect(MARGIN, y, 3, wordsBoxH).fill(C.gold);
      doc.restore();

      doc.font(F_BOLD).fontSize(7.4).fillColor(C.wine)
        .text('AMOUNT IN WORDS', MARGIN + 11, y + 7, { width: leftNotesW - 20 });
      doc.font(F_ITALIC).fontSize(8.3).fillColor(C.ink)
        .text(wordsText, MARGIN + 11, y + 20, { width: leftNotesW - 20, lineGap: 1.5 });

      const noteBoxY = y + wordsBoxH + 10;
      const paymentNotes = [
        `Payment Method: ${inv.paymentMethod}  ·  Status: ${inv.paymentStatus}`,
        `Supply Type: ${s.supplyType}`,
        `Pricing Basis: ${s.pricingMode}`,
        'Tax is payable on forward charge basis.'
      ];
      doc.font(F_REG).fontSize(7.4).fillColor(C.muted)
        .text(paymentNotes.join('\n'), MARGIN + 2, noteBoxY, { width: leftNotesW - 4, lineGap: 2.2 });

      // Right column: Financial Breakdown Table
      let sy = y;
      for (const row of summaryRows) {
        doc.font(row.bold ? F_BOLD : F_REG).fontSize(8.2).fillColor(row.color)
          .text(row.label, sumBoxX + 4, sy, { width: sumBoxW - 96 });
        doc.font(row.bold ? F_BOLD : F_REG).fontSize(8.3).fillColor(row.color)
          .text(row.value, sumBoxX + sumBoxW - 92, sy, { width: 88, align: 'right' });
        sy += 16;
      }

      // Prominent Final Invoice Amount Box
      sy += 4;
      doc.save();
      doc.roundedRect(sumBoxX, sy, sumBoxW, 28, 4).fill(C.wine);
      doc.restore();

      doc.font(F_BOLD).fontSize(9.5).fillColor(C.white)
        .text('Final Invoice Amount', sumBoxX + 10, sy + 8.5, { width: sumBoxW - 115 });
      doc.font(F_BOLD).fontSize(11).fillColor(C.white)
        .text(cur(s.finalAmount), sumBoxX + sumBoxW - 108, sy + 7, { width: 98, align: 'right' });

      y = Math.max(sy + 34, noteBoxY + 54) + 12;

      // =========================================================================
      // SECTION E: TERMS, RETURN POLICY, CONTACT & AUTHORIZED SIGNATORY
      // =========================================================================
      if (y + footerBlockH > FOOTER_SAFE_Y) {
        doc.addPage();
        y = drawContinuationHeader();
      }

      doc.save();
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.75).strokeColor(C.borderStrong).stroke();
      doc.restore();
      y += 10;

      const termsW = 325;
      const sigX = MARGIN + termsW + 20;
      const sigW = CONTENT_W - termsW - 20;

      // Left: Terms & Conditions + Return Policy + Contact Info
      doc.font(F_BOLD).fontSize(7.6).fillColor(C.ink)
        .text('TERMS, CONDITIONS & RETURN POLICY', MARGIN, y, { width: termsW });

      const termsLines = [
        '1. All garments are certified authentic SATINOSTITCH couture & handloom creations.',
        '2. Return & Exchange Policy: Returns/exchanges are accepted within 7 days of delivery for unworn items with original tags intact via the SATINOSTITCH Returns portal.',
        `3. Customer Support: ${inv.company.phone} | ${inv.company.email} (${inv.company.supportHours}).`,
        `4. All disputes are subject to ${inv.company.state} jurisdiction.`
      ];
      doc.font(F_REG).fontSize(7.1).fillColor(C.muted)
        .text(termsLines.join('\n'), MARGIN, doc.y + 3, { width: termsW, lineGap: 1.8 });

      // Right: Authorized Signatory Box
      doc.font(F_BOLD).fontSize(8).fillColor(C.ink)
        .text(`For ${inv.company.legalName}`, sigX, y, { width: sigW, align: 'right' });

      const sigLineY = y + 54;
      doc.save();
      doc.moveTo(sigX + 26, sigLineY).lineTo(sigX + sigW, sigLineY).lineWidth(0.75).strokeColor(C.ink).stroke();
      doc.restore();

      doc.font(F_BOLD).fontSize(7.8).fillColor(C.body)
        .text('Authorized Signatory', sigX, sigLineY + 5, { width: sigW, align: 'right' });
      doc.font(F_REG).fontSize(6.8).fillColor(C.muted)
        .text('This is a computer-generated tax invoice.', sigX, sigLineY + 16, { width: sigW, align: 'right' });

      // =========================================================================
      // RUNNING BRANDED FOOTER ON EVERY PAGE (Page X of Y)
      // =========================================================================
      const range = doc.bufferedPageRange();
      const totalPages = range.count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        doc.page.margins.bottom = 0;
        const footY = PAGE_H - 30;
        doc.save();
        doc.moveTo(MARGIN, footY - 6).lineTo(MARGIN + CONTENT_W, footY - 6).lineWidth(0.5).strokeColor(C.border).stroke();
        doc.restore();

        doc.font(F_REG).fontSize(7).fillColor(C.muted)
          .text(
            `${inv.company.legalName}  ·  GSTIN: ${inv.company.gstin}  ·  ${inv.company.email}  ·  ${inv.company.phone}`,
            MARGIN,
            footY,
            { width: CONTENT_W - 72, lineBreak: false }
          );

        doc.font(F_BOLD).fontSize(7).fillColor(C.wine)
          .text(
            `Page ${p + 1} of ${totalPages}`,
            MARGIN + CONTENT_W - 72,
            footY,
            { width: 72, align: 'right', lineBreak: false }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  getInvoiceDataForOrder,
  generateInvoicePdfBuffer,
  ensureInvoiceRecord,
  numberToWordsINR,
  COMPANY_LEGAL_NAME
};
