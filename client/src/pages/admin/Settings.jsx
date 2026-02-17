import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

function Settings() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [thresholds, setThresholds] = useState([]);
  const [message, setMessage] = useState('');

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

      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-kiosk-text mb-2">About</h2>
        <p className="text-kiosk-muted text-sm">FRC Attendance Tracker v1.0.0</p>
        <p className="text-kiosk-muted text-sm">Offline-first PWA for tracking FRC team attendance.</p>
      </div>
    </div>
  );
}

export default Settings;
