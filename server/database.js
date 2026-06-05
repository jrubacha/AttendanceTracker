const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'attendance.sqlite');

// Internal sql.js database instance (set during initialize)
let _sqlDb = null;
let _SQL = null;

function _save() {
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Compatibility wrapper that provides the same API as better-sqlite3
// so all route files can remain unchanged.
const db = {
  prepare(sql) {
    return {
      run(...params) {
        const stmt = _sqlDb.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        stmt.step();
        stmt.free();
        const changes = _sqlDb.getRowsModified();
        const result = _sqlDb.exec('SELECT last_insert_rowid()');
        const lastInsertRowid = result.length > 0 ? result[0].values[0][0] : 0;
        _save();
        return { changes, lastInsertRowid };
      },
      get(...params) {
        const stmt = _sqlDb.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        let row = undefined;
        if (stmt.step()) {
          row = stmt.getAsObject();
        }
        stmt.free();
        return row;
      },
      all(...params) {
        const stmt = _sqlDb.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    };
  },
  exec(sql) {
    _sqlDb.exec(sql);
    _save();
  },
  pragma(str) {
    _sqlDb.exec(`PRAGMA ${str}`);
  }
};

async function initialize() {
  _SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    if (buffer.length > 0) {
      _sqlDb = new _SQL.Database(new Uint8Array(buffer));
    } else {
      _sqlDb = new _SQL.Database();
    }
  } else {
    _sqlDb = new _SQL.Database();
  }

  // Enable foreign keys (WAL mode is not applicable with sql.js)
  db.pragma('foreign_keys = ON');

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
      role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'mentor')),
      is_archived INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      hours_adjustment REAL DEFAULT 0,
      available_hours_adjustment REAL DEFAULT 0,
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
      season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_mandatory INTEGER DEFAULT 1,
      is_cancelled INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      name TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Meeting',
      google_event_id TEXT,
      auto_clockout_time TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
    CREATE INDEX IF NOT EXISTS idx_meetings_season ON meetings(season_id);
    -- NOTE: the index on google_event_id is created in the migration section
    -- below, after the column is guaranteed to exist (an existing DB's meetings
    -- table is not recreated here, so the column may not exist yet).

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

    CREATE TABLE IF NOT EXISTS exemption_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      reason TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_exemption_requests_status ON exemption_requests(status);

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

  // Migrations for existing databases
  try {
    db.exec('ALTER TABLE students ADD COLUMN hours_adjustment REAL DEFAULT 0');
  } catch { /* column already exists */ }
  try {
    db.exec('ALTER TABLE students ADD COLUMN available_hours_adjustment REAL DEFAULT 0');
  } catch { /* column already exists */ }
  try {
    db.exec("ALTER TABLE double_time_rules ADD COLUMN specific_dates TEXT DEFAULT ''");
  } catch { /* column already exists */ }
  try {
    db.exec("ALTER TABLE students ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
  } catch { /* column already exists */ }

  // Migration: make meetings.season_id nullable (ON DELETE SET NULL instead of
  // NOT NULL ... ON DELETE CASCADE) so meetings can exist independently of a
  // season and be tagged to one "as needed". SQLite can't ALTER a column's
  // constraints in place, so rebuild the table if the old NOT NULL schema is
  // detected.
  try {
    const cols = db.prepare("PRAGMA table_info('meetings')").all();
    const seasonCol = cols.find(c => c.name === 'season_id');
    if (seasonCol && seasonCol.notnull === 1) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE meetings_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          is_mandatory INTEGER DEFAULT 1,
          is_cancelled INTEGER DEFAULT 0,
          is_custom INTEGER DEFAULT 0,
          name TEXT DEFAULT '',
          auto_clockout_time TEXT
        );
        INSERT INTO meetings_new (id, season_id, date, start_time, end_time, is_mandatory, is_cancelled, is_custom, name, auto_clockout_time)
          SELECT id, season_id, date, start_time, end_time, is_mandatory, is_cancelled, is_custom, name, auto_clockout_time FROM meetings;
        DROP TABLE meetings;
        ALTER TABLE meetings_new RENAME TO meetings;
        CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
        CREATE INDEX IF NOT EXISTS idx_meetings_season ON meetings(season_id);
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch { /* migration already applied or not needed */ }

  // Add meeting category tag and Google Calendar linkage (after any rebuild
  // above so these columns survive on already-migrated databases).
  try {
    db.exec("ALTER TABLE meetings ADD COLUMN category TEXT NOT NULL DEFAULT 'Meeting'");
  } catch { /* column already exists */ }
  try {
    db.exec('ALTER TABLE meetings ADD COLUMN google_event_id TEXT');
  } catch { /* column already exists */ }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_meetings_google ON meetings(google_event_id)');
  } catch { /* index already exists */ }

  // Seed default settings (only if not already set, so admin edits stick).
  const seedSetting = (key, value) => {
    const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
    if (!row) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  };
  seedSetting('google_calendar_url', 'https://calendar.google.com/calendar/ical/firstpg1646%40gmail.com/public/basic.ics');
  seedSetting('calendar_timezone', 'America/New_York');
}

function reloadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Database file not found');
  }
  const buffer = fs.readFileSync(DB_PATH);
  if (buffer.length === 0) {
    throw new Error('Database file is empty');
  }
  if (_sqlDb) {
    _sqlDb.close();
  }
  _sqlDb = new _SQL.Database(new Uint8Array(buffer));
  db.pragma('foreign_keys = ON');
}

module.exports = { db, initialize, DB_PATH, DATA_DIR, reloadDatabase };
