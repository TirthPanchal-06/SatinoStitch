# SATINOSTITCH — Haute Couture & Sartorial Pret

> **Where Timeless Heritage Weaves Meet Sharp Contemporary Sartorial Tailoring.**

SATINOSTITCH is an end-to-end luxury fashion e-commerce and atelier management platform engineered with modern full-stack web technologies: **Node.js**, **Express.js**, **PostgreSQL 18**, and clean, modular **HTML5/CSS3/Vanilla JavaScript (ES6+)**. The platform provides a seamless shopping experience for discerning patrons alongside an enterprise-grade atelier admin dashboard for retail curators and atelier masters.

---

## Architecture Overview

```
                                 ┌────────────────────────────────────────┐
                                 │           Client Layer (Browser)       │
                                 │  • Customer Storefront (Wine & Gold)   │
                                 │  • Admin Dashboard (Stone & Forest)   │
                                 └──────────────────┬─────────────────────┘
                                                    │ REST API / JWT
                                                    ▼
                                 ┌────────────────────────────────────────┐
                                 │        Express.js Backend Engine       │
                                 │  • Authentication & RBAC Middleware    │
                                 │  • Analytics & Audit Log Engine        │
                                 │  • Order & Atomic Inventory Sync       │
                                 │  • Multer Multipart Upload Pipeline   │
                                 └──────────────────┬─────────────────────┘
                                                    │ Parameterized SQL
                                                    ▼
                                 ┌────────────────────────────────────────┐
                                 │     PostgreSQL Relational Database     │
                                 │  • 12 Relational Tables & Indexes      │
                                 │  • Atomic Transactions & Rollbacks     │
                                 │  • Foreign Key Constraints & Cascades  │
                                 └────────────────────────────────────────┘
```

---

## 1. Customer & Patron Panel Features (5 Modules)

The customer panel is styled in an opulent **Royal Wine & Gold** palette (`#5B1835` Royal Wine, `#C6A15B` Antique Gold, `#1C1715` Espresso Black) designed for haute couture patrons.

### Module 1: Home, Brand Discovery & Occasion Concierge
- **Hero Promotional Banners**: Dynamic seasonal banners displaying capsule collections, discount copy, and direct shop navigation.
- **Style & Occasion Concierge Matcher**: Interactive style-finder with mood chips (`Wedding`, `Cocktail`, `Heritage`, `Festive`) that dynamically filters the catalog.
- **Multicurrency Selector**: Real-time currency conversions across INR (`₹`), USD (`$`), EUR (`€`), GBP (`£`), and AED (`د.إ`).
- **Atelier Trust Badges**: Silk Mark Certified, Ethical Handloom, and Complimentary Express Delivery banners.
- **Responsive Mobile Navigation**: Touch-friendly hamburger drawer navigation with live wishlist and cart count badges.

### Module 2: Garment Catalog, Search & Faceted Filtering
- **Dynamic PostgreSQL Catalog**: Real-time product queries pulling from the `products` table joined with `categories`.
- **Instant Search Engine**: Substring matching across garment titles, silhouette descriptions, and woven fabrics.
- **Faceted Silhouette Filters**: Filter by category (`Ethnic Couture` vs `Western Pret`), occasion capsule, silhouette cut, and price thresholds.
- **Smart Sorting**: Sort creations dynamically by active price (`Price: Low to High` / `Price: High to Low`) or catalogue chronology.
- **Product Card Metrics**: Dynamic rating stars, discounted percentage badges, and instant stock indicators.

### Module 3: Product Details (PDP), Lens Zoom & Patron Reviews
- **Multi-Angle Gallery**: Primary image viewport with interactive thumbnail strip supporting multiple high-resolution garment angles.
- **Interactive Lens Zoom**: Smooth image magnifier enabling patrons to inspect intricate zari, zardozi, and hand-embroidery details.
- **Bespoke Shade & Size Selector**: Interactive size selection (`XS` to `XL`) and color swatch selectors with real-time stock verification.
- **Virtual Fit & Measurement Guide**: Modal dialog detailing exact chest, waist, and hip parameters for flawless sartorial fits.
- **Verified Patron Reviews**: Patron review feed displaying verified buyer badges, star ratings, review titles, comments, and submission timestamps.
- **Real-Time View Tracking**: Visiting a product page automatically logs customer browsing activity and updates `views_count` in PostgreSQL.

