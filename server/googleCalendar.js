const dayjs = require('dayjs');
const { db } = require('./database');

// node-ical is an optional dependency for the Google Calendar integration. Load
// it defensively so a missing install can never crash the server on startup —
// the rest of the app keeps working and sync reports a clear error instead.
let ical = null;
try {
  ical = require('node-ical');
} catch {
  console.warn('node-ical not installed — Google Calendar sync is disabled. Run `npm install` to enable it.');
}

// Default category for imported events. Admins can change a meeting's category
// (Meeting / Competition / Outreach) afterward and it is preserved across syncs.
const CATEGORY_DEFAULT = 'Meeting';

// How far back/forward we expand events into meetings.
const PAST_MONTHS = 3;
const FUTURE_MONTHS = 12;
const MAX_ALLDAY_SPAN = 14; // cap multi-day all-day events so a stray event can't flood the calendar

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d, utc) {
  return utc
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTime(d, utc) {
  return utc
    ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Render an absolute Date as wall-clock { date, time } in a specific IANA
// timezone, so one-off events land on the right day/time no matter what
// timezone the server runs in. Uses the built-in Intl API (no dependency).
function wallClockInTz(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
  const hour = parts.hour === '24' ? '00' : parts.hour; // some engines emit '24' for midnight
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

function autoClockoutFor(endTime) {
  const [h, m] = endTime.split(':').map(Number);
  const mins = h * 60 + m + 5;
  return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
}

// Turn one event occurrence into one or more day-level meeting "instances".
// occStart is the Date for this occurrence's start; isRecurring marks events
// that produce multiple occurrences (so the dedupe key includes the date).
function expandOccurrence(e, occStart, isRecurring, out, tz) {
  const allDay = e.datetype === 'date';
  const summary = ((e.summary || 'Event') + '').trim() || 'Event';
  const uid = (e.uid || summary) + '';
  const durMs = (e.end && e.start)
    ? (e.end.getTime() - e.start.getTime())
    : (allDay ? 86400000 : 60 * 60 * 1000);

  if (allDay) {
    let days = Math.round(durMs / 86400000);
    if (days < 1) days = 1;
    if (days > MAX_ALLDAY_SPAN) days = MAX_ALLDAY_SPAN;
    const multi = isRecurring || days > 1;
    for (let i = 0; i < days; i++) {
      const dd = new Date(occStart.getTime() + i * 86400000);
      const dateStr = fmtDate(dd, true);
      out.push({
        key: multi ? `${uid}:${dateStr}` : uid,
        date: dateStr,
        start_time: '00:00',
        end_time: '23:59',
        mandatory: false, // all-day events have no clock-in window → optional
        name: summary,
      });
    }
    return;
  }

  const endDate = new Date(occStart.getTime() + durMs);
  // node-ical/rrule return absolute UTC instants for every occurrence (and they
  // are DST-aware), so render both single and recurring timed events in the
  // calendar's timezone. This is host-timezone independent.
  const s = wallClockInTz(occStart, tz);
  const en = wallClockInTz(endDate, tz);
  const dateStr = s.date;
  const startT = s.time;
  let endT = en.date !== s.date ? '23:59' : en.time; // ends on a later day → clamp
  if (endT <= startT) endT = '23:59';
  out.push({
    key: isRecurring ? `${uid}:${dateStr}` : uid,
    date: dateStr,
    start_time: startT,
    end_time: endT,
    mandatory: true, // timed events default to mandatory (admin can flip)
    name: summary,
  });
}

async function fetchInstances(url, tz) {
  const data = await ical.async.fromURL(url);
  const rangeStart = dayjs().subtract(PAST_MONTHS, 'month');
  const rangeEnd = dayjs().add(FUTURE_MONTHS, 'month');
  const out = [];

  for (const k in data) {
    const e = data[k];
    if (!e || e.type !== 'VEVENT') continue;

    if (e.rrule) {
      const occurrences = e.rrule.between(rangeStart.toDate(), rangeEnd.toDate(), true);
      for (const occ of occurrences) {
        const dstr = fmtDate(occ, true);
        if (e.exdate && e.exdate[dstr]) continue; // cancelled occurrence
        if (e.recurrences && e.recurrences[dstr]) {
          // This occurrence was individually edited in Google
          const ov = e.recurrences[dstr];
          expandOccurrence(ov, ov.start, true, out, tz);
        } else {
          expandOccurrence(e, occ, true, out, tz);
        }
      }
    } else {
      if (!e.start) continue;
      const d = dayjs(e.start);
      if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;
      expandOccurrence(e, e.start, false, out, tz);
    }
  }
  return out;
}

// Sync the configured public Google Calendar into the meetings table.
// Returns { configured, imported, updated, removed, cancelled, total }.
async function syncGoogleCalendar() {
  if (!ical) {
    throw new Error('node-ical is not installed. Run `npm install` to enable Google Calendar sync.');
  }

  const url = getSetting('google_calendar_url');
  if (!url || !url.trim()) return { configured: false };

  const tz = getSetting('calendar_timezone') || 'America/New_York';
  const instances = await fetchInstances(url.trim(), tz);

  const findByKey = db.prepare('SELECT * FROM meetings WHERE google_event_id = ?');
  const insert = db.prepare(
    'INSERT INTO meetings (season_id, date, start_time, end_time, is_mandatory, is_custom, name, category, google_event_id, auto_clockout_time) VALUES (NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
  );
  // On update we refresh date/time/name from Google but preserve admin choices
  // (is_mandatory, is_cancelled, season_id, category).
  const update = db.prepare(
    'UPDATE meetings SET date = ?, start_time = ?, end_time = ?, name = ?, auto_clockout_time = ? WHERE id = ?'
  );

  const seen = new Set();
  let imported = 0;
  let updated = 0;

  for (const inst of instances) {
    if (seen.has(inst.key)) continue;
    seen.add(inst.key);
    const existing = findByKey.get(inst.key);
    const aco = autoClockoutFor(inst.end_time);
    if (existing) {
      update.run(inst.date, inst.start_time, inst.end_time, inst.name, aco, existing.id);
      updated++;
    } else {
      insert.run(inst.date, inst.start_time, inst.end_time, inst.mandatory ? 1 : 0, inst.name, CATEGORY_DEFAULT, inst.key, aco);
      imported++;
    }
  }

  // Events removed from Google: delete the meeting, or cancel it if attendance
  // was already recorded (so history is preserved).
  let removed = 0;
  let cancelled = 0;
  const synced = db.prepare('SELECT id, google_event_id FROM meetings WHERE google_event_id IS NOT NULL').all();
  for (const m of synced) {
    if (seen.has(m.google_event_id)) continue;
    const cnt = db.prepare('SELECT COUNT(*) AS c FROM time_entries WHERE meeting_id = ?').get(m.id).c;
    if (cnt > 0) {
      db.prepare('UPDATE meetings SET is_cancelled = 1 WHERE id = ?').run(m.id);
      cancelled++;
    } else {
      db.prepare('DELETE FROM meetings WHERE id = ?').run(m.id);
      removed++;
    }
  }

  setSetting('google_last_sync', new Date().toISOString());
  return { configured: true, imported, updated, removed, cancelled, total: instances.length };
}

// Background scheduler: sync every 30 minutes (and shortly after startup).
function startGoogleCalendarScheduler() {
  const run = () => {
    syncGoogleCalendar()
      .then(r => { if (r.configured) console.log('Google Calendar sync:', JSON.stringify(r)); })
      .catch(err => console.error('Google Calendar sync failed:', err.message));
  };
  setInterval(run, 30 * 60 * 1000);
  setTimeout(run, 10 * 1000); // give the server a moment to come up
  console.log('Google Calendar scheduler started');
}

module.exports = { syncGoogleCalendar, startGoogleCalendarScheduler, getSetting, setSetting };
