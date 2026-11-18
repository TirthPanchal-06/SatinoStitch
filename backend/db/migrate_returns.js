/**
 * SATINOSTITCH — Safe Migration: Return Management System
 *
 * Creates the `return_requests` table linked to `orders`, `order_items`,
 * `products`, and `users`, plus indexes for fast admin and customer queries.
 * Safe and idempotent (preserves all existing records).
 */
const { pool } = require('../config/db');

async function migrateReturns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS return_requests (
        id                SERIAL PRIMARY KEY,
        return_code       VARCHAR(40) UNIQUE NOT NULL,
        order_id          VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id     INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
        product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
        user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
        customer_name     VARCHAR(255) NOT NULL,
        customer_email    VARCHAR(255) NOT NULL,
        customer_phone    VARCHAR(50),
        product_name      VARCHAR(255) NOT NULL,
        product_image     VARCHAR(255),
        size              VARCHAR(30) NOT NULL DEFAULT 'M',
        color             VARCHAR(100),
        quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_price        NUMERIC(10, 2) NOT NULL DEFAULT 0,
        refund_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0,
        reason            VARCHAR(150) NOT NULL,
        comments          TEXT,
        status            VARCHAR(40) NOT NULL DEFAULT 'Pending',
        admin_notes       TEXT,
        restocked         BOOLEAN NOT NULL DEFAULT FALSE,
        requested_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        reviewed_at       TIMESTAMP WITH TIME ZONE,
        completed_at      TIMESTAMP WITH TIME ZONE,
        updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_return_requests_order_id ON return_requests(order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_return_requests_user_id ON return_requests(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_return_requests_requested_at ON return_requests(requested_at DESC);`);

    await client.query('COMMIT');
    console.log('✓ return_requests table and indexes ensured safely.');
    return { success: true, message: 'Return management table and indexes ready.' };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Return migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateReturns()
    .then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = { migrateReturns };
