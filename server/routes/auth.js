const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../database');
const { generateToken, requireAdmin, isSetupComplete } = require('../auth');

const router = express.Router();

// Check if initial setup is needed
router.get('/setup-status', (req, res) => {
  res.json({ setupComplete: isSetupComplete() });
});

// Initial setup - create admin account
router.post('/setup', (req, res) => {
  if (isSetupComplete()) {
    return res.status(400).json({ error: 'Setup already complete' });
  }
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username and password (min 6 chars) required' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run(username, hash);
  const token = generateToken(result.lastInsertRowid);
  res.cookie('adminToken', token, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 60 * 1000 });
  res.json({ success: true, token });
});

// Admin login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken(admin.id);
  res.cookie('adminToken', token, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 60 * 1000 });
  res.json({ success: true, token });
});

// Admin logout
router.post('/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ success: true });
});

// Check admin session
router.get('/session', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT id, username FROM admin WHERE id = ?').get(req.adminId);
  res.json({ admin });
});

module.exports = router;
