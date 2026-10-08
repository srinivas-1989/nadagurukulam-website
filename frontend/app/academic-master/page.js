'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', marginBottom: '18px' };
const primaryBtn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };

export default function AcademicMasterPage() {
  const [disciplines, setDisciplines] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return fetch(`${apiUrl}${path}`, { ...options, headers });
  }

  async function reload() {
    try {
      const [d, b] = await Promise.all([
        apiCall('/api/disciplines').then(r => r.json()),
        apiCall('/api/batches').then(r => r.json()),
      ]);
      setDisciplines(Array.isArray(d) ? d : []);
      setBatches(Array.isArray(b) ? b : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function addDiscipline(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const res = await apiCall('/api/disciplines', {
        method: 'POST',
        body: JSON.stringify({ name: f.get('name'), description: f.get('description') || null }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Could not create programme.'); return; }
    e.target.reset();
    reload();
  }

  async function addBatch(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const res = await apiCall('/api/batches', {
        method: 'POST',
        body: JSON.stringify({ name: f.get('name'), discipline_id: f.get('discipline_id') || null, academic_year_id: f.get('academic_year_id') || null }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Could not create batch.'); return; }
    e.target.reset();
    reload();
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '18px' }}>Academic Master</h1>
      {error && <div style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <form onSubmit={addDiscipline} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Programmes / Streams</h3>
            <input name="name" placeholder="Name (e.g. Carnatic Vocal)" style={{ ...inputStyle, width: '100%', marginBottom: '10px' }} required />
            <input name="description" placeholder="Description" style={{ ...inputStyle, width: '100%', marginBottom: '10px' }} />
            <button type="submit" style={primaryBtn}>Add Programme</button>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '16px' }}>
                {disciplines.map(d => <li key={d.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>{d.name}</li>)}
            </ul>
        </form>

        <form onSubmit={addBatch} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Batches</h3>
            <input name="name" placeholder="Batch Name (e.g. 2026-30)" style={{ ...inputStyle, width: '100%', marginBottom: '10px' }} required />
            <select name="discipline_id" style={{ ...inputStyle, width: '100%', marginBottom: '10px' }}>
                <option value="">Select Programme...</option>
                {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" style={primaryBtn}>Add Batch</button>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '16px' }}>
                {batches.map(b => <li key={b.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>{b.name} <span style={{ color: 'var(--text-faint)' }}>({disciplines.find(d => d.id === b.discipline_id)?.name || '—'})</span></li>)}
            </ul>
        </form>
      </div>
    </div>
  );
}
