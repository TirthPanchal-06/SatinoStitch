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
- **Private Curated Wishlist**:
  - Exclusively isolated per user account in PostgreSQL (`user_wishlists`).
  - Only the user who saved a piece can view it in their personal trousseau wishlist.

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

The database schema includes 10 relational tables with foreign keys and performance indexes:

1. **`users`**: Patron and curator accounts (`id`, `name`, `email`, `password_hash`, `role`, `phone`, `created_at`, `updated_at`).
2. **`user_addresses`**: Saved delivery addresses (`id`, `user_id`, `recipient_name`, `phone`, `address_line1`, `address_line2`, `city`, `state`, `pincode`, `is_default`, `created_at`).
3. **`categories`**: Garment categories (`id`, `slug`, `name`, `description`).
4. **`products`**: Garment catalog with JSONB variants (`id`, `name`, `category_id`, `cat`, `type`, `col`, `price`, `old_price`, `images`, `sizes`, `colors`, `stock`, `fabric`, `description`).
5. **`product_reviews`**: Verified customer reviews (`id`, `product_id`, `user_id`, `user_name`, `rating`, `title`, `comment`, `verified_purchase`, `created_at`).
6. **`coupons`**: Promotional discount codes (`id`, `code`, `discount_percent`, `min_order_amount`, `is_active`, `description`).
7. **`orders`**: Customer orders with tracking (`id`, `user_id`, `customer_name`, `customer_email`, `customer_phone`, `shipping_address`, `subtotal`, `discount`, `coupon_code`, `shipping_fee`, `total`, `payment_method`, `payment_status`, `status`, `tracking_number`, `created_at`).
8. **`order_items`**: Order line items (`id`, `order_id`, `product_id`, `product_name`, `size`, `color`, `price`, `quantity`, `total`).
9. **`user_wishlists`**: Isolated per-user trousseau items (`id`, `user_id`, `product_id`, `created_at`).
10. **`cart_items`**: Persistent customer shopping bag (`id`, `user_id`, `product_id`, `size`, `color`, `quantity`, `created_at`, `updated_at`).

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

### Product Catalog, Inventory & Categories
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/categories` | Public | Categories with live product count aggregations |
| `POST` | `/api/categories` | Admin | Create category in PostgreSQL |
| `PUT` | `/api/categories/:id` | Admin | Update category name & description |
| `DELETE` | `/api/categories/:id` | Admin | Remove category |
| `GET` | `/api/types` | Public | Distinct garment silhouette types |
| `GET` | `/api/products` | Public | Dynamic filtering (`cat`, `col`, `type`, `q`, `max`, `inStock`, `sort`) |
| `GET` | `/api/products/:id` | Public | Single product details with variants |
| `POST` | `/api/products` | Admin | Create garment (Admin/Curator) with RBAC |
| `PUT` | `/api/products/:id` | Admin | Update garment details & inventory (Admin/Curator) |
| `DELETE` | `/api/products/:id` | Admin | Remove garment from catalog (Admin/Curator) |
| `POST` | `/api/upload` | Admin | Upload product imagery via Multer (JPEG/PNG/WebP, 5MB limit) |
| `GET` | `/api/inventory` | Admin | Total catalog stock, low-stock alerts, out-of-stock count |
| `PUT` | `/api/products/:id/stock` | Admin | Direct atelier inventory adjustment |
| `GET` | `/api/products/:id/reviews` | Public | Fetch verified reviews for garment |
| `POST` | `/api/products/:id/reviews` | Patron | Submit new customer review |

### Persistent Cart, Coupons & Checkout
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/cart` | Patron | Retrieve persistent server-side cart & line items |
| `POST` | `/api/cart` | Patron | Add or increment item in PostgreSQL shopping bag |
| `PUT` | `/api/cart/:id` | Patron | Update quantity for cart line item |
| `DELETE` | `/api/cart/:id` | Patron | Remove line item from bag |
| `DELETE` | `/api/cart` | Patron | Clear shopping bag |
| `POST` | `/api/cart/sync` | Patron | Merge guest localStorage cart into database on login |
| `GET` | `/api/coupons/:code` | Public | Validate promo code and calculate discount |
| `GET` | `/api/admin/coupons` | Admin | List all promotional discount codes |
| `POST` | `/api/admin/coupons` | Admin | Create new atelier promo coupon |
| `PUT` | `/api/admin/coupons/:id` | Admin | Activate/deactivate or adjust coupon |
| `DELETE` | `/api/admin/coupons/:id` | Admin | Delete promo coupon |
| `POST` | `/api/orders` | Public / Patron | Commission order with stock decrement & cart clearing |
| `GET` | `/api/orders/:id` | Public / Patron | Retrieve order details & tracking status |
| `GET` | `/api/admin/orders` | Admin | View all atelier customer orders |
| `PUT` | `/api/orders/:id/status` | Admin | Update order dispatch / fulfillment status |
| `POST` | `/api/orders/:id/cancel` | Public / Patron | Cancel order and automatically restock inventory |
| `POST` | `/api/orders/:id/return` | Public / Patron | Submit customer return request for delivered orders |

### Authentication, Profiles & Wishlist
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register customer account (**public admin registration disabled**) |
| `POST` | `/api/auth/login` | Public | Patron / Admin authentication with JWT & bcrypt |
| `GET` | `/api/auth/me` | Patron | Fetch active patron profile from token |
| `PUT` | `/api/auth/profile` | Patron | Update patron profile information |
| `PUT` | `/api/auth/password` | Patron | Update account password with old password verification |
| `GET` | `/api/user/addresses` | Patron | List patron saved addresses |
| `POST` | `/api/user/addresses` | Patron | Add new saved address |
| `DELETE` | `/api/user/addresses/:id` | Patron | Delete saved address |
| `GET` | `/api/user/orders` | Patron | List patron order history |
| `GET` | `/api/user/wishlist` | Patron | Fetch isolated personal trousseau wishlist |
| `POST` | `/api/user/wishlist` | Patron | Add item to isolated wishlist |
| `DELETE` | `/api/user/wishlist/:productId` | Patron | Remove item from isolated wishlist |
| `GET` | `/api/admin/users` | Admin | List all registered patrons (passwords stripped) |
| `PUT` | `/api/admin/users/:id/role` | Admin | Promote or adjust account role |

---

## Design System & Theme

- **Imperial Wine**: `#5B1835` / `#3D0F23` (Royal heritage accents, headings, borders)
- **Antique Gold**: `#C6A15B` / `#DFC187` (Couture badges, primary CTAs, active highlights)
- **Ivory Cream**: `#FBF8F2` / `#F3EDE2` (Canvas backgrounds, cards, subtle textures)
- **Espresso Obsidian**: `#1C1715` / `#2D2522` (High-contrast typography and footers)

---

## License

This project is licensed under the ISC License.
