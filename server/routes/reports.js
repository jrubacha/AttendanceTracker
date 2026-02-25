const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Calculate hours for a time entry within a meeting window
function calculateMeetingHours(entry, meeting) {
  if (!entry.clock_out) return 0;
  const clockIn = dayjs(entry.clock_in);
  const clockOut = dayjs(entry.clock_out);

  if (!meeting) {
    // Open hours - just return raw duration
    return clockOut.diff(clockIn, 'minute') / 60;
  }

  // Calculate overlap between clock-in/out and meeting window
  const meetingStart = dayjs(`${meeting.date} ${meeting.start_time}`);
  const meetingEnd = dayjs(`${meeting.date} ${meeting.end_time}`);

  // If clocked out within 5 minutes of meeting end, credit through meeting end
  const graceThreshold = meetingEnd.subtract(5, 'minute');
  const adjustedClockOut = (clockOut.isAfter(graceThreshold) && clockOut.isBefore(meetingEnd))
    ? meetingEnd
    : clockOut;

  const effectiveStart = clockIn.isAfter(meetingStart) ? clockIn : meetingStart;
  const effectiveEnd = adjustedClockOut.isBefore(meetingEnd) ? adjustedClockOut : meetingEnd;

  if (effectiveEnd.isBefore(effectiveStart)) return 0;

  return effectiveEnd.diff(effectiveStart, 'minute') / 60;
}

// Apply double time rules to hours
function applyDoubleTime(entry, meeting, seasonId) {
  if (!entry.clock_out || !meeting) return 0;

  const rules = db.prepare(
    'SELECT * FROM double_time_rules WHERE season_id = ?'
  ).all(seasonId);

  let bonusHours = 0;
  const clockIn = dayjs(entry.clock_in);
  const clockOut = dayjs(entry.clock_out);
  const entryDate = dayjs(entry.clock_in).format('YYYY-MM-DD');
  const dow = dayjs(entryDate).day();

  for (const rule of rules) {
    // Check if rule applies to this day
    if (rule.day_of_week !== null && rule.day_of_week !== dow) continue;
    if (rule.meeting_id !== null && rule.meeting_id !== meeting.id) continue;

    // Check condition
    if (rule.condition_type === 'clocked_in_before') {
      const conditionTime = dayjs(`${entryDate} ${rule.condition_value}`);
      if (!clockIn.isBefore(conditionTime)) continue;
    }

    // Calculate overlap with double time window
    const dtStart = dayjs(`${entryDate} ${rule.start_time}`);
    const dtEnd = dayjs(`${entryDate} ${rule.end_time}`);
    const meetingStart = dayjs(`${meeting.date} ${meeting.start_time}`);
    const meetingEnd = dayjs(`${meeting.date} ${meeting.end_time}`);

    // Effective window is intersection of double-time window, meeting window, and clock-in/out
    const effectiveStart = [clockIn, dtStart, meetingStart].reduce((a, b) => a.isAfter(b) ? a : b);
    const effectiveEnd = [clockOut, dtEnd, meetingEnd].reduce((a, b) => a.isBefore(b) ? a : b);

    if (effectiveEnd.isAfter(effectiveStart)) {
      const hours = effectiveEnd.diff(effectiveStart, 'minute') / 60;
      bonusHours += hours * (rule.multiplier - 1); // -1 because base hours already counted
    }
  }

  return bonusHours;
}

