'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const LEVEL = { None: 0, View: 1, Self: 2, Submits: 3, Own: 4, Manage: 5, Full: 6 };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px', marginBottom: '12px' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' };

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('None');
  const [data, setData] = useState(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  const apiCall = useCallback(async (path) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${apiUrl}${path}`, { headers });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Request failed (${res.status})`); }
    return res.json().catch(() => null);
  }, [apiUrl]);

  const reload = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); setLoading(false); return; }
      const perm = await apiCall('/api/my-permissions');
      setLevel(perm.role_key === 'super_admin' ? 'Full' : (perm.perms?.analytics || 'None'));
      setData(await apiCall('/api/analytics/summary'));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [apiCall]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div style={{ padding: '24px' }}>Loading…</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--primary)' }}>{error}</div>;
  if ((LEVEL[level] ?? 0) < LEVEL.View) return <div style={{ padding: '24px', color: 'var(--text-faint)' }}>You do not have access to analytics.</div>;
  if (!data) return null;

  const Stat = ({ label, value, sub }) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '12px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '22px', color: 'var(--primary)', fontWeight: 600 }}>{value}</div>
      {sub ? <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{sub}</div> : null}
    </div>
  );
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const money = (v) => `₹${(v ?? 0).toLocaleString('en-IN')}`;

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      <h1 style={{ color: 'var(--primary)', fontSize: '22px', marginBottom: '4px' }}>Analytics</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: 0 }}>
        Institution-wide roll-up across enrolment, fees, attendance and results. Aggregated server-side as of {data.generated_at ? new Date(data.generated_at).toLocaleString() : '—'}.
      </p>

      <div style={card}>
        <h2 style={{ fontSize: '14px', color: 'var(--primary)', margin: '0 0 10px' }}>People</h2>
        <div style={grid}>
          <Stat label="Total" value={data.people.total} sub={`${data.people.active} active`} />
          <Stat label="Students" value={data.people.students} />
          <Stat label="Staff" value={data.people.staff} />
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: '14px', color: 'var(--primary)', margin: '0 0 10px' }}>Academics</h2>
        <div style={grid}>
          <Stat label="Programmes" value={data.academics.disciplines} />
          <Stat label="Courses" value={data.academics.courses} sub={`${data.academics.total_credits} credits`} />
          <Stat label="Offerings" value={data.academics.offerings} />
          <Stat label="Batches" value={data.academics.batches} sub={`${data.academics.active_batches} active`} />
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: '14px', color: 'var(--primary)', margin: '0 0 10px' }}>Enrolment</h2>
        <div style={grid}>
          <Stat label="Enrolled" value={data.enrolment.active} />
          <Stat label="Completed" value={data.enrolment.completed} />
          <Stat label="Dropped" value={data.enrolment.dropped} />
        </div>
        {data.enrolment.by_discipline.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginTop: '12px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                <th style={{ padding: '6px 8px' }}>Programme</th>
                <th style={{ padding: '6px 8px' }}>Batches</th>
                <th style={{ padding: '6px 8px' }}>Students</th>
              </tr>
            </thead>
            <tbody>
              {data.enrolment.by_discipline.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>{d.name}</td>
                  <td style={{ padding: '6px 8px' }}>{d.batches}</td>
                  <td style={{ padding: '6px 8px' }}>{d.students}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: '14px', color: 'var(--primary)', margin: '0 0 10px' }}>Fees</h2>
        <div style={grid}>
          <Stat label="Collected" value={money(data.fees.collected)} sub={`${data.fees.verified_count} verified`} />
          <Stat label="Pending" value={money(data.fees.pending)} />
          <Stat label="Payments" value={data.fees.payments} />
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: '14px', color: 'var(--primary)', margin: '0 0 10px' }}>Attendance</h2>
        <div style={grid}>
          <Stat label="Sessions held" value={data.attendance.sessions_held} />
          <Stat label="Marks" value={data.attendance.marked} sub={`${data.attendance.present} present`} />
          <Stat label="Present %" value={pct(data.attendance.percentage)} />
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: '14px', color: 'var(--primary)', margin: '0 0 10px' }}>Results</h2>
        <div style={grid}>
          <Stat label="Results" value={data.results.total} sub={`${data.results.published} published`} />
          <Stat label="Pass rate" value={pct(data.results.pass_rate)} />
          <Stat label="Avg %" value={pct(data.results.average_percentage)} />
        </div>
        {Object.keys(data.results.distribution).length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
            {Object.entries(data.results.distribution).map(([g, n]) => (
              <span key={g} style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11.5px', border: '1px solid var(--border)' }}>
                <b style={{ color: 'var(--primary)' }}>{g}</b> · {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