### Module 4: Shopping Bag, Coupons & Checkout
- **Dual-State Persistent Cart**: LocalStorage fallback for guests seamlessly synchronizes to the PostgreSQL `cart_items` table upon patron sign-in.
- **Promotional Coupon Engine**: Real-time validation of coupon codes (`HERITAGE10`, `ROYAL15`, `ATELIER20`) enforcing minimum order amounts and calculating discounts.
- **Complimentary Delivery Tier**: Automatically awards free express courier shipping on net orders exceeding ₹3,000 (otherwise ₹150 flat fee).
- **Multi-Method Payment Gateway Simulation**:
  - Cash on Delivery (`COD`) with automated pending status.
  - Unified Payments Interface (`UPI`) via QR and VPA.
  - Credit & Debit Cards (`Visa`, `Mastercard`, `RuPay`, `Amex`).
- **Atomic Stock Reservation**: Placing an order atomically decrements stock within a PostgreSQL database transaction to prevent overselling.

### Module 5: Customer Account, Wishlist & Order History
- **Patron Authentication & JWT**: Secure bcrypt-hashed password authentication with JSON Web Tokens.
- **Saved Address Book**: Patrons can save, manage, and delete multiple shipping addresses for one-click checkout.
- **Curated Troussau Wishlist**: Account-scoped personal wishlist persisted in the `user_wishlists` table.
- **Order Tracking & Fulfillment Lifecycle**: Real-time order progress tracking (`Confirmed` → `In Atelier` → `Dispatched` → `Delivered` → `Cancelled`) with courier tracking IDs (`IND-COUT-...`).
- **Self-Service Order Cancellation**: Patrons can cancel active orders prior to courier dispatch, triggering atomic inventory restoration.
- **Concierge Return Inquiries**: Delivered orders feature a one-click return request generator for custom adjustments.

---

## 2. Atelier Admin Dashboard Features

The Admin Dashboard is built with a distinguished **Stone & Forest Green** executive aesthetic (`#F3F2EC` Stone, `#D8D9D0` Sage Grey, `#30483B` Forest Green, `#373B38` Deep Charcoal). The customer shopping navbar is intentionally removed to deliver a focused management portal.

### Real-Time Analytics & PostgreSQL Intelligence
- **Live Sync Beacon**: `🟢 PostgreSQL Real-Time Synchronisation Active` banner featuring automated 15-second background auto-polling and a manual `🔄 Sync Now` button.
- **Live Financial & Operational KPIs**:
  - **Gross Revenue**: Real sum of `orders.total` strictly excluding cancelled orders.
  - **Net Revenue**: Lifetime subtotal after promotional coupon deductions.
  - **Patron Orders & AOV**: Total completed order count and Average Order Value.
  - **Registered Patrons**: Active customer accounts registered in PostgreSQL.
  - **Storefront Demand**: Total tracked product view sessions across the active catalog.
  - **Atelier Stock Units**: Total handcrafted garments available across active designs.
  - **Low-Stock Priority Alerts**: Real-time count of designs with $\le$ 5 units remaining.
- **Interactive Sales Graphs**: Dynamic SVG/CSS bar charts with range switcher:
  - `Daily (7 Days)`: Revenue and volume grouped by day.
  - `Weekly (4 Weeks)`: Aggregation by calendar week.
  - `Monthly (6 Months)`: Month-by-month financial growth.
- **Product Demand Intelligence**:
  - **Best-Selling Garments**: Ranked by actual units sold and total revenue from `order_items`.
  - **Most-Viewed Garments**: Ranked by `views_count` to forecast inventory requirements.
  - **Silhouette Breakdown**: Volume distribution comparing Ethnic Couture vs Western Pret.
  - **Fulfillment Pipeline**: Active volume distribution across order statuses.

