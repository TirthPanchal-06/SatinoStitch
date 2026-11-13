/**
 * SATINOSTITCH — Enterprise Security Audit Logger
 * Records security-sensitive operations, unauthorized attempts, and fraud alerts.
 */
const { query } = require('../config/db');

async function logSecurityEvent({
  eventType, // 'AUTH_SUCCESS' | 'AUTH_FAILED' | 'ACCOUNT_LOCKED' | 'RATE_LIMITED' | 'XSS_ATTEMPT' | 'SQLI_ATTEMPT' | 'PAYMENT_FRAUD_FLAG' | 'PAYMENT_VERIFIED' | 'RBAC_VIOLATION' | 'ADMIN_ACTION'
  severity = 'INFO', // 'INFO' | 'WARNING' | 'CRITICAL'
  userId = null,
  userEmail = null,
  ipAddress = null,
  userAgent = null,
  path = null,
  method = null,
  details = {}
}) {
  try {
    const sql = `
      INSERT INTO security_audit_logs (
        event_type, severity, user_id, user_email, ip_address, user_agent, path, method, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *;
    `;
    const res = await query(sql, [
      eventType,
      severity,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      path,
      method,
      JSON.stringify(details || {})
    ]);
    return res.rows[0];
  } catch (err) {
    console.error('[Security Audit Log Error]:', err.message);
    return null;
  }
}

async function getAuditLogs({ limit = 50, eventType = null, severity = null } = {}) {
  const conditions = [];
  const params = [];

  if (eventType) {
    params.push(eventType);
    conditions.push(`event_type = $${params.length}`);
  }

  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }

  params.push(Math.min(200, Math.max(1, parseInt(limit, 10))));

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT id, event_type, severity, user_id, user_email, ip_address, user_agent, path, method, details, created_at
    FROM security_audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length};
  `;

  const res = await query(sql, params);
  return res.rows;
}

async function getSecurityStats() {
  const [totals, attackCounts, fraudCounts, lockedUsers] = await Promise.all([
    query(`
      SELECT 
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL')::int AS critical_events,
        COUNT(*) FILTER (WHERE severity = 'WARNING')::int AS warning_events,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS events_24h
      FROM security_audit_logs;
    `),
    query(`
      SELECT 
        COUNT(*) FILTER (WHERE event_type IN ('XSS_ATTEMPT', 'SQLI_ATTEMPT', 'PATH_TRAVERSAL'))::int AS blocked_attacks,
        COUNT(*) FILTER (WHERE event_type = 'RATE_LIMITED')::int AS rate_limit_hits,
        COUNT(*) FILTER (WHERE event_type = 'AUTH_FAILED')::int AS failed_logins,
        COUNT(*) FILTER (WHERE event_type = 'ACCOUNT_LOCKED')::int AS account_lockouts
      FROM security_audit_logs
      WHERE created_at > NOW() - INTERVAL '7 days';
    `),
    query(`
      SELECT 
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE risk_level = 'high')::int AS high_risk_orders,
        COUNT(*) FILTER (WHERE risk_level = 'medium')::int AS medium_risk_orders,
        COUNT(*) FILTER (WHERE fraud_status = 'flagged')::int AS flagged_orders
      FROM orders;
    `),
    query(`
      SELECT COUNT(*)::int AS count 
      FROM users 
      WHERE locked_until > NOW();
    `)
  ]);

  return {
    overview: totals.rows[0],
    attacks7d: attackCounts.rows[0],
    fraud: fraudCounts.rows[0],
    currentlyLockedAccounts: lockedUsers.rows[0].count
  };
}

module.exports = {
  logSecurityEvent,
  getAuditLogs,
  getSecurityStats
};

