const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const activityModel = require('../models/activityModel');
const adminUpgradeModel = require('../models/adminUpgradeModel');
const { generateToken } = require('../middleware/auth');
const { logSecurityEvent } = require('../services/securityAuditService');
const { getClientIp } = require('../middleware/rateLimiter');
const env = require('../config/env');

/**
 * Validates password complexity:
 * Minimum 8 characters, containing both letters and numbers/special characters.
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long for security compliance.';
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigitOrSpecial = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  if (!hasLetter || !hasDigitOrSpecial) {
    return 'Password must contain a combination of letters and numbers or special symbols.';
  }
  return null;
}

/**
 * Customer Registration
 * Strictly restricted to role 'customer'. Public admin registration is blocked.
 */
async function customerRegister(req, res) {
  const { name, email, password, phone, role } = req.body || {};
  const clientIp = getClientIp(req);

  if (role && role !== 'customer') {
    logSecurityEvent({
      eventType: 'RBAC_VIOLATION',
      severity: 'WARNING',
      ipAddress: clientIp,
      path: '/api/auth/register',
      method: 'POST',
      details: { attemptedRole: role, email }
    }).catch(() => {});

    return res.status(403).json({
      error: 'Public administrator registration is prohibited. Admin credentials must be assigned through authorized atelier provisioning.'
    });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    const existing = await userModel.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address is already registered.' });
    }

    const user = await userModel.createUser({
      name,
      email,
      password,
      phone,
      role: 'customer'
    });

    logSecurityEvent({
      eventType: 'AUTH_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientIp,
      path: '/api/auth/register',
      method: 'POST',
      details: { action: 'registration' }
    }).catch(() => {});

    activityModel.logCustomerActivity({
      userId: user.id,
      userName: user.name,
      activityType: 'customer_registered',
      description: `New customer account registered: ${user.name} (${user.email})`,
      metadata: { userId: user.id, email: user.email }
    }).catch(() => {});

    // Notify admin
    adminUpgradeModel.createAdminNotification({
      type: 'user',
      title: 'New Patron Registration',
      message: `${user.name} (${user.email}) created a new patron account.`,
      link: 'admin.html?tab=users'
    }).catch(() => { });

    const token = generateToken(user, 'customer');

    res.status(201).json({
      message: 'Welcome to SATINOSTITCH VIP Patronage.',
      token,
      tokenType: 'customer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: 'customer'
      }
    });
  } catch (err) {
    console.error('[Auth Register Error]:', err);
    res.status(500).json({ error: 'Could not create patron account.' });
  }
}

/**
 * Customer Login
 * Reserved exclusively for patron accounts. Enforces brute force lockout and security audit.
 */
async function customerLogin(req, res) {
  const { email, password } = req.body || {};
  const clientIp = getClientIp(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await userModel.getUserByEmail(email);
    if (!user) {
      logSecurityEvent({
        eventType: 'AUTH_FAILED',
        severity: 'WARNING',
        userEmail: email,
        ipAddress: clientIp,
        path: '/api/auth/login',
        method: 'POST',
        details: { reason: 'User not found' }
      }).catch(() => {});
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 1. Account Lockout Check
    if (userModel.isAccountLocked(user)) {
      const remainingMs = new Date(user.locked_until).getTime() - Date.now();
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));

      logSecurityEvent({
        eventType: 'AUTH_LOCKED_ACCESS_ATTEMPT',
        severity: 'CRITICAL',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/login',
        method: 'POST',
        details: { lockedUntil: user.locked_until, remainingMin }
      }).catch(() => {});

      return res.status(423).json({
        error: `Account temporarily locked due to consecutive failed attempts. To protect your trousseau security, please try again in ${remainingMin} minute(s).`,
        code: 'ACCOUNT_LOCKED',
        locked: true,
        remainingMinutes: remainingMin
      });
    }

    // 2. Active Account Check
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your patron account is inactive. Please contact atelier concierge support.' });
    }

    // 3. Password Verification
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const lockStatus = await userModel.recordFailedLogin(email, clientIp);

      if (lockStatus.isLocked) {
        logSecurityEvent({
          eventType: 'ACCOUNT_LOCKED',
          severity: 'CRITICAL',
          userId: user.id,
          userEmail: user.email,
          ipAddress: clientIp,
          path: '/api/auth/login',
          method: 'POST',
          details: { consecutiveAttempts: lockStatus.attempts, lockedUntil: lockStatus.lockedUntil }
        }).catch(() => {});

        return res.status(423).json({
          error: 'Maximum failed login threshold reached (5 attempts). Account is now locked for 15 minutes for your security.',
          code: 'ACCOUNT_LOCKED',
          locked: true,
          remainingMinutes: 15
        });
      }

      logSecurityEvent({
        eventType: 'AUTH_FAILED',
        severity: 'WARNING',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/login',
        method: 'POST',
        details: { failedAttempts: lockStatus.attempts, remainingAttempts: lockStatus.remainingAttempts }
      }).catch(() => {});

      return res.status(401).json({
        error: `Invalid email or password. ${lockStatus.remainingAttempts || 0} attempt(s) remaining before security lockout.`
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        error: 'This account possesses Atelier Administrator credentials. Please sign in via the Admin Portal at admin.html.'
      });
    }

    // Successful login reset
    await userModel.recordSuccessfulLogin(user.id, clientIp);

    logSecurityEvent({
      eventType: 'AUTH_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientIp,
      path: '/api/auth/login',
      method: 'POST',
      details: { role: user.role }
    }).catch(() => {});

    const token = generateToken(user, 'customer');

    res.json({
      message: 'Sign in successful.',
      token,
      tokenType: 'customer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[Customer Login Error]:', err);
    res.status(500).json({ error: 'Authentication failed.' });
  }
}

