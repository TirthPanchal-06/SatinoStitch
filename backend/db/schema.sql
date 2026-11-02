-- SATINOSTITCH PostgreSQL Schema
-- Modules 1 - 5: Complete Customer & Atelier Architecture

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  role VARCHAR(50) DEFAULT 'customer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. User Addresses
CREATE TABLE IF NOT EXISTS user_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(50) DEFAULT 'Home',
  recipient_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(20) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  cat VARCHAR(50) NOT NULL,
  type VARCHAR(100) NOT NULL,
  col VARCHAR(50) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  old_price NUMERIC(10, 2),
  c1 VARCHAR(20),
  c2 VARCHAR(20),
  pat VARCHAR(50),
  tag VARCHAR(50),
  rating NUMERIC(3, 1) DEFAULT 5.0,
  reviews INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  image VARCHAR(255) NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  fabric VARCHAR(255),
  description TEXT,
  sizes JSONB DEFAULT '["XS", "S", "M", "L", "XL"]'::jsonb,
  colors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alter table to ensure new columns exist if products table was created in Module 2
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '["XS", "S", "M", "L", "XL"]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. Product Reviews
CREATE TABLE IF NOT EXISTS product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(100) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255),
  comment TEXT NOT NULL,
  verified_purchase BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  min_order_amount NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  description VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Orders
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(50) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  shipping_address JSONB NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  discount NUMERIC(10, 2) DEFAULT 0,
  coupon_code VARCHAR(50),
  shipping_fee NUMERIC(10, 2) DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'cod',
  payment_status VARCHAR(50) DEFAULT 'pending',
  status VARCHAR(50) DEFAULT 'Confirmed',
  tracking_number VARCHAR(100),
  estimated_delivery TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT,
  return_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  image VARCHAR(255),
  size VARCHAR(20) NOT NULL,
  color VARCHAR(50),
  price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total NUMERIC(10, 2) NOT NULL
);

-- 9. Wishlist
CREATE TABLE IF NOT EXISTS user_wishlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(cat);
CREATE INDEX IF NOT EXISTS idx_products_col ON products(col);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON user_addresses(user_id);
