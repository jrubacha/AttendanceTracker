import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATEGORIES = ['Meeting', 'Competition', 'Outreach'];
const CATEGORY_COLORS = {
  Meeting: '#3b82f6',     // blue
  Competition: '#f97316', // orange
  Outreach: '#a855f7',    // purple
};

// Local helpers (avoid timezone surprises by working with YYYY-MM-DD strings)
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}`; }

function Schedule() {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [meetings, setMeetings] = useState([]);
  const [viewMonth, setViewMonth] = useState(new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD'
  const [catFilter, setCatFilter] = useState('all');

  const [showGenerate, setShowGenerate] = useState(false);
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genSeason, setGenSeason] = useState('');
  const [genCategory, setGenCategory] = useState('Meeting');
  const [genDays, setGenDays] = useState([{ day_of_week: 1, start_time: '18:00', end_time: '21:00', is_mandatory: 1 }]);

  const [eventData, setEventData] = useState({ date: '', start_time: '18:00', end_time: '21:00', name: '', is_mandatory: true, season_id: '', category: 'Meeting' });
  const [showAddEvent, setShowAddEvent] = useState(false);

  const [doubleTimeRules, setDoubleTimeRules] = useState([]);
  const [showAddDT, setShowAddDT] = useState(false);
  const [dtMode, setDtMode] = useState('day_of_week');
  const [dtData, setDtData] = useState({ day_of_week: 6, start_time: '09:00', end_time: '11:00', multiplier: 2.0, condition_type: '', condition_value: '', specific_dates: '' });
  const [message, setMessage] = useState('');

  useEffect(() => { loadSeasons(); }, []);
  useEffect(() => { loadMeetings(); }, [viewMonth]);
  useEffect(() => { if (selectedSeason) loadDoubleTimeRules(); }, [selectedSeason]);

  async function loadSeasons() {
    const { seasons: s } = await api.getSeasons();
    setSeasons(s);
    const active = s.find(x => x.is_active);
    if (active) setSelectedSeason(String(active.id));
    else if (s.length) setSelectedSeason(String(s[0].id));
  }

  async function loadMeetings() {
    try {
      const start = `${viewMonth}-01`;
      const end = `${viewMonth}-31`;
      const { meetings: m } = await api.getMeetingsByRange(start, end);
      setMeetings(m);
    } catch { /* ignore */ }
  }

  async function loadDoubleTimeRules() {
    try {
      const { rules } = await api.getDoubleTimeRules(selectedSeason);
      setDoubleTimeRules(rules);
    } catch { /* ignore */ }
  }

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3500);
  }

  // ---- Generator ----
  function addGenDay() {
    setGenDays([...genDays, { day_of_week: 1, start_time: '18:00', end_time: '21:00', is_mandatory: 1 }]);
  }
  function removeGenDay(i) {
    setGenDays(genDays.filter((_, idx) => idx !== i));
  }
  function updateGenDay(i, field, value) {
    setGenDays(genDays.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (!genStart || !genEnd) { flash('Pick a start and end date'); return; }
    try {
      const result = await api.generateMeetingsRange({
        start_date: genStart,
        end_date: genEnd,
        season_id: genSeason ? parseInt(genSeason) : null,
        category: genCategory,
        days: genDays,
      });
      const skipNote = result.skipped ? ` (${result.skipped} skipped as duplicates)` : '';
      flash(`Generated ${result.meetingsGenerated} meetings${skipNote}`);
      loadMeetings();
    } catch (err) { flash(err.message); }
  }

  // ---- Meeting actions ----
  async function handleToggleCancelled(m) {
    await api.updateMeeting(m.id, { is_cancelled: !m.is_cancelled });
    loadMeetings();
  }
  async function handleToggleMandatory(m) {
    await api.updateMeeting(m.id, { is_mandatory: !m.is_mandatory });
    loadMeetings();
  }
  async function handleAssignSeason(m, seasonId) {
    await api.updateMeeting(m.id, { season_id: seasonId ? parseInt(seasonId) : null });
    loadMeetings();
  }
  async function handleSetCategory(m, category) {
    await api.updateMeeting(m.id, { category });
    loadMeetings();
  }
  async function handleDeleteMeeting(id) {
    if (!window.confirm('Delete this meeting?')) return;
    await api.deleteMeeting(id);
    loadMeetings();
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    try {
      await api.createMeeting({
        season_id: eventData.season_id ? parseInt(eventData.season_id) : null,
        date: eventData.date,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        name: eventData.name,
        is_mandatory: eventData.is_mandatory,
        category: eventData.category,
      });
      setShowAddEvent(false);
      setEventData({ date: '', start_time: '18:00', end_time: '21:00', name: '', is_mandatory: true, season_id: '', category: 'Meeting' });
      loadMeetings();
    } catch (err) { flash(err.message); }
  }

  // ---- Double time ----
  async function handleAddDoubleTime(e) {
    e.preventDefault();
    try {
      const payload = { season_id: parseInt(selectedSeason), start_time: dtData.start_time, end_time: dtData.end_time, multiplier: dtData.multiplier, condition_type: dtData.condition_type, condition_value: dtData.condition_value };
      if (dtMode === 'specific_dates') {
        payload.specific_dates = dtData.specific_dates;
        payload.day_of_week = null;
      } else {
        payload.day_of_week = dtData.day_of_week;
        payload.specific_dates = '';
      }
      await api.createDoubleTimeRule(payload);
      setShowAddDT(false);
      setDtData({ day_of_week: 6, start_time: '09:00', end_time: '11:00', multiplier: 2.0, condition_type: '', condition_value: '', specific_dates: '' });
      setDtMode('day_of_week');
      loadDoubleTimeRules();
    } catch (err) { flash(err.message); }
  }
  async function handleDeleteDTRule(ruleId) {
    await api.deleteDoubleTimeRule(ruleId);
    loadDoubleTimeRules();
  }

  // ---- Calendar layout ----
  const [yearStr, monthStr] = viewMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1; // 0-based
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const visibleMeetings = catFilter === 'all' ? meetings : meetings.filter(m => (m.category || 'Meeting') === catFilter);
  const meetingsByDate = {};
  for (const m of visibleMeetings) {
    (meetingsByDate[m.date] = meetingsByDate[m.date] || []).push(m);
  }

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function changeMonth(delta) {
    const base = new Date(year, month + delta, 1);
    setViewMonth(`${base.getFullYear()}-${pad(base.getMonth() + 1)}`);
    setSelectedDay(null);
  }

  function seasonName(id) {
    const s = seasons.find(x => String(x.id) === String(id));
    return s ? s.name : null;
  }

  function meetingChipClass(m) {
    if (m.is_cancelled) return 'bg-slate-700/60 text-slate-400 line-through';
    return m.is_mandatory ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300';
  }

  const selectedDayMeetings = selectedDay ? (meetingsByDate[selectedDay] || []) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="brand-heading text-3xl text-kiosk-text">Schedule</h1>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg overflow-hidden border border-slate-600">
            <button onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'calendar' ? 'bg-kiosk-accent text-white' : 'bg-kiosk-surface text-kiosk-muted hover:text-kiosk-text'}`}>
              Calendar
            </button>
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'list' ? 'bg-kiosk-accent text-white' : 'bg-kiosk-surface text-kiosk-muted hover:text-kiosk-text'}`}>
              List
            </button>
          </div>
          <button onClick={() => setShowGenerate(!showGenerate)}
            className="bg-kiosk-success text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700">
            Generate Meetings
          </button>
        </div>
      </div>

      {message && <div className="bg-kiosk-accent/15 border border-kiosk-accent/30 text-slate-200 p-3 rounded-lg mb-4 text-sm">{message}</div>}

      {/* Meeting generator */}
      {showGenerate && (
        <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-kiosk-text mb-1">Generate Meetings</h2>
          <p className="text-kiosk-muted text-xs mb-4">
            Pick a date range and the weekly time slots to create. Optionally tag them to a season. Existing meetings at the same date &amp; start time are skipped.
          </p>
          <form onSubmit={handleGenerate}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-kiosk-muted text-xs mb-1">Start Date</label>
                <input type="date" value={genStart} onChange={e => setGenStart(e.target.value)}
                  className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
              </div>
              <div>
                <label className="block text-kiosk-muted text-xs mb-1">End Date</label>
                <input type="date" value={genEnd} onChange={e => setGenEnd(e.target.value)}
                  className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
              </div>
              <div>
                <label className="block text-kiosk-muted text-xs mb-1">Tag to Season (optional)</label>
                <select value={genSeason} onChange={e => setGenSeason(e.target.value)}
                  className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
                  <option value="">No season</option>
                  {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-kiosk-muted text-xs mb-1">Category</label>
                <select value={genCategory} onChange={e => setGenCategory(e.target.value)}
                  className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <label className="block text-kiosk-muted text-xs mb-2">Weekly time slots</label>
            <div className="space-y-2 mb-4">
              {genDays.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3">
                  <select value={d.day_of_week} onChange={e => updateGenDay(i, 'day_of_week', parseInt(e.target.value))}
                    className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none w-32">
                    {DAY_NAMES.map((name, dow) => <option key={dow} value={dow}>{name}</option>)}
                  </select>
                  <input type="time" value={d.start_time} onChange={e => updateGenDay(i, 'start_time', e.target.value)}
                    className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
                  <span className="text-kiosk-muted">to</span>
                  <input type="time" value={d.end_time} onChange={e => updateGenDay(i, 'end_time', e.target.value)}
                    className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
                  <label className="flex items-center gap-1 text-kiosk-muted text-xs">
                    <input type="checkbox" checked={!!d.is_mandatory} onChange={e => updateGenDay(i, 'is_mandatory', e.target.checked ? 1 : 0)}
                      className="accent-kiosk-accent" /> Mandatory
                  </label>
                  {genDays.length > 1 && (
                    <button type="button" onClick={() => removeGenDay(i)} className="text-red-400 text-sm hover:text-red-300">Remove</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={addGenDay} className="text-sm text-kiosk-accent hover:underline">+ Add Day</button>
              <button type="submit" className="bg-kiosk-success text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">Generate</button>
            </div>
          </form>
        </div>
      )}

      {/* Meetings */}
      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <h2 className="text-lg font-semibold text-kiosk-text">Meetings</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => changeMonth(-1)} className="px-2 py-1 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text text-sm">‹</button>
            <input type="month" value={viewMonth} onChange={e => { setViewMonth(e.target.value); setSelectedDay(null); }}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            <button onClick={() => changeMonth(1)} className="px-2 py-1 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text text-sm">›</button>
            <button onClick={() => { setShowAddEvent(!showAddEvent); setEventData(d => ({ ...d, date: selectedDay || d.date })); }}
              className="bg-kiosk-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-kiosk-accentHover ml-2">
              + Custom Event
            </button>
          </div>
        </div>

        {showAddEvent && (
          <form onSubmit={handleAddEvent} className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-4 p-4 bg-kiosk-bg rounded-lg">
            <input type="date" value={eventData.date} onChange={e => setEventData({ ...eventData, date: e.target.value })}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
            <input type="time" value={eventData.start_time} onChange={e => setEventData({ ...eventData, start_time: e.target.value })}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
            <input type="time" value={eventData.end_time} onChange={e => setEventData({ ...eventData, end_time: e.target.value })}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
            <input type="text" value={eventData.name} onChange={e => setEventData({ ...eventData, name: e.target.value })}
              placeholder="Event name" className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
            <select value={eventData.category} onChange={e => setEventData({ ...eventData, category: e.target.value })}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={eventData.season_id} onChange={e => setEventData({ ...eventData, season_id: e.target.value })}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              <option value="">No season</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="submit" className="bg-kiosk-success text-white px-4 py-1.5 rounded text-sm">Create</button>
          </form>
        )}

        {viewMode === 'calendar' ? (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_ABBR.map(d => <div key={d} className="text-center text-kiosk-muted text-xs font-medium py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} className="min-h-[84px]" />;
                const dateStr = ymd(year, month, d);
                const dayMeetings = meetingsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDay;
                return (
                  <button key={i} onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                    className={`min-h-[84px] text-left p-1.5 rounded-lg border transition-colors ${
                      isSelected ? 'border-kiosk-accent bg-kiosk-bg' : 'border-slate-700 bg-kiosk-bg/40 hover:border-slate-500'
                    }`}>
                    <div className={`text-xs mb-1 ${isToday ? 'text-kiosk-accent font-bold' : 'text-kiosk-muted'}`}>{d}</div>
                    <div className="space-y-0.5">
                      {dayMeetings.slice(0, 3).map(m => (
                        <div key={m.id}
                          className={`text-[10px] px-1 py-0.5 rounded truncate border-l-2 ${meetingChipClass(m)}`}
                          style={{ borderLeftColor: CATEGORY_COLORS[m.category] || CATEGORY_COLORS.Meeting }}>
                          {m.start_time}{m.name ? ` ${m.name}` : ''}
                        </div>
                      ))}
                      {dayMeetings.length > 3 && (
                        <div className="text-[10px] text-kiosk-muted px-1">+{dayMeetings.length - 3} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDay && (
              <div className="mt-4 p-4 bg-kiosk-bg rounded-lg border border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-kiosk-text font-semibold">{selectedDay}</h3>
                  <button onClick={() => { setShowAddEvent(true); setEventData(d => ({ ...d, date: selectedDay })); }}
                    className="text-xs text-kiosk-accent hover:underline">+ Add event this day</button>
                </div>
                {selectedDayMeetings.length === 0 ? (
                  <p className="text-kiosk-muted text-sm">No meetings on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayMeetings.map(m => (
                      <MeetingRow key={m.id} m={m} seasons={seasons} seasonName={seasonName}
                        onToggleMandatory={handleToggleMandatory} onToggleCancelled={handleToggleCancelled}
                        onAssignSeason={handleAssignSeason} onSetCategory={handleSetCategory} onDelete={handleDeleteMeeting} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-1 max-h-[32rem] overflow-y-auto">
            {visibleMeetings.length === 0 ? (
              <p className="text-kiosk-muted text-sm py-4 text-center">No meetings this month.</p>
            ) : visibleMeetings.map(m => (
              <MeetingRow key={m.id} m={m} seasons={seasons} seasonName={seasonName} showDate
                onToggleMandatory={handleToggleMandatory} onToggleCancelled={handleToggleCancelled}
                onAssignSeason={handleAssignSeason} onDelete={handleDeleteMeeting} />
            ))}
          </div>
        )}
      </div>

      {/* Double Time Rules (season-scoped) */}
      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <h2 className="text-lg font-semibold text-kiosk-text">Double Time Rules</h2>
          <div className="flex gap-3 items-center">
            <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}
              className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => setShowAddDT(!showAddDT)} className="text-sm text-kiosk-accent hover:underline">+ Add Rule</button>
          </div>
        </div>
        {showAddDT && (
          <form onSubmit={handleAddDoubleTime} className="mb-4 p-4 bg-kiosk-bg rounded-lg space-y-3">
            <div className="flex gap-3 items-center">
              <label className="flex items-center gap-1 text-kiosk-muted text-sm">
                <input type="radio" name="dtMode" value="day_of_week" checked={dtMode === 'day_of_week'} onChange={() => setDtMode('day_of_week')} className="accent-kiosk-accent" />
                Recurring Day
              </label>
              <label className="flex items-center gap-1 text-kiosk-muted text-sm">
                <input type="radio" name="dtMode" value="specific_dates" checked={dtMode === 'specific_dates'} onChange={() => setDtMode('specific_dates')} className="accent-kiosk-accent" />
                Specific Date(s)
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {dtMode === 'day_of_week' ? (
                <select value={dtData.day_of_week} onChange={e => setDtData({ ...dtData, day_of_week: parseInt(e.target.value) })}
                  className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
                  {DAY_NAMES.map((name, dow) => <option key={dow} value={dow}>{name}</option>)}
                </select>
              ) : (
                <input type="text" value={dtData.specific_dates} onChange={e => setDtData({ ...dtData, specific_dates: e.target.value })}
                  placeholder="YYYY-MM-DD, YYYY-MM-DD"
                  className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none col-span-2 md:col-span-1" />
              )}
              <input type="time" value={dtData.start_time} onChange={e => setDtData({ ...dtData, start_time: e.target.value })}
                className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
              <input type="time" value={dtData.end_time} onChange={e => setDtData({ ...dtData, end_time: e.target.value })}
                className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
              <input type="number" step="0.5" min="1" value={dtData.multiplier} onChange={e => setDtData({ ...dtData, multiplier: parseFloat(e.target.value) })}
                className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" placeholder="Multiplier" />
              <select value={dtData.condition_type} onChange={e => setDtData({ ...dtData, condition_type: e.target.value })}
                className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
                <option value="">No condition</option>
                <option value="clocked_in_before">Must clock in before</option>
              </select>
              {dtData.condition_type && (
                <input type="time" value={dtData.condition_value} onChange={e => setDtData({ ...dtData, condition_value: e.target.value })}
                  className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
              )}
              <button type="submit" className="bg-kiosk-success text-white px-4 py-1.5 rounded text-sm col-span-2 md:col-span-1">Add</button>
            </div>
          </form>
        )}
        {doubleTimeRules.length === 0 ? (
          <p className="text-kiosk-muted text-sm">No double time rules configured.</p>
        ) : (
          <div className="space-y-2">
            {doubleTimeRules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between bg-kiosk-bg rounded-lg px-4 py-2">
                <span className="text-kiosk-text text-sm">
                  {rule.specific_dates ? rule.specific_dates : (DAY_NAMES[rule.day_of_week] || 'Any day')} {rule.start_time}–{rule.end_time} ({rule.multiplier}x)
                  {rule.condition_type === 'clocked_in_before' && ` if clocked in before ${rule.condition_value}`}
                </span>
                <button onClick={() => handleDeleteDTRule(rule.id)} className="text-red-400 text-xs hover:text-red-300">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// A single meeting row with inline controls, used in both the day detail and the list view.
function MeetingRow({ m, seasons, seasonName, showDate, onToggleMandatory, onToggleCancelled, onAssignSeason, onSetCategory, onDelete }) {
  const category = m.category || 'Meeting';
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg ${m.is_cancelled ? 'bg-slate-800/50 opacity-60' : 'bg-kiosk-surface'}`}>
      <div className={m.is_cancelled ? 'line-through' : ''}>
        {showDate && <span className="text-kiosk-text text-sm">{m.date}</span>}
        <span className="text-kiosk-muted text-sm ml-2">{m.start_time}–{m.end_time}</span>
        {m.name && <span className="text-kiosk-accent text-sm ml-2">{m.name}</span>}
        <span className="text-xs ml-2 px-1.5 py-0.5 rounded"
          style={{ backgroundColor: (CATEGORY_COLORS[category] || CATEGORY_COLORS.Meeting) + '22', color: CATEGORY_COLORS[category] || CATEGORY_COLORS.Meeting }}>
          {category}
        </span>
        {m.is_custom ? <span className="text-slate-300 text-xs ml-2">[Custom]</span> : null}
        {m.google_event_id ? <span className="text-slate-400 text-xs ml-2" title="Synced from Google Calendar">[Google]</span> : null}
        <span className={`text-xs ml-2 ${m.is_mandatory ? 'text-green-400' : 'text-yellow-400'}`}>
          {m.is_mandatory ? 'Mandatory' : 'Optional'}
        </span>
        {m.season_id && <span className="text-xs ml-2 text-slate-300">· {seasonName(m.season_id) || 'Season'}</span>}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={category} onChange={e => onSetCategory(m, e.target.value)}
          title="Category"
          className="bg-kiosk-bg border border-slate-600 rounded text-xs px-1.5 py-0.5 text-kiosk-muted focus:outline-none">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={m.season_id || ''} onChange={e => onAssignSeason(m, e.target.value)}
          title="Assign season"
          className="bg-kiosk-bg border border-slate-600 rounded text-xs px-1.5 py-0.5 text-kiosk-muted focus:outline-none">
          <option value="">No season</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={() => onToggleMandatory(m)}
          className="text-xs px-2 py-0.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
          {m.is_mandatory ? 'Make Optional' : 'Make Mandatory'}
        </button>
        <button onClick={() => onToggleCancelled(m)}
          className="text-xs px-2 py-0.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
          {m.is_cancelled ? 'Restore' : 'Cancel'}
        </button>
        <button onClick={() => onDelete(m.id)}
          className="text-xs px-2 py-0.5 border border-red-500/30 rounded text-red-400 hover:text-red-300">Delete</button>
      </div>
    </div>
  );
}

export default Schedule;
