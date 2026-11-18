const { pool, query } = require('../config/db');

function mapVariantRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    productId: r.product_id,
    size: r.size,
    colorName: r.color_name,
    colorHex: r.color_hex || '#000000',
    stock: Number(r.stock || 0),
    isActive: r.is_active !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function normalizeColorName(val) {
  return String(val || '').trim();
}

function normalizeSize(val) {
  return String(val || '').trim();
}

async function getVariantsByProductId(productId, executor = null) {
  const exec = executor || { query };
  const pid = Number(productId);
  if (isNaN(pid)) return [];
  const res = await exec.query(
    `SELECT id, product_id, size, color_name, color_hex, stock, is_active, created_at, updated_at
     FROM product_variant_stock
     WHERE product_id = $1
     ORDER BY id ASC;`,
    [pid]
  );
  return res.rows.map(mapVariantRow);
}

async function getVariantsForProductIds(productIds) {
  const map = new Map();
  if (!Array.isArray(productIds) || productIds.length === 0) return map;
  const numericIds = [...new Set(productIds.map(Number).filter(n => !isNaN(n)))];
  if (numericIds.length === 0) return map;

  const res = await query(
    `SELECT id, product_id, size, color_name, color_hex, stock, is_active, created_at, updated_at
     FROM product_variant_stock
     WHERE product_id = ANY($1::int[])
     ORDER BY product_id ASC, id ASC;`,
    [numericIds]
  );

  for (const row of res.rows) {
    const mapped = mapVariantRow(row);
    if (!map.has(mapped.productId)) map.set(mapped.productId, []);
    map.get(mapped.productId).push(mapped);
  }
  return map;
}

async function syncProductFromVariants(productId, executor = null, { syncMetadata = true } = {}) {
  const exec = executor || { query };
  const pid = Number(productId);

  const variants = await getVariantsByProductId(pid, exec);
  const activeVariants = variants.filter(v => v.isActive);
  const totalStock = activeVariants.reduce((sum, v) => sum + Math.max(0, Number(v.stock) || 0), 0);

  if (syncMetadata && variants.length > 0) {
    // Preserve order of sizes & unique colors across all defined variants
    const sizeSet = [];
    const colorMap = new Map();

    for (const v of variants) {
      if (v.size && !sizeSet.includes(v.size)) {
        sizeSet.push(v.size);
      }
      const cKey = v.colorName.toLowerCase();
      if (v.colorName && !colorMap.has(cKey)) {
        colorMap.set(cKey, { name: v.colorName, hex: v.colorHex || '#5B1835' });
      }
    }

    const colorsArr = Array.from(colorMap.values());
    const c1 = colorsArr[0]?.hex || null;
    const c2 = colorsArr[1]?.hex || null;

    await exec.query(
      `UPDATE products
       SET stock = $2,
           sizes = $3::jsonb,
           colors = $4::jsonb,
           c1 = COALESCE($5, c1),
           c2 = COALESCE($6, c2),
           updated_at = NOW()
       WHERE id = $1;`,
      [pid, totalStock, JSON.stringify(sizeSet), JSON.stringify(colorsArr), c1, c2]
    );

    return { totalStock, sizes: sizeSet, colors: colorsArr, variants };
  }

  await exec.query(
    `UPDATE products
     SET stock = $2,
         updated_at = NOW()
     WHERE id = $1;`,
    [pid, totalStock]
  );

  return { totalStock, variants };
}

