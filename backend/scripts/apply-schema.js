// Applies the Phase 4 schema + courses migration to the Supabase Postgres database.
// Usage (from backend/): node scripts/apply-schema.js
// Reads DATABASE_URL from backend/.env. Safe to re-run (everything is idempotent).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const FILES = [
  path.join(__dirname, '../../specs/phase4-supabase-schema.sql'),
  path.join(__dirname, '../../specs/supabase-courses-migration.sql'),
  path.join(__dirname, '../../specs/supabase-course-types-migration.sql'),
  path.join(__dirname, '../../specs/supabase-roles-migration.sql'),
  path.join(__dirname, '../../specs/supabase-auth-user-link.sql'),
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
    console.log('Schema is up to date.');
  } finally {
    await client.end();
  }
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