### Complete Atelier Management Modules
1. **Live Customer Activity Stream (Dedicated Tab & Overview Widget)**:
   - Chronological audit stream tracking registrations, views, bag additions, orders, payments, cancellations, returns, and reviews.
   - Filter chips: `All Events`, `Orders Placed`, `Patron Registrations`, `Bag Additions`, `Garment Views`, `Cancellations`, `Return Requests`, and `Patron Reviews`.
2. **All Patron Orders & Fulfillment**:
   - Comprehensive commission log with customer information, item breakdown, and payment status badges (`Paid` vs `Pending`).
   - Fulfillment status selector (`Confirmed`, `In Atelier`, `Dispatched`, `Delivered`, `Cancelled`).
   - Quick "Mark Paid" trigger updating `orders.payment_status` in PostgreSQL.
3. **Garment Management (Full CRUD & Image Uploads)**:
   - Create, edit, and delete garments with category, silhouette, fabric, pricing, and initial stock.
   - Multipart image uploader (`POST /api/upload`) with strict MIME filtering (`JPEG`, `PNG`, `WebP`) and 5MB size limit.
4. **Atelier Restock Priority Panel**:
   - Dedicated table highlighting items with critical stock levels ($\le$ 5 units).
   - One-click `+ Restock (+5)` and `+ Restock (+10)` buttons calling `PUT /api/products/:id/stock`.
5. **Promotional Coupon Management**:
   - Create, activate, deactivate, and delete coupon codes with minimum order values and discount percentages.
6. **Patrons & Staff Directory (RBAC)**:
   - User administration table displaying name, email, phone, and role.
   - Role switcher allowing administrators to promote patrons to curators or staff.

---

## 3. Backend Architecture & API Specifications

The backend is built with **Node.js** and **Express.js** connecting to **PostgreSQL 18** using parameterized queries to prevent SQL injection vulnerabilities.

### Database Schema (12 Tables)
| Table | Description |
|---|---|
| `users` | Patron and staff accounts with hashed credentials and roles (`customer`, `admin`). |
| `user_addresses` | Saved customer delivery locations with city, state, and pincode. |
| `categories` | Product hierarchy taxonomy (`ethnic`, `western`). |
| `products` | Garment inventory, pricing, fabric, rating, and view counters. |
| `product_reviews` | Patron reviews, ratings (1–5 stars), titles, and comments. |
| `coupons` | Promotional vouchers with percentage discounts and thresholds. |
| `orders` | Placed commissions with customer metadata, status, tracking number, and totals. |
| `order_items` | Individual line items attached to orders with size, color, price, and quantity. |
| `cart_items` | Persistent server-side patron shopping bag. |
| `user_wishlists` | Curated trousseau items saved by registered patrons. |
| `customer_activities` | System-wide audit log for real-time admin monitoring. |
| `product_views` | Unique visitor and patron product view tracking. |

### Complete REST API Reference

#### Health & Discovery
- `GET /api/health` — PostgreSQL connection status, server uptime, and table entity counts.
- `GET /api/banners` — Curated promotional hero banners.
- `GET /api/collections` — Editorial fashion capsule collections.
- `GET /api/categories` — Active product categories.

#### Garment Catalog & Inventory
- `GET /api/products` — Filtered catalog (`cat`, `col`, `type`, `max`, `q`, `sort`).
- `GET /api/products/:id` — Single product details with automated view logging.
- `POST /api/products` — *(Admin)* Create a new garment in the catalog.
- `PUT /api/products/:id` — *(Admin)* Update garment specifications and pricing.
- `DELETE /api/products/:id` — *(Admin)* Soft/hard delete garment from active catalog.
- `PUT /api/products/:id/stock` — *(Admin)* Replenish or adjust garment stock levels.
- `POST /api/upload` — *(Admin)* Multipart image upload via Multer (JPEG, PNG, WebP).
- `GET /api/products/:id/reviews` — Fetch customer reviews for a creation.
- `POST /api/products/:id/reviews` — Submit verified customer review and recalculate ratings.

