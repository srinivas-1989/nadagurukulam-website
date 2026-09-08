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
  const [dbData, setDbData] = useState({
    users: [], curriculum: [], batches: [], timetable: [],
    events: [], enquiries: [], jobs: [], lessonplans: [],
    liveclasses: [], assignments: [], feedback: [], activities: []
  });

  const [editing, setEditing] = useState(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const fetchData = async () => {
    try {
      const endpoints = ['users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'lessonplans', 'liveclasses', 'assignments', 'feedback', 'activities'];
      const results = await Promise.all(endpoints.map(ep => fetch(`${apiUrl}/api/${ep}`).then(r => r.json()).catch(() => [])));
      const mapped = {};
      endpoints.forEach((ep, idx) => { mapped[ep] = Array.isArray(results[idx]) ? results[idx] : []; });
      setDbData(mapped);
    } catch (err) { console.error('Fetch error:', err); }
  };

  useEffect(() => { if (view === 'admin') fetchData(); }, [view, activeModule]);

  const handleSave = async (module, id, payload) => {
    await fetch(`${apiUrl}/api/${module}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setEditing(null);
    fetchData();
  };

  const handleDelete = async (module, id) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    await fetch(`${apiUrl}/api/${module}/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Add handlers for new academic modules
  const handleAddLiveClass = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    const batch_id = e.target.batch_id.value;
    if (!title || !batch_id) return;
    await fetch(`${apiUrl}/api/liveclasses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, batch_id, session_date: '2026-10-01', start_time: '10:00', room_name: 'NadaGurukulam-' + Math.random().toString(36).slice(2,8), status: 'scheduled' })
    });
    e.target.reset();
    fetchData();
  };

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    const batch_id = e.target.batch_id.value;
    if (!title || !batch_id) return;
    await fetch(`${apiUrl}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, batch_id, due_date: '2026-10-15', type: 'audio_video', description: 'Upload performance recording', status: 'open' })
    });
    e.target.reset();
    fetchData();
  };

  const handleAddLessonPlan = async (e) => {
    e.preventDefault();
    const subject = e.target.subject.value;
    const batch_id = e.target.batch_id.value;
    if (!subject || !batch_id) return;
    await fetch(`${apiUrl}/api/lessonplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, batch_id, session_date: '2026-10-01', objectives: 'Foundational study', status: 'draft' })
    });
    e.target.reset();
    fetchData();
  };

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
            <div style={{ fontStyle: 'italic', color: 'var(--accent-deep)', fontSize: '24px', marginTop: '10px' }}>
              One World, One Family
            </div>
            <p style={{ maxWidth: '60ch', color: 'var(--text-soft)', marginTop: '20px', fontSize: '16px', lineHeight: 1.6 }}>
              Nada Gurukulam blends India&apos;s timeless classical performing arts traditions with contemporary teaching under Sadguru Sri Madhusudan Sai. 100% free of cost.
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
              </button>
            ))}
          </nav>

          {/* Main Content Area */}
          <main style={{ padding: '32px', maxWidth: '900px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '24px', color: 'var(--primary-deep)' }}>
                {MODULES.find(m => m.key === activeModule)?.name}
              </h2>
            </div>

            {/* OVERVIEW */}
            {activeModule === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.users.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Users</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.curriculum.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Disciplines</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.batches.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Batches</div>
                </div>
              </div>
            )}

            {/* LIVE CLASSES */}
            {activeModule === 'liveclasses' && (
              <div>
                <form onSubmit={handleAddLiveClass} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input name="title" placeholder="Live Session Title" style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                  <select name="batch_id" style={{ padding: '8px', border: '1px solid var(--border)' }}>
                    {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>Schedule Class</button>
                </form>
                {dbData.liveclasses.map(lc => (
                  <div key={lc.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '15px', marginBottom: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ color: 'var(--primary-deep)' }}>{lc.title}</b>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>Jitsi Room: {lc.room_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a href={`https://meet.jit.si/${lc.room_name}`} target="_blank" rel="noreferrer" style={{ background: 'var(--accent)', color: '#fff', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', fontSize: '13px' }}>Join Room</a>
                      <button onClick={() => handleDelete('liveclasses', lc.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ASSIGNMENTS */}
            {activeModule === 'assignments' && (
              <div>
                <form onSubmit={handleAddAssignment} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input name="title" placeholder="Assignment Title" style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                  <select name="batch_id" style={{ padding: '8px', border: '1px solid var(--border)' }}>
                    {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>Create Assignment</button>
                </form>
                {dbData.assignments.map(a => (
                  <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '15px', marginBottom: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ color: 'var(--primary-deep)' }}>{a.title}</b>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>Due: {a.due_date} ({a.type})</div>
                    </div>
                    <button onClick={() => handleDelete('assignments', a.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                  </div>
                ))}
              </div>
            )}

            {/* LESSON PLANS */}
            {activeModule === 'lessonplans' && (
              <div>
                <form onSubmit={handleAddLessonPlan} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input name="subject" placeholder="Subject / Topic" style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                  <select name="batch_id" style={{ padding: '8px', border: '1px solid var(--border)' }}>
                    {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>Save Lesson Plan</button>
                </form>
                {dbData.lessonplans.map(lp => (
                  <div key={lp.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '15px', marginBottom: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ color: 'var(--primary-deep)' }}>{lp.subject}</b>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>Status: {lp.status}</div>
                    </div>
                    <button onClick={() => handleDelete('lessonplans', lp.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                  </div>
                ))}
              </div>
            )}

            {/* DEFAULT / OTHER MODULES */}
            {!['overview', 'users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'liveclasses', 'assignments', 'lessonplans'].includes(activeModule) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
                <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>
                  {MODULES.find(m => m.key === activeModule)?.name} — Portal Module
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>
                  Active module in the Phase 3 academic permission structure.
                </p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