/**
 * Admin Login
 * Strictly requires role === 'admin'. Enforces account lockout and security auditing.
 */
async function adminLogin(req, res) {
  const { email, password } = req.body || {};
  const clientIp = getClientIp(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Admin email and password are required.' });
  }

  try {
    const user = await userModel.getUserByEmail(email);
    if (!user) {
      logSecurityEvent({
        eventType: 'ADMIN_AUTH_FAILED',
        severity: 'WARNING',
        userEmail: email,
        ipAddress: clientIp,
        path: '/api/auth/admin/login',
        method: 'POST',
        details: { reason: 'Admin user not found' }
      }).catch(() => {});
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    // Lockout check
    if (userModel.isAccountLocked(user)) {
      const remainingMs = new Date(user.locked_until).getTime() - Date.now();
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));

      logSecurityEvent({
        eventType: 'ADMIN_LOCKED_ACCESS_ATTEMPT',
        severity: 'CRITICAL',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/admin/login',
        method: 'POST',
        details: { lockedUntil: user.locked_until, remainingMin }
      }).catch(() => {});

      return res.status(423).json({
        error: `Atelier Administrator account temporarily locked due to failed attempts. Please retry in ${remainingMin} minute(s).`,
        locked: true,
        remainingMinutes: remainingMin
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const lockStatus = await userModel.recordFailedLogin(email, clientIp);

      logSecurityEvent({
        eventType: 'ADMIN_AUTH_FAILED',
        severity: lockStatus.isLocked ? 'CRITICAL' : 'WARNING',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/admin/login',
        method: 'POST',
        details: { attempts: lockStatus.attempts, remaining: lockStatus.remainingAttempts }
      }).catch(() => {});

      if (lockStatus.isLocked) {
        return res.status(423).json({
          error: 'Maximum administrator login attempts exceeded. Account locked for 15 minutes.',
          locked: true
        });
      }

      return res.status(401).json({
        error: `Invalid admin credentials. ${lockStatus.remainingAttempts || 0} attempt(s) remaining.`
      });
    }

    if (user.role !== 'admin') {
      logSecurityEvent({
        eventType: 'RBAC_VIOLATION',
        severity: 'CRITICAL',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/admin/login',
        method: 'POST',
        details: { reason: 'Customer account attempted admin login' }
      }).catch(() => {});

      return res.status(403).json({
        error: 'Access denied. Account does not possess Atelier Administrator credentials.'
      });
    }

    // 4. Atelier Master Security Key Verification (Second Factor)
    const securityKey = (req.body && (req.body.securityKey || req.body.security_key || req.body.passcode || req.body.masterKey)) || '';
    const expectedKey = env.ADMIN_SECURITY_KEY || 'SATINO-SEC-2026-KEY';

    if (!securityKey || securityKey.trim() !== expectedKey.trim()) {
      const lockStatus = await userModel.recordFailedLogin(email, clientIp);

      logSecurityEvent({
        eventType: 'ADMIN_SECURITY_KEY_FAILURE',
        severity: 'CRITICAL',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/admin/login',
        method: 'POST',
        details: { reason: 'Invalid or missing Atelier Master Security Key', attempts: lockStatus.attempts }
      }).catch(() => {});

      if (lockStatus.isLocked) {
        return res.status(423).json({
          error: 'Maximum administrator authentication attempts exceeded. Account is locked for 15 minutes.',
          locked: true,
          code: 'ACCOUNT_LOCKED'
        });
      }

      return res.status(403).json({
        error: 'Security Verification Failed: Valid Atelier Master Security Key is required for administrative clearance.',
        code: 'INVALID_SECURITY_KEY'
      });
    }

    // Reset failed attempts on success
    await userModel.recordSuccessfulLogin(user.id, clientIp);

    logSecurityEvent({
      eventType: 'ADMIN_AUTH_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientIp,
      path: '/api/auth/admin/login',
      method: 'POST',
      details: { role: 'admin' }
    }).catch(() => {});

    const token = generateToken(user, 'admin');

    res.json({
      message: 'Welcome to the SATINOSTITCH Atelier Portal.',
      token,
      tokenType: 'admin',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: 'admin'
      }
    });
  } catch (err) {
    console.error('[Admin Login Error]:', err);
    res.status(500).json({ error: 'Admin authentication failed.' });
  }
}

