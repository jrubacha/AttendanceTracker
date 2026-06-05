const dayjs = require('dayjs');
const { db } = require('./database');

function runAutoClockout() {
  const now = dayjs();
  const today = now.format('YYYY-MM-DD');
  const currentTime = now.format('HH:mm');

  // Get today's meetings that have passed their auto-clockout time. Meetings
  // are not required to belong to a season, so match by date regardless of tag.
  const meetings = db.prepare(
    'SELECT * FROM meetings WHERE date = ? AND is_cancelled = 0 AND auto_clockout_time <= ?'
  ).all(today, currentTime);

  // Find all open time entries for students who are clocked in
  const openEntries = db.prepare(
    'SELECT * FROM time_entries WHERE clock_out IS NULL'
  ).all();

  for (const entry of openEntries) {
    const clockInDate = dayjs(entry.clock_in).format('YYYY-MM-DD');
    if (clockInDate !== today) {
      // Entry from a previous day - auto clock out at 11:59 PM of that day
      const clockOutTime = dayjs(entry.clock_in).endOf('day').format('YYYY-MM-DD HH:mm:ss');
      db.prepare('UPDATE time_entries SET clock_out = ?, is_auto_clockout = 1 WHERE id = ?')
        .run(clockOutTime, entry.id);
      continue;
    }

    // Check if any meeting's auto-clockout time has passed
    if (entry.meeting_id) {
      const meeting = meetings.find(m => m.id === entry.meeting_id);
      if (meeting && currentTime >= meeting.auto_clockout_time) {
        const clockOutTime = `${today} ${meeting.auto_clockout_time}:00`;
        db.prepare('UPDATE time_entries SET clock_out = ?, is_auto_clockout = 1 WHERE id = ?')
          .run(clockOutTime, entry.id);
        continue;
      }
    }

    // Default auto-clockout times based on day of week
    const dow = now.day();
    let defaultAutoClockout;
    if (dow === 6) {
      // Saturday: 5:05 PM
      defaultAutoClockout = '17:05';
    } else if (dow >= 1 && dow <= 4) {
      // Mon-Thu: 9:05 PM
      defaultAutoClockout = '21:05';
    } else {
      // Sunday/Friday: 9:05 PM default
      defaultAutoClockout = '21:05';
    }

    if (currentTime >= defaultAutoClockout) {
      const clockOutTime = `${today} ${defaultAutoClockout}:00`;
      db.prepare('UPDATE time_entries SET clock_out = ?, is_auto_clockout = 1 WHERE id = ?')
        .run(clockOutTime, entry.id);
    }
  }
}

// Run auto-clockout check every minute
function startAutoClockoutScheduler() {
  setInterval(runAutoClockout, 60 * 1000);
  // Run once immediately
  runAutoClockout();
  console.log('Auto clock-out scheduler started');
}

module.exports = { runAutoClockout, startAutoClockoutScheduler };
