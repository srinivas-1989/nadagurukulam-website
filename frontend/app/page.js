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
    { key: 'overview', name: 'Overview' },
    { key: 'users', name: 'Users' },
    { key: 'curriculum', name: 'Curriculum' },
    { key: 'batches', name: 'Batches' },
    { key: 'timetable', name: 'Timetable' }
  ];

  const [view, setView] = useState('public');
  const [role, setRole] = useState(null);
  const [activeModule, setActiveModule] = useState('overview');
  const [data, setData] = useState({ users: [], curriculum: [], batches: [], timetable: [] });
  const [editing, setEditing] = useState(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const fetchData = async () => {
    try {
      const [u, c, b, t] = await Promise.all([
        fetch(`${apiUrl}/api/users`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/curriculum`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/batches`).then(r => r.json()).catch(() => []),
        fetch(`${apiUrl}/api/timetable`).then(r => r.json()).catch(() => [])
      ]);
      setData({ users: u, curriculum: c, batches: b, timetable: t });
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (view === 'admin') fetchData(); }, [view, activeModule]);

  const handleSave = async (module, id, payload) => {
    const endpoint = module === 'users' ? 'api/users' : module === 'curriculum' ? 'api/curriculum' : module === 'batches' ? 'api/batches' : 'api/timetable';
    await fetch(`${apiUrl}/${endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setEditing(null);
    fetchData();
  };

  const handleDelete = async (endpoint, id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`${apiUrl}/${endpoint}/${id}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: 500, cursor: 'pointer' }} onClick={() => setView('public')}>Nada Gurukulam Portal</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {role && <span style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>{ROLE_MAP[role]?.name}</span>}
          <button onClick={() => { setRole(null); setView('public'); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      {view === 'admin' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr' }}>
          <nav style={{ background: 'var(--surface)', padding: '20px', borderRight: '1px solid var(--border)', minHeight: '90vh' }}>
            {MODULES.map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{ display: 'block', width: '100%', padding: '10px', background: activeModule === m.key ? 'var(--primary)' : 'none', color: activeModule === m.key ? '#fff' : 'var(--text)', border: 'none', textAlign: 'left', marginBottom: '5px', borderRadius: '4px', cursor: 'pointer' }}>
                {m.name}
              </button>
            ))}
          </nav>
          <main style={{ padding: '32px' }}>
            <h2>{MODULES.find(m => m.key === activeModule)?.name}</h2>
            {data[activeModule]?.map(item => (
              <div key={item.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '15px', marginBottom: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                {editing?.id === item.id ? (
                  <div>
                    <input value={editing.data.name || ''} onChange={e => setEditing({...editing, data: {...editing.data, name: e.target.value}})} style={{ padding: '5px' }} />
                    <button onClick={() => handleSave(activeModule, item.id, editing.data)}>Save</button>
                    <button onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <span>{item.name || item.day_of_week}</span>
                    <button onClick={() => setEditing({ module: activeModule, id: item.id, data: item })}>Edit</button>
                    <button onClick={() => handleDelete(activeModule === 'users' ? 'api/users' : activeModule === 'curriculum' ? 'api/curriculum' : activeModule === 'batches' ? 'api/batches' : 'api/timetable', item.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </main>
        </div>
      ) : (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h1>Nada Gurukulam Portal</h1>
          <button onClick={() => setView('login')}>Sign In</button>
        </div>
      )}
    </div>
  );
}