/**
 * Universal Login for backwards compatibility
 */
async function universalLogin(req, res) {
  const { email, password } = req.body || {};
  const clientIp = getClientIp(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await userModel.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    // 1. Lockout Check
    if (userModel.isAccountLocked(user)) {
      const remainingMs = new Date(user.locked_until).getTime() - Date.now();
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));

      logSecurityEvent({
        eventType: 'AUTH_LOCKED_ACCESS_ATTEMPT',
        severity: 'CRITICAL',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/login',
        method: 'POST',
        details: { lockedUntil: user.locked_until, remainingMin }
      }).catch(() => {});

      return res.status(423).json({
        error: `Account temporarily locked due to consecutive failed attempts. Please retry in ${remainingMin} minute(s).`,
        code: 'ACCOUNT_LOCKED',
        locked: true,
        remainingMinutes: remainingMin
      });
    }

    // 2. Active Account Check
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Account is inactive. Please contact administrator.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const lockStatus = await userModel.recordFailedLogin(email, clientIp);

      if (lockStatus.isLocked) {
        logSecurityEvent({
          eventType: 'ACCOUNT_LOCKED',
          severity: 'CRITICAL',
          userId: user.id,
          userEmail: user.email,
          ipAddress: clientIp,
          path: '/api/auth/login',
          method: 'POST',
          details: { consecutiveAttempts: lockStatus.attempts, lockedUntil: lockStatus.lockedUntil }
        }).catch(() => {});

        return res.status(423).json({
          error: 'Maximum failed login threshold reached (5 attempts). Account is now locked for 15 minutes for your security.',
          code: 'ACCOUNT_LOCKED',
          locked: true,
          remainingMinutes: 15
        });
      }

      logSecurityEvent({
        eventType: 'AUTH_FAILED',
        severity: 'WARNING',
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientIp,
        path: '/api/auth/login',
        method: 'POST',
        details: { attempts: lockStatus.attempts, remaining: lockStatus.remainingAttempts }
      }).catch(() => {});

      return res.status(401).json({
        error: `Invalid email or password. ${lockStatus.remainingAttempts || 0} attempt(s) remaining.`
      });
    }

    await userModel.recordSuccessfulLogin(user.id, clientIp);

    const tokenType = user.role === 'admin' ? 'admin' : 'customer';
    const token = generateToken(user, tokenType);

    logSecurityEvent({
      eventType: 'AUTH_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientIp,
      path: '/api/auth/login',
      method: 'POST',
      details: { role: user.role }
    }).catch(() => {});

    res.json({
      message: 'Sign in successful.',
      token,
      tokenType,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed.' });
  }
}

async function getMe(req, res) {
  try {
    const user = await userModel.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User profile not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateProfile(req, res) {
  const { name, phone } = req.body || {};
  try {
    const updated = await userModel.updateUserProfile(req.user.id, { name, phone });
    res.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  const clientIp = getClientIp(req);

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    const fullUser = await userModel.getUserByEmail(req.user.email);
    const match = await bcrypt.compare(currentPassword, fullUser.password_hash);
    if (!match) {
      logSecurityEvent({
        eventType: 'PASSWORD_CHANGE_FAILED',
        severity: 'WARNING',
        userId: req.user.id,
        userEmail: req.user.email,
        ipAddress: clientIp,
        path: '/api/auth/password',
        method: 'PUT',
        details: { reason: 'Incorrect current password' }
      }).catch(() => {});
      return res.status(401).json({ error: 'Current password does not match records.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    await userModel.updateUserPassword(req.user.id, newHash);

    logSecurityEvent({
      eventType: 'PASSWORD_CHANGED',
      severity: 'INFO',
      userId: req.user.id,
      userEmail: req.user.email,
      ipAddress: clientIp,
      path: '/api/auth/password',
      method: 'PUT'
    }).catch(() => {});

    res.json({ message: 'Password updated successfully and verified against security standards.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  customerRegister,
  customerLogin,
  adminLogin,
  universalLogin,
  getMe,
  updateProfile,
  updatePassword,
  validatePasswordStrength
};

