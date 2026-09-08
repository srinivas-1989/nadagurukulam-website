'use client';
import { useState, useEffect } from 'react';

// --- UI Components for High-End Feel ---
const Card = ({ children, style }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', padding: '24px', ...style }}>
    {children}
  </div>
);

const StatCard = ({ label, value }) => (
  <Card style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--primary)' }}>{value}</div>
    <div style={{ fontSize: '13px', color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
  </Card>
);

export default function Home() {
  const ROLES = [
    { key: 'super_admin', name: 'Super Admin', blurb: 'Full control' },
    { key: 'admin', name: 'Admin', blurb: 'Operations' },
    { key: 'teacher', name: 'Teacher', blurb: 'Academics' }
  ];

  const MODULES = [
    { key: 'overview', name: 'Dashboard' },
    { key: 'users', name: 'User Management' },
    { key: 'curriculum', name: 'Curriculum' },
    { key: 'batches', name: 'Batches' },
    { key: 'timetable', name: 'Timetable' },
    { key: 'events', name: 'Events' }
  ];

  const [view, setView] = useState('public');
  const [role, setRole] = useState('super_admin'); // Defaulting for dev experience
  const [activeModule, setActiveModule] = useState('overview');
  const [dbData, setDbData] = useState({ users: [], curriculum: [], batches: [], timetable: [], events: [] });
  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const fetchData = async () => {
    try {
      const endpoints = ['users', 'curriculum', 'batches', 'timetable', 'events'];
      const results = await Promise.all(endpoints.map(ep => fetch(`${apiUrl}/api/${ep}`).then(r => r.json()).catch(() => [])));
      const mapped = {};
      endpoints.forEach((ep, idx) => { mapped[ep] = Array.isArray(results[idx]) ? results[idx] : []; });
      setDbData(mapped);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if (view === 'admin') fetchData(); }, [view, activeModule]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Professional Header */}
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontFamily: 'Futura, sans-serif', fontSize: '22px', fontWeight: 600, letterSpacing: '0.05em' }}>
          NADA GURUKULAM <span style={{ fontSize: '14px', fontWeight: 300, opacity: 0.8 }}>| University Management</span>
        </div>
        <button onClick={() => setView(view === 'public' ? 'admin' : 'public')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
          {view === 'public' ? 'Access Portal' : 'Public Site'}
        </button>
      </header>

      {/* ADMIN PORTAL */}
      {view === 'admin' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 72px)' }}>
          <nav style={{ background: 'var(--surface-muted)', borderRight: '1px solid var(--border)', padding: '32px 16px' }}>
            {MODULES.map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{ display: 'block', width: '100%', padding: '12px 16px', background: activeModule === m.key ? 'var(--primary)' : 'transparent', color: activeModule === m.key ? '#fff' : 'var(--text)', border: 'none', textAlign: 'left', marginBottom: '8px', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 500 }}>
                {m.name}
              </button>
            ))}
          </nav>

          <main style={{ padding: '40px' }}>
            <h1 className="font-display" style={{ fontSize: '32px', marginBottom: '32px' }}>{MODULES.find(m => m.key === activeModule)?.name}</h1>

            {activeModule === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
                <StatCard label="Total Users" value={dbData.users.length} />
                <StatCard label="Disciplines" value={dbData.curriculum.length} />
                <StatCard label="Active Batches" value={dbData.batches.length} />
                <StatCard label="Scheduled Classes" value={dbData.timetable.length} />
              </div>
            )}

            {/* Placeholder for other modules - high-end UI pending */}
            {activeModule !== 'overview' && (
              <Card>
                <h3>{MODULES.find(m => m.key === activeModule)?.name} Module Interface</h3>
                <p>High-end UI with advanced filters, sorting, and inline editing is under construction for this module.</p>
              </Card>
            )}
          </main>
        </div>
      )}

      {/* PUBLIC SITE */}
      {view === 'public' && (
        <section style={{ padding: '80px 10vw', textAlign: 'center', background: 'var(--bg-saffron)' }}>
          <h1 className="font-display" style={{ fontSize: '64px', color: 'var(--primary-deep)' }}>Excellence in Arts</h1>
          <p style={{ fontSize: '20px', color: 'var(--text-soft)', maxWidth: '700px', margin: '20px auto' }}>World-class classical training, free of cost.</p>
        </section>
      )}
    </div>
  );
}
