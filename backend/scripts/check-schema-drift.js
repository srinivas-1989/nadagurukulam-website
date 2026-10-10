// Schema-drift guard.
//
// Every `create table ... public.X` in specs/ must exist in the live database.
// A spec that is written but never listed in apply-schema.js FILES — or never
// re-run after being added — leaves the table missing while the server happily
// inserts into it, and the failure is silent (e.g. the notifications insert
// that failed for weeks). This turns that silence into a non-zero exit.
//
// Usage (from backend/): node scripts/check-schema-drift.js
// Reads DATABASE_URL from backend/.env.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SPECS_DIR = path.join(__dirname, '../../specs');

function expectedTables() {
  const names = new Set();
  for (const f of fs.readdirSync(SPECS_DIR).filter(f => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(SPECS_DIR, f), 'utf8');
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)/gi;
    let m;
    while ((m = re.exec(sql))) names.add(m[1].toLowerCase());
  }
  return names;
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing — set it in backend/.env first.');
    process.exit(1);
  }
  const expected = expectedTables();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public'"
    );
    const live = new Set(rows.map(r => r.table_name));
    const missing = [...expected].filter(t => !live.has(t)).sort();
    if (missing.length) {
      console.error(`Schema drift: ${missing.length} table(s) declared in specs/ are missing from the database:`);
      missing.forEach(t => console.error('  - ' + t));
      console.error('Run: node scripts/apply-schema.js  (and check the spec is listed in its FILES array)');
      process.exit(1);
    }
    console.log(`OK — all ${expected.size} spec-declared tables present (${live.size} total in public).`);
  } finally {
    await client.end();
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
