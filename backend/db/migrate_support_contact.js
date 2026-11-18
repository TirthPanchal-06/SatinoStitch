/**
 * Safe, idempotent migration to ensure consistent configurable
 * Customer Phone & Email Support settings in website_settings.store_info.
 * Preserves all existing website_settings keys and store_info properties.
 */
const { pool } = require('../config/db');
const env = require('../config/env');

async function migrateSupportContact() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS website_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    const existing = await client.query(
      "SELECT value FROM website_settings WHERE key = 'store_info';"
    );
    const current = (existing.rows[0] && existing.rows[0].value && typeof existing.rows[0].value === 'object')
      ? existing.rows[0].value
      : {};

    const phone = env.SUPPORT_PHONE || current.support_phone || current.phone || '+91 98765 43210';
    const email = env.SUPPORT_EMAIL || current.support_email || current.email || 'concierge@satinostitch.com';
    const hours = env.SUPPORT_HOURS || current.support_hours || '10:00 AM to 5:00 PM';

    const merged = {
      ...current,
      phone,
      support_phone: phone,
      email,
      support_email: email,
      hours,
      support_hours: hours,
      phone_support_hours: hours,
      email_support_hours: hours
    };

    await client.query(
      `INSERT INTO website_settings (key, value, updated_at)
       VALUES ('store_info', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(merged)]
    );

    await client.query('COMMIT');
    console.log('✓ Configurable support contact settings ensured in website_settings.store_info:', {
      phone: merged.support_phone,
      email: merged.support_email,
      hours: merged.support_hours
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Support contact migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrateSupportContact().catch(() => process.exit(1));
}

module.exports = { migrateSupportContact };
