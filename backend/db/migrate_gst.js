/**
 * SATINOSTITCH — Safe Migration: GST & Tax Management
 *
 * Adds product-wise GST columns, order & order_item GST snapshot columns,
 * and seeds default GST configuration in website_settings.
 * Safe and idempotent (preserves all existing products, prices, and orders).
 */
const { pool } = require('../config/db');

const DEFAULT_GST_CONFIG = {
  enabled: true,
  gstin: '24AAECS1234P1Z8',
  sellerState: 'Gujarat',
  sellerStateCode: '24',
  pricingMode: 'inclusive',
  taxMode: 'auto',
  defaultGstRate: 5,
  cgstRate: 2.5,
  sgstRate: 2.5,
  igstRate: 5,
  supportedRates: [0, 2.5, 5],
  defaultHsnCode: '6204'
};

async function migrateGst() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Product-wise GST columns
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_type VARCHAR(30) NOT NULL DEFAULT 'auto';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20) DEFAULT '6204';
    `);
    console.log('✓ products GST columns ensured (gst_rate, gst_type, hsn_code).');

    // 2. Order-level GST snapshot columns
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_gst NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_type VARCHAR(30) DEFAULT 'intra';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_pricing_mode VARCHAR(20) DEFAULT 'inclusive';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_breakdown JSONB DEFAULT '{}'::jsonb;
    `);
    console.log('✓ orders GST snapshot columns ensured.');

    // 3. Order-item-level GST snapshot columns
    await client.query(`
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 2) DEFAULT 5.00;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS gst_type VARCHAR(30) DEFAULT 'auto';
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20) DEFAULT '6204';
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10, 2) DEFAULT 0;
    `);
    console.log('✓ order_items GST snapshot columns ensured.');

    // 4. Seed default GST configuration in website_settings if table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS website_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await client.query(
      `INSERT INTO website_settings (key, value, updated_at)
       VALUES ('gst_config', $1::jsonb, NOW())
       ON CONFLICT (key) DO NOTHING;`,
      [JSON.stringify(DEFAULT_GST_CONFIG)]
    );
    console.log('✓ Default gst_config ensured in website_settings.');

    await client.query('COMMIT');
    console.log('✓ Migration migrate_gst completed successfully.');
    return { success: true, message: 'GST columns and default configuration ready.' };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ GST migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateGst()
    .then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = { migrateGst, DEFAULT_GST_CONFIG };
