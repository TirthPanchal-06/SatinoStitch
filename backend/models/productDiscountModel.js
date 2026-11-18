const { pool, query } = require('../config/db');

function round2(value) {
  const n = Number(value);
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeDiscountStatus(row, now = new Date()) {
  if (!row) return 'inactive';
  if (row.is_active === false) return 'inactive';
  const start = new Date(row.start_date);
  const end = new Date(row.end_date);
  if (now < start) return 'scheduled';
  if (now > end) return 'expired';
  return 'active';
}

function calculateDiscountPricing(originalPrice, discountRow) {
  const orig = round2(Number(originalPrice || 0));
  if (!discountRow || orig <= 0) return null;

  const type = String(discountRow.discount_type || discountRow.discountType || '').toLowerCase();
  const val = round2(Number(discountRow.discount_value ?? discountRow.discountValue ?? 0));
  if (val <= 0) return null;

  let savings = 0;
  if (type === 'percentage') {
    if (val >= 100) return null;
    savings = round2((orig * val) / 100);
  } else if (type === 'fixed') {
    if (val >= orig) return null; // Never allow discount >= product price
    savings = val;
  } else {
    return null;
  }

  if (savings <= 0 || savings >= orig) return null;

  const discountedPrice = round2(orig - savings);
  const discountPercent = Math.round((savings / orig) * 100);

  return {
    id: discountRow.id,
    name: discountRow.name,
    discountType: type,
    discountValue: val,
    originalPrice: orig,
    discountedPrice,
    savings,
    discountPercent,
    startDate: discountRow.start_date || discountRow.startDate,
    endDate: discountRow.end_date || discountRow.endDate,
    description: discountRow.description || ''
  };
}

/**
 * Batch-loads active selected-product discounts for a list of product IDs.
 * Enforces strictly ONE discount per product (prevents duplicate/conflicting discounts).
 */
async function getActiveDiscountsMapForProductIds(productIds, productPricesById = null) {
  const result = new Map();
  if (!Array.isArray(productIds) || productIds.length === 0) return result;
  const numericIds = [...new Set(productIds.map(Number).filter(n => !isNaN(n)))];
  if (numericIds.length === 0) return result;

  const res = await query(
    `SELECT
       pdi.product_id,
       pd.id,
       pd.name,
       pd.discount_type,
       pd.discount_value,
       pd.start_date,
       pd.end_date,
       pd.is_active,
       pd.description
     FROM product_discount_items pdi
     JOIN product_discounts pd ON pd.id = pdi.discount_id
     WHERE pdi.product_id = ANY($1::int[])
       AND pd.is_active = TRUE
       AND pd.start_date <= NOW()
       AND pd.end_date >= NOW()
     ORDER BY pd.updated_at DESC, pd.id DESC;`,
    [numericIds]
  );

  for (const row of res.rows) {
    const pid = Number(row.product_id);
    if (!result.has(pid)) {
      result.set(pid, row);
    } else if (productPricesById && productPricesById.has(pid)) {
      // Defensive single-discount tie-breaker: keep the single discount giving higher valid savings
      const price = productPricesById.get(pid);
      const curPricing = calculateDiscountPricing(price, result.get(pid));
      const nextPricing = calculateDiscountPricing(price, row);
      if (nextPricing && (!curPricing || nextPricing.savings > curPricing.savings)) {
        result.set(pid, row);
      }
    }
  }
  return result;
}

async function validateDiscountPayload(client, payload, excludeDiscountId = null) {
  const name = String(payload.name || '').trim();
  const discountType = String(payload.discountType || payload.discount_type || '').trim().toLowerCase();
  const discountValue = round2(Number(payload.discountValue ?? payload.discount_value));
  const rawStart = payload.startDate || payload.start_date;
  const rawEnd = payload.endDate || payload.end_date;
  const isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : true;
  const description = payload.description ? String(payload.description).trim().slice(0, 500) : null;

  if (!name || name.length < 2) {
    const err = new Error('Discount campaign name is required.');
    err.statusCode = 400;
    throw err;
  }

  if (!['percentage', 'fixed'].includes(discountType)) {
    const err = new Error('Discount type must be either "percentage" or "fixed".');
    err.statusCode = 400;
    throw err;
  }

  if (!isFinite(discountValue) || discountValue <= 0) {
    const err = new Error('Discount value must be greater than 0.');
    err.statusCode = 400;
    throw err;
  }

  if (discountType === 'percentage' && discountValue >= 100) {
    const err = new Error('Percentage discount must be less than 100%.');
    err.statusCode = 400;
    throw err;
  }

  const startDate = new Date(rawStart);
  const endDate = new Date(rawEnd);
  if (!rawStart || isNaN(startDate.getTime())) {
    const err = new Error('A valid discount start date is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!rawEnd || isNaN(endDate.getTime())) {
    const err = new Error('A valid discount end date is required.');
    err.statusCode = 400;
    throw err;
  }
  if (endDate <= startDate) {
    const err = new Error('Discount end date must be after the start date.');
    err.statusCode = 400;
    throw err;
  }

  const rawProductIds = Array.isArray(payload.productIds || payload.product_ids)
    ? (payload.productIds || payload.product_ids)
    : [];
  const productIds = [...new Set(rawProductIds.map(Number).filter(n => !isNaN(n) && n > 0))];

  if (productIds.length === 0) {
    const err = new Error('Please select at least one product for this discount.');
    err.statusCode = 400;
    throw err;
  }

  // Verify all selected products exist & check fixed discount against product prices
  const prodRes = await client.query(
    `SELECT id, name, price FROM products WHERE id = ANY($1::int[]);`,
    [productIds]
  );

  if (prodRes.rows.length !== productIds.length) {
    const foundSet = new Set(prodRes.rows.map(r => Number(r.id)));
    const missing = productIds.filter(id => !foundSet.has(id));
    const err = new Error(`Selected product(s) not found: #${missing.join(', #')}.`);
    err.statusCode = 400;
    throw err;
  }

  for (const prod of prodRes.rows) {
    const prodPrice = Number(prod.price || 0);
    if (prodPrice <= 0) {
      const err = new Error(`Product "${prod.name}" has an invalid price (₹${prodPrice}) and cannot receive a discount.`);
      err.statusCode = 400;
      throw err;
    }
    if (discountType === 'fixed' && discountValue >= prodPrice) {
      const err = new Error(
        `Fixed discount (₹${discountValue}) cannot equal or exceed the price of "${prod.name}" (₹${prodPrice}).`
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // Prevent conflicting / overlapping active or scheduled discounts on the same products
  if (isActive) {
    const conflictSql = `
      SELECT pd.id, pd.name, p.id AS product_id, p.name AS product_name
      FROM product_discount_items pdi
      JOIN product_discounts pd ON pd.id = pdi.discount_id
      JOIN products p ON p.id = pdi.product_id
      WHERE pdi.product_id = ANY($1::int[])
        AND pd.is_active = TRUE
        AND pd.start_date < $3
        AND pd.end_date > $2
        AND ($4::int IS NULL OR pd.id != $4)
      LIMIT 1;
    `;
    const conflictRes = await client.query(conflictSql, [
      productIds,
      startDate.toISOString(),
      endDate.toISOString(),
      excludeDiscountId ? Number(excludeDiscountId) : null
    ]);

    if (conflictRes.rows.length > 0) {
      const c = conflictRes.rows[0];
      const err = new Error(
        `Conflicting discount detected: "${c.product_name}" is already included in "${c.name}" during this schedule. Deactivate or adjust dates first.`
      );
      err.statusCode = 409;
      throw err;
    }
  }

  return {
    name,
    discountType,
    discountValue,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    isActive,
    description,
    productIds
  };
}

function mapAdminDiscountRow(row, items = []) {
  const status = computeDiscountStatus(row);
  const products = items.map(it => {
    const price = Number(it.price || 0);
    const calc = calculateDiscountPricing(price, row);
    return {
      id: it.product_id,
      name: it.product_name,
      price,
      image: it.image || 'images/p1.jpg',
      cat: it.cat,
      discountedPrice: calc ? calc.discountedPrice : price,
      savings: calc ? calc.savings : 0,
      discountPercent: calc ? calc.discountPercent : 0
    };
  });

  return {
    id: row.id,
    name: row.name,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: Boolean(row.is_active),
    status,
    description: row.description || '',
    productIds: products.map(p => p.id),
    productCount: products.length,
    products,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getAllDiscountsAdmin({ status = 'all', search = '' } = {}) {
  const discRes = await query(`SELECT * FROM product_discounts ORDER BY created_at DESC, id DESC;`);
  const itemsRes = await query(`
    SELECT
      pdi.discount_id,
      pdi.product_id,
      p.name AS product_name,
      p.price,
      p.image,
      p.cat
    FROM product_discount_items pdi
    JOIN products p ON p.id = pdi.product_id
    ORDER BY pdi.id ASC;
  `);

  const itemsByDiscount = new Map();
  for (const r of itemsRes.rows) {
    if (!itemsByDiscount.has(r.discount_id)) itemsByDiscount.set(r.discount_id, []);
    itemsByDiscount.get(r.discount_id).push(r);
  }

  const allMapped = discRes.rows.map(row => mapAdminDiscountRow(row, itemsByDiscount.get(row.id) || []));

  const stats = {
    total: allMapped.length,
    active: allMapped.filter(d => d.status === 'active').length,
    scheduled: allMapped.filter(d => d.status === 'scheduled').length,
    expired: allMapped.filter(d => d.status === 'expired').length,
    inactive: allMapped.filter(d => d.status === 'inactive').length
  };

  let filtered = allMapped;
  if (status && status !== 'all') {
    filtered = filtered.filter(d => d.status === String(status).toLowerCase());
  }
  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    filtered = filtered.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      d.products.some(p => p.name.toLowerCase().includes(q))
    );
  }

  return { discounts: filtered, stats };
}

async function getDiscountById(id) {
  const numId = Number(id);
  if (isNaN(numId)) return null;
  const discRes = await query(`SELECT * FROM product_discounts WHERE id = $1;`, [numId]);
  if (!discRes.rows[0]) return null;
  const itemsRes = await query(
    `SELECT pdi.discount_id, pdi.product_id, p.name AS product_name, p.price, p.image, p.cat
     FROM product_discount_items pdi
     JOIN products p ON p.id = pdi.product_id
     WHERE pdi.discount_id = $1
     ORDER BY pdi.id ASC;`,
    [numId]
  );
  return mapAdminDiscountRow(discRes.rows[0], itemsRes.rows);
}

async function createDiscount(payload, createdBy = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clean = await validateDiscountPayload(client, payload, null);

    const insRes = await client.query(
      `INSERT INTO product_discounts (
         name, discount_type, discount_value, start_date, end_date, is_active, description, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id;`,
      [
        clean.name,
        clean.discountType,
        clean.discountValue,
        clean.startDate,
        clean.endDate,
        clean.isActive,
        clean.description,
        createdBy || null
      ]
    );
    const discountId = insRes.rows[0].id;

    // Bulk insert unlimited selected products cleanly in one query
    await client.query(
      `INSERT INTO product_discount_items (discount_id, product_id)
       SELECT $1, UNNEST($2::int[])
       ON CONFLICT (discount_id, product_id) DO NOTHING;`,
      [discountId, clean.productIds]
    );

    await client.query('COMMIT');
    return getDiscountById(discountId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateDiscount(id, payload) {
  const numId = Number(id);
  if (isNaN(numId)) {
    const err = new Error('Invalid discount ID.');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const curRes = await client.query(`SELECT * FROM product_discounts WHERE id = $1 FOR UPDATE;`, [numId]);
    if (!curRes.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const curItemsRes = await client.query(`SELECT product_id FROM product_discount_items WHERE discount_id = $1;`, [numId]);
    const current = curRes.rows[0];
    const mergedPayload = {
      name: payload.name !== undefined ? payload.name : current.name,
      discountType: payload.discountType !== undefined ? payload.discountType : (payload.discount_type !== undefined ? payload.discount_type : current.discount_type),
      discountValue: payload.discountValue !== undefined ? payload.discountValue : (payload.discount_value !== undefined ? payload.discount_value : current.discount_value),
      startDate: payload.startDate !== undefined ? payload.startDate : (payload.start_date !== undefined ? payload.start_date : current.start_date),
      endDate: payload.endDate !== undefined ? payload.endDate : (payload.end_date !== undefined ? payload.end_date : current.end_date),
      isActive: payload.isActive !== undefined ? payload.isActive : (payload.is_active !== undefined ? payload.is_active : current.is_active),
      description: payload.description !== undefined ? payload.description : current.description,
      productIds: (payload.productIds || payload.product_ids) !== undefined
        ? (payload.productIds || payload.product_ids)
        : curItemsRes.rows.map(r => r.product_id)
    };

    const clean = await validateDiscountPayload(client, mergedPayload, numId);

    await client.query(
      `UPDATE product_discounts
       SET name = $2,
           discount_type = $3,
           discount_value = $4,
           start_date = $5,
           end_date = $6,
           is_active = $7,
           description = $8,
           updated_at = NOW()
       WHERE id = $1;`,
      [
        numId,
        clean.name,
        clean.discountType,
        clean.discountValue,
        clean.startDate,
        clean.endDate,
        clean.isActive,
        clean.description
      ]
    );

    await client.query(`DELETE FROM product_discount_items WHERE discount_id = $1;`, [numId]);
    await client.query(
      `INSERT INTO product_discount_items (discount_id, product_id)
       SELECT $1, UNNEST($2::int[])
       ON CONFLICT (discount_id, product_id) DO NOTHING;`,
      [numId, clean.productIds]
    );

    await client.query('COMMIT');
    return getDiscountById(numId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteDiscount(id) {
  const numId = Number(id);
  if (isNaN(numId)) return false;
  const res = await query(`DELETE FROM product_discounts WHERE id = $1 RETURNING id;`, [numId]);
  return res.rowCount > 0;
}

module.exports = {
  computeDiscountStatus,
  calculateDiscountPricing,
  getActiveDiscountsMapForProductIds,
  getAllDiscountsAdmin,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount
};
