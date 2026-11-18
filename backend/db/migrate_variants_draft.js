/**
 * SATINOSTITCH – Migration: Variants & Draft Status
 *
 * Adds:
 *  1. products.publish_status VARCHAR(20) DEFAULT 'published'
 *  2. product_variant_stock table (per product × size × color stock)
 *
 * Safe to run multiple times (idempotent).
 */

const { pool } = require('../config/db');

async function migrateVariantsDraft() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. Add publish_status column to products ───────────────────────────
    await client.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20) DEFAULT 'published';
    `);
    await client.query(`
      UPDATE products
      SET publish_status = 'published'
      WHERE publish_status IS NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_publish_status ON products(publish_status);
    `);
    console.log("✓ products.publish_status column & index ensured.");

    // ─── 2. Create product_variant_stock table ──────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variant_stock (
        id           SERIAL PRIMARY KEY,
        product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        size         VARCHAR(30) NOT NULL,
        color_name   VARCHAR(100) NOT NULL,
        color_hex    VARCHAR(20) DEFAULT '#000000',
        stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(product_id, size, color_name)
      );
    `);
    await client.query(`
      ALTER TABLE product_variant_stock
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_variant_stock_product_id ON product_variant_stock(product_id);
    `);
    console.log("✓ product_variant_stock table, is_active column & index ensured.");

    // ─── 3. Seed variant stock from existing products ───────────────────────
    // Fetch all products that have sizes and colors defined
    const { rows: products } = await client.query(`
      SELECT id, stock, sizes, colors
      FROM products
      WHERE sizes IS NOT NULL
        AND colors IS NOT NULL
        AND jsonb_array_length(sizes)  > 0
        AND jsonb_array_length(colors) > 0;
    `);

    let totalInserted = 0;
    let totalSkipped  = 0;

    for (const product of products) {
      const sizes  = Array.isArray(product.sizes)  ? product.sizes  : [];
      const colors = Array.isArray(product.colors) ? product.colors : [];

      const numSizes  = sizes.length;
      const numColors = colors.length;

      if (numSizes === 0 || numColors === 0) continue;

      // Per-variant stock = ROUND(total_stock / (numSizes * numColors))
      const totalCombinations = numSizes * numColors;
      const perVariantStock   = Math.round((product.stock || 0) / totalCombinations);

      for (const size of sizes) {
        for (const color of colors) {
          // color may be a string (name) or an object { name, hex }
          let colorName = '';
          let colorHex  = '#000000';

          if (typeof color === 'string') {
            colorName = color;
          } else if (color && typeof color === 'object') {
            colorName = color.name || color.label || String(color);
            colorHex  = color.hex  || color.color || '#000000';
          }

          if (!colorName) continue;

          const result = await client.query(
            `INSERT INTO product_variant_stock
               (product_id, size, color_name, color_hex, stock)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (product_id, size, color_name) DO NOTHING;`,
            [product.id, String(size), colorName, colorHex, perVariantStock]
          );

          if (result.rowCount > 0) {
            totalInserted++;
          } else {
            totalSkipped++;
          }
        }
      }
    }

    console.log(`✓ Seeded product_variant_stock: ${totalInserted} rows inserted, ${totalSkipped} already existed.`);

    await client.query('COMMIT');
    console.log('✓ Migration migrate_variants_draft completed successfully.');

    return {
      success: true,
      message: `Migration complete. publish_status column added; product_variant_stock table created; ${totalInserted} variant-stock rows seeded.`
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  const result = await migrateVariantsDraft();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateVariantsDraft };
