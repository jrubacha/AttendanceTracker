import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

function Seasons() {
  const [seasons, setSeasons] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'build_season', start_date: '', end_date: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { loadSeasons(); }, []);

  async function loadSeasons() {
    try {
      const { seasons: s } = await api.getSeasons();
      setSeasons(s);
    } catch { /* ignore */ }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createSeason({ ...form, is_active: seasons.length === 0 });
      setForm({ name: '', type: 'build_season', start_date: '', end_date: '' });
      setShowCreate(false);
      loadSeasons();
    } catch (err) { setError(err.message); }
  }

  async function handleSetActive(id) {
    try {
      await api.updateSeason(id, { is_active: true });
      loadSeasons();
    } catch { /* ignore */ }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this season and all its meetings? This cannot be undone.')) return;
    try {
      await api.deleteSeason(id);
      loadSeasons();
    } catch { /* ignore */ }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    try {
      await api.updateSeason(editing.id, editing);
      setEditing(null);
      loadSeasons();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="brand-heading text-3xl text-kiosk-text">Seasons</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="bg-kiosk-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-kiosk-accentHover transition-colors">
          + New Season
        </button>
      </div>

      {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-kiosk-text mb-4">Create Season</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">Name</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none" required />
            </div>
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none">
                <option value="build_season">Build Season</option>
                <option value="off_season">Off Season</option>
              </select>
            </div>
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none" required />
            </div>
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none" required />
            </div>
          </div>
          <button type="submit" className="bg-kiosk-success text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Create</button>
        </form>
      )}

      {editing && (
        <form onSubmit={handleUpdate} className="bg-kiosk-surface rounded-xl p-6 border border-kiosk-accent mb-6">
          <h2 className="text-lg font-semibold text-kiosk-text mb-4">Edit Season</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">Name</label>
              <input type="text" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none" />
            </div>
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">Type</label>
              <select value={editing.type} onChange={e => setEditing({...editing, type: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none">
                <option value="build_season">Build Season</option>
                <option value="off_season">Off Season</option>
              </select>
            </div>
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">Start Date</label>
              <input type="date" value={editing.start_date} onChange={e => setEditing({...editing, start_date: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none" />
            </div>
            <div>
              <label className="text-kiosk-muted text-sm block mb-1">End Date</label>
              <input type="date" value={editing.end_date} onChange={e => setEditing({...editing, end_date: e.target.value})}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-kiosk-accent text-white px-6 py-2 rounded-lg text-sm">Save</button>
            <button type="button" onClick={() => setEditing(null)} className="text-kiosk-muted text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {seasons.map(s => (
          <div key={s.id} className={`bg-kiosk-surface rounded-xl p-4 border ${s.is_active ? 'border-kiosk-accent' : 'border-slate-700'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-kiosk-text font-semibold">
                  {s.name}
                  {s.is_active && <span className="ml-2 text-xs text-kiosk-accent bg-kiosk-accent/20 px-2 py-0.5 rounded">Active</span>}
                </h3>
                <p className="text-kiosk-muted text-sm">
                  {s.type === 'build_season' ? 'Build Season' : 'Off Season'} | {s.start_date} to {s.end_date}
                </p>
              </div>
              <div className="flex gap-2">
                {!s.is_active && (
                  <button onClick={() => handleSetActive(s.id)}
                    className="text-xs px-3 py-1.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
                    Set Active
                  </button>
                )}
                <button onClick={() => setEditing({...s})}
                  className="text-xs px-3 py-1.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">Edit</button>
                <button onClick={() => handleDelete(s.id)}
                  className="text-xs px-3 py-1.5 border border-red-500/30 rounded text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {seasons.length === 0 && (
        <div className="text-center py-12 text-kiosk-muted">No seasons created yet.</div>
      )}
    </div>
  );
}

export default Seasons;
