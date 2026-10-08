// End-to-end check of the dossier endpoints against the running API.
// Usage: node scripts/check-dossiers.js
// Signs in as Super Admin, exercises save -> submit -> review -> finalize ->
// reopen -> restore, and asserts the section-level access rule holds.
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const env = fs.readFileSync(path.join(__dirname, '../../frontend/.env.local'), 'utf8');
const url = (env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/) || [])[1];
const anon = (env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/) || [])[1];
const email = (env.match(/SMOKE_SUPERADMIN_EMAIL=(.*)/) || [])[1];
const password = (env.match(/SMOKE_SUPERADMIN_PASSWORD=(.*)/) || [])[1];
const API = process.env.API_URL || 'http://localhost:10000';

const post = (p, token, body) =>
  fetch(API + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {})
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p, token) =>
  fetch(API + p, { headers: { Authorization: `Bearer ${token}` } })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

(async () => {
  if (!email || !password) throw new Error('SMOKE_SUPERADMIN_EMAIL / _PASSWORD not in frontend/.env.local');

  const { data: signIn, error } = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json());
  if (!signIn.access_token) throw new Error('sign-in failed: ' + JSON.stringify(signIn));
  const token = signIn.access_token;

  // Find a student and a blueprint that has at least one section with a question.
  const { data: students } = await fetch(`${url}/rest/v1/users?role_key=eq.student&select=id,name`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  }).then(r => r.json());
  if (!students || !students.length) throw new Error('no students to test with');
  const student = students[0];

  const { data: sections } = await fetch(`${url}/rest/v1/evaluation_sections?select=id,blueprint_id,title`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  }).then(r => r.json());
  if (!sections || !sections.length) throw new Error('no blueprint sections seeded');
  const section = sections[0];

  const { data: questions } = await fetch(`${url}/rest/v1/evaluation_questions?section_id=eq.${section.id}&select=id,title,field_type`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  }).then(r => r.json());
  if (!questions || !questions.length) throw new Error('seeded section has no questions');

  // Point the student at this blueprint so the schema resolves.
  await fetch(`${url}/rest/v1/users?id=eq.${student.id}`, {
    method: 'PATCH',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ dossier_blueprint_id: section.blueprint_id })
  });

  const month = '2026-10';
  const P = `/api/dossiers/students/${student.id}/${month}`;

  let r = await get(P, token);
  assert.strictEqual(r.status, 200, 'GET sheet: ' + JSON.stringify(r.body));
  assert.ok(r.body.sections.length, 'sheet returned sections');
  assert.ok(r.body.sections.every(s => s.can_edit), 'super admin can edit every section');
  console.log('✓ sheet loads, super admin sees all sections');

  // Draft save.
  r = await post(P, token, { responses: { [questions[0].id]: 'Exemplary' }, action_type: 'save_draft' });
  assert.strictEqual(r.status, 200, 'save draft: ' + JSON.stringify(r.body));
  assert.strictEqual(r.body.status, 'draft');
  console.log('✓ draft save');

  // Submit must refuse while the rest of the sheet is blank.
  r = await post(P, token, { responses: {}, action_type: 'submit_final' });
  assert.strictEqual(r.status, 400, 'submit refused with blanks: ' + JSON.stringify(r.body));
  assert.ok(Array.isArray(r.body.unanswered), 'submit reports which questions are blank');
  console.log('✓ submit blocked while questions are unanswered');

  // Fill everything, then submit.
  const all = {};
  questions.forEach(q => { all[q.id] = 'Strong'; });
  r = await post(P, token, { responses: all, action_type: 'submit_final' });
  assert.strictEqual(r.status, 200, 'submit: ' + JSON.stringify(r.body));
  assert.strictEqual(r.body.status, 'submitted');
  console.log('✓ submit locks the sheet');

  // A locked sheet must refuse further edits.
  r = await post(P, token, { responses: { [questions[0].id]: 'N/O' }, action_type: 'save_draft' });
  assert.strictEqual(r.status, 409, 'locked sheet refuses edits: ' + JSON.stringify(r.body));
  console.log('✓ submitted sheet is read-only');

  r = await post(`${P}/review`, token);
  assert.strictEqual(r.status, 200, 'review: ' + JSON.stringify(r.body));
  assert.strictEqual(r.body.status, 'in_review');
  console.log('✓ review');

  r = await post(`${P}/finalize`, token);
  assert.strictEqual(r.status, 200, 'finalize: ' + JSON.stringify(r.body));
  assert.strictEqual(r.body.status, 'finalized');
  console.log('✓ finalize');

  // Finalized can still be reopened by super admin.
  r = await post(`${P}/reopen`, token, { reason: 'self-check' });
  assert.strictEqual(r.status, 200, 'reopen: ' + JSON.stringify(r.body));
  assert.strictEqual(r.body.status, 'draft');
  console.log('✓ super admin can reopen a finalized dossier');

  // Version history must exist and a restore must bring back old content.
  r = await get(P, token);
  const id = r.body.assessment_id;
  r = await get(`/api/dossiers/assessments/${id}/versions`, token);
  assert.ok(Array.isArray(r.body) && r.body.length >= 4, `expected >=4 versions, got ${r.body && r.body.length}`);
  const firstVersion = r.body[r.body.length - 1].version_no;

  await post(P, token, { responses: {}, cleared_qids: questions.map(q => q.id), action_type: 'save_draft' });
  r = await get(P, token);
  assert.strictEqual(Object.keys(r.body.responses).length, 0, 'cleared_qids removed every answer');

  r = await post(`/api/dossiers/assessments/${id}/restore/${firstVersion}`, token);
  assert.strictEqual(r.status, 200, 'restore: ' + JSON.stringify(r.body));
  r = await get(P, token);
  assert.strictEqual(r.body.responses[questions[0].id], 'Exemplary', 'restored the original answer');
  console.log('✓ version history + restore round-trip');

  // Leave the record as it was found: reopened, original answers in place.
  console.log('\nAll dossier endpoint checks passed.');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });