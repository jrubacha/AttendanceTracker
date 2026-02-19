const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { initialize, DB_PATH, DATA_DIR } = require('./database');
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
