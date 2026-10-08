'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const btn = { padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' };

export default function AssessmentBuilder() {
  const [blueprints, setBlueprints] = useState([]);
  const [activeBp, setActiveBp] = useState(null);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    supabase.from('evaluation_blueprints').select('*').order('created_at').then(({ data }) => setBlueprints(data || []));
  }, []);

  const loadBpDetails = async (id) => {
    setActiveBp(id);
    const { data } = await supabase.from('evaluation_sections').select('*, evaluation_questions(*)').eq('blueprint_id', id).order('order');
    setSections(data || []);
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={panel}>
        <h4>Blueprints</h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          {blueprints.map(bp => (
            <button key={bp.id} style={btn} onClick={() => loadBpDetails(bp.id)}>{bp.name}</button>
          ))}
          <button style={btn} onClick={() => { const n = prompt('Name:'); if(n) supabase.from('evaluation_blueprints').insert({name:n}).then(() => window.location.reload()); }}>+ New</button>
        </div>
      </div>
      {activeBp && (
        <div style={panel}>
          <h4>Sections</h4>
          {sections.map(s => <div key={s.id}>{s.title} ({s.evaluation_questions.length} questions)</div>)}
        </div>
      )}
    </div>
  );
}
