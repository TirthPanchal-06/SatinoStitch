const { query } = require('../config/db');

/**
 * SATINOSTITCH AI Recommendation Engine
 * Analyzes browsing history (product_views & client session), previous purchases (orders & order_items),
 * and explicit style preferences to compose complete, personalized luxury outfit ensembles.
 */

const DEFAULT_PREFERENCES = {
  preferred_occasions: ['wedding', 'festive'],
  preferred_colors: ['#5B1835', '#D4AF37', '#1B3B2B', '#FDFBF7'],
  preferred_tradition: 'both',
  preferred_silhouettes: ['Lehengas', 'Sarees', 'Suit sets', 'Tops & blazers'],
  preferred_size: 'M',
  budget_preference: 'all'
};

async function getUserPreferences(userId) {
  if (!userId) return DEFAULT_PREFERENCES;
  try {
    const res = await query(
      `SELECT preferred_occasions, preferred_colors, preferred_tradition, preferred_silhouettes, preferred_size, budget_preference, notes
       FROM user_style_preferences WHERE user_id = $1`,
      [userId]
    );
    if (res.rows.length > 0) {
      return { ...DEFAULT_PREFERENCES, ...res.rows[0] };
    }
    return DEFAULT_PREFERENCES;
  } catch (err) {
    console.error('[Recommendation Model] getUserPreferences error:', err.message);
    return DEFAULT_PREFERENCES;
  }
}

async function saveUserPreferences(userId, prefs) {
  if (!userId) return null;
  const merged = { ...DEFAULT_PREFERENCES, ...prefs };
  const sql = `
    INSERT INTO user_style_preferences (
      user_id, preferred_occasions, preferred_colors, preferred_tradition, preferred_silhouettes, preferred_size, budget_preference, notes, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      preferred_occasions = EXCLUDED.preferred_occasions,
      preferred_colors = EXCLUDED.preferred_colors,
      preferred_tradition = EXCLUDED.preferred_tradition,
      preferred_silhouettes = EXCLUDED.preferred_silhouettes,
      preferred_size = EXCLUDED.preferred_size,
      budget_preference = EXCLUDED.budget_preference,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *;
  `;
  const res = await query(sql, [
    userId,
    JSON.stringify(merged.preferred_occasions || []),
    JSON.stringify(merged.preferred_colors || []),
    merged.preferred_tradition || 'both',
    JSON.stringify(merged.preferred_silhouettes || []),
    merged.preferred_size || 'M',
    merged.budget_preference || 'all',
    merged.notes || ''
  ]);
  return res.rows[0];
}

async function getUserBrowsingProfile(userId, ip, clientHistory = []) {
  const profile = {
    viewCount: 0,
    recentProductIds: [],
    topCategories: {},
    topOccasions: {},
    topTypes: {},
    primaryShade: null
  };

  try {
    let rows = [];
    if (userId) {
      const res = await query(
        `SELECT pv.product_id, p.cat, p.col, p.type, p.c1, p.price, pv.created_at
         FROM product_views pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.user_id = $1 AND pv.created_at >= NOW() - INTERVAL '30 days'
         ORDER BY pv.created_at DESC LIMIT 30`,
        [userId]
      );
      rows = res.rows;
    } else if (ip) {
      const res = await query(
        `SELECT pv.product_id, p.cat, p.col, p.type, p.c1, p.price, pv.created_at
         FROM product_views pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.ip_address = $1 AND pv.created_at >= NOW() - INTERVAL '30 days'
         ORDER BY pv.created_at DESC LIMIT 30`,
        [ip]
      );
      rows = res.rows;
    }

    // Merge client-side history if available
    const clientIds = Array.isArray(clientHistory) ? clientHistory.map(Number).filter(n => !isNaN(n)) : [];
    if (clientIds.length > 0) {
      const clientRes = await query(
        `SELECT id as product_id, cat, col, type, c1, price FROM products WHERE id = ANY($1)`,
        [clientIds.slice(0, 15)]
      );
      rows = [...rows, ...clientRes.rows];
    }

    // Deduplicate and aggregate
    const seen = new Set();
    for (const r of rows) {
      if (!seen.has(r.product_id)) {
        seen.add(r.product_id);
        profile.recentProductIds.push(r.product_id);
      }
      profile.viewCount++;
      if (r.cat) profile.topCategories[r.cat] = (profile.topCategories[r.cat] || 0) + 1;
      if (r.col) profile.topOccasions[r.col] = (profile.topOccasions[r.col] || 0) + 1;
      if (r.type) profile.topTypes[r.type] = (profile.topTypes[r.type] || 0) + 1;
      if (r.c1 && !profile.primaryShade) profile.primaryShade = r.c1;
    }
  } catch (err) {
    console.error('[Recommendation Model] getUserBrowsingProfile error:', err.message);
  }

  return profile;
}

