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
    { key: 'batches', name: 'Batches', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View' }, desc: 'Cohorts — roster, capacity, faculty mapping.' },
    { key: 'timetable', name: 'Timetable', access: { super_admin: 'Full', admin: 'Manage', teacher: 'View', guest_faculty: 'View', student: 'Self' }, desc: 'When and where every class happens.' }
  ];

  const [view, setView] = useState('public');
  const [role, setRole] = useState(null);
  const [activeModule, setActiveModule] = useState('overview');

  const [users, setUsers] = useState([]);
  const [curriculum, setCurriculum] = useState([]);
  const [batches, setBatches] = useState([]);

  const [loading, setLoading] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const fetchData = async () => {
    try {
      const [uRes, cRes, bRes] = await Promise.all([
        fetch(`${apiUrl}/api/users`).then(r => r.json()),
        fetch(`${apiUrl}/api/curriculum`).then(r => r.json()),
        fetch(`${apiUrl}/api/batches`).then(r => r.json())
      ]);
      setUsers(Array.isArray(uRes) ? uRes : []);
      setCurriculum(Array.isArray(cRes) ? cRes : []);
      setBatches(Array.isArray(bRes) ? bRes : []);
    } catch (err) { console.error('Fetch error:', err); }
  };

  useEffect(() => { if (view === 'admin') fetchData(); }, [view, activeModule]);

  const handleDelete = async (endpoint, id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`${apiUrl}/${endpoint}/${id}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Futura, sans-serif', fontSize: '18px', fontWeight: 500, cursor: 'pointer' }} onClick={() => setView('public')}>Nada Gurukulam / portal</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {role ? <button onClick={() => { setRole(null); setView('public'); }}>Logout</button> : <button onClick={() => setView('login')}>Sign In</button>}
        </div>
      </header>

      {view === 'admin' && (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', flex: 1 }}>
          <nav style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '20px' }}>
            {MODULES.filter(m => m.access[role]).map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{ display: 'block', width: '100%', padding: '10px', background: activeModule === m.key ? 'var(--primary)' : 'none', color: activeModule === m.key ? '#fff' : 'var(--text)', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
                {m.name}
              </button>
            ))}
          </nav>
          <main style={{ padding: '32px' }}>
            <h2>{MODULES.find(m => m.key === activeModule)?.name}</h2>

            {activeModule === 'users' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Name</th><th>Email</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px' }}>{u.name}</td>
                      <td style={{ padding: '10px' }}>{u.email}</td>
                      <td style={{ padding: '10px' }}>
                        {role === 'super_admin' && <button onClick={() => handleDelete('api/users', u.id)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeModule === 'curriculum' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {curriculum.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px' }}>{d.name}</td>
                      <td style={{ padding: '10px' }}>
                        {role === 'super_admin' && <button onClick={() => handleDelete('api/curriculum', d.id)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeModule === 'batches' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px' }}>{b.name}</td>
                      <td style={{ padding: '10px' }}>
                        {role === 'super_admin' && <button onClick={() => handleDelete('api/batches', b.id)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
