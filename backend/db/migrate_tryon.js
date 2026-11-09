const { query } = require('../config/db');

async function migrate() {
  console.log('Running 3D Virtual Fashion Try-On schema migration...');

  await query(`
    ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS garment_category VARCHAR(100),
      ADD COLUMN IF NOT EXISTS garment_model_url VARCHAR(255),
      ADD COLUMN IF NOT EXISTS fabric_texture_url VARCHAR(255),
      ADD COLUMN IF NOT EXISTS normal_map_url VARCHAR(255),
      ADD COLUMN IF NOT EXISTS roughness_map_url VARCHAR(255),
      ADD COLUMN IF NOT EXISTS colour_variants JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS garment_components JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS compatible_avatar_types JSONB DEFAULT '["female_couture_v1"]'::jsonb,
      ADD COLUMN IF NOT EXISTS draping_configuration JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS asset_status VARCHAR(50) DEFAULT 'unavailable';
  `);

  console.log('Columns added successfully to products table.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});

