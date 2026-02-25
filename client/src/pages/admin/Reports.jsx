import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';

function Reports() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [restoreStatus, setRestoreStatus] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      const { seasons: s } = await api.getSeasons();
      setSeasons(s);
      const active = s.find(x => x.is_active);
      if (active) setSelectedSeason(String(active.id));
      else if (s.length) setSelectedSeason(String(s[0].id));
    }
    load();
  }, []);

  function handleExport(detailed) {
    const url = api.exportCsv(selectedSeason, detailed);
    window.open(url, '_blank');
  }

  function handleBackup() {
    window.open('/api/backup', '_blank');
  }

  async function handleRestore(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('This will replace your entire database with the uploaded file. A backup of the current database will be saved automatically. Continue?')) {
      fileInputRef.current.value = '';
      return;
    }

    setRestoring(true);
    setRestoreStatus(null);
    try {
      const result = await api.restoreDatabase(file);
      setRestoreStatus({ success: true, message: result.message });
    } catch (err) {
      setRestoreStatus({ success: false, message: err.message });
    } finally {
      setRestoring(false);
      fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-kiosk-text mb-6">Reports & Export</h1>

      <div className="mb-6">
        <label className="text-kiosk-muted text-sm block mb-1">Season</label>
        <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}
          className="bg-kiosk-surface border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-kiosk-text mb-2">Summary CSV</h2>
          <p className="text-kiosk-muted text-sm mb-4">
            Export a summary of all student attendance data including hours, percentages, and flags.
          </p>
          <button onClick={() => handleExport(false)}
            className="bg-kiosk-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 w-full">
            Download Summary CSV
          </button>
        </div>

        <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-kiosk-text mb-2">Detailed CSV</h2>
          <p className="text-kiosk-muted text-sm mb-4">
            Export every clock-in/out entry with timestamps, meeting associations, and all flags.
          </p>
          <button onClick={() => handleExport(true)}
            className="bg-kiosk-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 w-full">
            Download Detailed CSV
          </button>
        </div>

        <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-kiosk-text mb-2">Database Backup</h2>
          <p className="text-kiosk-muted text-sm mb-4">
            Download the raw SQLite database file for safekeeping or migration.
          </p>
          <button onClick={handleBackup}
            className="bg-kiosk-warning text-black px-4 py-2 rounded-lg text-sm hover:bg-yellow-400 w-full font-medium">
            Download Database
          </button>
        </div>

        <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-kiosk-text mb-2">Database Restore</h2>
          <p className="text-kiosk-muted text-sm mb-4">
            Upload a previously exported SQLite database file to restore from a backup.
          </p>
          <input ref={fileInputRef} type="file" accept=".sqlite,.db" onChange={handleRestore}
            className="hidden" id="restore-file" />
          <button onClick={() => fileInputRef.current?.click()} disabled={restoring}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-500 w-full font-medium disabled:opacity-50">
            {restoring ? 'Restoring...' : 'Upload & Restore Database'}
          </button>
          {restoreStatus && (
            <p className={`text-sm mt-3 ${restoreStatus.success ? 'text-green-400' : 'text-red-400'}`}>
              {restoreStatus.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Reports;
