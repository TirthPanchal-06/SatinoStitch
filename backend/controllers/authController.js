const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const activityModel = require('../models/activityModel');
const adminUpgradeModel = require('../models/adminUpgradeModel');
const { generateToken } = require('../middleware/auth');

/**
 * Customer Registration
 * Strictly restricted to role 'customer'. Public admin registration is blocked.
 */
async function customerRegister(req, res) {
  const { name, email, password, phone, role } = req.body || {};

  if (role && role !== 'customer') {
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

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
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
 * Reserved exclusively for patron accounts. Blocks admin logins with clear portal guidance.
 */
async function customerLogin(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await userModel.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        error: 'This account possesses Atelier Administrator credentials. Please sign in via the Admin Portal at admin.html.'
      });
    }

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
 * Strictly requires role === 'admin'. Blocks normal customer accounts.
 */
async function adminLogin(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Admin email and password are required.' });
  }

  try {
    const user = await userModel.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied. Account does not possess Atelier Administrator credentials.'
      });
    }

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
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await userModel.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const tokenType = user.role === 'admin' ? 'admin' : 'customer';
    const token = generateToken(user, tokenType);

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
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  try {
    const fullUser = await userModel.getUserByEmail(req.user.email);
    const match = await bcrypt.compare(currentPassword, fullUser.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Current password does not match records.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    await userModel.updateUserPassword(req.user.id, newHash);
    res.json({ message: 'Password updated successfully.' });
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
  updatePassword
};

