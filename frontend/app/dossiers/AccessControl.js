'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const input = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' };
const btn = { padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' };
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' };

export default function AccessControlPage() {
  const [users, setUsers] = useState([]);
  const [sections, setSections] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [userId, setUserId] = useState('');
  const [sectionId, setSectionId] = useState('');

  useEffect(() => {
    supabase.from('users').select('id, name, role_key').order('name').then(({ data }) => setUsers(data || []));
    supabase.from('evaluation_sections').select('id, title').then(({ data }) => setSections(data || []));
    supabase.from('dossier_section_assignments').select('*, users(name), evaluation_sections(title)').order('created_at').then(({ data }) => setAssignments(data || []));
  }, []);

  const assignSection = async () => {
    if (!userId || !sectionId) return;
    await supabase.from('dossier_section_assignments').upsert({ section_id: sectionId, user_id: userId });
    alert('Access granted.');
    setUserId(''); setSectionId('');
    window.location.reload();
  };

  const revoke = async (id) => {
    await supabase.from('dossier_section_assignments').delete().eq('id', id);
    alert('Revoked.');
    window.location.reload();
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={panel}>
        <h4>Users</h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          {users.map(u => <div key={u.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><span style={{ fontSize: '13px' }}>{u.name}</span> <span style={{ fontSize: '11px', color: 'var(--text-soft)' }}>({u.role_key})</span></div>)}
        </div>
      </div>

      {assignments.map(a => (
  );
}