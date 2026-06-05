const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(url, config);
  } catch {
    throw new Error('Could not reach the server. Is the backend running?');
  }
  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res;
  }
  // Read as text first so an empty or non-JSON body (e.g. the dev proxy when the
  // backend is down, or a crash page) produces a clear message instead of
  // "Unexpected end of JSON input".
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? 'The server returned an unexpected (non-JSON) response.'
        : `Server error ${res.status}. The backend may be down or restarting.`
    );
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Auth
  getSetupStatus: () => request('/auth/setup-status'),
  setup: (username, password) => request('/auth/setup', { method: 'POST', body: { username, password } }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getSession: () => request('/auth/session'),

  // Students
  verifyPin: (pin) => request('/students/verify-pin', { method: 'POST', body: { pin } }),
  getStudents: (includeArchived = false, role) => {
    let url = `/students?includeArchived=${includeArchived}`;
    if (role) url += `&role=${role}`;
    return request(url);
  },
  getStudent: (id) => request(`/students/${id}`),
  createStudent: (data) => request('/students', { method: 'POST', body: data }),
  updateStudent: (id, data) => request(`/students/${id}`, { method: 'PUT', body: data }),
  regeneratePin: (id, pin) => request(`/students/${id}/regenerate-pin`, { method: 'POST', body: { pin } }),
  deleteStudent: (id, confirm) => request(`/students/${id}?confirm=${confirm}`, { method: 'DELETE' }),

  // Seasons
  getSeasons: () => request('/seasons'),
  getActiveSeason: () => request('/seasons/active'),
  createSeason: (data) => request('/seasons', { method: 'POST', body: data }),
  updateSeason: (id, data) => request(`/seasons/${id}`, { method: 'PUT', body: data }),
  deleteSeason: (id) => request(`/seasons/${id}`, { method: 'DELETE' }),

  // Schedule
  getScheduleDefaults: (seasonId) => request(`/schedule/defaults/${seasonId}`),
  setScheduleDefaults: (seasonId, defaults) => request(`/schedule/defaults/${seasonId}`, { method: 'POST', body: { defaults } }),
  generateMeetings: (seasonId) => request(`/schedule/generate/${seasonId}`, { method: 'POST' }),
  generateMeetingsRange: (data) => request('/schedule/generate-meetings', { method: 'POST', body: data }),
  assignSeasonToRange: (data) => request('/schedule/assign-season', { method: 'POST', body: data }),
  getMeetings: (seasonId, start, end) => {
    let url = `/schedule/meetings/${seasonId}`;
    if (start && end) url += `?start=${start}&end=${end}`;
    return request(url);
  },
  getMeetingsByRange: (start, end, seasonId) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (seasonId) params.set('season_id', seasonId);
    return request(`/schedule/meetings?${params.toString()}`);
  },
  getTodayMeetings: () => request('/schedule/today'),
  createMeeting: (data) => request('/schedule/meetings', { method: 'POST', body: data }),
  updateMeeting: (id, data) => request(`/schedule/meetings/${id}`, { method: 'PUT', body: data }),
  deleteMeeting: (id) => request(`/schedule/meetings/${id}`, { method: 'DELETE' }),

  // Time Entries
  clockIn: (student_id) => request('/time-entries/clock-in', { method: 'POST', body: { student_id } }),
  clockOut: (student_id) => request('/time-entries/clock-out', { method: 'POST', body: { student_id } }),
  submitWorkNote: (entryId, note) => request(`/time-entries/${entryId}/work-note`, { method: 'POST', body: { note } }),
  getStudentEntries: (studentId, seasonId) => request(`/time-entries/student/${studentId}?seasonId=${seasonId || ''}`),
  createManualEntry: (data) => request('/time-entries/manual', { method: 'POST', body: data }),
  updateEntry: (id, data) => request(`/time-entries/${id}`, { method: 'PUT', body: data }),
  deleteEntry: (id) => request(`/time-entries/${id}`, { method: 'DELETE' }),
  toggleAttendance: (student_id, meeting_id) => request('/time-entries/toggle-attendance', { method: 'POST', body: { student_id, meeting_id } }),

  // Exemptions
  getStudentExemptions: (studentId, seasonId) => request(`/exemptions/student/${studentId}?seasonId=${seasonId || ''}`),
  toggleExemption: (student_id, meeting_id, reason) => request('/exemptions/toggle', { method: 'POST', body: { student_id, meeting_id, reason } }),

  // Exemption requests
  getRequestableMeetings: () => request('/exemptions/requestable-meetings'),
  requestExemption: (pin, meeting_id, reason) => request('/exemptions/request', { method: 'POST', body: { pin, meeting_id, reason } }),
  getExemptionRequests: (status) => request(`/exemptions/requests${status ? `?status=${status}` : ''}`),
  getPendingRequestCount: () => request('/exemptions/requests/pending-count'),
  approveExemptionRequest: (id) => request(`/exemptions/requests/${id}/approve`, { method: 'POST' }),
  denyExemptionRequest: (id) => request(`/exemptions/requests/${id}/deny`, { method: 'POST' }),

  // Thresholds
  getThresholds: (seasonId) => request(`/thresholds/${seasonId}`),
  setThresholds: (seasonId, thresholds) => request(`/thresholds/${seasonId}`, { method: 'POST', body: { thresholds } }),

  // Double Time
  getDoubleTimeRules: (seasonId) => request(`/double-time/${seasonId}`),
  createDoubleTimeRule: (data) => request('/double-time', { method: 'POST', body: data }),
  updateDoubleTimeRule: (id, data) => request(`/double-time/${id}`, { method: 'PUT', body: data }),
  deleteDoubleTimeRule: (id) => request(`/double-time/${id}`, { method: 'DELETE' }),

  // Reports
  getDashboard: (seasonId, dateRange) => {
    let url = `/reports/dashboard/${seasonId}`;
    if (dateRange?.startDate && dateRange?.endDate) {
      url += `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }
    return request(url);
  },
  getMyReport: (pin, seasonId) => request('/reports/my-report', { method: 'POST', body: { pin, seasonId } }),
  getStudentReport: (studentId, seasonId, dateRange) => {
    let url = `/reports/student/${studentId}/${seasonId}`;
    if (dateRange?.startDate && dateRange?.endDate) {
      url += `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }
    return request(url);
  },
  exportCsv: (seasonId, detailed = false, dateRange) => {
    let url = `${API_BASE}/reports/export/${seasonId}?detailed=${detailed}`;
    if (dateRange?.startDate && dateRange?.endDate) {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }
    return url;
  },

  // Import
  importAttendance: (csv) => request('/import/attendance', { method: 'POST', body: { csv } }),

  // Settings & Google Calendar
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: data }),
  syncGoogleCalendar: () => request('/settings/google-sync', { method: 'POST' }),

  // Database restore
  restoreDatabase: (file) => fetch(`${API_BASE}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  }).then(async res => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Restore failed');
    return data;
  }),
};
