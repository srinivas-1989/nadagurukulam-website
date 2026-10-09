'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };
const secondaryBtn = { background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 };

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [productions, setProductions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [travel, setTravel] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('events');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  }

  async function reload() {
    try {
      const [ev, pr, pa, se, tr, us] = await Promise.all([
        apiCall('/api/events'),
        apiCall('/api/productions'),
        apiCall('/api/production_participants'),
        apiCall('/api/production_sessions'),
        apiCall('/api/production_travel'),
        apiCall('/api/users'),
      ]);
      setEvents(Array.isArray(ev) ? ev : []);
      setProductions(Array.isArray(pr) ? pr : []);
      setParticipants(Array.isArray(pa) ? pa : []);
      setSessions(Array.isArray(se) ? se : []);
      setTravel(Array.isArray(tr) ? tr : []);
      setUsers(Array.isArray(us) ? us : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function submit(path, payload, method = 'POST') {
    setError(''); setMessage('');
    try {
      await apiCall(path, { method, body: JSON.stringify(payload) });
      setMessage('Operation successful');
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(path, id) {
    if (!confirm('Delete this record?')) return;
    setError(''); setMessage('');
    try {
      await apiCall(`${path}/${id}`, { method: 'DELETE' });
      setMessage('Deleted successfully');
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(table, id, status) {
    await submit(`/api/${table}/${id}`, { status }, 'PUT');
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading Events & Productions...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '6px', fontSize: '24px' }}>Events & Productions</h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '20px' }}>
        Manage public events, internal productions, participants, sessions, and tour logistics.
      </p>

      {error && <div style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
      {message && <div style={{ background: '#eaf7ea', border: '1px solid #a0d0a0', color: '#1f6b1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{message}</div>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        {['events', 'productions', 'participants', 'sessions', 'travel'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? 'var(--primary)' : 'var(--surface)',
              color: tab === t ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              textTransform: 'capitalize'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/events', { title: f.get('title'), date: f.get('date'), venue: f.get('venue'), status: 'draft' }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Create Public Event</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <input name="title" placeholder="Event Title" required style={inputStyle} />
              <input name="date" type="date" required style={inputStyle} />
              <input name="venue" placeholder="Venue" style={inputStyle} />
            </div>
            <button type="submit" style={btn}>Create Event</button>
          </form>

          {events.map(ev => (
            <div key={ev.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '4px' }}>{ev.title}</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Date: {ev.date} | Venue: {ev.venue || 'TBA'} | Status: <strong>{ev.status}</strong></p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {ev.status === 'draft' && <button onClick={() => handleStatusChange('events', ev.id, 'published')} style={secondaryBtn}>Publish</button>}
                  {ev.status === 'published' && <button onClick={() => handleStatusChange('events', ev.id, 'archived')} style={secondaryBtn}>Archive</button>}
                  <button onClick={() => handleDelete('/api/events', ev.id)} style={{ ...secondaryBtn, color: '#d32f2f', borderColor: '#d32f2f' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'productions' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/productions', { event_id: f.get('event_id') || null, title: f.get('title'), art_form: f.get('art_form'), production_date: f.get('production_date'), venue: f.get('venue'), status: 'draft' }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Production</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="event_id" style={inputStyle}>
                <option value="">(Optional) Link to Public Event...</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
              <input name="title" placeholder="Production Title" required style={inputStyle} />
              <select name="art_form" style={inputStyle}>
                <option value="vocal">Vocal</option>
                <option value="bharatanatyam">Bharatanatyam</option>
                <option value="violin">Violin</option>
                <option value="veena">Veena</option>
                <option value="flute">Flute</option>
                <option value="mridangam">Mridangam</option>
                <option value="other">Other</option>
              </select>
              <input name="production_date" type="date" style={inputStyle} />
              <input name="venue" placeholder="Production Venue" style={inputStyle} />
            </div>
            <button type="submit" style={btn}>Create Production</button>
          </form>

          {productions.map(pr => (
            <div key={pr.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '4px' }}>{pr.title}</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Art Form: {pr.art_form} | Status: <strong>{pr.status}</strong></p>
                  {pr.event_id && <p style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '4px' }}>Linked to: {events.find(e => e.id === pr.event_id)?.title}</p>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {pr.status === 'draft' && <button onClick={() => handleStatusChange('productions', pr.id, 'in_progress')} style={secondaryBtn}>Start</button>}
                  {pr.status === 'in_progress' && <button onClick={() => handleStatusChange('productions', pr.id, 'completed')} style={secondaryBtn}>Complete</button>}
                  <button onClick={() => handleDelete('/api/productions', pr.id)} style={{ ...secondaryBtn, color: '#d32f2f', borderColor: '#d32f2f' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'participants' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/production_participants', { production_id: f.get('production_id'), participant_kind: f.get('participant_kind'), user_id: f.get('user_id') || null, display_name: f.get('display_name'), role_performed: f.get('role_performed'), is_lead: f.get('is_lead') === 'on' }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Participant</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="production_id" required style={inputStyle}>
                <option value="">Select Production...</option>
                {productions.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
              </select>
              <select name="participant_kind" style={inputStyle}>
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="guru">Guru</option>
                <option value="guest_artist">Guest Artist</option>
                <option value="external_artist">External Artist</option>
              </select>
              <select name="user_id" style={inputStyle}>
                <option value="">(If student/faculty) Select User...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role_key})</option>)}
              </select>
              <input name="display_name" placeholder="Display Name (for Guest/Program)" required style={inputStyle} />
              <input name="role_performed" placeholder="Role (e.g. Vocalist, Lead Dancer)" style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <input name="is_lead" type="checkbox" /> Lead Artist?
              </label>
            </div>
            <button type="submit" style={btn}>Add Participant</button>
          </form>

          {participants.map(pa => (
            <div key={pa.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>{pa.display_name} {pa.is_lead ? '(Lead)' : ''}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Kind: {pa.participant_kind} | Role: {pa.role_performed} | Production: {productions.find(p => p.id === pa.production_id)?.title}</p>
              <button onClick={() => handleDelete('/api/production_participants', pa.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', padding: 0, fontSize: '12px', marginTop: '8px', cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'sessions' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/production_sessions', { production_id: f.get('production_id'), session_type: f.get('session_type'), session_date: f.get('session_date'), venue: f.get('venue'), notes: f.get('notes') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Session / Rehearsal</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="production_id" required style={inputStyle}>
                <option value="">Select Production...</option>
                {productions.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
              </select>
              <select name="session_type" style={inputStyle}>
                <option value="rehearsal">Rehearsal</option>
                <option value="dress_rehearsal">Dress Rehearsal</option>
                <option value="performance">Performance</option>
                <option value="workshop">Workshop</option>
              </select>
              <input name="session_date" type="date" required style={inputStyle} />
              <input name="venue" placeholder="Venue" style={inputStyle} />
              <input name="notes" placeholder="Notes" style={{ ...inputStyle, gridColumn: 'span 2' }} />
            </div>
            <button type="submit" style={btn}>Schedule Session</button>
          </form>

          {sessions.map(se => (
            <div key={se.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>{se.session_type} on {se.session_date}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Venue: {se.venue || 'TBA'} | Production: {productions.find(p => p.id === se.production_id)?.title}</p>
              <button onClick={() => handleDelete('/api/production_sessions', se.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', padding: 0, fontSize: '12px', marginTop: '8px', cursor: 'pointer' }}>Cancel Session</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'travel' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/production_travel', { production_id: f.get('production_id'), destination: f.get('destination'), depart_date: f.get('depart_date'), travel_mode: f.get('travel_mode'), vehicle_details: f.get('vehicle_details') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Travel / Logistics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="production_id" required style={inputStyle}>
                <option value="">Select Production...</option>
                {productions.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
              </select>
              <input name="destination" placeholder="Destination" required style={inputStyle} />
              <input name="depart_date" type="date" required style={inputStyle} />
              <select name="travel_mode" style={inputStyle}>
                <option value="bus">Bus</option>
                <option value="train">Train</option>
                <option value="flight">Flight</option>
                <option value="van">Van</option>
              </select>
              <input name="vehicle_details" placeholder="Vehicle / Flight Details" style={{ ...inputStyle, gridColumn: 'span 2' }} />
            </div>
            <button type="submit" style={btn}>Record Travel</button>
          </form>

          {travel.map(tr => (
            <div key={tr.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>To {tr.destination} ({tr.travel_mode})</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Depart: {tr.depart_date} | Production: {productions.find(p => p.id === tr.production_id)?.title}</p>
              <button onClick={() => handleDelete('/api/production_travel', tr.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', padding: 0, fontSize: '12px', marginTop: '8px', cursor: 'pointer' }}>Delete Travel Record</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
