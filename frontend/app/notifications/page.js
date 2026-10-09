'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  async function apiCall(path) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${path}`, { headers });
    return res.json();
  }

  async function reload() {
    const n = await apiCall('/api/notifications');
    setNotifications(Array.isArray(n) ? n : []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <div style={{ padding: '24px' }}>Loading Notifications...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1>Notifications</h1>
      <div style={cardStyle}>
        {notifications.map(n => <div key={n.id}><strong>{n.title}</strong>: {n.body}</div>)}
      </div>
    </div>
  );
}
