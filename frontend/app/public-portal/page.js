'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '6px', width: '100%', fontSize: '13.5px', background: 'var(--surface)' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px', marginBottom: '16px' };
const primaryBtn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };
const ghostBtn = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-soft)', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };
const dangerBtn = { background: 'none', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' };
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-soft)', marginBottom: '4px' };

// The backend declares every field; this only decides how to draw one.
function Field({ field, value, onChange }) {
  const set = v => onChange(field.key, v);

  if (field.kind === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
        <input type="checkbox" checked={value === true} onChange={e => set(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.kind === 'textarea' || field.kind === 'richtext') {
    return (
      <div>
        <label style={labelStyle}>{field.label}</label>
        <textarea value={value || ''} onChange={e => set(e.target.value)} rows={field.kind === 'richtext' ? 8 : 3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
      </div>
    );
  }

  if (field.kind === 'image') {
    return (
      <div>
        <label style={labelStyle}>{field.label}</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input value={value || ''} onChange={e => set(e.target.value)} placeholder="Image URL" style={inputStyle} />
          <input type="file" accept="image/*" onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => set(String(r.result).split(',')[1] || '');
            r.readAsDataURL(f);
          }} style={{ fontSize: '12px' }} title="Upload (portal uploads via /api/upload — paste URL for external images)" />
        </div>
        {value && <img src={value} alt="" style={{ marginTop: '6px', maxHeight: '90px', borderRadius: '6px', border: '1px solid var(--border)' }} />}
      </div>
    );
  }

  const type = field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : 'text';
  return (
    <div>
      <label style={labelStyle}>{field.label}</label>
      <input type={type} value={value || ''} onChange={e => set(e.target.value)} style={inputStyle} />
    </div>
  );
}

function GroupEditor({ group, content, onChange }) {
  if (group.repeat) {
    const items = Array.isArray(content[group.key]) ? content[group.key] : [];
    const setItems = next => onChange(group.key, next);

    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--primary)' }}>{group.label}</h4>
          <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
          <span style={{ flex: 1 }} />
          <button style={ghostBtn} onClick={() => setItems([...items, Object.fromEntries(group.repeat.fields.map(f => [f.key, '']))])}>+ Add</button>
        </div>
        {items.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-faint)', fontStyle: 'italic', margin: '4px 0' }}>No items yet.</p>}
        {items.map((item, idx) => (
          <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', marginBottom: '10px', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Item {idx + 1}</strong>
              <span style={{ flex: 1 }} />
              <button style={{ ...dangerBtn, marginRight: '6px' }} onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={idx === 0}>↑</button>
              <button style={dangerBtn} onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {group.repeat.fields.map(f => (
                <Field key={f.key} field={f} value={item[f.key]} onChange={v => {
                  const next = [...items];
                  next[idx] = { ...next[idx], [f.key]: v };
                  setItems(next);
                }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>{group.label}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
        {group.fields.map(f => (
          <Field key={f.key} field={f} value={content[f.key]} onChange={v => onChange(f.key, v)} />
        ))}
      </div>
    </div>
  );
}

export default function PublicPortalPage() {
  const [schemas, setSchemas] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [content, setContent] = useState({});
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return fetch(`${apiUrl}${path}`, { ...options, headers });
  }

  async function loadBlock(key) {
    try {
      const res = await apiCall(`/api/cms/${key}`);
      const j = await res.json();
      const c = j.content || {};
      setContent(c);
      setSaved(c);
    } catch { setContent({}); setSaved({}); }
  }

  useEffect(() => {
    apiCall('/api/cms/schemas')
      .then(r => r.json())
      .then(list => {
        setSchemas(list);
        if (list.length && !activeKey) setActiveKey(list[0].key);
      })
      .catch(() => setError('Failed to load CMS schemas'));
  }, []);

  useEffect(() => { if (activeKey) loadBlock(activeKey); }, [activeKey]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiCall(`/api/cms/${activeKey}`, { method: 'PUT', body: JSON.stringify(content) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Save failed'); return; }
      setSaved(content);
      setError('');
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  function handleReset() { setContent(saved); setError(''); }

  const activeSchema = schemas.find(s => s.key === activeKey);
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary)' }}>Public Portal</h3>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-soft)' }}>
          Every heading, label, image, and link on the public website. Edits go live immediately.
        </p>
      </div>

      {error && (
        <div style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>
      )}

      {loading && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Loading…</p>}

      {!loading && schemas.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {schemas.map(s => (
              <button key={s.key} onClick={() => setActiveKey(s.key)} style={{
                padding: '8px 14px', borderRadius: '6px', fontSize: '12.5px', cursor: 'pointer',
                background: s.key === activeKey ? 'var(--primary)' : 'var(--surface)',
                color: s.key === activeKey ? '#fff' : 'var(--text-soft)',
                border: '1px solid ' + (s.key === activeKey ? 'var(--primary)' : 'var(--border)'),
                fontWeight: s.key === activeKey ? 600 : 400,
              }}>{s.label}</button>
            ))}
          </div>

          {activeSchema && (
            <div style={cardStyle}>
              <h4 style={{ margin: '0 0 16px', fontSize: '15px', color: 'var(--primary)' }}>{activeSchema.label}</h4>
              {activeSchema.groups.map(g => (
                <GroupEditor key={g.key} group={g} content={content} onChange={(k, v) => setContent(prev => ({ ...prev, [k]: v }))} />
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <button style={primaryBtn} onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : dirty ? 'Save Changes' : 'No changes'}
                </button>
                <button style={ghostBtn} onClick={handleReset} disabled={!dirty}>Discard</button>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && schemas.length === 0 && (
        <div style={cardStyle}>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>
            No CMS blocks configured. Ensure MongoDB is connected and you have <code>public-portal</code> access.
          </p>
        </div>
      )}
    </div>
  );
}