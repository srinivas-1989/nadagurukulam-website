'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const tabBtn = { padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', borderBottom: '2px solid transparent' };
const activeTabBtn = { ...tabBtn, borderBottom: '2px solid var(--primary)', color: 'var(--primary)', fontWeight: 600 };

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' };
const input = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px' };

export default function StudentAssessmentPage() {
  const [activeTab, setActiveTab] = useState('fill');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  let db;
  useEffect(() => {
    if (!db) {
      supabase.from('evaluation_blueprints').select('count').then(() => { db = true; });
    }
  }, []);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={panel}>
        <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)' }}>
          <button style={activeTab === 'fill' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('fill')}>Fill Assessment</button>
          <button style={activeTab === 'builder' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('builder')}>Assessment Builder</button>
          <button style={activeTab === 'access' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('access')}>Access Control</button>
          <button style={activeTab === 'highlights' ? activeTabBtn : tabBtn} onClick={() => setActiveTab('highlights')}>Highlights</button>
        </div>
      </div>

      {activeTab === 'fill' && (
        <div style={panel}>
          <h5>Fill Assessment</h5>
          <select style={input} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select student</option>
            <option value="demo-student-1">Student One</option>
            <option value="demo-student-2">Student Two</option>
          </select>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={input} />
          {msg && <p style={{ color: msg.tone === 'ok' ? 'green' : 'red' }}>{msg.text}</p>}
        </div>
      )}

      {activeTab === 'builder' && (
        <div style={panel}>
          <h5>Assessment Builder</h5>
          {db ? <p>Blueprints loading...</p> : <p>Loading blueprints...</p>}
        </div>
      )}

      {activeTab === 'access' && (
        <div style={panel}>
          <h5>Access Control</h5>
          <select style={input}>
            <option value="">Select student</option>
          </select>
          <button style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>Grant Access</button>
        </div>
      )}

      {activeTab === 'highlights' && (
        <div style={panel}>
          <h5>Highlights & Queries</h5>
          <p>Open questions requiring attention.</p>
        </div>
      )}
    </div>
  );
}