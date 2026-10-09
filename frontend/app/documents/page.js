'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  async function apiCall(path) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${path}`, { headers });
    return res.json();
  }

  async function reload() {
    const [d, f] = await Promise.all([apiCall('/api/documents'), apiCall('/api/document_folders')]);
    setDocuments(Array.isArray(d) ? d : []);
    setFolders(Array.isArray(f) ? f : []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (loading) return <div style={{ padding: '24px' }}>Loading Documents...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h1>Documents & Media</h1>
      <div style={cardStyle}>
        <h3>Folders</h3>
        {folders.map(f => <div key={f.id}>{f.name}</div>)}
      </div>
      <div style={cardStyle}>
        <h3>Documents</h3>
        {documents.map(d => <div key={d.id}>{d.title} ({d.visibility})</div>)}
      </div>
    </div>
  );
}
