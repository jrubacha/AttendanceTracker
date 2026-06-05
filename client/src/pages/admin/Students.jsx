import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';

function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newRole, setNewRole] = useState('student');
  const [createdStudent, setCreatedStudent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStudents();
  }, [showArchived, roleFilter]);

  async function loadStudents() {
    try {
      const { students: s } = await api.getStudents(showArchived, roleFilter === 'all' ? undefined : roleFilter);
      setStudents(s);
    } catch { /* ignore */ }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await api.createStudent({ name: newName, pin: newPin || undefined, notes: newNotes, role: newRole });
      setCreatedStudent(result.student);
      setNewName('');
      setNewPin('');
      setNewNotes('');
      setNewRole('student');
      loadStudents();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleArchive(id, archived) {
    try {
      await api.updateStudent(id, { is_archived: !archived });
      loadStudents();
    } catch { /* ignore */ }
  }

  async function handleDelete(id) {
    if (!window.confirm('Permanently delete this student and all their records?')) return;
    try {
      await api.deleteStudent(id, 'true');
      loadStudents();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="brand-heading text-3xl text-kiosk-text">Members</h1>
        <div className="flex flex-wrap gap-3 items-center">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="bg-kiosk-surface border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text text-sm focus:outline-none">
            <option value="all">All Roles</option>
            <option value="student">Students</option>
            <option value="mentor">Mentors</option>
          </select>
          <label className="flex items-center gap-2 text-kiosk-muted text-sm">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
              className="accent-kiosk-accent" />
            Show Archived
          </label>
          <button onClick={() => { setShowCreate(!showCreate); setCreatedStudent(null); }}
            className="bg-kiosk-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-kiosk-accentHover transition-colors">
            + Add Member
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-kiosk-surface rounded-xl p-6 mb-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-kiosk-text mb-4">Add New Member</h2>
          {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">{error}</div>}
          {createdStudent && (
            <div className="bg-green-500/20 text-green-400 p-4 rounded-lg mb-4">
              <div className="font-bold">{createdStudent.name} created!</div>
              <div className="text-2xl font-mono mt-1">PIN: {createdStudent.pin}</div>
              <div className="text-xs mt-1 opacity-75">Write this down — it won't be shown again.</div>
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-kiosk-muted text-sm mb-1">Name *</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:border-kiosk-accent focus:outline-none"
                required />
            </div>
            <div>
              <label className="block text-kiosk-muted text-sm mb-1">Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:border-kiosk-accent focus:outline-none">
                <option value="student">Student</option>
                <option value="mentor">Mentor</option>
              </select>
            </div>
            <div>
              <label className="block text-kiosk-muted text-sm mb-1">PIN (auto-generated if blank)</label>
              <input type="text" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digits" maxLength={4} pattern="\d{0,4}"
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:border-kiosk-accent focus:outline-none" />
            </div>
            <div>
              <label className="block text-kiosk-muted text-sm mb-1">Notes</label>
              <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
                className="w-full bg-kiosk-bg border border-slate-600 rounded-lg px-3 py-2 text-kiosk-text focus:border-kiosk-accent focus:outline-none" />
            </div>
            <div className="md:col-span-4">
              <button type="submit" className="bg-kiosk-success text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                Create Member
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Student list */}
      <div className="bg-kiosk-surface rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-700">
              <th className="p-3 text-kiosk-muted">Name</th>
              <th className="p-3 text-kiosk-muted">Role</th>
              <th className="p-3 text-kiosk-muted">PIN (last 4)</th>
              <th className="p-3 text-kiosk-muted hidden md:table-cell">Notes</th>
              <th className="p-3 text-kiosk-muted hidden md:table-cell">Status</th>
              <th className="p-3 text-kiosk-muted text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                <td className="p-3">
                  <button onClick={() => navigate(`/admin/students/${s.id}`)}
                    className="text-kiosk-accent hover:underline font-medium">{s.name}</button>
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${s.role === 'mentor' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                    {s.role === 'mentor' ? 'Mentor' : 'Student'}
                  </span>
                </td>
                <td className="p-3 text-kiosk-muted font-mono">{s.pin_last4}</td>
                <td className="p-3 text-kiosk-muted hidden md:table-cell truncate max-w-xs">{s.notes}</td>
                <td className="p-3 hidden md:table-cell">
                  {s.is_archived
                    ? <span className="text-yellow-400 text-xs">Archived</span>
                    : <span className="text-green-400 text-xs">Active</span>}
                </td>
                <td className="p-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => handleArchive(s.id, s.is_archived)}
                      className="text-xs px-2 py-1 border border-slate-600 rounded text-kiosk-muted hover:text-kiosk-text">
                      {s.is_archived ? 'Restore' : 'Archive'}
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="text-xs px-2 py-1 border border-red-500/30 rounded text-red-400 hover:text-red-300">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && (
          <div className="text-center py-12 text-kiosk-muted">No members yet. Add one above.</div>
        )}
      </div>
    </div>
  );
}

export default Students;
