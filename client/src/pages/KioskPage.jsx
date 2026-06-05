import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { BrandLockup } from '../components/Logo';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

function KioskPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [student, setStudent] = useState(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [activeEntry, setActiveEntry] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayMeetings, setTodayMeetings] = useState([]);
  const [autoReturn, setAutoReturn] = useState(null);
  // Out-of-hours work note flow
  const [noteEntryId, setNoteEntryId] = useState(null);
  const [clockOutSummary, setClockOutSummary] = useState('');
  const [workNote, setWorkNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  // Exemption request modal
  const [exemptionOpen, setExemptionOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    loadTodayMeetings();
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => { if (autoReturn) clearTimeout(autoReturn); };
  }, [autoReturn]);

  async function loadTodayMeetings() {
    try {
      const { meetings } = await api.getTodayMeetings();
      setTodayMeetings(meetings);
    } catch { /* offline or no meetings */ }
  }

  function resetToHome() {
    setStudent(null);
    setClockedIn(false);
    setActiveEntry(null);
    setMessage('');
    setError('');
    setPin('');
    setFlash('');
    setNoteEntryId(null);
    setClockOutSummary('');
    setWorkNote('');
    setSavingNote(false);
  }

  function scheduleAutoReturn() {
    const timeout = setTimeout(resetToHome, 3000);
    setAutoReturn(timeout);
  }

  const handleKey = useCallback(async (key) => {
    if (student || exemptionOpen) return; // Already showing student view / modal open

    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    if (key === '') return;

    const newPin = pin + key;
    setPin(newPin);
    setError('');

    if (newPin.length === 4) {
      try {
        const result = await api.verifyPin(newPin);
        setStudent(result.student);
        setClockedIn(result.clockedIn);
        setActiveEntry(result.activeEntry);
      } catch {
        setError('PIN not found');
        setTimeout(() => { setPin(''); setError(''); }, 1500);
      }
    }
  }, [pin, student, exemptionOpen]);

  // Accept keyboard input for PIN entry and Enter for clock in/out
  useEffect(() => {
    function handleKeyDown(e) {
      if (exemptionOpen || noteEntryId) return; // modal / note box handles its own input
      if (e.key >= '0' && e.key <= '9') {
        handleKey(e.key);
      } else if (e.key === 'Backspace') {
        handleKey('⌫');
      } else if (e.key === 'Enter' && student && !message) {
        if (clockedIn) {
          handleClockOut();
        } else {
          handleClockIn();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKey, student, message, clockedIn, exemptionOpen, noteEntryId]);

  async function handleClockIn() {
    try {
      const result = await api.clockIn(student.id);
      setMessage(result.message);
      setFlash('flash-green');
      scheduleAutoReturn();
    } catch (e) {
      setError(e.message);
      scheduleAutoReturn();
    }
  }

  async function handleClockOut() {
    try {
      const result = await api.clockOut(student.id);
      const dur = result.duration;
      const summary = `${result.message} (${dur.hours}h ${dur.minutes}m)`;
      setFlash('flash-red');
      if (result.requiresNote && result.entry?.id) {
        // Clocked out outside of normal meeting hours -> ask what they did.
        setClockOutSummary(summary);
        setNoteEntryId(result.entry.id);
      } else {
        setMessage(summary);
        scheduleAutoReturn();
      }
    } catch (e) {
      setError(e.message);
      scheduleAutoReturn();
    }
  }

  async function handleSubmitNote() {
    if (!workNote.trim() || savingNote) return;
    setSavingNote(true);
    setError('');
    try {
      await api.submitWorkNote(noteEntryId, workNote);
      setNoteEntryId(null);
      setMessage('Thanks! Your note was saved.');
      scheduleAutoReturn();
    } catch (e) {
      setError(e.message);
      setSavingNote(false);
    }
  }

  function getElapsedTime() {
    if (!activeEntry) return '';
    const clockIn = new Date(activeEntry.clock_in);
    const diff = Math.floor((currentTime - clockIn) / 60000);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  }

  const formatTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const formatDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className={`min-h-screen bg-kiosk-bg flex flex-col items-center justify-center p-4 ${flash}`}>
      {/* Brand bar */}
      <div className="w-full max-w-lg mb-5">
        <div className="flex justify-between items-center">
          <BrandLockup size={34} variant="app" />
          <button
            onClick={() => navigate('/admin/login')}
            className="text-kiosk-muted text-xs px-3 py-1.5 rounded border border-slate-700 hover:border-kiosk-accent hover:text-kiosk-text transition-colors"
          >
            Admin
          </button>
        </div>
        <div className="brand-rule mt-3" />
        <div className="flex items-end justify-between mt-3">
          <div>
            <div className="text-4xl font-bold text-kiosk-text tabular-nums">{formatTime(currentTime)}</div>
            <div className="text-kiosk-muted text-sm">{formatDate(currentTime)}</div>
          </div>
          {todayMeetings.length > 0 && (
            <div className="text-right text-kiosk-accent text-sm font-medium">
              <span className="text-kiosk-muted">Today</span><br />
              {todayMeetings.map(m => `${m.start_time} – ${m.end_time}`).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="w-full max-w-lg">
        {!student ? (
          /* PIN Entry */
          <div>
            <div className="text-center mb-6">
              <h1 className="brand-heading text-4xl text-kiosk-text mb-2">Enter Your PIN</h1>
              {error && <div className="text-kiosk-danger text-lg font-semibold">{error}</div>}
            </div>

            {/* PIN display */}
            <div className="flex justify-center gap-3 mb-8">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-14 h-16 rounded-md border-2 flex items-center justify-center text-3xl font-bold transition-colors
                  ${pin.length > i ? 'border-kiosk-accent bg-kiosk-surface text-kiosk-text shadow-accent' : 'border-slate-600 text-transparent'}`}>
                  {pin[i] ? '●' : ''}
                </div>
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {KEYS.map((key, i) => (
                <button
                  key={i}
                  onClick={() => handleKey(key)}
                  disabled={key === ''}
                  className={`h-16 rounded-lg text-2xl font-bold transition-all active:scale-95 border border-slate-700
                    ${key === '' ? 'invisible' : ''}
                    ${key === '⌫'
                      ? 'bg-slate-800 text-kiosk-muted hover:bg-slate-700'
                      : 'bg-kiosk-surface text-kiosk-text hover:border-kiosk-accent hover:bg-slate-700 active:bg-kiosk-accent active:border-kiosk-accent'
                    }`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Exemption request */}
            <div className="text-center mt-6">
              <button
                onClick={() => setExemptionOpen(true)}
                className="text-kiosk-muted text-sm underline hover:text-kiosk-accent transition-colors"
              >
                Request a meeting exemption
              </button>
            </div>
          </div>
        ) : noteEntryId ? (
          /* Out-of-hours work note (required before returning home) */
          <div className="text-center">
            <h2 className="brand-heading text-3xl text-kiosk-text mb-1">Clocked Out</h2>
            <p className="text-kiosk-muted mb-4">{clockOutSummary}</p>
            <p className="text-kiosk-text mb-3">
              You were here outside of normal meeting hours. Please tell us what you were working on:
            </p>
            <textarea
              value={workNote}
              onChange={e => { setWorkNote(e.target.value); setError(''); }}
              rows={4}
              autoFocus
              placeholder="e.g. CAD work on the intake, organizing the shop, programming..."
              className="w-full rounded-lg bg-kiosk-surface border border-slate-600 text-kiosk-text p-3 text-lg
                focus:border-kiosk-accent focus:outline-none resize-none"
            />
            {error && <div className="mt-2 text-kiosk-danger">{error}</div>}
            <button
              onClick={handleSubmitNote}
              disabled={!workNote.trim() || savingNote}
              className="w-full max-w-xs mx-auto mt-4 h-16 bg-kiosk-success text-white text-xl font-bold rounded-xl
                hover:bg-green-700 active:scale-95 transition-all brand-heading tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingNote ? 'Saving...' : 'Submit'}
            </button>
          </div>
        ) : message ? (
          /* Confirmation */
          <div className="text-center">
            <div className={`text-5xl mb-4 ${flash === 'flash-red' ? 'text-kiosk-accent' : 'text-kiosk-success'}`}>✓</div>
            <div className="brand-heading text-3xl text-kiosk-text">{message}</div>
          </div>
        ) : (
          /* Clock In/Out */
          <div className="text-center">
            {clockedIn ? (
              <>
                <h2 className="brand-heading text-4xl text-kiosk-text mb-2">Hi {student.name}!</h2>
                <p className="text-kiosk-muted text-lg mb-6">You've been here {getElapsedTime()}</p>
                <button
                  onClick={handleClockOut}
                  className="w-full max-w-xs mx-auto h-20 bg-kiosk-danger text-white text-2xl font-bold rounded-xl
                    hover:bg-kiosk-accentHover active:scale-95 transition-all brand-heading tracking-wider"
                >
                  Clock Out
                </button>
              </>
            ) : (
              <>
                <h2 className="brand-heading text-4xl text-kiosk-text mb-2">Welcome, {student.name}!</h2>
                <p className="text-kiosk-muted text-lg mb-6">Ready to clock in?</p>
                <button
                  onClick={handleClockIn}
                  className="w-full max-w-xs mx-auto h-20 bg-kiosk-success text-white text-2xl font-bold rounded-xl
                    hover:bg-green-700 active:scale-95 transition-all brand-heading tracking-wider"
                >
                  Clock In
                </button>
              </>
            )}
            <button
              onClick={resetToHome}
              className="mt-4 text-kiosk-muted underline text-sm"
            >
              Cancel
            </button>
            {error && <div className="mt-4 text-kiosk-danger">{error}</div>}
          </div>
        )}
      </div>

      {exemptionOpen && (
        <ExemptionModal onClose={() => setExemptionOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exemption request modal: PIN -> pick a meeting -> reason -> submit
// ---------------------------------------------------------------------------
function ExemptionModal({ onClose }) {
  const [step, setStep] = useState('pin'); // 'pin' | 'form' | 'done'
  const [pin, setPin] = useState('');
  const [student, setStudent] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePinKey(key) {
    if (loading) return;
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return; }
    if (key === '') return;
    const newPin = pin + key;
    if (newPin.length > 4) return;
    setPin(newPin);
    setError('');
    if (newPin.length === 4) {
      setLoading(true);
      try {
        const result = await api.verifyPin(newPin);
        setStudent(result.student);
        const { meetings: m } = await api.getRequestableMeetings();
        setMeetings(m);
        setStep('form');
      } catch {
        setError('PIN not found');
        setTimeout(() => { setPin(''); setError(''); }, 1500);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSubmit() {
    if (!selectedMeeting || !reason.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await api.requestExemption(pin, selectedMeeting, reason);
      setStep('done');
      setTimeout(onClose, 4000);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const fmtMeeting = (m) => {
    const d = new Date(`${m.date}T00:00:00`);
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const label = m.name ? ` · ${m.name}` : '';
    return `${day} · ${m.start_time}–${m.end_time}${label}`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-kiosk-bg border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="brand-heading text-2xl text-kiosk-text">Meeting Exemption</h2>
          <button onClick={onClose} className="text-kiosk-muted hover:text-kiosk-text text-2xl leading-none">×</button>
        </div>

        {step === 'pin' && (
          <div>
            <p className="text-kiosk-muted text-sm text-center mb-4">Enter your PIN to continue</p>
            <div className="flex justify-center gap-3 mb-6">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-12 h-14 rounded-md border-2 flex items-center justify-center text-2xl font-bold
                  ${pin.length > i ? 'border-kiosk-accent bg-kiosk-surface text-kiosk-text' : 'border-slate-600 text-transparent'}`}>
                  {pin[i] ? '●' : ''}
                </div>
              ))}
            </div>
            {error && <div className="text-kiosk-danger text-center mb-3">{error}</div>}
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {KEYS.map((key, i) => (
                <button
                  key={i}
                  onClick={() => handlePinKey(key)}
                  disabled={key === '' || loading}
                  className={`h-14 rounded-lg text-2xl font-bold transition-all active:scale-95 border border-slate-700
                    ${key === '' ? 'invisible' : ''}
                    ${key === '⌫'
                      ? 'bg-slate-800 text-kiosk-muted hover:bg-slate-700'
                      : 'bg-kiosk-surface text-kiosk-text hover:border-kiosk-accent hover:bg-slate-700'
                    }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'form' && (
          <div>
            <p className="text-kiosk-text mb-1">Hi {student?.name}!</p>
            <p className="text-kiosk-muted text-sm mb-4">
              Select the meeting you'll miss. Requests must be made more than 24 hours in advance.
            </p>

            {meetings.length === 0 ? (
              <p className="text-kiosk-muted text-center py-6">No upcoming meetings are eligible for a request right now.</p>
            ) : (
              <div className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
                {meetings.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMeeting(m.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors
                      ${selectedMeeting === m.id
                        ? 'border-kiosk-accent bg-kiosk-accent/15 text-kiosk-text'
                        : 'border-slate-700 bg-kiosk-surface text-kiosk-muted hover:text-kiosk-text hover:border-slate-500'}`}
                  >
                    {fmtMeeting(m)}
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              rows={3}
              placeholder="Why won't you be able to attend?"
              className="w-full rounded-lg bg-kiosk-surface border border-slate-600 text-kiosk-text p-3
                focus:border-kiosk-accent focus:outline-none resize-none mb-3"
            />
            {error && <div className="text-kiosk-danger text-center mb-3">{error}</div>}
            <button
              onClick={handleSubmit}
              disabled={!selectedMeeting || !reason.trim() || submitting}
              className="w-full h-14 bg-kiosk-accent text-white text-lg font-bold rounded-xl
                hover:bg-kiosk-accentHover active:scale-95 transition-all brand-heading tracking-wider
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-6">
            <div className="text-5xl text-kiosk-success mb-4">✓</div>
            <div className="brand-heading text-2xl text-kiosk-text mb-2">Request Submitted</div>
            <p className="text-kiosk-muted">Your coach will review it and approve or deny the request.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default KioskPage;
