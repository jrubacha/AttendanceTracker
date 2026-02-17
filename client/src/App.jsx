import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api } from './utils/api';
import KioskPage from './pages/KioskPage';
import SetupPage from './pages/SetupPage';
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './pages/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Students from './pages/admin/Students';
import StudentDetail from './pages/admin/StudentDetail';
import Schedule from './pages/admin/Schedule';
import Seasons from './pages/admin/Seasons';
import Settings from './pages/admin/Settings';
import Reports from './pages/admin/Reports';

function App() {
  const [setupComplete, setSetupComplete] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSetup();
  }, []);

  async function checkSetup() {
    try {
      const { setupComplete: done } = await api.getSetupStatus();
      setSetupComplete(done);
      if (done) {
        try {
          const { admin: a } = await api.getSession();
          setAdmin(a);
        } catch {
          setAdmin(null);
        }
      }
    } catch {
      // Offline - assume setup complete
      setSetupComplete(true);
    }
    setLoading(false);
  }

  async function handleLogin(username, password) {
    await api.login(username, password);
    const { admin: a } = await api.getSession();
    setAdmin(a);
  }

  async function handleLogout() {
    await api.logout();
    setAdmin(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-kiosk-bg flex items-center justify-center">
        <div className="text-kiosk-muted text-xl">Loading...</div>
      </div>
    );
  }

  if (!setupComplete) {
    return <SetupPage onComplete={() => { setSetupComplete(true); checkSetup(); }} />;
  }

  return (
    <Routes>
      <Route path="/" element={<KioskPage />} />
      <Route path="/admin/login" element={
        admin ? <Navigate to="/admin" /> : <AdminLogin onLogin={handleLogin} />
      } />
      <Route path="/admin" element={
        admin ? <AdminLayout admin={admin} onLogout={handleLogout} /> : <Navigate to="/admin/login" />
      }>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="seasons" element={<Seasons />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
