/**
 * Safe, idempotent migration to create the `invoices` table
 * and assign deterministic sequential invoice numbers (INV-001, INV-002, ...)
 * to existing historical orders without duplicating records or altering orders.
 */
const { pool } = require('../config/db');

async function migrateInvoices() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(64) UNIQUE NOT NULL,
        order_id VARCHAR(64) UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
    `);

    // Safely backfill existing historical orders that do not yet have an invoice record
    const missingOrders = await client.query(`
      SELECT o.id, o.created_at
      FROM orders o
      LEFT JOIN invoices inv ON inv.order_id = o.id
      WHERE inv.id IS NULL
      ORDER BY o.created_at ASC, o.id ASC;
    `);

    const maxRes = await client.query(`
      SELECT COALESCE(MAX(
        CASE
          WHEN invoice_number ~ '^INV-[0-9]+$' THEN SUBSTRING(invoice_number FROM '[0-9]+$')::int
          ELSE 0
        END
      ), 0) AS max_seq
      FROM invoices;
    `);
    let seq = Number(maxRes.rows[0]?.max_seq || 0);

    for (const row of missingOrders.rows) {
      seq += 1;
      const invNum = `INV-${String(seq).padStart(3, '0')}`;
      await client.query(
        `INSERT INTO invoices (invoice_number, order_id, issued_at)
         VALUES ($1, $2, COALESCE($3, NOW()))
         ON CONFLICT (order_id) DO NOTHING;`,
        [invNum, row.id, row.created_at]
      );
    }

    const totalRes = await client.query('SELECT COUNT(*)::int AS cnt FROM invoices;');
    await client.query('COMMIT');
    console.log(`✓ invoices table ensured safely (${totalRes.rows[0].cnt} unique invoice records, ${missingOrders.rows.length} historical orders backfilled).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Invoice migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrateInvoices().catch(() => process.exit(1));
}

module.exports = { migrateInvoices };
