const { query } = require('../config/db');

async function populate() {
  console.log('Populating product-specific 3D Virtual Try-On assets in PostgreSQL...');

  // Reset any old generic models first
  await query(`UPDATE products SET model_3d = NULL, garment_model_url = NULL, asset_status = 'unavailable';`);

  // 1. Product 2: Bandhani Kurta Set
  await query(`
    UPDATE products SET
      garment_category = 'kurta_set',
      garment_model_url = 'models/tryon_p2_bandhani_kurta_set.glb',
      fabric_texture_url = 'models/textures/tryon_p2_bandhani_primary.webp',
      colour_variants = $1::jsonb,
      garment_components = $2::jsonb,
      compatible_avatar_types = '["female_couture_v1", "female_slender"]'::jsonb,
      draping_configuration = '{"style": "festive_shoulder_drape", "flow": "left_shoulder_cascade", "dupattaLength": "floor_sweep"}'::jsonb,
      asset_status = 'published',
      model_3d = 'models/tryon_p2_bandhani_kurta_set.glb'
    WHERE id = 2;
  `, [
    JSON.stringify([
      { name: "Primary Shade (Madder Red)", hex: "#8C2F39", texture: "models/textures/tryon_p2_bandhani_primary.webp" },
      { name: "Accent Shade (Champagne Gold)", hex: "#F3DFB7", texture: "models/textures/tryon_p2_bandhani_accent.webp" }
    ]),
    JSON.stringify([
      { name: "Straight Bandhani Kurta", layer: "top", type: "Kurta", mesh: "H_DDS_HighRes", details: "Madder red with hand-tied ivory dot clusters & gold zari neckline" },
      { name: "Fluid Palazzo Trousers", layer: "bottom", type: "Palazzo", mesh: "H_DDS_HighRes", details: "Matching wide-leg palazzo with subtle gold piping" },
      { name: "Zari Draped Dupatta", layer: "drape", type: "Dupatta", mesh: "Kurta_Dupatta_Mesh", details: "Lightweight sheer georgette with metallic temple border" }
    ])
  ]);

  // 2. Product 4: Banarasi Silk Saree
  await query(`
    UPDATE products SET
      garment_category = 'saree',
      garment_model_url = 'models/tryon_p4_banarasi_silk_saree.glb',
      fabric_texture_url = 'models/textures/tryon_p4_banarasi_primary.webp',
      colour_variants = $1::jsonb,
      garment_components = $2::jsonb,
      compatible_avatar_types = '["female_couture_v1"]'::jsonb,
      draping_configuration = '{"pleatsCount": 7, "palluLength": "mid_calf", "drapeStyle": "classic_nivi"}'::jsonb,
      asset_status = 'published',
      model_3d = 'models/tryon_p4_banarasi_silk_saree.glb'
    WHERE id = 4;
  `, [
    JSON.stringify([
      { name: "Primary Shade (Royal Aubergine)", hex: "#3B1226", texture: "models/textures/tryon_p4_banarasi_primary.webp" },
      { name: "Accent Shade (Antique Gold)", hex: "#C6A15B", texture: "models/textures/tryon_p4_banarasi_accent.webp" }
    ]),
    JSON.stringify([
      { name: "Banarasi Silk Saree Body", layer: "drape", type: "Saree Body", mesh: "H_DDS_HighRes", details: "Handloom silk with all-over antique gold floral jaali weave" },
      { name: "Waist Knife Pleats", layer: "pleats", type: "Pleats", mesh: "Saree_Pleats_Mesh", details: "7 crisp front pleats tucked neatly at the navel" },
      { name: "Temple Zari Pallu", layer: "pallu", type: "Pallu", mesh: "Saree_Pallu_Mesh", details: "Diagonal shoulder drape with grand antique gold brocade border" },
      { name: "Brocade Blouse / Choli", layer: "top", type: "Choli", mesh: "H_DDS_HighRes", details: "Sweetheart neckline fitted blouse with gold sleeve trims" }
    ])
  ]);

  // 3. Product 1: Zari Anarkali Set
  await query(`
    UPDATE products SET
      garment_category = 'anarkali',
      garment_model_url = 'models/tryon_p1_zari_anarkali_set.glb',
      fabric_texture_url = 'models/textures/tryon_p1_anarkali_primary.webp',
      colour_variants = $1::jsonb,
      garment_components = $2::jsonb,
      compatible_avatar_types = '["female_couture_v1"]'::jsonb,
      draping_configuration = '{"style": "ceremonial_anarkali", "skirtFlare": "floor_length"}'::jsonb,
      asset_status = 'published',
      model_3d = 'models/tryon_p1_zari_anarkali_set.glb'
    WHERE id = 1;
  `, [
    JSON.stringify([
      { name: "Primary Shade (Royal Wine)", hex: "#5B1835", texture: "models/textures/tryon_p1_anarkali_primary.webp" }
    ]),
    JSON.stringify([
      { name: "Zardozi Empire Bodice", layer: "top", type: "Bodice", mesh: "H_DDS_HighRes", details: "Intricate metallic gold dabka embroidery" },
      { name: "Kalidar Flared Gown Skirt", layer: "bottom", type: "Gown", mesh: "Anarkali_Skirt_Mesh", details: "Voluminous 16-kali sweeping floor flare" }
    ])
  ]);

  // 4. Product 6: Embroidered Lehenga
  await query(`
    UPDATE products SET
      garment_category = 'lehenga',
      garment_model_url = 'models/tryon_p6_embroidered_lehenga.glb',
      fabric_texture_url = 'models/textures/tryon_p6_lehenga_primary.webp',
      colour_variants = $1::jsonb,
      garment_components = $2::jsonb,
      compatible_avatar_types = '["female_couture_v1"]'::jsonb,
      draping_configuration = '{"style": "bridal_circular_flare"}'::jsonb,
      asset_status = 'published',
      model_3d = 'models/tryon_p6_embroidered_lehenga.glb'
    WHERE id = 6;
  `, [
    JSON.stringify([
      { name: "Ceremonial Maroon", hex: "#5B1835", texture: "models/textures/tryon_p6_lehenga_primary.webp" }
    ]),
    JSON.stringify([
      { name: "Embroidered Choli Blouse", layer: "top", type: "Choli", mesh: "H_DDS_HighRes", details: "Deep sweetheart neck with heavy gold embroidery" },
      { name: "Bridal Flared Lehenga Skirt", layer: "bottom", type: "Skirt", mesh: "Lehenga_Skirt_Mesh", details: "Full circular skirt with grand floral zari border" }
    ])
  ]);

  // 5. Product 8: Crepe Wrap Dress
  await query(`
    UPDATE products SET
      garment_category = 'western_dress',
      garment_model_url = 'models/tryon_p8_crepe_wrap_dress.glb',
      fabric_texture_url = 'models/textures/tryon_p8_wrap_primary.webp',
      colour_variants = $1::jsonb,
      garment_components = $2::jsonb,
      compatible_avatar_types = '["female_couture_v1"]'::jsonb,
      draping_configuration = '{"style": "contemporary_wrap"}'::jsonb,
      asset_status = 'published',
      model_3d = 'models/tryon_p8_crepe_wrap_dress.glb'
    WHERE id = 8;
  `, [
    JSON.stringify([
      { name: "Charcoal Espresso", hex: "#2B211E", texture: "models/textures/tryon_p8_wrap_primary.webp" }
    ]),
    JSON.stringify([
      { name: "Tailored Crepe Wrap Silhouette", layer: "dress", type: "Dress", mesh: "H_DDS_HighRes", details: "Fluid stretch crepe with cinched gold buckle waist" }
    ])
  ]);

  console.log('PostgreSQL products table populated with 3D Virtual Try-On assets!');
  process.exit(0);
}

populate().catch(err => {
  console.error('Error populating assets:', err);
  process.exit(1);
});

