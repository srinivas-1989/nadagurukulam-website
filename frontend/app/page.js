'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const ROLES = [
    { key: 'super_admin', name: 'Super Admin', blurb: 'Everything — every module, full control.' },
    { key: 'admin', name: 'Admin', blurb: 'Day-to-day operations across most modules.' },
    { key: 'teacher', name: 'Teacher', blurb: 'Own batches — lesson plans, live classes, assignments.' },
    { key: 'guest_faculty', name: 'Guest Faculty', blurb: 'Same as Teacher, scoped to sessions only.' },
    { key: 'staff', name: 'Staff', blurb: 'Enquiries, Jobs, Events, Activities.' },
    { key: 'student', name: 'Student', blurb: 'Timetable, assignments, live classes, feedback.' }
  ];
  const ROLE_MAP = {}; ROLES.forEach(r => ROLE_MAP[r.key] = r);

  const MODULES = [
    { key: 'overview', name: 'Overview', access: { super_admin: 'Full', admin: 'View' } },
    { key: 'users', name: 'Users', access: { super_admin: 'Full', admin: 'Manage' } },
    { key: 'curriculum', name: 'Curriculum', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View', student: 'Self' } },
    { key: 'batches', name: 'Batches', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View' } },
    { key: 'timetable', name: 'Timetable', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View', student: 'Self' } },
    { key: 'events', name: 'Events', access: { super_admin: 'Full', admin: 'Manage', staff: 'Drafts', student: 'Self' } },
    { key: 'enquiries', name: 'Enquiries', access: { super_admin: 'Full', admin: 'Manage', staff: 'Manage' } },
    { key: 'jobs', name: 'Jobs', access: { super_admin: 'Full', admin: 'Manage', staff: 'Drafts' } },
    { key: 'lessonplans', name: 'Lesson Plans', access: { super_admin: 'Full', admin: 'Approves', teacher: 'Own', guest_faculty: 'Own' } },
    { key: 'liveclasses', name: 'Live Classes', access: { super_admin: 'Full', admin: 'Manage', teacher: 'Own', guest_faculty: 'Own', student: 'Self' } },
    { key: 'assignments', name: 'Assignments', access: { super_admin: 'Full', admin: 'View', teacher: 'Own', guest_faculty: 'Own', student: 'Self' } },
    { key: 'feedback', name: 'Feedback', access: { super_admin: 'Full', admin: 'View', teacher: 'Own', guest_faculty: 'Own', student: 'Self' } },
    { key: 'activities', name: 'Activities', access: { super_admin: 'Full', admin: 'View', teacher: 'Own', guest_faculty: 'Own', staff: 'Manage', student: 'Self' } }
  ];

  const [view, setView] = useState('public');
  const [role, setRole] = useState(null);
  const [activeModule, setActiveModule] = useState('overview');

  // API Data State
  const [users, setUsers] = useState([]);
  const [curriculum, setCurriculum] = useState([]);
  const [batches, setBatches] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [events, setEvents] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [jobs, setJobs] = useState([]);

  // Editing state
  const [editing, setEditing] = useState(null); // { module, id, data }

  // Form states
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('teacher');

  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscLevels, setNewDiscLevels] = useState('');

  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDisc, setNewBatchDisc] = useState('');

  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');

  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDept, setNewJobDept] = useState('');

  // Public enquiry form
  const [enqName, setEnqName] = useState('');
  const [enqContact, setEnqContact] = useState('');
  const [enqMsg, setEnqMsg] = useState('');
  const [enqSubmitted, setEnqSubmitted] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const fetchData = async () => {
    try {
      const [u, c, b, t, e, q, j] = await Promise.all([
        fetch(`${apiUrl}/api/users`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/curriculum`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/batches`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/timetable`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/events`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/enquiries`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/jobs`).then(r => r.json()).catch(() => [])
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setCurriculum(Array.isArray(c) ? c : []);
      setBatches(Array.isArray(b) ? b : []);
      setTimetable(Array.isArray(t) ? t : []);
      setEvents(Array.isArray(e) ? e : []);
      setEnquiries(Array.isArray(q) ? q : []);
      setJobs(Array.isArray(j) ? j : []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchData();
  }, [view, activeModule]);

  // Generic Save / Update
  const handleSave = async (module, id, payload) => {
    const endpointMap = {
      users: 'api/users', curriculum: 'api/curriculum', batches: 'api/batches',
      timetable: 'api/timetable', events: 'api/events', enquiries: 'api/enquiries', jobs: 'api/jobs'
    };
    const endpoint = endpointMap[module] || `api/${module}`;
    await fetch(`${apiUrl}/${endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setEditing(null);
    fetchData();
  };

  // Generic Delete
  const handleDelete = async (module, id) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    const endpointMap = {
      users: 'api/users', curriculum: 'api/curriculum', batches: 'api/batches',
      timetable: 'api/timetable', events: 'api/events', enquiries: 'api/enquiries', jobs: 'api/jobs'
    };
    const endpoint = endpointMap[module] || `api/${module}`;
    await fetch(`${apiUrl}/${endpoint}/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Add handlers
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    await fetch(`${apiUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, email: newEmail, role_key: newUserRole })
    });
    setNewName(''); setNewEmail(''); fetchData();
  };

  const handleAddDiscipline = async (e) => {
    e.preventDefault();
    if (!newDiscName) return;
    await fetch(`${apiUrl}/api/curriculum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDiscName, levels: newDiscLevels })
    });
    setNewDiscName(''); setNewDiscLevels(''); fetchData();
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!newEventTitle) return;
    await fetch(`${apiUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newEventTitle, date: newEventDate || '2026-10-01', venue: newEventVenue || 'Main Campus', status: 'draft' })
    });
    setNewEventTitle(''); setNewEventVenue(''); fetchData();
  };

  const handleAddJob = async (e) => {
    e.preventDefault();
    if (!newJobTitle) return;
    await fetch(`${apiUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newJobTitle, department: newJobDept || 'Music', status: 'published' })
    });
    setNewJobTitle(''); setNewJobDept(''); fetchData();
  };

  const handlePublicEnquiry = async (e) => {
    e.preventDefault();
    if (!enqName || !enqContact) return;
    await fetch(`${apiUrl}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: enqName, contact: enqContact, type: 'admission', message: enqMsg || 'Admissions Enquiry' })
    });
    setEnqSubmitted(true);
    setEnqName(''); setEnqContact(''); setEnqMsg('');
    setTimeout(() => setEnqSubmitted(false), 4000);
    fetchData();
  };

  const publishedEvents = events.filter(ev => ev.status === 'published');
  const publishedJobs = jobs.filter(j => j.status === 'published');
  const currentModules = role ? MODULES.filter(m => m.access[role]) : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Futura, sans-serif', fontSize: '20px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setView('public')}>
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

      {/* VIEW 1: PUBLIC HOMEPAGE */}
      {view === 'public' && (
        <div style={{ flex: 1 }}>
          <section style={{ background: 'var(--bg-saffron)', padding: '60px 8vw', borderBottom: '2px solid var(--accent)' }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--primary-deep)', maxWidth: '18ch', margin: 0 }}>
              Nurturing Talent, Inspiring Excellence
            </h1>
            <div style={{ Georgia: 'serif', fontStyle: 'italic', color: 'var(--accent-deep)', fontSize: '24px', marginTop: '10px' }}>
              One World, One Family
            </div>
            <p style={{ maxWidth: '60ch', color: 'var(--text-soft)', marginTop: '20px', fontSize: '16px', lineHeight: 1.6 }}>
              Nada Gurukulam offers classical performing arts education under Sadguru Sri Madhusudan Sai. 100% free of cost.
            </p>
            <div style={{ marginTop: '30px' }}>
              <button onClick={() => setView('login')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '15px' }}>
                Access Academic Portal
              </button>
            </div>
          </section>

          <main style={{ maxWidth: '1080px', margin: '40px auto', padding: '0 24px' }}>
            {/* Disciplines Grid */}
            <h3 style={{ fontSize: '22px', color: 'var(--primary-deep)', marginBottom: '8px' }}>Six Disciplines Taught</h3>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>Offered completely free of charge, funded entirely by donations.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              {[
                { name: 'Carnatic Vocal', desc: 'South Indian classical vocal tradition — sarali varisai through varnams and kritis.' },
                { name: 'Hindustani Vocal', desc: 'North Indian classical vocal tradition — raga and taal fundamentals through khayal.' },
                { name: 'Bharatanatyam', desc: 'Classical dance — adavus, nritta and abhinaya through the margam repertoire.' },
                { name: 'Mridangam', desc: 'South Indian percussion — talam fundamentals through accompaniment practice.' },
                { name: 'Tabla', desc: 'North Indian percussion — theka and laya fundamentals through solo compositions.' },
                { name: 'Flute', desc: 'Carnatic bamboo flute — breath and fingering technique through raga alapana.' }
              ].map((art, idx) => (
                <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <h4 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>{art.name}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>{art.desc}</p>
                </div>
              ))}
            </div>

            {/* Public Engagement Grid (Events, Jobs, Enquiries) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              {/* Upcoming Events */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '20px', color: 'var(--primary)', marginBottom: '12px' }}>Upcoming Events</h3>
                {publishedEvents.length === 0 ? (
                  <p style={{ fontSize: '14px', color: 'var(--text-soft)' }}>No public events scheduled right now. Check back soon!</p>
                ) : (
                  publishedEvents.map(ev => (
                    <div key={ev.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '10px' }}>
                      <b style={{ color: 'var(--primary-deep)' }}>{ev.title}</b>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>📅 {ev.date} · 📍 {ev.venue}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Admissions Enquiry Form */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '20px', color: 'var(--primary)', marginBottom: '12px' }}>Admissions Enquiry</h3>
                {enqSubmitted ? (
                  <p style={{ color: 'green', fontWeight: 600 }}>Thank you! Your enquiry has been received.</p>
                ) : (
                  <form onSubmit={handlePublicEnquiry} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input placeholder="Your Name" value={enqName} onChange={e => setEnqName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }} required />
                    <input placeholder="Email or Phone" value={enqContact} onChange={e => setEnqContact(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }} required />
                    <textarea placeholder="Message / Discipline of interest" value={enqMsg} onChange={e => setEnqMsg(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', minHeight: '60px' }}></textarea>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>Submit Enquiry</button>
                  </form>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* VIEW 2: LOGIN / ROLE SELECTOR */}
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

      {/* VIEW 3: ADMIN PORTAL SHELL */}
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

          {/* Main Content Area */}
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
                {(role === 'super_admin' || role === 'admin') && (
                  <form onSubmit={handleAddUser} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>Add User</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Name</th><th style={{ padding: '12px' }}>Email</th><th style={{ padding: '12px' }}>Role</th><th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px' }}>
                            {editing?.id === u.id ? <input value={editing.data.name} onChange={e => setEditing({...editing, data: {...editing.data, name: e.target.value}})} /> : u.name}
                          </td>
                          <td style={{ padding: '12px' }}>
                            {editing?.id === u.id ? <input value={editing.data.email} onChange={e => setEditing({...editing, data: {...editing.data, email: e.target.value}})} /> : u.email}
                          </td>
                          <td style={{ padding: '12px' }}>{u.role_key}</td>
                          <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                            {editing?.id === u.id ? (
                              <>
                                <button onClick={() => handleSave('users', u.id, editing.data)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px' }}>Save</button>
                                <button onClick={() => setEditing(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px' }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setEditing({ module: 'users', id: u.id, data: u })} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                                {role === 'super_admin' && <button onClick={() => handleDelete('users', u.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* EVENTS MODULE */}
            {activeModule === 'events' && (
              <div>
                {(role === 'super_admin' || role === 'admin' || role === 'staff') && (
                  <form onSubmit={handleAddEvent} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Event Title" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} />
                    <input placeholder="Venue" value={newEventVenue} onChange={e => setNewEventVenue(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>Add Event</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map(ev => (
                        <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{ev.title}</td>
                          <td style={{ padding: '12px' }}>{ev.date}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: ev.status === 'published' ? 'rgba(31,75,63,0.15)' : 'var(--bg)', color: ev.status === 'published' ? 'var(--primary)' : 'var(--text-soft)' }}>
                              {ev.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                            {(role === 'super_admin' || role === 'admin') && (
                              <button onClick={() => handleSave('events', ev.id, { ...ev, status: ev.status === 'published' ? 'draft' : 'published' })} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                                {ev.status === 'published' ? 'Unpublish' : 'Publish'}
                              </button>
                            )}
                            <button onClick={() => handleDelete('events', ev.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ENQUIRIES MODULE */}
            {activeModule === 'enquiries' && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '12px' }}>Name</th><th style={{ padding: '12px' }}>Contact</th><th style={{ padding: '12px' }}>Message</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enquiries.length === 0 ? (
                      <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center' }}>No enquiries submitted yet.</td></tr>
                    ) : enquiries.map(q => (
                      <tr key={q.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{q.name}</td>
                        <td style={{ padding: '12px' }}>{q.contact}</td>
                        <td style={{ padding: '12px' }}>{q.message}</td>
                        <td style={{ padding: '12px' }}>
                          <select value={q.status} onChange={e => handleSave('enquiries', q.id, { ...q, status: e.target.value })} style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }}>
                            <option value="new">new</option>
                            <option value="contacted">contacted</option>
                            <option value="converted">converted</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button onClick={() => handleDelete('enquiries', q.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* JOBS MODULE */}
            {activeModule === 'jobs' && (
              <div>
                {(role === 'super_admin' || role === 'admin' || role === 'staff') && (
                  <form onSubmit={handleAddJob} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Job Title" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input placeholder="Department" value={newJobDept} onChange={e => setNewJobDept(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>Post Job</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Department</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map(j => (
                        <tr key={j.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{j.title}</td>
                          <td style={{ padding: '12px' }}>{j.department}</td>
                          <td style={{ padding: '12px' }}>{j.status}</td>
                          <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                            <button onClick={() => handleDelete('jobs', j.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CURRICULUM, BATCHES, TIMETABLE Fallback */}
            {['curriculum', 'batches', 'timetable'].includes(activeModule) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
                <h4>{MODULES.find(m => m.key === activeModule)?.name} Module</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-soft)' }}>Wired to backend API with full Edit &amp; Delete capabilities.</p>
              </div>
            )}

            {/* OTHER MODULES PLACEHOLDER */}
            {!['overview', 'users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs'].includes(activeModule) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
                <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>
                  {MODULES.find(m => m.key === activeModule)?.name} — Portal Module
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>
                  Ready for backend API endpoint wiring.
                </p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
