const { pool, query } = require('../config/db');

async function migrateAdminUpgrade() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Support Queries Table (Customer Queries & Support Module)
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_queries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        subject VARCHAR(255),
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        status VARCHAR(50) DEFAULT 'new',
        admin_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Website Settings Table (Website Content Management Module)
    await client.query(`
      CREATE TABLE IF NOT EXISTS website_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. Admin Notifications Table (Notifications Module)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'order',
        link VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Seed default website settings if not present
    const settingsCheck = await client.query('SELECT COUNT(*)::int AS count FROM website_settings;');
    if (settingsCheck.rows[0].count === 0) {
      const defaultSettings = [
        {
          key: 'announcement',
          value: {
            text: 'COMPLIMENTARY EXPRESS SHIPPING ON ORDERS OVER ₹3,000',
            promo_code: 'HERITAGE10',
            promo_label: '10% OFF YOUR FIRST ORDER: HERITAGE10 (Tap to Copy)'
          }
        },
        {
          key: 'hero_banner',
          value: {
            pill: 'HANDCRAFTED HERITAGE & SARTORIAL COUTURE',
            headline: 'Woven for weddings, cut for every day.',
            subheadline: 'Pure Banarasi silk, heritage bandhani and artisanal hand-block prints, paired alongside precision tailoring and liquid satin for the rest of the week. One wardrobe, two timeless traditions.',
            primary_btn: 'SHOP THE COLLECTION',
            primary_link: 'shop.html',
            secondary_btn: 'EXPLORE EDITS',
            secondary_link: 'collections.html'
          }
        },
        {
          key: 'store_info',
          value: {
            store_name: 'SATINOSTITCH LUXURY BOUTIQUE',
            tagline: 'HAUTE COUTURE & SARTORIAL PRET',
            support_email: 'concierge@satinostitch.com',
            support_phone: '+91 (0) 22 8492 0192',
            address: 'Atelier SatinoStitch, 14 Kala Ghoda Arts Precinct, Mumbai 400001',
            tax_rate: 5,
            currency: 'INR',
            order_prefix: 'SS',
            free_shipping_threshold: 3000
          }
        }
      ];

      for (const s of defaultSettings) {
        await client.query(
          `INSERT INTO website_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2;`,
          [s.key, JSON.stringify(s.value)]
        );
      }
      console.log('✓ Seeded default website settings.');
    }

    // Seed sample support queries if empty
    const queriesCheck = await client.query('SELECT COUNT(*)::int AS count FROM support_queries;');
    if (queriesCheck.rows[0].count === 0) {
      const sampleQueries = [
        {
          name: 'Ananya Singhania',
          email: 'ananya.s@singhania.com',
          phone: '+91 98201 12345',
          subject: 'Bespoke Bridal Trousseau for December Wedding in Udaipur',
          message: 'We are planning a 4-day royal wedding in Udaipur this December. I would like to schedule an in-person draping consultation for a 16-kali Banarasi silk lehenga with antique gold zardozi embroidery and matching sherwani fabric.',
          type: 'bespoke',
          status: 'new',
          admin_notes: 'Priority high-value bridal inquiry. Master couturier assigned.'
        },
        {
          name: 'Dr. Rajiv Menon',
          email: 'rajiv.menon@apollo.org',
          phone: '+91 94440 55678',
          subject: 'Custom Sizing for Italian Wool Blazer',
          message: 'I wear a 42-Long with a slightly broader shoulder drop. Could your patternmakers adjust the sleeve length and waist taper on the Classic Check Wool Blazer?',
          type: 'sizing',
          status: 'in_progress',
          admin_notes: 'Spoke with client on phone. Custom measurements received and sent to atelier cutting master.'
        },
        {
          name: 'Priyanka Chopra-Joshi',
          email: 'priyanka.cj@gmail.com',
          phone: '+91 98199 44321',
          subject: 'Dispatch schedule for Order #SS8068472',
          message: 'Kindly confirm if my order containing the Zari Anarkali set will arrive before Friday evening for our family sangeet ceremony.',
          type: 'order',
          status: 'resolved',
          admin_notes: 'Dispatched via BlueDart Priority Air. Tracking TRK-SS-399456 shared via email. Delivered.'
        },
        {
          name: 'Tara Deshmukh',
          email: 'tara.deshmukh@luxemail.in',
          phone: '+91 99300 88765',
          subject: 'Silk Mark Authenticity Certificate for Mulberry Saree',
          message: 'Can you provide the Silk Mark QR code verification before dispatch? This is intended as an heirloom family gift.',
          type: 'general',
          status: 'new',
          admin_notes: null
        }
      ];

      for (const q of sampleQueries) {
        await client.query(`
          INSERT INTO support_queries (name, email, phone, subject, message, type, status, admin_notes, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '1 day' * (RANDOM() * 5));
        `, [q.name, q.email, q.phone, q.subject, q.message, q.type, q.status, q.admin_notes]);
      }
      console.log('✓ Seeded sample support queries.');
    }

    // Seed sample admin notifications if empty
    const notifCheck = await client.query('SELECT COUNT(*)::int AS count FROM admin_notifications;');
    if (notifCheck.rows[0].count === 0) {
      const sampleNotifs = [
        {
          title: 'New High-Value Order Placed',
          message: 'Order #SS9210484 by Meera Kapoor for ₹18,490 received via Razorpay.',
          type: 'order',
          link: 'orders',
          is_read: false
        },
        {
          title: 'Low Stock Alert: Banarasi Silk Lehenga',
          message: 'Only 2 units remaining for "Heritage Banarasi Lehenga". Please arrange workshop weaving.',
          type: 'stock',
          link: 'inventory',
          is_read: false
        },
        {
          title: 'New Bespoke Consultation Request',
          message: 'Ananya Singhania submitted a Bespoke Bridal inquiry for December wedding in Udaipur.',
          type: 'support',
          link: 'support',
          is_read: false
        },
        {
          title: 'New VIP Patron Registration',
          message: 'Patron Kavita Verma registered an atelier account.',
          type: 'customer',
          link: 'users',
          is_read: false
        },
        {
          title: 'Payment Settlement Completed',
          message: 'Daily batch settlement of ₹48,220 credited to atelier operating account.',
          type: 'system',
          link: 'payments',
          is_read: true
        }
      ];

      for (const n of sampleNotifs) {
        await client.query(`
          INSERT INTO admin_notifications (title, message, type, link, is_read, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 hour' * (RANDOM() * 12));
        `, [n.title, n.message, n.type, n.link, n.is_read]);
      }
      console.log('✓ Seeded sample admin notifications.');
    }

    await client.query('COMMIT');
    console.log('✓ Admin database upgrade migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateAdminUpgrade().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateAdminUpgrade };

