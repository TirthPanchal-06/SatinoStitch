# SATINOSTITCH — Haute Couture & Contemporary Pret

> **Where timeless elegance meets modern fashion.**  
> An online luxury fashion atelier bringing together royal Indian artisanal heritage (Banarasi silks, hand-embroidered lehengas, Chanderi kurtas) and modern tailoring.

---

## Overview

**SATINOSTITCH** is a full-featured fashion e-commerce web application with a Node.js + Express backend and PostgreSQL database integration. Customers can explore curated seasonal edits, filter and sort collections, view detailed garment specifications with interactive zoom and verified reviews, select sizes with interactive fit guides, manage their shopping bag and trousseau wishlist across sessions, apply dynamic atelier promo coupons, and place orders through an integrated checkout flow with real-time inventory decrement and visual delivery tracking.

---

## Five Customer Modules

### 1. Home Module (`index.html`)
- **Hero & Promotional Banners**: Dynamic seasonal couture banners with marquee announcements, editorial tags, and direct CTA routing.
- **Curated Collections Showcase**: Hand-curated capsules (*The Royal Banarasi Edit*, *Noor-e-Zari Wedding Trousseau*, *Aangan Festive Chanderi*, *The Sovereign Velvet Series*).
- **Style & Occasion Concierge Matcher**: Interactive style finder matching patron preferences (Occasion: *Wedding, Festive, Evening Gala, Cocktail Soiree*, Mood: *Royal Opulence, Contemporary Minimalist, Heritage Classic*) with instant catalog filtering.
- **Curated Featured Showcase**: Live catalog highlights with price, ratings, quick view, and direct bag insertion.
- **VIP Newsletter Subscription**: Atelier dispatch signup with email validation and confirmation modal.

### 2. Product Catalogue Module (`shop.html`)
- **Dynamic PostgreSQL Catalog**: Real-time querying against relational PostgreSQL tables with debounced search.
- **Multi-Facet Filtering**:
  - Category filtering (`ethnic`, `western`)
  - Silhouette / garment type filtering (`Suit sets`, `Kurtas`, `Sarees`, `Lehengas`, `Dresses`, `Tops & blazers`, `Bottoms`)
  - Curated collection filtering (`wedding`, `festive`, `everyday`, `work`)
  - Full-text keyword search across garment titles, fabrics, patterns, and descriptions
  - Price ceiling slider (up to ₹15,000)
  - In-stock availability toggle
- **Dynamic Sorting**: Featured/newest, price (low-to-high), price (high-to-low), and customer rating.
- **Interactive Quick View Modal**: Preview specs, fabrics, and size variants directly from catalog cards.
- **Wishlist Toggle**: Real-time heart toggle synchronizing locally and with backend PostgreSQL wishlist table when authenticated.

### 3. Product Details Page (PDP) (`product.html`)
- **Interactive Zoom Lens & Gallery**: Hover zoom inspection for fabric weaves and gold zari embroidery, accompanied by clickable image thumbnail selector.
- **Garment Specifications**: Detailed breakdowns of material composition, weave pattern, sleeve silhouette, care instructions, and artisan origin.
- **Variant Selectors**:
  - Size variants (`XS`, `S`, `M`, `L`, `XL`, `XXL`) with out-of-stock disable states.
  - Interactive colour swatches reflecting available garment palette options.
- **Inventory Stock Indicator**: Live inventory warnings ("Only 2 pieces remaining in atelier" / "Made to Order").
- **Virtual Size Finder & Fit Guide**: Modal reference with standard bust, waist, and hip measurements across XS–XXL.
- **Verified Customer Reviews**:
  - Star ratings breakdown and average score calculation.
  - Review listing with patron names, verified purchase badges, and review dates.
  - Interactive review submission form with live star picker, verified feedback storage, and database persistence.
- **Curated Ensemble (Related Items)**: Dynamic recommendations sharing collection or silhouette motifs.

### 4. Cart & Checkout Module (`cart.html`, `checkout.html`)
- **Persistent Shopping Bag**: Line items displaying selected size, color, quantity adjustments, and remove actions.
- **Complimentary Shipping Progress Bar**: Dynamic progress tracking toward the ₹3,000 complimentary insured courier threshold.
- **Dynamic Atelier Coupon Engine**:
  - `HERITAGE10` — 10% off entire order.
  - `ROYAL15` — 15% off orders exceeding ₹5,000.
  - `ATELIER20` — 20% off orders exceeding ₹8,000.
  - Live coupon validation against PostgreSQL database with real-time discount calculation.
- **Checkout Address Management**:
  - Seamless auto-fill from authenticated user's saved address book.
  - New delivery address form with validation (recipient, address line, city, state, pin code, phone).
  - Option to save address to patron address book during checkout.
- **Payment Method Selection**:
  - UPI / QR payment simulation.
  - Credit & Debit Card checkout with cardholder formatting.
  - Net Banking across premier Indian institutions.
  - Cash on Delivery (COD) for eligible domestic pin codes.
- **Order Placement & Stock Decrement**:
  - Transactional order creation in PostgreSQL with unique tracking ID generation (`SS` + 7 digits).
  - Automatic inventory stock decrement in the `products` table.
  - Order confirmation view with direct order tracking link.

### 5. Customer Account Portal (`login.html`)
- **Secure Authentication**:
  - Patron sign in & registration with email validation, bcrypt password hashing, and JWT authorization.
  - Pre-seeded test accounts ready for instant testing.
- **Patron Profile Management**:
  - View and update full name, contact phone, and atelier preferences.
- **Saved Delivery Addresses (CRUD)**:
  - Add, view, set default, and delete multiple delivery addresses saved in PostgreSQL.
- **Order History & Visual Tracking Stepper**:
  - Comprehensive log of past and active orders with item summaries, price breakdown, and current status.
  - 5-stage interactive tracking stepper: *Confirmed → Handcrafted at Atelier → Quality Inspected → Dispatched via Courier → Delivered*.
- **Self-Service Order Management**:
  - Cancel order functionality (restores inventory stock to the database automatically).
  - Return request initiation for delivered couture orders.
- **Atelier Management & Product CRUD (Admin)**:
  - Exclusive portal tab for atelier curators.
  - Create, update, and delete catalog garments with title, category, type, price, stock, and descriptions.
  - Drag-and-drop / file upload dropzone using `multer` storing imagery in `frontend/uploads/`.

---

## Project Structure

```
satinostitch/
├── backend/
│   ├── data/
│   │   └── products.json         # Fallback data store & initial catalog
│   ├── db/
│   │   ├── init.js               # Database migration & seed orchestrator (all 9 tables)
│   │   └── schema.sql            # PostgreSQL DDL for tables, constraints & indexes
│   ├── middleware/
│   │   └── auth.js               # JWT authentication & role-based middleware
│   ├── db.js                     # Parameterized PostgreSQL connection pool & queries
│   └── server.js                 # Express application, REST endpoints & static routes
├── frontend/
│   ├── css/
│   │   └── style.css             # Royal Heritage design system & responsive styling
│   ├── images/                   # Garment imagery, branding emblems & banners
│   ├── js/
│   │   └── app.js                # Core frontend client controller & UI modules
│   ├── uploads/                  # Uploaded garment imagery storage
│   ├── about.html                # Atelier heritage & artisan philosophy
│   ├── cart.html                 # Shopping bag & subtotal calculation
│   ├── checkout.html             # Delivery details & order placement
│   ├── collections.html          # Seasonal edits & curated capsules
│   ├── contact.html              # Atelier inquiries & concierge form
│   ├── index.html                # Storefront homepage & hero showcases
│   ├── login.html                # Client portal & account authentication / dashboard
│   ├── product.html              # Individual product details page with zoom & reviews
│   ├── shop.html                 # Full catalog with dynamic search & filters
│   └── wishlist.html             # Personal saved trousseau items
├── .env                          # Local environment variables (git-ignored)
├── .env.example                  # Example environment variable template
├── .gitignore                    # Git ignore configuration
├── package.json                  # Project scripts & Express/pg/bcrypt/jsonwebtoken/multer
└── README.md                     # Project documentation
```

---

## Tech Stack

- **Frontend**: HTML5, Modern CSS3 (CSS Variables, Flexbox, CSS Grid), Vanilla JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Authentication**: JSON Web Tokens (`jsonwebtoken`), `bcryptjs`
- **File Uploads**: `multer`
- **Database**: PostgreSQL (`satinostitch`)
- **Connection & Config**: `pg` (node-postgres connection pool), `dotenv`

---

## Database Architecture (PostgreSQL)

The database schema includes 9 relational tables with foreign keys and performance indexes:

1. **`users`**: Patron and curator accounts (`id`, `full_name`, `email`, `password_hash`, `role`, `phone`, `created_at`).
2. **`user_addresses`**: Saved delivery addresses (`id`, `user_id`, `recipient_name`, `phone`, `address_line`, `city`, `state`, `postal_code`, `is_default`, `created_at`).
3. **`categories`**: Garment categories (`id`, `slug`, `name`, `description`).
4. **`products`**: Garment catalog with JSONB variants (`id`, `name`, `category_id`, `cat`, `type`, `col`, `price`, `old_price`, `images`, `sizes`, `colors`, `stock`, `fabric`, `description`).
5. **`product_reviews`**: Verified customer reviews (`id`, `product_id`, `user_id`, `author_name`, `rating`, `title`, `comment`, `verified_purchase`, `created_at`).
6. **`coupons`**: Promotional discount codes (`id`, `code`, `discount_percent`, `min_order_amount`, `max_discount`, `is_active`, `expires_at`).
7. **`orders`**: Customer orders with tracking (`id`, `order_number`, `user_id`, `recipient_name`, `shipping_address`, `payment_method`, `subtotal`, `discount_amount`, `shipping_fee`, `total_amount`, `status`, `tracking_number`, `created_at`).
8. **`order_items`**: Order line items (`id`, `order_id`, `product_id`, `product_name`, `size`, `color`, `quantity`, `unit_price`, `total_price`).
9. **`user_wishlists`**: Synchronized saved trousseau items (`id`, `user_id`, `product_id`, `created_at`).

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/) (version 14 or higher)

### Setup & Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/TirthPanchal-06/SatinoStitch.git
   cd SatinoStitch
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Configure your PostgreSQL credentials and JWT secret in `.env`:
   ```env
   PORT=3000
   NODE_ENV=development

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=satinostitch
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password

   JWT_SECRET=satinostitch_luxury_atelier_secret_2026
   ```

4. **Ensure PostgreSQL Database Exists**:
   ```sql
   CREATE DATABASE satinostitch;
   ```

5. **Initialize Database Tables & Seed (Automated on Start)**:
   ```bash
   npm run seed
   ```
   *(Note: The server also auto-verifies tables and seeds initial data on startup if empty).*

6. **Start the server**:
   ```bash
   npm start
   ```
   *For live development with auto-restart:*
   ```bash
   npm run dev
   ```

7. **Access the application**:
   - Storefront & Home: `http://localhost:3000/index.html`
   - Dynamic Shop: `http://localhost:3000/shop.html`
   - Patron Account Portal: `http://localhost:3000/login.html`
   - Health Check API: `http://localhost:3000/api/health`

---

## Pre-Seeded Test Credentials

| Role | Email | Password | Access / Scope |
|---|---|---|---|
| **Patron / Customer** | `meera@example.com` | `password123` | Order history, tracking stepper, address book, trousseau wishlist |
| **Atelier Curator / Admin** | `admin@satinostitch.com` | `admin123` | Full customer access + Atelier product CRUD & image upload dropzone |

---

## Promo Coupon Codes

| Code | Discount | Conditions |
|---|---|---|
| `HERITAGE10` | 10% Off | Valid across entire catalog, no minimum order requirement |
| `ROYAL15` | 15% Off | Valid on orders of ₹5,000 or more |
| `ATELIER20` | 20% Off | Valid on luxury couture orders of ₹8,000 or more |

---

## Complete API Reference

### Diagnostics & Content
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Uptime, database connection health, and table counts |
| `GET` | `/api/banners` | Promotional editorial banners & CTA definitions |
| `GET` | `/api/collections` | Curated seasonal capsules & heritage edits |
| `POST` | `/api/newsletter` | VIP newsletter dispatch signup |
| `POST` | `/api/contact` | Concierge & atelier inquiry submission |

### Product Catalog & Reviews
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/categories` | Categories with live product count aggregations |
| `GET` | `/api/types` | Distinct garment silhouette types |
| `GET` | `/api/products` | Dynamic filtering (`cat`, `col`, `type`, `q`, `max`, `inStock`, `sort`) |
| `GET` | `/api/products/:id` | Single product details with variants |
| `POST` | `/api/products` | Create garment (Admin/Curator) |
| `PUT` | `/api/products/:id` | Update garment details & inventory (Admin/Curator) |
| `DELETE` | `/api/products/:id` | Remove garment from catalog (Admin/Curator) |
| `POST` | `/api/upload` | Upload product imagery via Multer |
| `GET` | `/api/products/:id/reviews` | Fetch verified reviews for garment |
| `POST` | `/api/products/:id/reviews` | Submit new customer review |

### Cart, Coupons & Checkout
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/coupons/:code` | Validate promo code and calculate discount |
| `POST` | `/api/orders` | Place transactional order and decrement stock |
| `GET` | `/api/orders/:id` | Retrieve order details & tracking status |
| `POST` | `/api/orders/:id/cancel` | Cancel order and restock inventory |
| `POST` | `/api/orders/:id/return` | Submit customer return request |

### Authentication & Customer Account
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new patron account |
| `POST` | `/api/auth/login` | Patron / Admin authentication with JWT |
| `GET` | `/api/auth/me` | Fetch active patron profile from token |
| `PUT` | `/api/auth/profile` | Update patron profile information |
| `GET` | `/api/user/addresses` | List patron saved addresses |
| `POST` | `/api/user/addresses` | Add new saved address |
| `DELETE` | `/api/user/addresses/:id` | Delete saved address |
| `GET` | `/api/user/orders` | List patron order history |
| `GET` | `/api/user/wishlist` | Fetch synchronized trousseau wishlist |
| `POST` | `/api/user/wishlist` | Add item to synchronized wishlist |
| `DELETE` | `/api/user/wishlist/:productId` | Remove item from synchronized wishlist |

---

## Design System & Theme

- **Imperial Wine**: `#5B1835` / `#3D0F23` (Royal heritage accents, headings, borders)
- **Antique Gold**: `#C6A15B` / `#DFC187` (Couture badges, primary CTAs, active highlights)
- **Ivory Cream**: `#FBF8F2` / `#F3EDE2` (Canvas backgrounds, cards, subtle textures)
- **Espresso Obsidian**: `#1C1715` / `#2D2522` (High-contrast typography and footers)

---

## License

This project is licensed under the ISC License.
