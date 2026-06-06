const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

const VALID_CATEGORIES = ['Meeting', 'Competition', 'Outreach'];
function normalizeCategory(value, fallback = 'Meeting') {
  return VALID_CATEGORIES.includes(value) ? value : fallback;
}

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

// Standalone meeting generator. Not tied to a season's date window: caller
// supplies an explicit date range and per-weekday time slots, and may
// optionally tag the generated meetings to a season.
// Body: { start_date, end_date, season_id (optional), days: [{ day_of_week, start_time, end_time, is_mandatory }] }
router.post('/generate-meetings', requireAdmin, (req, res) => {
  const { start_date, end_date, season_id, days, category } = req.body;
  const meetingCategory = normalizeCategory(category);
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date are required' });
  }
  if (!Array.isArray(days) || days.length === 0) {
    return res.status(400).json({ error: 'At least one day/time slot is required' });
  }

  let seasonId = null;
  if (season_id) {
    const season = db.prepare('SELECT id FROM seasons WHERE id = ?').get(season_id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    seasonId = season.id;
  }

  const startDate = dayjs(start_date);
  const endDate = dayjs(end_date);
  if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
    return res.status(400).json({ error: 'Invalid date range' });
  }

  const insert = db.prepare(
    'INSERT INTO meetings (season_id, date, start_time, end_time, is_mandatory, is_custom, category, auto_clockout_time) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  );
  const existsStmt = db.prepare('SELECT id FROM meetings WHERE date = ? AND start_time = ?');

  let count = 0;
  let skipped = 0;
  let current = startDate;
  while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
    const dow = current.day();
    const dateStr = current.format('YYYY-MM-DD');
    const matching = days.filter(d => Number(d.day_of_week) === dow);
    for (const d of matching) {
      // Skip if a meeting already exists at this date + start time (avoid dupes)
      if (existsStmt.get(dateStr, d.start_time)) {
        skipped++;
        continue;
      }
      const endParts = d.end_time.split(':');
      const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]) + 5;
      const autoClockout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
      insert.run(seasonId, dateStr, d.start_time, d.end_time, d.is_mandatory ? 1 : 0, meetingCategory, autoClockout);
      count++;
    }
    current = current.add(1, 'day');
  }

  res.json({ success: true, meetingsGenerated: count, skipped });
});

// Assign (or clear) the season for all meetings in a date range.
// Body: { start_date, end_date, season_id (null to clear) }
router.post('/assign-season', requireAdmin, (req, res) => {
  const { start_date, end_date, season_id } = req.body;
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date are required' });
  }
  let seasonId = null;
  if (season_id) {
    const season = db.prepare('SELECT id FROM seasons WHERE id = ?').get(season_id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    seasonId = season.id;
  }
  const result = db.prepare(
    'UPDATE meetings SET season_id = ? WHERE date >= ? AND date <= ?'
  ).run(seasonId, start_date, end_date);
  res.json({ success: true, updated: result.changes });
});

// Get meetings across all seasons within a date range (optionally filter by season).
// Query: ?start=YYYY-MM-DD&end=YYYY-MM-DD&season_id=ID
router.get('/meetings', (req, res) => {
  const { start, end, season_id } = req.query;
  const conditions = [];
  const params = [];
  if (start) { conditions.push('date >= ?'); params.push(start); }
  if (end) { conditions.push('date <= ?'); params.push(end); }
  if (season_id) { conditions.push('season_id = ?'); params.push(season_id); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const meetings = db.prepare(
    `SELECT * FROM meetings ${where} ORDER BY date, start_time`
  ).all(...params);
  res.json({ meetings });
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
  // Meetings aren't tied to a season — show everything scheduled for today.
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE date = ? AND is_cancelled = 0 ORDER BY start_time'
  ).all(today);
  res.json({ meetings });
});

// Create custom meeting/event
router.post('/meetings', requireAdmin, (req, res) => {
  const { season_id, date, start_time, end_time, is_mandatory, name, category } = req.body;
  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Date, start time, and end time are required' });
  }

  const endParts = end_time.split(':');
  const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]) + 5;
  const autoClockout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  const result = db.prepare(
    'INSERT INTO meetings (season_id, date, start_time, end_time, is_mandatory, is_custom, name, category, auto_clockout_time) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)'
  ).run(season_id || null, date, start_time, end_time, is_mandatory !== false ? 1 : 0, name || '', normalizeCategory(category), autoClockout);

  res.json({ meeting: { id: result.lastInsertRowid } });
});

// Update meeting
router.put('/meetings/:id', requireAdmin, (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { start_time, end_time, is_mandatory, is_cancelled, name, season_id, category } = req.body;

  const newEndTime = end_time || meeting.end_time;
  const endParts = newEndTime.split(':');
  const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]) + 5;
  const autoClockout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  db.prepare(
    'UPDATE meetings SET start_time = ?, end_time = ?, is_mandatory = ?, is_cancelled = ?, name = ?, season_id = ?, category = ?, auto_clockout_time = ? WHERE id = ?'
  ).run(
    start_time || meeting.start_time,
    newEndTime,
    is_mandatory !== undefined ? (is_mandatory ? 1 : 0) : meeting.is_mandatory,
    is_cancelled !== undefined ? (is_cancelled ? 1 : 0) : meeting.is_cancelled,
    name !== undefined ? name : meeting.name,
    season_id !== undefined ? (season_id || null) : meeting.season_id,
    category !== undefined ? normalizeCategory(category, meeting.category) : meeting.category,
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
