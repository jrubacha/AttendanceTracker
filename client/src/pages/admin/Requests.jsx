import React, { useState, useEffect } from 'react';

import { api } from '../../utils/api';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'all', label: 'All' },
];

const STATUS_STYLES = {
  pending: 'bg-kiosk-warning/20 text-kiosk-warning',
  approved: 'bg-kiosk-success/20 text-kiosk-success',
  denied: 'bg-kiosk-danger/20 text-kiosk-danger',
};

function Requests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    loadRequests();
  }, [filter]);

  async function loadRequests() {
    setError('');
    try {
      const { requests: r } = await api.getExemptionRequests(filter === 'all' ? undefined : filter);
      setRequests(r);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleApprove(id) {
    setBusyId(id);
    try {
      await api.approveExemptionRequest(id);
      await loadRequests();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeny(id) {
    setBusyId(id);
    try {
      await api.denyExemptionRequest(id);
      await loadRequests();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const fmtMeeting = (r) => {
    const d = new Date(`${r.date}T00:00:00`);
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    return `${day} · ${r.start_time}–${r.end_time}${r.meeting_name ? ` · ${r.meeting_name}` : ''}`;
  };
  const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="brand-heading text-3xl text-kiosk-text">Exemption Requests</h1>
        <div className="flex gap-1 bg-kiosk-surface rounded-lg p-1 border border-slate-700">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                filter === f.value ? 'bg-kiosk-accent text-white' : 'text-kiosk-muted hover:text-kiosk-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-kiosk-danger mb-4">{error}</div>}

      {requests.length === 0 ? (
        <div className="text-kiosk-muted text-center py-16 bg-kiosk-surface rounded-xl border border-slate-700">
          No {filter === 'all' ? '' : filter} requests.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-kiosk-surface rounded-xl border border-slate-700 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-kiosk-text font-semibold text-lg">{r.student_name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs uppercase tracking-wide ${STATUS_STYLES[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-kiosk-accent text-sm mt-1">{fmtMeeting(r)}</div>
                  <div className="text-kiosk-text mt-2 whitespace-pre-wrap">{r.reason || <span className="text-kiosk-muted italic">No reason given</span>}</div>
                  <div className="text-kiosk-muted text-xs mt-2">
                    Requested {fmtDate(r.created_at)}
                    {r.reviewed_at && ` · Reviewed ${fmtDate(r.reviewed_at)}`}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {r.status !== 'approved' && (
                    <button
                      onClick={() => handleApprove(r.id)}
                      disabled={busyId === r.id}
                      className="px-4 py-2 rounded-lg bg-kiosk-success text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {r.status !== 'denied' && (
                    <button
                      onClick={() => handleDeny(r.id)}
                      disabled={busyId === r.id}
                      className="px-4 py-2 rounded-lg border border-slate-600 text-kiosk-muted text-sm font-semibold hover:text-kiosk-danger hover:border-kiosk-danger disabled:opacity-50"
                    >
                      {r.status === 'approved' ? 'Revoke' : 'Deny'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Requests;
