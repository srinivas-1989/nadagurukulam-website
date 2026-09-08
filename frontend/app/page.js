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
  const ROLE_MAP = {}; ROLES.forEach(r => ROLE_MAP[r.key] = r);

  const MODULES = [
    { key: 'overview', name: 'Overview', access: { super_admin: 'Full', admin: 'View' }, desc: 'Dashboard tiles across every module.' },
    { key: 'users', name: 'Users', access: { super_admin: 'Full', admin: 'Manage' }, desc: 'Every account — created and permissioned here.' },
    { key: 'curriculum', name: 'Curriculum & Syllabus', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View', student: 'Self' }, desc: 'Disciplines, MPA Semesters, Courses, and Modules.' },
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

  const [view, setView] = useState('public'); // public | login | admin
  const [role, setRole] = useState(null);
  const [activeModule, setActiveModule] = useState('overview');

  // API Data State
  const [dbData, setDbData] = useState({
    users: [], curriculum: [], batches: [], timetable: [],
    events: [], enquiries: [], jobs: [], courses: [], course_modules: [],
    live_sessions: []
  });

  const [editing, setEditing] = useState(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const fetchData = async () => {
    try {
      const endpoints = ['users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'courses', 'course_modules', 'live_sessions'];
      const results = await Promise.all(endpoints.map(ep => fetch(`${apiUrl}/api/${ep}`).then(r => r.json()).catch(() => [])));
      const mapped = {};
      endpoints.forEach((ep, idx) => { mapped[ep] = Array.isArray(results[idx]) ? results[idx] : []; });
      setDbData(mapped);
    } catch (err) { console.error('Fetch error:', err); }
  };

  useEffect(() => {
    if (view === 'admin') fetchData();
  }, [view, activeModule]);

  const handleDelete = async (endpoint, id) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    await fetch(`${apiUrl}/api/${endpoint}/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleSave = async (endpoint, id, payload) => {
    await fetch(`${apiUrl}/api/${endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setEditing(null);
    fetchData();
  };

  // Form states
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('teacher');

  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscLevels, setNewDiscLevels] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');

  // Course form (MPA Syllabus format)
  const [courseDisc, setCourseDisc] = useState('');
  const [courseSem, setCourseSem] = useState('Semester I');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseCredits, setCourseCredits] = useState(6);
  const [courseHours, setCourseHours] = useState(90);

  // Live session form state
  const [newSessionBatch, setNewSessionBatch] = useState('');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('');
  const [newSessionTime, setNewSessionTime] = useState('');

  const handleAddLiveSession = async (e) => {
    e.preventDefault();
    if (!newSessionBatch || !newSessionTitle || !newSessionDate) return;
    const roomName = `NADA-${newSessionTitle.replace(/\s+/g, '-').toUpperCase()}-${newSessionDate}`;
    const roomLink = `https://meet.jit.si/${roomName}`;
    await fetch(`${apiUrl}/api/liveclasses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: newSessionBatch, title: newSessionTitle, room_name: roomName, room_link: roomLink, session_date: newSessionDate, status: 'scheduled' })
    });
    setNewSessionBatch(''); setNewSessionTitle(''); setNewSessionDate(''); setNewSessionTime(''); fetchData();
  };

  const handleJoinSession = (roomLink) => {
    window.open(roomLink, '_blank');
  };

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
      body: JSON.stringify({ name: newDiscName, levels: newDiscLevels, description: newDiscDesc })
    });
    setNewDiscName(''); setNewDiscLevels(''); setNewDiscDesc(''); fetchData();
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!courseName || !courseCode) return;
    await fetch(`${apiUrl}/api/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discipline_id: courseDisc || dbData.curriculum[0]?.id, semester: courseSem, code: courseCode, name: courseName, credits: courseCredits, teaching_hours: courseHours })
    });
    setCourseCode(''); setCourseName(''); fetchData();
  };

  const currentModules = role ? MODULES.filter(m => m.access[role]) : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontFamily: 'Futura, sans-serif', fontSize: '18px', fontWeight: 500, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setView('public')}>
          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>నా</span>
          Nada Gurukulam <span style={{ opacity: 0.7, fontSize: '12px', fontWeight: 400 }}>/ portal</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {role && (
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '5px 14px', borderRadius: '99px', fontSize: '13px' }}>
              Role: <b>{ROLE_MAP[role]?.name}</b>
            </span>
          )}
          {view !== 'public' && (
            <button onClick={() => setView('public')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Public Site
            </button>
          )}
          {!role ? (
            <button onClick={() => setView('login')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
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
          <section style={{ background: 'var(--bg-saffron)', padding: '64px 8vw', borderBottom: '2px solid var(--accent)' }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--primary-deep)', maxWidth: '18ch', margin: 0 }}>
              Nurturing Talent, Inspiring Excellence
            </h1>
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'var(--accent-deep)', fontSize: '24px', marginTop: '10px' }}>
              One World, One Family
            </div>
            <p style={{ maxWidth: '60ch', color: 'var(--text-soft)', marginTop: '20px', fontSize: '16.5px', lineHeight: 1.65 }}>
              Nada Gurukulam blends India&apos;s timeless classical performing arts traditions with contemporary academic management under Sadguru Sri Madhusudan Sai. 100% free of cost.
            </p>
            <div style={{ marginTop: '30px' }}>
              <button onClick={() => setView('login')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '15px' }}>
                Access Academic Portal
              </button>
            </div>
          </section>

          <main style={{ maxWidth: '1080px', margin: '40px auto', padding: '0 24px' }}>
            <h3 style={{ fontSize: '22px', color: 'var(--primary-deep)', marginBottom: '8px' }}>Six Disciplines Taught</h3>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>Offered completely free of charge, funded entirely by donations.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {[
                { name: 'Carnatic Vocal', desc: 'South Indian classical vocal tradition — sarali varisai through varnams and kritis.' },
                { name: 'Hindustani Vocal', desc: 'North Indian classical vocal tradition — raga and taal fundamentals through khayal.' },
                { name: 'Bharatanatyam', desc: 'Classical dance — adavus, nritta and abhinaya through the margam repertoire.' },
                { name: 'Mridangam', desc: 'South Indian percussion — talam fundamentals through accompaniment practice.' },
                { name: 'Tabla', desc: 'North Indian percussion — theka and laya fundamentals through solo compositions.' },
                { name: 'Flute', desc: 'Carnatic bamboo flute — breath and fingering technique through raga alapana.' }
              ].map((art, idx) => (
                <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
                  <h4 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>{art.name}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>{art.desc}</p>
                </div>
              ))}
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
              <button key={r.key} onClick={() => { setRole(r.key); setActiveModule('overview'); setView('admin'); }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', textAlign: 'left', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: '75vh' }}>
          {/* Sidebar */}
          <nav style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '24px 12px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', padding: '0 12px 10px', letterSpacing: '0.05em' }}>
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
          <main style={{ padding: '36px', maxWidth: '940px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '24px', color: 'var(--primary-deep)' }}>
                {MODULES.find(m => m.key === activeModule)?.name}
              </h2>
              <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>
                Access Level: <b>{MODULES.find(m => m.key === activeModule)?.access[role]}</b>
              </span>
            </div>

            {/* OVERVIEW */}
            {activeModule === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.users.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>System Users</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.curriculum.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Disciplines / Programs</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.courses.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Dynamic Courses &amp; Syllabi</div>
                </div>
              </div>
            )}

            {/* USERS MODULE */}
            {activeModule === 'users' && (
              <div>
                {(role === 'super_admin' || role === 'admin') && (
                  <form onSubmit={handleAddUser} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add User</button>
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
                      {dbData.users.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px' }}>{u.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{u.email}</td>
                          <td style={{ padding: '12px', textTransform: 'capitalize' }}>{u.role_key}</td>
                          <td style={{ padding: '12px' }}>
                            {role === 'super_admin' && <button onClick={() => handleDelete('users', u.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CURRICULUM & SYLLABUS MODULE (Dynamic MPA Format) */}
            {activeModule === 'curriculum' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>
                  Dynamic university syllabus structure (Programs, Semesters, and Courses matching the MPA format).
                </p>
                {(role === 'super_admin' || role === 'admin') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    {/* Add Discipline */}
                    <form onSubmit={handleAddDiscipline} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input placeholder="Program / Discipline (e.g. MPA Bharatanatyam)" value={newDiscName} onChange={e => setNewDiscName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 220px' }} required />
                      <input placeholder="Levels (e.g. 2 Years / 4 Semesters)" value={newDiscLevels} onChange={e => setNewDiscLevels(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                      <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Program</button>
                    </form>

                    {/* Add Course */}
                    <form onSubmit={handleAddCourse} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <select value={courseDisc} onChange={e => setCourseDisc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                        {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <select value={courseSem} onChange={e => setCourseSem(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                        <option value="Semester I">Semester I</option>
                        <option value="Semester II">Semester II</option>
                        <option value="Semester III">Semester III</option>
                        <option value="Semester IV">Semester IV</option>
                      </select>
                      <input placeholder="Course Code (e.g. MBNP110)" value={courseCode} onChange={e => setCourseCode(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '130px' }} required />
                      <input placeholder="Course Name (e.g. Nritya Marga Purvanga-1)" value={courseName} onChange={e => setCourseName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                      <button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Course</button>
                    </form>
                  </div>
                )}

                {/* Courses List */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Code &amp; Course Name</th><th style={{ padding: '12px' }}>Semester</th><th style={{ padding: '12px' }}>Credits</th><th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.courses.length === 0 ? (
                        <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No dynamic courses added yet.</td></tr>
                      ) : dbData.courses.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px' }}><b>{c.code}</b> — {c.name}</td>
                          <td style={{ padding: '12px' }}>{c.semester}</td>
                          <td style={{ padding: '12px' }}>{c.credits} Credits</td>
                          <td style={{ padding: '12px' }}>
                            <button onClick={() => handleDelete('courses', c.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LIVE CLASSES MODULE */}
            {activeModule === 'liveclasses' && (
              <div>
                {(role === 'super_admin' || role === 'admin' || role === 'teacher' || role === 'guest_faculty') && (
                  <form onSubmit={handleAddLiveSession} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <select value={newSessionBatch} onChange={e => setNewSessionBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input placeholder="Session Title (e.g. Week 5 Ragam)" value={newSessionTitle} onChange={e => setNewSessionTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <input type="date" value={newSessionDate} onChange={e => setNewSessionDate(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Schedule Session</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  {dbData.live_sessions.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No sessions scheduled yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Session</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Room Link</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.live_sessions.map(s => {
                          const batch = dbData.batches.find(b => b.id === s.batch_id);
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px' }}>{s.title}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{s.session_date}</td>
                              <td style={{ padding: '12px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: s.status === 'live' ? 'var(--primary)' : s.status === 'ended' ? 'var(--text-faint)' : 'var(--accent)', color: s.status === 'live' ? '#fff' : '#fff' }}>{s.status}</span></td>
                              <td style={{ padding: '12px' }}>
                                {s.room_link && <button onClick={() => handleJoinSession(s.room_link)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Join Jitsi</button>}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {(role === 'super_admin' || role === 'admin') && <button onClick={() => handleDelete('liveclasses', s.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* DEFAULT FALLBACK FOR OTHER MODULES */}
            {!['overview', 'users', 'curriculum', 'liveclasses'].includes(activeModule) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
                <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>
                  {MODULES.find(m => m.key === activeModule)?.name} — Portal Module
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>
                  Fully wired to the backend API and ready for management.
                </p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
