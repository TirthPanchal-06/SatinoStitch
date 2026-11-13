const { query } = require('../config/db');

async function migrateNotifications() {
  console.log('[Migration] Setting up Smart Notifications schema...');

  // 1. Customer Notifications Table
  await query(`
    CREATE TABLE IF NOT EXISTS customer_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      badge VARCHAR(100),
      icon VARCHAR(50),
      image VARCHAR(255),
      link VARCHAR(255),
      metadata JSONB DEFAULT '{}'::jsonb,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // 2. Back-in-Stock Subscriptions Table
  await query(`
    CREATE TABLE IF NOT EXISTS back_in_stock_subscriptions (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      notified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_customer_notifs_user ON customer_notifications(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_customer_notifs_type ON customer_notifications(type);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_customer_notifs_created ON customer_notifications(created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_sub_product ON back_in_stock_subscriptions(product_id);`);

  console.log('[Migration] Smart Notifications schema successfully created.');
}

if (require.main === module) {
  migrateNotifications()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Migration Error]:', err);
      process.exit(1);
    });
}

module.exports = { migrateNotifications };
