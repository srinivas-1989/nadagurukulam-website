'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const ROLES = [
    { key: 'super_admin', name: 'Super Admin', blurb: 'Everything — every module, full control.' },
    { key: 'admin', name: 'Admin', blurb: 'Day-to-day operations across most modules.' },
    { key: 'teacher', name: 'Teacher', blurb: 'Own batches — lesson plans, live classes, assignments.' },
    { key: 'guest_faculty', name: 'Guest Faculty', blurb: 'Same as Teacher, scoped to assigned sessions only.' },
    { key: 'staff', name: 'Staff', blurb: 'Enquiries, Jobs, Events, Activities.' },
    { key: 'student', name: 'Student', blurb: 'Own timetable, assignments, live classes, feedback.' }
  ];
  const ROLE_MAP = {}; ROLES.forEach(r => { ROLE_MAP[r.key] = r; });

  const MODULES = [
    { key: 'overview', name: 'Overview', access: { super_admin: 'Full', admin: 'View' }, desc: 'Dashboard tiles across every module.' },
    { key: 'users', name: 'Users', access: { super_admin: 'Full', admin: 'Manage' }, desc: 'Every account — created and permissioned here.' },
    { key: 'curriculum', name: 'Curriculum', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View', student: 'Self' }, desc: 'Disciplines, levels, syllabus documents.' },
    { key: 'timetable', name: 'Timetable & Schedules', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View', student: 'Self' }, desc: 'When and where every class happens.' },
    { key: 'batches', name: 'Batches', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View' }, desc: 'Cohorts — roster, capacity, faculty mapping.' },
    { key: 'lessonplans', name: 'Lesson Plans', access: { super_admin: 'Full', admin: 'Approves', teacher: 'Own', guest_faculty: 'Own' }, desc: 'Draft → submit → Admin approves.' },
    { key: 'liveclasses', name: 'Live Classes', access: { super_admin: 'Full', admin: 'Manage', teacher: 'Own', guest_faculty: 'Own', student: 'Self' }, desc: 'Jitsi-based sessions, recordings, attendance.' },
    { key: 'assignments', name: 'Assignments', access: { super_admin: 'Full', admin: 'View', teacher: 'Own', guest_faculty: 'Own', student: 'Self' }, desc: 'Set, submit, grade — including audio/video.' },
    { key: 'feedback', name: 'Feedback', access: { super_admin: 'Full', admin: 'View', teacher: 'Own', guest_faculty: 'Own', student: 'Self' }, desc: 'Structured two-way feedback cycles.' },
    { key: 'events', name: 'Events', access: { super_admin: 'Full', admin: 'Manage', staff: 'Drafts', student: 'Self' }, desc: 'Staff drafts, Admin publishes to public site.' },
    { key: 'jobs', name: 'Jobs', access: { super_admin: 'Full', admin: 'Manage', staff: 'Drafts' }, desc: 'Faculty & Staff postings, applicant tracking.' },
    { key: 'enquiries', name: 'Enquiries', access: { super_admin: 'Full', admin: 'Manage', staff: 'Manage' }, desc: 'Admissions & general enquiries inbox.' },
    { key: 'activities', name: 'Activities', access: { super_admin: 'Full', admin: 'View', teacher: 'Own', guest_faculty: 'Own', staff: 'Manage', student: 'Self' }, desc: 'Competitions, performances, achievements.' }
  ];

  const [view, setView] = useState('public');
  const [role, setRole] = useState(null);
  const [activeModule, setActiveModule] = useState('overview');

  // Data state
  const [users, setUsers] = useState([]);
  const [curriculum, setCurriculum] = useState([]);
  const [batches, setBatches] = useState([]);

  // Form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('teacher');
  const [loading, setLoading] = useState(false);

  // Curriculum form
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscLevels, setNewDiscLevels] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');

  // Batch form
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchLevel, setNewBatchLevel] = useState('');
  const [newBatchDisc, setNewBatchDisc] = useState('');
  const [newBatchFaculty, setNewBatchFaculty] = useState('');
  const [newBatchCapacity, setNewBatchCapacity] = useState(20);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  // Fetchers
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/users`);
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) { console.error('Failed to fetch users:', err); }
  };

  const fetchCurriculum = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/curriculum`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCurriculum(data);
        if (!newBatchDisc && data.length > 0) setNewBatchDisc(data[0].id);
      }
    } catch (err) { console.error('Failed to fetch curriculum:', err); }
  };

  const fetchBatches = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/batches`);
      const data = await res.json();
      if (Array.isArray(data)) setBatches(data);
    } catch (err) { console.error('Failed to fetch batches:', err); }
  };

  useEffect(() => {
    if (view === 'admin') {
      if (activeModule === 'users') fetchUsers();
      if (activeModule === 'curriculum') fetchCurriculum();
      if (activeModule === 'batches') { fetchCurriculum(); fetchBatches(); fetchUsers(); }
    }
  }, [view, activeModule]);

  // Handlers
  const handleDelete = async (endpoint, id, refreshFn) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    try {
      await fetch(`${apiUrl}/${endpoint}/${id}`, { method: 'DELETE' });
      refreshFn();
    } catch (err) { console.error(err); }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role_key: newUserRole })
      });
      if (res.ok) { setNewName(''); setNewEmail(''); fetchUsers(); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAddDiscipline = async (e) => {
    e.preventDefault();
    if (!newDiscName) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/curriculum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDiscName, levels: newDiscLevels, description: newDiscDesc })
      });
      if (res.ok) { setNewDiscName(''); setNewDiscLevels(''); setNewDiscDesc(''); fetchCurriculum(); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAddBatch = async (e) => {
    e.preventDefault();
    if (!newBatchName || !newBatchDisc) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBatchName,
          level: newBatchLevel,
          discipline_id: newBatchDisc,
          faculty_id: newBatchFaculty || null,
          capacity: parseInt(newBatchCapacity, 10) || 20
        })
      });
      if (res.ok) { setNewBatchName(''); setNewBatchLevel(''); setNewBatchCapacity(20); fetchBatches(); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const currentModules = role ? MODULES.filter(m => m.access[role]) : [];
  const facultyList = users.filter(u => u.role_key === 'teacher' || u.role_key === 'guest_faculty');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Futura, sans-serif', fontSize: '18px', fontWeight: 500, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setView('public')}>
          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>నా</span>
          Nada Gurukulam <span style={{ opacity: 0.7, fontSize: '12px', fontWeight: 400 }}>/ portal</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {role && (
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: '99px', fontSize: '13px' }}>
              Role: <b>{ROLE_MAP[role]?.name}</b>
            </span>
          )}
          {view !== 'public' && (
            <button onClick={() => setView('public')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Public Site
            </button>
          )}
          {!role ? (
            <button onClick={() => setView('login')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
              Sign In
            </button>
          ) : (
            <button onClick={() => { setRole(null); setView('public'); }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Log out
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '32px', maxWidth: '1080px', width: '100%', margin: '0 auto', flex: 1 }}>

        {/* USERS */}
        {activeModule === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', color: 'var(--primary-deep)' }}>Users Management</h2>
            </div>

            {(role === 'super_admin') && (
              <form onSubmit={handleAddUser} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
                <button type="submit" disabled={loading} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                  {loading ? 'Adding...' : 'Add Account'}
                </button>
              </form>
            )}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-faint)' }}>
                    <th style={{ padding: '12px' }}>Name</th>
                    <th style={{ padding: '12px' }}>Email</th>
                    <th style={{ padding: '12px' }}>Role</th>
                    <th style={{ padding: '12px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{u.name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{u.email}</td>
                      <td style={{ padding: '12px', textTransform: 'capitalize' }}>{u.role_key}</td>
                      <td style={{ padding: '12px' }}>
                        {role === 'super_admin' && (
                          <button onClick={() => handleDelete('api/users', u.id, fetchUsers)} style={{ background: 'none', border: '1px solid #c97f1c', color: '#c97f1c', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ... Similar implementation for Curriculum and Batches with Delete button ... */}
      </main>
    </div>
  );
}
