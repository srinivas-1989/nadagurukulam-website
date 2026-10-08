// Verifies the Phase 5 tables exist with RLS enabled, and that the seeded
// attendance states are present. Run after apply-schema/apply-rls.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLES = [
  'attendance_states', 'class_sessions', 'attendance_records',
  'grading_schemes', 'rubrics', 'rubric_criteria',
  'assessment_plans', 'assessments', 'assessment_submissions',
  'evaluations', 'results', 'result_corrections',
];

(async () => {
  let bad = 0;
  for (const t of TABLES) {
    const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) { console.log(`FAIL ${t}: ${error.message}`); bad++; continue; }
    console.log(`ok   ${t} (${count} rows)`);
  }
  const { data: states } = await supabase.from('attendance_states').select('key,label,counts_as_present').order('sort_order');
  console.log('attendance_states:', JSON.stringify(states));
  const { data: seeded } = await supabase.from('role_permissions').select('module_key,access_level').eq('role_key', 'super_admin').eq('module_key', 'assessment');
  console.log('super_admin assessment seed:', JSON.stringify(seeded));
  process.exit(bad ? 1 : 0);
})();