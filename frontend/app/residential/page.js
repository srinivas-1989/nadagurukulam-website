'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };

export default function ResidentialPage() {
  const [hostels, setHostels] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [beds, setBeds] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [outings, setOutings] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('hostels');

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
      const [h, b, rm, bd, al, lv, ot, st] = await Promise.all([
        apiCall('/api/hostels'),
        apiCall('/api/hostel_blocks'),
        apiCall('/api/hostel_rooms'),
        apiCall('/api/hostel_beds'),
        apiCall('/api/hostel_allocations'),
        apiCall('/api/hostel_leave_requests'),
        apiCall('/api/hostel_outings'),
        apiCall('/api/users'),
      ]);
      setHostels(Array.isArray(h) ? h : []);
      setBlocks(Array.isArray(b) ? b : []);
      setRooms(Array.isArray(rm) ? rm : []);
      setBeds(Array.isArray(bd) ? bd : []);
      setAllocations(Array.isArray(al) ? al : []);
      setLeaves(Array.isArray(lv) ? lv : []);
      setOutings(Array.isArray(ot) ? ot : []);
      setStudents(Array.isArray(st) ? st.filter(u => u.role_key === 'student') : []);
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
      setMessage('Saved successfully');
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading Residential & Hostel ERP...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '6px', fontSize: '24px' }}>Residential / Hostel ERP</h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '20px' }}>
        Hostels, blocks, rooms, beds, occupancy allocations, leave requests, and student movement.
      </p>

      {error && <div style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
      {message && <div style={{ background: '#eaf7ea', border: '1px solid #a0d0a0', color: '#1f6b1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{message}</div>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        {['hostels', 'blocks', 'rooms', 'beds', 'allocations', 'leaves', 'outings'].map(t => (
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

      {tab === 'hostels' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostels', { name: f.get('name'), code: f.get('code'), hostel_type: f.get('hostel_type'), warden_contact: f.get('warden_contact') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Hostel Building</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <input name="name" placeholder="Hostel Name (e.g. Tansen House)" required style={inputStyle} />
              <input name="code" placeholder="Code (e.g. TH-01)" required style={inputStyle} />
              <select name="hostel_type" style={inputStyle}>
                <option value="boys">Boys</option>
                <option value="girls">Girls</option>
                <option value="mixed">Mixed</option>
                <option value="staff">Staff</option>
              </select>
              <input name="warden_contact" placeholder="Warden Contact / Phone" style={inputStyle} />
            </div>
            <button type="submit" style={btn}>Create Hostel</button>
          </form>

          {hostels.map(h => (
            <div key={h.id} style={cardStyle}>
              <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '4px' }}>{h.name} ({h.code})</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Type: {h.hostel_type} | Warden Contact: {h.warden_contact || 'None'}</p>
            </div>
          ))}
          {hostels.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No hostels registered yet.</p>}
        </div>
      )}

      {tab === 'blocks' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostel_blocks', { hostel_id: f.get('hostel_id'), name: f.get('name'), gender_policy: f.get('gender_policy') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Hostel Block</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="hostel_id" required style={inputStyle}>
                <option value="">Select Hostel...</option>
                {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <input name="name" placeholder="Block Name (e.g. Block A)" required style={inputStyle} />
              <select name="gender_policy" style={inputStyle}>
                <option value="boys">Boys</option>
                <option value="girls">Girls</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <button type="submit" style={btn}>Create Block</button>
          </form>

          {blocks.map(b => (
            <div key={b.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>{b.name}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Gender Policy: {b.gender_policy}</p>
            </div>
          ))}
          {blocks.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No blocks created yet.</p>}
        </div>
      )}

      {tab === 'rooms' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostel_rooms', { floor_id: f.get('floor_id'), room_number: f.get('room_number'), room_type: f.get('room_type'), capacity: parseInt(f.get('capacity') || '2') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Room (requires blocks/floors setup or direct floor id)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <input name="floor_id" placeholder="Floor UUID" required style={inputStyle} />
              <input name="room_number" placeholder="Room Number (e.g. 214)" required style={inputStyle} />
              <select name="room_type" style={inputStyle}>
                <option value="shared">Shared</option>
                <option value="single">Single</option>
                <option value="dormitory">Dormitory</option>
              </select>
              <input name="capacity" type="number" defaultValue="2" placeholder="Capacity" required style={inputStyle} />
            </div>
            <button type="submit" style={btn}>Create Room</button>
          </form>

          {rooms.map(r => (
            <div key={r.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>Room {r.room_number} ({r.room_type})</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Capacity: {r.capacity}</p>
            </div>
          ))}
          {rooms.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No rooms created yet.</p>}
        </div>
      )}

      {tab === 'beds' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostel_beds', { room_id: f.get('room_id'), bed_number: f.get('bed_number') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Add Bed to Room</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="room_id" required style={inputStyle}>
                <option value="">Select Room...</option>
                {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
              </select>
              <input name="bed_number" placeholder="Bed Number/Label (e.g. B1)" required style={inputStyle} />
            </div>
            <button type="submit" style={btn}>Create Bed</button>
          </form>

          {beds.map(b => (
            <div key={b.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>Bed {b.bed_number}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Status: {b.bed_status}</p>
            </div>
          ))}
          {beds.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No beds created yet.</p>}
        </div>
      )}

      {tab === 'allocations' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostel_allocations', { bed_id: f.get('bed_id'), student_id: f.get('student_id'), allocation_type: f.get('allocation_type') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Allocate Bed to Student</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="bed_id" required style={inputStyle}>
                <option value="">Select Bed...</option>
                {beds.map(b => <option key={b.id} value={b.id}>Bed {b.bed_number}</option>)}
              </select>
              <select name="student_id" required style={inputStyle}>
                <option value="">Select Student...</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
              </select>
              <select name="allocation_type" style={inputStyle}>
                <option value="regular">Regular</option>
                <option value="daycare">Daycare</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <button type="submit" style={btn}>Allocate Bed</button>
          </form>

          {allocations.map(a => (
            <div key={a.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>Allocation Status: {a.status}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>From: {a.allocated_from} | Type: {a.allocation_type}</p>
            </div>
          ))}
          {allocations.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No active allocations.</p>}
        </div>
      )}

      {tab === 'leaves' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostel_leave_requests', { student_id: f.get('student_id'), leave_type: f.get('leave_type'), from_date: f.get('from_date'), to_date: f.get('to_date'), reason: f.get('reason') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Request Hostel Leave</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="student_id" required style={inputStyle}>
                <option value="">Select Student...</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select name="leave_type" style={inputStyle}>
                <option value="home">Home</option>
                <option value="medical">Medical</option>
                <option value="festival">Festival</option>
                <option value="academic">Academic</option>
              </select>
              <input name="from_date" type="date" required style={inputStyle} />
              <input name="to_date" type="date" required style={inputStyle} />
              <input name="reason" placeholder="Reason for leave" style={{ ...inputStyle, gridColumn: 'span 2' }} />
            </div>
            <button type="submit" style={btn}>Submit Leave Request</button>
          </form>

          {leaves.map(l => (
            <div key={l.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>Leave: {l.leave_type} ({l.status})</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>{l.from_date} to {l.to_date} - {l.reason}</p>
            </div>
          ))}
          {leaves.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No leave requests.</p>}
        </div>
      )}

      {tab === 'outings' && (
        <div>
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); submit('/api/hostel_outings', { student_id: f.get('student_id'), destination: f.get('destination'), expected_return_at: f.get('expected_return_at'), purpose: f.get('purpose') }); e.target.reset(); }} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Log Outing</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <select name="student_id" required style={inputStyle}>
                <option value="">Select Student...</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input name="destination" placeholder="Destination" required style={inputStyle} />
              <input name="expected_return_at" type="datetime-local" required style={inputStyle} />
              <input name="purpose" placeholder="Purpose" style={inputStyle} />
            </div>
            <button type="submit" style={btn}>Record Outing</button>
          </form>

          {outings.map(o => (
            <div key={o.id} style={cardStyle}>
              <h4 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>Outing to {o.destination}</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-soft)', margin: 0 }}>Expected Return: {new Date(o.expected_return_at).toLocaleString()} | Returned: {o.returned_at ? new Date(o.returned_at).toLocaleString() : 'Still Out'}</p>
            </div>
          ))}
          {outings.length === 0 && <p style={{ color: 'var(--text-faint)' }}>No outings recorded.</p>}
        </div>
      )}
    </div>
  );
}
