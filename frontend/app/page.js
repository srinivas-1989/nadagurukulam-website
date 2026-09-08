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

      {/* PUBLIC HOME */}
      {view === 'public' && (
        <div style={{ flex: 1 }}>
          <section style={{ background: 'var(--bg-saffron)', padding: '60px 8vw', borderBottom: '2px solid var(--accent)' }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--primary-deep)', maxWidth: '18ch' }}>
              Nurturing Talent, Inspiring Excellence
            </h1>
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'var(--accent-deep)', fontSize: '24px', marginTop: '10px' }}>
              One World, One Family
            </div>
            <p style={{ maxWidth: '60ch', color: 'var(--text-soft)', marginTop: '20px', fontSize: '16px' }}>
              Nada Gurukulam blends India&apos;s timeless classical performing arts traditions with contemporary teaching under Sadguru Sri Madhusudan Sai. 100% free of cost.
            </p>
            <div style={{ marginTop: '30px' }}>
              <button onClick={() => setView('login')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '15px' }}>
                Access Academic Portal
              </button>
            </div>
          </section>

          <main style={{ maxWidth: '1080px', margin: '40px auto', padding: '0 24px' }}>
            <h3 style={{ fontSize: '22px', marginBottom: '8px' }}>Six Disciplines Taught</h3>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>Offered completely free of charge, funded entirely by donations.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {[
                { name: 'Carnatic Vocal', desc: 'South Indian classical vocal tradition — sarali varisai to kritis.' },
                { name: 'Hindustani Vocal', desc: 'North Indian classical vocal tradition — raga and khayal.' },
                { name: 'Bharatanatyam', desc: 'Classical dance — adavus, nritta and abhinaya repertoire.' },
                { name: 'Mridangam', desc: 'South Indian percussion — talam fundamentals and accompaniment.' },
                { name: 'Tabla', desc: 'North Indian percussion — theka, laya and solo compositions.' },
                { name: 'Flute', desc: 'Carnatic bamboo flute — breath, fingering and raga alapana.' }
              ].map((art, idx) => (
                <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <h4 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>{art.name}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>{art.desc}</p>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}

      {/* LOGIN */}
      {view === 'login' && (
        <div style={{ maxWidth: '720px', margin: '60px auto', padding: '0 24px', flex: 1 }}>
          <h2 style={{ fontSize: '28px', color: 'var(--primary-deep)', textAlign: 'center', marginBottom: '8px' }}>Select Portal Role</h2>
          <p style={{ color: 'var(--text-soft)', textAlign: 'center', marginBottom: '32px' }}>
            Preview the portal permissions across all six system roles per the Phase 3 permission matrix.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
            {ROLES.map(r => (
              <button key={r.key} onClick={() => { setRole(r.key); setActiveModule('overview'); setView('admin'); }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <b style={{ display: 'block', fontSize: '16px', color: 'var(--primary)', marginBottom: '6px' }}>{r.name}</b>
                <span style={{ fontSize: '13px', color: 'var(--text-soft)', lineHeight: 1.4, display: 'block' }}>{r.blurb}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setView('public')} style={{ display: 'block', margin: '40px auto 0', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}>
            ← Back to public site
          </button>
        </div>
      )}

      {/* ADMIN */}
      {view === 'admin' && role && (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', flex: 1, minHeight: '75vh' }}>
          {/* Sidebar */}
          <nav style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '20px 12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', padding: '0 12px 10px', letterSpacing: '0.05em' }}>
              Portal Modules
            </div>
            {currentModules.map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px', borderRadius: '6px', background: activeModule === m.key ? 'var(--primary)' : 'none', color: activeModule === m.key ? '#fff' : 'var(--text)', border: 'none', textAlign: 'left', fontWeight: activeModule === m.key ? 600 : 500, cursor: 'pointer', marginBottom: '2px', fontSize: '14px' }}>
                <span>{m.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 6px', borderRadius: '99px', background: activeModule === m.key ? 'rgba(255,255,255,0.25)' : 'var(--bg)', color: activeModule === m.key ? '#fff' : 'var(--text-faint)' }}>
                  {m.access[role]}
                </span>
              </button>
            ))}
          </nav>

          {/* Main */}
          <main style={{ padding: '32px', maxWidth: '900px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '24px', color: 'var(--primary-deep)' }}>
                {MODULES.find(m => m.key === activeModule)?.name}
              </h2>
              <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>
                Access Level: <b>{MODULES.find(m => m.key === activeModule)?.access[role]}</b>
              </span>
            </div>

            {/* USERS */}
            {activeModule === 'users' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>
                  Manage accounts. Connected live to Supabase via Render backend.
                </p>
                {(role === 'super_admin' || role === 'admin') && (
                  <form onSubmit={handleAddUser} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="guest_faculty">Guest Faculty</option>
                      <option value="staff">Staff</option>
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
                        <th style={{ padding: '12px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>Loading users…</td></tr>
                      ) : users.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{u.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{u.email}</td>
                          <td style={{ padding: '12px', textTransform: 'capitalize' }}>{u.role_key}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ background: 'rgba(129,23,26,0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>
                              {u.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CURRICULUM */}
            {activeModule === 'curriculum' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>
                  Disciplines offered by the institution. Six core arts defined in Phase 1.
                </p>
                {(role === 'super_admin' || role === 'admin') && (
                  <form onSubmit={handleAddDiscipline} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Discipline name" value={newDiscName} onChange={e => setNewDiscName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} required />
                    <input type="text" placeholder="Levels (e.g. Beginner, Intermediate)" value={newDiscLevels} onChange={e => setNewDiscLevels(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 220px' }} />
                    <input type="text" placeholder="Description" value={newDiscDesc} onChange={e => setNewDiscDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 220px' }} />
                    <button type="submit" disabled={loading} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                      {loading ? 'Adding...' : 'Add Discipline'}
                    </button>
                  </form>
                )}

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-faint)' }}>
                        <th style={{ padding: '12px' }}>Discipline</th>
                        <th style={{ padding: '12px' }}>Levels</th>
                        <th style={{ padding: '12px' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curriculum.length === 0 ? (
                        <tr><td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No disciplines yet</td></tr>
                      ) : curriculum.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600, color: 'var(--primary)' }}>{d.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{d.levels || '—'}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{d.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* BATCHES */}
            {activeModule === 'batches' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>
                  Cohorts linked to disciplines with assigned faculty.
                </p>
                {(role === 'super_admin' || role === 'admin') && (
                  <form onSubmit={handleAddBatch} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Batch name" value={newBatchName} onChange={e => setNewBatchName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input type="text" placeholder="Level" value={newBatchLevel} onChange={e => setNewBatchLevel(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '110px' }} />
                    <select value={newBatchDisc} onChange={e => setNewBatchDisc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="">Select Discipline</option>
                      {curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={newBatchFaculty} onChange={e => setNewBatchFaculty(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="">Select Faculty</option>
                      {facultyList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <input type="number" placeholder="Capacity" value={newBatchCapacity} onChange={e => setNewBatchCapacity(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '90px' }} />
                    <button type="submit" disabled={loading} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                      {loading ? 'Adding...' : 'Add Batch'}
                    </button>
                  </form>
                )}

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-faint)' }}>
                        <th style={{ padding: '12px' }}>Batch</th>
                        <th style={{ padding: '12px' }}>Discipline</th>
                        <th style={{ padding: '12px' }}>Faculty</th>
                        <th style={{ padding: '12px' }}>Capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.length === 0 ? (
                        <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No batches yet</td></tr>
                      ) : batches.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{b.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{curriculum.find(d => d.id === b.discipline_id)?.name || '—'}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{users.find(u => u.id === b.faculty_id)?.name || '—'}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{b.capacity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Placeholder */}
            {!['users', 'curriculum', 'batches'].includes(activeModule) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
                <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>
                  {MODULES.find(m => m.key === activeModule)?.name} — Portal Module
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>
                  {MODULES.find(m => m.key === activeModule)?.desc}
                </p>
                <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                  Ready for backend wiring (Phase 6 build sequence).
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