async function getUserPurchaseProfile(userId) {
  const profile = {
    orderCount: 0,
    purchasedProductIds: [],
    purchasedCategories: {},
    purchasedOccasions: {},
    purchasedTypes: {},
    recentPurchases: []
  };

  if (!userId) return profile;

  try {
    const res = await query(
      `SELECT oi.product_id, oi.product_name, oi.price, oi.size, oi.color, p.cat, p.col, p.type, o.created_at
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = $1 AND o.status != 'Cancelled'
       ORDER BY o.created_at DESC LIMIT 20`,
      [userId]
    );

    for (const r of res.rows) {
      if (r.product_id) {
        profile.purchasedProductIds.push(r.product_id);
      }
      if (r.cat) profile.purchasedCategories[r.cat] = (profile.purchasedCategories[r.cat] || 0) + 1;
      if (r.col) profile.purchasedOccasions[r.col] = (profile.purchasedOccasions[r.col] || 0) + 1;
      if (r.type) profile.purchasedTypes[r.type] = (profile.purchasedTypes[r.type] || 0) + 1;
      profile.recentPurchases.push({
        name: r.product_name,
        type: r.type,
        cat: r.cat,
        col: r.col
      });
    }

    const orderCountRes = await query(`SELECT COUNT(*) as count FROM orders WHERE user_id = $1 AND status != 'Cancelled'`, [userId]);
    profile.orderCount = parseInt(orderCountRes.rows[0]?.count || 0, 10);
  } catch (err) {
    console.error('[Recommendation Model] getUserPurchaseProfile error:', err.message);
  }

  return profile;
}

/**
 * Generates personalized luxury outfit recommendations.
 * Synthesizes:
 * 1. Browsing history (recent product views, category/occasion affinity)
 * 2. Previous purchases (coordinating pieces that complement past garments)
 * 3. Patron preferences (occasion, color palette, silhouette, size)
 */
