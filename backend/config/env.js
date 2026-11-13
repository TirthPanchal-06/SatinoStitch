require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'satinostitch',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
  JWT_SECRET: process.env.JWT_SECRET || 'satinostitch_luxury_atelier_secret_2026',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_51ABCD1234EFGH',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'satinostitch_rzp_secret_atelier_2026',
  ADMIN_SECURITY_KEY: process.env.ADMIN_SECURITY_KEY || 'SATINO-SEC-2026-KEY',
  UPI_VPA: process.env.UPI_VPA || 'satinostitch@upi',
  MERCHANT_NAME: 'SATINOSTITCH'
};

