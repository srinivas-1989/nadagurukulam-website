'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };

export default function FinancePage() {
  const [structures, setStructures] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  async function apiCall(path) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${path}`, { headers });
    return res.json();
  }

  async function reload() {
    const [s, p] = await Promise.all([apiCall('/api/fee_structures'), apiCall('/api/fee_payments')]);
    setStructures(s); setPayments(p); setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1>Finance</h1>
      <div style={cardStyle}>
        <h3>Fee Structures</h3>
        {structures.map(s => <div key={s.id}>{s.name} - {s.total_amount}</div>)}
      </div>
      <div style={cardStyle}>
        <h3>Payments</h3>
        {payments.map(p => <div key={p.id}>{p.amount_paid} - {p.status}</div>)}
      </div>
    </div>
  );
}
