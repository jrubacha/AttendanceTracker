const express = require('express');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// List all seasons
router.get('/', requireAdmin, (req, res) => {
  const seasons = db.prepare('SELECT * FROM seasons ORDER BY start_date DESC').all();
  res.json({ seasons });
});

// Get active season (public - needed for kiosk)
router.get('/active', (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
  res.json({ season: season || null });
});

// Get single season
router.get('/:id', requireAdmin, (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  res.json({ season });
});

// Create season
router.post('/', requireAdmin, (req, res) => {
  const { name, type, start_date, end_date, is_active } = req.body;
  if (!name || !type || !start_date || !end_date) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (!['off_season', 'build_season', 'custom_range'].includes(type)) {
    return res.status(400).json({ error: 'Invalid season type' });
  }

  // If setting as active, deactivate others
  if (is_active) {
    db.prepare('UPDATE seasons SET is_active = 0').run();
  }

  const result = db.prepare(
    'INSERT INTO seasons (name, type, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?)'
  ).run(name, type, start_date, end_date, is_active ? 1 : 0);

  // Create default thresholds for build seasons
  if (type === 'build_season') {
    const existingThresholds = db.prepare('SELECT COUNT(*) as count FROM thresholds WHERE season_id = ?').get(result.lastInsertRowid);
    if (existingThresholds.count === 0) {
      db.prepare('INSERT INTO thresholds (season_id, name, percentage, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(result.lastInsertRowid, 'Travel Minimum', 60, '#eab308', 1);
      db.prepare('INSERT INTO thresholds (season_id, name, percentage, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(result.lastInsertRowid, 'Drive Team Minimum', 80, '#22c55e', 2);
    }
  }

  res.json({ season: { id: result.lastInsertRowid, name, type, start_date, end_date, is_active: is_active ? 1 : 0 } });
});

// Update season
router.put('/:id', requireAdmin, (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  if (!season) return res.status(404).json({ error: 'Season not found' });

  const { name, type, start_date, end_date, is_active } = req.body;

  if (is_active) {
    db.prepare('UPDATE seasons SET is_active = 0').run();
  }

  db.prepare(
    'UPDATE seasons SET name = ?, type = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(
    name || season.name,
    type || season.type,
    start_date || season.start_date,
    end_date || season.end_date,
    is_active !== undefined ? (is_active ? 1 : 0) : season.is_active,
    req.params.id
  );

  res.json({ success: true });
});

// Delete season
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM seasons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
