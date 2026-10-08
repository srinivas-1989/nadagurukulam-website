'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const btn = { padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '12px' };
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' };
const input = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' };

export default function DossierAdminPage() {
  const [blueprints, setBlueprints] = useState([]);
  const [activeBp, setActiveBp] = useState(null);
  const [sections, setSections] = useState([]);
  const [users, setUsers] = useState([]);

  const loadBlueprints = async () => {
    const { data } = await supabase.from('evaluation_blueprints').select('*').order('created_at');
    setBlueprints(data || []);
  };

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('id,name,role_key').order('name');
    setUsers(data || []);
  };

  useEffect(() => { loadBlueprints(); loadUsers(); }, []);

  const loadBpDetails = async (id) => {
    setActiveBp(id);
    const { data } = await supabase.from('evaluation_sections').select('*, evaluation_questions(*)').eq('blueprint_id', id).order('order');
    setSections(data || []);
  };

  const assignSection = async (sectionId, userId) => {
    if (!userId) return;
    await supabase.from('dossier_section_assignments').upsert({ section_id: sectionId, user_id: userId });
    alert('Access granted.');
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={panel}>
        <h4>Blueprints</h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          {blueprints.map(bp => (
            <button key={bp.id} style={activeBp === bp.id ? btnPrimary : btn} onClick={() => loadBpDetails(bp.id)}>{bp.name}</button>
          ))}
          <button style={btn} onClick={() => { const n = prompt('Name:'); if(n) supabase.from('evaluation_blueprints').insert({name:n}).then(loadBlueprints); }}>+ New Blueprint</button>
        </div>
      </div>

      {activeBp && (
        <div style={panel}>
          <h4>Sections & Access</h4>
          {sections.map(sec => (
            <div key={sec.id} style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>
              <strong>{sec.title}</strong>
              <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select onChange={(e) => assignSection(sec.id, e.target.value)} style={input}>
                  <option value="">Grant access to user...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role_key})</option>)}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--text-soft)' }}>{sec.editable_by?.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}