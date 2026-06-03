import React, { useState } from 'react';
import { api } from '../utils/api';
import { BrandLockup } from '../components/Logo';

function SetupPage({ onComplete }) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [seasonName, setSeasonName] = useState('');
  const [seasonType, setSeasonType] = useState('build_season');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState([
    { day_of_week: 1, start_time: '18:00', end_time: '21:00', is_mandatory: true, enabled: true },
    { day_of_week: 2, start_time: '18:00', end_time: '21:00', is_mandatory: true, enabled: true },
    { day_of_week: 3, start_time: '18:00', end_time: '21:00', is_mandatory: true, enabled: true },
    { day_of_week: 4, start_time: '18:00', end_time: '21:00', is_mandatory: true, enabled: true },
    { day_of_week: 6, start_time: '09:00', end_time: '17:00', is_mandatory: true, enabled: true },
  ]);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  async function handleAdminSetup(e) {
    e.preventDefault();
    setError('');
    try {
      await api.setup(username, password);
      setStep(2);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSeasonSetup(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createSeason({
        name: seasonName,
        type: seasonType,
        start_date: startDate,
        end_date: endDate,
        is_active: true
      });
      setStep(3);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleScheduleSetup(e) {
    e.preventDefault();
    setError('');
    try {
      const { seasons } = await api.getSeasons();
      const activeSeason = seasons.find(s => s.is_active);
      if (!activeSeason) throw new Error('No active season');

      const defaults = schedule.filter(s => s.enabled).map(({ enabled, ...rest }) => rest);
      await api.setScheduleDefaults(activeSeason.id, defaults);
      await api.generateMeetings(activeSeason.id);

      // Create default Saturday double time rule
      if (seasonType === 'build_season') {
        await api.createDoubleTimeRule({
          season_id: activeSeason.id,
          day_of_week: 6,
          start_time: '09:00',
          end_time: '11:00',
          multiplier: 2.0,
          condition_type: 'clocked_in_before',
          condition_value: '09:00'
        });
      }

      onComplete();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen bg-kiosk-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-kiosk-surface rounded-xl p-8 shadow-2xl border-t-4 border-kiosk-accent">
        <BrandLockup size={38} variant="team" className="mb-4" />
        <h1 className="brand-heading text-3xl text-kiosk-text mb-1">Attendance Setup</h1>
        <p className="text-kiosk-muted mb-6">Initial Setup — Step {step} of 3</p>

        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4">{error}</div>}

        {step === 1 && (
          <form onSubmit={handleAdminSetup}>
            <h2 className="text-lg font-semibold text-kiosk-text mb-4">Create Admin Account</h2>
            <label className="block text-kiosk-muted text-sm mb-1">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text mb-4 focus:border-kiosk-accent focus:outline-none"
              required />
            <label className="block text-kiosk-muted text-sm mb-1">Password (min 6 characters)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text mb-6 focus:border-kiosk-accent focus:outline-none"
              required minLength={6} />
            <button type="submit" className="w-full bg-kiosk-accent text-white font-bold py-3 rounded-lg hover:bg-kiosk-accentHover transition-colors">
              Create Admin Account
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSeasonSetup}>
            <h2 className="text-lg font-semibold text-kiosk-text mb-4">Create First Season</h2>
            <label className="block text-kiosk-muted text-sm mb-1">Season Name</label>
            <input type="text" value={seasonName} onChange={e => setSeasonName(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text mb-4 focus:border-kiosk-accent focus:outline-none"
              placeholder="e.g., 2026 Build Season" required />
            <label className="block text-kiosk-muted text-sm mb-1">Type</label>
            <select value={seasonType} onChange={e => setSeasonType(e.target.value)}
              className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text mb-4 focus:border-kiosk-accent focus:outline-none">
              <option value="build_season">Build Season</option>
              <option value="off_season">Off Season</option>
            </select>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-kiosk-muted text-sm mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text focus:border-kiosk-accent focus:outline-none"
                  required />
              </div>
              <div>
                <label className="block text-kiosk-muted text-sm mb-1">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text focus:border-kiosk-accent focus:outline-none"
                  required />
              </div>
            </div>
            <button type="submit" className="w-full bg-kiosk-accent text-white font-bold py-3 rounded-lg hover:bg-kiosk-accentHover transition-colors">
              Create Season
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleScheduleSetup}>
            <h2 className="text-lg font-semibold text-kiosk-text mb-4">Default Weekly Schedule</h2>
            <div className="space-y-3 mb-6">
              {[0,1,2,3,4,5,6].map(dow => {
                const item = schedule.find(s => s.day_of_week === dow);
                const enabled = item?.enabled || false;
                return (
                  <div key={dow} className="flex items-center gap-3">
                    <label className="flex items-center gap-2 w-16 text-kiosk-text text-sm">
                      <input type="checkbox" checked={enabled}
                        onChange={e => {
                          if (enabled) {
                            setSchedule(schedule.filter(s => s.day_of_week !== dow));
                          } else {
                            setSchedule([...schedule, { day_of_week: dow, start_time: '18:00', end_time: '21:00', is_mandatory: true, enabled: true }]);
                          }
                        }}
                        className="accent-kiosk-accent" />
                      {dayNames[dow]}
                    </label>
                    {enabled && (
                      <>
                        <input type="time" value={item.start_time}
                          onChange={e => setSchedule(schedule.map(s => s.day_of_week === dow ? {...s, start_time: e.target.value} : s))}
                          className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1 text-kiosk-text text-sm focus:outline-none" />
                        <span className="text-kiosk-muted">—</span>
                        <input type="time" value={item.end_time}
                          onChange={e => setSchedule(schedule.map(s => s.day_of_week === dow ? {...s, end_time: e.target.value} : s))}
                          className="bg-kiosk-bg border border-slate-600 rounded px-2 py-1 text-kiosk-text text-sm focus:outline-none" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="submit" className="w-full bg-kiosk-accent text-white font-bold py-3 rounded-lg hover:bg-kiosk-accentHover transition-colors">
              Complete Setup
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default SetupPage;
