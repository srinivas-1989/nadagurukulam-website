const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}

// ── helpers ───────────────────────────────────────────────────────────────
function deriveHours(periods) {
  const n = Number(periods);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n * 45 / 60) * 100) / 100;
}
function genTempPassword() {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}
function genOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return mailer;
}
async function sendOTPEmail(to, otp, tempPassword) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@nadagurukulam.org';
  const subject = tempPassword ? 'Your Nada Gurukulam account — temp password & OTP' : 'Your Nada Gurukulam OTP';
  const html = tempPassword
    ? `<p>Temp password: <b>${tempPassword}</b></p><p>OTP: <b>${otp}</b> (expires in 10 minutes)</p><p>Log in and change your password when prompted.</p>`
    : `<p>OTP: <b>${otp}</b> (expires in 10 minutes)</p>`;
  const m = getMailer();
  if (m) {
    try { await m.sendMail({ from, to, subject, html }); return true; } catch (e) { console.error('SMTP send failed:', e.message); return false; }
  }
  return false;
}
const otpRateMap = new Map(); // key -> timestamps[]
function checkOtpRate(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const arr = (otpRateMap.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  otpRateMap.set(key, arr);
  return true;
}

const app = express();
const PORT = process.env.PORT || 10000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s => s.trim()).filter(Boolean) : []),
];
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname.endsWith('.vercel.app')) return true;
  } catch {}
  return false;
}
app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '16mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true, cms: mongoose.connection.readyState === 1 ? 'up' : 'down' }));

