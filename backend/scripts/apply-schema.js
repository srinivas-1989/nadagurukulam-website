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
  path.join(__dirname, '../../specs/supabase-program-structure-migration.sql'),
  path.join(__dirname, '../../specs/supabase-users-expansion.sql'),
  path.join(__dirname, '../../specs/supabase-examination-types.sql'),
  path.join(__dirname, '../../specs/supabase-courses-expansion.sql'),
  path.join(__dirname, '../../specs/supabase-class-entries.sql'),
  path.join(__dirname, '../../specs/supabase-assignments-v2.sql'),
  path.join(__dirname, '../../specs/supabase-projects-certificates.sql'),
  path.join(__dirname, '../../specs/supabase-timetable-enhance.sql'),
  path.join(__dirname, '../../specs/supabase-class-entries-enhance.sql'),
  path.join(__dirname, '../../specs/supabase-timetable-multi-subject.sql'),
  path.join(__dirname, '../../specs/supabase-timetable-periods.sql'),
  path.join(__dirname, '../../specs/supabase-roles-rename.sql'),
  path.join(__dirname, '../../specs/supabase-curriculum-rebuild.sql'),
  path.join(__dirname, '../../specs/supabase-category-duration.sql'),
  path.join(__dirname, '../../specs/supabase-curriculum-structure-fix.sql'),
  path.join(__dirname, '../../specs/supabase-course-types-drop.sql'),
  path.join(__dirname, '../../specs/supabase-course-syllabi-version-per-year.sql'),
  path.join(__dirname, '../../specs/phase7-users-kyc.sql'),
  path.join(__dirname, '../../specs/supabase-users-pending-status.sql'),
  path.join(__dirname, '../../specs/supabase-dashboard-widgets.sql'),
  path.join(__dirname, '../../specs/supabase-user-avatar.sql'),
  path.join(__dirname, '../../specs/supabase-user-initials.sql'),
  path.join(__dirname, '../../specs/supabase-organisation-admissions.sql'),
  path.join(__dirname, '../../specs/supabase-audit-log.sql'),
  path.join(__dirname, '../../specs/supabase-academic-core.sql'),
  path.join(__dirname, '../../specs/supabase-course-offerings.sql'),
  path.join(__dirname, '../../specs/supabase-lms-hierarchy.sql'),
  path.join(__dirname, '../../specs/supabase-faculty-assignments.sql'),
  path.join(__dirname, '../../specs/supabase-student-relationships.sql'),
  path.join(__dirname, '../../specs/supabase-attendance-assessment.sql'),
  path.join(__dirname, '../../specs/supabase-residential-events.sql'),
  path.join(__dirname, '../../specs/supabase-student-dossiers.sql'),
  path.join(__dirname, '../../specs/supabase-dossier-access.sql'),
  path.join(__dirname, '../../specs/supabase-finance-hr.sql'),
  path.join(__dirname, '../../specs/supabase-documents-notifications.sql'),
  path.join(__dirname, '../../specs/phaseX-password-resets.sql'),
  // Data seeds whose tables came from specs above (grading bands, module perms).
  path.join(__dirname, '../../specs/supabase-grading-scheme-default.sql'),
  path.join(__dirname, '../../specs/supabase-attendance-results-permissions.sql'),
  path.join(__dirname, '../../specs/supabase-analytics-permissions.sql'),
  // Policies must run last: every table they reference has to exist first.
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
    console.log('Schema is up to date.');
  } finally {
    await client.end();
  }
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
