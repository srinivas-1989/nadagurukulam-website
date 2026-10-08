'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// The appraisal scale, in the order mentors read it down the page.
const SCALE = ['Exemplary', 'Strong', 'Satisfactory', 'Developing', 'Needs Significant Guidance', 'N/O'];
const SCALE_LABEL = { Exemplary: 'Exemplary', Strong: 'Strong', Satisfactory: 'Satisfactory', Developing: 'Developing', 'Needs Significant Guidance': 'Needs Significant Guidance', 'N/O': 'Not Observed' };

const STATUS_TONE = {
  draft: 'var(--accent)',
  submitted: '#0b7285',
  in_review: '#5f3dc4',
  finalized: 'var(--primary)',
  reviewed: 'var(--primary)'
};

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const btn = { padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' };
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' };
const input = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' };

export default function DossiersPage() {
  const [profile, setProfile] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [sheet, setSheet] = useState(null);
  const [responses, setResponses] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [versions, setVersions] = useState([]);
  const saveTimer = useRef(null);
  const cleared = useRef(new Set());

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const call = useCallback(async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${apiUrl}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(options.headers || {})
      }
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  }, [apiUrl]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: rows } = await supabase.from('users').select('id, name, role_key').eq('role_key', 'student').order('name');
      setStudents(rows || []);
    })();
  }, []);

  const load = useCallback(async (sid, mth) => {
    if (!sid) { setSheet(null); return; }
    setBusy(true); setMsg(null);
    try {
      const data = await call(`/dossiers/students/${sid}/${mth}`);
      setSheet(data);
      setResponses(data.responses || {});
      cleared.current = new Set();
      setDirty(false);
      if (data.assessment_id) {
        setVersions(await call(`/dossiers/assessments/${data.assessment_id}/versions`));
      } else setVersions([]);
    } catch (e) {
      setSheet(null);
      setMsg({ tone: 'bad', text: e.message });
    } finally { setBusy(false); }
  }, [call]);

  useEffect(() => { load(studentId, month); }, [studentId, month, load]);

  // Autosave after a pause in typing. A dossier is a long form and a lost
  // half-written evaluation is the kind of thing that erodes trust in it.
  const queueSave = useCallback(() => {
    setDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => submit('save'), 3000);
  }, [studentId, month]);

  const submit = async (action) => {
    clearTimeout(saveTimer.current);
    setBusy(true); setMsg(null);
    try {
      const body = JSON.stringify({
        responses,
        cleared_qids: [...cleared.current],
        action_type: action === 'submit' ? 'submit_final' : 'save_draft'
      });
      await call(`/dossiers/students/${studentId}/${month}`, { method: 'POST', body });
      cleared.current = new Set();
      setDirty(false);
      await load(studentId, month);
      setMsg({ tone: 'ok', text: action === 'submit' ? 'Submitted to the campus incharge for review.' : 'Draft saved.' });
    } catch (e) {
      setMsg({ tone: 'bad', text: e.message });
    } finally { setBusy(false); }
  };

  const transition = async (action, body) => {
    setBusy(true); setMsg(null);
    try {
      await call(`/dossiers/students/${studentId}/${month}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) });
      await load(studentId, month);
    } catch (e) { setMsg({ tone: 'bad', text: e.message }); }
    finally { setBusy(false); }
  };

  const restore = async (versionNo) => {
    if (!confirm(`Restore version ${versionNo}? The current state is kept as a version first, so this is reversible.`)) return;
    setBusy(true);
    try {
      await call(`/dossiers/assessments/${sheet.assessment_id}/restore/${versionNo}`, { method: 'POST' });
      await load(studentId, month);
      setMsg({ tone: 'ok', text: `Restored version ${versionNo}.` });
    } catch (e) { setMsg({ tone: 'bad', text: e.message }); }
    finally { setBusy(false); }
  };

  const answer = (q, value) => {
    cleared.current.delete(q.id);
    setResponses(r => ({ ...r, [q.id]: value }));
    queueSave();
  };
  const clearAnswer = (q) => {
    cleared.current.add(q.id);
    setResponses(r => { const n = { ...r }; delete n[q.id]; return n; });
    queueSave();
  };

  const raiseHighlight = async (questionId, text) => {
    try {
      const { flags } = await call(`/dossiers/students/${studentId}/${month}/highlights`, {
        method: 'POST', body: JSON.stringify({ question_id: questionId, message: text })
      });
      setSheet(s => ({ ...s, flags }));
    } catch (e) { setMsg({ tone: 'bad', text: e.message }); }
  };

  const student = students.find(s => s.id === studentId);
  const sections = sheet?.sections || [];
  let runningNo = 0;

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      {/* ── Pickers ── */}
      <div style={panel}>
        <h4 style={{ margin: '0 0 12px', color: 'var(--primary)', fontSize: '16px' }}>Monthly Student Dossier</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ ...input, minWidth: '240px' }}>
            <option value="">— Select a student —</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={input} />
          {sheet && <span style={{ fontSize: '13px', color: 'var(--text-soft)' }}>
            {sheet.blueprint?.name || 'No blueprint assigned'}
          </span>}
          {sheet && (
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: STATUS_TONE[sheet.status] || 'var(--text-soft)', border: `1px solid ${STATUS_TONE[sheet.status]}`, borderRadius: '999px', padding: '3px 10px' }}>
              {sheet.status.replace('_', ' ')}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {dirty && <span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>Unsaved changes…</span>}
          {sheet && !sheet.locked && sheet.sections.some(s => s.can_edit) && (
            <>
              <button style={btn} disabled={busy} onClick={() => submit('save')}>Save draft</button>
              <button style={btnPrimary} disabled={busy} onClick={() => submit('submit')}>Submit for review</button>
            </>
          )}
        </div>
        {msg && <p style={{ margin: '10px 0 0', fontSize: '13px', color: msg.tone === 'ok' ? 'var(--primary)' : '#c92a2a' }}>{msg.text}</p>}
      </div>

      {/* ── Reviewer action bar ── */}
      {sheet && (sheet.status === 'submitted' || sheet.status === 'in_review' || sheet.status === 'finalized') && (
        <div style={{ ...panel, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', borderColor: STATUS_TONE[sheet.status] }}>
          <strong style={{ fontSize: '13px', color: STATUS_TONE[sheet.status] }}>
            {sheet.status === 'finalized' ? 'Finalised — locked for everyone.' : 'Locked — awaiting campus incharge.'}
          </strong>
          <span style={{ flex: 1 }} />
          {sheet.status === 'submitted' && <button style={btn} disabled={busy} onClick={() => transition('review')}>Mark in review</button>}
          {['submitted', 'in_review'].includes(sheet.status) && <button style={btnPrimary} disabled={busy} onClick={() => transition('finalize')}>Finalise</button>}
          <button style={btn} disabled={busy} onClick={() => transition('reopen', { reason: 'Reopened from portal' })}>Reopen</button>
        </div>
      )}

      {/* ── Version history ── */}
      {versions.length > 0 && (
        <div style={panel}>
          <strong style={{ fontSize: '13px' }}>Version history</strong>
          <span style={{ fontSize: '12px', color: 'var(--text-soft)', marginLeft: '8px' }}>
            Every state change is snapshotted, so a wrong entry can be walked back.
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {versions.map(v => (
              <span key={v.id} style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
                <b>v{v.version_no}</b>
                <span style={{ color: 'var(--text-soft)', fontSize: '12px' }}>
                  {v.from_status ? `${v.from_status} → ` : ''}{v.to_status} · {new Date(v.created_at).toLocaleString()}
                </span>
                <button style={{ ...btn, padding: '2px 8px', fontSize: '11px' }} disabled={busy} onClick={() => restore(v.version_no)}>Restore</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── The sheet ── */}
      {busy && !sheet && <div style={panel}>Loading…</div>}

      {!studentId && <div style={{ ...panel, color: 'var(--text-soft)', fontSize: '13px' }}>Choose a student to open their dossier.</div>}

      {sheet && !sheet.blueprint && (
        <div style={{ ...panel, color: 'var(--text-soft)', fontSize: '13px' }}>
          No evaluation blueprint is assigned to {student?.name || 'this student'}. An admin must set one on the
          student record (or on their hostel mentor, who supplies it to all their students).
        </div>
      )}

      {sections.map(section => (
        <div key={section.id} style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h5 style={{ margin: 0, fontSize: '14px', color: 'var(--primary)' }}>{section.title}</h5>
            {!section.can_edit && <span style={{ fontSize: '11px', color: 'var(--text-soft)', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 8px' }}>Read only</span>}
            {section.can_edit && (
              <button
                style={{ ...btn, marginLeft: 'auto', padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  const qs = section.questions.filter(q => responses[q.id] !== undefined).map(q => q.id);
                  if (!qs.length || !confirm(`Clear all ${qs.length} answered question(s) in "${section.title}"?`)) return;
                  qs.forEach(qid => cleared.current.add(qid));
                  setResponses(r => { const n = { ...r }; qs.forEach(qid => delete n[qid]); return n; });
                  queueSave();
                }}
              >Reset section</button>
            )}
          </div>

          {section.questions.map(q => {
            runningNo += 1;
            const no = runningNo;
            const flags = Object.entries(sheet.flags || {}).filter(([, f]) => f.question_id === q.id);
            return (
              <div key={q.id} style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-soft)', minWidth: '22px' }}>{no}.</span>
                  <span style={{ fontSize: '13px', flex: 1 }}>{q.title}</span>
                </div>

                {q.field_type === 'symbolic_scale' && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', marginLeft: '32px' }}>
                    {SCALE.map(v => {
                      const on = responses[q.id] === v;
                      return (
                        <button
                          key={v}
                          disabled={!section.can_edit}
                          onClick={() => answer(q, v)}
                          title={SCALE_LABEL[v]}
                          style={{
                            ...btn,
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: on ? 'var(--primary)' : 'var(--surface)',
                            color: on ? '#fff' : 'var(--text)',
                            borderColor: on ? 'var(--primary)' : 'var(--border)',
                            cursor: section.can_edit ? 'pointer' : 'not-allowed',
                            opacity: section.can_edit ? 1 : 0.6
                          }}
                        >{SCALE_LABEL[v]}</button>
                      );
                    })}
                  </div>
                )}

                {q.field_type === 'text_long' && (
                  <textarea
                    disabled={!section.can_edit}
                    value={responses[q.id] || ''}
                    onChange={e => answer(q, e.target.value)}
                    rows={3}
                    placeholder="Observation…"
                    style={{ ...input, width: 'calc(100% - 32px)', marginLeft: '32px', marginTop: '10px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                )}

                {q.field_type === 'text_short' && (
                  <input
                    disabled={!section.can_edit}
                    value={responses[q.id] || ''}
                    onChange={e => answer(q, e.target.value)}
                    placeholder="Short answer…"
                    style={{ ...input, width: 'calc(100% - 32px)', marginLeft: '32px', marginTop: '10px' }}
                  />
                )}

                {!['symbolic_scale', 'text_long', 'text_short'].includes(q.field_type) && (
                  <p style={{ margin: '10px 0 0 32px', fontSize: '12px', color: 'var(--text-soft)' }}>
                    <em>{q.field_type}</em> answers are collected on the full form.
                  </p>
                )}

                {section.can_edit && responses[q.id] !== undefined && (
                  <button style={{ ...btn, marginLeft: '32px', marginTop: '8px', padding: '3px 10px', fontSize: '11px' }} onClick={() => clearAnswer(q)}>Clear</button>
                )}

                {/* Highlights / flags */}
                {flags.map(([id, f]) => (
                  <div key={id} style={{ marginLeft: '32px', marginTop: '10px', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', fontSize: '12px' }}>
                    <strong style={{ color: f.resolved ? 'var(--primary)' : '#c92a2a' }}>{f.resolved ? 'Resolved' : 'Open'}</strong>
                    <span style={{ color: 'var(--text-soft)', marginLeft: '8px' }}>{new Date(f.raised_at).toLocaleString()}</span>
                    <p style={{ margin: '6px 0' }}>{f.message}</p>
                    {(f.replies || []).map((r, i) => (
                      <p key={i} style={{ margin: '4px 0 4px 12px', color: 'var(--text-soft)' }}>↳ {r.text}</p>
                    ))}
                  </div>
                ))}

                {section.can_edit && (
                  <button
                    style={{ ...btn, marginLeft: '32px', marginTop: '8px', padding: '3px 10px', fontSize: '11px' }}
                    onClick={() => { const t = prompt('Raise a flag or question about this item:'); if (t) raiseHighlight(q.id, t); }}
                  >Raise a flag</button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Score summary ── */}
      {sheet?.scores && Object.keys(sheet.scores.section_scores || {}).length > 0 && (
        <div style={panel}>
          <h5 style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--primary)' }}>Scored summary</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
            {Object.entries(sheet.scores.section_scores).map(([sid, s]) => (
              <div key={sid} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <strong style={{ fontSize: '12px' }}>{s.title}</strong>
                <div style={{ fontSize: '22px', color: 'var(--primary)', marginTop: '6px' }}>{s.rating || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>
                  {s.average?.toFixed(2)} · {s.question_count} rated
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}