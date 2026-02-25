import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

function Settings() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [thresholds, setThresholds] = useState([]);
  const [message, setMessage] = useState('');

  // Import state
  const [importCsv, setImportCsv] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => { loadSeasons(); }, []);
  useEffect(() => { if (selectedSeason) loadThresholds(); }, [selectedSeason]);

  async function loadSeasons() {
    const { seasons: s } = await api.getSeasons();
    setSeasons(s);
    const active = s.find(x => x.is_active);
    if (active) setSelectedSeason(String(active.id));
    else if (s.length) setSelectedSeason(String(s[0].id));
  }

  async function loadThresholds() {
    try {
      const { thresholds: t } = await api.getThresholds(selectedSeason);
      setThresholds(t.length > 0 ? t : [
        { name: 'Travel Minimum', percentage: 60, color: '#eab308', sort_order: 1 },
        { name: 'Drive Team Minimum', percentage: 80, color: '#22c55e', sort_order: 2 }
      ]);
    } catch { /* ignore */ }
  }

  function addThreshold() {
    setThresholds([...thresholds, { name: '', percentage: 0, color: '#3b82f6', sort_order: thresholds.length }]);
  }

  function removeThreshold(i) {
    setThresholds(thresholds.filter((_, idx) => idx !== i));
  }

  function updateThreshold(i, field, value) {
    setThresholds(thresholds.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      await api.setThresholds(selectedSeason, thresholds);
      setMessage('Thresholds saved');
      setTimeout(() => setMessage(''), 3000);
    } catch { /* ignore */ }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    setImportError('');
    const reader = new FileReader();
    reader.onload = (ev) => setImportCsv(ev.target.result);
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!importCsv.trim()) return;
    setImporting(true);
    setImportResult(null);
    setImportError('');
    try {
      const result = await api.importAttendance(importCsv);
      setImportResult(result);
    } catch (err) {
      setImportError(err.message || 'Import failed');
    }
    setImporting(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-kiosk-text mb-6">Settings</h1>

      {message && <div className="bg-green-500/20 text-green-400 p-3 rounded-lg mb-4 text-sm">{message}</div>}

      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-kiosk-text">Attendance Thresholds</h2>
          <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}
            className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <form onSubmit={handleSave}>
          <div className="space-y-3 mb-4">
            {thresholds.map((t, i) => (
              <div key={i} className="flex items-center gap-3 flex-wrap">
                <input type="text" value={t.name} onChange={e => updateThreshold(i, 'name', e.target.value)}
                  placeholder="Threshold name" className="bg-kiosk-bg border border-slate-600 rounded px-3 py-2 text-kiosk-text text-sm focus:outline-none flex-1 min-w-[150px]" />
                <div className="flex items-center gap-1">
                  <input type="number" value={t.percentage} onChange={e => updateThreshold(i, 'percentage', parseFloat(e.target.value))}
                    className="bg-kiosk-bg border border-slate-600 rounded px-3 py-2 text-kiosk-text text-sm focus:outline-none w-20" min="0" max="100" step="1" />
                  <span className="text-kiosk-muted text-sm">%</span>
                </div>
                <input type="color" value={t.color} onChange={e => updateThreshold(i, 'color', e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                <button type="button" onClick={() => removeThreshold(i)}
                  className="text-red-400 text-sm hover:text-red-300">Remove</button>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={addThreshold} className="text-sm text-kiosk-accent hover:underline">+ Add Threshold</button>
            <button type="submit" className="bg-kiosk-accent text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-600">Save Thresholds</button>
          </div>
        </form>
      </div>

      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-kiosk-text mb-2">Import Attendance</h2>
        <p className="text-kiosk-muted text-sm mb-4">
          Upload a CSV file with columns: <span className="text-kiosk-text">Name, Date, Time In, Time Out</span>.
          Students are matched by name. Time Out is optional.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block mb-2">
              <span className="sr-only">Choose CSV file</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFileSelect}
                className="block w-full text-sm text-kiosk-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-kiosk-accent file:text-white hover:file:bg-blue-600 file:cursor-pointer" />
            </label>
            {importFileName && <p className="text-kiosk-muted text-xs mt-1">Selected: {importFileName}</p>}
          </div>

          {importCsv && (
            <div>
              <p className="text-kiosk-muted text-xs mb-1">Preview (first 5 lines):</p>
              <pre className="bg-kiosk-bg border border-slate-600 rounded-lg p-3 text-xs text-kiosk-muted overflow-x-auto max-h-32">
                {importCsv.split('\n').slice(0, 6).join('\n')}
              </pre>
            </div>
          )}

          <button onClick={handleImport} disabled={!importCsv.trim() || importing}
            className="bg-kiosk-accent text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {importing ? 'Importing...' : 'Import'}
          </button>

          {importError && (
            <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm">{importError}</div>
          )}

          {importResult && (
            <div className="space-y-2">
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg text-sm">
                Imported {importResult.imported} of {importResult.totalRows} rows.
              </div>
              {importResult.skipped.length > 0 && (
                <div className="bg-yellow-500/20 text-yellow-400 p-3 rounded-lg text-sm">
                  <p className="font-semibold mb-1">Skipped ({importResult.skipped.length}):</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    {importResult.skipped.map((s, i) => (
                      <li key={i}>Row {s.line}: {s.name ? `"${s.name}"` : ''} - {s.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm">
                  <p className="font-semibold mb-1">Errors ({importResult.errors.length}):</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>Row {e.line}: {e.name ? `"${e.name}"` : ''} - {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-kiosk-text mb-2">About</h2>
        <p className="text-kiosk-muted text-sm">FRC Attendance Tracker v1.0.0</p>
        <p className="text-kiosk-muted text-sm">Offline-first PWA for tracking FRC team attendance.</p>
      </div>
    </div>
  );
}

export default Settings;
