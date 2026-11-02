# SATINOSTITCH — Haute Couture & Contemporary Pret

> **Where timeless elegance meets modern fashion.**  
> An online luxury fashion atelier bringing together royal Indian artisanal heritage (Banarasi silks, hand-embroidered lehengas, Chanderi kurtas) and modern tailoring.

---

## Overview

**SATINOSTITCH** is a full-featured fashion e-commerce web application with a Node.js + Express backend and PostgreSQL database integration. Customers can explore curated seasonal edits, filter and sort collections, view detailed garment specifications, select sizes with interactive fit guides, manage their shopping bag and wishlist across sessions, and place orders through an integrated checkout flow.

---

## Key Features

- **Curated Collections & Catalog**: Browse handcrafted Ethnic (Banarasi, Lehengas, Kurtas) and Western pret (Crepe, Blazers, Satin evening wear).
- **PostgreSQL Database Integration (Module 2)**: Dynamic product and category relational tables with foreign keys and optimized indexes.
- **Dynamic Search, Filtering & Sorting (Module 2)**:
  - Category filtering (`ethnic`, `western`)
  - Silhouette / garment type filtering (`Suit sets`, `Kurtas`, `Sarees`, `Lehengas`, `Dresses`, `Tops & blazers`, `Bottoms`)
  - Curated collection filtering (`wedding`, `festive`, `everyday`, `work`)
  - Full-text keyword search across product titles, fabrics, patterns, and atelier descriptions
  - Price ceiling range slider (up to ₹15,000)
  - Sorting by featured/newest, price (low to high), and price (high to low)
- **Product Details & Quick View**: High-resolution imagery, fabric details, artisan notes, and interactive modal view.
- **Dynamic Bag & Curated Wishlist**: Client-side persistence via localStorage for seamless cart and trousseau wishlist management.
- **Multi-Currency Support**: On-the-fly currency switching (INR, USD, EUR, GBP, AED) with live price recalculation.
- **Checkout & Order Processing**: Delivery details form with validation and backend order processing API.
- **Health Check & System Monitoring (Module 1)**: `/api/health` endpoint monitoring server uptime and live PostgreSQL connectivity, with client-side status verification via `fetch()`.
- **Responsive Haute Couture Aesthetic**: Custom gold-accented luxury styling, smooth animations, and mobile-friendly layouts.

---

## Project Structure

```
satinostitch/
├── backend/
│   ├── data/
│   │   └── products.json     # Initial catalog data & fallback store
│   ├── db/
│   │   ├── init.js           # Database migration & seed orchestrator
│   │   └── schema.sql        # PostgreSQL DDL for categories & products
│   ├── db.js                 # PostgreSQL connection pool, queries & repository
│   └── server.js             # Express application, REST endpoints & health check
├── frontend/
│   ├── css/
│   │   └── style.css         # Design system, luxury theme & responsive styles
│   ├── images/               # Garment imagery, branding emblems & banners
│   ├── js/
│   │   └── app.js            # Client-side dynamic shop, routing & DOM logic
│   ├── about.html            # Atelier heritage & artisan philosophy
│   ├── cart.html             # Shopping bag & subtotal calculation
│   ├── checkout.html         # Delivery form & order submission
│   ├── collections.html      # Seasonal edits & curated capsules
│   ├── contact.html          # Atelier inquiries & concierge form
│   ├── index.html            # Storefront homepage & hero showcases
│   ├── login.html            # Client portal & account authentication
│   ├── product.html          # Individual product details page
│   ├── shop.html             # Full catalog with dynamic search & filters
│   └── wishlist.html         # Personal saved trousseau items
├── .env                      # Local environment variables (git-ignored)
├── .env.example              # Example environment variable template
├── .gitignore                # Git ignore configuration (credentials protected)
├── package.json              # Project scripts & Express/pg/dotenv dependencies
└── README.md                 # Project documentation
```

---

## Tech Stack

