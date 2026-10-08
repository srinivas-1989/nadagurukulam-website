'use client';
import { useState, useEffect } from 'react';
import React from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', marginBottom: '18px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer' };
const btnGhost = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-soft)', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer' };

const TYPE_LABELS = {
  guru: 'Guru',
  academic_mentor: 'Academic Mentor',
  course_faculty: 'Course Faculty',
  hostel_mentor: 'Hostel Mentor',
  advisor: 'Advisor',
};

export default function StudentRelationshipsPage() {
  const [relationships, setRelationships] = useState([]);
  const [notes, setNotes] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [expanded, setExpanded] = useState('');
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
      const [r, n, u] = await Promise.all([
        apiCall('/api/student_relationships').then(r => r.json()),
        apiCall('/api/mentor_progress_notes').then(r => r.json()),
        apiCall('/api/users').then(r => r.json()),
      ]);
      setRelationships(Array.isArray(r) ? r : []);
      setNotes(Array.isArray(n) ? n : []);
      setUsers(Array.isArray(u) ? u : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function addRelationship(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const res = await apiCall('/api/student_relationships', {
      method: 'POST',
      body: JSON.stringify({
        student_id: form.get('student_id'),
        mentor_id: form.get('mentor_id'),
        relationship_type: form.get('relationship_type'),
        scope: form.get('scope'),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not create relationship.');
      return;
    }
    e.target.reset();
    reload();
  }

  async function addNote(relationshipId, e) {
    e.preventDefault();
    e.stopPropagation();
    const form = new FormData(e.target);
    const res = await apiCall('/api/mentor_progress_notes', {
      method: 'POST',
      body: JSON.stringify({
        relationship_id: relationshipId,
        title: form.get('title'),
        content: form.get('content'),
        is_confidential: form.get('is_confidential') === 'on',
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not save note.');
      return;
    }
    e.target.reset();
    reload();
  }

  async function endRelationship(id) {
    if (!confirm('End this relationship? History is kept — the record is marked ended, not deleted.')) return;
    const res = await apiCall(`/api/student_relationships/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'ended' }) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not end relationship.');
      return;
    }
    reload();
  }

  const userName = id => users.find(u => u.id === id)?.name || '—';

  const visible = relationships
    .filter(r => (filterType ? r.relationship_type === filterType : true))
    .filter(r => (filterStudent ? r.student_id === filterStudent : true));

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '6px' }}>Guru &amp; Mentor Relationships</h1>
      <p style={{ color: 'var(--text-soft)', fontSize: '13.5px', marginBottom: '18px', maxWidth: '70ch' }}>
        Mentoring is explicit and separate from course teaching. A student may hold a Guru, Academic Mentor,
        Hostel Mentor or Advisor at once, and each relationship keeps its own history when the person changes.
      </p>

      {error && <div style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      <form onSubmit={addRelationship} style={cardStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '15px' }}>New Relationship</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <select name="student_id" style={inputStyle} required>
            <option value="">Select Student...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select name="mentor_id" style={inputStyle} required>
            <option value="">Select Guru / Mentor...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select name="relationship_type" style={inputStyle}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="scope" style={inputStyle}>
            <option value="institutional">Institutional</option>
            <option value="campus">Campus</option>
            <option value="department">Department</option>
            <option value="course">Course</option>
            <option value="assigned">Assigned</option>
          </select>
          <button type="submit" style={btn}>Add Relationship</button>
        </div>
      </form>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
          <option value="">All relationship types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} style={inputStyle}>
          <option value="">All students</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '12.5px', color: 'var(--text-faint)', alignSelf: 'center' }}>
          {visible.length} relationship{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <thead style={{ background: 'var(--bg)' }}>
          <tr style={{ textAlign: 'left', fontSize: '12px' }}>
            <th style={{ padding: '12px' }}>Student</th>
            <th style={{ padding: '12px' }}>Guru / Mentor</th>
            <th style={{ padding: '12px' }}>Type</th>
            <th style={{ padding: '12px' }}>Scope</th>
            <th style={{ padding: '12px' }}>Since</th>
            <th style={{ padding: '12px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(rel => {
            const relNotes = notes.filter(n => n.relationship_id === rel.id);
            return (
              <React.Fragment key={rel.id}>
                <tr
                  onClick={() => setExpanded(expanded === rel.id ? '' : rel.id)}
                  style={{ borderTop: '1px solid var(--border)', fontSize: '13px', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px' }}>{userName(rel.student_id)}</td>
                  <td style={{ padding: '12px' }}>{userName(rel.mentor_id)}</td>
                  <td style={{ padding: '12px' }}>{TYPE_LABELS[rel.relationship_type] || rel.relationship_type}</td>
                  <td style={{ padding: '12px', textTransform: 'capitalize' }}>{rel.scope}</td>
                  <td style={{ padding: '12px' }}>{rel.start_date || '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      textTransform: 'capitalize', padding: '2px 6px', borderRadius: '4px',
                      background: rel.status === 'active' ? 'var(--bg)' : 'var(--bg-saffron)',
                    }}>{rel.status}</span>
                  </td>
                </tr>
                {expanded === rel.id && (
                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <td colSpan={6} style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--primary)' }}>
                          Progress Notes ({relNotes.length})
                        </h4>
                        {rel.status === 'active' && (
                          <button type="button" style={btnGhost} onClick={e => { e.stopPropagation(); endRelationship(rel.id); }}>
                            End Relationship
                          </button>
                        )}
                      </div>

                      {relNotes.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: 0 }}>No notes recorded yet.</p>}
                      {relNotes.map(n => (
                        <div key={n.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                            <strong style={{ fontSize: '12.5px' }}>{n.title}</strong>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>{n.note_date}</span>
                            {n.is_confidential && <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>CONFIDENTIAL</span>}
                          </div>
                          <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: 'var(--text-soft)', whiteSpace: 'pre-wrap' }}>{n.content}</p>
                        </div>
                      ))}

                      {rel.status === 'active' && (
                        <form onSubmit={e => addNote(rel.id, e)} style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <input name="title" placeholder="Note title" required style={inputStyle} />
                          <textarea name="content" placeholder="Progress note" required rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                              <input type="checkbox" name="is_confidential" /> Confidential
                            </label>
                            <button type="submit" style={btn}>Save Note</button>
                          </div>
                        </form>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}