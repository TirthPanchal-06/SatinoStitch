const { query } = require('../config/db');

async function curateCatalog() {
  console.log('Curating SATINOSTITCH product photography & catalogue integrity...');

  // 1. Permanently remove duplicate test products 13-17
  await query('DELETE FROM products WHERE id IN (13, 14, 15, 16, 17);');
  console.log('Cleaned up duplicate test entries.');

  // 2. Curate individual product photography and authentic luxury color names
  const updates = [
    {
      id: 1,
      image: 'images/p1_front.jpg',
      images: [
        'images/p1_front.jpg',
        'images/p1_closeup.jpg',
        'images/p1_side.jpg',
        'images/p1_back.jpg',
        'images/p1_detail.jpg'
      ],
      colors: [
        { name: 'Royal Wine', hex: '#5B1835' },
        { name: 'Antique Gold Zari', hex: '#C6A15B' }
      ]
    },
    {
      id: 2,
      image: 'images/p2_front.jpg',
      images: [
        'images/p2_front.jpg',
        'images/p2_closeup.jpg',
        'images/p2_side.jpg',
        'images/p2_back.jpg',
        'images/p2_detail.jpg'
      ],
      colors: [
        { name: 'Madder Red', hex: '#8C2F39' },
        { name: 'Ivory Cream', hex: '#F3DFB7' }
      ]
    },
    {
      id: 3,
      image: 'images/p3_front.jpg',
      images: [
        'images/p3_front.jpg',
        'images/p3_closeup.jpg',
        'images/p3_side.jpg',
        'images/p3_back.jpg',
        'images/p3_detail.jpg'
      ],
      colors: [
        { name: 'Golden Chanderi', hex: '#D9C7A0' },
        { name: 'Wine Accent', hex: '#5B1835' }
      ]
    },
    {
      id: 4,
      image: 'images/p4_front.jpg',
      images: [
        'images/p4_front.jpg',
        'images/p4_closeup.jpg',
        'images/p4_side.jpg',
        'images/p4_back.jpg',
        'images/p4_detail.jpg'
      ],
      colors: [
        { name: 'Aubergine Purple', hex: '#3B1226' },
        { name: 'Temple Gold Zari', hex: '#C6A15B' }
      ]
    },
    {
      id: 5,
      image: 'images/p5_front.jpg',
      images: [
        'images/p5_front.jpg',
        'images/p5_closeup.jpg',
        'images/p5_side.jpg',
        'images/p5_back.jpg',
        'images/p5_detail.jpg'
      ],
      colors: [
        { name: 'Mulmul Ivory', hex: '#EFE3CB' },
        { name: 'Terracotta Wine', hex: '#7A2B45' }
      ]
    },
    {
      id: 6,
      image: 'images/p6_front.jpg',
      images: [
        'images/p6_front.jpg',
        'images/p6_closeup.jpg',
        'images/p6_side.jpg',
        'images/p6_back.jpg',
        'images/p6_detail.jpg'
      ],
      colors: [
        { name: 'Bridal Crimson', hex: '#5B1835' },
        { name: 'Zardozi Gold', hex: '#C6A15B' }
      ]
    },
    {
      id: 7,
      image: 'images/p7_front.jpg',
      images: [
        'images/p7_front.jpg',
        'images/p7_closeup.jpg',
        'images/p7_side.jpg',
        'images/p7_back.jpg',
        'images/p7_detail.jpg'
      ],
      colors: [
        { name: 'Liquid Wine', hex: '#6B2441' }
      ]
    },
    {
      id: 8,
      image: 'images/p8_front.jpg',
      images: [
        'images/p8_front.jpg',
        'images/p8_closeup.jpg',
        'images/p8_side.jpg',
        'images/p8_back.jpg',
        'images/p8_detail.jpg'
      ],
      colors: [
        { name: 'Espresso Black', hex: '#2B211E' },
        { name: 'Gold Pinstripe', hex: '#C6A15B' }
      ]
    },
    {
      id: 9,
      image: 'images/p9_front.jpg',
      images: [
        'images/p9_front.jpg',
        'images/p9_closeup.jpg',
        'images/p9_side.jpg',
        'images/p9_back.jpg',
        'images/p9_detail.jpg'
      ],
      colors: [
        { name: 'Sand Houndstooth', hex: '#CDB994' },
        { name: 'Warm Taupe', hex: '#8A7650' }
      ]
    },
    {
      id: 10,
      image: 'images/p10_front.jpg',
      images: [
        'images/p10_front.jpg',
        'images/p10_closeup.jpg',
        'images/p10_side.jpg',
        'images/p10_back.jpg',
        'images/p10_detail.jpg'
      ],
      colors: [
        { name: 'Champagne Silk', hex: '#E9D8BD' }
      ]
    },
    {
      id: 11,
      image: 'images/p11_front.jpg',
      images: [
        'images/p11_front.jpg',
        'images/p11_closeup.jpg',
        'images/p11_side.jpg',
        'images/p11_back.jpg',
        'images/p11_detail.jpg'
      ],
      colors: [
        { name: 'Roasted Espresso', hex: '#2B211E' },
        { name: 'Cocoa', hex: '#4A3A34' }
      ]
    },
    {
      id: 12,
      image: 'images/p12_front.jpg',
      images: [
        'images/p12_front.jpg',
        'images/p12_closeup.jpg',
        'images/p12_side.jpg',
        'images/p12_back.jpg',
        'images/p12_detail.jpg'
      ],
      colors: [
        { name: 'Honey Gold', hex: '#C6A15B' },
        { name: 'Royal Wine', hex: '#5B1835' }
      ]
    },
    {
      id: 18,
      image: 'uploads/garment-1793878853385-280237859.jpg',
      images: [
        'uploads/garment-1793878853385-280237859.jpg'
      ],
      colors: [
        { name: 'Imperial Magenta', hex: '#641C44' },
        { name: 'Floral Gold Zari', hex: '#C6A15B' }
      ]
    }
  ];

  for (const item of updates) {
    await query(
      `UPDATE products 
       SET image = $1, images = $2::jsonb, colors = $3::jsonb 
       WHERE id = $4`,
      [item.image, JSON.stringify(item.images), JSON.stringify(item.colors), item.id]
    );
    console.log(`Curated Product #${item.id}: image, ${item.images.length} gallery angles, colors updated.`);
  }

  // Also update banner cards and hero thumbnails
  console.log('All products successfully curated!');
  process.exit(0);
}

curateCatalog().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});

