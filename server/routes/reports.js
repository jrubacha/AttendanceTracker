const express = require('express');
const dayjs = require('dayjs');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Resolve a student's threshold band (color + label) for a given percentage.
// Mentors aren't held to minimums, so they get a neutral band.
function thresholdBand(role, percentage, thresholds) {
  if (role === 'mentor') return { color: '#94a3b8', name: 'Mentor' };
  let color = '#ef4444';
  let name = 'Below minimum';
  for (const t of thresholds) {
    if (percentage >= t.percentage) {
      color = t.color;
      name = t.name;
      break;
    }
  }
  return { color, name };
}

// Find the best overlapping non-cancelled meeting for a time entry based on time overlap.
// Used when an entry's linked meeting was cancelled or when no meeting_id was stored
// (e.g., custom meetings created after students already clocked in).
function findOverlappingMeeting(entry, meetings) {
  if (!entry.clock_out) return null;
  const clockIn = dayjs(entry.clock_in);
  const clockOut = dayjs(entry.clock_out);
  const entryDate = dayjs(entry.clock_in).format('YYYY-MM-DD');

  let bestMatch = null;
  let bestOverlap = 0;

  for (const meeting of meetings) {
    if (meeting.is_cancelled) continue;
    if (meeting.date !== entryDate) continue;

    const meetingStart = dayjs(`${meeting.date} ${meeting.start_time}`);
    const meetingEnd = dayjs(`${meeting.date} ${meeting.end_time}`);

    const overlapStart = clockIn.isAfter(meetingStart) ? clockIn : meetingStart;
    const overlapEnd = clockOut.isBefore(meetingEnd) ? clockOut : meetingEnd;

    if (overlapEnd.isAfter(overlapStart)) {
      const overlap = overlapEnd.diff(overlapStart, 'minute');
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = meeting;
      }
    }
  }

  return bestMatch;
}

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

// Apply double time rules to hours. meeting may be null for open-hours entries.
function applyDoubleTime(entry, meeting, seasonId) {
  if (!entry.clock_out) return 0;

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
    if (rule.specific_dates) {
      // Rule targets specific dates - check if entry date matches any
      const dates = rule.specific_dates.split(',').map(d => d.trim());
      if (!dates.includes(entryDate)) continue;
    } else if (rule.day_of_week !== null && rule.day_of_week !== dow) {
      continue;
    }
    // If rule targets a specific meeting, skip when no meeting or wrong meeting
    if (rule.meeting_id !== null && (!meeting || rule.meeting_id !== meeting.id)) continue;

    // Check condition
    if (rule.condition_type === 'clocked_in_before') {
      const conditionTime = dayjs(`${entryDate} ${rule.condition_value}`);
      if (!clockIn.isBefore(conditionTime)) continue;
    }

    // Calculate overlap with double time window and clock-in/out
    const dtStart = dayjs(`${entryDate} ${rule.start_time}`);
    const dtEnd = dayjs(`${entryDate} ${rule.end_time}`);

    // Constrain by meeting window only when a meeting is linked
    const startConstraints = [clockIn, dtStart];
    const endConstraints = [clockOut, dtEnd];
    if (meeting) {
      startConstraints.push(dayjs(`${meeting.date} ${meeting.start_time}`));
      endConstraints.push(dayjs(`${meeting.date} ${meeting.end_time}`));
    }

    const effectiveStart = startConstraints.reduce((a, b) => a.isAfter(b) ? a : b);
    const effectiveEnd = endConstraints.reduce((a, b) => a.isBefore(b) ? a : b);

    if (effectiveEnd.isAfter(effectiveStart)) {
      const hours = effectiveEnd.diff(effectiveStart, 'minute') / 60;
      bonusHours += hours * (rule.multiplier - 1); // -1 because base hours already counted
    }
  }

  return bonusHours;
}

