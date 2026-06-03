import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';

function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [report, setReport] = useState(null);
  const [season, setSeason] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [meetingDetails, setMeetingDetails] = useState([]);
  const [entries, setEntries] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editHoursAdj, setEditHoursAdj] = useState(0);
  const [editAvailableAdj, setEditAvailableAdj] = useState(0);
  const [newPin, setNewPin] = useState(null);
  const [showSetPin, setShowSetPin] = useState(false);
  const [customPin, setCustomPin] = useState('');
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [manualClockIn, setManualClockIn] = useState('');
  const [manualClockOut, setManualClockOut] = useState('');
  const [manualMeeting, setManualMeeting] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadSeasons();
    loadStudent();
  }, [id]);

  useEffect(() => {
    if (selectedSeason) loadReport();
  }, [selectedSeason, id]);

  async function loadStudent() {
    try {
      const { student: s } = await api.getStudent(id);
      setStudent(s);
      setEditName(s.name);
      setEditNotes(s.notes || '');
      setEditHoursAdj(s.hours_adjustment || 0);
      setEditAvailableAdj(s.available_hours_adjustment || 0);
    } catch { navigate('/admin/students'); }
  }

  async function loadSeasons() {
    const { seasons: s } = await api.getSeasons();
    setSeasons(s);
    const active = s.find(x => x.is_active);
    if (active) setSelectedSeason(String(active.id));
    else if (s.length) setSelectedSeason(String(s[0].id));
  }

  async function loadReport() {
    try {
      const data = await api.getStudentReport(id, selectedSeason);
      setReport(data.attendance);
      setSeason(data.season);
      setMeetingDetails(data.meetingDetails);
      setEntries(data.entries);
      setThresholds(data.thresholds);
    } catch { /* ignore */ }
  }

  async function handleSaveEdit() {
    try {
      await api.updateStudent(id, {
        name: editName,
        notes: editNotes,
        hours_adjustment: parseFloat(editHoursAdj) || 0,
        available_hours_adjustment: parseFloat(editAvailableAdj) || 0,
      });
      setEditing(false);
      loadStudent();
      if (selectedSeason) loadReport();
    } catch (e) { setError(e.message); }
  }

  async function handleRegenPin() {
    try {
      const { pin } = await api.regeneratePin(id);
      setNewPin(pin);
    } catch (e) { setError(e.message); }
  }

  async function handleSetCustomPin(e) {
    e.preventDefault();
    try {
      const { pin } = await api.regeneratePin(id, customPin);
      setNewPin(pin);
      setCustomPin('');
      setShowSetPin(false);
      loadStudent();
    } catch (e) { setError(e.message); }
  }

  async function handleToggleExemption(meetingId) {
    try {
      await api.toggleExemption(parseInt(id), meetingId);
      loadReport();
    } catch { /* ignore */ }
  }

  async function handleAddManualEntry(e) {
    e.preventDefault();
    try {
      await api.createManualEntry({
        student_id: parseInt(id),
        meeting_id: manualMeeting ? parseInt(manualMeeting) : null,
        clock_in: manualClockIn,
        clock_out: manualClockOut || null
      });
      setShowAddEntry(false);
      setManualClockIn('');
      setManualClockOut('');
      setManualMeeting('');
      loadReport();
    } catch (e) { setError(e.message); }
  }

  function startEditEntry(entry) {
    setEditingEntry(entry.id);
    // Convert "YYYY-MM-DD HH:mm:ss" to "YYYY-MM-DDTHH:mm" for datetime-local input
    setEditClockIn(entry.clock_in ? entry.clock_in.replace(' ', 'T').slice(0, 16) : '');
    setEditClockOut(entry.clock_out ? entry.clock_out.replace(' ', 'T').slice(0, 16) : '');
  }

  async function handleSaveEntry(entryId) {
    try {
      await api.updateEntry(entryId, {
        clock_in: editClockIn.replace('T', ' ') + ':00',
        clock_out: editClockOut ? editClockOut.replace('T', ' ') + ':00' : null,
      });
      setEditingEntry(null);
      loadReport();
    } catch (e) { setError(e.message); }
  }

  async function handleDeleteEntry(entryId) {
    if (!window.confirm('Delete this time entry?')) return;
    try {
      await api.deleteEntry(entryId);
      loadReport();
    } catch { /* ignore */ }
  }

  async function handleToggleAttendance(meetingId) {
    try {
      await api.toggleAttendance(parseInt(id), meetingId);
      loadReport();
    } catch { /* ignore */ }
  }

  if (!student) return <div className="text-kiosk-muted">Loading...</div>;

  return (
    <div>
      <button onClick={() => navigate('/admin/students')} className="text-kiosk-muted text-sm hover:text-kiosk-text mb-4 block">
        &larr; Back to Students
      </button>

      {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Student info card */}
      <div className="bg-kiosk-surface rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            {editing ? (
              <div className="space-y-3">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-xl font-bold focus:outline-none" />
                <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes"
                  className="block bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none w-full" />
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="text-kiosk-muted text-xs block mb-1">Hours Adjustment</label>
                    <input type="number" step="0.5" value={editHoursAdj} onChange={e => setEditHoursAdj(e.target.value)}
                      className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none w-32" />
                  </div>
                  <div>
                    <label className="text-kiosk-muted text-xs block mb-1">Available Hours Adjustment</label>
                    <input type="number" step="0.5" value={editAvailableAdj} onChange={e => setEditAvailableAdj(e.target.value)}
                      className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none w-32" />
                  </div>
                </div>
                <p className="text-kiosk-muted text-xs">Adjustments add to (or subtract from) the calculated totals for this student.</p>
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} className="bg-kiosk-success text-white px-4 py-1 rounded text-sm">Save</button>
                  <button onClick={() => setEditing(false)} className="text-kiosk-muted text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="brand-heading text-3xl text-kiosk-text">{student.name}</h1>
                <p className="text-kiosk-muted text-sm">PIN ending: {student.pin_last4}</p>
                {student.notes && <p className="text-kiosk-muted text-sm mt-1">{student.notes}</p>}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(!editing)} className="text-xs px-3 py-1.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
              Edit
            </button>
            <button onClick={handleRegenPin} className="text-xs px-3 py-1.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
              Random PIN
            </button>
            <button onClick={() => setShowSetPin(!showSetPin)} className="text-xs px-3 py-1.5 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
              Set PIN
            </button>
          </div>
        </div>
        {showSetPin && (
          <form onSubmit={handleSetCustomPin} className="mt-4 flex items-center gap-3">
            <input type="text" value={customPin} onChange={e => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4-digit PIN" maxLength={4} pattern="\d{4}"
              className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-lg font-mono w-32 focus:outline-none" required />
            <button type="submit" disabled={customPin.length !== 4}
              className="bg-kiosk-success text-white px-4 py-2 rounded text-sm disabled:opacity-50">Assign PIN</button>
            <button type="button" onClick={() => { setShowSetPin(false); setCustomPin(''); }}
              className="text-kiosk-muted text-sm">Cancel</button>
          </form>
        )}
        {newPin && (
          <div className="mt-4 bg-green-500/20 text-green-400 p-3 rounded-lg">
            New PIN: <span className="text-2xl font-mono font-bold">{newPin}</span>
            <span className="text-xs ml-2 opacity-75">Write this down.</span>
          </div>
        )}
      </div>

      {/* Season selector */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}
          className="bg-kiosk-surface border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={() => setShowAddEntry(!showAddEntry)}
          className="bg-kiosk-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-kiosk-accentHover">
          + Manual Entry
        </button>
      </div>

      {/* Manual entry form */}
      {showAddEntry && (
        <form onSubmit={handleAddManualEntry} className="bg-kiosk-surface rounded-xl p-4 border border-slate-700 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-kiosk-muted text-xs block mb-1">Clock In *</label>
            <input type="datetime-local" value={manualClockIn} onChange={e => setManualClockIn(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" required />
          </div>
          <div>
            <label className="text-kiosk-muted text-xs block mb-1">Clock Out</label>
            <input type="datetime-local" value={manualClockOut} onChange={e => setManualClockOut(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-kiosk-muted text-xs block mb-1">Meeting</label>
            <select value={manualMeeting} onChange={e => setManualMeeting(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded px-2 py-1.5 text-kiosk-text text-sm focus:outline-none">
              <option value="">None (Open Hours)</option>
              {meetingDetails.filter(m => !m.is_cancelled).map(m => (
                <option key={m.id} value={m.id}>{m.date} {m.start_time}-{m.end_time}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="bg-kiosk-success text-white px-4 py-1.5 rounded text-sm">Add Entry</button>
          </div>
        </form>
      )}

      {/* Attendance summary */}
      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="bg-kiosk-surface rounded-xl p-4 border border-slate-700">
              <div className="text-kiosk-muted text-xs">Attendance</div>
              <div className="text-2xl font-bold text-kiosk-text">{report.percentage}%</div>
            </div>
            <div className="bg-kiosk-surface rounded-xl p-4 border border-slate-700">
              <div className="text-kiosk-muted text-xs">Total Hours</div>
              <div className="text-2xl font-bold text-kiosk-text">{report.totalCredited}</div>
            </div>
            <div className="bg-kiosk-surface rounded-xl p-4 border border-slate-700">
              <div className="text-kiosk-muted text-xs">Mandatory</div>
              <div className="text-2xl font-bold text-kiosk-text">{report.mandatoryHoursAttended} / {report.mandatoryHoursAvailable}</div>
            </div>
            <div className="bg-kiosk-surface rounded-xl p-4 border border-slate-700">
              <div className="text-kiosk-muted text-xs">Bonus Hours</div>
              <div className="text-2xl font-bold text-kiosk-text">{report.bonusHours}</div>
            </div>
            <div className="bg-kiosk-surface rounded-xl p-4 border border-slate-700">
              <div className="text-kiosk-muted text-xs">Late / Auto-CO</div>
              <div className="text-2xl font-bold text-kiosk-text">{report.lateCount} / {report.autoClockoutCount}</div>
            </div>
          </div>
          {(report.hoursAdjustment !== 0 || report.availableHoursAdjustment !== 0) && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-3 rounded-lg mb-6 text-xs">
              Manual adjustments active:
              {report.hoursAdjustment !== 0 && <span className="ml-2">Hours {report.hoursAdjustment > 0 ? '+' : ''}{report.hoursAdjustment}h</span>}
              {report.availableHoursAdjustment !== 0 && <span className="ml-2">Available {report.availableHoursAdjustment > 0 ? '+' : ''}{report.availableHoursAdjustment}h</span>}
            </div>
          )}
        </>
      )}

      {/* Meeting attendance list */}
      <div className="bg-kiosk-surface rounded-xl border border-slate-700 overflow-hidden mb-6">
        <h3 className="p-4 text-kiosk-text font-semibold border-b border-slate-700">Meeting Attendance</h3>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-kiosk-surface">
              <tr className="border-b border-slate-700">
                <th className="p-2 text-left text-kiosk-muted">Date</th>
                <th className="p-2 text-left text-kiosk-muted">Time</th>
                <th className="p-2 text-center text-kiosk-muted">Status</th>
                <th className="p-2 text-center text-kiosk-muted">Exempt</th>
              </tr>
            </thead>
            <tbody>
              {meetingDetails.map(m => {
                const statusColors = {
                  present: 'text-green-400',
                  absent: 'text-red-400',
                  exempt: 'text-kiosk-warning',
                  cancelled: 'text-slate-500',
                  'optional-attended': 'text-slate-300'
                };
                return (
                  <tr key={m.id} className="border-b border-slate-800">
                    <td className="p-2 text-kiosk-text">{m.date}</td>
                    <td className="p-2 text-kiosk-muted">{m.start_time}–{m.end_time}</td>
                    <td className={`p-2 text-center capitalize ${statusColors[m.status] || 'text-kiosk-muted'}`}>
                      {!m.is_cancelled && !m.isExempt && m.date <= new Date().toISOString().slice(0, 10) ? (
                        <button
                          onClick={() => handleToggleAttendance(m.id)}
                          className="hover:underline cursor-pointer"
                          title={m.attended ? 'Click to mark absent' : 'Click to mark present'}
                        >
                          {m.status}{m.wasLate ? ' (late)' : ''}{m.wasAutoClockout ? ' (auto-co)' : ''}
                        </button>
                      ) : (
                        <>{m.status}{m.wasLate ? ' (late)' : ''}{m.wasAutoClockout ? ' (auto-co)' : ''}</>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {!m.is_cancelled && m.is_mandatory && (
                        <button onClick={() => handleToggleExemption(m.id)}
                          className={`px-2 py-0.5 rounded text-xs ${m.isExempt ? 'bg-kiosk-warning/20 text-kiosk-warning' : 'border border-slate-600 text-kiosk-muted hover:text-kiosk-text'}`}>
                          {m.isExempt ? 'Exempted' : 'Exempt'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time entries */}
      <div className="bg-kiosk-surface rounded-xl border border-slate-700 overflow-hidden">
        <h3 className="p-4 text-kiosk-text font-semibold border-b border-slate-700">Time Entries</h3>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-kiosk-surface">
              <tr className="border-b border-slate-700">
                <th className="p-2 text-left text-kiosk-muted">Clock In</th>
                <th className="p-2 text-left text-kiosk-muted">Clock Out</th>
                <th className="p-2 text-kiosk-muted text-center">Flags</th>
                <th className="p-2 text-right text-kiosk-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-slate-800">
                  {editingEntry === e.id ? (
                    <>
                      <td className="p-2">
                        <input type="datetime-local" value={editClockIn} onChange={ev => setEditClockIn(ev.target.value)}
                          className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1 text-kiosk-text text-xs focus:outline-none w-full" />
                      </td>
                      <td className="p-2">
                        <input type="datetime-local" value={editClockOut} onChange={ev => setEditClockOut(ev.target.value)}
                          className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1 text-kiosk-text text-xs focus:outline-none w-full" />
                      </td>
                      <td className="p-2 text-center">
                        {e.is_late ? <span className="text-yellow-400 text-xs mr-1">Late</span> : null}
                        {e.is_auto_clockout ? <span className="text-orange-400 text-xs">Auto-CO</span> : null}
                      </td>
                      <td className="p-2 text-right space-x-2">
                        <button onClick={() => handleSaveEntry(e.id)}
                          className="text-xs text-green-400 hover:text-green-300">Save</button>
                        <button onClick={() => setEditingEntry(null)}
                          className="text-xs text-kiosk-muted hover:text-kiosk-text">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2 text-kiosk-text">{new Date(e.clock_in).toLocaleString()}</td>
                      <td className="p-2 text-kiosk-text">{e.clock_out ? new Date(e.clock_out).toLocaleString() : '—'}</td>
                      <td className="p-2 text-center">
                        {e.is_late ? <span className="text-yellow-400 text-xs mr-1">Late</span> : null}
                        {e.is_auto_clockout ? <span className="text-orange-400 text-xs">Auto-CO</span> : null}
                      </td>
                      <td className="p-2 text-right space-x-2">
                        <button onClick={() => startEditEntry(e)}
                          className="text-xs text-kiosk-accent hover:text-kiosk-accentHover">Edit</button>
                        <button onClick={() => handleDeleteEntry(e.id)}
                          className="text-xs text-red-400 hover:text-red-300">Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default StudentDetail;