async function upsertVariant(productId, { size, colorName, colorHex = '#5B1835', stock = 0, isActive = true }) {
  const pid = Number(productId);
  const cleanSize = normalizeSize(size);
  const cleanColor = normalizeColorName(colorName);
  const safeStock = Math.max(0, parseInt(stock, 10) || 0);
  const safeHex = String(colorHex || '#5B1835').trim();
  const activeFlag = isActive !== false;

  if (isNaN(pid) || !cleanSize || !cleanColor) {
    throw new Error('Valid productId, size, and colorName are required.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO product_variant_stock (product_id, size, color_name, color_hex, stock, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, size, color_name)
       DO UPDATE SET
         color_hex = EXCLUDED.color_hex,
         stock = EXCLUDED.stock,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *;`,
      [pid, cleanSize, cleanColor, safeHex, safeStock, activeFlag]
    );
    const synced = await syncProductFromVariants(pid, client, { syncMetadata: true });
    await client.query('COMMIT');
    return {
      variant: mapVariantRow(res.rows[0]),
      totalStock: synced.totalStock,
      variants: synced.variants
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function bulkUpsertVariants(productId, variants, { replaceMissing = true } = {}) {
  const pid = Number(productId);
  if (isNaN(pid)) throw new Error('Valid productId is required.');
  if (!Array.isArray(variants)) throw new Error('Variants must be an array.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Normalize & deduplicate incoming variants by (size, colorName)
    const normalizedMap = new Map();
    for (const raw of variants) {
      const size = normalizeSize(raw.size);
      const colorName = normalizeColorName(raw.colorName || raw.color_name || raw.color);
      if (!size || !colorName) continue;
      const colorHex = String(raw.colorHex || raw.color_hex || raw.hex || '#5B1835').trim();
      const stock = Math.max(0, parseInt(raw.stock, 10) || 0);
      const isActive = raw.isActive !== false && raw.is_active !== false;
      const key = `${size}::${colorName.toLowerCase()}`;
      normalizedMap.set(key, { size, colorName, colorHex, stock, isActive });
    }

    const cleaned = Array.from(normalizedMap.values());

    if (replaceMissing) {
      const existing = await client.query(
        `SELECT id, size, color_name FROM product_variant_stock WHERE product_id = $1;`,
        [pid]
      );
      const toDeleteIds = existing.rows
        .filter(r => !normalizedMap.has(`${normalizeSize(r.size)}::${normalizeColorName(r.color_name).toLowerCase()}`))
        .map(r => r.id);

      if (toDeleteIds.length > 0) {
        await client.query(
          `DELETE FROM product_variant_stock WHERE id = ANY($1::int[]);`,
          [toDeleteIds]
        );
      }
    }

    for (const v of cleaned) {
      await client.query(
        `INSERT INTO product_variant_stock (product_id, size, color_name, color_hex, stock, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (product_id, size, color_name)
         DO UPDATE SET
           color_hex = EXCLUDED.color_hex,
           stock = EXCLUDED.stock,
           is_active = EXCLUDED.is_active,
           updated_at = NOW();`,
        [pid, v.size, v.colorName, v.colorHex, v.stock, v.isActive]
      );
    }

    const synced = await syncProductFromVariants(pid, client, { syncMetadata: cleaned.length > 0 });
    await client.query('COMMIT');
    return synced;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateVariantStock(productId, { variantId, size, colorName, stock, delta, isActive }) {
  const pid = Number(productId);
  if (isNaN(pid)) throw new Error('Valid productId is required.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetRow = null;
    if (variantId !== undefined && variantId !== null) {
      const found = await client.query(
        `SELECT * FROM product_variant_stock WHERE id = $1 AND product_id = $2;`,
        [Number(variantId), pid]
      );
      targetRow = found.rows[0] || null;
    } else if (size && colorName) {
      const found = await client.query(
        `SELECT * FROM product_variant_stock
         WHERE product_id = $1 AND UPPER(TRIM(size)) = UPPER(TRIM($2)) AND LOWER(TRIM(color_name)) = LOWER(TRIM($3))
         LIMIT 1;`,
        [pid, normalizeSize(size), normalizeColorName(colorName)]
      );
      targetRow = found.rows[0] || null;
    }

    if (!targetRow) {
      await client.query('ROLLBACK');
      return null;
    }

    let nextStock = Number(targetRow.stock || 0);
    if (stock !== undefined && stock !== null && stock !== '') {
      nextStock = Math.max(0, parseInt(stock, 10) || 0);
    } else if (delta !== undefined && delta !== null && delta !== '') {
      nextStock = Math.max(0, nextStock + (parseInt(delta, 10) || 0));
    }

    const nextActive = isActive !== undefined ? Boolean(isActive) : targetRow.is_active;

    const updated = await client.query(
      `UPDATE product_variant_stock
       SET stock = $2,
           is_active = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *;`,
      [targetRow.id, nextStock, nextActive]
    );

    const synced = await syncProductFromVariants(pid, client, { syncMetadata: false });
    await client.query('COMMIT');

    return {
      variant: mapVariantRow(updated.rows[0]),
      totalStock: synced.totalStock,
      variants: synced.variants
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteVariant(productId, { variantId, size, colorName }) {
  const pid = Number(productId);
  if (isNaN(pid)) throw new Error('Valid productId is required.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let res;
    if (variantId !== undefined && variantId !== null) {
      res = await client.query(
        `DELETE FROM product_variant_stock WHERE id = $1 AND product_id = $2 RETURNING id;`,
        [Number(variantId), pid]
      );
    } else if (size && colorName) {
      res = await client.query(
        `DELETE FROM product_variant_stock
         WHERE product_id = $1 AND UPPER(TRIM(size)) = UPPER(TRIM($2)) AND LOWER(TRIM(color_name)) = LOWER(TRIM($3))
         RETURNING id;`,
        [pid, normalizeSize(size), normalizeColorName(colorName)]
      );
    } else {
      await client.query('ROLLBACK');
      throw new Error('Provide either variantId or size and colorName.');
    }

    if (res.rowCount === 0) {
      await client.query('ROLLBACK');
      return { deleted: false };
    }

    const synced = await syncProductFromVariants(pid, client, { syncMetadata: true });
    await client.query('COMMIT');
    return {
      deleted: true,
      totalStock: synced.totalStock,
      variants: synced.variants
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function seedDefaultVariants(productId, sizes, colors, totalStock = 0) {
  const sizeArr = Array.isArray(sizes) && sizes.length ? sizes : ['XS', 'S', 'M', 'L', 'XL'];
  const colorArr = Array.isArray(colors) && colors.length
    ? colors.map(c => typeof c === 'string'
        ? { name: c, hex: '#5B1835' }
        : { name: c.name || 'Primary Shade', hex: c.hex || '#5B1835' })
    : [{ name: 'Primary Shade', hex: '#5B1835' }];

  const combos = sizeArr.length * colorArr.length;
  const safeTotal = Math.max(0, parseInt(totalStock, 10) || 0);
  const baseQty = combos > 0 ? Math.floor(safeTotal / combos) : 0;
  let remainder = combos > 0 ? safeTotal % combos : 0;

  const variants = [];
  for (const s of sizeArr) {
    for (const c of colorArr) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      variants.push({
        size: String(s).trim(),
        colorName: String(c.name).trim(),
        colorHex: c.hex || '#5B1835',
        stock: baseQty + extra,
        isActive: true
      });
    }
  }

  return bulkUpsertVariants(productId, variants, { replaceMissing: true });
}

/**
 * Validates availability of a specific (productId, size, color) variant.
 * If the product has variant rows in product_variant_stock, enforces exact variant stock.
 * Otherwise falls back gracefully to legacy products.stock.
 */
async function validateVariantAvailability(productId, size, colorName, requestedQty = 1, productStockFallback = 0) {
  const pid = Number(productId);
  const qty = Math.max(1, parseInt(requestedQty, 10) || 1);
  const variants = await getVariantsByProductId(pid);

  if (!variants.length) {
    const avail = Math.max(0, Number(productStockFallback || 0));
    return {
      hasVariants: false,
      available: avail >= qty,
      availableStock: avail,
      variant: null,
      error: avail < qty ? `Only ${avail} unit(s) available in atelier.` : null
    };
  }

  const cleanSize = normalizeSize(size);
  const cleanColor = normalizeColorName(colorName);

  // Match exact size & color (case-insensitive)
  let match = variants.find(v =>
    v.size.toUpperCase() === cleanSize.toUpperCase() &&
    v.colorName.toLowerCase() === cleanColor.toLowerCase()
  );

  // If color was not supplied or generic placeholder, match by size if unambiguous or active
  if (!match && (!cleanColor || cleanColor.toLowerCase() === 'selected shade')) {
    const sizeMatches = variants.filter(v => v.size.toUpperCase() === cleanSize.toUpperCase() && v.isActive);
    match = sizeMatches.find(v => v.stock >= qty) || sizeMatches[0] || null;
  }

  if (!match) {
    return {
      hasVariants: true,
      available: false,
      availableStock: 0,
      variant: null,
      error: `Selected variant (${cleanSize}${cleanColor ? ` · ${cleanColor}` : ''}) is unavailable.`
    };
  }

  if (!match.isActive || match.stock <= 0) {
    return {
      hasVariants: true,
      available: false,
      availableStock: 0,
      variant: match,
      error: `Variant (${match.size} · ${match.colorName}) is currently out of stock.`
    };
  }

  if (match.stock < qty) {
    return {
      hasVariants: true,
      available: false,
      availableStock: match.stock,
      variant: match,
      error: `Only ${match.stock} unit(s) available for variant (${match.size} · ${match.colorName}).`
    };
  }

  return {
    hasVariants: true,
    available: true,
    availableStock: match.stock,
    variant: match,
    error: null
  };
}

/**
 * Atomically deducts stock for an ordered item inside an existing DB transaction client.
 */
async function deductVariantStock(client, productId, size, colorName, qty) {
  const pid = Number(productId);
  const amount = Math.max(1, parseInt(qty, 10) || 1);

  const countRes = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM product_variant_stock WHERE product_id = $1;`,
    [pid]
  );

  if (countRes.rows[0].cnt === 0) {
    // Legacy product without variant rows
    const upd = await client.query(
      `UPDATE products
       SET stock = stock - $2, updated_at = NOW()
       WHERE id = $1 AND stock >= $2
       RETURNING stock;`,
      [pid, amount]
    );
    if (upd.rowCount === 0) {
      const err = new Error(`Insufficient stock for product #${pid}.`);
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  const cleanSize = normalizeSize(size || 'M');
  const cleanColor = normalizeColorName(colorName);

  let target = null;
  if (cleanColor && cleanColor.toLowerCase() !== 'selected shade') {
    const res = await client.query(
      `SELECT id, size, color_name, stock, is_active
       FROM product_variant_stock
       WHERE product_id = $1
         AND UPPER(TRIM(size)) = UPPER(TRIM($2))
         AND LOWER(TRIM(color_name)) = LOWER(TRIM($3))
       FOR UPDATE;`,
      [pid, cleanSize, cleanColor]
    );
    target = res.rows[0] || null;
  } else {
    const res = await client.query(
      `SELECT id, size, color_name, stock, is_active
       FROM product_variant_stock
       WHERE product_id = $1
         AND UPPER(TRIM(size)) = UPPER(TRIM($2))
         AND is_active = TRUE
       ORDER BY stock DESC
       LIMIT 1
       FOR UPDATE;`,
      [pid, cleanSize]
    );
    target = res.rows[0] || null;
  }

  if (!target || !target.is_active || Number(target.stock) < amount) {
    const avail = target && target.is_active ? Number(target.stock) : 0;
    const label = `${cleanSize}${cleanColor ? ` · ${cleanColor}` : ''}`;
    const err = new Error(`Insufficient stock for variant (${label}). Only ${avail} unit(s) available.`);
    err.statusCode = 400;
    throw err;
  }

  await client.query(
    `UPDATE product_variant_stock
     SET stock = stock - $2, updated_at = NOW()
     WHERE id = $1;`,
    [target.id, amount]
  );

  await syncProductFromVariants(pid, client, { syncMetadata: false });
}

/**
 * Restocks a specific variant when an order is cancelled.
 */
async function restockVariantStock(productId, size, colorName, qty) {
  const pid = Number(productId);
  const amount = Math.max(1, parseInt(qty, 10) || 1);
  if (isNaN(pid)) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cleanSize = normalizeSize(size || 'M');
    const cleanColor = normalizeColorName(colorName);

    let res;
    if (cleanColor) {
      res = await client.query(
        `UPDATE product_variant_stock
         SET stock = stock + $4, updated_at = NOW()
         WHERE product_id = $1
           AND UPPER(TRIM(size)) = UPPER(TRIM($2))
           AND LOWER(TRIM(color_name)) = LOWER(TRIM($3))
         RETURNING id;`,
        [pid, cleanSize, cleanColor, amount]
      );
    } else {
      res = await client.query(
        `UPDATE product_variant_stock
         SET stock = stock + $3, updated_at = NOW()
         WHERE id = (
           SELECT id FROM product_variant_stock
           WHERE product_id = $1 AND UPPER(TRIM(size)) = UPPER(TRIM($2))
           ORDER BY id ASC LIMIT 1
         )
         RETURNING id;`,
        [pid, cleanSize, amount]
      );
    }

    if (res.rowCount > 0) {
      await syncProductFromVariants(pid, client, { syncMetadata: false });
    } else {
      await client.query(
        `UPDATE products SET stock = stock + $2, updated_at = NOW() WHERE id = $1;`,
        [pid, amount]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  mapVariantRow,
  getVariantsByProductId,
  getVariantsForProductIds,
  syncProductFromVariants,
  upsertVariant,
  bulkUpsertVariants,
  updateVariantStock,
  deleteVariant,
  seedDefaultVariants,
  validateVariantAvailability,
  deductVariantStock,
  restockVariantStock
};
