**SATINOSTITCH** 

SATINOSTITCH is an online fashion shopping platform focused on providing a smooth, convenient, and enjoyable shopping experience. It offers customers a place to explore different clothing styles, discover the latest fashion trends, and shop for ethnic and western wear.

The platform is designed to make the online shopping process simple, from discovering products to placing orders and managing purchases. It also supports the business in handling its daily activities and maintaining an organized shopping and order management process.

With an elegant design and user-friendly experience, SATINOSTITCH aims to connect customers with fashion while making online shopping more accessible and convenient.

## Project Objective

The main objective of SATINOSTITCH is to establish a professional online presence for a fashion business, simplify clothing purchases, improve customer convenience, and support efficient business operations through a centralized digital platform.

## Project Vision

To create a reliable and scalable online fashion destination that brings together modern shopping experiences, quality fashion, and convenient business operations.

---

## Backend Architecture & Key Modules

SATINOSTITCH is powered by a high-performance **Node.js + Express.js + PostgreSQL** architecture with secure authentication, role-based access control (RBAC), and persistent transactional workflows.

### 1. Products & Categories API
- **Dynamic Catalog Querying**: Multi-facet filtering (`cat`, `col`, `type`, `max`, `min`, `inStock`), debounced full-text search, and multi-mode sorting.
- **Role-Based Access Control**: Product and category creation, updates, and deletion are strictly protected and restricted to administrators (`requireAdmin`).
- **Image Uploads**: Secure file upload handling using `multer` with strict MIME filtering (`image/jpeg`, `image/png`, `image/webp`) and 5MB size limit.

### 2. Customer Authentication & Profile Security
- **Strict Registration Policy**: Public registration is strictly restricted to `customer` accounts. Any attempt to escalate privileges to `admin` during public signup is blocked with an HTTP 403 Forbidden error.
- **Password Protection**: Passwords securely hashed with `bcryptjs` (salt rounds: 10). Sensitive credential fields (`password_hash`) are automatically stripped from all API outputs.
- **Token Authorization**: Stateless session authorization powered by `jsonwebtoken` (JWT) with bearer token extraction.
- **Profile & Address Book**: Patron profile modifications, password changes with current password verification, and full address book CRUD.

### 3. Isolated Customer Wishlist
- **Account Isolation**: Wishlists are strictly associated with each authenticated patron ID in PostgreSQL (`user_wishlists`).
- **No Cross-Contamination**: Each user sees exclusively their own curated trousseau pieces. Unauthenticated visitors are prompted to sign in before saving items.

### 4. Persistent Customer Cart
- **Database Persistence**: Server-side cart stored in PostgreSQL (`cart_items`) with unique constraints on `(user_id, product_id, size, color)`.
- **Guest-to-User Sync**: Seamlessly syncs guest browser items to the authenticated account upon sign-in.
- **Quantity Controls & Auto-Clearing**: Real-time quantity adjustments and automatic cart clearance upon successful order commissioning.

### 5. Inventory & Stock Automation
- **Real-Time Stock Decrement**: Atomically decrements garment inventory stock in PostgreSQL within an SQL transaction when orders are placed.
- **Automated Restocking**: Automatically restores inventory count when customer orders are cancelled.
- **Inventory Metrics**: Dedicated administrative metrics endpoint reporting catalog totals, low-stock warnings, and out-of-stock items.

### 6. Coupons & Order Checkout
- **Dynamic Coupon Engine**: Real-time promo code validation against PostgreSQL (`HERITAGE10`, `ROYAL15`, `ATELIER20`) with threshold enforcement.
- **Transactional Checkout**: Validates contact details, recipient address, line item inventory, and calculates shipping fees.
- **Visual Order Tracking**: 5-stage tracking lifecycle with auto-generated tracking numbers and direct cancellation/return handling.

---

## PostgreSQL Database Schema (10 Tables)

1. **`users`**: Patron and administrator accounts (`id`, `name`, `email`, `password_hash`, `role`, `phone`, `created_at`, `updated_at`).
2. **`user_addresses`**: Saved delivery addresses (`id`, `user_id`, `recipient_name`, `phone`, `address_line1`, `address_line2`, `city`, `state`, `pincode`, `is_default`, `created_at`).
3. **`categories`**: Garment categories (`id`, `slug`, `name`, `description`).
4. **`products`**: Garment catalog (`id`, `name`, `category_id`, `cat`, `type`, `col`, `price`, `old_price`, `images`, `sizes`, `colors`, `stock`, `fabric`, `description`).
5. **`product_reviews`**: Verified customer reviews (`id`, `product_id`, `user_id`, `user_name`, `rating`, `title`, `comment`, `verified_purchase`, `created_at`).
6. **`coupons`**: Promotional discount codes (`id`, `code`, `discount_percent`, `min_order_amount`, `is_active`, `description`).
7. **`orders`**: Customer orders (`id`, `user_id`, `customer_name`, `customer_email`, `customer_phone`, `shipping_address`, `subtotal`, `discount`, `coupon_code`, `shipping_fee`, `total`, `payment_method`, `payment_status`, `status`, `tracking_number`, `created_at`).
8. **`order_items`**: Order line items (`id`, `order_id`, `product_id`, `product_name`, `size`, `color`, `price`, `quantity`, `total`).
9. **`user_wishlists`**: User-isolated trousseau items (`id`, `user_id`, `product_id`, `created_at`).
10. **`cart_items`**: Persistent customer shopping bag (`id`, `user_id`, `product_id`, `size`, `color`, `quantity`, `created_at`, `updated_at`).

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [PostgreSQL](https://www.postgresql.org/) (v14+)
- [npm](https://www.npmjs.com/)

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
   Copy `.env.example` to `.env` and specify database credentials:
   ```env
   PORT=3000
   NODE_ENV=development

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=satinostitch
   DB_USER=postgres
   DB_PASSWORD=your_password

   JWT_SECRET=satinostitch_luxury_atelier_secret_2026
   ```

4. **Initialize Database Tables & Seed**:
   ```bash
   npm run seed
   ```

5. **Start the application**:
   ```bash
   npm start
   ```

---

## Pre-Seeded Test Credentials

| Role | Email | Password | Access / Scope |
|---|---|---|---|
| **Patron / Customer** | `meera@example.com` | `password123` | Order history, tracking, address book, private wishlist, cart |
| **Atelier Admin** | `admin@satinostitch.com` | `admin123` | Full access + product CRUD, image uploads, inventory metrics, order status |

---

## Complete API Reference

### System & Diagnostics
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Server uptime, database connection status, and table counts |
| `GET` | `/api/banners` | Public | Seasonal promotional banners and campaign copy |
| `GET` | `/api/collections` | Public | Curated capsules and lookbook edits |
| `POST` | `/api/newsletter` | Public | VIP newsletter dispatch signup |
| `POST` | `/api/contact` | Public | Concierge & atelier inquiry submission |

### Products, Categories & Inventory
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

### Cart, Coupons & Orders
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

### Authentication, User & Wishlist
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

**SATINOSTITCH — Where timeless elegance meets modern fashion.**
