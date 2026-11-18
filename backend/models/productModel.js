const { query } = require('../config/db');
const variantModel = require('./variantModel');
const productDiscountModel = require('./productDiscountModel');
const gstService = require('../services/gstService');

function mapProductRow(r, variants = null, activeDiscountRow = null) {
  if (!r) return null;
  const basePrice = Number(r.price);
  const oldVal = r.old_price ? Number(r.old_price) : null;
  const pubStatus = r.publish_status || 'published';
  const gstRateVal = r.gst_rate !== undefined && r.gst_rate !== null ? Number(r.gst_rate) : 5;
  const gstTypeVal = r.gst_type || 'auto';
  const hsnVal = r.hsn_code || '6204';
  const activeDiscount = activeDiscountRow
    ? productDiscountModel.calculateDiscountPricing(basePrice, activeDiscountRow)
    : null;
  const effectivePrice = activeDiscount ? activeDiscount.discountedPrice : basePrice;

  return {
    id: r.id,
    name: r.name,
    cat: r.cat,
    type: r.type,
    col: r.col,
    price: basePrice,
    originalPrice: basePrice,
    effectivePrice,
    discountedPrice: activeDiscount ? activeDiscount.discountedPrice : null,
    savings: activeDiscount ? activeDiscount.savings : 0,
    activeDiscount,
    oldPrice: oldVal,
    old: oldVal,
    gstRate: gstRateVal,
    gst_rate: gstRateVal,
    gstType: gstTypeVal,
    gst_type: gstTypeVal,
    hsnCode: hsnVal,
    hsn_code: hsnVal,
    c1: r.c1,
    c2: r.c2,
    pat: r.pat,
    tag: r.tag,
    rating: Number(r.rating || 5.0),
    reviews: Number(r.reviews || 0),
    stock: Number(r.stock || 0),
    publishStatus: pubStatus,
    publish_status: pubStatus,
    image: r.image,
    images: Array.isArray(r.images) ? r.images : (typeof r.images === 'string' ? JSON.parse(r.images || '[]') : [r.image]),
    fabric: r.fabric,
    desc: r.description,
    description: r.description,
    sizes: Array.isArray(r.sizes) ? r.sizes : (typeof r.sizes === 'string' ? JSON.parse(r.sizes || '["XS","S","M","L","XL"]') : ["XS", "S", "M", "L", "XL"]),
    colors: Array.isArray(r.colors) ? r.colors : (typeof r.colors === 'string' ? JSON.parse(r.colors || '[]') : []),
    variants: Array.isArray(variants) ? variants : [],
    model3d: r.garment_model_url || r.model_3d || null,
    model_3d: r.garment_model_url || r.model_3d || null,
    garmentCategory: r.garment_category || null,
    garmentModelUrl: r.garment_model_url || r.model_3d || null,
    fabricTextureUrl: r.fabric_texture_url || null,
    normalMapUrl: r.normal_map_url || null,
    roughnessMapUrl: r.roughness_map_url || null,
    colourVariants: Array.isArray(r.colour_variants) ? r.colour_variants : (typeof r.colour_variants === 'string' ? JSON.parse(r.colour_variants || '[]') : []),
    garmentComponents: Array.isArray(r.garment_components) ? r.garment_components : (typeof r.garment_components === 'string' ? JSON.parse(r.garment_components || '[]') : []),
    compatibleAvatarTypes: Array.isArray(r.compatible_avatar_types) ? r.compatible_avatar_types : (typeof r.compatible_avatar_types === 'string' ? JSON.parse(r.compatible_avatar_types || '["female_couture_v1"]') : ["female_couture_v1"]),
    drapingConfiguration: r.draping_configuration ? (typeof r.draping_configuration === 'string' ? JSON.parse(r.draping_configuration) : r.draping_configuration) : {},
    assetStatus: r.asset_status || (r.garment_model_url || r.model_3d ? 'published' : 'unavailable'),
    viewsCount: Number(r.views_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

async function mapRowsWithVariants(rows) {
  if (!rows || rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const priceMap = new Map(rows.map(r => [Number(r.id), Number(r.price || 0)]));
  let variantMap = new Map();
  let discountMap = new Map();
  try {
    [variantMap, discountMap] = await Promise.all([
      variantModel.getVariantsForProductIds(ids).catch(() => new Map()),
      productDiscountModel.getActiveDiscountsMapForProductIds(ids, priceMap).catch(() => new Map())
    ]);
  } catch (e) {
    // Gracefully fall back if optional tables are unavailable
  }
  return rows.map(r => mapProductRow(r, variantMap.get(r.id) || [], discountMap.get(Number(r.id)) || null));
}

async function getProducts({ cat, type, col, c1, c2, sort, search, limit = 50, offset = 0, publishStatus } = {}) {
  let sql = `SELECT * FROM products WHERE 1=1`;
  const params = [];
  let idx = 1;

  // publish_status filter — default to 'published' for public; pass 'all' to bypass
  if (publishStatus !== 'all') {
    // Gracefully handle case where publish_status column may not exist yet
    sql += ` AND (publish_status IS NULL OR publish_status = $${idx++})`;
    params.push(publishStatus || 'published');
  }

  if (cat && cat !== 'all') {
    sql += ` AND cat = $${idx++}`;
    params.push(cat);
  }
  if (type) {
    sql += ` AND LOWER(type) = LOWER($${idx++})`;
    params.push(type);
  }
  if (col) {
    sql += ` AND col = $${idx++}`;
    params.push(col);
  }
  if (c1) {
    sql += ` AND (c1 = $${idx} OR c2 = $${idx})`;
    idx++;
    params.push(c1);
  }
  if (search) {
    sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(description) LIKE $${idx} OR LOWER(fabric) LIKE $${idx} OR LOWER(type) LIKE $${idx})`;
    idx++;
    params.push(`%${search.toLowerCase().trim()}%`);
  }

  // Sorting
  if (sort === 'price-asc') {
    sql += ` ORDER BY price ASC`;
  } else if (sort === 'price-desc') {
    sql += ` ORDER BY price DESC`;
  } else if (sort === 'rating') {
    sql += ` ORDER BY rating DESC, reviews DESC`;
  } else if (sort === 'popular') {
    sql += ` ORDER BY views_count DESC, reviews DESC`;
  } else {
    sql += ` ORDER BY id ASC`;
  }

  sql += ` LIMIT $${idx++} OFFSET $${idx++};`;
  params.push(limit, offset);

  const res = await query(sql, params);
  return mapRowsWithVariants(res.rows);
}

async function getProductsByStatus(status) {
  const sql = `
    SELECT * FROM products
    WHERE COALESCE(publish_status, 'published') = $1
    ORDER BY id ASC;
  `;
  const res = await query(sql, [status]);
  return mapRowsWithVariants(res.rows);
}

async function getAllProductsAdmin({ status, search } = {}) {
  let sql = `SELECT * FROM products WHERE 1=1`;
  const params = [];
  let idx = 1;

  if (status && status !== 'all') {
    sql += ` AND COALESCE(publish_status, 'published') = $${idx++}`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(description) LIKE $${idx} OR LOWER(fabric) LIKE $${idx} OR LOWER(type) LIKE $${idx})`;
    idx++;
    params.push(`%${String(search).toLowerCase().trim()}%`);
  }
  sql += ` ORDER BY id DESC;`;

  const res = await query(sql, params);
  return mapRowsWithVariants(res.rows);
}

async function setPublishStatus(id, status) {
  const sql = `
    UPDATE products
    SET publish_status = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await query(sql, [Number(id), status]);
  if (!res.rows[0]) return null;
  const variants = await variantModel.getVariantsByProductId(res.rows[0].id).catch(() => []);
  return mapProductRow(res.rows[0], variants);
}

async function getProductById(id) {
  const num = Number(id);
  if (isNaN(num)) return null;
  const sql = `SELECT * FROM products WHERE id = $1;`;
  const res = await query(sql, [num]);
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  const priceMap = new Map([[num, Number(row.price || 0)]]);
  const [variants, discountMap] = await Promise.all([
    variantModel.getVariantsByProductId(num).catch(() => []),
    productDiscountModel.getActiveDiscountsMapForProductIds([num], priceMap).catch(() => new Map())
  ]);
  return mapProductRow(row, variants, discountMap.get(num) || null);
}

async function createProduct(data) {
  const publishStatus = String(data.publishStatus || data.publish_status || 'published').toLowerCase();
  const isDraft = publishStatus === 'draft';

  let parsedSizes = ['XS', 'S', 'M', 'L', 'XL'];
  if (Array.isArray(data.sizes)) {
    parsedSizes = data.sizes.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof data.sizes === 'string' && data.sizes.trim()) {
    try { parsedSizes = JSON.parse(data.sizes); } catch { parsedSizes = ['XS', 'S', 'M', 'L', 'XL']; }
  }
  if (!parsedSizes.length && !isDraft) parsedSizes = ['XS', 'S', 'M', 'L', 'XL'];

  let parsedColors = [];
  if (Array.isArray(data.colors)) {
    parsedColors = data.colors.map(c => typeof c === 'string'
      ? { name: c.trim(), hex: '#5B1835' }
      : { name: String(c.name || '').trim(), hex: c.hex || '#5B1835' }
    ).filter(c => c.name);
  } else if (typeof data.colors === 'string' && data.colors.trim()) {
    try { parsedColors = JSON.parse(data.colors); } catch { parsedColors = []; }
  }
  if (!parsedColors.length) {
    parsedColors = data.c1
      ? [{ name: 'Primary Shade', hex: data.c1 }]
      : [{ name: 'Royal Wine', hex: '#5B1835' }];
  }

  let parsedVariants = null;
  if (Array.isArray(data.variants)) {
    parsedVariants = data.variants;
  } else if (typeof data.variants === 'string' && data.variants.trim()) {
    try { parsedVariants = JSON.parse(data.variants); } catch { parsedVariants = null; }
  }

  const gallery = Array.isArray(data.images)
    ? data.images
    : (typeof data.images === 'string' && data.images.trim()
      ? JSON.parse(data.images)
      : (data.image ? [data.image] : ['images/p1.jpg']));

  const rawPrice = data.price !== undefined && data.price !== null && data.price !== '' ? Number(data.price) : 0;
  const rawOld = (data.oldPrice ?? data.old);
  const oldPriceVal = rawOld !== undefined && rawOld !== null && rawOld !== '' ? Number(rawOld) : null;

  let initialStock = data.stock !== undefined && data.stock !== null && data.stock !== ''
    ? Math.max(0, parseInt(data.stock, 10) || 0)
    : (isDraft ? 0 : 10);

  if (Array.isArray(parsedVariants) && parsedVariants.length > 0) {
    initialStock = parsedVariants.reduce((sum, v) => {
      if (v.isActive === false || v.is_active === false) return sum;
      return sum + Math.max(0, parseInt(v.stock, 10) || 0);
    }, 0);
  }

  const primaryHex = parsedColors[0]?.hex || data.c1 || '#C6A15B';
  const secondaryHex = parsedColors[1]?.hex || data.c2 || null;

  const rawGstRate = data.gstRate !== undefined ? data.gstRate : data.gst_rate;
  const rawGstType = data.gstType !== undefined ? data.gstType : data.gst_type;
  const resolvedGstType = gstService.normalizeGstType(rawGstType, 'auto');
  const resolvedGstRate = resolvedGstType === 'exempt' ? 0 : gstService.normalizeRate(rawGstRate, 5);
  const resolvedHsn = String(data.hsnCode || data.hsn_code || '6204').trim().slice(0, 20) || '6204';

  const sql = `
    INSERT INTO products (
      name, cat, type, col, price, old_price, c1, c2, pat, tag, rating, reviews, stock,
      image, images, fabric, description, sizes, colors, model_3d, publish_status,
      gst_rate, gst_type, hsn_code
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21,
      $22, $23, $24
    ) RETURNING *;
  `;

  const res = await query(sql, [
    (data.name && String(data.name).trim()) ? String(data.name).trim() : 'Untitled Draft',
    data.cat || 'ethnic',
    (data.type && String(data.type).trim()) ? String(data.type).trim() : (isDraft ? 'Uncategorized' : 'Garment'),
    data.col || 'festive',
    isNaN(rawPrice) ? 0 : rawPrice,
    (oldPriceVal !== null && !isNaN(oldPriceVal)) ? oldPriceVal : null,
    primaryHex,
    secondaryHex,
    data.pat || 'Classic',
    data.tag || null,
    data.rating || 5.0,
    data.reviews || 0,
    initialStock,
    data.image || 'images/p1.jpg',
    JSON.stringify(gallery),
    data.fabric !== undefined ? data.fabric : (isDraft ? '' : 'Pure Handloom Silk'),
    data.desc ?? data.description ?? '',
    JSON.stringify(parsedSizes),
    JSON.stringify(parsedColors),
    data.model3d || data.model_3d || null,
    publishStatus,
    resolvedGstRate,
    resolvedGstType,
    resolvedHsn
  ]);

  const created = res.rows[0];

  // Persist size x color variant stock records
  if (Array.isArray(parsedVariants) && parsedVariants.length > 0) {
    await variantModel.bulkUpsertVariants(created.id, parsedVariants, { replaceMissing: true });
  } else if (parsedSizes.length > 0 && parsedColors.length > 0) {
    await variantModel.seedDefaultVariants(created.id, parsedSizes, parsedColors, initialStock);
  }

  return getProductById(created.id);
}

async function updateProduct(id, data) {
  const current = await getProductById(id);
  if (!current) return null;

  const hasModel3d = ('model3d' in data) || ('model_3d' in data) || ('garmentModelUrl' in data);
  const targetModel3d = hasModel3d ? (data.garmentModelUrl || data.model3d || data.model_3d || null) : current.model3d;
  const targetPublishStatus = data.publishStatus || data.publish_status || null;

  const rawOld = (data.oldPrice !== undefined ? data.oldPrice : data.old);
  const parsedOld = rawOld !== undefined && rawOld !== null && rawOld !== '' ? Number(rawOld) : null;

  const sql = `
    UPDATE products
    SET name = COALESCE($2, name),
        cat = COALESCE($3, cat),
        type = COALESCE($4, type),
        col = COALESCE($5, col),
        price = COALESCE($6, price),
        old_price = COALESCE($7, old_price),
        c1 = COALESCE($8, c1),
        c2 = COALESCE($9, c2),
        pat = COALESCE($10, pat),
        tag = COALESCE($11, tag),
        stock = COALESCE($12, stock),
        image = COALESCE($13, image),
        images = COALESCE($14::jsonb, images),
        fabric = COALESCE($15, fabric),
        description = COALESCE($16, description),
        sizes = COALESCE($17::jsonb, sizes),
        colors = COALESCE($18::jsonb, colors),
        model_3d = COALESCE($19::varchar, model_3d),
        garment_category = COALESCE($20, garment_category),
        garment_model_url = COALESCE($21::varchar, garment_model_url),
        fabric_texture_url = COALESCE($22, fabric_texture_url),
        colour_variants = COALESCE($23::jsonb, colour_variants),
        garment_components = COALESCE($24::jsonb, garment_components),
        compatible_avatar_types = COALESCE($25::jsonb, compatible_avatar_types),
        draping_configuration = COALESCE($26::jsonb, draping_configuration),
        asset_status = COALESCE($27, asset_status),
        publish_status = COALESCE($28, publish_status),
        gst_rate = COALESCE($29, gst_rate),
        gst_type = COALESCE($30, gst_type),
        hsn_code = COALESCE($31, hsn_code),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const descVal = data.desc !== undefined ? data.desc : (data.description !== undefined ? data.description : null);
  const rawGstTypeUpd = data.gstType !== undefined ? data.gstType : data.gst_type;
  const rawGstRateUpd = data.gstRate !== undefined ? data.gstRate : data.gst_rate;
  const nextGstType = rawGstTypeUpd !== undefined && rawGstTypeUpd !== null && rawGstTypeUpd !== ''
    ? gstService.normalizeGstType(rawGstTypeUpd, current.gstType || 'auto')
    : null;
  const nextGstRate = (nextGstType === 'exempt')
    ? 0
    : (rawGstRateUpd !== undefined && rawGstRateUpd !== null && rawGstRateUpd !== ''
      ? gstService.normalizeRate(rawGstRateUpd, current.gstRate ?? 5)
      : null);
  const rawHsnUpd = data.hsnCode !== undefined ? data.hsnCode : data.hsn_code;
  const nextHsn = rawHsnUpd !== undefined && rawHsnUpd !== null && String(rawHsnUpd).trim() !== ''
    ? String(rawHsnUpd).trim().slice(0, 20)
    : null;

  await query(sql, [
    id,
    data.name !== undefined && String(data.name).trim() !== '' ? String(data.name).trim() : null,
    data.cat || null,
    data.type !== undefined ? data.type : null,
    data.col || null,
    data.price !== undefined && data.price !== null && data.price !== '' ? Number(data.price) : null,
    (parsedOld !== null && !isNaN(parsedOld)) ? parsedOld : null,
    data.c1 || null,
    data.c2 || null,
    data.pat || null,
    data.tag || null,
    data.stock !== undefined && data.stock !== null && data.stock !== '' ? parseInt(data.stock, 10) : null,
    data.image || null,
    data.images ? (typeof data.images === 'string' ? data.images : JSON.stringify(data.images)) : null,
    data.fabric !== undefined ? data.fabric : null,
    descVal,
    data.sizes ? (typeof data.sizes === 'string' ? data.sizes : JSON.stringify(data.sizes)) : null,
    data.colors ? (typeof data.colors === 'string' ? data.colors : JSON.stringify(data.colors)) : null,
    targetModel3d || null,
    data.garmentCategory || data.category || null,
    targetModel3d || null,
    data.fabricTextureUrl || null,
    data.colourVariants ? (typeof data.colourVariants === 'string' ? data.colourVariants : JSON.stringify(data.colourVariants)) : null,
    data.garmentComponents ? (typeof data.garmentComponents === 'string' ? data.garmentComponents : JSON.stringify(data.garmentComponents)) : null,
    data.compatibleAvatarTypes ? (typeof data.compatibleAvatarTypes === 'string' ? data.compatibleAvatarTypes : JSON.stringify(data.compatibleAvatarTypes)) : null,
    data.drapingConfiguration ? (typeof data.drapingConfiguration === 'string' ? data.drapingConfiguration : JSON.stringify(data.drapingConfiguration)) : null,
    data.assetStatus || (targetModel3d ? 'published' : (data.assetStatus !== undefined ? data.assetStatus : null)),
    targetPublishStatus,
    nextGstRate,
    nextGstType,
    nextHsn
  ]);

  // If variants array was provided, bulk-sync variant stock & product metadata
  let parsedVariants = null;
  if (Array.isArray(data.variants)) {
    parsedVariants = data.variants;
  } else if (typeof data.variants === 'string' && data.variants.trim()) {
    try { parsedVariants = JSON.parse(data.variants); } catch { parsedVariants = null; }
  }

  if (Array.isArray(parsedVariants)) {
    await variantModel.bulkUpsertVariants(id, parsedVariants, { replaceMissing: true });
  }

  return getProductById(id);
}

async function deleteProduct(id) {
  const sql = `DELETE FROM products WHERE id = $1 RETURNING id;`;
  const res = await query(sql, [id]);
  return res.rowCount > 0;
}

async function updateProductStock(id, stockChange) {
  const sql = `
    UPDATE products
    SET stock = GREATEST(0, stock + $2),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, stock;
  `;
  const res = await query(sql, [id, stockChange]);
  return res.rows[0] || null;
}

async function setProductStock(id, newStock) {
  const sql = `
    UPDATE products
    SET stock = GREATEST(0, $2),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, stock;
  `;
  const res = await query(sql, [id, parseInt(newStock, 10)]);
  return res.rows[0] || null;
}

async function getTypes() {
  const sql = `SELECT DISTINCT type FROM products ORDER BY type ASC;`;
  const res = await query(sql);
  return res.rows.map(r => r.type);
}

/* Reviews */
async function getProductReviews(productId) {
  const sql = `
    SELECT id, product_id, user_name, rating, title, comment, verified_purchase, created_at
    FROM product_reviews
    WHERE product_id = $1
    ORDER BY created_at DESC;
  `;
  const res = await query(sql, [productId]);
  return res.rows;
}

async function createProductReview(productId, { userId, userName, rating, title, comment }) {
  const insertSql = `
    INSERT INTO product_reviews (product_id, user_id, user_name, rating, title, comment, verified_purchase)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    RETURNING *;
  `;
  const res = await query(insertSql, [
    productId,
    userId || null,
    userName || 'Patron of the Atelier',
    parseInt(rating, 10),
    title || null,
    comment
  ]);

  // Recalculate average rating & reviews count
  const statsSql = `
    UPDATE products
    SET rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM product_reviews WHERE product_id = $1),
        reviews = (SELECT COUNT(*)::int FROM product_reviews WHERE product_id = $1)
    WHERE id = $1
    RETURNING rating, reviews;
  `;
  await query(statsSql, [productId]);
  return res.rows[0];
}

/* Product View Tracking */
async function recordProductView(productId, userId, ipAddress) {
  await query(
    `INSERT INTO product_views (product_id, user_id, ip_address) VALUES ($1, $2, $3);`,
    [productId, userId || null, ipAddress || null]
  ).catch(() => { });

  await query(
    `UPDATE products SET views_count = views_count + 1 WHERE id = $1;`,
    [productId]
  ).catch(() => { });
}

/* Inventory Summary */
async function getInventorySummary() {
  const sql = `
    SELECT 
      id, name, cat, type, price, stock,
      CASE 
        WHEN stock = 0 THEN 'Out of Stock'
        WHEN stock <= 3 THEN 'Critical Low'
        WHEN stock <= 5 THEN 'Low Stock'
        ELSE 'Healthy'
      END AS status
    FROM products
    ORDER BY stock ASC, id ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

module.exports = {
  mapProductRow,
  getProducts,
  getProductsByStatus,
  getAllProductsAdmin,
  setPublishStatus,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  setProductStock,
  getTypes,
  getProductReviews,
  createProductReview,
  recordProductView,
  getInventorySummary
};

