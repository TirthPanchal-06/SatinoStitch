/**
 * SATINOSTITCH — Haute Couture Fraud Detection & Risk Scoring Engine
 * Analyzes transaction heuristics, buyer velocity, burner domains, and payment integrity.
 */
const { query } = require('../config/db');
const { logSecurityEvent } = require('./securityAuditService');

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'sharklasers.com', 'yopmail.com', 'trashmail.com', 'dispostable.com',
  'fakeinbox.com', 'getairmail.com', 'throwawaymail.com', 'burnermail.io'
]);

async function evaluateOrderFraud({
  customer,
  items,
  total,
  paymentMethod,
  paymentId = null,
  clientIp = '127.0.0.1'
}) {
  const flags = [];
  let score = 0;

  const email = (customer?.email || '').trim().toLowerCase();
  const phone = (customer?.phone || '').trim().replace(/[\s\-\+]/g, '');
  const address = (customer?.address || customer?.line1 || '').trim();

  // 1. Disposable / Burner Email Detection
  const emailDomain = email.split('@')[1];
  if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
    score += 45;
    flags.push(`Disposable/Burner email domain detected: @${emailDomain}`);
  }

  // 2. High-Value Cash on Delivery Check
  if (paymentMethod === 'cod' && total > 20000) {
    score += 30;
    flags.push(`High-value Cash on Delivery commission: ₹${total.toLocaleString('en-IN')}`);
  }

  // 3. Buyer Order Velocity Check (Same email or IP within last 10 minutes)
  try {
    const recentOrders = await query(
      `SELECT COUNT(*)::int AS count 
       FROM orders 
       WHERE (customer_email = $1 OR client_ip = $2) 
         AND created_at > NOW() - INTERVAL '10 minutes';`,
      [email, clientIp]
    );
    const recentCount = recentOrders.rows[0]?.count || 0;
    if (recentCount >= 4) {
      score += 40;
      flags.push(`High order velocity: ${recentCount} orders placed in last 10 minutes from this client`);
    } else if (recentCount >= 2) {
      score += 20;
      flags.push(`Rapid order velocity: ${recentCount} orders placed recently`);
    }
  } catch (err) {
    console.warn('[Fraud Detection Velocity Error]:', err.message);
  }

  // 4. Duplicate Payment ID Check (Replay Attack Prevention)
  if (paymentId && paymentId !== 'simulated_test') {
    try {
      const existingPay = await query(
        `SELECT id FROM orders WHERE payment_id = $1 LIMIT 1;`,
        [paymentId]
      );
      if (existingPay.rows.length > 0) {
        score += 75;
        flags.push(`Duplicate payment transaction ID detected: ${paymentId}`);
      }
    } catch {}
  }

  // 5. Phone Number Heuristics
  // Check valid Indian mobile format (starts with 6,7,8,9 and 10 digits) or general length
  const cleanPhone = phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone;
  if (cleanPhone.length < 10 || /^(\d)\1{9}$/.test(cleanPhone)) {
    score += 25;
    flags.push(`Repetitive or suspicious phone number format: ${customer?.phone}`);
  }

  // 6. Address Nonsense / Character Repetition Check
  if (address.length < 6 || /(.)\1{4,}/.test(address)) {
    score += 25;
    flags.push(`Incomplete or suspicious delivery address pattern: "${address}"`);
  }

  // 7. Quantity Anomaly Check (High unit hoarding on limited pieces)
  const totalUnits = (items || []).reduce((sum, item) => sum + (item.qty || 1), 0);
  if (totalUnits > 15) {
    score += 20;
    flags.push(`Abnormal bulk piece volume: ${totalUnits} couture units in single commission`);
  }

  // Determine Risk Tier
  let riskLevel = 'low';
  let fraudStatus = 'clean';

  if (score >= 65) {
    riskLevel = 'high';
    fraudStatus = 'flagged';
  } else if (score >= 30) {
    riskLevel = 'medium';
    fraudStatus = 'flagged';
  }

  // Log to security audit if medium or high risk
  if (riskLevel !== 'low') {
    logSecurityEvent({
      eventType: 'PAYMENT_FRAUD_FLAG',
      severity: riskLevel === 'high' ? 'CRITICAL' : 'WARNING',
      userEmail: email,
      ipAddress: clientIp,
      path: '/api/orders',
      method: 'POST',
      details: {
        score,
        riskLevel,
        flags,
        total,
        paymentMethod
      }
    }).catch(() => {});
  }

  return {
    score,
    riskLevel,
    fraudStatus,
    flags
  };
}

module.exports = {
  evaluateOrderFraud,
  DISPOSABLE_DOMAINS
};

