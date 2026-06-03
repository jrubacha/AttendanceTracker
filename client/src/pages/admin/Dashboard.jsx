import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';

function Dashboard() {
  const navigate = useNavigate();
  const [report, setReport] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [season, setSeason] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('all');
  const [dateRangeEnabled, setDateRangeEnabled] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) loadDashboard(selectedSeason);
  }, [selectedSeason]);

  async function loadSeasons() {
    try {
      const { seasons: s } = await api.getSeasons();
      setSeasons(s);
      const active = s.find(x => x.is_active);
      if (active) setSelectedSeason(String(active.id));
      else if (s.length > 0) setSelectedSeason(String(s[0].id));
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadDashboard(seasonId, dateRange) {
    setLoading(true);
    try {
      const data = await api.getDashboard(seasonId, dateRange);
      setReport(data.report);
      setThresholds(data.thresholds);
      setSeason(data.season);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function applyDateRange() {
    if (startDate && endDate && selectedSeason) {
      loadDashboard(selectedSeason, { startDate, endDate });
    }
  }

  function clearDateRange() {
    setDateRangeEnabled(false);
    setStartDate('');
    setEndDate('');
    if (selectedSeason) loadDashboard(selectedSeason);
  }

  function sort(data) {
    return [...data].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const filtered = report.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'below60') return s.percentage < 60;
    if (filter === 'below80') return s.percentage < 80;
    if (filter === 'above80') return s.percentage >= 80;
    return true;
  });

  const sorted = sort(filtered);
  const SortArrow = ({ field }) => sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  if (loading && !report.length) {
    return <div className="text-kiosk-muted">Loading dashboard...</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="brand-heading text-3xl text-kiosk-text">Dashboard</h1>
        <div className="flex gap-3 items-center">
          <select value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}
            className="bg-kiosk-surface border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-kiosk-surface border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
            <option value="all">All Students</option>
            <option value="below60">Below 60%</option>
            <option value="below80">Below 80%</option>
            <option value="above80">80%+</option>
          </select>
        </div>
      </div>

      <div className="bg-kiosk-surface rounded-xl p-4 border border-slate-700 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-kiosk-text cursor-pointer">
            <input type="checkbox" checked={dateRangeEnabled}
              onChange={e => {
                setDateRangeEnabled(e.target.checked);
                if (!e.target.checked) clearDateRange();
              }}
              className="rounded border-slate-600 bg-slate-700 text-kiosk-accent focus:ring-kiosk-accent" />
            Custom Date Range
          </label>
          {dateRangeEnabled && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-1.5 text-kiosk-text text-sm focus:outline-none focus:border-kiosk-accent" />
              <span className="text-kiosk-muted text-sm">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-1.5 text-kiosk-text text-sm focus:outline-none focus:border-kiosk-accent" />
              <button onClick={applyDateRange} disabled={!startDate || !endDate}
                className="bg-kiosk-accent text-white px-4 py-1.5 rounded-lg text-sm hover:bg-kiosk-accentHover disabled:opacity-50 disabled:cursor-not-allowed">
                Apply
              </button>
              <button onClick={clearDateRange}
                className="text-kiosk-muted hover:text-kiosk-text text-sm underline">
                Reset
              </button>
            </>
          )}
        </div>
        {dateRangeEnabled && startDate && endDate && (
          <p className="text-xs text-kiosk-accent mt-2">
            Showing attendance from {startDate} to {endDate}
          </p>
        )}
      </div>

      {season && season.type === 'off_season' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-3 rounded-lg mb-4 text-sm">
          Off-season: Attendance percentages are shown for reference but thresholds do not apply.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-700">
              <th className="p-3 text-kiosk-muted cursor-pointer hover:text-kiosk-text" onClick={() => toggleSort('name')}>
                Name{SortArrow({ field: 'name' })}
              </th>
              <th className="p-3 text-kiosk-muted cursor-pointer hover:text-kiosk-text text-right" onClick={() => toggleSort('totalCredited')}>
                Total Hrs{SortArrow({ field: 'totalCredited' })}
              </th>
              <th className="p-3 text-kiosk-muted cursor-pointer hover:text-kiosk-text text-right hidden md:table-cell" onClick={() => toggleSort('mandatoryHoursAttended')}>
                Mandatory{SortArrow({ field: 'mandatoryHoursAttended' })}
              </th>
              <th className="p-3 text-kiosk-muted cursor-pointer hover:text-kiosk-text text-right" onClick={() => toggleSort('percentage')}>
                %{SortArrow({ field: 'percentage' })}
              </th>
              <th className="p-3 text-kiosk-muted text-right hidden lg:table-cell">Bonus</th>
              <th className="p-3 text-kiosk-muted text-center hidden md:table-cell">Status</th>
              <th className="p-3 text-kiosk-muted text-right hidden lg:table-cell" onClick={() => toggleSort('autoClockoutCount')}>
                Auto-CO
              </th>
              <th className="p-3 text-kiosk-muted text-right hidden lg:table-cell">Late</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(student => (
              <tr key={student.id}
                className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/admin/students/${student.id}`)}>
                <td className="p-3 text-kiosk-text font-medium">
                  {student.name}
                  {student.hasAutoClockoutWarning && <span className="ml-2 text-kiosk-warning" title="3+ auto clock-outs">⚠</span>}
                </td>
                <td className="p-3 text-right text-kiosk-text">{student.totalCredited}</td>
                <td className="p-3 text-right text-kiosk-muted hidden md:table-cell">{student.mandatoryHoursAttended}/{student.mandatoryHoursAvailable}</td>
                <td className="p-3 text-right font-bold" style={{ color: student.thresholdColor }}>
                  {student.percentage}%
                </td>
                <td className="p-3 text-right text-kiosk-muted hidden lg:table-cell">{student.bonusHours}</td>
                <td className="p-3 text-center hidden md:table-cell">
                  <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: student.thresholdColor + '20', color: student.thresholdColor }}>
                    {student.thresholdName}
                  </span>
                </td>
                <td className="p-3 text-right text-kiosk-muted hidden lg:table-cell">
                  {student.autoClockoutCount}
                </td>
                <td className="p-3 text-right text-kiosk-muted hidden lg:table-cell">{student.lateCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-12 text-kiosk-muted">
          {report.length === 0 ? 'No students added yet.' : 'No students match the current filter.'}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
