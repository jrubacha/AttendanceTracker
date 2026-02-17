const express = require('express');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Get thresholds for a season
router.get('/:seasonId', requireAdmin, (req, res) => {
  const thresholds = db.prepare(
    'SELECT * FROM thresholds WHERE season_id = ? ORDER BY sort_order, percentage'
  ).all(req.params.seasonId);
  res.json({ thresholds });
});

// Set thresholds for a season (replaces all)
router.post('/:seasonId', requireAdmin, (req, res) => {
  const { thresholds } = req.body;
  if (!Array.isArray(thresholds)) {
    return res.status(400).json({ error: 'thresholds must be an array' });
  }

  db.prepare('DELETE FROM thresholds WHERE season_id = ?').run(req.params.seasonId);

  const insert = db.prepare(
    'INSERT INTO thresholds (season_id, name, percentage, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  );

  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i];
    insert.run(req.params.seasonId, t.name, t.percentage, t.color, t.sort_order || i);
  }

  res.json({ success: true });
});

module.exports = router;
