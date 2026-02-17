const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Find the meeting that covers a given timestamp
function findMeetingForTime(timestamp) {
  const date = dayjs(timestamp).format('YYYY-MM-DD');
  const time = dayjs(timestamp).format('HH:mm');
  const season = db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
  if (!season) return null;

  // Find meetings on this date that haven't been cancelled
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE season_id = ? AND date = ? AND is_cancelled = 0 ORDER BY start_time'
  ).all(season.id, date);

  // Find the meeting whose window covers this time (with some flexibility)
  for (const meeting of meetings) {
    // Allow clock-in up to 30 min before meeting start and any time during
    const meetingStart = dayjs(`${date} ${meeting.start_time}`).subtract(30, 'minute');
    const meetingEnd = dayjs(`${date} ${meeting.auto_clockout_time || meeting.end_time}`);
    const clockTime = dayjs(timestamp);
    if (clockTime.isAfter(meetingStart) && clockTime.isBefore(meetingEnd)) {
      return meeting;
    }
  }
  return null;
}

// Check if clock-in is late (after grace period)
function checkIfLate(clockInTime, meeting) {
  if (!meeting) return false;
  const meetingStart = dayjs(`${meeting.date} ${meeting.start_time}`);
  const graceEnd = meetingStart.add(5, 'minute');
  return dayjs(clockInTime).isAfter(graceEnd);
}

// Clock in (kiosk)
router.post('/clock-in', (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'Student ID required' });

  // Check not already clocked in
  const active = db.prepare(
    'SELECT * FROM time_entries WHERE student_id = ? AND clock_out IS NULL'
  ).get(student_id);
  if (active) {
    return res.status(400).json({ error: 'Already clocked in' });
  }

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const meeting = findMeetingForTime(now);
  const isLate = checkIfLate(now, meeting);

  const result = db.prepare(
    'INSERT INTO time_entries (student_id, meeting_id, clock_in, is_late) VALUES (?, ?, ?, ?)'
  ).run(student_id, meeting ? meeting.id : null, now, isLate ? 1 : 0);

  res.json({
    entry: { id: result.lastInsertRowid, clock_in: now, meeting_id: meeting?.id || null, is_late: isLate },
    message: `Clocked in at ${dayjs(now).format('h:mm A')}`
  });
});

// Clock out (kiosk)
router.post('/clock-out', (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'Student ID required' });

  const active = db.prepare(
    'SELECT * FROM time_entries WHERE student_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1'
  ).get(student_id);
  if (!active) {
    return res.status(400).json({ error: 'Not clocked in' });
  }

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare('UPDATE time_entries SET clock_out = ? WHERE id = ?').run(now, active.id);

  const duration = dayjs(now).diff(dayjs(active.clock_in), 'minute');
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  res.json({
    entry: { ...active, clock_out: now },
    duration: { hours, minutes },
    message: `Clocked out at ${dayjs(now).format('h:mm A')}`
  });
});

// Get time entries for a student (admin)
router.get('/student/:studentId', requireAdmin, (req, res) => {
  const { seasonId, start, end } = req.query;
  let entries;
  if (seasonId) {
    const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    entries = db.prepare(`
      SELECT te.*, m.date as meeting_date, m.start_time as meeting_start, m.end_time as meeting_end, m.is_mandatory, m.name as meeting_name
      FROM time_entries te
      LEFT JOIN meetings m ON te.meeting_id = m.id
      WHERE te.student_id = ? AND te.clock_in >= ? AND te.clock_in <= ?
      ORDER BY te.clock_in DESC
    `).all(req.params.studentId, season.start_date, season.end_date + ' 23:59:59');
  } else if (start && end) {
    entries = db.prepare(`
      SELECT te.*, m.date as meeting_date, m.start_time as meeting_start, m.end_time as meeting_end, m.is_mandatory, m.name as meeting_name
      FROM time_entries te
      LEFT JOIN meetings m ON te.meeting_id = m.id
      WHERE te.student_id = ? AND te.clock_in >= ? AND te.clock_in <= ?
      ORDER BY te.clock_in DESC
    `).all(req.params.studentId, start, end + ' 23:59:59');
  } else {
    entries = db.prepare(`
      SELECT te.*, m.date as meeting_date, m.start_time as meeting_start, m.end_time as meeting_end, m.is_mandatory, m.name as meeting_name
      FROM time_entries te
      LEFT JOIN meetings m ON te.meeting_id = m.id
      WHERE te.student_id = ?
      ORDER BY te.clock_in DESC
    `).all(req.params.studentId);
  }
  res.json({ entries });
});

// Create manual time entry (admin)
router.post('/manual', requireAdmin, (req, res) => {
  const { student_id, meeting_id, clock_in, clock_out, notes } = req.body;
  if (!student_id || !clock_in) {
    return res.status(400).json({ error: 'Student ID and clock-in time required' });
  }

  const meeting = meeting_id ? db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting_id) : null;
  const isLate = meeting ? checkIfLate(clock_in, meeting) : false;

  const result = db.prepare(
    'INSERT INTO time_entries (student_id, meeting_id, clock_in, clock_out, is_late, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(student_id, meeting_id || null, clock_in, clock_out || null, isLate ? 1 : 0, notes || '');

  res.json({ entry: { id: result.lastInsertRowid } });
});

// Update time entry (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  const { clock_in, clock_out, meeting_id, notes } = req.body;
  db.prepare(
    'UPDATE time_entries SET clock_in = ?, clock_out = ?, meeting_id = ?, notes = ? WHERE id = ?'
  ).run(
    clock_in || entry.clock_in,
    clock_out !== undefined ? clock_out : entry.clock_out,
    meeting_id !== undefined ? meeting_id : entry.meeting_id,
    notes !== undefined ? notes : entry.notes,
    req.params.id
  );

  res.json({ success: true });
});

// Delete time entry (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
