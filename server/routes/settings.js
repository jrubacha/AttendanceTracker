const express = require('express');
const { db } = require('../database');
const { requireAdmin } = require('../auth');
const { syncGoogleCalendar, getSetting, setSetting } = require('../googleCalendar');

const router = express.Router();

// Settings that are safe to expose/edit via this endpoint.
const ALLOWED_KEYS = ['google_calendar_url'];
const READONLY_KEYS = ['google_last_sync'];

// Get settings
router.get('/', requireAdmin, (req, res) => {
  const settings = {};
  for (const key of [...ALLOWED_KEYS, ...READONLY_KEYS]) {
    settings[key] = getSetting(key) || '';
  }
  res.json({ settings });
});

// Update settings
router.put('/', requireAdmin, (req, res) => {
  for (const key of ALLOWED_KEYS) {
    if (req.body[key] !== undefined) {
      setSetting(key, String(req.body[key]).trim());
    }
  }
  res.json({ success: true });
});

// Trigger a Google Calendar sync now
router.post('/google-sync', requireAdmin, async (req, res) => {
  try {
    const result = await syncGoogleCalendar();
    if (!result.configured) {
      return res.status(400).json({ error: 'No Google Calendar URL configured' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

module.exports = router;
