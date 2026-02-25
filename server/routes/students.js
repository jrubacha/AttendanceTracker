const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Helper to hash a PIN
function hashPin(pin) {
  return bcrypt.hashSync(pin, 10);
}

// Generate a unique 4-digit PIN
function generateUniquePin() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    // Check all students by trying to verify against existing hashes
    const students = db.prepare('SELECT pin_hash FROM students WHERE is_archived = 0').all();
    const taken = students.some(s => bcrypt.compareSync(pin, s.pin_hash));
    if (!taken) return pin;
  }
  throw new Error('Could not generate unique PIN');
}

// Verify PIN and return student (for kiosk)
router.post('/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Invalid PIN' });
  }
  const students = db.prepare('SELECT * FROM students WHERE is_archived = 0').all();
  const student = students.find(s => bcrypt.compareSync(pin, s.pin_hash));
  if (!student) {
    return res.status(404).json({ error: 'PIN not found' });
  }
  // Get current clock-in status
  const activeEntry = db.prepare(
    'SELECT * FROM time_entries WHERE student_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1'
  ).get(student.id);

  res.json({
    student: { id: student.id, name: student.name },
    clockedIn: !!activeEntry,
    activeEntry: activeEntry || null
  });
});

// List all students (admin)
router.get('/', requireAdmin, (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  let students;
  if (includeArchived) {
    students = db.prepare('SELECT id, name, pin_last4, is_archived, notes, hours_adjustment, available_hours_adjustment, created_at FROM students ORDER BY name').all();
  } else {
    students = db.prepare('SELECT id, name, pin_last4, is_archived, notes, hours_adjustment, available_hours_adjustment, created_at FROM students WHERE is_archived = 0 ORDER BY name').all();
  }
  res.json({ students });
});

// Get single student (admin)
router.get('/:id', requireAdmin, (req, res) => {
  const student = db.prepare('SELECT id, name, pin_last4, is_archived, notes, hours_adjustment, available_hours_adjustment, created_at FROM students WHERE id = ?').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }
  res.json({ student });
});

// Create student (admin)
router.post('/', requireAdmin, (req, res) => {
  const { name, pin, notes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  let studentPin = pin;
  if (!studentPin) {
    studentPin = generateUniquePin();
  }
  if (!/^\d{4}$/.test(studentPin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  // Check uniqueness
  const students = db.prepare('SELECT pin_hash FROM students WHERE is_archived = 0').all();
  const taken = students.some(s => bcrypt.compareSync(studentPin, s.pin_hash));
  if (taken) {
    return res.status(400).json({ error: 'PIN already in use' });
  }

  const pinHash = hashPin(studentPin);
  const result = db.prepare(
    'INSERT INTO students (name, pin_hash, pin_last4, notes) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), pinHash, studentPin.slice(-4), notes || '');

  res.json({
    student: { id: result.lastInsertRowid, name: name.trim(), pin: studentPin },
    message: 'Student created'
  });
});

// Update student (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const { name, notes, is_archived, hours_adjustment, available_hours_adjustment } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  db.prepare(
    'UPDATE students SET name = ?, notes = ?, is_archived = ?, hours_adjustment = ?, available_hours_adjustment = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(
    name !== undefined ? name.trim() : student.name,
    notes !== undefined ? notes : student.notes,
    is_archived !== undefined ? (is_archived ? 1 : 0) : student.is_archived,
    hours_adjustment !== undefined ? parseFloat(hours_adjustment) || 0 : (student.hours_adjustment || 0),
    available_hours_adjustment !== undefined ? parseFloat(available_hours_adjustment) || 0 : (student.available_hours_adjustment || 0),
    req.params.id
  );

  res.json({ success: true });
});

// Regenerate PIN (admin)
router.post('/:id/regenerate-pin', requireAdmin, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  let newPin = req.body.pin;
  if (!newPin) {
    newPin = generateUniquePin();
  }
  if (!/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  // Check uniqueness (exclude current student)
  const others = db.prepare('SELECT pin_hash FROM students WHERE id != ? AND is_archived = 0').all(req.params.id);
  const taken = others.some(s => bcrypt.compareSync(newPin, s.pin_hash));
  if (taken) {
    return res.status(400).json({ error: 'PIN already in use' });
  }

  const pinHash = hashPin(newPin);
  db.prepare('UPDATE students SET pin_hash = ?, pin_last4 = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(pinHash, newPin.slice(-4), req.params.id);

  res.json({ pin: newPin });
});

// Delete student (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const entryCount = db.prepare('SELECT COUNT(*) as count FROM time_entries WHERE student_id = ?').get(req.params.id);
  if (entryCount.count > 0 && req.query.confirm !== 'true') {
    return res.status(400).json({
      error: 'Student has attendance records',
      entryCount: entryCount.count,
      requiresConfirm: true
    });
  }

  db.prepare('DELETE FROM exemptions WHERE student_id = ?').run(req.params.id);
  db.prepare('DELETE FROM time_entries WHERE student_id = ?').run(req.params.id);
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

module.exports = router;
