'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [role, setRole] = useState(null);
  const [users, setUsers] = useState([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('teacher');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';
      const res = await fetch(`${apiUrl}/api/users`);
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  useEffect(() => {
    if (role) {
      fetchUsers();
    }
  }, [role]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';
      const res = await fetch(`${apiUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role_key: newRole })
      });
      if (res.ok) {
        setNewName('');
        setNewEmail('');
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to add user:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--burgundy)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Jost', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--manjal)', color: '#3a2500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>నా</span>
          Nada Gurukulam
        </div>
        <div>
          {role ? (
            <button onClick={() => setRole(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '99px', cursor: 'pointer' }}>
              Role: {role} (Log out)
            </button>
          ) : (
            <button onClick={() => setRole('super_admin')} style={{ background: 'var(--manjal)', color: '#3a2500', border: 'none', padding: '6px 16px', borderRadius: '99px', fontWeight: 600, cursor: 'pointer' }}>
              Sign In (Preview)
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ background: 'linear-gradient(155deg, var(--burgundy) 0%, var(--burgundy-ink) 100%)', color: '#fbeee6', padding: '60px 8vw 80px' }}>
        <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', color: '#fff', maxWidth: '18ch', lineHeight: 1.15, margin: 0 }}>
          Nurturing Talent, Inspiring Excellence
        </h1>
        <div style={{ fontFamily: 'Petit Formal Script, cursive', color: 'var(--manjal)', fontSize: '26px', marginTop: '12px' }}>
          One World, One Family
        </div>
        <p style={{ maxWidth: '60ch', color: '#f0ddd2', marginTop: '18px', fontSize: '16px' }}>
          Nada Gurukulam blends India&apos;s timeless classical performing arts traditions with contemporary academic management, under the guidance of Sadguru Sri Madhusudan Sai.
        </p>
      </section>

      {/* Main Content / Portal view */}
      <main style={{ flex: 1, maxWidth: '1080px', margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        {role ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <h2>Academic Portal — Users Management ({role})</h2>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>Connected live to Supabase database via Render backend.</p>

            {/* Add User Form */}
            <form onSubmit={handleAddUser} style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
              <input type="email" placeholder="Email address" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
              <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="guest_faculty">Guest Faculty</option>
                <option value="staff">Staff</option>
                <option value="student">Student</option>
              </select>
              <button type="submit" disabled={loading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Adding...' : 'Add User'}
              </button>
            </form>

            {/* Users Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-faint)' }}>
                    <th style={{ padding: '10px' }}>Name</th>
                    <th style={{ padding: '10px' }}>Email</th>
                    <th style={{ padding: '10px' }}>Role</th>
                    <th style={{ padding: '10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)' }}>No users found in database yet. Add one above!</td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px', fontWeight: 600 }}>{u.name}</td>
                        <td style={{ padding: '10px', color: 'var(--text-soft)' }}>{u.email}</td>
                        <td style={{ padding: '10px', textTransform: 'capitalize' }}>{u.role_key}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ background: 'rgba(31,75,63,0.15)', color: 'var(--good)', padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>
                            {u.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '22px', marginBottom: '12px' }}>Public Website &amp; Admissions</h3>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>Explore our disciplines or submit an enquiry for the upcoming academic term.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {['Carnatic Vocal', 'Hindustani Vocal', 'Bharatanatyam', 'Mridangam', 'Tabla', 'Flute'].map((art, idx) => (
                <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
                  <h4 style={{ fontSize: '18px', marginBottom: '8px' }}>{art}</h4>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-soft)', margin: 0 }}>Free traditional instruction under expert faculty.</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--surface-2)', padding: '24px 8vw', textAlign: 'center', fontSize: '13px', color: 'var(--text-soft)', borderTop: '1px solid var(--border)' }}>
        Nada Gurukulam — Sri Sathya Sai University for Human Excellence. 100% Free of Cost.
      </footer>
    </div>
  );
}
