'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };

export default function HRPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  async function apiCall(path) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${path}`, { headers });
    return res.json();
  }

  async function reload() {
    const e = await apiCall('/api/employees');
    setEmployees(e); setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1>Staff & HR</h1>
      <div style={cardStyle}>
        <h3>Employees</h3>
        {employees.map(e => <div key={e.id}>{e.id} - {e.employment_type}</div>)}
      </div>
    </div>
  );
}