// Calculate attendance for a single student in a season
function calculateStudentAttendance(studentId, seasonId) {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  if (!season) return null;

  const student = db.prepare('SELECT hours_adjustment, available_hours_adjustment FROM students WHERE id = ?').get(studentId);
  const hoursAdj = student?.hours_adjustment || 0;
  const availableAdj = student?.available_hours_adjustment || 0;

  // Get all meetings for the season
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE season_id = ? ORDER BY date, start_time'
  ).all(seasonId);

  // Get exemptions for this student
  const exemptions = db.prepare(
    'SELECT meeting_id FROM exemptions WHERE student_id = ?'
  ).all(studentId).map(e => e.meeting_id);

  // Get all time entries for this student in the season date range
  const entries = db.prepare(`
    SELECT te.*, m.date as meeting_date, m.start_time as meeting_start, m.end_time as meeting_end,
           m.is_mandatory as meeting_is_mandatory, m.is_cancelled as meeting_is_cancelled
    FROM time_entries te
    LEFT JOIN meetings m ON te.meeting_id = m.id
    WHERE te.student_id = ? AND te.clock_in >= ? AND te.clock_in <= ?
    ORDER BY te.clock_in
  `).all(studentId, season.start_date, season.end_date + ' 23:59:59');

  let mandatoryHoursAvailable = 0;
  let mandatoryHoursAttended = 0;
  let bonusHours = 0;
  let autoClockoutCount = 0;
  let lateCount = 0;
  let exemptionCount = exemptions.length;

  // Calculate mandatory hours available (denominator)
  // Only count meetings up to and including today so that future meetings
  // don't deflate students' attendance percentages
  const today = dayjs().format('YYYY-MM-DD');
  for (const meeting of meetings) {
    if (meeting.date > today) continue;
    if (meeting.is_cancelled) continue;
    if (!meeting.is_mandatory) continue;
    if (exemptions.includes(meeting.id)) continue;

    const startT = dayjs(`${meeting.date} ${meeting.start_time}`);
    const endT = dayjs(`${meeting.date} ${meeting.end_time}`);
    mandatoryHoursAvailable += endT.diff(startT, 'minute') / 60;
  }

  // Calculate hours attended (numerator)
  for (const entry of entries) {
    if (entry.is_auto_clockout) autoClockoutCount++;
    if (entry.is_late) lateCount++;

    if (!entry.clock_out) continue;

    if (entry.meeting_id) {
      const meeting = meetings.find(m => m.id === entry.meeting_id);
      if (!meeting || meeting.is_cancelled) continue;

      const hours = calculateMeetingHours(entry, meeting);

      if (meeting.is_mandatory && !exemptions.includes(meeting.id)) {
        mandatoryHoursAttended += hours;
        // Apply double time
        const dtBonus = applyDoubleTime(entry, meeting, seasonId);
        mandatoryHoursAttended += dtBonus;
      } else if (!meeting.is_mandatory) {
        bonusHours += hours;
        const dtBonus = applyDoubleTime(entry, meeting, seasonId);
        bonusHours += dtBonus;
      }
    } else {
      // Open hours (no meeting associated) - count as bonus
      const clockIn = dayjs(entry.clock_in);
      const clockOut = dayjs(entry.clock_out);
      bonusHours += clockOut.diff(clockIn, 'minute') / 60;
    }
  }

  // Apply manual adjustments
  const adjustedHours = mandatoryHoursAttended + bonusHours + hoursAdj;
  const adjustedAvailable = mandatoryHoursAvailable + availableAdj;

  const totalCredited = adjustedHours;
  const percentage = adjustedAvailable > 0
    ? (adjustedHours / adjustedAvailable) * 100
    : 0;

  return {
    studentId,
    mandatoryHoursAttended: Math.round(mandatoryHoursAttended * 100) / 100,
    mandatoryHoursAvailable: Math.round(mandatoryHoursAvailable * 100) / 100,
    bonusHours: Math.round(bonusHours * 100) / 100,
    totalCredited: Math.round(totalCredited * 100) / 100,
    percentage: Math.round(percentage * 10) / 10,
    hoursAdjustment: hoursAdj,
    availableHoursAdjustment: availableAdj,
    autoClockoutCount,
    lateCount,
    exemptionCount
  };
}

// Dashboard report - all students
router.get('/dashboard/:seasonId', requireAdmin, (req, res) => {
  const students = db.prepare('SELECT id, name, pin_last4, is_archived FROM students WHERE is_archived = 0 ORDER BY name').all();
  const thresholds = db.prepare('SELECT * FROM thresholds WHERE season_id = ? ORDER BY percentage DESC').all(req.params.seasonId);
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.seasonId);

  const report = students.map(student => {
    const attendance = calculateStudentAttendance(student.id, parseInt(req.params.seasonId));
    let thresholdColor = '#ef4444'; // red default
    let thresholdName = 'Below minimum';
    for (const t of thresholds) {
      if (attendance.percentage >= t.percentage) {
        thresholdColor = t.color;
        thresholdName = t.name;
        break;
      }
    }

    return {
      ...student,
      ...attendance,
      thresholdColor,
      thresholdName,
      hasAutoClockoutWarning: attendance.autoClockoutCount >= 3
    };
  });

  res.json({ report, thresholds, season });
});

