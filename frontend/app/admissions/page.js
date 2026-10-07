'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdmissionsPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadApps() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';
        const res = await fetch(`${apiUrl}/api/admissions/applications`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        setApps(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadApps();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Admissions Applications</h1>
      {loading ? <p>Loading...</p> : (
        <ul>
          {apps.map(a => <li key={a.id}>Application {a.id.slice(0,8)} - Status: {a.status}</li>)}
        </ul>
      )}
    </div>
  );
}
