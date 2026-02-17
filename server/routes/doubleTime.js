const express = require('express');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Get double time rules for a season
router.get('/:seasonId', requireAdmin, (req, res) => {
  const rules = db.prepare(
    'SELECT * FROM double_time_rules WHERE season_id = ? ORDER BY day_of_week, start_time'
  ).all(req.params.seasonId);
  res.json({ rules });
});

// Create double time rule
router.post('/', requireAdmin, (req, res) => {
  const { season_id, day_of_week, meeting_id, start_time, end_time, multiplier, condition_type, condition_value } = req.body;
  if (!season_id || !start_time || !end_time) {
    return res.status(400).json({ error: 'Season, start_time, and end_time required' });
  }

  const result = db.prepare(
    'INSERT INTO double_time_rules (season_id, day_of_week, meeting_id, start_time, end_time, multiplier, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(season_id, day_of_week ?? null, meeting_id ?? null, start_time, end_time, multiplier || 2.0, condition_type || '', condition_value || '');

  res.json({ rule: { id: result.lastInsertRowid } });
});

// Update double time rule
router.put('/:id', requireAdmin, (req, res) => {
  const rule = db.prepare('SELECT * FROM double_time_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  const { day_of_week, meeting_id, start_time, end_time, multiplier, condition_type, condition_value } = req.body;
  db.prepare(
    'UPDATE double_time_rules SET day_of_week = ?, meeting_id = ?, start_time = ?, end_time = ?, multiplier = ?, condition_type = ?, condition_value = ? WHERE id = ?'
  ).run(
    day_of_week !== undefined ? day_of_week : rule.day_of_week,
    meeting_id !== undefined ? meeting_id : rule.meeting_id,
    start_time || rule.start_time,
    end_time || rule.end_time,
    multiplier || rule.multiplier,
    condition_type !== undefined ? condition_type : rule.condition_type,
    condition_value !== undefined ? condition_value : rule.condition_value,
    req.params.id
  );

  res.json({ success: true });
});

// Delete double time rule
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM double_time_rules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