async function generateOutfitRecommendations({ userId, ip, clientHistory, preferences, mood = null, limit = 4 }) {
  // 1. Fetch catalog
  const productsRes = await query(`SELECT * FROM products WHERE stock >= 0 ORDER BY rating DESC;`);
  const catalog = productsRes.rows;
  if (!catalog || catalog.length === 0) return [];

  // 2. Fetch Profiles
  const browsingProfile = await getUserBrowsingProfile(userId, ip, clientHistory);
  const purchaseProfile = await getUserPurchaseProfile(userId);
  const storedPrefs = await getUserPreferences(userId);
  const userPrefs = preferences ? { ...storedPrefs, ...preferences } : storedPrefs;

  // Helper map for fast lookup
  const productMap = new Map();
  catalog.forEach(p => productMap.set(p.id, p));

  // 3. Compute Product Affinity Scores
  const scores = new Map();
  for (const p of catalog) {
    let score = 55; // baseline

    // Browsing History Affinity (+10 to +30 points)
    if (browsingProfile.recentProductIds.includes(p.id)) {
      score += 15;
    }
    if (browsingProfile.topOccasions[p.col]) {
      score += Math.min(20, browsingProfile.topOccasions[p.col] * 7);
    }
    if (browsingProfile.topCategories[p.cat]) {
      score += Math.min(15, browsingProfile.topCategories[p.cat] * 5);
    }

    // Purchase History Affinity (+10 to +25 points)
    if (purchaseProfile.purchasedProductIds.includes(p.id)) {
      // Avoid recommending exact duplicate as main hero; reduce slightly
      score -= 10;
    } else {
      // If patron has purchase history, elevate complementary styles
      if (purchaseProfile.purchasedCategories[p.cat]) {
        score += 12;
      }
      if (purchaseProfile.purchasedOccasions[p.col]) {
        score += 10;
      }
    }

    // Patron Preferences Affinity (+15 to +35 points)
    if (mood) {
      if (p.col === mood) score += 25;
      else score -= 15;
    } else if (userPrefs.preferred_occasions && userPrefs.preferred_occasions.includes(p.col)) {
      score += 18;
    }

    if (userPrefs.preferred_silhouettes && Array.isArray(userPrefs.preferred_silhouettes)) {
      const matchSilhouette = userPrefs.preferred_silhouettes.some(
        s => s.toLowerCase() === (p.type || '').toLowerCase()
      );
      if (matchSilhouette) score += 14;
    }

    if (userPrefs.preferred_tradition && userPrefs.preferred_tradition !== 'both') {
      if (p.cat === userPrefs.preferred_tradition) score += 12;
      else score -= 20;
    }

    // Quality / Rating signal
    score += (Number(p.rating || 5) - 4) * 8;

    scores.set(p.id, score);
  }

  // 4. Compose Cohesive Outfit Ensembles
  // Curated atelier ensemble pairings:
  const ensembleArchetypes = [
    {
      id: 'imperial_bridal',
      title: 'The Imperial Maharani Ensemble',
      tagline: 'Handcrafted Zardozi Silk Lehenga & Heirloom Zari Anarkali Drape',
      occasion: 'wedding',
      primaryId: 6, // Embroidered Lehenga
      pairingId: 1, // Zari Anarkali Set
      tradition: 'ethnic',
      mood: 'Royal Wedding & Reception',
      defaultMatch: 98,
      stylingInsight: (hasBrowse, hasPurchase) => {
        if (hasPurchase) {
          return 'Curated to harmonize with your previous atelier purchase and royal wedding preferences. Hand-stitched with authentic Banarasi zari.';
        }
        if (hasBrowse) {
          return 'Curated from your recent interest in bridal couture and deep wine burgundy silhouettes. Pure heritage silk with hand-worked zardozi.';
        }
        return 'Our pinnacle heritage bridal curation. Layer the hand-embroidered silk lehenga with the sheer zari anarkali drape for timeless grandeur.';
      }
    },
    {
      id: 'banarasi_reception',
      title: 'The Royal Banarasi Silk & Palazzo Soirée',
      tagline: 'Pure Handloom Silk Saree Paired with Tailored Silk Palazzo Co-ord',
      occasion: 'wedding',
      primaryId: 4, // Banarasi Silk Saree
      pairingId: 12, // Silk Palazzo Set
      tradition: 'ethnic',
      mood: 'Grand Sangeet & Reception',
      defaultMatch: 96,
      stylingInsight: (hasBrowse, hasPurchase) => {
        if (hasPurchase) {
          return 'Complements your wardrobe history with luxurious woven pure silk, providing a refined drape for heirloom celebrations.';
        }
        if (hasBrowse) {
          return 'Tailored to your browsing affinity for traditional Indian weaves and festive occasion palettes.';
        }
        return 'Pure Banarasi zari silk draped over contemporary silk palazzos for effortless regal grace at cocktail sangeets.';
      }
    },
    {
      id: 'sartorial_western_tux',
      title: 'The Executive European Sartorial Ensemble',
      tagline: 'Structured Tailored Linen Blazer, Silk Camisole & Wide-Leg Trousers',
      occasion: 'work',
      primaryId: 9, // Linen Tailored Blazer
      pairingId: 11, // Wide-Leg Trousers
      accentId: 10, // Silk Camisole
      tradition: 'western',
      mood: 'Executive Galas & Soirées',
      defaultMatch: 95,
      stylingInsight: () => 'Tailored for sharp elegance. European-structured linen blazer layered over lustrous silk camisole and wide-leg trousers.'
    },
    {
      id: 'liquid_satin_cocktail',
      title: 'The Liquid Satin Cocktail Edit',
      tagline: 'Lustrous Satin Slip Midi Dress Layered with Sartorial Linen Tailoring',
      occasion: 'festive',
      primaryId: 7, // Satin Slip Midi Dress
      pairingId: 9, // Linen Tailored Blazer
      tradition: 'western',
      mood: 'Evening Cocktail & After-Party',
      defaultMatch: 93,
      stylingInsight: () => 'Harmonizes liquid satin drape with structured modern tailoring for chic evening galas and festive cocktail parties.'
    },
    {
      id: 'festive_bandhani_palazzo',
      title: 'The Heritage Bandhani & Silk Palazzo Set',
      tagline: 'Artisanal Bandhani Hand-Tied Kurta with Coordinated Silk Palazzo Bottoms',
      occasion: 'festive',
      primaryId: 2, // Bandhani Kurta Set
      pairingId: 12, // Silk Palazzo Set
      tradition: 'ethnic',
      mood: 'Festive Mehndi & Celebrations',
      defaultMatch: 94,
      stylingInsight: () => 'Intricate hand-tied bandhani silk paired with wide flare silk palazzos for fluid festive celebrations.'
    },
    {
      id: 'daywear_chanderi_breeze',
      title: 'The Artisanal Chanderi Daywear Edit',
      tagline: 'Breathable Handloom Chanderi Kurta Paired with Block Print Silk Saree',
      occasion: 'everyday',
      primaryId: 3, // Chanderi Straight Kurta
      pairingId: 5, // Block Print Cotton Saree
      tradition: 'ethnic',
      mood: 'Daywear Luxury & Intimate Soirées',
      defaultMatch: 92,
      stylingInsight: () => 'Lightweight, breathable artisanal hand-block textiles tailored for daytime poise and garden celebrations.'
    }
  ];

  // 5. Score and Sort Ensembles based on User Data
  const hasBrowsing = browsingProfile.viewCount > 0;
  const hasPurchases = purchaseProfile.orderCount > 0;

  const outfits = [];
  for (const arch of ensembleArchetypes) {
    const primary = productMap.get(arch.primaryId);
    const pairing = productMap.get(arch.pairingId);
    const accent = arch.accentId ? productMap.get(arch.accentId) : null;

    if (!primary || !pairing) continue;

    // Filter by mood / occasion if requested
    if (mood && arch.occasion !== mood) {
      continue;
    }

    // Filter by preferred tradition if strictly non-'both'
    if (userPrefs.preferred_tradition && userPrefs.preferred_tradition !== 'both') {
      if (arch.tradition !== userPrefs.preferred_tradition) continue;
    }

    const primaryScore = scores.get(primary.id) || 60;
    const pairingScore = scores.get(pairing.id) || 60;
    const avgScore = Math.round((primaryScore + pairingScore) / 2);

    // Compute dynamic match percentage (capped between 90% and 99%)
    const matchPercentage = Math.min(99, Math.max(90, Math.round(avgScore * 0.95) + (hasBrowsing ? 3 : 0) + (hasPurchases ? 2 : 0)));

    // Total and bundle prices (10% ensemble bundle privilege)
    const items = [primary, pairing];
    if (accent) items.push(accent);

    const totalPrice = items.reduce((sum, item) => sum + Number(item.price), 0);
    const bundlePrice = Math.round(totalPrice * 0.90); // 10% privilege
    const savings = totalPrice - bundlePrice;

    outfits.push({
      outfitId: arch.id,
      title: arch.title,
      tagline: arch.tagline,
      occasion: arch.occasion,
      mood: arch.mood,
      matchScore: matchPercentage,
      badgeText: `✦ ${matchPercentage}% AI Match`,
      rationale: arch.stylingInsight(hasBrowsing, hasPurchases),
      items: items.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        cat: p.cat,
        col: p.col,
        price: Number(p.price),
        image: p.image,
        sizes: p.sizes || ['XS', 'S', 'M', 'L', 'XL'],
        colors: p.colors || []
      })),
      totalPrice,
      bundlePrice,
      savings,
      bundleDiscount: '10%',
      bundleCode: 'ENSEMBLE10',
      affinityRank: avgScore
    });
  }

  // Sort by highest AI affinity rank
  outfits.sort((a, b) => b.affinityRank - a.affinityRank);

  return outfits.slice(0, limit);
}

