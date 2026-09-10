// Applies RLS policies + auth_user_id linkage to the Supabase Postgres database.
// Usage (from backend/): node scripts/apply-rls.js
// Reads DATABASE_URL from backend/.env. Safe to re-run (everything is idempotent).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const FILES = [
  path.join(__dirname, '../../specs/supabase-auth-user-link.sql'),
  path.join(__dirname, '../../specs/supabase-rls-policies.sql'),
];

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing — set it in backend/.env first.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const file of FILES) {
      console.log(`Applying ${path.basename(file)} …`);
      await client.query(fs.readFileSync(file, 'utf8'));
      console.log(`  ✓ applied`);
    }
    console.log('RLS policies are up to date.');
  } finally {
    await client.end();
  }
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
