const express = require('express');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

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

module.exports = router;
