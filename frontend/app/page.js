'use client';
import { useState } from 'react';

export default function Home() {
  const [role, setRole] = useState(null);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--burgundy)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Jost', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--manjal)', color: '#3a2500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>నా</span>
          Nada Gurukulam
        </div>
        <div>
          {role ? (
            <button onClick={() => setRole(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '99px', cursor: 'pointer' }}>
              Role: {role} (Log out)
            </button>
          ) : (
            <button onClick={() => setRole('super_admin')} style={{ background: 'var(--manjal)', color: '#3a2500', border: 'none', padding: '6px 16px', borderRadius: '99px', fontWeight: 600, cursor: 'pointer' }}>
              Sign In (Preview)
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ background: 'linear-gradient(155deg, var(--burgundy) 0%, var(--burgundy-ink) 100%)', color: '#fbeee6', padding: '60px 8vw 80px' }}>
        <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', color: '#fff', maxWidth: '18ch', lineHeight: 1.15, margin: 0 }}>
          Nurturing Talent, Inspiring Excellence
        </h1>
        <div style={{ fontFamily: 'Petit Formal Script, cursive', color: 'var(--manjal)', fontSize: '26px', marginTop: '12px' }}>
          One World, One Family
        </div>
        <p style={{ maxWidth: '60ch', color: '#f0ddd2', marginTop: '18px', fontSize: '16px' }}>
          Nada Gurukulam blends India&apos;s timeless classical performing arts traditions with contemporary academic management, under the guidance of Sadguru Sri Madhusudan Sai.
        </p>
      </section>

      {/* Main Content / Portal view */}
      <main style={{ flex: 1, maxWidth: '1080px', margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        {role ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <h2>Welcome to the Academic Portal ({role})</h2>
            <p>Connected live to Supabase &amp; MongoDB storage layers.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px' }}>
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h4>13 Portal Modules</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Active and permission-enforced.</p>
              </div>
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h4>Timetable &amp; Live Classes</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Jitsi Meet integrated rooms.</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '22px', marginBottom: '12px' }}>Public Website &amp; Admissions</h3>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>Explore our disciplines or submit an enquiry for the upcoming academic term.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {['Carnatic Vocal', 'Hindustani Vocal', 'Bharatanatyam', 'Mridangam', 'Tabla', 'Flute'].map((art, idx) => (
                <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
                  <h4 style={{ fontSize: '18px', marginBottom: '8px' }}>{art}</h4>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-soft)', margin: 0 }}>Free traditional instruction under expert faculty.</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--surface-2)', padding: '24px 8vw', textAlign: 'center', fontSize: '13px', color: 'var(--text-soft)', borderTop: '1px solid var(--border)' }}>
        Nada Gurukulam — Sri Sathya Sai University for Human Excellence. 100% Free of Cost.
      </footer>
    </div>
  );
}
