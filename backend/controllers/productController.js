const productModel = require('../models/productModel');
const activityModel = require('../models/activityModel');

async function getProducts(req, res) {
  try {
    const filters = {
      cat: req.query.cat,
      type: req.query.type,
      col: req.query.col,
      c1: req.query.c1,
      c2: req.query.c2,
      sort: req.query.sort,
      search: req.query.search,
      limit: Math.min(100, parseInt(req.query.limit || '50', 10)),
      offset: parseInt(req.query.offset || '0', 10),
      publishStatus: 'published'   // public endpoint: only published products
    };
    const list = await productModel.getProducts(filters);
    res.json(list);
  } catch (err) {
    console.error('[Get Products Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve creations from catalog.' });
  }
}

const VALID_PUBLISH_STATUSES = ['published', 'draft', 'archived'];

async function getProductById(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const p = await productModel.getProductById(id);
    if (!p) return res.status(404).json({ error: 'Garment not found in atelier.' });

    const isAdmin = req.user && req.user.role === 'admin';
    if ((p.publishStatus || 'published') !== 'published' && !isAdmin) {
      return res.status(404).json({ error: 'Garment not found in atelier.' });
    }

    // Track view in background (only for public published views)
    if (!isAdmin) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userId = req.user ? req.user.id : null;
      productModel.recordProductView(id, userId, ip).catch(() => {});
    }

    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createProduct(req, res) {
  const body = req.body || {};
  const publishStatus = String(body.publishStatus || body.publish_status || 'published').toLowerCase();

  if (!VALID_PUBLISH_STATUSES.includes(publishStatus)) {
    return res.status(400).json({ error: `Invalid product status. Allowed: ${VALID_PUBLISH_STATUSES.join(', ')}` });
  }

  // Published products require essential catalog details; drafts allow incomplete data
  if (publishStatus === 'published') {
    const { name, price, cat } = body;
    if (!name || !String(name).trim() || price === undefined || price === '' || Number(price) <= 0 || !cat) {
      return res.status(400).json({ error: 'Garment name, a valid price greater than 0, and category are required to publish.' });
    }
  }

  try {
    const p = await productModel.createProduct({ ...body, publishStatus });
    const statusLabel = publishStatus === 'draft' ? 'saved as draft' : (publishStatus === 'archived' ? 'archived' : 'added to catalog');
    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: publishStatus === 'draft' ? 'product_draft_created' : 'product_created',
      description: `Creation ${statusLabel}: "${p.name}" (₹${p.price}) by ${req.user.name}`,
      metadata: { productId: p.id, name: p.name, price: p.price, publishStatus }
    }).catch(() => {});

    res.status(201).json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateProduct(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  const body = req.body || {};
  const requestedStatus = body.publishStatus || body.publish_status;
  if (requestedStatus && !VALID_PUBLISH_STATUSES.includes(String(requestedStatus).toLowerCase())) {
    return res.status(400).json({ error: `Invalid product status. Allowed: ${VALID_PUBLISH_STATUSES.join(', ')}` });
  }

  try {
    const existing = await productModel.getProductById(id);
    if (!existing) return res.status(404).json({ error: 'Garment not found.' });

    const finalStatus = requestedStatus ? String(requestedStatus).toLowerCase() : (existing.publishStatus || 'published');
    if (finalStatus === 'published') {
      const nextName = body.name !== undefined ? String(body.name).trim() : existing.name;
      const nextPrice = (body.price !== undefined && body.price !== null && body.price !== '') ? Number(body.price) : Number(existing.price);
      const nextCat = body.cat || existing.cat;
      if (!nextName || nextName === 'Untitled Draft' || isNaN(nextPrice) || nextPrice <= 0 || !nextCat) {
        return res.status(400).json({
          error: 'To publish this product, please provide a garment name, category, and selling price greater than 0 (or save it as a Draft).'
        });
      }
    }

    const p = await productModel.updateProduct(id, {
      ...body,
      ...(requestedStatus ? { publishStatus: finalStatus } : {})
    });

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'product_updated',
      description: `Creation updated: "${p.name}" (${p.publishStatus}) by ${req.user?.name || 'Administrator'}`,
      metadata: { productId: p.id, publishStatus: p.publishStatus }
    }).catch(() => {});

    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteProduct(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const ok = await productModel.deleteProduct(id);
    if (!ok) return res.status(404).json({ error: 'Garment not found.' });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'product_deleted',
      description: `Creation #${id} removed from atelier catalog by ${req.user.name}`,
      metadata: { productId: id }
    }).catch(() => {});

    res.json({ ok: true, message: 'Garment successfully archived from catalog.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getReviews(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
  try {
    const reviews = await productModel.getProductReviews(id);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createReview(req, res) {
  const productId = Number(req.params.id);
  const { rating, comment, title, userName } = req.body || {};
  if (isNaN(productId)) return res.status(400).json({ error: 'Invalid product ID' });
  if (!rating || !comment) {
    return res.status(400).json({ error: 'Rating (1-5) and testimonial text are required.' });
  }

  try {
    const userId = req.user ? req.user.id : null;
    const authorName = userName || (req.user ? req.user.name : 'Valued Patron');

    const rev = await productModel.createProductReview(productId, {
      userId,
      userName: authorName,
      rating: parseInt(rating, 10),
      title,
      comment
    });

    activityModel.logCustomerActivity({
      userId,
      userName: authorName,
      activityType: 'review_submitted',
      description: `New ${rating}★ review submitted for product #${productId} by ${authorName}`,
      metadata: { productId, rating }
    }).catch(() => {});

    res.status(201).json({ message: 'Your testimonial has been documented.', review: rev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function recordView(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userId = req.user ? req.user.id : null;
    await productModel.recordProductView(id, userId, ip);

    const p = await productModel.getProductById(id);
    if (p) {
      activityModel.logCustomerActivity({
        userId,
        userName: req.user ? req.user.name : 'Guest Visitor',
        activityType: 'product_view',
        description: `Viewed garment "${p.name}" (ID #${p.id})`,
        metadata: { productId: p.id, name: p.name, cat: p.cat }
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function setPublishStatus(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  const { status } = req.body || {};
  const normalized = status ? String(status).toLowerCase() : '';
  if (!normalized || !VALID_PUBLISH_STATUSES.includes(normalized)) {
    return res.status(400).json({ error: `Valid status required: ${VALID_PUBLISH_STATUSES.join(', ')}` });
  }

  try {
    const existing = await productModel.getProductById(id);
    if (!existing) return res.status(404).json({ error: 'Garment not found.' });

    if (normalized === 'published') {
      if (!existing.name || existing.name.trim() === '' || existing.name === 'Untitled Draft' || Number(existing.price) <= 0 || !existing.cat) {
        return res.status(400).json({
          error: 'This draft is incomplete. Please edit it to add a garment name, category, and selling price greater than 0 before publishing.'
        });
      }
    }

    const p = await productModel.setPublishStatus(id, normalized);

    activityModel.logCustomerActivity({
      userId: req.user?.id || 1,
      userName: req.user?.name || 'Administrator',
      activityType: 'product_status_changed',
      description: `Product "${p.name}" publish status set to "${normalized}" by ${req.user?.name || 'Administrator'}`,
      metadata: { productId: id, status: normalized }
    }).catch(() => {});

    res.json({ message: `Product status updated to "${normalized}".`, product: p });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function uploadImage(req, res) {
  const files = req.files && req.files.length ? req.files : (req.file ? [req.file] : []);
  if (!files.length) {
    return res.status(400).json({ error: 'No asset file uploaded.' });
  }
  const uploaded = files.map(f => ({
    filePath: `uploads/${f.filename}`,
    url: `uploads/${f.filename}`,
    filename: f.filename
  }));
  res.json({
    message: `${uploaded.length} atelier digital asset(s) successfully stored.`,
    filePath: uploaded[0].filePath,
    url: uploaded[0].url,
    files: uploaded,
    urls: uploaded.map(u => u.url)
  });
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getReviews,
  createReview,
  recordView,
  uploadImage,
  setPublishStatus
};

