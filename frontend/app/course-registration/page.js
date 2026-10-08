'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '12px' };

export default function CourseRegistrationPage() {
  const [offerings, setOfferings] = useState([]);
  const [myRegs, setMyRegs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [terms, setTerms] = useState([]);
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
      const [o, r, c, t] = await Promise.all([
        apiCall('/api/course_offerings').then(x => x.json()),
        apiCall('/api/course_registrations').then(x => x.json()),
        apiCall('/api/courses').then(x => x.json()),
        apiCall('/api/terms').then(x => x.json()),
      ]);
      setOfferings(Array.isArray(o) ? o : []);
      setMyRegs(Array.isArray(r) ? r : []);
      setCourses(Array.isArray(c) ? c : []);
      setTerms(Array.isArray(t) ? t : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function register(offeringId) {
    setError('');
    const res = await apiCall('/api/course_registrations', {
      method: 'POST',
      body: JSON.stringify({ course_offering_id: offeringId })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not register.');
    }
    reload();
  }

  async function drop(regId) {
    if (!confirm('Drop this course registration? The row is kept for historical records and no longer counts toward capacity.')) return;
    const res = await apiCall(`/api/course_registrations/${regId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'dropped' })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not drop registration.');
    }
    reload();
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  const registeredOfferingIds = new Set(myRegs.filter(r => r.status === 'registered').map(r => r.course_offering_id));
  const openOfferings = offerings.filter(o => (o.status === 'planned' || o.status === 'active') && !registeredOfferingIds.has(o.id));

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '18px' }}>Course Registration</h1>

      {error && <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>My Registrations ({myRegs.filter(r => r.status === 'registered').length})</h3>
      {myRegs.filter(r => r.status === 'registered').length === 0 && <p style={{ color: 'var(--text-faint)' }}>You are not registered for any courses yet.</p>}

      {myRegs.filter(r => r.status === 'registered').map(r => {
        const offering = offerings.find(o => o.id === r.course_offering_id);
        const course = offering && courses.find(c => c.id === offering.course_id);
        return (
          <div key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>{course ? `${course.code} - ${course.name}` : 'Unknown Course'}</strong>
              <div style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
                {offering && terms.find(t => t.id === offering.term_id)?.name || 'No term'}
              </div>
            </div>
            <button onClick={() => drop(r.id)} style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Drop</button>
          </div>
        );
      })}

      <h3 style={{ color: 'var(--primary)', margin: '28px 0 12px' }}>Open Offerings</h3>
      {openOfferings.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No open offerings right now.</p>}

      {openOfferings.map(o => {
        const course = courses.find(c => c.id === o.course_id);
        const term = terms.find(t => t.id === o.term_id);
        return (
          <div key={o.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>{course ? `${course.code} - ${course.name}` : 'Unknown Course'}</strong>
              <div style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
                {term?.name || 'No term'}{o.capacity ? ` · seats: ${o.capacity}` : ''}
              </div>
            </div>
            <button onClick={() => register(o.id)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              Register
            </button>
          </div>
        );
      })}
    </div>
  );
}