import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', end: true },
  { path: '/admin/students', label: 'Students' },
  { path: '/admin/schedule', label: 'Schedule' },
  { path: '/admin/seasons', label: 'Seasons' },
  { path: '/admin/reports', label: 'Reports' },
  { path: '/admin/settings', label: 'Settings' },
];

function AdminLayout({ admin, onLogout }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await onLogout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-kiosk-bg flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'block' : 'hidden'} md:block w-56 bg-kiosk-surface border-r border-slate-700 flex-shrink-0 fixed md:relative inset-0 z-50`}>
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-kiosk-text font-bold text-lg">Attendance</h2>
          <p className="text-kiosk-muted text-xs">Admin Panel</p>
        </div>
        <nav className="p-2">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-lg text-sm mb-1 transition-colors ${
                  isActive ? 'bg-kiosk-accent text-white' : 'text-kiosk-muted hover:text-kiosk-text hover:bg-slate-700'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-kiosk-muted text-xs mb-2">Logged in as {admin.username}</div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/')} className="text-xs text-kiosk-muted hover:text-kiosk-text px-2 py-1 border border-slate-600 rounded">
              Kiosk
            </button>
            <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-slate-600 rounded">
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="md:hidden bg-kiosk-surface border-b border-slate-700 p-4 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-kiosk-text">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-kiosk-text font-bold">Admin</span>
          <div className="w-6" />
        </header>
        <div className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}

export default AdminLayout;
