const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'attendance.sqlite');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      pin_last4 TEXT NOT NULL,
      is_archived INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_pin_hash ON students(pin_hash);

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('off_season', 'build_season')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_mandatory INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_mandatory INTEGER DEFAULT 1,
      is_cancelled INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      name TEXT DEFAULT '',
      auto_clockout_time TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
    CREATE INDEX IF NOT EXISTS idx_meetings_season ON meetings(season_id);

    CREATE TABLE IF NOT EXISTS double_time_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      day_of_week INTEGER,
      meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      multiplier REAL DEFAULT 2.0,
      condition_type TEXT DEFAULT '',
      condition_value TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
      clock_in TEXT NOT NULL,
      clock_out TEXT,
      is_auto_clockout INTEGER DEFAULT 0,
      is_late INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_student ON time_entries(student_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_meeting ON time_entries(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries(clock_in);

    CREATE TABLE IF NOT EXISTS exemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, meeting_id)
    );

    CREATE TABLE IF NOT EXISTS thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      percentage REAL NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

module.exports = { db, initialize, DB_PATH, DATA_DIR };