// Public feeds — no auth; only published rows. Ponytail: if disciplines need
// draft/published later, add status col + filter here.
app.get('/api/public/events', async (req, res) => {
  try { const { data, error } = await supabase.from('events').select('*').eq('status', 'published').order('date', { ascending: false }); if (error) throw error; res.json(data || []); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/public/jobs', async (req, res) => {
  try { const { data, error } = await supabase.from('jobs').select('*').eq('status', 'published').order('created_at', { ascending: false }); if (error) throw error; res.json(data || []); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/public/disciplines', async (req, res) => {
  try { const { data, error } = await supabase.from('disciplines').select('*').order('name'); if (error) throw error; res.json(data || []); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/public/enquiries', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const contact = String(req.body.contact || '').trim();
    const type = String(req.body.type || 'general').trim();
    const message = String(req.body.message || '').trim() || null;
    if (!name || !contact) return res.status(400).json({ error: 'name and contact are required' });
    if (!['admission', 'general'].includes(type)) return res.status(400).json({ error: 'Invalid enquiry type' });
    const { data, error } = await supabase.from('enquiries').insert([{ name, contact, type, message, status: 'new' }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Storage upload — auth required; base64 JSON, ~15 MB limit. Uses Supabase Storage
// bucket "attachments" (create in dashboard or via SQL). No new dep; signed URLs swap later.
const UPLOAD_BUCKET = process.env.STORAGE_BUCKET || 'attachments';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf','image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','video/mp4','application/zip']);
app.post('/api/upload', authMiddleware, async (req, res) => {
  try {
    const { filename, mime, data } = req.body || {};
    if (!filename || !mime || !data) return res.status(400).json({ error: 'filename, mime and base64 data required' });
    if (!ALLOWED_MIME.has(String(mime))) return res.status(400).json({ error: 'Unsupported file type' });
    const buf = Buffer.from(String(data), 'base64');
    if (buf.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'File too large (max 15 MB)' });
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
    const key = `${req.auth.profile.id}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(key, buf, { contentType: String(mime), upsert: false });
    if (error) {
      if (/not found|bucket/i.test(error.message)) return res.status(503).json({ error: `Storage bucket "${UPLOAD_BUCKET}" missing — create it in Supabase Storage.` });
      throw error;
    }
    const { data: pub } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(key);
    res.status(201).json({ url: pub.publicUrl, path: key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// AUTH MIDDLEWARE — verify Supabase JWT, resolve user role & permissions
// ============================================================================
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Fetch the user's role from public.users — match by auth_user_id
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('role_key, id, name, email, must_change_password')
      .eq('auth_user_id', user.id)
      .single();
    if (profileErr || !profile) {
      // User exists in Supabase Auth but not in our users table — deny
      return res.status(403).json({ error: 'User not registered in portal' });
    }
    // Force password change gate — allow only OTP/password-change + health/cms reads
    if (profile.must_change_password) {
      const allow = (
        req.path.startsWith('/api/auth/') ||
        req.path === '/health' || req.path === '/api/health' ||
        (req.method === 'GET' && req.path.startsWith('/api/cms'))
      );
      if (!allow) return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    req.auth = { user, profile };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Auth verification failed' });
  }
}

// ============================================================================
// PERMISSION ENFORCEMENT — server-side gate on every operation
// ============================================================================
const LEVEL_ORDER = { '—': 0, 'View': 1, 'Self': 2, 'Submits': 3, 'Own': 4, 'Manage': 5, 'Full': 6 };

async function getAccessLevel(roleKey, moduleKey) {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('access_level')
    .eq('role_key', roleKey)
    .eq('module_key', moduleKey)
    .single();
  if (error || !data) return null; // no row = module hidden
  return data.access_level;
}

function canAccess(level, action) {
  const thresholds = { list: 1, create: 3, update: 4, delete: 6 };
  return LEVEL_ORDER[level] >= (thresholds[action] ?? 0);
}

// API key → module_key for permission lookup (api key is the URL segment, e.g. /api/curriculum)
const API_TO_MODULE = {
  users: 'users', curriculum: 'curriculum', batches: 'batches',
  timetable: 'timetable', liveclasses: 'liveclasses', lessonplans: 'lessonplans',
  assignments: 'assignments', feedback: 'feedback', events: 'events',
  jobs: 'jobs', enquiries: 'enquiries', activities: 'activities',
  courses: 'curriculum', course_modules: 'curriculum', course_module_topics: 'curriculum',
  course_types: 'curriculum', examination_types: 'curriculum',
  roles: 'roles', role_permissions: 'roles',
  class_entries: 'timetable', class_confirmations: 'timetable',
  assignment_submissions: 'assignments',
  projects: 'projects', certificates: 'certificates'
};
// Reverse: table name → module_key (crud is instantiated with table names)
const TABLE_TO_MODULE = {
  disciplines: 'curriculum', timetable_slots: 'timetable',
  live_sessions: 'liveclasses', lesson_plans: 'lessonplans',
  courses: 'curriculum', course_modules: 'curriculum', course_module_topics: 'curriculum',
  course_types: 'curriculum', examination_types: 'curriculum',
  class_entries: 'timetable', class_confirmations: 'timetable',
  assignment_submissions: 'assignments',
  projects: 'projects', certificates: 'certificates'
};

// ── Row-level scoping helpers ──────────────────────────────────────────────
// Own = only rows in caller's batches; Self = only caller's own row.
// Returns null if the table has no ownership concept for this level (caller gets 403).
// NOTE: supabase-js builders are thenables — awaiting a builder executes it.
// So this helper must stay synchronous; ownedBatchIds are fetched beforehand.

async function getOwnedBatchIds(profileId) {
  const { data: enrollRows } = await supabase.from('enrollments').select('batch_id').eq('student_id', profileId);
  const { data: facultyRows } = await supabase.from('batch_faculty').select('batch_id').eq('faculty_id', profileId);
  const { data: ownedBatches } = await supabase.from('batches').select('id').eq('faculty_id', profileId);
  const ids = new Set();
  (enrollRows || []).forEach(r => ids.add(r.batch_id));
  (facultyRows || []).forEach(r => ids.add(r.batch_id));
  (ownedBatches || []).forEach(r => ids.add(r.id));
  return [...ids];
}

const OWN_BATCH_TABLES = new Set(['timetable_slots', 'live_sessions', 'lesson_plans', 'assignments', 'feedback', 'activities', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects']);

function applyListScope(query, table, level, profile, ownedBatchIds) {
  if (table === 'assignment_submissions') {
    if (level === 'Manage' || level === 'Full') return query;
    if (level === 'Own') {
      if (!ownedBatchIds || ownedBatchIds.length === 0) return query.in('batch_id', ['00000000-0000-0000-0000-000000000000']);
      return query.in('batch_id', ownedBatchIds);
    }
    return query.eq('student_id', profile.id);
  }
  if (table === 'projects') {
    if (level === 'Manage' || level === 'Full') return query;
    if (level === 'Own') {
      if (!ownedBatchIds || ownedBatchIds.length === 0) return query.in('batch_id', ['00000000-0000-0000-0000-000000000000']);
      return query.in('batch_id', ownedBatchIds);
    }
    return query.eq('student_id', profile.id);
  }
  if (table === 'certificates') {
    if (level === 'Manage' || level === 'Full') return query;
    return query.eq('student_id', profile.id);
  }
  if (level === 'View' || level === 'Submits' || level === 'Manage' || level === 'Full') return query;

  if (level === 'Self') {
    if (table === 'users') return query.eq('id', profile.id);
    if (table === 'lesson_plans') return query.eq('author_id', profile.id);
    if (table === 'events' || table === 'jobs') return query.eq('author_id', profile.id);
    if (table === 'documents') return query.eq('uploader_id', profile.id);
    if (table === 'session_attendance') return query.eq('user_id', profile.id);
    return null;
  }

  if (level === 'Own') {
    if (OWN_BATCH_TABLES.has(table)) {
      if (!ownedBatchIds || ownedBatchIds.length === 0) return query.in('batch_id', ['00000000-0000-0000-0000-000000000000']);
      return query.in('batch_id', ownedBatchIds);
    }
    if (table === 'batches') {
      if (!ownedBatchIds || ownedBatchIds.length === 0) return query.in('id', ['00000000-0000-0000-0000-000000000000']);
      return query.in('id', ownedBatchIds);
    }
    if (table === 'users') return query.eq('id', profile.id);
    if (table === 'events' || table === 'jobs' || table === 'lesson_plans') return query.eq('author_id', profile.id);
    return null;
  }

  return query;
}

async function checkRowOwnership(table, level, profile, rowId) {
  if (table === 'certificates') {
    const { data: row } = await supabase.from(table).select('student_id').eq('id', rowId).single();
    if (!row) return true;
    if (String(row.student_id) === String(profile.id)) return true;
    if ((LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER['Manage']) return true;
    return false;
  }
  if (table === 'assignment_submissions' || table === 'projects') {
    const { data: row } = await supabase.from(table).select('student_id, batch_id').eq('id', rowId).single();
    if (!row) return true;
    if (String(row.student_id) === String(profile.id)) return true;
    if ((LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER['Manage']) return true;
    if (level === 'Own') {
      const owned = await getOwnedBatchIds(profile.id);
      return owned.includes(row.batch_id);
    }
    return false;
  }
  if (!level || level === 'View' || level === 'Manage' || level === 'Full' || level === 'Submits') return true;
  const { data: row } = await supabase.from(table).select('*').eq('id', rowId).single();
  if (!row) return true;
  if (level === 'Self') {
    if (table === 'users') return row.id === profile.id;
    if (table === 'lesson_plans') return row.author_id === profile.id;
    if (table === 'events' || table === 'jobs') return row.author_id === profile.id;
    if (table === 'documents') return row.uploader_id === profile.id;
    if (table === 'session_attendance') return row.user_id === profile.id;
    return false;
  }
  if (level === 'Own') {
    const owned = await getOwnedBatchIds(profile.id);
    const BATCH_TABLES = new Set(['timetable_slots', 'live_sessions', 'lesson_plans', 'assignments', 'feedback', 'activities', 'class_entries', 'class_confirmations', 'assignment_submissions']);
    if (BATCH_TABLES.has(table)) return owned.includes(row.batch_id);
    if (table === 'batches') return owned.includes(row.id);
    if (table === 'events' || table === 'jobs' || table === 'lesson_plans') return row.author_id === profile.id;
    if (table === 'users') return row.id === profile.id;
    return false;
  }
  return true;
}

// Server-side guards for status transitions that require higher privilege
async function checkPublishGate(table, body, level) {
  const needsManage = (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage'];
  if (!needsManage) return null;
  if ((table === 'events' || table === 'jobs') && body.status === 'published') {
    return 'Publishing requires Manage or Full access.';
  }
  if (table === 'lesson_plans' && (body.status === 'approved' || body.status === 'needs_revision')) {
    return 'Approving or returning lesson plans requires Manage or Full access.';
  }
  return null;
}

// Timetable conflict check — server-side overlap detection
async function checkTimetableConflict(candidate) {
  const { data: existing } = await supabase
    .from('timetable_slots')
    .select('id, day_of_week, start_time, end_time, batch_id, room')
    .eq('day_of_week', candidate.day_of_week);
  if (!existing || existing.length === 0) return null;
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const cStart = toMin(candidate.start_time);
  const cEnd = toMin(candidate.end_time);
  for (const s of existing) {
    const sameBatch = s.batch_id === candidate.batch_id;
    const sameRoom = candidate.room && s.room && String(s.room).trim() && String(candidate.room).trim() && String(s.room).trim() === String(candidate.room).trim();
    if (!sameBatch && !sameRoom) continue;
    const sStart = toMin(s.start_time);
    const sEnd = toMin(s.end_time);
    if (cStart < sEnd && sStart < cEnd) return s;
  }
  return null;
}

// Enhanced CRUD — server-side permission + ownership + transition gates
const crud = (table, orderCol = 'created_at') => ({
  list: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (!level || !canAccess(level, 'list')) {
        return res.status(403).json({ error: 'You do not have View access for this module.' });
      }
      let ownedBatchIds = null;
      if (level === 'Own' && (table === 'batches' || OWN_BATCH_TABLES.has(table))) {
        ownedBatchIds = await getOwnedBatchIds(req.auth.profile.id);
      }
      let query = supabase.from(table).select('*');
      query = applyListScope(query, table, level, req.auth.profile, ownedBatchIds);
      if (query === null) {
        return res.status(403).json({ error: 'Your access level does not permit listing this module.' });
      }
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err) { console.error('list', table, err.stack); res.status(500).json({ error: err.message }); }
  },
  create: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      const isSelfSubmission = table === 'assignment_submissions' && String(req.body.student_id) === String(req.auth?.profile?.id);
      const isSelfProject = table === 'projects' && String(req.body.student_id || req.auth?.profile?.id) === String(req.auth?.profile?.id);
      const isSelfCert = table === 'certificates' && String(req.body.student_id || req.auth?.profile?.id) === String(req.auth?.profile?.id);
      if ((table === 'assignment_submissions' && isSelfSubmission) || (table === 'projects' && isSelfProject) || (table === 'certificates' && isSelfCert)) {
        if (!level) return res.status(403).json({ error: 'You do not have View access for this module.' });
      } else if (!level || !canAccess(level, 'create')) {
        return res.status(403).json({ error: 'You do not have Create access for this module.' });
      }
      if (table === 'examination_types' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) {
        return res.status(403).json({ error: 'Managing examination types requires Full access on Curriculum.' });
      }
      if (table === 'course_module_topics' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) {
        return res.status(403).json({ error: 'Managing module topics requires Manage access on Curriculum.' });
      }
      const gateErr = await checkPublishGate(table, req.body, level);
      if (gateErr) return res.status(403).json({ error: gateErr });
      if (table === 'timetable_slots') {
        const clash = await checkTimetableConflict(req.body);
        if (clash && level !== 'Full') {
          return res.status(409).json({ error: `Timetable conflict: overlaps with slot ${clash.day_of_week} ${clash.start_time}–${clash.end_time} (room ${clash.room}).` });
        }
      }
      // ── users: custom create with Supabase Auth + OTP ──────────────────
      if (table === 'users') {
        const ALLOWED = ['name','email','phone','role_key','status','employee_id','roll_no','designation','program_id','date_of_joining','year_of_commencement'];
        const body = {};
        for (const k of ALLOWED) if (req.body[k] !== undefined) body[k] = req.body[k];
        if (!body.name || !body.email || !body.role_key) {
          return res.status(400).json({ error: 'name, email and role are required' });
        }
        body.email = String(body.email).trim().toLowerCase();
        if (body.employee_id === '') body.employee_id = null;
        if (body.roll_no === '') body.roll_no = null;
        if (body.program_id === '') body.program_id = null;
        if (body.date_of_joining === '') body.date_of_joining = null;
        if (body.year_of_commencement === '' || body.year_of_commencement === null) body.year_of_commencement = null;
        else if (body.year_of_commencement !== undefined) body.year_of_commencement = Number(body.year_of_commencement) || null;
        if (body.phone === '') body.phone = null;
        if (body.designation === '') body.designation = null;
        const { data: roleRow } = await supabase.from('roles').select('category').eq('key', body.role_key).single();
        const cat = roleRow?.category || 'staff';
        if (cat === 'student') {
          if (!body.roll_no || !body.program_id || !body.year_of_commencement) {
            return res.status(400).json({ error: 'Students require Roll No, Course (program) and Year of commencement' });
          }
        }
        const tempPassword = genTempPassword();
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email: body.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { name: body.name }
        });
        if (authErr) {
          const msg = authErr.message || 'Failed to create auth user';
          const code = /already exists|already registered/i.test(msg) ? 409 : 400;
          return res.status(code).json({ error: msg });
        }
        const authUserId = authData.user.id;
        const insertRow = { ...body, auth_user_id: authUserId, must_change_password: true };
        const { data, error } = await supabase.from('users').insert([insertRow]).select();
        if (error) {
          await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
          if (error.code === '23505') return res.status(409).json({ error: 'Employee ID or Roll No already exists' });
          return res.status(500).json({ error: error.message });
        }
        const otp = genOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await supabase.from('user_otps').update({ consumed: true }).eq('user_id', data[0].id).eq('consumed', false);
        await supabase.from('user_otps').insert([{ user_id: data[0].id, otp_code: otp, expires_at: expires }]);
        const emailed = await sendOTPEmail(body.email, otp, tempPassword);
        const includeTemp = !emailed || process.env.NODE_ENV !== 'production';
        return res.status(201).json({ ...data[0], tempPassword: includeTemp ? tempPassword : undefined, otp: includeTemp && !emailed ? otp : undefined, emailSent: emailed });
      }
      if (table === 'assignments' && !req.body.created_by) req.body.created_by = req.auth.profile.id;
      if (table === 'assignment_submissions') {
        if (!req.body.assignment_id || !req.body.batch_id || !req.body.student_id) return res.status(400).json({ error: 'assignment_id, batch_id, student_id required' });
        if (String(req.body.student_id) !== String(req.auth.profile.id) && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) return res.status(403).json({ error: 'Cannot create submission for another student' });
      }
      if (table === 'projects') {
        if (!req.body.batch_id || !req.body.title) return res.status(400).json({ error: 'batch_id and title are required' });
        if (!req.body.student_id) req.body.student_id = req.auth.profile.id;
        if (String(req.body.student_id) !== String(req.auth.profile.id) && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) return res.status(403).json({ error: 'Cannot create project for another student' });
        if (req.body.course_id === '') req.body.course_id = null;
        if (req.body.verified !== undefined) delete req.body.verified;
        if (req.body.verified_by !== undefined) delete req.body.verified_by;
      }
      if (table === 'certificates') {
        if (!req.body.title) return res.status(400).json({ error: 'title is required' });
        if (!req.body.student_id) req.body.student_id = req.auth.profile.id;
        if (String(req.body.student_id) !== String(req.auth.profile.id) && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) return res.status(403).json({ error: 'Cannot create certificate for another student' });
        if (req.body.certificate_type && !['institutional','external'].includes(req.body.certificate_type)) return res.status(400).json({ error: 'Invalid certificate_type' });
        if (req.body.issue_date === '') req.body.issue_date = null;
        if (req.body.file_url === '') req.body.file_url = null;
        if (req.body.verified !== undefined && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) delete req.body.verified;
        if (req.body.verified_by !== undefined) delete req.body.verified_by;
      }
      // ── courses: auto-derive teaching_hours ────────────────────────────
      let payload = { ...req.body };
      if (table === 'courses' && payload.teaching_periods !== undefined && payload.teaching_periods !== '' && payload.teaching_periods !== null) {
        const derived = deriveHours(payload.teaching_periods);
        if (derived !== null) payload.teaching_hours = derived;
      }
      // Normalize jsonb arrays if sent as strings
      if (table === 'courses') {
        if (typeof payload.objectives_json === 'string') { try { payload.objectives_json = JSON.parse(payload.objectives_json); } catch {} }
        if (typeof payload.outcomes_json === 'string') { try { payload.outcomes_json = JSON.parse(payload.outcomes_json); } catch {} }
        if (payload.examination_type_id === '') payload.examination_type_id = null;
      }
      if (table === 'timetable_slots') {
        if (payload.subjects !== undefined) {
          let arr = payload.subjects;
          if (typeof arr === 'string') arr = arr.split(/[,/]+/).map(s=>s.trim()).filter(Boolean);
          if (!Array.isArray(arr)) arr = [];
          arr = arr.map(s=>String(s).trim()).filter(Boolean);
          payload.subjects = arr;
          if (arr.length && !payload.subject) payload.subject = arr[0];
        }
        if (payload.course_ids !== undefined) {
          let arr = payload.course_ids;
          if (typeof arr === 'string') arr = arr.split(',').map(s=>s.trim()).filter(Boolean);
          if (!Array.isArray(arr)) arr = [];
          payload.course_ids = arr;
          if (payload.course_ids.length===0) payload.course_ids = '{}';
        }
      }
      if (table === 'class_entries') {
        if (payload.is_conducted !== undefined) payload.is_conducted = !!payload.is_conducted;
        ['l_count','th_count','p_count'].forEach(k=>{ if(payload[k]!==undefined && payload[k]!=='' && payload[k]!==null) payload[k]=Math.max(0, Number(payload[k])||0); });
        if (payload.period_label === '') payload.period_label = null;
        if (payload.remarks === '') payload.remarks = null;
        if (payload.topic_text === '') payload.topic_text = null;
        if (payload.notes === '') payload.notes = null;
        if (!payload.period_label && payload.timetable_slot_id) {
          // filled client-side; keep null if missing
        }
      }
      const { data, error } = await supabase.from(table).insert([payload]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (err) { console.error('create', table, err.message); res.status(500).json({ error: err.message }); }
  },
  update: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (table === 'assignment_submissions') {
        const owns = await checkRowOwnership(table, level, req.auth.profile, req.params.id);
        if (!owns) return res.status(403).json({ error: 'You do not own this record.' });
        let ud = { ...req.body };
        // students can only move own row: started→submitted. Grading (→graded) requires Manage.
        const { data: cur } = await supabase.from('assignment_submissions').select('student_id, status').eq('id', req.params.id).single();
        const isOwner = cur && String(cur.student_id) === String(req.auth.profile.id);
        if (ud.status === 'graded' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) return res.status(403).json({ error: 'Only teachers can grade.' });
        if (isOwner && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage'] && ud.status && !['started','submitted'].includes(ud.status)) return res.status(403).json({ error: 'Invalid transition' });
        if (isOwner && ud.status === 'submitted' && !ud.submitted_at) ud.submitted_at = new Date().toISOString();
        if (TABLES_WITH_UPDATED_AT.has(table)) ud.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from(table).update(ud).eq('id', req.params.id).select();
        if (error) throw error;
        return res.json(data[0]);
      }
      if (table === 'projects') {
        const { data: cur } = await supabase.from('projects').select('student_id').eq('id', req.params.id).single();
        if (!cur) return res.status(404).json({ error: 'Not found' });
        const isOwner = String(cur.student_id) === String(req.auth.profile.id);
        const isManage = (LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER['Manage'];
        if (!isOwner && !isManage) return res.status(403).json({ error: 'You do not own this record.' });
        if (!isOwner && !canAccess(level, 'update')) return res.status(403).json({ error: 'You do not have Manage access for this module.' });
        let ud = { ...req.body };
        if (!isManage) { delete ud.student_id; delete ud.batch_id; delete ud.verified; delete ud.verified_by; }
        if (ud.course_id === '') ud.course_id = null;
        if (TABLES_WITH_UPDATED_AT.has(table)) ud.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from(table).update(ud).eq('id', req.params.id).select();
        if (error) throw error;
        return res.json(data[0]);
      }
      if (table === 'certificates') {
        const { data: cur } = await supabase.from('certificates').select('student_id').eq('id', req.params.id).single();
        if (!cur) return res.status(404).json({ error: 'Not found' });
        const isOwner = String(cur.student_id) === String(req.auth.profile.id);
        const isManage = (LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER['Manage'];
        if (!isOwner && !isManage) return res.status(403).json({ error: 'You do not own this record.' });
        if (!isOwner && !canAccess(level, 'update')) return res.status(403).json({ error: 'You do not have Manage access for this module.' });
        let ud = { ...req.body };
        if (!isManage) { delete ud.verified; delete ud.verified_by; delete ud.student_id; }
        else if (ud.verified && !ud.verified_by) ud.verified_by = req.auth.profile.id;
        if (ud.issue_date === '') ud.issue_date = null;
        if (ud.file_url === '') ud.file_url = null;
        if (ud.certificate_type && !['institutional','external'].includes(ud.certificate_type) && !isManage) delete ud.certificate_type;
        if (TABLES_WITH_UPDATED_AT.has(table)) ud.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from(table).update(ud).eq('id', req.params.id).select();
        if (error) throw error;
        return res.json(data[0]);
      }
      if (!level || !canAccess(level, 'update')) {
        return res.status(403).json({ error: 'You do not have Manage access for this module.' });
      }
      if (table === 'examination_types' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) {
        return res.status(403).json({ error: 'Managing examination types requires Full access on Curriculum.' });
      }
      if (table === 'course_module_topics' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) {
        return res.status(403).json({ error: 'Managing module topics requires Manage access on Curriculum.' });
      }
      const owns = await checkRowOwnership(table, level, req.auth.profile, req.params.id);
      if (!owns) return res.status(403).json({ error: 'You do not own this record.' });
      const gateErr = await checkPublishGate(table, req.body, level);
      if (gateErr) return res.status(403).json({ error: gateErr });
      const blocked = await guard(table, req.params.id, req.body);
      if (blocked) return res.status(403).json({ error: blocked });
      let updateData = { ...req.body };
      if (table === 'users') {
        const ALLOWED_U = ['name','email','phone','role_key','status','employee_id','roll_no','designation','program_id','date_of_joining','year_of_commencement','must_change_password'];
        const filtered = {};
        for (const k of ALLOWED_U) if (updateData[k] !== undefined) filtered[k] = updateData[k];
        if (filtered.employee_id === '') filtered.employee_id = null;
        if (filtered.roll_no === '') filtered.roll_no = null;
        if (filtered.program_id === '') filtered.program_id = null;
        if (filtered.date_of_joining === '') filtered.date_of_joining = null;
        if (filtered.year_of_commencement === '' || filtered.year_of_commencement === null) filtered.year_of_commencement = null;
        else if (filtered.year_of_commencement !== undefined) filtered.year_of_commencement = Number(filtered.year_of_commencement) || null;
        if (filtered.phone === '') filtered.phone = null;
        if (filtered.designation === '') filtered.designation = null;
        updateData = filtered;
      }
      if (table === 'courses' && updateData.teaching_periods !== undefined && updateData.teaching_periods !== '' && updateData.teaching_periods !== null) {
        const derived = deriveHours(updateData.teaching_periods);
        if (derived !== null) updateData.teaching_hours = derived;
      }
      if (table === 'courses') {
        if (typeof updateData.objectives_json === 'string') { try { updateData.objectives_json = JSON.parse(updateData.objectives_json); } catch {} }
        if (typeof updateData.outcomes_json === 'string') { try { updateData.outcomes_json = JSON.parse(updateData.outcomes_json); } catch {} }
        if (updateData.examination_type_id === '') updateData.examination_type_id = null;
      }
      if (table === 'timetable_slots' && updateData.subjects !== undefined) {
        let arr = updateData.subjects;
        if (typeof arr === 'string') arr = arr.split(/[,/]+/).map(s=>s.trim()).filter(Boolean);
        if (!Array.isArray(arr)) arr = [];
        arr = arr.map(s=>String(s).trim()).filter(Boolean);
        updateData.subjects = arr;
        if (arr.length && !updateData.subject) updateData.subject = arr[0];
        if (updateData.course_ids !== undefined) {
          let ca = updateData.course_ids;
          if (typeof ca === 'string') ca = ca.split(',').map(s=>s.trim()).filter(Boolean);
          if (!Array.isArray(ca)) ca = [];
          updateData.course_ids = ca.length ? ca : '{}';
        }
      }
      if (table === 'class_entries' && updateData.is_conducted !== undefined) updateData.is_conducted = !!updateData.is_conducted;
      if (table === 'class_entries') {
        ['l_count','th_count','p_count'].forEach(k=>{ if(updateData[k]!==undefined && updateData[k]!=='' && updateData[k]!==null) updateData[k]=Math.max(0, Number(updateData[k])||0); });
        if (updateData.period_label === '') updateData.period_label = null;
        if (updateData.remarks === '') updateData.remarks = null;
      }
      if (TABLES_WITH_UPDATED_AT.has(table)) updateData.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from(table).update(updateData).eq('id', req.params.id).select();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Employee ID or Roll No already exists' });
        throw error;
      }
      res.json(data[0]);
    } catch (err) { console.error('update', table, err.message); res.status(500).json({ error: err.message }); }
  },
  delete: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (table === 'projects' || table === 'certificates') {
        const owns = await checkRowOwnership(table, level, req.auth.profile, req.params.id);
        if (!owns) return res.status(403).json({ error: 'You do not own this record.' });
        const isManage = (LEVEL_ORDER[level] ?? 0) >= LEVEL_ORDER['Manage'];
        const ownerDeleteOk = level && !isManage; // View/Self/Submits/Own can delete own row
        if (!isManage && !ownerDeleteOk) return res.status(403).json({ error: 'You do not have Manage access for this module.' });
        const { error } = await supabase.from(table).delete().eq('id', req.params.id);
        if (error) throw error;
        return res.status(204).send();
      }
      if (!level || !canAccess(level, 'delete')) {
        return res.status(403).json({ error: 'You do not have Full access for this module.' });
      }
      if (table === 'examination_types' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) {
        return res.status(403).json({ error: 'Managing examination types requires Full access on Curriculum.' });
      }
      if (table === 'course_module_topics' && (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) {
        return res.status(403).json({ error: 'Managing module topics requires Manage access on Curriculum.' });
      }
      const blocked = await guard(table, req.params.id);
      if (blocked) return res.status(403).json({ error: blocked });
      const { error } = await supabase.from(table).delete().eq('id', req.params.id);
      if (error) throw error;
      res.status(204).send();
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
});

// Super Admin is the one fixed role — the anchor of the whole permission chain.
// Its row can't be deleted, its key can't be renamed, and its Full permissions can't be revoked.
const guard = async (table, id, body = {}) => {
  if (table === 'roles' && id) {
    const { data } = await supabase.from('roles').select('key').eq('id', id).single();
    if (data?.key === 'super_admin') {
      if (Object.prototype.hasOwnProperty.call(body, 'key') && body.key !== 'super_admin')
        return 'The Super Admin role cannot be renamed.';
      if (!Object.keys(body).some(k => k !== 'key'))
        return 'The Super Admin role cannot be deleted.';
    }
  }
  if (table === 'role_permissions' && id) {
    const { data } = await supabase.from('role_permissions').select('role_key').eq('id', id).single();
    if (data?.role_key === 'super_admin')
      return 'Super Admin permissions are fixed — Full access everywhere.';
  }
  return null;
};

// ── OTP / first-password-change (public, rate-limited) ───────────────────
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkOtpRate(`req:${ip}`, 10, 60000) || !checkOtpRate(`req:${email}`, 5, 60000)) {
      return res.status(429).json({ error: 'Too many requests — try again shortly' });
    }
    const { data: user } = await supabase.from('users').select('id, email').ilike('email', email).single();
    if (!user) return res.status(404).json({ error: 'No user with that email' });
    await supabase.from('user_otps').update({ consumed: true }).eq('user_id', user.id).eq('consumed', false);
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insErr } = await supabase.from('user_otps').insert([{ user_id: user.id, otp_code: otp, expires_at: expires }]);
    if (insErr) throw insErr;
    const emailed = await sendOTPEmail(user.email, otp, null);
    const payload = { ok: true, emailSent: emailed };
    if (!emailed || process.env.NODE_ENV !== 'production') payload.otp = otp;
    res.json(payload);
  } catch (err) { console.error('request-otp', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();
    if (!email || !otp) return res.status(400).json({ error: 'email and otp are required' });
    const { data: user } = await supabase.from('users').select('id').ilike('email', email).single();
    if (!user) return res.status(404).json({ error: 'No user with that email' });
    const { data: row } = await supabase.from('user_otps').select('id, expires_at, consumed').eq('user_id', user.id).eq('otp_code', otp).eq('consumed', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single();
    if (!row) return res.status(400).json({ error: 'Invalid or expired OTP' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/first-password-change', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();
    const newPassword = String(req.body.newPassword || '');
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'email, otp and newPassword are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkOtpRate(`chg:${ip}`, 10, 60000) || !checkOtpRate(`chg:${email}`, 5, 60000)) {
      return res.status(429).json({ error: 'Too many requests — try again shortly' });
    }
    const { data: user } = await supabase.from('users').select('id, auth_user_id').ilike('email', email).single();
    if (!user) return res.status(404).json({ error: 'No user with that email' });
    if (!user.auth_user_id) return res.status(400).json({ error: 'User has no linked auth account' });
    const { data: row } = await supabase.from('user_otps').select('id, expires_at, consumed').eq('user_id', user.id).eq('otp_code', otp).eq('consumed', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single();
    if (!row) return res.status(400).json({ error: 'Invalid or expired OTP' });
    const { error: updErr } = await supabase.auth.admin.updateUserById(user.auth_user_id, { password: newPassword });
    if (updErr) return res.status(400).json({ error: updErr.message });
    await supabase.from('users').update({ must_change_password: false }).eq('id', user.id);
    await supabase.from('user_otps').update({ consumed: true }).eq('id', row.id);
    res.json({ ok: true });
  } catch (err) { console.error('first-password-change', err.message); res.status(500).json({ error: err.message }); }
});

// ── Custom roles handlers (category-aware; super_admin category locked) ──
const rolesList = async (req, res) => {
  try {
    const moduleKey = 'roles';
    const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
    if (!level || !canAccess(level, 'list')) return res.status(403).json({ error: 'You do not have View access for this module.' });
    const { data, error } = await supabase.from('roles').select('*').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const rolesCreate = async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile.role_key, 'roles');
    if (!level || !canAccess(level, 'create')) return res.status(403).json({ error: 'You do not have Create access for this module.' });
    const body = { ...req.body };
    if (!body.key || !body.name) return res.status(400).json({ error: 'key and name are required' });
    body.key = String(body.key).trim().toLowerCase().replace(/\s+/g, '_');
    if (body.key === 'super_admin') return res.status(403).json({ error: 'Cannot create super_admin' });
    if (!body.category) body.category = 'staff';
    if (!['staff','student','both'].includes(body.category)) return res.status(400).json({ error: 'Invalid category' });
    const { data, error } = await supabase.from('roles').insert([body]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const rolesUpdate = async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile.role_key, 'roles');
    if (!level || !canAccess(level, 'update')) return res.status(403).json({ error: 'You do not have Manage access for this module.' });
    const blocked = await guard('roles', req.params.id, req.body);
    if (blocked) return res.status(403).json({ error: blocked });
    if (req.body.category !== undefined) {
      const { data: existing } = await supabase.from('roles').select('key').eq('id', req.params.id).single();
      if (existing?.key === 'super_admin' && req.body.category !== 'system') return res.status(403).json({ error: 'Super Admin category cannot be changed' });
      if (existing?.key !== 'super_admin' && !['staff','student','both'].includes(req.body.category)) return res.status(400).json({ error: 'Invalid category' });
    }
    if (req.body.key !== undefined) {
      const { data: existing } = await supabase.from('roles').select('key').eq('id', req.params.id).single();
      if (existing?.key === 'super_admin' && req.body.key !== 'super_admin') return res.status(403).json({ error: 'The Super Admin role cannot be renamed.' });
    }
    const { data, error } = await supabase.from('roles').update(req.body).eq('id', req.params.id).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const rolesDelete = async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile.role_key, 'roles');
    if (!level || !canAccess(level, 'delete')) return res.status(403).json({ error: 'You do not have Full access for this module.' });
    const blocked = await guard('roles', req.params.id, req.body);
    if (blocked) return res.status(403).json({ error: blocked });
    const { error } = await supabase.from('roles').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Routing Registry — one generic CRUD per API key, mapped to its (sometimes differently-named) table.
const TABLES_WITH_UPDATED_AT = new Set(['users', 'events', 'enquiries', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects', 'certificates']);
const TABLE_FOR = { curriculum: 'disciplines', timetable: 'timetable_slots', liveclasses: 'live_sessions', lessonplans: 'lesson_plans' };
const ORDER_FOR = { courses: 'code', course_modules: 'module_number', course_module_topics: 'sort_order', disciplines: 'name', course_types: 'name', examination_types: 'name', roles: 'name', role_permissions: 'module_key', class_entries: 'class_date', class_confirmations: 'created_at', assignment_submissions: 'created_at', projects: 'created_at', certificates: 'created_at' };

const modules = ['users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'liveclasses', 'lessonplans', 'assignments', 'feedback', 'activities', 'courses', 'course_modules', 'course_module_topics', 'course_types', 'examination_types', 'role_permissions', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects', 'certificates'];
modules.forEach(m => {
  const table = TABLE_FOR[m] || m;
  const handler = crud(table, ORDER_FOR[table]);
  // All module routes require auth (role picker is replaced by Supabase Auth)
  app.get(`/api/${m}`, authMiddleware, handler.list);
  app.post(`/api/${m}`, authMiddleware, handler.create);
  app.put(`/api/${m}/:id`, authMiddleware, handler.update);
  app.delete(`/api/${m}/:id`, authMiddleware, handler.delete);
});

// Roles: custom handlers (category-aware)
app.get('/api/roles', authMiddleware, rolesList);
app.post('/api/roles', authMiddleware, rolesCreate);
app.put('/api/roles/:id', authMiddleware, rolesUpdate);
app.delete('/api/roles/:id', authMiddleware, rolesDelete);

// MongoDB — the flexible half of the hybrid model (CMS blocks, and later lesson plans, feedback forms, activity logs).
// Connection is optional: Postgres/Supabase modules keep working if Mongo is unreachable.
let cmsReady = false;
mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'nadagurukulam' })
  .then(() => { cmsReady = true; console.log('MongoDB connected (cms_blocks)'); })
  .catch(err => console.error('MongoDB unavailable — CMS blocks disabled:', err.message));

const cmsBlockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'cms_blocks' });
const CmsBlock = mongoose.models.CmsBlock || mongoose.model('CmsBlock', cmsBlockSchema, 'cms_blocks');

const curriculumContentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'curriculum_content' });
const CurriculumContent = mongoose.models.CurriculumContent || mongoose.model('CurriculumContent', curriculumContentSchema, 'curriculum_content');

// Curriculum detailed syllabus content endpoint
app.get('/api/curriculum-content/:key', async (req, res) => {
  try {
    if (!cmsReady) return res.status(503).json({ error: 'MongoDB not connected' });
    const doc = await CurriculumContent.findOne({ key: req.params.key }).lean();
    res.json(doc ? { key: doc.key, content: doc.content } : { key: req.params.key, content: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/curriculum-content/:key', authMiddleware, async (req, res) => {
  try {
    if (!cmsReady) return res.status(503).json({ error: 'MongoDB not connected' });
    const level = await getAccessLevel(req.auth.profile.role_key, 'curriculum');
    if (!level || (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) {
      return res.status(403).json({ error: 'You do not have Manage access for curriculum content.' });
    }
    const doc = await CurriculumContent.findOneAndUpdate(
      { key: req.params.key },
      { key: req.params.key, content: req.body },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    res.json({ key: doc.key, content: doc.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Every editable public-site section is a cms_blocks document: one doc per block.
app.get('/api/cms', async (req, res) => {
  try {
    if (!cmsReady) return res.status(503).json({ error: 'MongoDB not connected' });
    const blocks = await CmsBlock.find({}, 'key updatedAt').lean();
    res.json(blocks.map(b => ({ key: b.key, updated_at: b.updatedAt })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cms/:key', async (req, res) => {
  try {
    if (!cmsReady) return res.status(503).json({ error: 'MongoDB not connected' });
    const block = await CmsBlock.findOne({ key: req.params.key }).lean();
    res.json(block ? { key: block.key, content: block.content } : { key: req.params.key, content: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cms/:key', authMiddleware, async (req, res) => {
  try {
    if (!cmsReady) return res.status(503).json({ error: 'MongoDB not connected' });
    const isSuper = req.auth.profile.role_key === 'super_admin';
    if (!isSuper) {
      const level = await getAccessLevel(req.auth.profile.role_key, 'curriculum');
      if (!level || (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) {
        return res.status(403).json({ error: 'Only Super Admin (or Full on Curriculum) can edit site content.' });
      }
    }
    const block = await CmsBlock.findOneAndUpdate(
      { key: req.params.key },
      { key: req.params.key, content: req.body },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    res.json({ key: block.key, content: block.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Nada Gurukulam API active on ${PORT}`));
