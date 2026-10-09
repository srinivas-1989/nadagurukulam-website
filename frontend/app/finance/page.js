'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '14px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 };

export default function FinancePage() {
  const [structures, setStructures] = useState([]);
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [studentId, setStudentId] = useState('');
  const [feeStructureId, setFeeStructureId] = useState('');
  const [sponsoredBy, setSponsoredBy] = useState('');
  const [nullify, setNullify] = useState(true);
  const [notes, setNotes] = useState('');

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${path}`, { ...options, headers });
    return res.json();
  }

  async function reload() {
    const [s, p, u] = await Promise.all([
      apiCall('/api/fee_structures'),
      apiCall('/api/fee_payments'),
      apiCall('/api/users')
    ]);
    setStructures(Array.isArray(s) ? s : []);
    setPayments(Array.isArray(p) ? p : []);
    setStudents((Array.isArray(u) ? u : []).filter(x => x.role_key?.includes('student') || x.roll_no));
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  async function handleCreateRecord(e) {
    e.preventDefault();
    const struct = structures.find(x => x.id === feeStructureId);
    const baseAmount = struct ? Number(struct.total_amount) : 0;
    const finalAmount = nullify ? 0 : baseAmount;

    const payload = {
      student_id: studentId,
      fee_structure_id: feeStructureId || null,
      amount_paid: finalAmount,
      payment_mode: sponsoredBy ? 'sponsored' : 'cash',
      status: nullify ? 'verified' : 'pending',
      transaction_ref: sponsoredBy ? `Sponsored by: ${sponsoredBy}` : 'Institutional Waiver',
      receipt_no: `REC-${Date.now().toString().slice(-6)}`
    };

    const res = await apiCall('/api/fee_payments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.error) {
      alert('Error: ' + res.error);
    } else {
      setShowModal(false);
      setStudentId('');
      setFeeStructureId('');
      setSponsoredBy('');
      setNullify(true);
      reload();
    }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading Finance & Sponsorships...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--primary)' }}>Finance & Sponsorships</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Manage fee structures, institutional sponsorships, and zero-balance bill nullifications.
          </p>
        </div>
        <button style={btn} onClick={() => setShowModal(true)}>+ Record Sponsorship / Bill</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Fee Structures</h3>
          {structures.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No fee structures defined yet.</p>
          ) : (
            structures.map(s => (
              <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <strong>{s.name}</strong> ({s.academic_year}) — Standard: ₹{s.total_amount}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.description}</div>
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Sponsored & Nullified Bills</h3>
          {payments.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No records found.</p>
          ) : (
            payments.map(p => {
              const st = students.find(x => x.id === p.student_id);
              const fs = structures.find(x => x.id === p.fee_structure_id);
              return (
                <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{st?.name || 'Student'}</strong>
                    <span style={{ color: p.amount_paid === 0 ? 'green' : 'inherit', fontWeight: 'bold' }}>
                      ₹{p.amount_paid} {p.amount_paid === 0 && '(Nullified)'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Fee: {fs?.name || 'General'} | {p.transaction_ref || 'Sponsored'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--accent)' }}>
                    Receipt: {p.receipt_no} | Status: {p.status}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius-xl)', width: '450px', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0 }}>Record Student Sponsorship & Nullify Bill</h3>
            <form onSubmit={handleCreateRecord} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Select Student</label>
                <select style={{ ...inputStyle, width: '100%' }} value={studentId} onChange={e => setStudentId(e.target.value)} required>
                  <option value="">-- Choose student --</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.roll_no || s.email})</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Fee Structure</label>
                <select style={{ ...inputStyle, width: '100%' }} value={feeStructureId} onChange={e => setFeeStructureId(e.target.value)} required>
                  <option value="">-- Choose structure --</option>
                  {structures.map(st => <option key={st.id} value={st.id}>{st.name} (₹{st.total_amount})</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Sponsored By (Donor / Organization)</label>
                <input type="text" style={{ ...inputStyle, width: '100%' }} placeholder="e.g. Shri Rama Trust / Donor Name" value={sponsoredBy} onChange={e => setSponsoredBy(e.target.value)} required />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <input type="checkbox" id="nullifyCheck" checked={nullify} onChange={e => setNullify(e.target.checked)} />
                <label htmlFor="nullifyCheck" style={{ fontSize: '14px', cursor: 'pointer' }}>
                  Nullify amount in final bill (Set payable amount to ₹0.00)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" style={{ ...btn, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" style={btn}>Save Sponsorship & Nullify</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