// Individual student report
router.get('/student/:studentId/:seasonId', requireAdmin, (req, res) => {
  const student = db.prepare('SELECT id, name, pin_last4, is_archived, notes FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const seasonId = parseInt(req.params.seasonId);
  const attendance = calculateStudentAttendance(student.id, seasonId);
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);

  // Get all meetings with attendance status
  const meetings = db.prepare('SELECT * FROM meetings WHERE season_id = ? ORDER BY date, start_time').all(seasonId);
  const exemptions = db.prepare('SELECT meeting_id FROM exemptions WHERE student_id = ?').all(student.id).map(e => e.meeting_id);
  const entries = db.prepare(`
    SELECT * FROM time_entries WHERE student_id = ? AND clock_in >= ? AND clock_in <= ? ORDER BY clock_in
  `).all(student.id, season.start_date, season.end_date + ' 23:59:59');

  const meetingDetails = meetings.map(meeting => {
    const isExempt = exemptions.includes(meeting.id);
    const meetingEntries = entries.filter(e => e.meeting_id === meeting.id);
    const attended = meetingEntries.length > 0;
    const wasLate = meetingEntries.some(e => e.is_late);
    const wasAutoClockout = meetingEntries.some(e => e.is_auto_clockout);

    let status = 'absent';
    if (meeting.is_cancelled) status = 'cancelled';
    else if (isExempt) status = 'exempt';
    else if (attended && meeting.is_mandatory) status = 'present';
    else if (attended && !meeting.is_mandatory) status = 'optional-attended';

    return {
      ...meeting,
      status,
      isExempt,
      attended,
      wasLate,
      wasAutoClockout,
      entries: meetingEntries
    };
  });

  const thresholds = db.prepare('SELECT * FROM thresholds WHERE season_id = ? ORDER BY percentage DESC').all(seasonId);

  res.json({ student, attendance, season, meetingDetails, thresholds, entries });
});

// CSV export
router.get('/export/:seasonId', requireAdmin, (req, res) => {
  const { detailed } = req.query;
  const students = db.prepare('SELECT id, name, pin_last4 FROM students WHERE is_archived = 0 ORDER BY name').all();
  const seasonId = parseInt(req.params.seasonId);
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);

  if (detailed === 'true') {
    // Detailed export - every clock-in/out entry
    let csv = 'Student Name,PIN,Date,Clock In,Clock Out,Duration (hours),Meeting,Mandatory,Auto Clock-Out,Late,Notes\n';

    for (const student of students) {
      const entries = db.prepare(`
        SELECT te.*, m.date as meeting_date, m.name as meeting_name, m.is_mandatory
        FROM time_entries te
        LEFT JOIN meetings m ON te.meeting_id = m.id
        WHERE te.student_id = ? AND te.clock_in >= ? AND te.clock_in <= ?
        ORDER BY te.clock_in
      `).all(student.id, season.start_date, season.end_date + ' 23:59:59');

      for (const entry of entries) {
        const duration = entry.clock_out
          ? (dayjs(entry.clock_out).diff(dayjs(entry.clock_in), 'minute') / 60).toFixed(2)
          : 'In Progress';
        csv += `"${student.name}",${student.pin_last4},${dayjs(entry.clock_in).format('YYYY-MM-DD')},${dayjs(entry.clock_in).format('HH:mm')},${entry.clock_out ? dayjs(entry.clock_out).format('HH:mm') : ''},${duration},"${entry.meeting_name || 'Open Hours'}",${entry.is_mandatory ? 'Yes' : 'No'},${entry.is_auto_clockout ? 'Yes' : 'No'},${entry.is_late ? 'Yes' : 'No'},"${entry.notes || ''}"\n`;
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-detailed-${season.name}.csv"`);
    return res.send(csv);
  }

  // Summary export
  let csv = 'Student Name,PIN,Mandatory Hours Attended,Mandatory Hours Available,Attendance %,Bonus Hours,Auto Clock-Out Count,Late Count,Exemption Count\n';

  for (const student of students) {
    const attendance = calculateStudentAttendance(student.id, seasonId);
    csv += `"${student.name}",${student.pin_last4},${attendance.mandatoryHoursAttended},${attendance.mandatoryHoursAvailable},${attendance.percentage}%,${attendance.bonusHours},${attendance.autoClockoutCount},${attendance.lateCount},${attendance.exemptionCount}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-summary-${season.name}.csv"`);
  res.send(csv);
});

module.exports = router;
