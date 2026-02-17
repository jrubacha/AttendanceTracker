import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Schedule() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [defaults, setDefaults] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [viewMonth, setViewMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventData, setEventData] = useState({ date: '', start_time: '18:00', end_time: '21:00', name: '', is_mandatory: true });
  const [doubleTimeRules, setDoubleTimeRules] = useState([]);
  const [showAddDT, setShowAddDT] = useState(false);
  const [dtData, setDtData] = useState({ day_of_week: 6, start_time: '09:00', end_time: '11:00', multiplier: 2.0, condition_type: '', condition_value: '' });
  const [message, setMessage] = useState('');

  useEffect(() => { loadSeasons(); }, []);
  useEffect(() => { if (selectedSeason) { loadDefaults(); loadMeetings(); loadDoubleTimeRules(); } }, [selectedSeason, viewMonth]);

  async function loadSeasons() {
    const { seasons: s } = await api.getSeasons();
    setSeasons(s);
    const active = s.find(x => x.is_active);
    if (active) setSelectedSeason(String(active.id));
    else if (s.length) setSelectedSeason(String(s[0].id));
  }

  async function loadDefaults() {
    try {
      const { defaults: d } = await api.getScheduleDefaults(selectedSeason);
      setDefaults(d);
    } catch { /* ignore */ }
  }

  async function loadMeetings() {
    try {
      const start = `${viewMonth}-01`;
      const end = `${viewMonth}-31`;
      const { meetings: m } = await api.getMeetings(selectedSeason, start, end);
      setMeetings(m);
    } catch { /* ignore */ }
  }

  async function loadDoubleTimeRules() {
    try {
      const { rules } = await api.getDoubleTimeRules(selectedSeason);
      setDoubleTimeRules(rules);
    } catch { /* ignore */ }
  }

  async function handleSaveDefaults(e) {
    e.preventDefault();
    try {
      await api.setScheduleDefaults(selectedSeason, defaults);
      setMessage('Schedule defaults saved');
      setTimeout(() => setMessage(''), 3000);
    } catch { /* ignore */ }
  }

  async function handleGenerate() {
    if (!window.confirm('This will regenerate all non-custom meetings for this season. Continue?')) return;
    try {
      const result = await api.generateMeetings(selectedSeason);
      setMessage(`Generated ${result.meetingsGenerated} meetings`);
      loadMeetings();
      setTimeout(() => setMessage(''), 3000);
    } catch (e) { setMessage(e.message); }
  }

  async function handleToggleCancelled(meetingId, current) {
    await api.updateMeeting(meetingId, { is_cancelled: !current });
    loadMeetings();
  }

  async function handleToggleMandatory(meetingId, current) {
    await api.updateMeeting(meetingId, { is_mandatory: !current });
    loadMeetings();
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    try {
      await api.createMeeting({ season_id: parseInt(selectedSeason), ...eventData });
      setShowAddEvent(false);
      setEventData({ date: '', start_time: '18:00', end_time: '21:00', name: '', is_mandatory: true });
      loadMeetings();
    } catch (err) { setMessage(err.message); }
  }

  async function handleDeleteMeeting(meetingId) {
    if (!window.confirm('Delete this meeting?')) return;
    await api.deleteMeeting(meetingId);
    loadMeetings();
  }

  async function handleAddDoubleTime(e) {
    e.preventDefault();
    try {
      await api.createDoubleTimeRule({ season_id: parseInt(selectedSeason), ...dtData });
      setShowAddDT(false);
      loadDoubleTimeRules();
    } catch (err) { setMessage(err.message); }
  }

  async function handleDeleteDTRule(ruleId) {
    await api.deleteDoubleTimeRule(ruleId);
    loadDoubleTimeRules();
  }

  function addDefault() {
    setDefaults([...defaults, { day_of_week: 1, start_time: '18:00', end_time: '21:00', is_mandatory: 1 }]);
  }

  function removeDefault(i) {
    setDefaults(defaults.filter((_, idx) => idx !== i));
  }

  function updateDefault(i, field, value) {
    setDefaults(defaults.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-kiosk-text">Schedule</h1>
        <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}
          className="bg-kiosk-surface border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {message && <div className="bg-blue-500/20 text-blue-400 p-3 rounded-lg mb-4 text-sm">{message}</div>}

      {/* Default schedule */}
      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-kiosk-text mb-4">Default Weekly Schedule</h2>
        <form onSubmit={handleSaveDefaults}>
          <div className="space-y-2 mb-4">
            {defaults.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <select value={d.day_of_week} onChange={e => updateDefault(i, 'day_of_week', parseInt(e.target.value))}
                  className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none w-32">
                  {DAY_NAMES.map((name, dow) => <option key={dow} value={dow}>{name}</option>)}
                </select>
                <input type="time" value={d.start_time} onChange={e => updateDefault(i, 'start_time', e.target.value)}
                  className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
                <span className="text-kiosk-muted">to</span>
                <input type="time" value={d.end_time} onChange={e => updateDefault(i, 'end_time', e.target.value)}
                  className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
                <label className="flex items-center gap-1 text-kiosk-muted text-xs">
                  <input type="checkbox" checked={!!d.is_mandatory} onChange={e => updateDefault(i, 'is_mandatory', e.target.checked ? 1 : 0)}
                    className="accent-kiosk-accent" /> Mandatory
                </label>
                <button type="button" onClick={() => removeDefault(i)} className="text-red-400 text-sm hover:text-red-300">Remove</button>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={addDefault} className="text-sm text-kiosk-accent hover:underline">+ Add Day</button>
            <button type="submit" className="bg-kiosk-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600">Save Defaults</button>
            <button type="button" onClick={handleGenerate} className="bg-kiosk-success text-white px-4 py-2 rounded-lg text-sm hover:bg-green-600">
              Generate Meetings
            </button>
          </div>
        </form>
      </div>

      {/* Double Time Rules */}
      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-kiosk-text">Double Time Rules</h2>
          <button onClick={() => setShowAddDT(!showAddDT)} className="text-sm text-kiosk-accent hover:underline">+ Add Rule</button>
        </div>
        {showAddDT && (
          <form onSubmit={handleAddDoubleTime} className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4 p-4 bg-kiosk-bg rounded-lg">
            <select value={dtData.day_of_week} onChange={e => setDtData({...dtData, day_of_week: parseInt(e.target.value)})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              {DAY_NAMES.map((name, dow) => <option key={dow} value={dow}>{name}</option>)}
            </select>
            <input type="time" value={dtData.start_time} onChange={e => setDtData({...dtData, start_time: e.target.value})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            <input type="time" value={dtData.end_time} onChange={e => setDtData({...dtData, end_time: e.target.value})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            <input type="number" step="0.5" min="1" value={dtData.multiplier} onChange={e => setDtData({...dtData, multiplier: parseFloat(e.target.value)})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" placeholder="Multiplier" />
            <select value={dtData.condition_type} onChange={e => setDtData({...dtData, condition_type: e.target.value})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              <option value="">No condition</option>
              <option value="clocked_in_before">Must clock in before</option>
            </select>
            {dtData.condition_type && (
              <input type="time" value={dtData.condition_value} onChange={e => setDtData({...dtData, condition_value: e.target.value})}
                className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            )}
            <button type="submit" className="bg-kiosk-success text-white px-4 py-1.5 rounded text-sm col-span-2 md:col-span-1">Add</button>
          </form>
        )}
        {doubleTimeRules.length === 0 ? (
          <p className="text-kiosk-muted text-sm">No double time rules configured.</p>
        ) : (
          <div className="space-y-2">
            {doubleTimeRules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between bg-kiosk-bg rounded-lg px-4 py-2">
                <span className="text-kiosk-text text-sm">
                  {DAY_NAMES[rule.day_of_week] || 'Any'} {rule.start_time}–{rule.end_time} ({rule.multiplier}x)
                  {rule.condition_type === 'clocked_in_before' && ` if clocked in before ${rule.condition_value}`}
                </span>
                <button onClick={() => handleDeleteDTRule(rule.id)} className="text-red-400 text-xs hover:text-red-300">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Meetings calendar/list */}
      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <h2 className="text-lg font-semibold text-kiosk-text">Meetings</h2>
          <div className="flex gap-3 items-center">
            <input type="month" value={viewMonth} onChange={e => setViewMonth(e.target.value)}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            <button onClick={() => setShowAddEvent(!showAddEvent)} className="bg-kiosk-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600">
              + Custom Event
            </button>
          </div>
        </div>

        {showAddEvent && (
          <form onSubmit={handleAddEvent} className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 p-4 bg-kiosk-bg rounded-lg">
            <input type="date" value={eventData.date} onChange={e => setEventData({...eventData, date: e.target.value})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
            <input type="time" value={eventData.start_time} onChange={e => setEventData({...eventData, start_time: e.target.value})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
            <input type="time" value={eventData.end_time} onChange={e => setEventData({...eventData, end_time: e.target.value})}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
            <input type="text" value={eventData.name} onChange={e => setEventData({...eventData, name: e.target.value})}
              placeholder="Event name" className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            <button type="submit" className="bg-kiosk-success text-white px-4 py-1.5 rounded text-sm">Create</button>
          </form>
        )}

        <div className="space-y-1 max-h-96 overflow-y-auto">
          {meetings.length === 0 ? (
            <p className="text-kiosk-muted text-sm py-4 text-center">No meetings this month.</p>
          ) : meetings.map(m => (
            <div key={m.id} className={`flex items-center justify-between px-4 py-2 rounded-lg ${m.is_cancelled ? 'bg-slate-800/50 line-through opacity-50' : 'bg-kiosk-bg'}`}>
              <div>
                <span className="text-kiosk-text text-sm">{m.date}</span>
                <span className="text-kiosk-muted text-sm ml-2">{m.start_time}–{m.end_time}</span>
                {m.name && <span className="text-kiosk-accent text-sm ml-2">{m.name}</span>}
                {m.is_custom ? <span className="text-purple-400 text-xs ml-2">[Custom]</span> : null}
                <span className={`text-xs ml-2 ${m.is_mandatory ? 'text-green-400' : 'text-yellow-400'}`}>
                  {m.is_mandatory ? 'Mandatory' : 'Optional'}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleToggleMandatory(m.id, m.is_mandatory)}
                  className="text-xs px-2 py-0.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
                  {m.is_mandatory ? 'Optional' : 'Mandatory'}
                </button>
                <button onClick={() => handleToggleCancelled(m.id, m.is_cancelled)}
                  className="text-xs px-2 py-0.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
                  {m.is_cancelled ? 'Restore' : 'Cancel'}
                </button>
                {m.is_custom && (
                  <button onClick={() => handleDeleteMeeting(m.id)}
                    className="text-xs px-2 py-0.5 border border-red-500/30 rounded text-red-400 hover:text-red-300">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Schedule;
