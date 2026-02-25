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

  const res = await fetch(url, config);
  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res;
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
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
  getStudents: (includeArchived = false) => request(`/students?includeArchived=${includeArchived}`),
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
  getMeetings: (seasonId, start, end) => {
    let url = `/schedule/meetings/${seasonId}`;
    if (start && end) url += `?start=${start}&end=${end}`;
    return request(url);
  },
  getTodayMeetings: () => request('/schedule/today'),
  createMeeting: (data) => request('/schedule/meetings', { method: 'POST', body: data }),
  updateMeeting: (id, data) => request(`/schedule/meetings/${id}`, { method: 'PUT', body: data }),
  deleteMeeting: (id) => request(`/schedule/meetings/${id}`, { method: 'DELETE' }),

  // Time Entries
  clockIn: (student_id) => request('/time-entries/clock-in', { method: 'POST', body: { student_id } }),
  clockOut: (student_id) => request('/time-entries/clock-out', { method: 'POST', body: { student_id } }),
  getStudentEntries: (studentId, seasonId) => request(`/time-entries/student/${studentId}?seasonId=${seasonId || ''}`),
  createManualEntry: (data) => request('/time-entries/manual', { method: 'POST', body: data }),
  updateEntry: (id, data) => request(`/time-entries/${id}`, { method: 'PUT', body: data }),
  deleteEntry: (id) => request(`/time-entries/${id}`, { method: 'DELETE' }),
  toggleAttendance: (student_id, meeting_id) => request('/time-entries/toggle-attendance', { method: 'POST', body: { student_id, meeting_id } }),

  // Exemptions
  getStudentExemptions: (studentId, seasonId) => request(`/exemptions/student/${studentId}?seasonId=${seasonId || ''}`),
  toggleExemption: (student_id, meeting_id, reason) => request('/exemptions/toggle', { method: 'POST', body: { student_id, meeting_id, reason } }),

  // Thresholds
  getThresholds: (seasonId) => request(`/thresholds/${seasonId}`),
  setThresholds: (seasonId, thresholds) => request(`/thresholds/${seasonId}`, { method: 'POST', body: { thresholds } }),

  // Double Time
  getDoubleTimeRules: (seasonId) => request(`/double-time/${seasonId}`),
  createDoubleTimeRule: (data) => request('/double-time', { method: 'POST', body: data }),
  updateDoubleTimeRule: (id, data) => request(`/double-time/${id}`, { method: 'PUT', body: data }),
  deleteDoubleTimeRule: (id) => request(`/double-time/${id}`, { method: 'DELETE' }),

  // Reports
  getDashboard: (seasonId) => request(`/reports/dashboard/${seasonId}`),
  getStudentReport: (studentId, seasonId) => request(`/reports/student/${studentId}/${seasonId}`),
  exportCsv: (seasonId, detailed = false) => `${API_BASE}/reports/export/${seasonId}?detailed=${detailed}`,

  // Import
  importAttendance: (csv) => request('/import/attendance', { method: 'POST', body: { csv } }),
};
