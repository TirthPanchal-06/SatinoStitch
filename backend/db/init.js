const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');

async function initializeDatabase() {
  try {
    // 1. Run schema DDL
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schemaSql);
    console.log('[PostgreSQL] Database schema verified (all 9 tables and indexes ready).');

    // 2. Seed Categories
    const categories = [
      {
        slug: 'ethnic',
        name: 'Ethnic Couture',
        description: 'Royal Banarasi silk sarees, bridal lehengas, and Chanderi kurta sets.'
      },
      {
        slug: 'western',
        name: 'Western Pret',
        description: 'Sartorial linen blazers, liquid satin dresses, and tailored suiting.'
      }
    ];

    for (const cat of categories) {
      await db.query(
        `INSERT INTO categories (slug, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description;`,
        [cat.slug, cat.name, cat.description]
      );
    }

    // 3. Seed Products from products.json
    const countRes = await db.query('SELECT COUNT(*)::int AS count FROM products;');
    const count = countRes.rows[0].count;

    const productsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8')
    );

    const catsRes = await db.query('SELECT id, slug FROM categories;');
    const catMap = Object.fromEntries(catsRes.rows.map(r => [r.slug, r.id]));

    // Common standard sizes and color palettes
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL'];

    for (const p of productsData) {
      const colors = [];
      if (p.c1) colors.push({ name: 'Primary Shade', hex: p.c1 });
      if (p.c2 && p.c2 !== p.c1) colors.push({ name: 'Accent Shade', hex: p.c2 });
      if (!colors.length) colors.push({ name: 'Classic Gold', hex: '#C6A15B' });

      // Build gallery image list for zoom
      const gallery = [p.image];
      if (p.col === 'wedding') gallery.push('images/wedding-edit.jpg');
      if (p.id !== 1) gallery.push('images/p1.jpg');

      await db.query(
        `INSERT INTO products (
          id, name, category_id, cat, type, col, price, old_price,
          c1, c2, pat, tag, rating, reviews, stock, image, images, fabric, description, sizes, colors
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category_id = EXCLUDED.category_id,
          cat = EXCLUDED.cat,
          type = EXCLUDED.type,
          col = EXCLUDED.col,
          price = EXCLUDED.price,
          old_price = EXCLUDED.old_price,
          c1 = EXCLUDED.c1,
          c2 = EXCLUDED.c2,
          pat = EXCLUDED.pat,
          tag = EXCLUDED.tag,
          rating = EXCLUDED.rating,
          reviews = EXCLUDED.reviews,
          stock = EXCLUDED.stock,
          image = EXCLUDED.image,
          images = EXCLUDED.images,
          fabric = EXCLUDED.fabric,
          description = EXCLUDED.description,
          sizes = EXCLUDED.sizes,
          colors = EXCLUDED.colors;`,
        [
          p.id,
          p.name,
          catMap[p.cat] || null,
          p.cat,
          p.type,
          p.col,
          p.price,
          p.old || null,
          p.c1 || null,
          p.c2 || null,
          p.pat || null,
          p.tag || null,
          p.rating || 5.0,
          p.reviews || 0,
          p.stock || 5,
          p.image,
          JSON.stringify(gallery),
          p.fabric || null,
          p.desc || null,
          JSON.stringify(defaultSizes),
          JSON.stringify(colors)
        ]
      );
    }
    await db.query(`SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));`);
    console.log(`[PostgreSQL] Products verified & synchronized (${productsData.length} records).`);

    // 4. Seed Coupons
    const coupons = [
      { code: 'HERITAGE10', discount_percent: 10, min_order_amount: 0, description: '10% off your order across all couture' },
      { code: 'ROYAL15', discount_percent: 15, min_order_amount: 5000, description: '15% luxury discount on orders over ₹5,000' },
      { code: 'ATELIER20', discount_percent: 20, min_order_amount: 10000, description: '20% bespoke patron privilege on orders over ₹10,000' }
    ];
    for (const c of coupons) {
      await db.query(
        `INSERT INTO coupons (code, discount_percent, min_order_amount, is_active, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE
         SET discount_percent = EXCLUDED.discount_percent,
             min_order_amount = EXCLUDED.min_order_amount,
             description = EXCLUDED.description;`,
        [c.code, c.discount_percent, c.min_order_amount, true, c.description]
      );
    }
    console.log('[PostgreSQL] Coupons initialized (HERITAGE10, ROYAL15, ATELIER20).');

    // 5. Seed Demo Users (Customer & Atelier Admin)
    const saltRounds = 10;
    const demoCustomerPass = await bcrypt.hash('password123', saltRounds);
    const demoAdminPass = await bcrypt.hash('admin123', saltRounds);

    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, phone = EXCLUDED.phone
       RETURNING id;`,
      ['Meera Kapoor', 'meera@example.com', demoCustomerPass, '+91 98765 43210', 'customer']
    );
    const demoUserId = userRes.rows[0].id;

    await db.query(
      `INSERT INTO users (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
       SET role = 'admin';`,
      ['Atelier Master', 'admin@satinostitch.com', demoAdminPass, '+91 98200 11223', 'admin']
    );
    console.log('[PostgreSQL] Demo accounts ready: meera@example.com (customer) & admin@satinostitch.com (admin).');

    // 6. Seed Demo Address for Meera Kapoor
    const addressCount = await db.query('SELECT COUNT(*)::int AS count FROM user_addresses WHERE user_id = $1;', [demoUserId]);
    if (addressCount.rows[0].count === 0) {
      await db.query(
        `INSERT INTO user_addresses (user_id, label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [
          demoUserId,
          'Atelier Residence',
          'Meera Kapoor',
          '+91 98765 43210',
          '42 Altamount Road, Silver Oaks Penthouse',
          'Near Heritage Club',
          'Mumbai',
          'Maharashtra',
          '400026',
          true
        ]
      );
      console.log('[PostgreSQL] Saved address seeded for demo user.');
    }

    // 7. Seed Sample Reviews
    const reviewCount = await db.query('SELECT COUNT(*)::int AS count FROM product_reviews;');
    if (reviewCount.rows[0].count === 0) {
      const sampleReviews = [
        {
          productId: 1,
          name: 'Ananya Deshmukh',
          rating: 5,
          title: 'Exquisite Banarasi Zari Weave',
          comment: 'The drape and shimmer of the gold zari are beyond breathtaking. It looks like an heirloom piece!'
        },
        {
          productId: 1,
          name: 'Priyanka Sen',
          rating: 5,
          title: 'Pure Royal Elegance',
          comment: 'Ordered for a reception dinner. The fit is divine and the net sitara dupatta adds sheer magic.'
        },
        {
          productId: 4,
          name: 'Radhika Sharma',
          rating: 5,
          title: 'Masterpiece Silk Saree',
          comment: 'The authentic aubergine wine tone paired with temple tassels is museum-grade craftsmanship. Truly Silk Mark certified.'
        },
        {
          productId: 6,
          name: 'Kavita Singhal',
          rating: 5,
          title: 'Dream Wedding Lehenga',
          comment: 'Wore this for my sangeet. The 16-kali flare is grand yet remarkably comfortable to dance in.'
        },
        {
          productId: 9,
          name: 'Natasha Vohra',
          rating: 5,
          title: 'Impeccable Sartorial Cut',
          comment: 'The peaked lapels and houndstooth linen give this blazer a bespoke Savile Row presence. Love it.'
        }
      ];

      for (const rev of sampleReviews) {
        await db.query(
          `INSERT INTO product_reviews (product_id, user_name, rating, title, comment, verified_purchase)
           VALUES ($1, $2, $3, $4, $5, true);`,
          [rev.productId, rev.name, rev.rating, rev.title, rev.comment]
        );
      }
      console.log('[PostgreSQL] Sample verified reviews seeded.');
    }

    // 8. Seed Demo Order for Meera Kapoor
    const orderCount = await db.query('SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1;', [demoUserId]);
    if (orderCount.rows[0].count === 0) {
      const orderId = 'SS' + Date.now().toString().slice(-7);
      await db.query(
        `INSERT INTO orders (
          id, user_id, customer_name, customer_email, customer_phone, shipping_address,
          subtotal, discount, coupon_code, shipping_fee, total, payment_method, payment_status,
          status, tracking_number, estimated_delivery
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW() + INTERVAL '3 days'
        );`,
        [
          orderId,
          demoUserId,
          'Meera Kapoor',
          'meera@example.com',
          '+91 98765 43210',
          JSON.stringify({
            recipient: 'Meera Kapoor',
            phone: '+91 98765 43210',
            line1: '42 Altamount Road, Silver Oaks Penthouse',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400026'
          }),
          6490.00,
          649.00,
          'HERITAGE10',
          0,
          5841.00,
          'card',
          'paid',
          'In Atelier',
          'TRK-SS-' + Math.floor(100000 + Math.random() * 900000)
        ]
      );

      await db.query(
        `INSERT INTO order_items (order_id, product_id, product_name, image, size, color, price, quantity, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          orderId,
          1,
          'Zari Anarkali Set',
          'images/p1.jpg',
          'M',
          'Royal Wine & Gold',
          6490.00,
          1,
          6490.00
        ]
      );
      console.log(`[PostgreSQL] Seeded initial order ${orderId} for demo user.`);
    }

    return true;
  } catch (err) {
    console.error('[PostgreSQL] Database initialization error:', err.message);
    throw err;
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('[PostgreSQL] Complete initialization & seed finished.');
      db.pool.end();
    })
    .catch((err) => {
      console.error('[PostgreSQL] Initialization failed:', err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
