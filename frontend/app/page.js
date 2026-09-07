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
    if (role) fetchUsers();
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: '40px' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Futura, sans-serif', fontSize: '20px', fontWeight: 500, letterSpacing: '0.05em' }}>
          NADA GURUKULAM
        </div>
        <div>
          {role ? (
            <button onClick={() => setRole(null)} style={{ background: 'none', border: '1px solid #fff', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}>
              {role} (Logout)
            </button>
          ) : (
            <button onClick={() => setRole('super_admin')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: 'var(--bg-saffron)', padding: '60px 8vw', borderBottom: '2px solid var(--accent)' }}>
        <h1 style={{ fontSize: '48px', color: 'var(--primary-deep)', maxWidth: '18ch' }}>
          Nurturing Talent, Inspiring Excellence
        </h1>
        <p style={{ maxWidth: '60ch', color: 'var(--text-soft)', marginTop: '20px', fontSize: '18px' }}>
          Classical performing arts education in the tradition of Sadguru Sri Madhusudan Sai.
        </p>
      </section>

      {/* Main Content */}
      <main style={{ maxWidth: '1080px', margin: '40px auto', padding: '0 24px' }}>
        {role ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '8px' }}>
            <h2>Users Management ({role})</h2>
            <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
              <input type="text" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} required />
              <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} required />
              <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </select>
              <button type="submit" disabled={loading} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px' }}>Add User</button>
            </form>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--primary)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }}>{u.name}</td>
                    <td style={{ padding: '10px' }}>{u.email}</td>
                    <td style={{ padding: '10px' }}>{u.role_key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <h2>Welcome to Nada Gurukulam</h2>
            <p>Please sign in to access the academic portal.</p>
          </div>
        )}
      </main>
    </div>
  );
}
