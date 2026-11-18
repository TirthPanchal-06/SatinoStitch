/**
 * SATINOSTITCH — Safe Migration: Selected Product Discount Management
 *
 * Creates `product_discounts` and `product_discount_items` tables with indexes.
 * Safe and idempotent (preserves all existing records, products, and coupons).
 */
const { pool } = require('../config/db');

async function migrateProductDiscounts() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_discounts (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(255) NOT NULL,
        discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
        discount_value  NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
        start_date      TIMESTAMP WITH TIME ZONE NOT NULL,
        end_date        TIMESTAMP WITH TIME ZONE NOT NULL,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        description     TEXT,
        created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_discount_items (
        id           SERIAL PRIMARY KEY,
        discount_id  INTEGER NOT NULL REFERENCES product_discounts(id) ON DELETE CASCADE,
        product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (discount_id, product_id)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_discounts_dates ON product_discounts(start_date, end_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_discounts_active ON product_discounts(is_active);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_discount_items_product_id ON product_discount_items(product_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_discount_items_discount_id ON product_discount_items(discount_id);`);

    await client.query('COMMIT');
    console.log('✓ product_discounts & product_discount_items tables and indexes ensured safely.');
    return { success: true, message: 'Selected product discount tables ready.' };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Product discount migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateProductDiscounts()
    .then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = { migrateProductDiscounts };
