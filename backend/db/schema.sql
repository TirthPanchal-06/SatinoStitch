-- SATINOSTITCH PostgreSQL Schema
-- Module 2: Products & Categories

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
  fabric VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(cat);
CREATE INDEX IF NOT EXISTS idx_products_col ON products(col);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
