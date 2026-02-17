const jwt = require('jsonwebtoken');
const { db } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'frc-attendance-tracker-secret-key-change-in-production';
const SESSION_TIMEOUT = 30 * 60; // 30 minutes in seconds

function generateToken(adminId) {
  return jwt.sign({ adminId, type: 'admin' }, JWT_SECRET, { expiresIn: SESSION_TIMEOUT });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = verifyToken(token);
  if (!decoded || decoded.type !== 'admin') {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.adminId = decoded.adminId;
  next();
}

function isSetupComplete() {
  const admin = db.prepare('SELECT COUNT(*) as count FROM admin').get();
  return admin.count > 0;
}

module.exports = { generateToken, verifyToken, requireAdmin, isSetupComplete, JWT_SECRET };
