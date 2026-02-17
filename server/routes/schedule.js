const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Get schedule defaults for a season
router.get('/defaults/:seasonId', requireAdmin, (req, res) => {
  const defaults = db.prepare(
    'SELECT * FROM schedule_defaults WHERE season_id = ? ORDER BY day_of_week'
  ).all(req.params.seasonId);
  res.json({ defaults });
});

// Set schedule defaults for a season
router.post('/defaults/:seasonId', requireAdmin, (req, res) => {
  const { defaults } = req.body; // Array of { day_of_week, start_time, end_time, is_mandatory }
  if (!Array.isArray(defaults)) {
    return res.status(400).json({ error: 'defaults must be an array' });
  }

  const seasonId = req.params.seasonId;

  // Delete existing defaults for this season
  db.prepare('DELETE FROM schedule_defaults WHERE season_id = ?').run(seasonId);

  const insert = db.prepare(
    'INSERT INTO schedule_defaults (season_id, day_of_week, start_time, end_time, is_mandatory) VALUES (?, ?, ?, ?, ?)'
  );

  for (const d of defaults) {
    insert.run(seasonId, d.day_of_week, d.start_time, d.end_time, d.is_mandatory ? 1 : 0);
  }

  res.json({ success: true });
});

// Generate meetings from schedule defaults for a date range
router.post('/generate/:seasonId', requireAdmin, (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.seasonId);
  if (!season) return res.status(404).json({ error: 'Season not found' });

  const defaults = db.prepare('SELECT * FROM schedule_defaults WHERE season_id = ?').all(req.params.seasonId);
  if (defaults.length === 0) {
    return res.status(400).json({ error: 'No schedule defaults configured' });
  }

  const startDate = dayjs(season.start_date);
  const endDate = dayjs(season.end_date);

  // Delete existing non-custom meetings that haven't been individually modified
  db.prepare('DELETE FROM meetings WHERE season_id = ? AND is_custom = 0').run(req.params.seasonId);

  const insert = db.prepare(
    'INSERT INTO meetings (season_id, date, start_time, end_time, is_mandatory, is_custom, auto_clockout_time) VALUES (?, ?, ?, ?, ?, 0, ?)'
  );

  let count = 0;
  let current = startDate;
  while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
    const dow = current.day();
    const matching = defaults.filter(d => d.day_of_week === dow);
    for (const d of matching) {
      // Calculate auto clockout time (end_time + 5 minutes)
      const endParts = d.end_time.split(':');
      const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]) + 5;
      const autoClockout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

      insert.run(req.params.seasonId, current.format('YYYY-MM-DD'), d.start_time, d.end_time, d.is_mandatory ? 1 : 0, autoClockout);
      count++;
    }
    current = current.add(1, 'day');
  }

  res.json({ success: true, meetingsGenerated: count });
});

// Get meetings for a season (optionally filter by date range)
router.get('/meetings/:seasonId', (req, res) => {
  const { start, end } = req.query;
  let meetings;
  if (start && end) {
    meetings = db.prepare(
      'SELECT * FROM meetings WHERE season_id = ? AND date >= ? AND date <= ? ORDER BY date, start_time'
    ).all(req.params.seasonId, start, end);
  } else {
    meetings = db.prepare(
      'SELECT * FROM meetings WHERE season_id = ? ORDER BY date, start_time'
    ).all(req.params.seasonId);
  }
  res.json({ meetings });
});

// Get today's meetings (public - for kiosk display)
router.get('/today', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
  if (!season) {
    return res.json({ meetings: [] });
  }
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE season_id = ? AND date = ? AND is_cancelled = 0 ORDER BY start_time'
  ).all(season.id, today);
  res.json({ meetings });
});

// Create custom meeting/event
router.post('/meetings', requireAdmin, (req, res) => {
  const { season_id, date, start_time, end_time, is_mandatory, name } = req.body;
  if (!season_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const endParts = end_time.split(':');
  const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]) + 5;
  const autoClockout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const result = db.prepare(
    'INSERT INTO meetings (season_id, date, start_time, end_time, is_mandatory, is_custom, name, auto_clockout_time) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(season_id, date, start_time, end_time, is_mandatory !== false ? 1 : 0, name || '', autoClockout);

  res.json({ meeting: { id: result.lastInsertRowid } });
});

// Update meeting
router.put('/meetings/:id', requireAdmin, (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { start_time, end_time, is_mandatory, is_cancelled, name } = req.body;

  const newEndTime = end_time || meeting.end_time;
  const endParts = newEndTime.split(':');
  const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]) + 5;
  const autoClockout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  db.prepare(
    'UPDATE meetings SET start_time = ?, end_time = ?, is_mandatory = ?, is_cancelled = ?, name = ?, auto_clockout_time = ? WHERE id = ?'
  ).run(
    start_time || meeting.start_time,
    newEndTime,
    is_mandatory !== undefined ? (is_mandatory ? 1 : 0) : meeting.is_mandatory,
    is_cancelled !== undefined ? (is_cancelled ? 1 : 0) : meeting.is_cancelled,
    name !== undefined ? name : meeting.name,
    autoClockout,
    req.params.id
  );

  res.json({ success: true });
});

// Delete meeting
router.delete('/meetings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM meetings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
