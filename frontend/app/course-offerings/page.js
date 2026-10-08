'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', marginBottom: '18px' };

export default function CourseOfferingsPage() {
  const [offerings, setOfferings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [terms, setTerms] = useState([]);
  const [batches, setBatches] = useState([]);
  const [faculty, setFaculty] = useState([]);
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
      const [o, c, t, b, u] = await Promise.all([
        apiCall('/api/course_offerings').then(r => r.json()),
        apiCall('/api/courses').then(r => r.json()),
        apiCall('/api/terms').then(r => r.json()),
        apiCall('/api/batches').then(r => r.json()),
        apiCall('/api/users').then(r => r.json()),
      ]);
      setOfferings(Array.isArray(o) ? o : []);
      setCourses(Array.isArray(c) ? c : []);
      setTerms(Array.isArray(t) ? t : []);
      setBatches(Array.isArray(b) ? b : []);
      setFaculty(Array.isArray(u) ? u : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function addOffering(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const res = await apiCall('/api/course_offerings', {
      method: 'POST',
      body: JSON.stringify({
        course_id: form.get('course_id'),
        term_id: form.get('term_id') || null,
        batch_id: form.get('batch_id') || null,
        capacity: form.get('capacity') || null,
        faculty_id: form.get('faculty_id') || null,
        status: 'planned'
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not create offering.');
      return;
    }
    e.target.reset();
    reload();
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '18px' }}>Course Offerings</h1>

      {error && <div style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      <form onSubmit={addOffering} style={cardStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>New Offering</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <select name="course_id" style={inputStyle} required>
            <option value="">Select Course...</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
          <select name="term_id" style={inputStyle}>
            <option value="">Select Term (Optional)...</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select name="batch_id" style={inputStyle}>
            <option value="">Select Batch (Optional)...</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select name="faculty_id" style={inputStyle}>
            <option value="">Select Faculty (Optional)...</option>
            {faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input name="capacity" type="number" placeholder="Capacity" style={inputStyle} />
          <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer' }}>Add Offering</button>
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <thead style={{ background: 'var(--bg)' }}>
          <tr style={{ textAlign: 'left', fontSize: '12px' }}>
            <th style={{ padding: '12px' }}>Course</th>
            <th style={{ padding: '12px' }}>Term</th>
            <th style={{ padding: '12px' }}>Batch</th>
            <th style={{ padding: '12px' }}>Faculty</th>
            <th style={{ padding: '12px' }}>Status</th>
            <th style={{ padding: '12px' }}>Capacity</th>
          </tr>
        </thead>
        <tbody>
          {offerings.map(o => {
            const course = courses.find(c => c.id === o.course_id);
            const term = terms.find(t => t.id === o.term_id);
            const batch = batches.find(b => b.id === o.batch_id);
            const facultyMember = faculty.find(f => f.id === o.faculty_id);
            return (
              <tr key={o.id} style={{ borderTop: '1px solid var(--border)', fontSize: '13px' }}>
                <td style={{ padding: '12px' }}>{course ? `${course.code} - ${course.name}` : o.course_id}</td>
                <td style={{ padding: '12px' }}>{term?.name || '—'}</td>
                <td style={{ padding: '12px' }}>{batch?.name || '—'}</td>
                <td style={{ padding: '12px' }}>{facultyMember?.name || '—'}</td>
                <td style={{ padding: '12px' }}><span style={{ textTransform: 'capitalize', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>{o.status}</span></td>
                <td style={{ padding: '12px' }}>{o.capacity || '∞'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}