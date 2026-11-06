const jwt = require('jsonwebtoken');
const env = require('../config/env');

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

function authenticateCustomerToken(req, res, next) {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Customer authentication required. Please sign in to your patron account.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired. Please sign in to your patron account again.' });
    }
    if (decoded.role === 'admin') {
      return res.status(403).json({
        error: 'Administrator credentials detected. Customer portal operations are reserved exclusively for patron accounts.'
      });
    }
    req.user = decoded;
    next();
  });
}

function authenticateAdminToken(req, res, next) {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Atelier Administrator authentication required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired admin session. Please sign in to the Atelier Portal again.' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied. Account does not possess Atelier Administrator credentials.'
      });
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
