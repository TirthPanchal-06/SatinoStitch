const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const { logSecurityEvent } = require('../services/securityAuditService');
const { getClientIp } = require('./rateLimiter');

const JWT_SECRET = env.JWT_SECRET;

function generateToken(user, tokenType) {
  const role = user.role || 'customer';
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: role,
      tokenType: tokenType || (role === 'admin' ? 'admin' : 'customer')
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function parseToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function authenticateToken(req, res, next) {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session. Please sign in again.' });
    }
    req.user = decoded;
    next();
  });
}

async function authenticateCustomerToken(req, res, next) {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Customer authentication required. Please sign in to your patron account.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired. Please sign in to your patron account again.' });
    }
    if (decoded.role === 'admin') {
      return res.status(403).json({
        error: 'Administrator credentials detected. Customer portal operations are reserved exclusively for patron accounts.'
      });
    }

    // Verify account active status
    try {
      const uRes = await query(`SELECT id, role, is_active, locked_until FROM users WHERE id = $1;`, [decoded.id]);
      if (uRes.rows.length === 0 || uRes.rows[0].is_active === false) {
        return res.status(403).json({ error: 'Account suspended or no longer active.' });
      }
      if (uRes.rows[0].locked_until && new Date(uRes.rows[0].locked_until) > new Date()) {
        return res.status(423).json({ error: 'Account temporarily locked. Please contact concierge.' });
      }
    } catch {}

    req.user = decoded;
    next();
  });
}

async function authenticateAdminToken(req, res, next) {
  const token = parseToken(req);
  const clientIp = getClientIp(req);

  if (!token) {
    logSecurityEvent({
      eventType: 'RBAC_VIOLATION',
      severity: 'WARNING',
      ipAddress: clientIp,
      path: req.originalUrl || req.path,
      method: req.method,
      details: { reason: 'No admin token supplied' }
    }).catch(() => {});

    return res.status(401).json({ error: 'Atelier Administrator authentication required.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired admin session. Please sign in to the Atelier Portal again.' });
    }
    if (decoded.role !== 'admin') {
      logSecurityEvent({
        eventType: 'RBAC_VIOLATION',
        severity: 'CRITICAL',
        userId: decoded.id,
        userEmail: decoded.email,
        ipAddress: clientIp,
        path: req.originalUrl || req.path,
        method: req.method,
        details: { attemptedRole: decoded.role, reason: 'Non-admin token tried to access admin route' }
      }).catch(() => {});

      return res.status(403).json({
        error: 'Access denied. Account does not possess Atelier Administrator credentials.'
      });
    }

    // Live Database Revocation & Role Status Check
    try {
      const dbCheck = await query(`SELECT id, role, is_active FROM users WHERE id = $1;`, [decoded.id]);
      if (dbCheck.rows.length === 0 || dbCheck.rows[0].role !== 'admin' || dbCheck.rows[0].is_active === false) {
        logSecurityEvent({
          eventType: 'REVOKED_ADMIN_TOKEN_USED',
          severity: 'CRITICAL',
          userId: decoded.id,
          userEmail: decoded.email,
          ipAddress: clientIp,
          path: req.originalUrl || req.path,
          method: req.method
        }).catch(() => {});

        return res.status(403).json({ error: 'Administrator credentials have been modified or revoked.' });
      }
    } catch (dbErr) {
      console.warn('[Admin DB Check Warning]:', dbErr.message);
    }

    req.user = decoded;
    next();
  });
}

function optionalAuth(req, res, next) {
  const token = parseToken(req);
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (!err) {
        req.user = decoded;
      }
      next();
    });
  } else {
    next();
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Atelier administrator privileges required.' });
  }
  next();
}

function requireCustomer(req, res, next) {
  if (!req.user || req.user.role !== 'customer') {
    return res.status(403).json({ error: 'Customer patron privileges required.' });
  }
  next();
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticateToken,
  authenticateCustomerToken,
  authenticateCustomer: authenticateCustomerToken,
  authenticateAdminToken,
  authenticateAdmin: authenticateAdminToken,
  optionalAuth,
  requireAdmin,
  requireCustomer
};
