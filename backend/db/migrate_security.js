/**
 * SATINOSTITCH — Database Migration: Security & Fraud Prevention
 * Adds columns to orders and users, and creates security_audit_logs table.
 */
const { query } = require('../config/db');

async function migrateSecurity() {
  console.log('◇ Initializing Security & Fraud Prevention Database Migration...');

  // 1. Add security and account lockout columns to users table
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
  `);
  console.log('✓ Users table upgraded with lockout & audit tracking columns.');

  // 2. Add payment verification & fraud scoring columns to orders table
  await query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS razorpay_signature VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS fraud_score INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fraud_status VARCHAR(30) DEFAULT 'clean',
    ADD COLUMN IF NOT EXISTS fraud_flags JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS client_ip VARCHAR(45) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'low';
  `);
  console.log('✓ Orders table upgraded with cryptographic payment verification & fraud scoring columns.');

  // 3. Create security_audit_logs table
  await query(`
    CREATE TABLE IF NOT EXISTS security_audit_logs (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(60) NOT NULL,
      severity VARCHAR(20) DEFAULT 'INFO',
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      user_email VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent TEXT,
      path VARCHAR(255),
      method VARCHAR(10),
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sec_audit_event_type ON security_audit_logs(event_type);
    CREATE INDEX IF NOT EXISTS idx_sec_audit_severity ON security_audit_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_sec_audit_created ON security_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sec_audit_ip ON security_audit_logs(ip_address);
  `);
  console.log('✓ security_audit_logs table created with indexed query optimization.');

  // 4. Seed initial security baseline log
  await query(`
    INSERT INTO security_audit_logs (event_type, severity, user_email, ip_address, path, method, details)
    VALUES (
      'SECURITY_SUBSYSTEM_INIT',
      'INFO',
      'system@satinostitch.com',
      '127.0.0.1',
      '/system/security/init',
      'INIT',
      '{"status":"active","modules":["rbac","rate_limiting","web_attack_shield","fraud_scoring","crypto_payment_verification"]}'::jsonb
    );
  `);
  console.log('✓ Baseline security audit log seeded.');

  console.log('======================================================');
  console.log('✓ SATINOSTITCH Security & Fraud Prevention Migration Completed Successfully.');
  console.log('======================================================');
}

if (require.main === module) {
  migrateSecurity()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('✗ Security Migration Error:', err);
      process.exit(1);
    });
}

module.exports = { migrateSecurity };

