const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { initialize, DB_PATH, DATA_DIR, reloadDatabase } = require('./database');
const { startAutoClockoutScheduler } = require('./autoClockout');

async function main() {
  // Initialize database (async for sql.js WASM loading)
  await initialize();

  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/students', require('./routes/students'));
  app.use('/api/seasons', require('./routes/seasons'));
  app.use('/api/schedule', require('./routes/schedule'));
  app.use('/api/time-entries', require('./routes/timeEntries'));
  app.use('/api/exemptions', require('./routes/exemptions'));
  app.use('/api/thresholds', require('./routes/thresholds'));
  app.use('/api/double-time', require('./routes/doubleTime'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/import', require('./routes/import'));

  // Database backup/download
  app.get('/api/backup', (req, res) => {
    // Simple auth check via cookie
    const token = req.cookies?.adminToken;
    if (!token) return res.status(401).json({ error: 'Auth required' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-backup-${new Date().toISOString().slice(0,10)}.sqlite"`);
    const fileStream = fs.createReadStream(DB_PATH);
    fileStream.pipe(res);
  });

  // Database restore/import
  app.post('/api/restore', express.raw({ type: 'application/octet-stream', limit: '100mb' }), (req, res) => {
    const token = req.cookies?.adminToken;
    if (!token) return res.status(401).json({ error: 'Auth required' });

    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate the uploaded file is a valid SQLite database
    // SQLite files start with the magic string "SQLite format 3\000"
    const SQLITE_MAGIC = 'SQLite format 3\0';
    const header = req.body.slice(0, 16).toString('ascii');
    if (header !== SQLITE_MAGIC) {
      return res.status(400).json({ error: 'Invalid file: not a SQLite database' });
    }

    try {
      // Create a backup of the current database before overwriting
      const backupPath = path.join(DATA_DIR, `attendance-pre-restore-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.sqlite`);
      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, backupPath);
      }

      // Write the uploaded database to disk
      fs.writeFileSync(DB_PATH, req.body);

      // Reload the in-memory database from the new file
      reloadDatabase();

      res.json({ success: true, message: 'Database restored successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to restore database: ' + err.message });
    }
  });

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));

    // SPA fallback
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start server
  app.listen(PORT, () => {
    console.log(`FRC Attendance Tracker running on port ${PORT}`);
    startAutoClockoutScheduler();
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
