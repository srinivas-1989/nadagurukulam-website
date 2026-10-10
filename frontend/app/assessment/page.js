'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const LEVEL = { None: 0, View: 1, Self: 2, Submits: 3, Own: 4, Manage: 5, Full: 6 };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px', marginBottom: '12px' };
const inp = { padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px' };

// A due date is the end of that day, so a submission at 23:00 on the due date is
// still on time. Kept in one place because the list and each row both need it.
const dueMoment = (d) => (d ? new Date(d + 'T23:59:59') : null);
const isLate = (submittedAt, dueDate) => { const due = dueMoment(dueDate); return !!(submittedAt && due && new Date(submittedAt) > due); };

export default function AssessmentPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('None');
  const [me, setMe] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState({});
  const [answers, setAnswers] = useState({});
  const [form, setForm] = useState({ offering: '', title: '', scope: 'internal', max_marks: '100', weight: '0', due: '', desc: '', status: 'published' });

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
      const [perm, profiles] = await Promise.all([
        apiCall('/api/my-permissions'),
        get('/api/users'),
      ]);
      const lvl = perm.role_key === 'super_admin' ? 'Full' : (perm.perms?.assessment || 'None');
      setLevel(lvl);
      setUsers(profiles);
      setMe(profiles.find(u => u.email && session.user.email && u.email.toLowerCase() === session.user.email.toLowerCase()) || null);
      const [a, p, s, o, c, r] = await Promise.all([
        get('/api/assessments'), get('/api/assessment_plans'), get('/api/assessment_submissions'),
        get('/api/course_offerings'), get('/api/courses'), get('/api/course_registrations'),
      ]);
      setAssessments(a); setPlans(p); setSubmissions(s); setOfferings(o); setCourses(c); setRegistrations(r);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [apiCall]);

  useEffect(() => { reload(); }, [reload]);

  const rank = LEVEL[level] ?? 0;
  const canManage = rank >= LEVEL.Manage;
  const isSelf = rank === LEVEL.Self || (rank > LEVEL.None && rank < LEVEL.Manage);

  const offeringLabel = (offeringId) => {
    const o = offerings.find(x => x.id === offeringId);
    if (!o) return '—';
    const c = courses.find(x => x.id === o.course_id);
    return c ? `${c.code} · ${c.name}` : (o.course_id || '—');
  };
  const userName = (id) => users.find(u => u.id === id)?.name || (id ? id.slice(0, 6) : '—');

  // plan → offering, so an assessment's offering and the student's registration
  // can be compared without asking the API for the join.
  const offeringOfAssessment = (a) => plans.find(p => p.id === a.plan_id)?.course_offering_id || null;
  const myOfferingIds = new Set(registrations.filter(r => r.student_id === me?.id).map(r => r.course_offering_id));
  const mySubmission = (assessmentId) => submissions.find(s => s.assessment_id === assessmentId && s.student_id === me?.id);

  const subsFor = (assessmentId) => submissions.filter(s => s.assessment_id === assessmentId);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.offering || !form.title) return;
    try {
      await apiCall('/api/assessments', { method: 'POST', body: JSON.stringify({
        course_offering_id: form.offering, title: form.title, assessment_scope: form.scope,
        max_marks: Number(form.max_marks) || 100, weight_percent: Number(form.weight) || 0,
        due_date: form.due || null, description: form.desc || null, status: form.status,
      }) });
      setForm({ offering: '', title: '', scope: 'internal', max_marks: '100', weight: '0', due: '', desc: '', status: 'published' });
      reload();
    } catch (err) { alert(err.message); }
  }

  async function handleSetStatus(a, status) {
    try { await apiCall(`/api/assessments/${a.id}`, { method: 'PUT', body: JSON.stringify({ status }) }); reload(); }
    catch (err) { alert(err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this assessment and its submissions?')) return;
    try { await apiCall(`/api/assessments/${id}`, { method: 'DELETE' }); reload(); }
    catch (err) { alert(err.message); }
  }

  async function uploadEvidence(assessmentId, file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { alert('File too large (max 15 MB)'); return; }
    setUploading(true);
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
      const j = await apiCall('/api/upload', { method: 'POST', body: JSON.stringify({ filename: file.name, mime: file.type || 'application/octet-stream', data: b64 }) });
      if (j?.url) setUploads(prev => ({ ...prev, [assessmentId]: j.url }));
    } catch (err) { alert(err.message); } finally { setUploading(false); }
  }

  async function handleStart(a) {
    if (!me?.id) { alert('Profile not loaded'); return; }
    try {
      await apiCall('/api/assessment_submissions', { method: 'POST', body: JSON.stringify({ assessment_id: a.id, student_id: me.id, status: 'pending' }) });
      reload();
    } catch (err) { alert(err.message); }
  }

  async function handleSubmit(a) {
    const sub = mySubmission(a.id);
    if (!sub) { alert('Press Start first.'); return; }
    const evidence = (uploads[a.id] || '').trim() || null;
    const notes = (answers[a.id] || '').trim() || null;
    if (!evidence && !notes) { alert('Attach a file/video or write an answer before submitting.'); return; }
    try {
      await apiCall(`/api/assessment_submissions/${sub.id}`, { method: 'PUT', body: JSON.stringify({ status: 'submitted', evidence_url: evidence, notes }) });
      reload();
    } catch (err) { alert(err.message); }
  }

  async function handleEvaluate(sub) {
    try { await apiCall(`/api/assessment_submissions/${sub.id}`, { method: 'PUT', body: JSON.stringify({ status: 'evaluated' }) }); reload(); }
    catch (err) { alert(err.message); }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading…</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--primary)' }}>{error}</div>;
  if (rank === LEVEL.None) return <div style={{ padding: '24px', color: 'var(--text-faint)' }}>You do not have access to assessments.</div>;

  const visible = canManage ? assessments : assessments.filter(a => {
    if (a.status === 'draft') return false;
    const off = offeringOfAssessment(a);
    return myOfferingIds.size === 0 || myOfferingIds.has(off);
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      <h1 style={{ color: 'var(--primary)', fontSize: '22px', marginBottom: '4px' }}>Assessment &amp; Examination</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: 0 }}>
        Plans → assessments → submissions. Students submit a file/video link or a written answer; late submissions are flagged against the due date.
      </p>

      {canManage && (
        <form onSubmit={handleCreate} style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select value={form.offering} onChange={e => setForm({ ...form, offering: e.target.value })} required style={{ ...inp, flex: '1 1 240px' }}>
            <option value="">Select course offering…</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{offeringLabel(o.id)}</option>)}
          </select>
          <input placeholder="Assessment title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={{ ...inp, flex: '1 1 200px' }} />
          <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} style={inp}>
            <option value="internal">Internal</option><option value="external">External</option>
            <option value="practical">Practical</option><option value="skill">Skill</option>
          </select>
          <input type="number" min="1" placeholder="Max marks" value={form.max_marks} onChange={e => setForm({ ...form, max_marks: e.target.value })} style={{ ...inp, width: '110px' }} />
          <input type="number" min="0" placeholder="Weight %" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} style={{ ...inp, width: '100px' }} />
          <input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} style={inp} />
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>
            <option value="draft">Draft</option><option value="published">Published</option>
          </select>
          <textarea placeholder="Instructions (optional)" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} style={{ ...inp, flex: '1 1 100%', minHeight: '50px' }} />
          <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '4px', cursor: 'pointer' }}>Create assessment</button>
        </form>
      )}

      {visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-faint)' }}>No assessments yet.</div>
      ) : visible.map(a => {
        const off = offeringOfAssessment(a);
        const subs = subsFor(a.id);
        const due = dueMoment(a.due_date);
        const overdue = due && new Date() > due;
        const lateCount = subs.filter(s => isLate(s.submitted_at, a.due_date)).length;
        const mine = isSelf ? mySubmission(a.id) : null;
        const mineLate = mine ? isLate(mine.submitted_at, a.due_date) : false;
        return (
          <div key={a.id} style={card}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '15px' }}>
                  {a.title} <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: '11.5px' }}>{a.assessment_scope} · max {a.max_marks} · weight {a.weight_percent}%</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>{offeringLabel(off)}</div>
                {a.description ? <div style={{ fontSize: '12.5px', color: 'var(--text-soft)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{a.description}</div> : null}
                <div style={{ fontSize: '11.5px', color: overdue ? '#b45309' : 'var(--text-faint)', marginTop: '4px' }}>
                  Due: {a.due_date || '—'} {overdue ? '· past due' : ''} · Status: {a.status}
                </div>
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={a.status} onChange={e => handleSetStatus(a, e.target.value)} style={{ ...inp, padding: '4px 8px', fontSize: '12px' }}>
                    <option value="draft">Draft</option><option value="published">Published</option>
                    <option value="open">Open</option><option value="closed">Closed</option><option value="evaluated">Evaluated</option>
                  </select>
                  <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                </div>
              )}
            </div>

            {canManage ? (
              <div style={{ marginTop: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-soft)', marginBottom: '6px' }}>
                  <b style={{ color: 'var(--text)' }}>{subs.length} submission{subs.length !== 1 ? 's' : ''}</b> · <span style={{ color: '#b45309' }}>{lateCount} late</span> · <span style={{ color: '#15803d' }}>{subs.filter(s => s.status === 'submitted').length} awaiting</span> · {subs.filter(s => s.status === 'evaluated').length} evaluated
                </div>
                {subs.length === 0 ? <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No student activity yet.</div> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                        <th style={{ padding: '6px 8px' }}>Student</th><th style={{ padding: '6px 8px' }}>Status</th><th style={{ padding: '6px 8px' }}>Submitted</th><th style={{ padding: '6px 8px' }}>Evidence</th><th style={{ padding: '6px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map(s => {
                        const sLate = isLate(s.submitted_at, a.due_date);
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }}>{userName(s.student_id)}</td>
                            <td style={{ padding: '6px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: s.status === 'evaluated' ? 'var(--primary)' : s.status === 'submitted' ? '#15803d' : '#b45309', color: '#fff' }}>{s.status}{sLate ? ' · late' : ''}</span></td>
                            <td style={{ padding: '6px 8px', fontSize: '11.5px', color: 'var(--text-soft)' }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</td>
                            <td style={{ padding: '6px 8px' }}>{s.evidence_url ? <a href={s.evidence_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>📎 link</a> : <span style={{ color: 'var(--text-faint)' }}>—</span>}{s.notes ? <span title={s.notes} style={{ color: 'var(--text-soft)', fontSize: '11px', marginLeft: '6px' }}>· {s.notes.slice(0, 32)}{s.notes.length > 32 ? '…' : ''}</span> : null}</td>
                            <td style={{ padding: '6px 8px' }}>{s.status !== 'evaluated' && s.status === 'submitted' ? <button onClick={() => handleEvaluate(s)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Mark evaluated</button> : null}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {!mine ? (
                  <><span style={{ fontSize: '12px', color: 'var(--text-faint)', background: 'var(--bg)', padding: '4px 8px', borderRadius: '99px' }}>Not started</span><button onClick={() => handleStart(a)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Start</button></>
                ) : mine.status !== 'evaluated' && mine.status !== 'submitted' ? (
                  <>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEvidence(a.id, f); e.target.value = ''; }} style={{ fontSize: '12px', maxWidth: '180px' }} />
                    <input placeholder="…or paste a file/video link" value={uploads[a.id] || ''} onChange={e => setUploads(prev => ({ ...prev, [a.id]: e.target.value }))} style={{ ...inp, flex: '1 1 180px', maxWidth: '260px' }} />
                    <textarea placeholder="…or write your answer" value={answers[a.id] || ''} onChange={e => setAnswers(prev => ({ ...prev, [a.id]: e.target.value }))} style={{ ...inp, flex: '1 1 100%', minHeight: '44px' }} />
                    <button onClick={() => handleSubmit(a)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Submit{uploading ? ' (uploading…)' : ''}</button>
                    {overdue ? <span style={{ fontSize: '11px', color: '#991b1b' }}>past due — will be marked late</span> : null}
                  </>
                ) : mine.status === 'submitted' ? (
                  <><span style={{ background: '#15803d', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '11.5px' }}>Submitted{mineLate ? ' · late' : ' · on time'}</span><span style={{ fontSize: '11.5px', color: 'var(--text-soft)' }}>{mine.submitted_at ? new Date(mine.submitted_at).toLocaleString() : ''}</span>{mine.evidence_url ? <a href={mine.evidence_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary)' }}>📎 your file</a> : null}<span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>· awaiting evaluation</span></>
                ) : (
                  <><span style={{ background: 'var(--primary)', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '11.5px' }}>Evaluated</span><span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>{mine.evidence_url ? <a href={mine.evidence_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>📎 your submission</a> : null}</span></>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
