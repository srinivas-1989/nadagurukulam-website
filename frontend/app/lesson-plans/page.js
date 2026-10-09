'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };
const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };

export default function LessonPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${path}`, { ...options, headers });
    return res.json();
  }

  async function reload() {
    const p = await apiCall('/api/lesson_plans');
    setPlans(Array.isArray(p) ? p : []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <div style={{ padding: '24px' }}>Loading Lesson Plans...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1>Lesson Plans</h1>
      <div style={cardStyle}>
        <h3>Educator Lesson Plans</h3>
        {plans.map(p => <div key={p.id}>{p.title} - {p.status}</div>)}
      </div>
    </div>
  );
}