- **Frontend**: HTML5, Modern CSS3 (Variables, Flexbox, Grid), Vanilla JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (`satinostitch`)
- **Connection & Config**: `pg` (node-postgres connection pool), `dotenv`

---

## Database Architecture (PostgreSQL)

### 1. `categories` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Category identifier |
| `slug` | `VARCHAR(50)` | `UNIQUE NOT NULL` | Category slug (`ethnic`, `western`) |
| `name` | `VARCHAR(100)` | `NOT NULL` | Display name |
| `description` | `TEXT` | | Category description |
| `created_at` | `TIMESTAMP` | `DEFAULT NOW()` | Record creation timestamp |

### 2. `products` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Product identifier (1..12) |
| `name` | `VARCHAR(255)` | `NOT NULL` | Garment title |
| `category_id` | `INTEGER` | `REFERENCES categories(id)` | Foreign key relation to categories |
| `cat` | `VARCHAR(50)` | `NOT NULL` | Slug identifier (`ethnic`, `western`) |
| `type` | `VARCHAR(100)` | `NOT NULL` | Garment silhouette (`Sarees`, `Suit sets`, etc.) |
| `col` | `VARCHAR(50)` | `NOT NULL` | Collection edit (`wedding`, `festive`, etc.) |
| `price` | `NUMERIC(10,2)` | `NOT NULL` | Active selling price in INR |
| `old_price` | `NUMERIC(10,2)` | | Original price / MRP for discount |
| `c1`, `c2` | `VARCHAR(20)` | | Palette hex codes |
| `pat` | `VARCHAR(50)` | | Fabric pattern (`zari`, `bandhani`, etc.) |
| `tag` | `VARCHAR(50)` | | Editorial tag (`New Arrival`, `Bestseller`, etc.) |
| `rating` | `NUMERIC(3,1)` | `DEFAULT 5.0` | Customer rating |
| `reviews` | `INTEGER` | `DEFAULT 0` | Review count |
| `stock` | `INTEGER` | `DEFAULT 0` | Available atelier inventory |
| `image` | `VARCHAR(255)` | `NOT NULL` | Image asset path |
| `fabric` | `VARCHAR(255)` | | Material composition |
| `description` | `TEXT` | | Detailed garment and weave description |
| `created_at` | `TIMESTAMP` | `DEFAULT NOW()` | Record creation timestamp |

Indexes on `products`: `idx_products_cat`, `idx_products_col`, `idx_products_type`, `idx_products_price`.

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
   Configure your PostgreSQL credentials in `.env`:
   ```env
   PORT=3000
   NODE_ENV=development

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=satinostitch
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
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
   - Storefront & Dynamic Shop: `http://localhost:3000/shop.html`
   - Health Check API: `http://localhost:3000/api/health`

---

## API Endpoints

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Diagnostic endpoint checking server uptime, database connection & table counts |
| `GET` | `/api/categories` | — | Retrieve all categories with associated product counts from PostgreSQL |
| `GET` | `/api/types` | — | Retrieve distinct silhouette types from PostgreSQL |
| `GET` | `/api/products` | `cat`, `col`, `type`, `q`, `max`, `min`, `sort` | Dynamic products search, filtering, and sorting powered by PostgreSQL |
| `GET` | `/api/products/:id` | — | Retrieve single product details by ID |
| `POST` | `/api/contact` | — | Submit contact / concierge inquiry |
| `POST` | `/api/orders` | — | Place customer order with item totals calculated from database |

### Example Queries
- Filter Ethnic Wear: `/api/products?cat=ethnic`
- Filter Sarees under ₹9,000: `/api/products?type=Sarees&max=9000`
- Search Banarasi creations: `/api/products?q=Banarasi`
- Sort by price low-to-high: `/api/products?sort=low`
- Combined search & filter: `/api/products?cat=western&type=Dresses&sort=high`

---

## License

This project is licensed under the ISC License.