#### Customer Authentication & Account
- `POST /api/auth/register` — Create patron account with bcrypt-hashed credentials.
- `POST /api/auth/login` — Authenticate customer or administrator and issue JWT.
- `GET /api/auth/me` — Retrieve authenticated user profile.
- `PUT /api/auth/profile` — Update patron name, phone, and profile details.
- `GET /api/user/addresses` — Fetch saved patron delivery addresses.
- `POST /api/user/addresses` — Save new delivery address.
- `DELETE /api/user/addresses/:id` — Remove saved address.
- `GET /api/user/wishlist` — Retrieve patron's personal trousseau wishlist.
- `POST /api/user/wishlist` — Add garment to trousseau wishlist.
- `DELETE /api/user/wishlist/:productId` — Remove garment from wishlist.

#### Cart, Checkout & Orders
- `GET /api/cart` — Fetch authenticated patron's server-side shopping bag.
- `POST /api/cart` — Add line item with size and shade to bag.
- `PUT /api/cart` — Update line item quantity.
- `DELETE /api/cart/:productId` — Remove line item from bag.
- `DELETE /api/cart` — Clear entire shopping bag.
- `POST /api/cart/sync` — Synchronize guest localStorage bag into database upon login.
- `POST /api/activity/cart` — Log guest bag addition for admin demand analytics.
- `GET /api/coupons/:code` — Validate coupon code and calculate discounts.
- `POST /api/orders` — Place order, decrement stock atomically, and generate tracking ID.
- `GET /api/orders/:id` — Retrieve order summary and fulfillment tracking.
- `GET /api/user/orders` — Customer order history and status tracking.
- `POST /api/orders/:id/cancel` — Cancel order prior to dispatch and restore stock.
- `POST /api/orders/:id/return` — Request concierge return for delivered garments.

#### Admin Atelier Management
- `GET /api/admin/analytics` — Real-time revenue, order KPIs, sales graphs, and demand rankings.
- `GET /api/admin/activities` — Chronological customer activity audit stream with type filters.
- `GET /api/admin/orders` — Complete orders directory across all patrons.
- `PUT /api/orders/:id/status` — Update order fulfillment status and assign tracking numbers.
- `PUT /api/orders/:id/payment` — Toggle payment status between `paid` and `pending`.
- `GET /api/admin/users` — Directory of all registered patrons and staff.
- `PUT /api/admin/users/:id/role` — Update user permissions (`customer` $\leftrightarrow$ `admin`).
- `GET /api/admin/coupons` — Directory of all promotional vouchers.
- `POST /api/admin/coupons` — Create promotional coupon.
- `PUT /api/admin/coupons/:id` — Update discount percentages and thresholds.
- `DELETE /api/admin/coupons/:id` — Deactivate coupon.
- `POST /api/contact` — Concierge inquiry submission.

---

## 4. Getting Started & Setup

### Prerequisites
- **Node.js** (v18.0.0 or later)
- **PostgreSQL** (v14.0 or later)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/TirthPanchal-06/SatinoStitch.git
   cd SatinoStitch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables (`.env`):
   ```env
   PORT=3000
   NODE_ENV=development
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=satinostitch
   DB_USER=postgres
   DB_PASSWORD=your_password
   JWT_SECRET=satinostitch_haute_couture_jwt_secret_2026
   ```

4. Initialize the PostgreSQL Database Schema & Seed Data:
   ```bash
   node backend/db/init.js
   ```

5. Launch the Server:
   ```bash
   npm start
   # Server runs at http://localhost:3000
   ```

### Default Credentials
- **Atelier Administrator**: `admin@satinostitch.com` / `admin123`
- **VIP Customer Patron**: `meera@example.com` / `password123`

---

## 5. Security & Data Integrity Safeguards
- **Password Protection**: Industry-standard bcrypt hashing with 10 salt rounds.
- **Role-Based Access Control (RBAC)**: Route-level middleware (`authenticateToken`, `requireAdmin`) prevents unauthorized access to management modules.
- **SQL Injection Prevention**: 100% of queries use PostgreSQL parameterized statements (`$1`, `$2`).
- **Atomic Stock Integrity**: Orders, stock decrements, and cart clears execute within isolated database transactions with automated rollback on failure.
- **Strict Multipart Upload Validation**: File uploads enforce MIME inspection and a 5MB threshold.
- **Environment Isolation**: `.env` and production keys are strictly excluded from version control via `.gitignore`.

---

**SATINOSTITCH Atelier — Crafted with heritage, engineered for scale.**
