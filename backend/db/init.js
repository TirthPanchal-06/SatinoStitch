const fs = require('fs');
const path = require('path');
const db = require('../db');

async function initializeDatabase() {
  try {
    // 1. Run schema DDL
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schemaSql);
    console.log('[PostgreSQL] Database schema verified (categories & products tables ready).');

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

    // 3. Check and Seed Products from products.json
    const countRes = await db.query('SELECT COUNT(*)::int AS count FROM products;');
    const count = countRes.rows[0].count;

    if (count === 0) {
      const productsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8')
      );

      // Fetch category IDs map
      const catsRes = await db.query('SELECT id, slug FROM categories;');
      const catMap = Object.fromEntries(catsRes.rows.map(r => [r.slug, r.id]));

      for (const p of productsData) {
        await db.query(
          `INSERT INTO products (
            id, name, category_id, cat, type, col, price, old_price,
            c1, c2, pat, tag, rating, reviews, stock, image, fabric, description
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
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
            fabric = EXCLUDED.fabric,
            description = EXCLUDED.description;`,
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
            p.stock || 0,
            p.image,
            p.fabric || null,
            p.desc || null
          ]
        );
      }

      // Synchronize sequence with highest ID
      await db.query(`SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));`);
      console.log(`[PostgreSQL] Seeded ${productsData.length} products successfully into PostgreSQL.`);
    } else {
      console.log(`[PostgreSQL] Products table already contains ${count} items.`);
    }

    return true;
  } catch (err) {
    console.error('[PostgreSQL] Database initialization error:', err.message);
    throw err;
  }
}

// Allow running standalone: `node backend/db/init.js`
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('[PostgreSQL] Migration & initialization complete.');
      db.pool.end();
    })
    .catch((err) => {
      console.error('[PostgreSQL] Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
