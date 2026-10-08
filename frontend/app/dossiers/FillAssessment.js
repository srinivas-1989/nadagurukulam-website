'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const SCALE = ['Exemplary', 'Strong', 'Satisfactory', 'Developing', 'Needs Significant Guidance', 'N/O'];
const SCALE_LABEL = { Exemplary: 'Exemplary', Strong: 'Strong', Satisfactory: 'Satisfactory', Developing: 'Developing', 'Needs Significant Guidance': 'Needs Significant Guidance', 'N/O': 'Not Observed' };
const STATUS_TONE = { draft: 'var(--accent)', submitted: '#0b7285', in_review: '#5f3dc4', finalized: 'var(--primary)', reviewed: 'var(--primary)' };
const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const btn = { padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' };
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' };
const input = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' };

export default function DossiersFillPage() {
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
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(options.headers || {}) }
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  }, [apiUrl]);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from('users').select('id, name').eq('role_key', 'student').order('name');
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
      setVersions(data.assessment_id ? await call(`/dossiers/assessments/${data.assessment_id}/versions`) : []);
    } catch (e) { setSheet(null); setMsg({ tone: 'bad', text: e.message }); } finally { setBusy(false); }
  }, [call]);

  useEffect(() => { load(studentId, month); }, [studentId, month, load]);

  const queueSave = useCallback(() => {
    setDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => submit('save'), 3000);
  }, []);

  const submit = async (action) => {
    clearTimeout(saveTimer.current);
    setBusy(true); setMsg(null);
    try {
      await call(`/dossiers/students/${studentId}/${month}`, {
        method: 'POST', body: JSON.stringify({ responses, cleared_qids: [...cleared.current], action_type: action === 'submit' ? 'submit_final' : 'save_draft' })
      });
      cleared.current = new Set();
      setDirty(false);
      await load(studentId, month);
      setMsg({ tone: 'ok', text: action === 'submit' ? 'Submitted.' : 'Draft saved.' });
    } catch (e) { setMsg({ tone: 'bad', text: e.message }); } finally { setBusy(false); }
  };

  const answer = (q, value) => { cleared.current.delete(q.id); setResponses(r => ({ ...r, [q.id]: value })); queueSave(); };
  const clearAnswer = (q) => { cleared.current.add(q.id); setResponses(r => { const n = { ...r }; delete n[q.id]; return n; }); queueSave(); };

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={panel}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} style={{ ...input, minWidth: '200px' }}>
            <option value="">— Select student —</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={input} />
          {sheet && <button style={btnPrimary} disabled={busy} onClick={() => submit('submit')}>Submit</button>}
        </div>
      </div>
      {sheet?.sections?.map(section => (
        <div key={section.id} style={panel}>
          <h5>{section.title}</h5>
          {section.questions.map(q => (
            <div key={q.id} style={{ padding: '10px 0' }}>
              <p>{q.title}</p>
              {q.field_type === 'symbolic_scale' && SCALE.map(v => (
                <button key={v} onClick={() => answer(q, v)} style={{ ...btn, background: responses[q.id] === v ? 'var(--primary)' : 'var(--surface)' }}>{v}</button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
