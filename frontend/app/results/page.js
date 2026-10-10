'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const LEVEL = { None: 0, View: 1, Self: 2, Submits: 3, Own: 4, Manage: 5, Full: 6 };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px', marginBottom: '12px' };
const inp = { padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px' };

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('None');
  const [me, setMe] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [results, setResults] = useState([]);
  const [offering, setOffering] = useState('');
  const [scheme, setScheme] = useState('');
  const [busy, setBusy] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const apiCall = useCallback(async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
    if (!res.ok) { const j = await res.json().catch(() => ({})); const e = new Error(j.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return res.json().catch(() => null);
  }, [apiUrl]);
  const get = (path) => apiCall(path).then(d => (Array.isArray(d) ? d : [])).catch(() => []);

  const reload = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); setLoading(false); return; }
      const [perm, profiles, s, o, c, r] = await Promise.all([
        apiCall('/api/my-permissions'), get('/api/users'), get('/api/grading_schemes'),
        get('/api/course_offerings'), get('/api/courses'), get('/api/results'),
      ]);
      setLevel(perm.role_key === 'super_admin' ? 'Full' : (perm.perms?.assessment || 'None'));
      setUsers(profiles);
      setMe(profiles.find(u => u.email && session.user.email && u.email.toLowerCase() === session.user.email.toLowerCase()) || null);
      setSchemes(s); setOfferings(o); setCourses(c); setResults(r);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [apiCall]);

  useEffect(() => { reload(); }, [reload]);

  const rank = LEVEL[level] ?? 0;
  const canManage = rank >= LEVEL.Manage;

  const offeringLabel = (id) => {
    const o = offerings.find(x => x.id === id);
    if (!o) return '—';
    const c = courses.find(x => x.id === o.course_id);
    return c ? `${c.code} · ${c.name}` : (o.course_id || '—');
  };
  const userName = (id) => users.find(u => u.id === id)?.name || (id ? id.slice(0, 6) : '—');
  const schemeName = (id) => schemes.find(s => s.id === id)?.name || '—';

  async function handleGenerate() {
    if (!offering) return;
    setBusy(true);
    try {
      const j = await apiCall('/api/results/generate', { method: 'POST', body: JSON.stringify({ course_offering_id: offering, grading_scheme_id: scheme || undefined }) });
      alert(`Generated ${j.generated} result(s).${j.skipped_published ? ` ${j.skipped_published} published result(s) left untouched — correct those instead.` : ''}`);
      reload();
    } catch (err) { alert(err.message); } finally { setBusy(false); }
  }

  async function handlePublish(r, publish) {
    try { await apiCall(`/api/results/${r.id}/publish`, { method: 'POST', body: JSON.stringify({ is_published: publish }) }); reload(); }
    catch (err) { alert(err.message); }
  }

  // Results are never edited in place — every change is a correction with a
  // reason, which the server records in result_corrections.
  async function handleCorrect(r) {
    const field = window.prompt(`Which field to correct?\nobtained_marks, maximum_marks, percentage, grade, grade_point, outcome`, 'obtained_marks');
    if (!field) return;
    const allowed = ['obtained_marks', 'maximum_marks', 'percentage', 'grade', 'grade_point', 'outcome'];
    if (!allowed.includes(field)) { alert('Not a correctable field.'); return; }
    const value = window.prompt(`New value for ${field}:`, r[field] ?? '');
    if (value === null) return;
    const reason = window.prompt('Reason for this correction (recorded permanently):', '');
    if (!reason || !reason.trim()) { alert('A reason is required.'); return; }
    try {
      await apiCall(`/api/results/${r.id}`, { method: 'PUT', body: JSON.stringify({ [field]: value, reason }) });
      reload();
    } catch (err) { alert(err.message); }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading…</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--primary)' }}>{error}</div>;
  if (rank === LEVEL.None) return <div style={{ padding: '24px', color: 'var(--text-faint)' }}>You do not have access to results.</div>;

  const visible = canManage ? results : results.filter(r => r.student_id === me?.id);
  const outcomeColor = (o) => (o === 'pass' ? '#15803d' : o === 'fail' ? '#991b1b' : '#b45309');

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      <h1 style={{ color: 'var(--primary)', fontSize: '22px', marginBottom: '4px' }}>Results &amp; Evaluation</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: 0 }}>
        Results are derived from evaluations, graded against a scheme&apos;s bands, then published. Published results are never overwritten — changes go through a recorded correction.
      </p>

      {canManage && (
        <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={offering} onChange={e => setOffering(e.target.value)} style={{ ...inp, flex: '1 1 240px' }}>
            <option value="">Select course offering…</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{offeringLabel(o.id)}</option>)}
          </select>
          <select value={scheme} onChange={e => setScheme(e.target.value)} style={inp}>
            <option value="">Default grading scheme</option>
            {schemes.map(s => <option key={s.id} value={s.id}>{s.name} (pass {s.passing_percent}%)</option>)}
          </select>
          <button onClick={handleGenerate} disabled={!offering || busy} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '4px', cursor: offering && !busy ? 'pointer' : 'not-allowed', opacity: offering && !busy ? 1 : 0.6 }}>
            {busy ? 'Generating…' : 'Generate from evaluations'}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-faint)' }}>No results to show.</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                {canManage && <th style={{ padding: '6px 8px' }}>Student</th>}
                <th style={{ padding: '6px 8px' }}>Offering</th>
                <th style={{ padding: '6px 8px' }}>Marks</th>
                <th style={{ padding: '6px 8px' }}>%</th>
                <th style={{ padding: '6px 8px' }}>Grade</th>
                <th style={{ padding: '6px 8px' }}>Outcome</th>
                <th style={{ padding: '6px 8px' }}>Scheme</th>
                <th style={{ padding: '6px 8px' }}>Published</th>
                {canManage && <th style={{ padding: '6px 8px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {canManage && <td style={{ padding: '6px 8px' }}>{userName(r.student_id)}</td>}
                  <td style={{ padding: '6px 8px', fontSize: '11.5px', color: 'var(--text-soft)' }}>{offeringLabel(r.course_offering_id)}</td>
                  <td style={{ padding: '6px 8px' }}>{r.obtained_marks ?? '—'} / {r.maximum_marks ?? '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{r.percentage == null ? '—' : `${r.percentage}%`}</td>
                  <td style={{ padding: '6px 8px' }}><b style={{ color: 'var(--primary)' }}>{r.grade || '—'}</b>{r.grade_point != null ? <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}> · {r.grade_point}</span> : null}</td>
                  <td style={{ padding: '6px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: outcomeColor(r.outcome), color: '#fff' }}>{r.outcome || 'pending'}</span></td>
                  <td style={{ padding: '6px 8px', fontSize: '11.5px', color: 'var(--text-faint)' }}>{schemeName(r.grading_scheme_id)}</td>
                  <td style={{ padding: '6px 8px', fontSize: '11.5px', color: r.is_published ? '#15803d' : 'var(--text-faint)' }}>{r.is_published ? `Yes${r.published_at ? ` · ${new Date(r.published_at).toLocaleDateString()}` : ''}` : 'No'}</td>
                  {canManage && (
                    <td style={{ padding: '6px 8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => handlePublish(r, !r.is_published)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>{r.is_published ? 'Unpublish' : 'Publish'}</button>
                      <button onClick={() => handleCorrect(r)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-soft)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Correct</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
