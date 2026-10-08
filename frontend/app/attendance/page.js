'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '12px' };

export default function AttendancePage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  }

  async function reload() {
    try {
      const data = await apiCall('/api/class_sessions');
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1>Attendance</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {sessions.map(session => (
        <div key={session.id} style={cardStyle}>
          <h3>{session.session_date} - {session.topic || 'Untitled Session'}</h3>
          <p>Delivery: {session.delivery_mode} | Room: {session.room}</p>
        </div>
      ))}
    </div>
  );
}
