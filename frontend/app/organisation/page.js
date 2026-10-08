'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const UNIT_TYPES = ['School', 'Faculty', 'Department', 'Centre', 'Unit', 'Office'];

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', marginBottom: '18px' };
const primaryBtn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };
const ghostBtn = { background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '9px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };
const dangerBtn = { background: 'none', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' };

export default function OrganisationPage() {
  const [institutions, setInstitutions] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [units, setUnits] = useState([]);
  const [positions, setPositions] = useState([]);
  const [reporting, setReporting] = useState([]);
  const [users, setUsers] = useState([]);
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
      const [inst, camp, unit, pos, rep, usr] = await Promise.all([
        apiCall('/api/organisation/institutions').then(r => r.json()),
        apiCall('/api/organisation/campuses').then(r => r.json()),
        apiCall('/api/organisation/units').then(r => r.json()),
        apiCall('/api/organisation/positions').then(r => r.json()),
        apiCall('/api/organisation/reporting').then(r => r.json()),
        apiCall('/api/users').then(r => r.json()),
      ]);
      setInstitutions(Array.isArray(inst) ? inst : []);
      setCampuses(Array.isArray(camp) ? camp : []);
      setUnits(Array.isArray(unit) ? unit : []);
      setPositions(Array.isArray(pos) ? pos : []);
      setReporting(Array.isArray(rep) ? rep : []);
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

  async function addInstitution(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/organisation/institutions', { name: f.get('name'), code: f.get('code'), type: f.get('type') }))
      e.target.reset();
  }

  async function addCampus(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/organisation/campuses', { name: f.get('name'), code: f.get('code'), institution_id: f.get('institution_id') || null }))
      e.target.reset();
  }

  async function addUnit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/organisation/units', {
      name: f.get('name'),
      type: f.get('type'),
      campus_id: f.get('campus_id') || null,
      parent_unit_id: f.get('parent_unit_id') || null,
    })) e.target.reset();
  }

  async function addPosition(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/organisation/positions', {
      title: f.get('title'),
      description: f.get('description') || null,
      unit_id: f.get('unit_id') || null,
    })) e.target.reset();
  }

  async function addReporting(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (await post('/api/organisation/reporting', {
      supervisor_id: f.get('supervisor_id'),
      subordinate_id: f.get('subordinate_id'),
      effective_from: f.get('effective_from') || undefined,
    })) e.target.reset();
  }

  async function closeReporting(id) {
    if (!confirm('Close this reporting line? The history is kept; a new line can be added later.')) return;
    setError('');
    const res = await apiCall(`/api/organisation/reporting/${id}/close`, { method: 'POST', body: JSON.stringify({}) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not close reporting line.');
    }
    reload();
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  const userName = (id) => {
    const u = users.find(x => x.id === id);
    return u ? (u.full_name || u.name || u.email) : (id ? id.slice(0, 8) : '—');
  };
  const unitName = (id) => units.find(u => u.id === id)?.name || (id ? id.slice(0, 8) : '—');

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Organisation</h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '18px' }}>
        Institutions, campuses, reporting units, positions, and who reports to whom.
      </p>

      {error && (
        <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
        {/* Institutions */}
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Institutions ({institutions.length})</h3>
          <form onSubmit={addInstitution} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <input name="name" placeholder="Name" style={{ ...inputStyle, flex: '2 1 140px' }} required maxLength={160} />
            <input name="code" placeholder="Code" style={{ ...inputStyle, flex: '1 1 70px' }} required maxLength={40} />
            <input name="type" placeholder="Type" style={inputStyle} maxLength={80} />
            <button type="submit" style={primaryBtn}>Add</button>
          </form>
          {institutions.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No institutions yet.</p> :
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
              {institutions.map(i => (
                <li key={i.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <strong>{i.name}</strong> <span style={{ color: 'var(--text-faint)' }}>({i.code}{i.type ? ` · ${i.type}` : ''})</span>
                </li>
              ))}
            </ul>}
        </div>

        {/* Campuses */}
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Campuses ({campuses.length})</h3>
          <form onSubmit={addCampus} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <select name="institution_id" style={inputStyle} required>
              <option value="">Select Institution...</option>
              {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input name="name" placeholder="Name" style={{ ...inputStyle, flex: '2 1 120px' }} required maxLength={160} />
            <input name="code" placeholder="Code" style={{ ...inputStyle, flex: '1 1 70px' }} required maxLength={40} />
            <button type="submit" style={primaryBtn}>Add</button>
          </form>
          {campuses.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No campuses yet.</p> :
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
              {campuses.map(c => (
                <li key={c.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <strong>{c.name}</strong> <span style={{ color: 'var(--text-faint)' }}>({c.code} · {institutions.find(i => i.id === c.institution_id)?.name || '—'})</span>
                </li>
              ))}
            </ul>}
        </div>

        {/* Units */}
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Units ({units.length})</h3>
          <form onSubmit={addUnit} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <input name="name" placeholder="Name" style={{ ...inputStyle, flex: '2 1 120px' }} required maxLength={160} />
            <select name="type" style={inputStyle} required>
              {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select name="campus_id" style={inputStyle}>
              <option value="">Campus (optional)...</option>
              {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="parent_unit_id" style={inputStyle}>
              <option value="">Parent unit (optional)...</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button type="submit" style={primaryBtn}>Add</button>
          </form>
          {units.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No units yet.</p> :
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
              {units.map(u => (
                <li key={u.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <strong>{u.name}</strong>{' '}
                  <span style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>{u.type}</span>{' '}
                  <span style={{ color: 'var(--text-faint)' }}>
                    {u.parent_unit_id ? `under ${unitName(u.parent_unit_id)}` : ''}
                    {u.campus_id ? ` · ${campuses.find(c => c.id === u.campus_id)?.name || ''}` : ''}
                  </span>
                </li>
              ))}
            </ul>}
        </div>

        {/* Positions */}
        <div style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Positions ({positions.length})</h3>
          <form onSubmit={addPosition} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <input name="title" placeholder="Title" style={{ ...inputStyle, flex: '2 1 120px' }} required maxLength={160} />
            <select name="unit_id" style={inputStyle}>
              <option value="">Unit (optional)...</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input name="description" placeholder="Description" style={{ ...inputStyle, flex: '1 1 160px' }} maxLength={500} />
            <button type="submit" style={primaryBtn}>Add</button>
          </form>
          {positions.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No positions yet.</p> :
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px' }}>
              {positions.map(p => (
                <li key={p.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <strong>{p.title}</strong>{' '}
                  <span style={{ color: 'var(--text-faint)' }}>{p.unit_id ? unitName(p.unit_id) : '—'}</span>
                  {p.description && <div style={{ color: 'var(--text-faint)', fontSize: '12px' }}>{p.description}</div>}
                </li>
              ))}
            </ul>}
        </div>
      </div>

      {/* Reporting lines */}
      <div style={cardStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Reporting Lines ({reporting.filter(r => !r.effective_to).length} open)</h3>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', marginBottom: '12px' }}>
          Reporting lines are historical. Closing one keeps it for past records; add a new line to change who reports to whom.
        </p>

        <form onSubmit={addReporting} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginBottom: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            Reports to
            <select name="supervisor_id" style={inputStyle} required>
              <option value="">Select supervisor...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.name || u.email}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            Subordinate
            <select name="subordinate_id" style={inputStyle} required>
              <option value="">Select subordinate...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.name || u.email}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            Effective from
            <input type="date" name="effective_from" style={inputStyle} />
          </label>
          <button type="submit" style={ghostBtn}>Add Line</button>
        </form>

        {reporting.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No reporting lines yet.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Subordinate</th>
                <th style={{ padding: '6px 8px' }}>Reports to</th>
                <th style={{ padding: '6px 8px' }}>From</th>
                <th style={{ padding: '6px 8px' }}>To</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {reporting.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: r.effective_to ? 0.55 : 1 }}>
                  <td style={{ padding: '6px 8px' }}>{userName(r.subordinate_id)}</td>
                  <td style={{ padding: '6px 8px' }}>{userName(r.supervisor_id)}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{r.effective_from || '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-faint)' }}>{r.effective_to || 'open'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {!r.effective_to && (
                      <button onClick={() => closeReporting(r.id)} style={dangerBtn}>Close</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
