// Creates the auth.users row for every sample profile seeded by
// specs/supabase-seed-sample-data.sql (emails ending in @ndg.example) and links
// it back via public.users.auth_user_id, mirroring what the portal's Add User
// flow does. Without this the sample profiles exist but cannot log in.
//
// These are throwaway test accounts: emails are on a non-routable domain and no
// mail is sent — temp passwords are printed here instead. Reversible: delete the
// auth users, or null out auth_user_id, to undo.
//
// Usage (from backend/): node scripts/create-sample-auth-users.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const genTempPassword = () => crypto.randomBytes(9).toString('base64url').slice(0, 12);
const EMAIL_DOMAIN = '@ndg.example';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data.users || []).find(u => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if ((data.users || []).length < 200) return null;
  }
  return null;
}

(async () => {
  const { data: profiles, error } = await supabase
    .from('users')
    .select('id, email, name, role_key, auth_user_id')
    .like('email', `%${EMAIL_DOMAIN}`)
    .order('email');
  if (error) { console.error('ERR reading users:', error.message); process.exit(1); }
  if (!profiles.length) { console.log('No sample users found — run specs/supabase-seed-sample-data.sql first.'); return; }

  const results = [];
  for (const p of profiles) {
    const email = p.email.toLowerCase();
    if (p.auth_user_id) {
      results.push({ email, role: p.role_key, status: 'already linked' });
      continue;
    }
    const tempPassword = genTempPassword();
    let authUser;
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true, user_metadata: { name: p.name }
    });
    if (cErr) {
      if (!/already|registered|exists/i.test(cErr.message || '')) {
        results.push({ email, role: p.role_key, status: 'ERROR: ' + cErr.message });
        continue;
      }
      authUser = await findAuthUserByEmail(email);
      if (!authUser) { results.push({ email, role: p.role_key, status: 'ERROR: auth user exists but not found' }); continue; }
    } else {
      authUser = created.user;
    }
    const { error: uErr } = await supabase
      .from('users')
      .update({ auth_user_id: authUser.id, must_change_password: true })
      .eq('id', p.id);
    if (uErr) { results.push({ email, role: p.role_key, status: 'ERROR linking: ' + uErr.message }); continue; }
    const known = !cErr; // we generated it only if we created the user this run
    results.push({ email, role: p.role_key, status: 'created + linked', tempPassword: known ? tempPassword : '(pre-existing auth user — reset password in Supabase if unknown)' });
  }

  console.log('\nSample users:');
  for (const r of results) {
    console.log(`  ${r.status.padEnd(16)} ${r.email.padEnd(30)} ${r.role.padEnd(22)} ${r.tempPassword || ''}`);
  }
  const bad = results.filter(r => r.status.startsWith('ERROR'));
  if (bad.length) process.exit(1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
