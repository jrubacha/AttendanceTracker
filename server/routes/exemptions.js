const express = require('express');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Minimum lead time (hours) required to submit an exemption request.
const MIN_LEAD_HOURS = 24;

// Get exemptions for a student
router.get('/student/:studentId', requireAdmin, (req, res) => {
  const { seasonId } = req.query;
  let exemptions;
  if (seasonId) {
    exemptions = db.prepare(`
      SELECT e.*, m.date, m.start_time, m.end_time, m.name as meeting_name
      FROM exemptions e
      JOIN meetings m ON e.meeting_id = m.id
      WHERE e.student_id = ? AND m.season_id = ?
      ORDER BY m.date
    `).all(req.params.studentId, seasonId);
  } else {
    exemptions = db.prepare(`
      SELECT e.*, m.date, m.start_time, m.end_time, m.name as meeting_name
      FROM exemptions e
      JOIN meetings m ON e.meeting_id = m.id
      WHERE e.student_id = ?
      ORDER BY m.date
    `).all(req.params.studentId);
  }
  res.json({ exemptions });
});

// Toggle exemption for a student/meeting
router.post('/toggle', requireAdmin, (req, res) => {
  const { student_id, meeting_id, reason } = req.body;
  if (!student_id || !meeting_id) {
    return res.status(400).json({ error: 'Student ID and meeting ID required' });
  }

  const existing = db.prepare(
    'SELECT * FROM exemptions WHERE student_id = ? AND meeting_id = ?'
  ).get(student_id, meeting_id);

  if (existing) {
    db.prepare('DELETE FROM exemptions WHERE id = ?').run(existing.id);
    res.json({ exempted: false });
  } else {
    db.prepare(
      'INSERT INTO exemptions (student_id, meeting_id, reason) VALUES (?, ?, ?)'
    ).run(student_id, meeting_id, reason || '');
    res.json({ exempted: true });
  }
});

// Delete exemption
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM exemptions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Exemption requests (student-initiated, admin-approved)
// ---------------------------------------------------------------------------

// Public: upcoming meetings a student may request an exemption for. Only
// meetings that start more than MIN_LEAD_HOURS in the future are eligible.
router.get('/requestable-meetings', (req, res) => {
  const cutoff = dayjs().add(MIN_LEAD_HOURS, 'hour');
  const today = dayjs().format('YYYY-MM-DD');
  // Pull a generous window of upcoming, non-cancelled meetings then filter by
  // the precise start-time cutoff in JS (start_time is stored separately).
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE date >= ? AND is_cancelled = 0 ORDER BY date, start_time'
  ).all(today);
  const eligible = meetings.filter(m =>
    dayjs(`${m.date} ${m.start_time}`).isAfter(cutoff)
  );
  res.json({ meetings: eligible });
});

// Public: submit an exemption request. Identifies the student by PIN.
router.post('/request', (req, res) => {
  const { pin, meeting_id, reason } = req.body;
  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Invalid PIN' });
  }
  if (!meeting_id) {
    return res.status(400).json({ error: 'Meeting is required' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A reason is required' });
  }

  const students = db.prepare('SELECT * FROM students WHERE is_archived = 0').all();
  const student = students.find(s => bcrypt.compareSync(pin, s.pin_hash));
  if (!student) {
    return res.status(404).json({ error: 'PIN not found' });
  }

  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting_id);
  if (!meeting || meeting.is_cancelled) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  // Enforce the lead-time rule server-side.
  const cutoff = dayjs().add(MIN_LEAD_HOURS, 'hour');
  if (!dayjs(`${meeting.date} ${meeting.start_time}`).isAfter(cutoff)) {
    return res.status(400).json({
      error: `Requests must be made more than ${MIN_LEAD_HOURS} hours before the meeting`
    });
  }

  // Already exempted for this meeting?
  const existingExemption = db.prepare(
    'SELECT 1 FROM exemptions WHERE student_id = ? AND meeting_id = ?'
  ).get(student.id, meeting_id);
  if (existingExemption) {
    return res.status(400).json({ error: 'You are already exempt from this meeting' });
  }

  // A pending request already exists?
  const existingPending = db.prepare(
    "SELECT 1 FROM exemption_requests WHERE student_id = ? AND meeting_id = ? AND status = 'pending'"
  ).get(student.id, meeting_id);
  if (existingPending) {
    return res.status(400).json({ error: 'You already have a pending request for this meeting' });
  }

  db.prepare(
    'INSERT INTO exemption_requests (student_id, meeting_id, reason) VALUES (?, ?, ?)'
  ).run(student.id, meeting_id, reason.trim());

  res.json({ success: true, message: 'Exemption request submitted' });
});

// Admin: list exemption requests (optionally filter by status).
router.get('/requests', requireAdmin, (req, res) => {
  const { status } = req.query;
  const conditions = [];
  const params = [];
  if (status) { conditions.push('er.status = ?'); params.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const requests = db.prepare(`
    SELECT er.*, s.name as student_name,
           m.date, m.start_time, m.end_time, m.name as meeting_name, m.category
    FROM exemption_requests er
    JOIN students s ON er.student_id = s.id
    JOIN meetings m ON er.meeting_id = m.id
    ${where}
    ORDER BY (er.status = 'pending') DESC, er.created_at DESC
  `).all(...params);
  res.json({ requests });
});

// Admin: count of pending requests (for nav badge).
router.get('/requests/pending-count', requireAdmin, (req, res) => {
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM exemption_requests WHERE status = 'pending'"
  ).get();
  res.json({ count: row.count });
});

// Admin: approve a request -> records status and creates a real exemption.
router.post('/requests/:id/approve', requireAdmin, (req, res) => {
  const request = db.prepare('SELECT * FROM exemption_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  db.prepare(
    "UPDATE exemption_requests SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);

  // Create the official exemption if one doesn't already exist.
  const existing = db.prepare(
    'SELECT 1 FROM exemptions WHERE student_id = ? AND meeting_id = ?'
  ).get(request.student_id, request.meeting_id);
  if (!existing) {
    db.prepare(
      'INSERT INTO exemptions (student_id, meeting_id, reason) VALUES (?, ?, ?)'
    ).run(request.student_id, request.meeting_id, request.reason || '');
  }

  res.json({ success: true });
});

// Admin: deny a request -> records status, no exemption created.
router.post('/requests/:id/deny', requireAdmin, (req, res) => {
  const request = db.prepare('SELECT * FROM exemption_requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  db.prepare(
    "UPDATE exemption_requests SET status = 'denied', reviewed_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);

  res.json({ success: true });
});

module.exports = router;
