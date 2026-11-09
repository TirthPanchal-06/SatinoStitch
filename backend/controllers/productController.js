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
      offset: parseInt(req.query.offset || '0', 10)
    };
    const list = await productModel.getProducts(filters);
    res.json(list);
  } catch (err) {
    console.error('[Get Products Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve creations from catalog.' });
  }
}

async function getProductById(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const p = await productModel.getProductById(id);
    if (!p) return res.status(404).json({ error: 'Garment not found in atelier.' });

    // Track view in background
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userId = req.user ? req.user.id : null;
    productModel.recordProductView(id, userId, ip).catch(() => {});

    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createProduct(req, res) {
  const { name, price, cat } = req.body || {};
  if (!name || price === undefined || !cat) {
    return res.status(400).json({ error: 'Garment name, price, and category are required.' });
  }

  try {
    const p = await productModel.createProduct(req.body);
    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'product_created',
      description: `New creation added to catalog: "${p.name}" (₹${p.price}) by ${req.user.name}`,
      metadata: { productId: p.id, name: p.name, price: p.price }
    }).catch(() => {});

    res.status(201).json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateProduct(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

  try {
    const p = await productModel.updateProduct(id, req.body);
    if (!p) return res.status(404).json({ error: 'Garment not found.' });

    activityModel.logCustomerActivity({
      userId: req.user.id,
      userName: req.user.name,
      activityType: 'product_updated',
      description: `Creation updated: "${p.name}" by ${req.user.name}`,
      metadata: { productId: p.id }
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
  uploadImage
};

