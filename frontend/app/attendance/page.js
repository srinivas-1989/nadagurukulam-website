'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const LEVEL = { None: 0, View: 1, Self: 2, Submits: 3, Own: 4, Manage: 5, Full: 6 };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px', marginBottom: '12px' };
const inp = { padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px' };

export default function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('None');
  const [me, setMe] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [states, setStates] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [openSession, setOpenSession] = useState(null);
  const [form, setForm] = useState({ offering: '', date: '', start: '', end: '', mode: 'room', room: '', topic: '', type: 'theory', status: 'held' });

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
      const [perm, profiles] = await Promise.all([apiCall('/api/my-permissions'), get('/api/users')]);
      const lvl = perm.role_key === 'super_admin' ? 'Full' : (perm.perms?.assessment || 'None');
      setLevel(lvl); setUsers(profiles);
      setMe(profiles.find(u => u.email && session.user.email && u.email.toLowerCase() === session.user.email.toLowerCase()) || null);
      const [s, o, c, r, st, rc, sum] = await Promise.all([
        get('/api/class_sessions'), get('/api/course_offerings'), get('/api/courses'),
        get('/api/course_registrations'), get('/api/attendance_states'), get('/api/attendance_records'),
        apiCall('/api/attendance-summary').catch(() => ({ students: [] })),
      ]);
      setSessions(s); setOfferings(o); setCourses(c); setRegistrations(r); setStates(st.sort((a, b) => a.sort_order - b.sort_order)); setRecords(rc);
      setSummary(sum?.students || []);
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
  const stateOf = (id) => states.find(s => s.id === id);
  const recordFor = (sessionId, studentId) => records.find(r => r.class_session_id === sessionId && r.student_id === studentId);

  async function handleCreateSession(e) {
    e.preventDefault();
    if (!form.offering || !form.date) return;
    try {
      await apiCall('/api/class_sessions', { method: 'POST', body: JSON.stringify({
        course_offering_id: form.offering, session_date: form.date,
        start_time: form.start || null, end_time: form.end || null,
        delivery_mode: form.mode, room: form.room || null, topic: form.topic || null,
        session_type: form.type, status: form.status,
      }) });
      setForm({ offering: '', date: '', start: '', end: '', mode: 'room', room: '', topic: '', type: 'theory', status: 'held' });
      reload();
    } catch (err) { alert(err.message); }
  }

  async function handleSessionStatus(s, status) {
    try { await apiCall(`/api/class_sessions/${s.id}`, { method: 'PUT', body: JSON.stringify({ status }) }); reload(); }
    catch (err) { alert(err.message); }
  }

  async function handleDeleteSession(id) {
    if (!confirm('Delete this session and its attendance records?')) return;
    try { await apiCall(`/api/class_sessions/${id}`, { method: 'DELETE' }); if (openSession === id) setOpenSession(null); reload(); }
    catch (err) { alert(err.message); }
  }

  // Marking is idempotent: a first mark creates the row, a correction updates it.
  async function mark(studentId, sessionId, stateId) {
    const existing = recordFor(sessionId, studentId);
    try {
      if (existing) await apiCall(`/api/attendance_records/${existing.id}`, { method: 'PUT', body: JSON.stringify({ state_id: stateId }) });
      else await apiCall('/api/attendance_records', { method: 'POST', body: JSON.stringify({ class_session_id: sessionId, student_id: studentId, state_id: stateId }) });
      await reload();
    } catch (err) { alert(err.message); }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading…</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--primary)' }}>{error}</div>;
  if (rank === LEVEL.None) return <div style={{ padding: '24px', color: 'var(--text-faint)' }}>You do not have access to attendance.</div>;

  const rosterFor = (offeringId) => registrations.filter(r => r.course_offering_id === offeringId).map(r => r.student_id);
  const myPercent = summary.find(s => s.student_id === me?.id);
  const visibleSessions = canManage ? sessions
    : sessions.filter(s => s.status === 'held' && registrations.some(r => r.course_offering_id === s.course_offering_id && r.student_id === me?.id));

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      <h1 style={{ color: 'var(--primary)', fontSize: '22px', marginBottom: '4px' }}>Attendance</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: 0 }}>
        Sessions are the source of truth; summaries are derived from them. Mark each student Present / Late / Excused / Absent per session.
      </p>

      {!canManage && myPercent && (
        <div style={{ ...card, display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--primary)' }}>{myPercent.percentage == null ? '—' : `${myPercent.percentage}%`}</div><div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>your attendance</div></div>
          <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>{myPercent.present} of {myPercent.held} held sessions counted present</div>
        </div>
      )}

      {canManage && (
        <form onSubmit={handleCreateSession} style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select value={form.offering} onChange={e => setForm({ ...form, offering: e.target.value })} required style={{ ...inp, flex: '1 1 240px' }}>
            <option value="">Select course offering…</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{offeringLabel(o.id)}</option>)}
          </select>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required style={inp} />
          <input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} style={inp} />
          <input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} style={inp} />
          <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} style={inp}>
            <option value="room">Room</option><option value="online">Online</option><option value="hybrid">Hybrid</option>
          </select>
          <input placeholder="Room" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} style={{ ...inp, width: '100px' }} />
          <input placeholder="Topic" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} style={{ ...inp, flex: '1 1 160px' }} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inp}>
            <option value="theory">Theory</option><option value="practical">Practical</option><option value="viva">Viva</option><option value="recital">Recital</option>
          </select>
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>
            <option value="planned">Planned</option><option value="held">Held</option><option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '4px', cursor: 'pointer' }}>Add session</button>
        </form>
      )}

      {visibleSessions.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-faint)' }}>No sessions yet.</div>
      ) : visibleSessions.map(s => {
        const roster = rosterFor(s.course_offering_id);
        const marked = roster.filter(sid => recordFor(s.id, sid)).length;
        const open = openSession === s.id;
        return (
          <div key={s.id} style={card}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '15px' }}>
                  {s.session_date} {s.start_time ? `· ${String(s.start_time).slice(0, 5)}` : ''} <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: '11.5px' }}>{s.session_type} · {s.delivery_mode}{s.room ? ` · ${s.room}` : ''}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>{offeringLabel(s.course_offering_id)}</div>
                {s.topic ? <div style={{ fontSize: '12.5px', color: 'var(--text-soft)', marginTop: '2px' }}>{s.topic}</div> : null}
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={s.status} onChange={e => handleSessionStatus(s, e.target.value)} style={{ ...inp, padding: '4px 8px', fontSize: '12px' }}>
                    <option value="planned">Planned</option><option value="held">Held</option><option value="cancelled">Cancelled</option>
                  </select>
                  <button onClick={() => setOpenSession(open ? null : s.id)} style={{ background: open ? 'var(--primary)' : 'none', color: open ? '#fff' : 'var(--primary)', border: '1px solid var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                    {open ? 'Close' : `Mark · ${marked}/${roster.length}`}
                  </button>
                  <button onClick={() => handleDeleteSession(s.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                </div>
              )}
            </div>

            {canManage && open && (
              <div style={{ marginTop: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                {roster.length === 0 ? <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No students registered for this offering.</div> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                        <th style={{ padding: '6px 8px' }}>Student</th><th style={{ padding: '6px 8px' }}>Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(sid => {
                        const rec = recordFor(s.id, sid);
                        return (
                          <tr key={sid} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }}>{userName(sid)}</td>
                            <td style={{ padding: '6px 8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {states.map(st => {
                                const on = rec && rec.state_id === st.id;
                                return (
                                  <button key={st.id} onClick={() => mark(sid, s.id, st.id)} style={{
                                    border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '99px', cursor: 'pointer', fontSize: '11.5px',
                                    background: on ? 'var(--primary)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-soft)',
                                  }}>{st.label}</button>
                                );
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {!canManage && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-faint)' }}>
                {(() => { const rec = recordFor(s.id, me?.id); return rec ? <>Your mark: <b style={{ color: 'var(--text)' }}>{stateOf(rec.state_id)?.label || '—'}</b></> : 'Not marked yet'; })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
