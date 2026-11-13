/**
 * SATINOSTITCH — Web Application Firewall & Security Middleware
 * Protects against XSS, SQL Injection patterns, Clickjacking, MIME-sniffing, and Prototype Pollution.
 */
const { logSecurityEvent } = require('../services/securityAuditService');
const { getClientIp } = require('./rateLimiter');

// Known malicious patterns
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /<script[\s\S]*?>/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /onload\s*=/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
  /<iframe[\s\S]*?>/i,
  /<svg[\s\S]*?onload/i,
  /document\s*\.\s*cookie/i
];

const SQLI_PATTERNS = [
  /(\b(UNION(\s+ALL)?)\b.*?\bSELECT\b)/i,
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b\s+.*?\bFROM\b)/i,
  /(\bor\b\s*['"]?[\w\d]+['"]?\s*=\s*['"]?[\w\d]+)/i,
  /(\band\b\s*['"]?[\w\d]+['"]?\s*=\s*['"]?[\w\d]+)/i,
  /(;\s*DROP\s+TABLE\b)/i,
  /(--|\/\*|\*\/)/
];

const PATH_TRAVERSAL_PATTERN = /(\.\.[\/\\])/;

/**
 * Recursively scans and sanitizes object properties against attacks
 */
function scanAndSanitize(obj, req, location = 'body') {
  if (!obj || typeof obj !== 'object') return obj;

  for (const key of Object.keys(obj)) {
    // 1. Prototype Pollution Defense
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
      logSecurityEvent({
        eventType: 'PROTOTYPE_POLLUTION_ATTEMPT',
        severity: 'CRITICAL',
        ipAddress: getClientIp(req),
        path: req.originalUrl || req.path,
        method: req.method,
        details: { blockedKey: key, location }
      }).catch(() => {});
      continue;
    }

    const val = obj[key];

    if (typeof val === 'string') {
      // 2. Path Traversal Check
      if (PATH_TRAVERSAL_PATTERN.test(val)) {
        throw new Error(`Path traversal sequence detected in parameter "${key}".`);
      }

      // 3. XSS Pattern Check
      for (const pattern of XSS_PATTERNS) {
        if (pattern.test(val)) {
          logSecurityEvent({
            eventType: 'XSS_ATTEMPT',
            severity: 'CRITICAL',
            ipAddress: getClientIp(req),
            path: req.originalUrl || req.path,
            method: req.method,
            details: { param: key, valueSample: val.slice(0, 100), location }
          }).catch(() => {});
          throw new Error(`Potential Cross-Site Scripting (XSS) payload detected in "${key}".`);
        }
      }

      // 4. SQL Injection Pattern Check (Only on query strings or non-freeform text)
      // Allow standard address commas/apostrophes, but check for UNION SELECT / DROP attacks
      for (const pattern of SQLI_PATTERNS) {
        if (pattern.test(val) && val.length < 500) {
          logSecurityEvent({
            eventType: 'SQLI_ATTEMPT',
            severity: 'CRITICAL',
            ipAddress: getClientIp(req),
            path: req.originalUrl || req.path,
            method: req.method,
            details: { param: key, valueSample: val.slice(0, 100), location }
          }).catch(() => {});
          throw new Error(`Potential SQL Injection pattern detected in "${key}".`);
        }
      }
    } else if (typeof val === 'object' && val !== null) {
      scanAndSanitize(val, req, `${location}.${key}`);
    }
  }

  return obj;
}

/**
 * Sets industry-standard HTTP security headers
 */
function securityHeaders(req, res, next) {
  // Hide Express server technology
  res.removeHeader('X-Powered-By');

  // Prevent Clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS protection legacy filter for older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")');

  // Content Security Policy (Allows legitimate resources while blocking external code injection)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: /uploads/",
    "connect-src 'self' https://api.razorpay.com https://lapi.razorpay.com",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);

  next();
}

/**
 * Web Application Firewall Request Inspector
 */
function webAttackShield(req, res, next) {
  try {
    if (req.query && Object.keys(req.query).length > 0) {
      scanAndSanitize(req.query, req, 'query');
    }
    if (req.params && Object.keys(req.params).length > 0) {
      scanAndSanitize(req.params, req, 'params');
    }
    if (req.body && typeof req.body === 'object' && !(req.body instanceof Buffer)) {
      scanAndSanitize(req.body, req, 'body');
    }
    next();
  } catch (err) {
    return res.status(400).json({
      error: `Security Alert: ${err.message}`,
      code: 'WAF_SECURITY_BLOCK',
      blocked: true
    });
  }
}

module.exports = {
  securityHeaders,
  webAttackShield
};
