/**
 * SATINOSTITCH — Enterprise Sliding Window Rate Limiting Engine
 * Defends against brute-force, scraping, card-testing botnets, and denial of service.
 */
const { logSecurityEvent } = require('../services/securityAuditService');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function createRateLimiter({
  windowMs = 15 * 60 * 1000, // 15 minutes
  max = 100,
  message = 'Too many requests. Please try again later.',
  keyGenerator = (req) => getClientIp(req),
  eventType = 'RATE_LIMITED'
}) {
  const hits = new Map();

  // Periodic garbage collection to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.max(30000, Math.floor(windowMs / 2))).unref();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    // Standard RFC RateLimit headers
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);

      // Log rate limit violation (throttled to avoid log flooding)
      if (record.count === max + 1) {
        logSecurityEvent({
          eventType,
          severity: 'WARNING',
          ipAddress: getClientIp(req),
          userEmail: req.body?.email || req.user?.email || null,
          path: req.originalUrl || req.path,
          method: req.method,
          details: {
            limit: max,
            windowMs,
            totalHits: record.count,
            clientKey: key
          }
        }).catch(() => {});
      }

      return res.status(429).json({
        error: message,
        retryAfterSeconds: resetSeconds
      });
    }

    next();
  };
}

// 1. Global API Rate Limiter (300 requests per 15 minutes per IP)
const globalApiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'API request limit exceeded for this client. Please slow down your requests.',
  eventType: 'GLOBAL_RATE_LIMIT'
});

// 2. Strict Authentication Rate Limiter (10 failed attempts per 15 minutes per IP or email)
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `${getClientIp(req)}_${(req.body?.email || '').toLowerCase().trim()}`,
  message: 'Multiple authentication attempts detected. To safeguard patron accounts, this portal is temporarily rate-limited. Please wait 15 minutes.',
  eventType: 'AUTH_RATE_LIMIT'
});

// 3. Checkout & Payment Verification Rate Limiter (12 checkout attempts per 15 minutes)
// Blocks card testing and payment gateway probing
const checkoutLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyGenerator: (req) => `${getClientIp(req)}_checkout`,
  message: 'Commission checkout rate limit reached. Please wait a few moments before submitting another bespoke order.',
  eventType: 'CHECKOUT_RATE_LIMIT'
});

// 4. Contact & Newsletter Form Limiter (6 submissions per 10 minutes)
const contactLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: 'Form submission limit reached. Please wait before submitting additional concierge inquiries.',
  eventType: 'CONTACT_RATE_LIMIT'
});

module.exports = {
  createRateLimiter,
  globalApiLimiter,
  authLimiter,
  checkoutLimiter,
  contactLimiter,
  getClientIp
};

