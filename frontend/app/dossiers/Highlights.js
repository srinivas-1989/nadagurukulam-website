'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const btn = { padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' };
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' };
const input = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' };

export default function HighlightsPage() {
  const [flags, setFlags] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    supabase.from('evaluation_questions').select('*').not('is_flagged', 'is', null).then(({ data }) => setFlags(data || []));
  }, []);

  const toggleFlag = async (qid) => {
    await supabase.from('evaluation_questions').update({ is_flagged: !flags.find(f => f.id === qid).is_flagged }).eq('id', qid);
    window.location.reload();
  };

  const reply = async (qid, body) => {
    await supabase.from('question_replies').insert({ question_id: qid, body });
    alert('Replied.');
    window.location.reload();
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={panel}>
        <h4>Open Highlights & Queries</h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select style={input} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select question</option>
            {flags.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
          <button style={btnPrimary} onClick={() => toggleFlag(selectedId)}>Toggle Flag</button>
        </div>
        {selectedId && flags.find(f => f.id === selectedId) && (
          <div style={{ marginTop: '12px', padding: '10px', borderRadius: 'var(--radius-xl)', background: 'var(--primary)' }}>
            <p style={{ color: '#fff', margin: 0 }}>Reply:</p>
            <input style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
            <button style={{ marginTop: '8px', padding: '6px 12px' }}>Send Reply</button>
          </div>
        )}
      </div>
    </div>
  );
}