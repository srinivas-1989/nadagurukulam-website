'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const APPLICATION_STATUSES = ['submitted', 'screening', 'audition', 'selected', 'admitted', 'rejected'];
const SCREENING_STATUSES = ['pending', 'pass', 'fail'];
const AUDITION_STATUSES = ['scheduled', 'completed', 'passed', 'failed'];

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', marginBottom: '18px' };
const primaryBtn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };
const ghostBtn = { background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '9px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };

export default function AdmissionsPage() {
  const [applicants, setApplicants] = useState([]);
  const [applications, setApplications] = useState([]);
  const [screening, setScreening] = useState([]);
  const [auditions, setAuditions] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('applications');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return fetch(`${apiUrl}${path}`, { ...options, headers });
  }

  async function reload() {
    try {
      const [ap, app, scr, aud, prog, usr] = await Promise.all([
        apiCall('/api/admissions/applicants').then(r => r.json()),
        apiCall('/api/admissions/applications').then(r => r.json()),
        apiCall('/api/admissions/screening').then(r => r.json()),
        apiCall('/api/admissions/auditions').then(r => r.json()),
        apiCall('/api/curriculum').then(r => r.json()),
        apiCall('/api/users').then(r => r.json()),
      ]);
      setApplicants(Array.isArray(ap) ? ap : []);
      setApplications(Array.isArray(app) ? app : []);
      setScreening(Array.isArray(scr) ? scr : []);
      setAuditions(Array.isArray(aud) ? aud : []);
      setProgrammes(Array.isArray(prog) ? prog : []);
      setUsers(Array.isArray(usr) ? usr : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function post(path, body, onDone) {
    setError('');
    const res = await apiCall(path, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Request failed.');
      return false;
    }
    onDone?.();
    reload();
    return true;
  }

  async function addApplicant(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/admissions/applicants', {
      name: f.get('name'),
      email: f.get('email'),
      phone: f.get('phone') || null,
      date_of_birth: f.get('date_of_birth') || null,
    })) e.target.reset();
  }

  async function addApplication(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/admissions/applications', {
      applicant_id: f.get('applicant_id'),
      programme_id: f.get('programme_id') || null,
      status: f.get('status') || undefined,
    })) e.target.reset();
  }

  async function addScreening(e, applicationId) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/admissions/screening', {
      application_id: applicationId,
      reviewer_id: f.get('reviewer_id') || null,
      score: f.get('score') || null,
      feedback: f.get('feedback') || null,
      status: f.get('status') || 'pending',
    })) e.target.reset();
  }

  async function addAudition(e, applicationId) {
    e.preventDefault();
    const f = new FormData(e.target);
    let panelists = null, rubric = null;
    try { if (f.get('panelists')) panelists = JSON.parse(f.get('panelists')); } catch { setError('Panelists must be valid JSON array.'); return; }
    try { if (f.get('rubric_scores')) rubric = JSON.parse(f.get('rubric_scores')); } catch { setError('Rubric scores must be valid JSON.'); return; }
    if (await post('/api/admissions/auditions', {
      application_id: applicationId,
      audition_date: f.get('audition_date') || null,
      panelists: panelists ? JSON.stringify(panelists) : null,
      rubric_scores: rubric ? JSON.stringify(rubric) : null,
      status: f.get('status') || 'scheduled',
    })) e.target.reset();
  }

  async function advanceStatus(appId, current) {
    const idx = APPLICATION_STATUSES.indexOf(current);
    if (idx === -1 || idx === APPLICATION_STATUSES.length - 1) return;
    const next = APPLICATION_STATUSES[idx + 1];
    setError('');
    const res = await apiCall(`/api/admissions/applications/${appId}`, {
      method: 'PUT', body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not advance status.');
    }
    reload();
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  const applicantName = (id) => applicants.find(a => a.id === id)?.name || (id ? id.slice(0, 8) : '—');
  const applicantEmail = (id) => applicants.find(a => a.id === id)?.email || '—';
  const programmeName = (id) => programmes.find(p => p.id === id)?.name || '—';
  const userName = (id) => users.find(u => u.id === id)?.full_name || users.find(u => u.id === id)?.name || (id ? id.slice(0, 8) : '—');

  const TABS = [
    { key: 'applications', label: `Applications (${applications.length})` },
    { key: 'applicants', label: `Applicants (${applicants.length})` },
    { key: 'screening', label: `Screening (${screening.length})` },
    { key: 'auditions', label: `Auditions (${auditions.length})` },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Admissions</h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '18px' }}>
        Applicants, applications, screening decisions, and auditions.
      </p>

      {error && (
        <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Add forms */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>New Applicant</h3>
          <form onSubmit={addApplicant} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <input name="name" placeholder="Full name" style={{ ...inputStyle, flex: '2 1 140px' }} required maxLength={120} />
            <input name="email" type="email" placeholder="Email" style={{ ...inputStyle, flex: '2 1 160px' }} required maxLength={160} />
            <input name="phone" placeholder="Phone" style={{ ...inputStyle, flex: '1 1 110px' }} maxLength={20} />
            <input name="date_of_birth" type="date" style={inputStyle} />
            <button type="submit" style={primaryBtn}>Add Applicant</button>
          </form>
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>New Application</h3>
          <form onSubmit={addApplication} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <select name="applicant_id" style={inputStyle} required>
              <option value="">Select applicant...</option>
              {applicants.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
            </select>
            <select name="programme_id" style={inputStyle}>
              <option value="">Select programme...</option>
              {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select name="status" style={inputStyle} defaultValue="submitted">
              {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="submit" style={primaryBtn}>Add Application</button>
          </form>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
              background: tab === t.key ? 'var(--primary)' : 'var(--bg)',
              color: tab === t.key ? '#fff' : 'var(--text)',
              border: tab === t.key ? 'none' : '1px solid var(--border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'applications' && (
        <div style={cardStyle}>
          {applications.length === 0 ? <p style={{ color: 'var(--text-faint)' }}>No applications yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px' }}>Applicant</th>
                  <th style={{ padding: '6px 8px' }}>Programme</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th style={{ padding: '6px 8px' }}>Submitted</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => (
                  <tr key={app.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <strong>{applicantName(app.applicant_id)}</strong>
                      <div style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{applicantEmail(app.applicant_id)}</div>
                    </td>
                    <td style={{ padding: '6px 8px' }}>{programmeName(app.programme_id)}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{ textTransform: 'capitalize', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{app.status}</span>
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      {app.status !== 'rejected' && app.status !== 'admitted' && (
                        <button onClick={() => advanceStatus(app.id, app.status)} style={ghostBtn}>
                          Advance →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'applicants' && (
        <div style={cardStyle}>
          {applicants.length === 0 ? <p style={{ color: 'var(--text-faint)' }}>No applicants yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px' }}>Name</th>
                  <th style={{ padding: '6px 8px' }}>Email</th>
                  <th style={{ padding: '6px 8px' }}>Phone</th>
                  <th style={{ padding: '6px 8px' }}>Date of Birth</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{a.name}</td>
                    <td style={{ padding: '6px 8px' }}>{a.email}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{a.phone || '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{a.date_of_birth || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'screening' && (
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Record Screening Decision</h3>
          {applications.length === 0 ? <p style={{ color: 'var(--text-faint)' }}>Create an application first.</p> : (
            <form onSubmit={e => addScreening(e, e.target.elements.application_id.value)} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginBottom: '18px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Application
                <select name="application_id" style={inputStyle} required>
                  {applications.map(a => <option key={a.id} value={a.id}>{applicantName(a.applicant_id)} — {a.status}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Reviewer
                <select name="reviewer_id" style={inputStyle}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.name || u.email}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Score (0-100)
                <input name="score" type="number" min={0} max={100} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Decision
                <select name="status" style={inputStyle} defaultValue="pending">
                  {SCREENING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <input name="feedback" placeholder="Feedback" style={{ ...inputStyle, flex: '2 1 200px' }} maxLength={1000} />
              <button type="submit" style={primaryBtn}>Save Screening</button>
            </form>
          )}

          {screening.length === 0 ? <p style={{ color: 'var(--text-faint)' }}>No screening records yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px' }}>Application</th>
                  <th style={{ padding: '6px 8px' }}>Reviewer</th>
                  <th style={{ padding: '6px 8px' }}>Score</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th style={{ padding: '6px 8px' }}>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {screening.map(s => {
                  const app = applications.find(a => a.id === s.application_id);
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>{app ? applicantName(app.applicant_id) : s.application_id?.slice(0, 8)}</td>
                      <td style={{ padding: '6px 8px' }}>{s.reviewer_id ? userName(s.reviewer_id) : '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{s.score ?? '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ textTransform: 'capitalize', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{s.status}</span>
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-faint)', maxWidth: '280px' }}>{s.feedback || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'auditions' && (
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Schedule Audition</h3>
          {applications.length === 0 ? <p style={{ color: 'var(--text-faint)' }}>Create an application first.</p> : (
            <form onSubmit={e => addAudition(e, e.target.elements.application_id.value)} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginBottom: '18px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Application
                <select name="application_id" style={inputStyle} required>
                  {applications.map(a => <option key={a.id} value={a.id}>{applicantName(a.applicant_id)} — {a.status}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Audition date
                <input type="date" name="audition_date" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                Status
                <select name="status" style={inputStyle} defaultValue="scheduled">
                  {AUDITION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <input name="panelists" placeholder='Panelists JSON e.g. ["id1","id2"]' style={{ ...inputStyle, flex: '2 1 200px' }} maxLength={2000} />
              <input name="rubric_scores" placeholder='Rubric JSON e.g. {"singing":8}' style={{ ...inputStyle, flex: '2 1 180px' }} maxLength={2000} />
              <button type="submit" style={primaryBtn}>Schedule</button>
            </form>
          )}

          {auditions.length === 0 ? <p style={{ color: 'var(--text-faint)' }}>No auditions yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px' }}>Application</th>
                  <th style={{ padding: '6px 8px' }}>Date</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th style={{ padding: '6px 8px' }}>Panelists</th>
                  <th style={{ padding: '6px 8px' }}>Rubric</th>
                </tr>
              </thead>
              <tbody>
                {auditions.map(a => {
                  const app = applications.find(x => x.id === a.application_id);
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>{app ? applicantName(app.applicant_id) : a.application_id?.slice(0, 8)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{a.audition_date || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ textTransform: 'capitalize', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{a.status}</span>
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-faint)', fontSize: '11px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.panelists || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-faint)', fontSize: '11px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.rubric_scores || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