/**
 * Returns complementary outfit pairings for a specific garment (PDP cross-sell).
 */
async function getProductPairings(productId) {
  const pId = Number(productId);
  const targetRes = await query(`SELECT * FROM products WHERE id = $1`, [pId]);
  if (targetRes.rows.length === 0) return null;
  const target = targetRes.rows[0];

  // Specific bespoke pairing logic based on garment category and type:
  let pairingQuery;
  let params;

  if (target.cat === 'ethnic') {
    if (target.type.toLowerCase().includes('lehenga') || target.type.toLowerCase().includes('saree')) {
      // Pair with complementary suit sets or kurtas
      pairingQuery = `SELECT * FROM products WHERE id != $1 AND cat = 'ethnic' AND type IN ('Suit sets', 'Kurtas') AND stock > 0 ORDER BY rating DESC LIMIT 2;`;
      params = [pId];
    } else {
      // Pair with Saree or Lehenga
      pairingQuery = `SELECT * FROM products WHERE id != $1 AND cat = 'ethnic' AND type IN ('Sarees', 'Lehengas') AND stock > 0 ORDER BY rating DESC LIMIT 2;`;
      params = [pId];
    }
  } else {
    // Western
    if (target.type.toLowerCase().includes('top') || target.type.toLowerCase().includes('blazer')) {
      pairingQuery = `SELECT * FROM products WHERE id != $1 AND cat = 'western' AND type IN ('Bottoms', 'Dresses') AND stock > 0 ORDER BY rating DESC LIMIT 2;`;
      params = [pId];
    } else {
      pairingQuery = `SELECT * FROM products WHERE id != $1 AND cat = 'western' AND type IN ('Tops & blazers') AND stock > 0 ORDER BY rating DESC LIMIT 2;`;
      params = [pId];
    }
  }

  let pairingsRes = await query(pairingQuery, params);
  if (pairingsRes.rows.length === 0) {
    pairingsRes = await query(`SELECT * FROM products WHERE id != $1 AND stock > 0 ORDER BY rating DESC LIMIT 2;`, [pId]);
  }

  const pairings = pairingsRes.rows;
  const comboPrice = Number(target.price) + pairings.reduce((sum, p) => sum + Number(p.price), 0);
  const bundlePrice = Math.round(comboPrice * 0.90);

  return {
    target: {
      id: target.id,
      name: target.name,
      price: Number(target.price),
      image: target.image
    },
    pairings: pairings.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      cat: p.cat,
      price: Number(p.price),
      image: p.image
    })),
    comboPrice,
    bundlePrice,
    savings: comboPrice - bundlePrice,
    matchScore: 97,
    rationale: `Artisanal pairing curated by Atelier AI Stylist to create a harmonious silhouette with ${target.name}.`
  };
}

module.exports = {
  DEFAULT_PREFERENCES,
  getUserPreferences,
  saveUserPreferences,
  getUserBrowsingProfile,
  getUserPurchaseProfile,
  generateOutfitRecommendations,
  getProductPairings
};
