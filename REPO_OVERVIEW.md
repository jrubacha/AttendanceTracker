# FRC Attendance Tracker

A Progressive Web App (PWA) for tracking attendance on a FIRST Robotics Competition (FRC) team — built for **FIRST Team 1646 "Precision Guessworks."** Students clock in and out at a shared kiosk using a 4‑digit PIN, and coaches/mentors manage the roster, schedule, and attendance reports from a password‑protected admin console.

---

## What It Does (Feature Overview)

### Kiosk (student-facing)
The home screen (`/`) is a touch-friendly kiosk meant to run on a tablet or shared computer at the shop:

- **PIN clock-in / clock-out** — a student taps in a 4‑digit PIN (on-screen keypad or physical keyboard); the app shows a welcome screen and a single big Clock In / Clock Out button. Confirmation flashes green (in) or red (out) and auto-returns to the home screen after 3 seconds.
- **Live elapsed time** — while clocked in, the kiosk shows "You've been here Xh Ym."
- **Today's meeting window** displayed in the header alongside a live clock.
- **Out-of-hours work notes** — if a student is present outside of any scheduled meeting window, on clock-out they're required to describe what they worked on (e.g. "CAD on the intake"). This is stored on the time entry.
- **Self-service "View My Attendance"** — PIN-gated, read-only summary: attendance percentage, total/bonus/mandatory hours, late & auto-clockout counts, threshold band, and a per-meeting history (raw clock times are stripped out).
- **Exemption requests** — a student can PIN in and request to be excused from an upcoming meeting (must be >24h in advance), giving a reason. Requests go to the admin queue for approval/denial.

### Admin console (`/admin`, login required)
A single-page admin app with these sections:

- **Dashboard** — roster-wide attendance table for the active season, color-coded by threshold band, with auto-clockout warnings (flagged at ≥3), role filtering (student/mentor), and optional custom date-range filtering.
- **Students** — create/edit/archive students, assign PINs (regenerate), set role (student vs. mentor), notes, and manual hours adjustments.
- **Student Detail** — per-student report: attendance stats, per-meeting status, raw time-entry log; admins can add/edit/delete manual time entries and toggle attendance/exemptions per meeting.
- **Schedule** — manage meetings: generate from weekly defaults, create one-off/custom meetings, generate over a date range, cancel meetings, tag categories (Meeting / Competition / Outreach).
- **Seasons** — define seasons (`off_season`, `build_season`, `custom_range`) by date range; a season encompasses any meeting whose date falls within its window (meetings are *not* explicitly tied to a season). One season can be marked active.
- **Requests** — review pending exemption requests and approve/deny them (pending count badge).
- **Reports** — CSV export (summary or detailed per-entry), with optional date-range scoping.
- **Settings** — Google Calendar sync URL & timezone, manual sync trigger, and database backup/restore.

### Attendance engine (the interesting logic)
Implemented mostly in `server/routes/reports.js` and `server/routes/timeEntries.js`:

- **Meeting matching** — a time entry is credited against a meeting by `meeting_id`, or by *time-overlap* matching when the linked meeting was cancelled or the entry predates the meeting.
- **Mandatory vs. bonus hours** — mandatory-meeting hours count toward the attendance %; everything else (open shop hours, optional meetings) counts as bonus.
- **Late detection** — clock-in more than a 5-minute grace period after meeting start is flagged late.
- **Grace credit** — clocking out within 5 minutes of meeting end credits through the full meeting end.
- **Double-time rules** — per-season multipliers (e.g. 2×) for certain days/meetings/time windows, optionally gated by conditions (e.g. "clocked in before X") or specific dates. Used to incentivize early/weekend attendance.
- **Thresholds** — per-season percentage bands with colors/labels (e.g. green/yellow/red), used to grade each student. Mentors are exempt from minimums.
- **Manual adjustments** — per-student `hours_adjustment` and `available_hours_adjustment` to correct totals.
- **Auto clock-out** — a scheduler runs every minute (`server/autoClockout.js`) and closes open entries past a meeting's auto-clockout time, with day-of-week defaults (Sat 5:05 PM, Mon–Thu 9:05 PM, etc.) and previous-day cleanup.

