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
  }

  function scheduleAutoReturn() {
    const timeout = setTimeout(resetToHome, 3000);
    setAutoReturn(timeout);
  }

  const handleKey = useCallback(async (key) => {
    if (student) return; // Already showing student view

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
  }, [pin, student]);

  // Accept keyboard input for PIN entry and Enter for clock in/out
  useEffect(() => {
    function handleKeyDown(e) {
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
  }, [handleKey, student, message, clockedIn]);

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
      setMessage(`${result.message} (${dur.hours}h ${dur.minutes}m)`);
      setFlash('flash-red');
      scheduleAutoReturn();
    } catch (e) {
      setError(e.message);
      scheduleAutoReturn();
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
    </div>
  );
}

export default KioskPage;
