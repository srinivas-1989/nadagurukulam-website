'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', marginBottom: '18px' };

export default function AcademicCalendarPage() {
  const [years, setYears] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [savingYear, setSavingYear] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return fetch(`${apiUrl}${path}`, { ...options, headers });
  }

  async function reload() {
    try {
      const [y, t] = await Promise.all([
        apiCall('/api/academic_years').then(r => r.json()),
        apiCall('/api/terms').then(r => r.json()),
      ]);
      setYears(Array.isArray(y) ? y : []);
      setTerms(Array.isArray(t) ? t : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function addYear(e) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    setSavingYear(true);
    setError('');
    const res = await apiCall('/api/academic_years', {
      method: 'POST',
      body: JSON.stringify({ label, start_date: newStart || null, end_date: newEnd || null }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not create academic year.');
    } else {
      setNewLabel(''); setNewStart(''); setNewEnd('');
      reload();
    }
    setSavingYear(false);
  }

  async function makeCurrent(id) {
    setError('');
    // Only one year is current at a time: clear the flag everywhere first.
    await Promise.all(years.filter(y => y.is_current && y.id !== id).map(y =>
      apiCall(`/api/academic_years/${y.id}`, { method: 'PUT', body: JSON.stringify({ is_current: false }) })
    ));
    const res = await apiCall(`/api/academic_years/${id}`, { method: 'PUT', body: JSON.stringify({ is_current: true }) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not set current year.');
    }
    reload();
  }

  async function addTerm(e, yearId) {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = String(form.get('termName') || '').trim();
    if (!name) return;
    const res = await apiCall('/api/terms', {
      method: 'POST',
      body: JSON.stringify({
        academic_year_id: yearId,
        name,
        sequence: Number(form.get('termSeq')) || 1,
        start_date: form.get('termStart') || null,
        end_date: form.get('termEnd') || null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not create term.');
      return;
    }
    e.target.reset();
    reload();
  }

  async function removeYear(id) {
    if (!confirm('Delete this academic year? Its terms are deleted with it.')) return;
    const res = await apiCall(`/api/academic_years/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not delete academic year.');
    }
    reload();
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Academic Calendar</h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '18px' }}>
        Academic years group the terms in which courses are offered.
      </p>

      {error && (
        <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <form onSubmit={addYear} style={cardStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>New Academic Year</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            Label
            <input placeholder="2024-25" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={inputStyle} required maxLength={20} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            Start date
            <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            End date
            <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} style={inputStyle} />
          </label>
          <button type="submit" disabled={savingYear} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer' }}>
            {savingYear ? 'Saving…' : 'Add Year'}
          </button>
        </div>
      </form>

      {years.length === 0 ? (
        <p style={{ color: 'var(--text-faint)' }}>No academic years yet. Add the first one above.</p>
      ) : years.map(y => {
        const yearTerms = terms.filter(t => t.academic_year_id === y.id).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        return (
          <div key={y.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ color: 'var(--primary)', margin: 0 }}>{y.label}</h3>
                {y.is_current && <span style={{ background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700 }}>Current</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {!y.is_current && (
                  <button onClick={() => makeCurrent(y.id)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                    Set current
                  </button>
                )}
                <button onClick={() => removeYear(y.id)} style={{ background: 'none', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                  Delete
                </button>
              </div>
            </div>
            <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '4px 0 12px' }}>
              {y.start_date || '—'} to {y.end_date || '—'} · {yearTerms.length} term{yearTerms.length === 1 ? '' : 's'}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px' }}>Term</th>
                  <th style={{ padding: '6px 8px' }}>Seq</th>
                  <th style={{ padding: '6px 8px' }}>Dates</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {yearTerms.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '8px', color: 'var(--text-faint)' }}>No terms in this year yet.</td></tr>
                )}
                {yearTerms.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{t.name}</td>
                    <td style={{ padding: '6px 8px' }}>{t.sequence}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{t.start_date || '—'} to {t.end_date || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button onClick={async () => {
                        if (!confirm(`Delete term "${t.name}"?`)) return;
                        const r = await apiCall(`/api/terms/${t.id}`, { method: 'DELETE' });
                        if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error || 'Could not delete term.'); }
                        reload();
                      }} style={{ background: 'none', border: 'none', color: '#8b1f1f', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={e => addTerm(e, y.id)} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
              <input name="termName" placeholder="Term name" style={{ ...inputStyle, fontSize: '13px' }} required maxLength={80} />
              <input name="termSeq" type="number" defaultValue={1} min={1} max={20} style={{ ...inputStyle, width: '70px' }} title="Sequence" />
              <input name="termStart" type="date" style={{ ...inputStyle, fontSize: '13px' }} />
              <input name="termEnd" type="date" style={{ ...inputStyle, fontSize: '13px' }} />
              <button type="submit" style={{ background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '9px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Add Term</button>
            </form>
          </div>
        );
      })}
    </div>
  );
}