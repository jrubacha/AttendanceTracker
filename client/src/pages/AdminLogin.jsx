import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function AdminLogin({ onLogin }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(username, password);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-kiosk-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-kiosk-surface rounded-2xl p-8 shadow-2xl">
        <button onClick={() => navigate('/')} className="text-kiosk-muted text-sm hover:text-kiosk-text mb-4 block">
          &larr; Back to Kiosk
        </button>
        <h1 className="text-2xl font-bold text-kiosk-text mb-6">Admin Login</h1>
        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="block text-kiosk-muted text-sm mb-1">Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text mb-4 focus:border-kiosk-accent focus:outline-none"
            autoFocus required />
          <label className="block text-kiosk-muted text-sm mb-1">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-4 py-3 text-kiosk-text mb-6 focus:border-kiosk-accent focus:outline-none"
            required />
          <button type="submit" disabled={loading}
            className="w-full bg-kiosk-accent text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50">
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLogin;
