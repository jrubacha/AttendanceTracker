const express = require('express');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

dayjs.extend(customParseFormat);

const router = express.Router();

// Parse a CSV string into an array of row objects
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV field split (handles quoted fields with commas)
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = fields[idx] || '';
    });
    rows.push({ line: i + 1, ...row });
  }
  return rows;
}

// Try to parse a date string into YYYY-MM-DD
function parseDate(str) {
  const formats = [
    'YYYY-MM-DD',
    'MM/DD/YYYY',
    'M/D/YYYY',
    'MM-DD-YYYY',
    'MM/DD/YY',
    'M/D/YY',
  ];
  for (const fmt of formats) {
    const d = dayjs(str, fmt, true);
    if (d.isValid()) return d.format('YYYY-MM-DD');
  }
  return null;
}

// Try to parse a time string into HH:mm:ss
function parseTime(str) {
  const formats = [
    'HH:mm:ss',
    'HH:mm',
    'h:mm:ss A',
    'h:mm:ssa',
    'h:mm A',
    'h:mmA',
    'h:mm:ss a',
    'h:mm a',
    'h:mma',
  ];
  for (const fmt of formats) {
    const t = dayjs(str, fmt, true);
    if (t.isValid()) return t.format('HH:mm:ss');
  }
  return null;
}

// Map header variations to canonical names
function resolveHeader(headers, candidates) {
  for (const c of candidates) {
    if (headers.includes(c)) return c;
  }
  return null;
}

// Import attendance data from CSV
router.post('/attendance', requireAdmin, (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'CSV data is required' });
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No data rows found in CSV' });
  }

  // Detect column headers (support common variations)
  const sampleKeys = Object.keys(rows[0]).filter(k => k !== 'line');
  const nameCol = resolveHeader(sampleKeys, ['name', 'student', 'student name', 'member']);
  const dateCol = resolveHeader(sampleKeys, ['date', 'day']);
  const timeInCol = resolveHeader(sampleKeys, ['time in', 'timein', 'clock in', 'clockin', 'in', 'start']);
  const timeOutCol = resolveHeader(sampleKeys, ['time out', 'timeout', 'clock out', 'clockout', 'out', 'end']);

  if (!nameCol || !dateCol || !timeInCol) {
    return res.status(400).json({
      error: 'CSV must have at least Name, Date, and Time In columns',
      detectedColumns: sampleKeys,
    });
  }

  // Load all students for name matching
  const students = db.prepare('SELECT id, name FROM students').all();
  const studentMap = new Map();
  students.forEach(s => {
    studentMap.set(s.name.toLowerCase().trim(), s.id);
  });

  // Load active season for meeting matching
  const activeSeason = db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();

  const results = { imported: 0, skipped: [], errors: [] };

  for (const row of rows) {
    const name = row[nameCol];
    const dateStr = row[dateCol];
    const timeInStr = row[timeInCol];
    const timeOutStr = timeOutCol ? row[timeOutCol] : null;

    // Validate name
    if (!name) {
      results.errors.push({ line: row.line, reason: 'Missing name' });
      continue;
    }

    // Match student by name (case-insensitive)
    const studentId = studentMap.get(name.toLowerCase().trim());
    if (!studentId) {
      results.skipped.push({ line: row.line, name, reason: 'Student not found' });
      continue;
    }

    // Parse date
    const date = parseDate(dateStr);
    if (!date) {
      results.errors.push({ line: row.line, name, reason: `Invalid date: "${dateStr}"` });
      continue;
    }

    // Parse time in
    const timeIn = parseTime(timeInStr);
    if (!timeIn) {
      results.errors.push({ line: row.line, name, reason: `Invalid time in: "${timeInStr}"` });
      continue;
    }

    // Parse time out (optional)
    let timeOut = null;
    if (timeOutStr && timeOutStr.trim()) {
      timeOut = parseTime(timeOutStr);
      if (!timeOut) {
        results.errors.push({ line: row.line, name, reason: `Invalid time out: "${timeOutStr}"` });
        continue;
      }
    }

    const clockIn = `${date} ${timeIn}`;
    const clockOut = timeOut ? `${date} ${timeOut}` : null;

    // Try to match to a meeting on this date
    let meetingId = null;
    if (activeSeason) {
      const meetings = db.prepare(
        'SELECT * FROM meetings WHERE season_id = ? AND date = ? AND is_cancelled = 0 ORDER BY start_time'
      ).all(activeSeason.id, date);

      for (const meeting of meetings) {
        const meetingStart = dayjs(`${date} ${meeting.start_time}`).subtract(30, 'minute');
        const meetingEnd = dayjs(`${date} ${meeting.auto_clockout_time || meeting.end_time}`);
        const clockTime = dayjs(clockIn);
        if (clockTime.isAfter(meetingStart) && clockTime.isBefore(meetingEnd)) {
          meetingId = meeting.id;
          break;
        }
      }
    }

    // Check for duplicate entry (same student, same clock_in time)
    const existing = db.prepare(
      'SELECT id FROM time_entries WHERE student_id = ? AND clock_in = ?'
    ).get(studentId, clockIn);
    if (existing) {
      results.skipped.push({ line: row.line, name, reason: 'Duplicate entry (same clock-in time)' });
      continue;
    }

    // Insert time entry
    db.prepare(
      'INSERT INTO time_entries (student_id, meeting_id, clock_in, clock_out, notes) VALUES (?, ?, ?, ?, ?)'
    ).run(studentId, meetingId, clockIn, clockOut, 'Imported');

    results.imported++;
  }

  res.json({
    success: true,
    totalRows: rows.length,
    ...results,
  });
});

module.exports = router;
