const { query } = require('../config/db');

async function migrateRecommendations() {
  console.log('[Migration] Setting up AI Recommendations schema...');

  // 1. User Style Preferences Table
  await query(`
    CREATE TABLE IF NOT EXISTS user_style_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      preferred_occasions JSONB DEFAULT '["wedding", "festive"]'::jsonb,
      preferred_colors JSONB DEFAULT '["#5B1835", "#D4AF37", "#1B3B2B", "#FDFBF7"]'::jsonb,
      preferred_tradition VARCHAR(50) DEFAULT 'both',
      preferred_silhouettes JSONB DEFAULT '["Lehengas", "Sarees", "Suit sets", "Tops & blazers"]'::jsonb,
      preferred_size VARCHAR(10) DEFAULT 'M',
      budget_preference VARCHAR(50) DEFAULT 'all',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // 2. Ensure product_views table exists and has proper indexes
  await query(`
    CREATE TABLE IF NOT EXISTS product_views (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip_address VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_user_style_pref_user_id ON user_style_preferences(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_product_views_user_id ON product_views(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON product_views(product_id);`);

  console.log('[Migration] AI Recommendations schema successfully created.');
}

if (require.main === module) {
  migrateRecommendations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Migration Error]:', err);
      process.exit(1);
    });
}

module.exports = { migrateRecommendations };

