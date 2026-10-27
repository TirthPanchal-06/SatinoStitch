# SATINOSTITCH — Haute Couture & Contemporary Pret

> **Where timeless elegance meets modern fashion.**  
> An online luxury fashion atelier bringing together royal Indian artisanal heritage (Banarasi silks, hand-embroidered lehengas, Chanderi kurtas) and modern tailoring.

---

## Overview

**SATINOSTITCH** is a full-featured fashion e-commerce web application. Customers can explore curated seasonal edits, filter and sort collections, view detailed garment specifications, select sizes with interactive fit guides, manage their shopping bag and wishlist across sessions, and place orders through an integrated checkout flow.

---

## Key Features

- **Curated Collections & Catalog**: Browse handcrafted Ethnic (Banarasi, Lehengas, Kurtas) and Western pret (Crepe, Blazers, Satin evening wear).
- **Interactive Filtering & Sorting**: Real-time filtering by category, silhouette type, and price range with instant sorting.
- **Product Details & Quick View**: High-resolution imagery, fabric details, artisan notes, and interactive modal view.
- **Dynamic Bag & Curated Wishlist**: Client-side persistence via localStorage for seamless cart and trousseau wishlist management.
- **Multi-Currency Support**: On-the-fly currency switching (INR, USD, EUR, GBP, AED) with live price recalculation.
- **Checkout & Order Processing**: Delivery details form with validation and backend order processing API.
- **Responsive Haute Couture Aesthetic**: Custom gold-accented luxury styling, smooth animations, and mobile-friendly layouts.

---

## Project Structure

```
satinostitch/
├── backend/
│   ├── data/
│   │   └── products.json     # Product catalog database
│   └── server.js             # Express application & REST API routes
├── frontend/
│   ├── css/
│   │   └── style.css         # Design system & responsive styles
│   ├── images/               # Garment imagery, branding emblems & banners
│   ├── js/
│   │   └── app.js            # Client-side routing, state & DOM manipulation
│   ├── about.html            # Atelier heritage & artisan philosophy
│   ├── cart.html             # Shopping bag & subtotal calculation
│   ├── checkout.html         # Delivery form & order submission
│   ├── collections.html      # Seasonal edits & curated capsules
│   ├── contact.html          # Atelier inquiries & concierge form
│   ├── index.html            # Storefront homepage & hero showcases
│   ├── login.html            # Client portal & account authentication
│   ├── product.html          # Individual product details page
│   ├── shop.html             # Full catalog with search & filters
│   └── wishlist.html         # Personal saved trousseau items
├── .gitignore                # Git ignore configuration
├── package.json              # Project scripts & Express dependencies
└── README.md                 # Project documentation
```

---

## Tech Stack

- **Frontend**: HTML5, Modern CSS3 (Variables, Flexbox, Grid), Vanilla JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Data Store**: JSON-based catalog (`backend/data/products.json`)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation & Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/TirthPanchal-06/SatinoStitch.git
   cd SatinoStitch
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   *For live development with auto-restart on Node 18+:*
   ```bash
   npm run dev
   ```

4. **Access the application**:
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | Retrieve all products (supports `?cat=` and `?col=` query parameters) |
| `GET` | `/api/products/:id` | Retrieve single product details by ID |
| `POST` | `/api/contact` | Submit contact / concierge inquiry |
| `POST` | `/api/orders` | Place a customer order with items and delivery information |

---

## License

This project is licensed under the ISC License.
