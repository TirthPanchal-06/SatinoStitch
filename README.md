# SATINOSTITCH Haute Couture

Haute couture ethnic and contemporary western wear digital flagship storefront, featuring pure Banarasi silk, heritage bandhani, tailored blazers, and liquid satin collections.

## Project Structure

```text
satinostitch/
├── backend/
│   ├── data/
│   │   └── products.json      # Product catalog database
│   └── server.js              # Express API server & static file host
├── frontend/
│   ├── css/
│   │   └── style.css          # Haute couture design system & styles
│   ├── images/                # Brand emblems, hero assets & product photography
│   ├── js/
│   │   └── app.js             # Client SPA controller & storefront logic
│   ├── about.html             # Heritage & atelier story
│   ├── cart.html              # Shopping bag
│   ├── checkout.html          # Order placement & shipping details
│   ├── collections.html       # Editorial collections
│   ├── contact.html           # Stylist consultation inquiry
│   ├── index.html             # Brand homepage & interactive style matcher
│   ├── login.html             # Client login & account registration
│   ├── product.html           # PDP with zoom, fabric specs & fit guides
│   ├── shop.html              # Full catalog with multi-facet filters
│   └── wishlist.html          # Curated personal trousseau
├── package.json
└── README.md
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the application
npm start

# For development with auto-reload:
npm run dev
```

Visit the storefront at **http://localhost:3000**.

## Architecture & Features

- **Frontend (`frontend/`)**: Modern vanilla HTML5, CSS3 design tokens, and modular vanilla JavaScript. Includes multi-currency engine (INR, USD, EUR, GBP, AED), interactive style matcher, instant search, faceted filters, and modal quick views.
- **Backend (`backend/`)**: Lightweight Express server serving RESTful APIs and delivering static storefront assets:
  - `GET /api/products`: Filter catalog by category (`cat`) or collection (`col`).
  - `GET /api/products/:id`: Fetch single product by numeric identifier.
  - `POST /api/orders`: Process and log checkout orders with customer info.
  - `POST /api/contact`: Receive concierge and customer inquiries.
- **Data Persistence**: Cart, wishlist, and active session persist via `localStorage`. Catalog data is housed in `backend/data/products.json`.
- **Promo Code**: Try `HERITAGE10` at checkout for 10% off.
