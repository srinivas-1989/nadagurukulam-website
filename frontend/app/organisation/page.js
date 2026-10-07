'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function OrganisationPage() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUnits() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';
        const res = await fetch(`${apiUrl}/api/organisation/units`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        setUnits(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadUnits();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Organisation Units</h1>
      {loading ? <p>Loading...</p> : (
        <ul>
          {units.map(u => <li key={u.id}>{u.name} ({u.type})</li>)}
        </ul>
      )}
    </div>
  );
}