### Google Calendar integration
`server/googleCalendar.js` syncs a **public Google Calendar (iCal/.ics URL)** into the meetings table every 30 minutes:

- Expands recurring events (RRULE-aware, DST-aware, handles edited/cancelled occurrences) into individual day-level meetings, 3 months back to 12 months forward.
- Renders event times in a configured IANA timezone (default `America/New_York`) so they land correctly regardless of server timezone.
- All-day events become optional meetings; timed events default to mandatory.
- Preserves admin edits (mandatory flag, category, cancelled state) across re-syncs; deletes events removed from Google, or cancels them if attendance was already recorded (to preserve history).
- `node-ical` is loaded defensively so a missing install disables sync rather than crashing the server.

---

## Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, Tailwind CSS, Vite |
| PWA | `vite-plugin-pwa` + Workbox (offline caching, installable, `NetworkFirst` for `/api`) |
| Backend | Node.js + Express 4 |
| Database | SQLite via **`sql.js`** (WASM), persisted to `data/attendance.sqlite` |
| Auth | JWT (admin) in an HTTP cookie + bcrypt-hashed admin password and student PINs |
| Dates | Day.js (server), Intl API (timezone rendering) |

### Notable design choices
- **`sql.js` (in-memory WASM SQLite)** instead of a native driver — the whole DB lives in memory and is written back to disk on every mutation (`_save()`). A thin wrapper in `server/database.js` mimics the `better-sqlite3` API so route code stays clean. This keeps the app dependency-light and portable (no native compilation) at the cost of scaling.
- **Schema migrations** run on startup via guarded `ALTER TABLE` / table-rebuild blocks (e.g. making `meetings.season_id` nullable, widening the season-type CHECK constraint, adding category/Google columns).
- **Meetings are decoupled from seasons** — a season is just a date window; reports gather meetings by date. This is a deliberate refactor visible in recent commit history.

### Data model (key tables)
`admin`, `students`, `seasons`, `schedule_defaults`, `meetings`, `double_time_rules`, `time_entries`, `exemptions`, `exemption_requests`, `thresholds`, `settings`.

### API surface (Express routers under `/api`)
`auth`, `students`, `seasons`, `schedule`, `time-entries`, `exemptions`, `thresholds`, `double-time`, `reports`, `import`, `settings`, plus `/api/backup` (download SQLite) and `/api/restore` (upload SQLite, validates magic header, auto-backs-up first).

---

## Web Access & Auth Model

- **Public, unauthenticated:** the kiosk (`/`), PIN verification, clock-in/out, work notes, exemption requests, and the PIN-gated self-service report. These are intentionally open because the kiosk is a shared shop device — the 4‑digit PIN is the only credential.
- **Admin-protected:** everything else, guarded by `requireAdmin` (JWT in `adminToken` cookie, 30-minute session timeout). First-run shows a **Setup** page to create the initial admin account; after that, `/admin/login`.
- **Backup/restore endpoints** check only for the presence of the cookie.

> Security notes worth flagging: the JWT secret falls back to a hard-coded default if `JWT_SECRET` isn't set (`server/auth.js`), and the kiosk endpoints are unauthenticated by design. Fine for a trusted LAN/shop kiosk; would need hardening for public internet exposure.

---

## Running It

```bash
npm install

# Development (concurrently runs API on :3000 and Vite dev server on :5173,
# with /api proxied to the backend)
npm run dev

# Production build + serve (Express serves the built SPA from ./dist)
npm run build
NODE_ENV=production npm start   # honors $PORT, default 3000
```

Environment variables:
- `PORT` — server port (default 3000)
- `JWT_SECRET` — **should be set in production**
- `NODE_ENV=production` — enables static SPA serving

The SQLite database file and pre-restore backups live in `./data/` (gitignored). Google Calendar URL and timezone are seeded into the `settings` table on first run and editable from the admin Settings page.
