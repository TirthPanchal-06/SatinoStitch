const { query } = require('../config/db');

async function updateProductImages() {
  console.log('Updating product image suites in database...');

  // Products 1, 2, 4, 6, 8, etc.
  const angleDefinitions = [
    {
      id: 1,
      image: 'images/p1_front.jpg',
      images: [
        'images/p1_front.jpg',
        'images/p1_closeup.jpg',
        'images/p1_side.jpg',
        'images/p1_back.jpg',
        'images/p1_detail.jpg'
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
      ]
    }
  ];

  for (const item of angleDefinitions) {
    await query(
      'UPDATE products SET image = $1, images = $2::jsonb WHERE id = $3',
      [item.image, JSON.stringify(item.images), item.id]
    );
    console.log(`Updated Product #${item.id} with ${item.images.length} multi-angle photography suite.`);
  }

  // Also update any others with p1 images to have full set
  await query(`
    UPDATE products 
    SET image = 'images/p1_front.jpg',
        images = '["images/p1_front.jpg", "images/p1_closeup.jpg", "images/p1_side.jpg", "images/p1_back.jpg", "images/p1_detail.jpg"]'::jsonb
    WHERE id > 12 AND (image LIKE '%p1.jpg%' OR images::text LIKE '%p1.jpg%')
  `);

  console.log('All products successfully updated with 5 distinct camera angles!');
  process.exit(0);
}

updateProductImages().catch(err => {
  console.error('Update failed:', err);
  process.exit(1);
});