// Calculate attendance for a single student in a season.
// Optional dateRange { startDate, endDate } overrides the season date window.
function calculateStudentAttendance(studentId, seasonId, dateRange) {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  if (!season) return null;

  const student = db.prepare('SELECT role, hours_adjustment, available_hours_adjustment FROM students WHERE id = ?').get(studentId);
  const hoursAdj = student?.hours_adjustment || 0;
  const availableAdj = student?.available_hours_adjustment || 0;
  const isMentor = student?.role === 'mentor';

  // Use custom date range if provided, otherwise use full season
  const rangeStart = dateRange?.startDate || season.start_date;
  const rangeEnd = dateRange?.endDate || season.end_date;

  // Get all meetings for the season within the date range
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE season_id = ? AND date >= ? AND date <= ? ORDER BY date, start_time'
  ).all(seasonId, rangeStart, rangeEnd);

  // Get exemptions for this student (only for meetings in range)
  const allExemptions = db.prepare(
    'SELECT meeting_id FROM exemptions WHERE student_id = ?'
  ).all(studentId).map(e => e.meeting_id);
  const meetingIds = new Set(meetings.map(m => m.id));
  const exemptions = allExemptions.filter(id => meetingIds.has(id));

  // Get all time entries for this student in the date range
  const entries = db.prepare(`
    SELECT te.*, m.date as meeting_date, m.start_time as meeting_start, m.end_time as meeting_end,
           m.is_mandatory as meeting_is_mandatory, m.is_cancelled as meeting_is_cancelled
    FROM time_entries te
    LEFT JOIN meetings m ON te.meeting_id = m.id
    WHERE te.student_id = ? AND te.clock_in >= ? AND te.clock_in <= ?
    ORDER BY te.clock_in
  `).all(studentId, rangeStart, rangeEnd + ' 23:59:59');

  let mandatoryHoursAvailable = 0;
  let mandatoryHoursAttended = 0;
  let bonusHours = 0;
  let autoClockoutCount = 0;
  let lateCount = 0;
  let exemptionCount = exemptions.length;

  // Calculate mandatory hours available (denominator)
  // Only count meetings BEFORE today so that today's meetings (which likely
  // haven't happened yet) don't deflate attendance percentages
  const today = dayjs().format('YYYY-MM-DD');
  for (const meeting of meetings) {
    if (meeting.date >= today) continue;
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

    // Resolve the meeting for this entry:
    // 1. If linked meeting exists and is not cancelled, use it
    // 2. If linked meeting is cancelled (or missing), try time-overlap matching
    // 3. If no meeting_id stored, try time-overlap matching
    // 4. If no match found, count as bonus/open hours
    let meeting = null;
    if (entry.meeting_id) {
      const linkedMeeting = meetings.find(m => m.id === entry.meeting_id);
      if (linkedMeeting && !linkedMeeting.is_cancelled) {
        meeting = linkedMeeting;
      }
    }
    if (!meeting) {
      meeting = findOverlappingMeeting(entry, meetings);
    }

    if (meeting) {
      const hours = calculateMeetingHours(entry, meeting);

      if (meeting.is_mandatory) {
        mandatoryHoursAttended += hours;
        // Apply double time
        const dtBonus = applyDoubleTime(entry, meeting, seasonId);
        mandatoryHoursAttended += dtBonus;
      } else {
        bonusHours += hours;
        const dtBonus = applyDoubleTime(entry, meeting, seasonId);
        bonusHours += dtBonus;
      }
    } else {
      // Open hours (no meeting matches) - count as bonus
      const clockIn = dayjs(entry.clock_in);
      const clockOut = dayjs(entry.clock_out);
      bonusHours += clockOut.diff(clockIn, 'minute') / 60;
      // Apply double time even for open hours (e.g., Saturday early clock-in rules)
      const dtBonus = applyDoubleTime(entry, null, seasonId);
      bonusHours += dtBonus;
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
    isMentor,
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
// Supports optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD query params
router.get('/dashboard/:seasonId', requireAdmin, (req, res) => {
  const { startDate, endDate, role } = req.query;
  const roleFilter = (role === 'student' || role === 'mentor') ? role : null;
  const students = roleFilter
    ? db.prepare('SELECT id, name, pin_last4, role, is_archived FROM students WHERE is_archived = 0 AND role = ? ORDER BY name').all(roleFilter)
    : db.prepare('SELECT id, name, pin_last4, role, is_archived FROM students WHERE is_archived = 0 ORDER BY name').all();
  const thresholds = db.prepare('SELECT * FROM thresholds WHERE season_id = ? ORDER BY percentage DESC').all(req.params.seasonId);
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.seasonId);

  const dateRange = (startDate && endDate) ? { startDate, endDate } : null;

  const report = students.map(student => {
    const attendance = calculateStudentAttendance(student.id, parseInt(req.params.seasonId), dateRange);

    // Mentors are not held to minimums, so thresholds don't apply to them.
    let thresholdColor = '#94a3b8'; // neutral slate
    let thresholdName = 'Mentor';
    if (student.role !== 'mentor') {
      thresholdColor = '#ef4444'; // red default
      thresholdName = 'Below minimum';
      for (const t of thresholds) {
        if (attendance.percentage >= t.percentage) {
          thresholdColor = t.color;
          thresholdName = t.name;
          break;
        }
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

// Build the full per-student report payload (attendance summary + per-meeting
// status + raw entries + thresholds) for a season. Shared by the admin
// endpoint and the student self-service endpoint.
function buildStudentReport(studentId, seasonId, dateRange) {
  const attendance = calculateStudentAttendance(studentId, seasonId, dateRange);
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  if (!season) return null;

  const rangeStart = dateRange?.startDate || season.start_date;
  const rangeEnd = dateRange?.endDate || season.end_date;

  // Get all meetings with attendance status (filtered by date range if provided)
  const meetings = db.prepare('SELECT * FROM meetings WHERE season_id = ? AND date >= ? AND date <= ? ORDER BY date, start_time').all(seasonId, rangeStart, rangeEnd);
  const exemptions = db.prepare('SELECT meeting_id FROM exemptions WHERE student_id = ?').all(studentId).map(e => e.meeting_id);
  const entries = db.prepare(`
    SELECT * FROM time_entries WHERE student_id = ? AND clock_in >= ? AND clock_in <= ? ORDER BY clock_in
  `).all(studentId, rangeStart, rangeEnd + ' 23:59:59');

  const meetingDetails = meetings.map(meeting => {
    const isExempt = exemptions.includes(meeting.id);
    // Match entries by meeting_id OR by time overlap (for entries whose
    // linked meeting was cancelled, or that were created before the meeting existed)
    const meetingEntries = entries.filter(e => {
      if (e.meeting_id === meeting.id) return true;
      if (!e.clock_out) return false;
      // Check if entry is unlinked or linked to a cancelled meeting
      const linkedMeeting = e.meeting_id ? meetings.find(m => m.id === e.meeting_id) : null;
      if (e.meeting_id && linkedMeeting && !linkedMeeting.is_cancelled) return false;
      // Check time overlap with this meeting
      const clockIn = dayjs(e.clock_in);
      const clockOut = dayjs(e.clock_out);
      const entryDate = dayjs(e.clock_in).format('YYYY-MM-DD');
      if (meeting.date !== entryDate || meeting.is_cancelled) return false;
      const meetingStart = dayjs(`${meeting.date} ${meeting.start_time}`);
      const meetingEnd = dayjs(`${meeting.date} ${meeting.end_time}`);
      const overlapStart = clockIn.isAfter(meetingStart) ? clockIn : meetingStart;
      const overlapEnd = clockOut.isBefore(meetingEnd) ? clockOut : meetingEnd;
      return overlapEnd.isAfter(overlapStart);
    });
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

  return { attendance, season, meetingDetails, thresholds, entries };
}

// Individual student report (admin)
router.get('/student/:studentId/:seasonId', requireAdmin, (req, res) => {
  const student = db.prepare('SELECT id, name, pin_last4, role, is_archived, notes FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const seasonId = parseInt(req.params.seasonId);
  const { startDate, endDate } = req.query;
  const dateRange = (startDate && endDate) ? { startDate, endDate } : null;
  const data = buildStudentReport(student.id, seasonId, dateRange);
  if (!data) return res.status(404).json({ error: 'Season not found' });

  res.json({ student, ...data });
});

// Student self-service report (kiosk). PIN-authenticated, read-only summary:
// stats + per-meeting attendance status, with raw clock-in/out times stripped.
router.post('/my-report', (req, res) => {
  const { pin, seasonId } = req.body;
  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Invalid PIN' });
  }
  const students = db.prepare('SELECT * FROM students WHERE is_archived = 0').all();
  const student = students.find(s => bcrypt.compareSync(pin, s.pin_hash));
  if (!student) {
    return res.status(404).json({ error: 'PIN not found' });
  }

  const seasons = db.prepare(
    'SELECT id, name, type, start_date, end_date, is_active FROM seasons ORDER BY start_date DESC'
  ).all();

  // Resolve which season to show: requested, else active, else most recent.
  let useSeasonId = seasonId ? parseInt(seasonId) : null;
  if (!useSeasonId || !seasons.some(s => s.id === useSeasonId)) {
    const active = seasons.find(s => s.is_active);
    useSeasonId = active ? active.id : (seasons[0]?.id || null);
  }

  const base = { student: { name: student.name }, seasons, seasonId: useSeasonId };
  if (!useSeasonId) {
    return res.json({ ...base, attendance: null, season: null, meetingDetails: [], band: null });
  }

  const data = buildStudentReport(student.id, useSeasonId, null);
  // Strip raw clock-in/out entries — students see a summary, not the log.
  const meetingDetails = data.meetingDetails.map(({ entries, ...m }) => m);
  const band = thresholdBand(student.role, data.attendance.percentage, data.thresholds);

  res.json({
    ...base,
    attendance: data.attendance,
    season: data.season,
    meetingDetails,
    band,
  });
});

// CSV export
// Supports optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD query params
router.get('/export/:seasonId', requireAdmin, (req, res) => {
  const { detailed, startDate, endDate } = req.query;
  const students = db.prepare('SELECT id, name, pin_last4 FROM students WHERE is_archived = 0 ORDER BY name').all();
  const seasonId = parseInt(req.params.seasonId);
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  const dateRange = (startDate && endDate) ? { startDate, endDate } : null;
  const rangeStart = dateRange?.startDate || season.start_date;
  const rangeEnd = dateRange?.endDate || season.end_date;

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
      `).all(student.id, rangeStart, rangeEnd + ' 23:59:59');

      for (const entry of entries) {
        const duration = entry.clock_out
          ? (dayjs(entry.clock_out).diff(dayjs(entry.clock_in), 'minute') / 60).toFixed(2)
          : 'In Progress';
        csv += `"${student.name}",${student.pin_last4},${dayjs(entry.clock_in).format('YYYY-MM-DD')},${dayjs(entry.clock_in).format('HH:mm')},${entry.clock_out ? dayjs(entry.clock_out).format('HH:mm') : ''},${duration},"${entry.meeting_name || 'Open Hours'}",${entry.is_mandatory ? 'Yes' : 'No'},${entry.is_auto_clockout ? 'Yes' : 'No'},${entry.is_late ? 'Yes' : 'No'},"${entry.notes || ''}"\n`;
      }
    }

    const detailedSuffix = dateRange ? `-${rangeStart}-to-${rangeEnd}` : '';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-detailed-${season.name}${detailedSuffix}.csv"`);
    return res.send(csv);
  }

  // Summary export
  let csv = 'Student Name,PIN,Mandatory Hours Attended,Mandatory Hours Available,Attendance %,Bonus Hours,Auto Clock-Out Count,Late Count,Exemption Count\n';

  for (const student of students) {
    const attendance = calculateStudentAttendance(student.id, seasonId, dateRange);
    csv += `"${student.name}",${student.pin_last4},${attendance.mandatoryHoursAttended},${attendance.mandatoryHoursAvailable},${attendance.percentage}%,${attendance.bonusHours},${attendance.autoClockoutCount},${attendance.lateCount},${attendance.exemptionCount}\n`;
  }

  const summarySuffix = dateRange ? `-${rangeStart}-to-${rangeEnd}` : '';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-summary-${season.name}${summarySuffix}.csv"`);
  res.send(csv);
});

module.exports = router;
