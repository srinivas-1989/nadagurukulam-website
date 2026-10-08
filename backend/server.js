const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}

let multer = null; let upload = null;
try { multer = require('multer'); upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); } catch {}

let mammoth = null;
try { mammoth = require('mammoth'); } catch {}
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch {}
let XLSX = null;
try { XLSX = require('xlsx'); } catch {}

// ── helpers ───────────────────────────────────────────────────────────────
function deriveHours(periods, mins) {
  const mm = Number(mins);
  const m = Number.isFinite(mm) && mm >= 10 && mm <= 120 ? mm : 45;
  const n = Number(periods);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n * m / 60) * 100) / 100;
}
function derivePeriods(hours, mins) {
  const mm = Number(mins);
  const m = Number.isFinite(mm) && mm >= 10 && mm <= 120 ? mm : 45;
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n * 60) / m);
}
function effMinutes(disc) { const v = Number(disc?.period_minutes); return Number.isFinite(v) && v >= 10 && v <= 120 ? v : 45; }
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
async function sendMail(to, subject, html) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@nadagurukulam.org';
  const m = getMailer();
  if (m) {
    try { await m.sendMail({ from, to, subject, html }); return true; } catch (e) { console.error('SMTP send failed:', e.message); return false; }
  }
  return false;
}
async function sendNoteEmail(to, subject, body) {
  // Admin-authored text, so escape it before it goes into HTML mail.
  const esc = String(body).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return sendMail(to, subject, `<p>${esc.split('\n').join('<br>')}</p>`);
}
async function sendOTPEmail(to, otp, tempPassword) {
  const subject = tempPassword ? 'Your Nada Gurukulam account — temp password & OTP' : 'Your Nada Gurukulam OTP';
  const html = tempPassword
    ? `<p>Temp password: <b>${tempPassword}</b></p><p>OTP: <b>${otp}</b> (expires in 10 minutes)</p><p>Log in and change your password when prompted.</p>`
    : `<p>OTP: <b>${otp}</b> (expires in 10 minutes)</p>`;
  return sendMail(to, subject, html);
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
app.use(express.json({ limit: '30mb' }));

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
  try {
    const { data, error } = await supabase.from('disciplines').select('*, program_categories(name, duration_value, duration_unit)').order('name');
    if (error) throw error;
    const rows = (data || []).map(r => ({
      ...r,
      category_name: r.program_categories?.name || null,
      category_duration_value: r.program_categories?.duration_value ?? null,
      category_duration_unit: r.program_categories?.duration_unit ?? null,
    }));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Curriculum import template — XLSX with 2 sheets: Courses + Modules/Topics
app.get('/api/curriculum/template', authMiddleware, async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile, 'curriculum');
    if (!level || (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) return res.status(403).json({ error: 'Manage on Curriculum required.' });
    if (!XLSX) return res.status(503).json({ error: 'XLSX not installed on server' });
    const wb = XLSX.utils.book_new();
    const courseHeaders = ['Program Name*','Program Category (UG/PG)','Course Name*','Course Code*','Course Type','Credits','Teaching Periods','Teaching Hours (auto = Periods × Period mins /60)','CIE Marks','CIE Duration','SEE Marks','SEE Duration','Exam Type','Academic Year (e.g. 2024-25)','Semester / Year (e.g. Semester I / Year I)','Objectives (one per line, Alt+Enter) ','Outcomes (one per line → CO1,CO2…)','Pedagogy (one per line)'];
    const courseExample = ['Hindustani Vocal','UG','Raga Basics','HIN-S1-101','DSC',4,60,'','50','45 Min',50,'1 hour','Theory','2024-25','Semester I','Add to repertoire\nUnderstand raga structure','CO1 text: ...\nCO2 text: ...','Lecture demo\nPractical'];
    const ws1 = XLSX.utils.aoa_to_sheet([courseHeaders, courseExample]);
    ws1['!cols'] = courseHeaders.map(h => ({ wch: Math.min(32, Math.max(14, h.length)) }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Courses');
    const modHeaders = ['Course Code* (match Courses sheet)','Module No.*','Module Title*','Teaching Hours (auto)','Teaching Periods','RBT Levels (comma: L1,L2)','Teaching Methodology (comma, must match Pedagogy)','CO Mapping (comma: CO1,CO2)','Topic','Topic Description (optional)','Topic Sort Order'];
    const modExample = ['HIN-S1-101',1,'Introduction to Raga',10,13,'L1,L2','Lecture demo','CO1','Yaman — Aaroh Avroh','Ascending/descending with shruti',1];
    const ws2 = XLSX.utils.aoa_to_sheet([modHeaders, modExample, ['HIN-S1-101',1,'Introduction to Raga',10,13,'L1,L2','Lecture demo','CO1','Yaman — Bandish','Vilambit in Teentaal',2]]);
    ws2['!cols'] = modHeaders.map(h => ({ wch: Math.min(28, Math.max(12, h.length)) }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Modules_Topics');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="NadaGurukulam_Curriculum_Import_Template.xlsx"');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// Public forgot-password request endpoint (rate-limited, uniform response)
app.post('/api/public/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const reason = String(req.body.reason || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkOtpRate(`fp:${ip}`, 5, 60000) || !checkOtpRate(`fp:${email}`, 3, 60000)) {
      return res.status(429).json({ error: 'Too many requests — try again shortly' });
    }
    // Insert request into queue table regardless of whether email exists (avoids enumeration oracle)
    await supabase.from('password_reset_requests').insert([{ email, reason: reason || 'Password reset requested', status: 'pending' }]);
    res.json({ ok: true, message: 'If an account exists for this email, your password reset request has been submitted to the administrator.' });
  } catch (err) { console.error('forgot-password', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/api/public/signup', async (req, res) => {
  try {
    const { name, email, phone, password, role_key, program_id, roll_no, year_of_commencement } = req.body;
    if (!name || !email || !password || !role_key) return res.status(400).json({ error: 'Missing required fields' });
    const emailLower = String(email).trim().toLowerCase();

    // Create Auth User
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: password,
      email_confirm: true,
      user_metadata: { name }
    });
    if (authErr) return res.status(400).json({ error: authErr.message });

    // Create User record in pending state
    const { data: userData, error: userErr } = await supabase.from('users').insert([{
      auth_user_id: authData.user.id,
      name, email: emailLower, phone, role_key,
      status: 'pending',
      program_id: program_id || null,
      roll_no: roll_no || null,
      year_of_commencement: Number(year_of_commencement) || null,
      must_change_password: false
    }]).select();

    if (userErr) {
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
      throw userErr;
    }

    await recordAudit(req, {
      action: 'create', entityType: 'users', entityId: userData[0].id,
      summary: `Created account ${emailLower} with role ${role_key}`,
      newValue: { name, email: emailLower, role_key, status: 'pending' },
    });
    res.status(201).json(userData[0]);
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
      .select('role_key, id, name, email, must_change_password, status')
      .eq('auth_user_id', user.id)
      .single();
    if (profileErr || !profile) {
      // User exists in Supabase Auth but not in our users table — deny
      return res.status(403).json({ error: 'User not registered in portal' });
    }
    // Approval gate — a self-signup account stays 'pending' until an admin
    // approves it, so it holds a valid JWT but no portal access.
    if (profile.status === 'pending') {
      return res.status(403).json({ error: 'Account pending admin approval', code: 'PENDING_APPROVAL' });
    }
    if (profile.status === 'inactive') {
      return res.status(403).json({ error: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
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

// A role grants its baseline on every module; a user grant only ever raises the
// level, never lowers it, so a role can't be used to quietly cap a person. No
// row anywhere = module hidden.
async function getAccessLevel(profile, moduleKey) {
  if (profile.role_key === 'super_admin') return 'Full';
  const [byRole, byUser] = await Promise.all([
    supabase.from('role_permissions').select('access_level')
      .eq('role_key', profile.role_key).eq('module_key', moduleKey).maybeSingle(),
    supabase.from('user_permissions').select('access_level')
      .eq('user_id', profile.id).eq('module_key', moduleKey).maybeSingle(),
  ]);
  const rank = (l) => LEVEL_ORDER[l] ?? 0;
  const role = byRole.data?.access_level;
  const user = byUser.data?.access_level;
  return rank(user) > rank(role) ? user : role || user || null;
}

function canAccess(level, action) {
  const thresholds = { list: 1, create: 3, update: 4, delete: 6 };
  return LEVEL_ORDER[level] >= (thresholds[action] ?? 0);
}

// Audit trail — who did what, where, when, and the values before/after.
// Never throws: a failed audit write must not roll back the action it describes.
async function recordAudit(req, { action, entityType, entityId, summary, previousValue, newValue }) {
  try {
    const profile = req.auth?.profile;
    await supabase.from('audit_log').insert([{
      actor_id: profile?.id || null,
      actor_name: profile?.name || null,
      actor_role: profile?.role_key || null,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      summary: summary || null,
      previous_value: previousValue ?? null,
      new_value: newValue ?? null,
      ip_address: req.ip || null,
      user_agent: req.get?.('user-agent') || null,
    }]);
  } catch (err) {
    console.error('audit write failed', err.message);
  }
}

// API key → module_key for permission lookup (api key is the URL segment, e.g. /api/curriculum)
const API_TO_MODULE = {
  users: 'users', curriculum: 'curriculum', batches: 'batches',
  timetable: 'timetable', liveclasses: 'liveclasses', lessonplans: 'lessonplans',
  assignments: 'assignments', feedback: 'feedback', events: 'events',
  jobs: 'jobs', enquiries: 'enquiries', performances: 'performances',
  lessons: 'lms', resources: 'lms', lesson_activities: 'lms',
  learning_outcomes: 'lms', outcome_mappings: 'lms',
  courses: 'curriculum', course_modules: 'curriculum', course_module_topics: 'curriculum',
  examination_types: 'curriculum', program_categories: 'curriculum', course_syllabi: 'curriculum',
  academic_years: 'curriculum', terms: 'curriculum',
  timetable_periods: 'timetable',
  roles: 'roles', role_permissions: 'roles', user_permissions: 'roles',
  category_level_values: 'roles', user_categories: 'roles',
  class_entries: 'teachinglogs', class_confirmations: 'teachinglogs',
  student_relationships: 'roles', mentor_progress_notes: 'roles',
  assignment_submissions: 'assignments',
  projects: 'projects', certificates: 'certificates'
};
// Reverse: table name → module_key (crud is instantiated with table names)
const TABLE_TO_MODULE = {
  disciplines: 'curriculum', timetable_slots: 'timetable', timetable_periods: 'timetable',
  live_sessions: 'liveclasses', lesson_plans: 'lessonplans', student_performances: 'performances',
  lessons: 'lms', resources: 'lms', lesson_activities: 'lms',
  learning_outcomes: 'lms', outcome_mappings: 'lms',
  courses: 'curriculum', course_modules: 'curriculum', course_module_topics: 'curriculum',
  examination_types: 'curriculum', program_categories: 'curriculum', course_syllabi: 'curriculum',
  academic_years: 'curriculum', terms: 'curriculum',
  course_offerings: 'curriculum', course_registrations: 'curriculum', faculty_assignments: 'curriculum',
  category_level_values: 'roles', user_categories: 'roles',
  class_entries: 'teachinglogs', class_confirmations: 'teachinglogs',
  student_relationships: 'roles', mentor_progress_notes: 'roles',
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

const OWN_BATCH_TABLES = new Set(['timetable_slots', 'live_sessions', 'lesson_plans', 'assignments', 'feedback', 'student_performances', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects']);

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
  if (table === 'course_registrations') {
    if (level === 'Manage' || level === 'Full') return query;
    return query.eq('student_id', profile.id);
  }
  // course_offerings stays a readable catalogue: students need to see open
  // offerings in order to register for one. Registrations are the private part.
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
    const BATCH_TABLES = new Set(['timetable_slots', 'live_sessions', 'lesson_plans', 'assignments', 'feedback', 'student_performances', 'class_entries', 'class_confirmations', 'assignment_submissions']);
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

const slugKey = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const BUILT_IN_CATEGORY_KEYS = ['staff', 'student', 'administration'];
const validateMasterMeta = async (table, body = {}) => {
  if (table === 'user_categories') {
    if (body.key !== undefined && !/^[a-z0-9_]{2,40}$/.test(String(body.key))) return 'Category key must be lowercase letters, numbers or underscores.';
    if (body.name !== undefined && !String(body.name).trim()) return 'Category name is required.';
    if (body.key !== undefined && BUILT_IN_CATEGORY_KEYS.includes(body.key)) {
      const { data: clash } = await supabase.from('user_categories').select('id').eq('key', body.key).maybeSingle();
      if (!clash) return `"${body.key}" is a built-in category key.`;
    }
  }
  if (table === 'category_level_values') {
    if (body.name !== undefined && !String(body.name).trim()) return 'Value name is required.';
    // A node inherits its category from its parent, so only a root node states one.
    if (body.parent_id) {
      const { data: parent } = await supabase.from('category_level_values').select('id, category_key').eq('id', body.parent_id).maybeSingle();
      if (!parent) return 'Unknown parent node.';
      body.category_key = parent.category_key;
    } else if (body.category_key !== undefined && body.category_key !== null) {
      const { data: cat } = await supabase.from('user_categories').select('key').eq('key', body.category_key).maybeSingle();
      if (!cat) return 'Unknown category. Create it in Roles & Permissions first.';
    }
    if (body.role_key) {
      const { data: role } = await supabase.from('roles').select('key').eq('key', body.role_key).maybeSingle();
      if (!role) return 'Unknown role.';
    }
  }
  if (table === 'roles' && body.category !== undefined && !BUILT_IN_CATEGORY_KEYS.includes(body.category)) {
    const { data: cat } = await supabase.from('user_categories').select('key').eq('key', body.category).maybeSingle();
    if (!cat) return 'Unknown category. Create it in Roles & Permissions first.';
  }
  return null;
};

// Enhanced CRUD — server-side permission + ownership + transition gates
const crud = (table, orderCol = 'created_at') => ({
  list: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile, moduleKey);
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
      const level = await getAccessLevel(req.auth.profile, moduleKey);
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
      const metaErr = await validateMasterMeta(table, req.body);
      if (metaErr) return res.status(400).json({ error: metaErr });
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
        const ALLOWED = ['name','email','phone','role_key','status','employee_id','roll_no','designation','level_values','program_id','date_of_joining','year_of_commencement'];
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
        if (body.level_values && typeof body.level_values !== 'object') body.level_values = {};
        for (const k of Object.keys(body.level_values || {})) if (!body.level_values[k]) delete body.level_values[k];
        const { data: roleRow } = await supabase.from('roles').select('category').eq('key', body.role_key).single();
        const cat = roleRow?.category || 'staff';
        if (body.role_key === 'super_admin') {
          const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('role_key', 'super_admin');
          if ((count || 0) >= 1) return res.status(403).json({ error: 'Only one Super Admin is allowed.' });
        }
        if (cat === 'student') {
          if (!body.roll_no || !body.program_id || !body.year_of_commencement) {
            return res.status(400).json({ error: 'Students require Roll No, Course (program) and Year of commencement' });
          }
          body.employee_id = null; body.designation = null; body.date_of_joining = null;
        } else if (cat === 'staff') {
          body.roll_no = null; body.program_id = null; body.year_of_commencement = null;
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
      // ── courses: hours input → auto periods via program mins (reverse of before); also normalize exam hrs/mins ──
      let payload = { ...req.body };
      if (table === 'courses') {
        if (payload.teaching_hours !== undefined && payload.teaching_hours !== '' && payload.teaching_hours !== null) {
          const h = Number(payload.teaching_hours); if (!Number.isFinite(h)||h<0) return res.status(400).json({ error: 'teaching_hours must be >=0' });
          let mins = 45; if (payload.discipline_id) { try { const { data: d } = await supabase.from('disciplines').select('period_minutes').eq('id', payload.discipline_id).single(); if (d?.period_minutes) mins = d.period_minutes; } catch {} }
          const p = derivePeriods(h, mins); if (p !== null) payload.teaching_periods = p;
        }
        ['cie_hours','cie_mins','see_hours','see_mins'].forEach(k=>{ if(payload[k]==='') payload[k]=null; if(payload[k]!==undefined&&payload[k]!==null){ const v=Number(payload[k]); if(!Number.isFinite(v)||v<0) payload[k]=null; else payload[k]=Math.round(v); } });
        if (payload.month_label === '') payload.month_label = null;
      }
      if (table === 'courses') {
        if (typeof payload.objectives_json === 'string') { try { payload.objectives_json = JSON.parse(payload.objectives_json); } catch {} }
        if (typeof payload.outcomes_json === 'string') { try { payload.outcomes_json = JSON.parse(payload.outcomes_json); } catch {} }
        if (payload.examination_type_id === '') payload.examination_type_id = null;
        if (payload.discipline_id === '') payload.discipline_id = null;
      }
      if (table === 'course_modules') {
        if (typeof payload.rbt_levels === 'string') { try { payload.rbt_levels = JSON.parse(payload.rbt_levels); } catch { payload.rbt_levels = []; } }
        if (typeof payload.methodology_list === 'string') { try { payload.methodology_list = JSON.parse(payload.methodology_list); } catch { payload.methodology_list = []; } }
        if (!Array.isArray(payload.rbt_levels)) payload.rbt_levels = [];
        if (!Array.isArray(payload.methodology_list)) payload.methodology_list = [];
        if (payload.syllabus_id === '') payload.syllabus_id = null;
        if (payload.rbt_level === undefined && payload.rbt_levels.length) payload.rbt_level = String(payload.rbt_levels[0]);
      }
      if (table === 'course_module_topics' && payload.description === '') payload.description = null;
      if (table === 'disciplines') {
        if (payload.category_id === '') payload.category_id = null;
        if (payload.structure_mode && !['monthly','yearly','semester'].includes(payload.structure_mode)) return res.status(400).json({ error: 'Invalid structure_mode' });
        if (payload.month_count !== undefined && payload.month_count !== '' && payload.month_count !== null) { const v=Number(payload.month_count); if(!Number.isFinite(v)||v<1||v>24) return res.status(400).json({ error: 'month_count 1..24' }); payload.month_count=Math.round(v); }
        if (payload.month_count === '') payload.month_count = null;
        if (payload.year_count !== undefined && payload.year_count !== '' && payload.year_count !== null) { const v=Number(payload.year_count); if(!Number.isFinite(v)||v<1||v>10) return res.status(400).json({ error: 'year_count 1..10' }); payload.year_count=Math.round(v); }
        if (payload.semesters_per_year !== undefined && payload.semesters_per_year !== '' && payload.semesters_per_year !== null) { const v=Number(payload.semesters_per_year); if(!Number.isFinite(v)||v<1||v>4) return res.status(400).json({ error: 'semesters_per_year 1..4' }); payload.semesters_per_year=Math.round(v); }
        if (payload.structure_mode==='semester') { if (!payload.year_count || !payload.semesters_per_year) return res.status(400).json({ error: 'Semester programs require years and semesters per year' }); }
        if (payload.structure_mode==='monthly' && !payload.month_count) return res.status(400).json({ error: 'Monthly programs require month_count' });
        if (payload.structure_mode==='yearly' && !payload.year_count) return res.status(400).json({ error: 'Yearly programs require year_count' });
        if (payload.period_minutes !== undefined && payload.period_minutes !== '' && payload.period_minutes !== null) {
          const v = Number(payload.period_minutes); payload.period_minutes = Number.isFinite(v) ? Math.min(120, Math.max(10, Math.round(v))) : 45;
        } else if (payload.period_minutes === '') payload.period_minutes = 45;
        if (payload.period_effective_from === '') payload.period_effective_from = null;
        if (payload.description === '') payload.description = null;
        // enforce category duration limits: program total years/months must not exceed category
        if (payload.category_id) {
          try { const { data: cat } = await supabase.from('program_categories').select('duration_value, duration_unit').eq('id', payload.category_id).single(); if (cat?.duration_value) { const toYears=(v,u)=> u==='months'? v/12 : v; const progYears = payload.structure_mode==='monthly' ? (payload.month_count||0)/12 : Number(payload.year_count||0); if (progYears && progYears > toYears(cat.duration_value, cat.duration_unit)) return res.status(400).json({ error: `Program exceeds category duration ${cat.duration_value} ${cat.duration_unit}` }); } } catch {}
        }
      }
      if (table === 'program_categories') {
        if ((LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) return res.status(403).json({ error: 'Managing program categories requires Full access on Curriculum.' });
        if (payload.name !== undefined) payload.name = String(payload.name).trim();
        if (payload.duration_unit !== undefined && payload.duration_unit !== '' && payload.duration_unit !== null && !['years','months'].includes(payload.duration_unit)) return res.status(400).json({ error: 'Invalid duration_unit (years or months only)' });
        if (payload.duration_value !== undefined && payload.duration_value !== '' && payload.duration_value !== null) { const v=Number(payload.duration_value); if(!Number.isFinite(v)||v<1||v>99) return res.status(400).json({ error: 'duration_value 1..99' }); payload.duration_value=Math.round(v); }
        if (payload.duration_value === '') payload.duration_value = null;
        if (payload.duration_unit === '') payload.duration_unit = null;
        if ((payload.duration_value && !payload.duration_unit) || (!payload.duration_value && payload.duration_unit)) return res.status(400).json({ error: 'Set both duration value and unit, or neither' });
        if (!payload.name) return res.status(400).json({ error: 'name is required' });
      }
      if (table === 'course_syllabi') {
        if (!payload.course_id) return res.status(400).json({ error: 'course_id is required' });
        if (!payload.academic_year) return res.status(400).json({ error: 'academic_year is required (e.g. 2024-25)' });
        if (payload.status && !['draft','published','archived'].includes(payload.status)) return res.status(400).json({ error: 'Invalid status' });
        if (payload.version_number != null && payload.version_number !== '' && req.auth?.profile?.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can reset version number.' });
        if (payload.version_number === '') payload.version_number = null;
        if (!payload.version_number) {
          const { data: rows } = await supabase.from('course_syllabi').select('version_number').eq('course_id', payload.course_id).eq('academic_year', payload.academic_year).order('version_number', { ascending: false }).limit(1);
          payload.version_number = rows && rows[0] ? Number(rows[0].version_number) + 1 : 1;
        } else payload.version_number = Math.max(1, Math.round(Number(payload.version_number)) || 1);
        if (payload.notes === '') payload.notes = null;
      }
      if (table === 'course_offerings') {
        if (!payload.course_id) return res.status(400).json({ error: 'course_id is required' });
        if (payload.status && !['planned','active','completed','cancelled'].includes(payload.status)) return res.status(400).json({ error: 'Invalid status' });
        if (payload.capacity !== undefined && payload.capacity !== null && payload.capacity !== '') {
          const cap = Number(payload.capacity);
          if (!Number.isFinite(cap) || cap < 1) return res.status(400).json({ error: 'capacity must be 1 or more' });
          payload.capacity = Math.round(cap);
        } else payload.capacity = null;
        for (const k of ['term_id','batch_id','faculty_id']) if (payload[k] === '') payload[k] = null;
        if (payload.notes === '') payload.notes = null;
      }
      if (table === 'course_registrations') {
        if (!payload.course_offering_id) return res.status(400).json({ error: 'course_offering_id is required' });
        const studentId = String(req.body.student_id || req.auth?.profile?.id);
        const { data: offering } = await supabase.from('course_offerings').select('id,capacity,status').eq('id', payload.course_offering_id).maybeSingle();
        if (!offering) return res.status(404).json({ error: 'Course offering not found' });
        if (offering.status === 'cancelled' || offering.status === 'completed') return res.status(409).json({ error: `This offering is ${offering.status} and no longer accepts registrations.` });
        if (offering.capacity) {
          const { count } = await supabase.from('course_registrations').select('id', { count: 'exact', head: true }).eq('course_offering_id', payload.course_offering_id).neq('status', 'dropped');
          if ((count || 0) >= offering.capacity) return res.status(409).json({ error: 'This offering is full.' });
        }
        payload.student_id = studentId;
        const { data: dupe } = await supabase.from('course_registrations').select('id').eq('course_offering_id', payload.course_offering_id).eq('student_id', studentId).maybeSingle();
        if (dupe) return res.status(409).json({ error: 'Already registered for this offering.' });
      }
      if (table === 'faculty_assignments') {
        if (!payload.course_offering_id) return res.status(400).json({ error: 'course_offering_id is required' });
        if (!payload.user_id) return res.status(400).json({ error: 'user_id is required' });
        const roles = ['teacher','guest_guru','accompanist','assistant','visiting'];
        if (payload.role && !roles.includes(payload.role)) return res.status(400).json({ error: 'Invalid role' });
        if (payload.status && !['active','replaced','ended'].includes(payload.status)) return res.status(409).json({ error: 'Invalid status' });
        if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) return res.status(400).json({ error: 'end_date cannot be before start_date' });
        const { data: offering } = await supabase.from('course_offerings').select('id').eq('id', payload.course_offering_id).maybeSingle();
        if (!offering) return res.status(404).json({ error: 'Course offering not found' });
        // one lead per offering — the lead teacher is the single accountable teacher
        if (payload.is_lead) {
          const { data: leads } = await supabase.from('faculty_assignments').select('id,user_id').eq('course_offering_id', payload.course_offering_id).eq('is_lead', true).eq('status', 'active');
          if ((leads || []).some(l => l.user_id !== payload.user_id)) return res.status(409).json({ error: 'This offering already has a lead teacher.' });
        }
        for (const k of ['start_date','end_date','notes']) if (payload[k] === '') payload[k] = null;
        // mirror the lead teacher onto course_offerings.faculty_id so registration and timetable code stays correct
        if (payload.is_lead && payload.status !== 'ended') {
          await supabase.from('course_offerings').update({ faculty_id: payload.user_id }).eq('id', payload.course_offering_id);
        }
      }
      if (table === 'student_relationships') {
        const relTypes = ['guru','academic_mentor','course_faculty','hostel_mentor','advisor'];
        if (!payload.student_id) return res.status(400).json({ error: 'student_id is required' });
        if (!payload.mentor_id) return res.status(400).json({ error: 'mentor_id is required' });
        if (payload.student_id === payload.mentor_id) return res.status(400).json({ error: 'A person cannot be their own mentor.' });
        if (payload.relationship_type && !relTypes.includes(payload.relationship_type)) return res.status(400).json({ error: 'Invalid relationship type' });
        if (payload.status && !['active','suspended','ended'].includes(payload.status)) return res.status(400).json({ error: 'Invalid status' });
        if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) return res.status(400).json({ error: 'end_date cannot be before start_date' });
        // one active relationship of each type per student — replacing a mentor
        // ends the old row rather than stacking a second guru on the student
        if (!payload.status || payload.status === 'active') {
          const { data: existing } = await supabase.from('student_relationships').select('id,mentor_id').eq('student_id', payload.student_id).eq('relationship_type', payload.relationship_type).eq('status', 'active');
          if ((existing || []).some(r => r.mentor_id !== payload.mentor_id)) return res.status(409).json({ error: 'Student already has an active relationship of this type.' });
        }
        for (const k of ['end_date','notes']) if (payload[k] === '') payload[k] = null;
      }
      if (table === 'mentor_progress_notes') {
        if (!payload.relationship_id) return res.status(400).json({ error: 'relationship_id is required' });
        if (!payload.title) return res.status(400).json({ error: 'title is required' });
        if (!payload.content) return res.status(400).json({ error: 'content is required' });
        // a mentor may only write notes on relationships they hold
        const { data: rel } = await supabase.from('student_relationships').select('id,mentor_id,student_id').eq('id', payload.relationship_id).maybeSingle();
        if (!rel) return res.status(404).json({ error: 'Relationship not found' });
        if (rel.mentor_id !== req.auth.user.id && rel.student_id !== req.auth.user.id) {
          return res.status(403).json({ error: 'Only the mentor or the student can record progress notes.' });
        }
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
      const level = await getAccessLevel(req.auth.profile, moduleKey);
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
      const metaErrU = await validateMasterMeta(table, req.body);
      if (metaErrU) return res.status(400).json({ error: metaErrU });
      const owns = await checkRowOwnership(table, level, req.auth.profile, req.params.id);
      if (!owns) return res.status(403).json({ error: 'You do not own this record.' });
      const gateErr = await checkPublishGate(table, req.body, level);
      if (gateErr) return res.status(403).json({ error: gateErr });
      const blocked = await guard(table, req.params.id, req.body, req);
      if (blocked) return res.status(403).json({ error: blocked });
      let updateData = { ...req.body };
      if (table === 'users') {
        const ALLOWED_U = ['name','email','phone','role_key','status','employee_id','roll_no','designation','level_values','program_id','date_of_joining','year_of_commencement','must_change_password'];
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
        if (filtered.level_values && typeof filtered.level_values !== 'object') filtered.level_values = {};
        for (const k of Object.keys(filtered.level_values || {})) if (!filtered.level_values[k]) delete filtered.level_values[k];
        updateData = filtered;
      }
      if (table === 'courses') {
        if (updateData.teaching_hours !== undefined && updateData.teaching_hours !== '' && updateData.teaching_hours !== null) {
          const h = Number(updateData.teaching_hours); if (!Number.isFinite(h)||h<0) return res.status(400).json({ error: 'teaching_hours must be >=0' });
          let mins = 45; const did2 = updateData.discipline_id || (await supabase.from('courses').select('discipline_id').eq('id', req.params.id).single().then(r=>r.data?.discipline_id).catch(()=>null));
          if (did2) { try { const { data: d } = await supabase.from('disciplines').select('period_minutes').eq('id', did2).single(); if (d?.period_minutes) mins = d.period_minutes; } catch {} }
          const p = derivePeriods(h, mins); if (p!==null) updateData.teaching_periods = p;
        }
        ['cie_hours','cie_mins','see_hours','see_mins'].forEach(k=>{ if(updateData[k]==='') updateData[k]=null; if(updateData[k]!==undefined&&updateData[k]!==null){ const v=Number(updateData[k]); if(!Number.isFinite(v)||v<0) updateData[k]=null; else updateData[k]=Math.round(v); } });
        if (updateData.month_label === '') updateData.month_label = null;
      }
      if (table === 'courses') {
        if (typeof updateData.objectives_json === 'string') { try { updateData.objectives_json = JSON.parse(updateData.objectives_json); } catch {} }
        if (typeof updateData.outcomes_json === 'string') { try { updateData.outcomes_json = JSON.parse(updateData.outcomes_json); } catch {} }
        if (updateData.examination_type_id === '') updateData.examination_type_id = null;
        if (updateData.discipline_id === '') updateData.discipline_id = null;
      }
      if (table === 'course_modules') {
        if (typeof updateData.rbt_levels === 'string') { try { updateData.rbt_levels = JSON.parse(updateData.rbt_levels); } catch { updateData.rbt_levels = []; } }
        if (typeof updateData.methodology_list === 'string') { try { updateData.methodology_list = JSON.parse(updateData.methodology_list); } catch { updateData.methodology_list = []; } }
        if (updateData.rbt_levels !== undefined && !Array.isArray(updateData.rbt_levels)) updateData.rbt_levels = [];
        if (updateData.methodology_list !== undefined && !Array.isArray(updateData.methodology_list)) updateData.methodology_list = [];
        if (updateData.syllabus_id === '') updateData.syllabus_id = null;
      }
      if (table === 'course_module_topics' && updateData.description === '') updateData.description = null;
      if (table === 'disciplines') {
        if (updateData.category_id === '') updateData.category_id = null;
        if (updateData.structure_mode && !['monthly','yearly','semester'].includes(updateData.structure_mode)) return res.status(400).json({ error: 'Invalid structure_mode' });
        if (updateData.month_count !== undefined && updateData.month_count !== '' && updateData.month_count !== null) { const v=Number(updateData.month_count); if(!Number.isFinite(v)||v<1||v>24) return res.status(400).json({ error: 'month_count 1..24' }); updateData.month_count=Math.round(v); }
        if (updateData.month_count === '') updateData.month_count = null;
        if (updateData.year_count !== undefined && updateData.year_count !== '' && updateData.year_count !== null) { const v=Number(updateData.year_count); if(!Number.isFinite(v)||v<1||v>10) return res.status(400).json({ error: 'year_count 1..10' }); updateData.year_count=Math.round(v); }
        if (updateData.semesters_per_year !== undefined && updateData.semesters_per_year !== '' && updateData.semesters_per_year !== null) { const v=Number(updateData.semesters_per_year); if(!Number.isFinite(v)||v<1||v>4) return res.status(400).json({ error: 'semesters_per_year 1..4' }); updateData.semesters_per_year=Math.round(v); }
        // semester mapping bound to program — keep y*perYear divisible (inherent) and require both
        const _sm = updateData.structure_mode; if (_sm==='semester') { const yc=updateData.year_count, sp=updateData.semesters_per_year; if (yc!=null&&sp!=null&&!Number.isFinite(Number(yc)*Number(sp))) return res.status(400).json({ error: 'Semester program needs valid years and per-year' }); }
        if (updateData.period_minutes !== undefined && updateData.period_minutes !== '' && updateData.period_minutes !== null) {
          const v = Number(updateData.period_minutes); updateData.period_minutes = Number.isFinite(v) ? Math.min(120, Math.max(10, Math.round(v))) : 45;
        } else if (updateData.period_minutes === '') updateData.period_minutes = 45;
        if (updateData.period_effective_from === '') updateData.period_effective_from = null;
        if (updateData.description === '') updateData.description = null;
      }
      if (table === 'program_categories') {
        if ((LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) return res.status(403).json({ error: 'Managing program categories requires Full access on Curriculum.' });
        if (updateData.name !== undefined) updateData.name = String(updateData.name).trim();
        if (updateData.duration_unit !== undefined && updateData.duration_unit !== '' && updateData.duration_unit !== null && !['years','months'].includes(updateData.duration_unit)) return res.status(400).json({ error: 'Invalid duration_unit (years or months only)' });
        if (updateData.duration_value !== undefined && updateData.duration_value !== '' && updateData.duration_value !== null) { const v=Number(updateData.duration_value); if(!Number.isFinite(v)||v<1||v>99) return res.status(400).json({ error: 'duration_value 1..99' }); updateData.duration_value=Math.round(v); }
        if (updateData.duration_value === '') updateData.duration_value = null;
        if (updateData.duration_unit === '') updateData.duration_unit = null;
      }
      if (table === 'course_syllabi') {
        if (updateData.status && !['draft','published','archived'].includes(updateData.status)) return res.status(400).json({ error: 'Invalid status' });
        if (updateData.notes === '') updateData.notes = null;
        if (updateData.academic_year === '') return res.status(400).json({ error: 'academic_year cannot be empty' });
        if (updateData.version_number !== undefined && updateData.version_number !== '' && updateData.version_number != null && req.auth?.profile?.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can reset version number.' });
        if (updateData.version_number === '') updateData.version_number = null;
        else if (updateData.version_number != null) updateData.version_number = Math.max(1, Math.round(Number(updateData.version_number)) || 1);
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
      const level = await getAccessLevel(req.auth.profile, moduleKey);
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
      const blocked = await guard(table, req.params.id, {}, req);
      if (blocked) return res.status(403).json({ error: blocked });
      const { error } = await supabase.from(table).delete().eq('id', req.params.id);
      if (error) throw error;
      res.status(204).send();
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
});

// Super Admin is the one fixed role — the anchor of the whole permission chain.
// Its row can't be deleted, its key can't be renamed, and its Full permissions can't be revoked.
// Only one super_admin user may exist — it cannot be deleted or demoted, and a second cannot be created.
const guard = async (table, id, body = {}, req = null) => {
  if (table === 'roles' && id) {
    const { data } = await supabase.from('roles').select('key').eq('id', id).single();
    if (data?.key === 'super_admin') {
      if (Object.prototype.hasOwnProperty.call(body, 'key') && body.key !== 'super_admin')
        return 'The Super Admin role cannot be renamed.';
      if (!Object.keys(body).some(k => k !== 'key'))
        return 'The Super Admin role cannot be deleted.';
    }
  }
  if (table === 'category_level_values' && id) {
    if (body && body.parent_id) {
      // Re-parenting under one's own descendant would detach the subtree into a cycle.
      let cur = body.parent_id;
      while (cur) {
        if (cur === id) return 'A bucket cannot move inside itself.';
        const { data: p } = await supabase.from('category_level_values').select('parent_id').eq('id', cur).maybeSingle();
        cur = p?.parent_id || null;
      }
    }
    // Only a delete is blocked by holders and children; renaming, moving and
    // reordering carry the same rows with them and must stay allowed.
    if (!body || Object.keys(body).length === 0) {
      // level_values is keyed by node id, so a user holds a node when that key is
      // present. PostgREST can't test jsonb key existence, so read and filter here.
      const { data: holders } = await supabase.from('users').select('level_values').not('level_values', 'is', null);
      const held = (holders || []).filter(lv => Object.prototype.hasOwnProperty.call(lv.level_values || {}, id)).length;
      if (held > 0) return `${held} user(s) still hold this. Reassign them first.`;
      const { count: kids } = await supabase.from('category_level_values').select('id', { count: 'exact', head: true }).eq('parent_id', id);
      if ((kids || 0) > 0) return `This has ${kids} bucket(s) below it. Delete those first.`;
    }
  }
  if (table === 'user_categories' && id) {
    const { data } = await supabase.from('user_categories').select('key').eq('id', id).single();
    if (BUILT_IN_CATEGORY_KEYS.includes(data?.key)) {
      if (!body || Object.keys(body).length === 0) return `The ${data.name} category cannot be deleted.`;
      if (body.key !== undefined && body.key !== data.key) return `The ${data.name} category is built-in and its key cannot be changed.`;
      return null;
    }
    if (!body || Object.keys(body).length === 0) {
      const { count } = await supabase.from('roles').select('key', { count: 'exact', head: true }).eq('category', data?.key);
      if ((count || 0) > 0) return `${count} role(s) still belong to this category. Reassign them first.`;
    }
  }
  if (table === 'role_permissions' && id) {
    const { data } = await supabase.from('role_permissions').select('role_key').eq('id', id).single();
    if (data?.role_key === 'super_admin')
      return 'Super Admin permissions are fixed — Full access everywhere.';
  }
  // A grant only raises access, so a Super Admin never needs one; refuse to
  // write grants that would look like they grant more than the writer holds.
  if (table === 'user_permissions' && req?.auth?.profile) {
    const writer = req.auth.profile;
    const payload = body && Object.keys(body).length ? body : null;
    const targetUserId = payload ? payload.user_id : (await supabase.from('user_permissions').select('user_id').eq('id', id).single()).data?.user_id;
    const { data: target } = await supabase.from('users').select('role_key').eq('id', targetUserId).maybeSingle();
    if (target?.role_key === 'super_admin') return 'Super Admin already has Full access everywhere.';
    if (writer.role_key !== 'super_admin') {
      // Nobody edits their own access — otherwise a delegated admin could
      // promote themselves past whatever the Super Admin actually gave them.
      if (String(targetUserId) === String(writer.id))
        return 'You cannot change your own permissions. Ask a Super Admin.';
      // Delegation is bounded: an admin may hand out only what they hold
      // themselves, module by module, so access can never be laundered upward.
      const moduleKey = payload?.module_key
        || (await supabase.from('user_permissions').select('module_key').eq('id', id).single()).data?.module_key;
      const [writerLevel, writerGrant] = await Promise.all([
        getAccessLevel(writer, 'users'),
        moduleKey
          ? supabase.from('role_permissions').select('access_level').eq('role_key', writer.role_key).eq('module_key', moduleKey).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (LEVEL_ORDER[writerLevel] < LEVEL_ORDER['Full'])
        return 'Only Super Admin can grant permissions to other users.';
      const ceiling = Math.max(LEVEL_ORDER[writerGrant.data?.access_level] ?? 0, LEVEL_ORDER[await getAccessLevel(writer, moduleKey)] ?? 0);
      const asked = payload?.access_level;
      if (asked && LEVEL_ORDER[asked] > ceiling)
        return `You can grant at most ${Object.keys(LEVEL_ORDER).find(k => LEVEL_ORDER[k] === ceiling) || 'no access'} on ${moduleKey} — that is all you hold there.`;
    }
  }
  if (table === 'users' && id) {
    const { data } = await supabase.from('users').select('role_key').eq('id', id).single();
    if (data?.role_key === 'super_admin') {
      const hasRoleChange = body && Object.prototype.hasOwnProperty.call(body, 'role_key') && body.role_key !== 'super_admin';
      const isDelete = !body || Object.keys(body).length === 0;
      if (isDelete) return 'The Super Admin user cannot be deleted. There must always be one Super Admin.';
      if (hasRoleChange) return 'The Super Admin user cannot be changed to another role.';
    } else if (body && body.role_key === 'super_admin') {
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('role_key', 'super_admin');
      if ((count || 0) >= 1) return 'Only one Super Admin is allowed.';
    }
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
    const level = await getAccessLevel(req.auth.profile, moduleKey);
    if (!level || !canAccess(level, 'list')) return res.status(403).json({ error: 'You do not have View access for this module.' });
    const { data, error } = await supabase.from('roles').select('*').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const rolesCreate = async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile, 'roles');
    if (!level || !canAccess(level, 'create')) return res.status(403).json({ error: 'You do not have Create access for this module.' });
    const body = { ...req.body };
    if (!body.key || !body.name) return res.status(400).json({ error: 'key and name are required' });
    body.key = String(body.key).trim().toLowerCase().replace(/\s+/g, '_');
    if (body.key === 'super_admin') return res.status(403).json({ error: 'Cannot create super_admin' });
    if (!body.category) body.category = 'staff';
    const catErr = await validateMasterMeta('roles', { category: body.category });
    if (catErr) return res.status(400).json({ error: catErr });
    const { data, error } = await supabase.from('roles').insert([body]).select();
    if (error) throw error;
    // A role is just a tree node that carries role_key, so place it in the tree
    // under the bucket the caller chose — otherwise it exists in the picker but
    // nowhere assignable. No parent_id means a root node in its category.
    const parentId = req.body.parent_id || null;
    if (parentId) {
      const { data: parent } = await supabase.from('category_level_values').select('id, category_key').eq('id', parentId).maybeSingle();
      if (!parent) return res.status(400).json({ error: 'Unknown parent node.' });
      body.category = parent.category_key;
      await supabase.from('roles').update({ category: body.category }).eq('key', body.key);
    }
    await supabase.from('category_level_values').insert([{ category_key: body.category, parent_id: parentId, role_key: body.key, name: body.name }]);
    res.status(201).json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const rolesUpdate = async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile, 'roles');
    if (!level || !canAccess(level, 'update')) return res.status(403).json({ error: 'You do not have Manage access for this module.' });
    const blocked = await guard('roles', req.params.id, req.body);
    if (blocked) return res.status(403).json({ error: blocked });
    if (req.body.category !== undefined) {
      const { data: existing } = await supabase.from('roles').select('key').eq('id', req.params.id).single();
      if (existing?.key === 'super_admin' && req.body.category !== 'system') return res.status(403).json({ error: 'Super Admin category cannot be changed' });
      if (existing?.key !== 'super_admin') {
        const uCatErr = await validateMasterMeta('roles', { category: req.body.category });
        if (uCatErr) return res.status(400).json({ error: uCatErr });
      }
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
    const level = await getAccessLevel(req.auth.profile, 'roles');
    if (!level || !canAccess(level, 'delete')) return res.status(403).json({ error: 'You do not have Full access for this module.' });
    const blocked = await guard('roles', req.params.id, req.body);
    if (blocked) return res.status(403).json({ error: blocked });
    const { data: gone } = await supabase.from('roles').select('key').eq('id', req.params.id).single();
    const { error } = await supabase.from('roles').delete().eq('id', req.params.id);
    if (error) throw error;
    // The role's bucket would otherwise linger as an unnamed placeholder, but its
    // FK cascades, so only remove it once nothing sits below it.
    if (gone?.key) {
      const { data: node } = await supabase.from('category_level_values').select('id').eq('role_key', gone.key).maybeSingle();
      if (node) {
        const { count: kids } = await supabase.from('category_level_values').select('id', { count: 'exact', head: true }).eq('parent_id', node.id);
        if ((kids || 0) === 0) await supabase.from('category_level_values').delete().eq('id', node.id);
      }
    }
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Routing Registry — one generic CRUD per API key, mapped to its (sometimes differently-named) table.
const TABLES_WITH_UPDATED_AT = new Set(['users', 'events', 'enquiries', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects', 'certificates']);
const TABLE_FOR = { curriculum: 'disciplines', timetable: 'timetable_slots', liveclasses: 'live_sessions', lessonplans: 'lesson_plans' };
const ORDER_FOR = { courses: 'code', course_modules: 'module_number', course_module_topics: 'sort_order', disciplines: 'name', examination_types: 'name', roles: 'name', role_permissions: 'module_key', user_permissions: 'module_key', category_level_values: 'sort_order', user_categories: 'sort_order', class_entries: 'class_date', class_confirmations: 'created_at', assignment_submissions: 'created_at', projects: 'created_at', certificates: 'created_at', timetable_periods: 'sort_order', program_categories: 'sort_order', course_syllabi: 'created_at', academic_years: 'start_date', terms: 'sequence', course_offerings: 'created_at', course_registrations: 'registered_at' };

const modules = ['users', 'curriculum', 'batches', 'timetable', 'timetable_periods', 'events', 'enquiries', 'jobs', 'liveclasses', 'lessonplans', 'assignments', 'feedback', 'student_performances', 'courses', 'course_modules', 'course_module_topics', 'examination_types', 'program_categories', 'course_syllabi', 'academic_years', 'terms', 'course_offerings', 'course_registrations', 'role_permissions', 'user_permissions', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects', 'certificates', 'category_level_values', 'user_categories'];
modules.forEach(m => {
  const table = TABLE_FOR[m] || m;
  const handler = crud(table, ORDER_FOR[table]);
  // All module routes require auth (role picker is replaced by Supabase Auth)
  // Individual permissions checked in handler functions
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

// Course Registrations Status update (drop vs delete preservation)
app.put('/api/course_registrations/:id/status', authMiddleware, async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile, 'curriculum');
    const { data: cur } = await supabase.from('course_registrations').select('*').eq('id', req.params.id).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Registration not found' });
    // A student may only drop their own registration; Manage+ can set any status.
    const isOwner = cur.student_id === req.auth?.profile?.id;
    if (!isOwner && !canAccess(level, 'update')) return res.status(403).json({ error: 'You do not have Manage access for this module.' });
    const next = String(req.body.status || '');
    if (!['registered', 'completed', 'dropped'].includes(next)) {
      return res.status(400).json({ error: 'status must be one of: registered, completed, dropped' });
    }
    const { data, error } = await supabase.from('course_registrations').update({ status: next }).eq('id', req.params.id).select().single();
    if (error) throw error;
    await recordAudit(req, { action: 'update', entityType: 'course_registrations', entityId: req.params.id, summary: `Course registration status ${cur.status} → ${next}`, previousValue: cur, newValue: data });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enrolments: Student → Batch membership. Gates on the `batches` module
// because the roster is the batch's own responsibility. Membership changes
// are never a hard delete — the row is kept and marked 'dropped' so historical
// results stay attributable to the batch the student actually sat in.
app.get('/api/enrollments', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'batches', 'list');
    if (!level) return;
    let query = supabase.from('enrollments').select('*');
    if (req.query.batch_id) query = query.eq('batch_id', req.query.batch_id);
    if (req.query.student_id) query = query.eq('student_id', req.query.student_id);
    const { data, error } = await query.order('enrolled_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/enrollments', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'batches', 'create');
    if (!level) return;
    const student_id = req.body.student_id;
    const batch_id = req.body.batch_id;
    if (!student_id || !batch_id) return res.status(400).json({ error: 'student_id and batch_id are required' });
    const { data: student } = await supabase.from('users').select('id, role_key').eq('id', student_id).maybeSingle();
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const { data: existing } = await supabase.from('enrollments').select('id,status').eq('student_id', student_id).eq('batch_id', batch_id).maybeSingle();
    if (existing && existing.status !== 'dropped') return res.status(409).json({ error: 'Student is already enrolled in this batch.' });
    if (existing) {
      // Re-enrolling into a batch they left: revive the row rather than
      // creating a duplicate, so one batch has one enrolment per student.
      const { data, error } = await supabase.from('enrollments').update({ status: 'enrolled' }).eq('id', existing.id).select().single();
      if (error) throw error;
      await recordAudit(req, { action: 'update', entityType: 'enrollments', entityId: existing.id, summary: `Re-enrolled student ${student_id} into batch ${batch_id}`, previousValue: existing, newValue: data });
      return res.status(200).json(data);
    }
    const { data, error } = await supabase.from('enrollments').insert([{ student_id, batch_id }]).select().single();
    if (error) throw error;
    await recordAudit(req, { action: 'create', entityType: 'enrollments', entityId: data.id, summary: `Enrolled student ${student_id} into batch ${batch_id}`, newValue: data });
    res.status(201).json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Student is already enrolled in this batch.' });
    res.status(500).json({ error: e.message });
  }
});

// Leaving a batch is a status change, not a delete — the manual requires the
// enrolment row survive so past attendance and results keep their batch context.
app.put('/api/enrollments/:id/status', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'batches', 'update');
    if (!level) return;
    const { data: cur } = await supabase.from('enrollments').select('*').eq('id', req.params.id).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Enrolment not found' });
    const next = String(req.body.status || '');
    if (!['enrolled', 'completed', 'dropped'].includes(next)) {
      return res.status(400).json({ error: 'status must be one of: enrolled, completed, dropped' });
    }
    const { data, error } = await supabase.from('enrollments').update({ status: next }).eq('id', req.params.id).select().single();
    if (error) throw error;
    await recordAudit(req, { action: 'update', entityType: 'enrollments', entityId: req.params.id, summary: `Enrolment status ${cur.status} → ${next}`, previousValue: cur, newValue: data });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/enrollments/:id', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'batches', 'delete');
    if (!level) return;
    const { data: cur } = await supabase.from('enrollments').select('*').eq('id', req.params.id).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Enrolment not found' });
    const { error } = await supabase.from('enrollments').delete().eq('id', req.params.id);
    if (error) throw error;
    await recordAudit(req, { action: 'delete', entityType: 'enrollments', entityId: req.params.id, summary: `Deleted enrolment of student ${cur.student_id} from batch ${cur.batch_id}`, previousValue: cur });
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// The caller's own effective access per module, role baseline folded together
// with their own grants. The portal renders its navigation from this, so a
// person never needs read access to the whole grant tables.
app.get('/api/my-permissions', authMiddleware, async (req, res) => {
  try {
    const me = req.auth.profile;
    const isSuper = me.role_key === 'super_admin';
    if (isSuper) {
      res.json({ role_key: me.role_key, module_key: null, access_level: 'Full', perms: {} });
      return;
    }
    const [{ data: byRole }, { data: byUser }] = await Promise.all([
      supabase.from('role_permissions').select('module_key, access_level').eq('role_key', me.role_key),
      supabase.from('user_permissions').select('module_key, access_level').eq('user_id', me.id),
    ]);
    const perms = {};
    const rank = (l) => LEVEL_ORDER[l] ?? 0;
    (byRole || []).forEach(p => { perms[p.module_key] = p.access_level; });
    (byUser || []).forEach(p => {
      if (rank(p.access_level) > rank(perms[p.module_key])) perms[p.module_key] = p.access_level;
    });
    res.json({ role_key: me.role_key, perms });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Overview widget layout — a personal preference scoped to the caller.
// Not a module, so it stays out of the `modules` CRUD loop above: that loop
// resolves permissions through role_permissions, which has no row for this.
app.get('/api/dashboard-widgets', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dashboard_widgets')
      .select('id, module_key, sort_order, visible, width, kind, custom_title')
      .eq('user_id', req.auth.profile.id)
      .order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/dashboard-widgets', authMiddleware, async (req, res) => {
  try {
    const widgets = req.body?.widgets;
    if (!Array.isArray(widgets)) return res.status(400).json({ error: 'widgets must be an array' });
    const rows = widgets.map((w, i) => ({
      user_id: req.auth.profile.id,
      module_key: String(w.module_key || '').slice(0, 64),
      sort_order: i,
      visible: w.visible !== false,
      width: parseInt(w.width) || 1,
      kind: String(w.kind || 'stat').slice(0, 32),
      custom_title: w.custom_title ? String(w.custom_title).slice(0, 100) : null,
    })).filter(r => r.module_key);
    await supabase.from('dashboard_widgets').delete().eq('user_id', req.auth.profile.id);
    if (rows.length) {
      const { error } = await supabase.from('dashboard_widgets').insert(rows);
      if (error) throw error;
    }
    res.json({ ok: true, count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: user password/OTP management
// Self-service profile edit. Deliberately separate from PUT /api/users/:id,
// which requires Manage on the Users module. Only descriptive, non-privileged
// fields are exposed — role_key, status, email and program stay admin-owned.
const SELF_EDITABLE = { name: 120, phone: 20, designation: 80, avatar_url: 500, avatar_initials: 3 };
app.put('/api/me', authMiddleware, async (req, res) => {
  try {
    const patch = {};
    for (const [k, max] of Object.entries(SELF_EDITABLE)) {
      if (req.body?.[k] === undefined) continue;
      // An explicit null clears the column; String(null) would store "null".
      if (req.body[k] === null) { patch[k] = null; continue; }
      const v = String(req.body[k]).trim();
      if (k === 'name' && !v) return res.status(400).json({ error: 'Name is required' });
      if (v.length > max) return res.status(400).json({ error: `${k} too long` });
      patch[k] = v || null;
    }
    // level_values is keyed by tree node id, so every key must be a node that
    // actually exists — otherwise users would collect junk nobody can render.
    if (req.body?.level_values !== undefined) {
      const lv = req.body.level_values && typeof req.body.level_values === 'object' ? req.body.level_values : {};
      const keys = Object.keys(lv).filter(k => lv[k]);
      if (keys.length) {
        const { data: nodes } = await supabase.from('category_level_values').select('id').in('id', keys);
        const known = new Set((nodes || []).map(n => n.id));
        const bad = keys.find(k => !known.has(k));
        if (bad) return res.status(400).json({ error: `Unknown level node "${bad}".` });
      }
      patch.level_values = lv;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
    const { data, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', req.auth.profile.id)
      .select('id, name, email, phone, designation, level_values, avatar_url, avatar_initials')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// `mode` picks what the admin issues: 'otp' refreshes the one-time code only,
// 'both' (default) issues a fresh temporary password and demands an OTP swap.
app.post('/api/admin/users/:id/reset-password', authMiddleware, async (req, res) => {
  try {
    if (req.auth.profile.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can reset passwords' });
    const mode = req.body?.mode === 'otp' ? 'otp' : 'both';
    const { data: user } = await supabase.from('users').select('auth_user_id, email, id').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    let tempPassword;
    if (mode === 'both') {
      tempPassword = genTempPassword();
      const { error: authErr } = await supabase.auth.admin.updateUserById(user.auth_user_id, { password: tempPassword });
      if (authErr) throw authErr;
      await supabase.from('users').update({ must_change_password: true }).eq('id', user.id);
    }

    await supabase.from('user_otps').update({ consumed: true }).eq('user_id', user.id).eq('consumed', false);
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('user_otps').insert([{ user_id: user.id, otp_code: otp, expires_at: expires }]);
    const emailed = await sendOTPEmail(user.email, otp, tempPassword || null);
    res.json({
      ok: true, mode, emailSent: emailed,
      otp: (process.env.NODE_ENV !== 'production' || !emailed) ? otp : undefined,
      tempPassword: tempPassword && (process.env.NODE_ENV !== 'production' || !emailed) ? tempPassword : undefined,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/users/:id/generate-otp', authMiddleware, async (req, res) => {
  try {
    if (req.auth.profile.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can generate OTPs' });
    const { data: user } = await supabase.from('users').select('id, email').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    await supabase.from('user_otps').update({ consumed: true }).eq('user_id', user.id).eq('consumed', false);
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('user_otps').insert([{ user_id: user.id, otp_code: otp, expires_at: expires }]);
    const emailed = await sendOTPEmail(user.email, otp, null);
    res.json({ ok: true, emailSent: emailed, otp: (process.env.NODE_ENV !== 'production' || !emailed) ? otp : undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: the forgot-password queue. Not a module — it bypasses role_permissions
// like the other /api/admin/users routes and gates on role_key directly.
app.get('/api/admin/password-resets', authMiddleware, async (req, res) => {
  try {
    if (req.auth.profile.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can view password reset requests' });
    const { data, error } = await supabase
      .from('password_reset_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resolve one queue row: 'otp' | 'both' reuses the reset-password machinery by
// resolving the email to a user id, 'reply' just emails a free-text note, and
// 'reject' closes it without touching any credential.
app.post('/api/admin/password-resets/:id/action', authMiddleware, async (req, res) => {
  try {
    if (req.auth.profile.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can action password reset requests' });
    const action = String(req.body?.action || '');
    const { data: request } = await supabase.from('password_reset_requests').select('*').eq('id', req.params.id).single();
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const close = (status) => supabase.from('password_reset_requests').update({ status }).eq('id', request.id).then(({ error }) => { if (error) throw error; });

    if (action === 'reject') {
      await close('rejected');
      return res.json({ ok: true, status: 'rejected' });
    }

    const { data: user } = await supabase.from('users').select('id, email, auth_user_id').eq('email', request.email).maybeSingle();
    if (!user) return res.status(404).json({ error: 'No user found with that email' });

    if (action === 'otp' || action === 'both') {
      let tempPassword;
      if (action === 'both') {
        tempPassword = genTempPassword();
        const { error: authErr } = await supabase.auth.admin.updateUserById(user.auth_user_id, { password: tempPassword });
        if (authErr) throw authErr;
        await supabase.from('users').update({ must_change_password: true }).eq('id', user.id);
      }
      await supabase.from('user_otps').update({ consumed: true }).eq('user_id', user.id).eq('consumed', false);
      const otp = genOTP();
      await supabase.from('user_otps').insert([{ user_id: user.id, otp_code: otp, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }]);
      const emailed = await sendOTPEmail(user.email, otp, tempPassword || null);
      await close('processed');
      const reveal = process.env.NODE_ENV !== 'production' || !emailed;
      return res.json({
        ok: true, status: 'processed', emailSent: emailed,
        otp: reveal ? otp : undefined,
        tempPassword: tempPassword && reveal ? tempPassword : undefined,
      });
    }

    if (action === 'reply') {
      const note = String(req.body?.note || '').trim();
      if (!note) return res.status(400).json({ error: 'note is required' });
      const emailed = await sendNoteEmail(request.email, 'Your Nada Gurukulam password reset request', note);
      await close('processed');
      return res.json({ ok: true, status: 'processed', emailSent: emailed });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: approve a self-signup applicant. Flips status pending → active,
// applies the real role/program an admin picks, and issues the first OTP.
app.post('/api/admin/users/:id/approve', authMiddleware, async (req, res) => {
  try {
    if (req.auth.profile.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can approve signups' });
    const { role_key, program_id, designation, level_values } = req.body || {};
    const { data: user } = await supabase.from('users').select('id, email, status').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(409).json({ error: 'Only pending signups can be approved' });
    if (!role_key || role_key === 'super_admin') return res.status(400).json({ error: 'A non-super-admin role must be assigned' });

    const { error: roleErr } = await supabase
      .from('users')
      .update({ status: 'active', role_key, program_id: program_id || null, designation: designation || null, level_values: (level_values && typeof level_values === 'object') ? level_values : {} })
      .eq('id', user.id);
    if (roleErr) throw roleErr;

    await supabase.from('user_otps').update({ consumed: true }).eq('user_id', user.id).eq('consumed', false);
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('user_otps').insert([{ user_id: user.id, otp_code: otp, expires_at: expires }]);
    const emailed = await sendOTPEmail(user.email, otp, null);
    res.json({ ok: true, emailSent: emailed, otp: (process.env.NODE_ENV !== 'production' || !emailed) ? otp : undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: reject a self-signup applicant outright.
app.post('/api/admin/users/:id/reject-signup', authMiddleware, async (req, res) => {
  try {
    if (req.auth.profile.role_key !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can reject signups' });
    const { data: user } = await supabase.from('users').select('id, status, auth_user_id').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(409).json({ error: 'Only pending signups can be rejected' });
    if (user.auth_user_id) await supabase.auth.admin.deleteUser(user.auth_user_id).catch(() => {});
    await supabase.from('users').delete().eq('id', user.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// KYC endpoints
app.get('/api/users/:id/kyc', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('user_kyc_docs').select('*').eq('user_id', req.params.id);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:id/kyc', authMiddleware, async (req, res) => {
  try {
    const { doc_type, doc_number, file_url } = req.body;
    if (!doc_type || !doc_number || !file_url) return res.status(400).json({ error: 'doc_type, doc_number, and file_url are required' });
    const { data, error } = await supabase.from('user_kyc_docs').insert([{ user_id: req.params.id, doc_type, doc_number, file_url }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/user-kyc-docs/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('user_kyc_docs').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

// ── Syllabus file parse — DOCX / PDF / XLSX → structured JSON preview ──────────
// POST /api/curriculum/parse  multipart field "file"  (Manage on curriculum)
// Pure parse, no DB write — frontend shows editable preview then saves via CRUD.
function splitSyllabusChunks(raw) {
  const txt = String(raw || '');
  const progRe = /Program\s*Name\s*:?/gi;
  let m; const idxs = [];
  while ((m = progRe.exec(txt)) !== null) idxs.push(m.index);
  if (idxs.length >= 2) {
    const fil = [idxs[0]];
    for (let i = 1; i < idxs.length; i++) if (idxs[i] - idxs[i - 1] > 400) fil.push(idxs[i]);
    if (fil.length >= 2) return fil.map((s, i) => txt.slice(s, fil[i + 1] ?? txt.length));
  }
  const courseRe = /Course\s*Name\s*:?/gi;
  const cIdxs = []; courseRe.lastIndex = 0;
  while ((m = courseRe.exec(txt)) !== null) cIdxs.push(m.index);
  if (cIdxs.length >= 2) {
    const fil = [cIdxs[0]];
    for (let i = 1; i < cIdxs.length; i++) if (cIdxs[i] - cIdxs[i - 1] > 800) fil.push(cIdxs[i]);
    if (fil.length >= 2) return fil.map((s, i) => txt.slice(s, fil[i + 1] ?? txt.length));
  }
  const semRe = /^\s*Semester\s+(\d+)\s*:[^\n]*/gim;
  const sIdxs = [];
  let sm; while ((sm = semRe.exec(txt)) !== null) {
    if (/Module-wise/i.test(sm[0])) continue;
    // skip "Methodology for Semester X:" — line does not start with Semester
    const before = txt.slice(Math.max(0, sm.index - 40), sm.index);
    if (/Methodology\s+for\s*$/i.test(before)) continue;
    sIdxs.push(sm.index);
  }
  if (sIdxs.length >= 2) {
    const fil = [sIdxs[0]];
    for (let i = 1; i < sIdxs.length; i++) if (sIdxs[i] - sIdxs[i - 1] > 200) fil.push(sIdxs[i]);
    if (fil.length >= 2) {
      const preface = txt.slice(0, fil[0]);
      const firstLine = preface.split('\n').map(s => s.trim()).find(Boolean) || '';
      const docTitle = firstLine && firstLine.length <= 80 ? firstLine : '';
      const yearRe = /^\s*Year\s+\d+\s*:.*$/gim;
      const yearIdxs = [];
      let ym; while ((ym = yearRe.exec(txt)) !== null) yearIdxs.push({ idx: ym.index, line: ym[0].trim() });
      const yearForIdx = (pos) => { for (let k = yearIdxs.length - 1; k >= 0; k--) if (yearIdxs[k].idx < pos) return yearIdxs[k]; return null; };
      return fil.map((s, i) => {
        const end = fil[i + 1] ?? txt.length;
        let rawChunk = txt.slice(s, end);
        rawChunk = rawChunk.replace(/\n\s*Year\s+\d+\s*:.*\s*$/i, '').trimEnd();
        if (i === 0) {
          rawChunk = preface + '\n' + rawChunk;
        } else {
          const y = yearForIdx(s);
          if (y && !rawChunk.slice(0, 600).match(/Year\s+\d+\s*:/i)) rawChunk = y.line + '\n' + rawChunk;
          if (docTitle && !rawChunk.slice(0, 400).includes(docTitle)) rawChunk = docTitle + '\n' + rawChunk;
        }
        return rawChunk;
      });
    }
  }
  return [txt];
}

function parseSyllabusText(raw) {
  const txt = String(raw || '');
  const linesRaw = txt.split('\n');
  const lines = linesRaw.map(l => l.trim());
  const nextAfter = (...labels) => {
    for (const label of labels) {
      const lab = label.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        const cur = lines[i].toLowerCase();
        if (cur === lab || cur === lab + ':' || cur === lab + ' :') {
          for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
        }
      }
      // header-style without colon on its own line, value next non-empty
      // also try inline "Label: value"
      for (let i = 0; i < linesRaw.length; i++) {
        const re = new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*(.+)$', 'i');
        const m = String(linesRaw[i] || '').match(re);
        if (m && m[1].trim()) return m[1].trim();
      }
    }
    return '';
  };
  const field = (label) => nextAfter(label);
  let programName = field('Program Name') || field('Program');
  let courseName = field('Course Name');
  let code = field('Code');
  let semesterRaw = field('Semester');
  let yearRaw = field('Year') || field('Year Label');
  const typeRaw = (() => {
    const v = field('Type');
    if (/^(DSC|SEC|DSE|AECC|GE|Core)$/i.test(v)) return v.toUpperCase();
    return v;
  })();
  const tpRaw = field('Teaching Hours/Periods') || field('Teaching Hours') || field('Teaching Periods');
  let teachingHours = null, teachingPeriods = null;
  if (tpRaw) {
    const parts = tpRaw.split('/').map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) { teachingHours = Number(parts[0]) || null; teachingPeriods = Number(parts[1]) || null; }
    else if (parts.length === 1) {
      const n = Number(parts[0]);
      if (Number.isFinite(n)) teachingHours = n;
    }
  }
  let cieMarksRaw = field('CIE Marks') || field('CIE');
  let seeMarksRaw = field('SEE Marks') || field('SEE');
  let creditsRaw = field('Credits');
  const examType = field('Examination Type') || field('Exam Type');
  const cieExamH = (txt.match(/CIE\s*:\s*([^\n]+)/i) || [])[1]?.trim() || '';
  const seeExamH = (txt.match(/SEE\s*:\s*([^\n]+)/i) || [])[1]?.trim() || '';
  if (!programName) {
    const first = lines.find(l => l && l.length <= 80 && !/^Semester\s+\d/i.test(l) && !/^Module\s+\d/i.test(l)) || '';
    if (first && /^[A-Z][A-Z \-&]+$/.test(first) || /VOCAL THEORY|THEORY/i.test(first)) programName = first;
    else if (first && first.length <= 60) programName = first;
  }
  if (!creditsRaw) {
    const mt = txt.match(/Total\s*Credits\s*:\s*(\d+)/i);
    if (mt) creditsRaw = mt[1];
  }
  if (teachingHours == null && teachingPeriods == null) {
    const th = txt.match(/Total\s*Semester\s*Hours\s*:\s*(\d+)/i);
    if (th) { teachingHours = Number(th[1]) || null; if (teachingHours) teachingPeriods = Math.round(teachingHours * 60 / 45); }
  }
  if (!courseName) {
    const sm = txt.match(/Semester\s+(\d+)\s*:\s*([^\n]+)/i);
    if (sm) {
      const t = sm[2].trim().replace(/Module-wise.*/i, '').trim();
      if (t && !/^Module-wise/i.test(t)) courseName = t;
      else courseName = 'Semester ' + sm[1];
    }
  }
  if (!semesterRaw) {
    const sM = txt.match(/Semester\s+(\d+)\s*:/i);
    if (sM) semesterRaw = sM[1];
  }
  if (!yearRaw) {
    const yM = txt.match(/Year\s+(\d+)\s*:/i);
    if (yM) yearRaw = yM[1];
  }
  if (!code && programName && semesterRaw) {
    const initials = programName.split(/\s+/).map(w=>w[0]).join('').toUpperCase().replace(/[^A-Z]/g,'').slice(0,4) || 'PAPER';
    const semNum = String(semesterRaw).replace(/[^0-9]/g,'') || '1';
    code = `${initials}-S${semNum}`;
  }
  const semester = (() => {
    if (!semesterRaw) return '';
    const s = semesterRaw.trim();
    if (/^[IVX]+$/i.test(s)) return 'Semester ' + s.toUpperCase();
    if (/^\d+$/.test(s)) { const rom = ['I','II','III','IV','V','VI','VII','VIII','IX','X']; const n = Number(s); if (n>=1&&n<=10) return 'Semester ' + rom[n-1]; }
    return s;
  })();
  const yearLabel = (() => {
    if (!yearRaw) return '';
    const y = yearRaw.trim();
    if (/^[IVX]+$/i.test(y)) return 'Year ' + y.toUpperCase();
    if (/^\d+$/.test(y)) { const rom = ['I','II','III','IV','V','VI','VII','VIII','IX','X']; const n=Number(y); if(n>=1&&n<=10) return 'Year '+rom[n-1]; }
    if (/^Year/i.test(y)) return y;
    return y;
  })();
  const credits = creditsRaw ? Number(String(creditsRaw).replace(/[^0-9]/g,'')) || null : null;
  const cieMarks = cieMarksRaw ? Number(String(cieMarksRaw).replace(/[^0-9]/g,'')) || null : null;
  const seeMarks = seeMarksRaw ? Number(String(seeMarksRaw).replace(/[^0-9]/g,'')) || null : null;

  const splitSentences = (block) => {
    if (!block) return [];
    const cleaned = block.replace(/\s+/g, ' ').trim();
    let items = [];
    const rawParts = block.split(/\n+/).map(s=>s.trim()).filter(s=> s && s.length>6 && !/^(OBJ|OUTCOMES|Pedagogy|Methodology|Module|Hours|RBT|Teaching|CO Mapping|Suggested|Activity|Assessment)/i.test(s));
    if (rawParts.length >= 2) items = rawParts;
    else {
      items = cleaned.split(/\.\s+/).map(s=>s.trim()).filter(Boolean).map(s=> s.endsWith('.')?s:s+'.');
    }
    return items.map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>8);
  };
  const blockBetween = (startRe, endRe) => {
    const s = txt.search(startRe);
    if (s === -1) return '';
    const after = txt.slice(s);
    const e = after.search(endRe);
    if (e === -1) return after;
    const slice = txt.slice(s);
    const m = slice.match(endRe);
    if (!m) return slice;
    return slice.slice(0, m.index);
  };
  let objBlock = '';
  let outBlock = '';
  let pedBlock = '';
  const hasCourseObjectives = /Course\s+Objectives?/i.test(txt);
  if (hasCourseObjectives) {
    const pedHeaderRe = '(?:^|\\n)\\s*(?:Pedagogy|Methodology)(?:\\s+for\\s+Semester\\s+\\d+)?\\s*:?';
    const objM = txt.match(new RegExp('Course\\s+Objectives?\\s*(?:\\([^)]*\\))?\\s*:?\\s*\\n+([\\s\\S]*?)(?=(?:^|\\n)\\s*Course\\s+Outcomes?\\s*(?:\\([^)]*\\))?\\s*:?|' + pedHeaderRe + '|Module\\s+\\d\\s*[-–:]' + ')','i'));
    if (objM) objBlock = objM[1];
    const outPat = 'Course\\s+Outcomes?\\s*(?:\\([^)]*\\))?\\s*:?\\s*(?:Upon completion[^\\n]*\\n+)?([\\s\\S]*?)(?=' + pedHeaderRe + '|Module\\s+\\d\\s*[-–:]' + ')';
    const outM = txt.match(new RegExp(outPat, 'i'));
    if (outM) {
      const objPos = txt.search(/Course\s+Objectives?/i);
      const outPos = txt.search(/Course\s+Outcomes?/i);
      if (outPos > objPos) outBlock = outM[1];
      else {
        const after = txt.slice(objPos);
        const m2 = after.match(new RegExp(outPat, 'i'));
        if (m2) outBlock = m2[1];
      }
    }
    const outPos2 = txt.search(/Course\s+Outcomes?/i);
    const pedSearchBase = outPos2 !== -1 ? txt.slice(outPos2) : txt.slice(txt.search(/Course\s+Objectives?/i));
    const pedM = pedSearchBase.match(new RegExp(pedHeaderRe + '\\s*([\\s\\S]*?)(?=Module\\s+\\d|Semester\\s+\\d\\s*:\\s*Module|Suggested Learning|Activity Based|Assessment Details|$)', 'i'));
    if (pedM) pedBlock = pedM[1];
  } else {
    const m = txt.match(/OBJ\w*CTIVES?\s*:?\s*\n+([\s\S]*?)(?=OUTCOMES?:|(?:^|\n)\s*Pedagogy:\s|Module\s+\d)/i);
    if (m) objBlock = m[1];
    const m2 = txt.match(/(?:^|\n)\s*OUTCOMES?\s*:?\s*(?:At the end[^\n]*\n+)?([\s\S]*?)(?=(?:^|\n)\s*Pedagogy:\s|Module\s+\d\s*[-–])/i);
    if (m2) outBlock = m2[1];
    const m3 = txt.match(/(?:^|\n)\s*Pedagogy:\s*([\s\S]*?)(?=Module\s+\d|Suggested Learning|Activity Based|Assessment Details|$)/i);
    if (m3) pedBlock = m3[1];
    if (!pedBlock) {
      const pm = txt.match(/(?:^|\n)\s*Methodology\s*:?\s*([\s\S]*?)(?=Module\s+\d|Semester\s+\d|$)/i);
      if (pm) pedBlock = pm[1];
    }
  }
  if (!pedBlock) {
    const pm = txt.match(/(?:^|\n)\s*(?:Pedagogy|Methodology)(?:\s+for\s+Semester\s+\d+)?\s*:?\s*([\s\S]*?)(?=Module\s+\d|Semester\s+\d|$)/i);
    if (pm) pedBlock = pm[1];
  }
  let objectives = splitSentences(objBlock).slice(0, 12).filter(s => !/^By the end/i.test(s) && !/^Upon completion.*able/i.test(s));
  let outcomes = splitSentences(outBlock).slice(0, 12).filter(s => !/^By the end/i.test(s) && !/^Upon completion.*able/i.test(s));
  if (!outcomes.length && outBlock && /CO\s*\d/i.test(outBlock)) {
    outcomes = outBlock.split('\n').map(s=>s.trim()).filter(s=> /^CO\s*\d/i.test(s)).map(s=> s.replace(/^CO\s*\d\s*:?\s*/i,'').trim()).filter(s=>s.length>8).slice(0,12);
    if (!outcomes.length) outcomes = outBlock.split(/(?=CO\s*\d)/i).map(s=>s.trim()).filter(s=>s && s.length>8 && !/^By the end/i.test(s)).slice(0,12);
  }
  if (!objectives.length && objBlock && objBlock.trim()) {
    const cand = objBlock.split('\n').map(s=>s.trim()).filter(s=>s && s.length>12 && !/^(Pedagogy|Module|By the end)/i.test(s));
    if (cand.length >= 1) objectives = cand.slice(0,12);
  }
  const pedagogyLines = pedBlock ? pedBlock.split('\n').map(s=>s.trim()).filter(s=> s && s.length>3 && !/^(Module|Hours|RBT|Teaching|CO Mapping|Semester\s+\d\s*:\s*Module)/i.test(s)).slice(0,8) : [];
  const pedagogy = pedagogyLines.join('\n');

  // Modules
  const mods = [];
  const modRe = /Module\s+(\d+)\s*[-–—:\s]*([^\n]*)/gi;
  let m; const idxs=[];
  while ((m = modRe.exec(txt)) !== null) idxs.push({ n: Number(m[1]), title: m[2].trim(), idx: m.index });
  // Ignore duplicate numbering from appended syllabus docs concatenated — keep only first contiguous numbering run if Module 1 repeats far apart.
  // If we see Module 1 again after Module 4 and gap>2000 chars, it indicates two syllabi concatenated; keep first syllabus only.
  let cutIdx = idxs.length;
  for (let i=1;i<idxs.length;i++) { if (idxs[i].n===1 && idxs[i].idx - idxs[i-1].idx > 1500) { cutIdx=i; break; } }
  const useIdxs = idxs.slice(0, cutIdx);
  for (let i=0;i<useIdxs.length;i++) {
    const cur = useIdxs[i]; const nxt = useIdxs[i+1];
    const block = txt.slice(cur.idx, nxt ? nxt.idx : txt.length);
    const hrs = (block.match(/Hours:\s*\n*\s*(\d+)/i) || [])[1];
    const rbt = (block.match(/RBT Level:\s*\n*\s*([^\n]+)/i) || [])[1]?.trim() || '';
    const co = (block.match(/CO Mapping:\s*([^\n]+)/i) || [])[1]?.trim() || '';
    // methodology: lines after "Teaching Methodology" until CO Mapping or topics
    let methodology = '';
    {
      const mm = block.match(/Teaching\s*\n*Methodology\s*\n*([\s\S]*?)(?=(?:CO Mapping:|Module\s+\d|$))/i);
      if (mm) {
        const cand = mm[1].split('\n').map(s=>s.trim()).filter(Boolean);
        // Methodology keywords — first 1-4 lines are methodology, rest are topics
        const methKeywords = /^(Chalk|Practical|Seminar|Live Demo|Guiding|Listening|Inducing|Encouraging|Comparative|Lecture|Notation|Rhythmic|Creative)/i;
        const methLines=[]; let k=0;
        for (const ln of cand) {
          if (k<4 && methKeywords.test(ln)) { methLines.push(ln); k++; }
          else if (k>0 && k<4 && ln.length<60 && methKeywords.test(ln)) { methLines.push(ln); k++; }
          else break;
        }
        methodology = methLines.join('\n');
      }
    }
    const linesB = block.split('\n').map(s=>s.trim()).filter(s=> s);
    const headerPats = [/^Module\s+\d+/i, /^Hours:/i, /^\d+$/, /^RBT Level:/i, /^L\d/i, /^Teaching$/i, /^Methodology$/i, /^CO Mapping:/i, /^Suggested/i, /^Activity/i, /^Assessment/i, /^Course Outcomes/i, /^RBT Levels/i, /^Methodology:/i, /^Methodology for/i];
    const isHeader = (ln) => headerPats.some(re=> re.test(ln));
    const methSet = new Set(methodology.split('\n').map(s=>s.trim()).filter(Boolean));
    const topics = [];
    for (const ln of linesB) {
      if (isHeader(ln)) continue;
      if (methSet.has(ln)) continue;
      if (/^L\d/.test(ln) && ln.length<12) continue;
      if (/^CO\d/i.test(ln) && ln.length<10) continue;
      if (/Course Outcomes/i.test(ln) && ln.length<60) continue;
      if (/RBT Levels/i.test(ln)) continue;
      if (/^Methodology for Semester/i.test(ln)) continue;
      if (ln.length<2) continue;
      if (ln.length>350) continue;
      if (/^(Chalk|Practical|Seminar|Live Demo|Guiding|Listening|Inducing|Encouraging|Lecture-demonstrations|Notation workshops|Comparative|Rhythmic|Creative|Mock NET)/i.test(ln)) continue;
      let t = ln.replace(/\s+in\s*$/i,'').trim();
      t = t.replace(/^[•\-\*]\s*/, '').trim();
      if (!t) continue;
      if (/^Points to be/i.test(t)) continue;
      if (/^Raga bhava|^Shruti|^Sahitya|^Gamaka|^Broadening|^Control over/i.test(t)) continue;
      if (/^Swathi|^Patnam|^On the basis|^o\s/i.test(t)) continue;
      if (t.length > 180) t = t.slice(0, 180).trim();
      if (topics.includes(t)) continue;
      topics.push(t);
      if (topics.length>=20) break;
    }
    let title = cur.title || '';
    // HINDUSTANI-style: title contains "Topic : Description" — split description into topics if none extracted
    if (!topics.length && title.includes(' : ')) {
      const parts = title.split(' : ');
      if (parts.length >= 2) {
        const desc = parts.slice(1).join(' : ').trim();
        if (desc.length > 10) {
          title = parts[0].trim();
          topics.push(desc.slice(0, 120));
        }
      }
    } else if (!topics.length && title.includes(': ') && title.length > 40) {
      const ci = title.indexOf(': ');
      const after = title.slice(ci + 2).trim();
      if (after.length > 10) {
        topics.push(after.slice(0, 120));
        title = title.slice(0, ci).trim();
      }
    }
    if (!title) title = topics[0] || `Module ${cur.n}`;
    mods.push({ module_number: cur.n, title: title.slice(0,120), hours: hrs ? Number(hrs) : null, rbt_level: rbt || null, methodology: methodology || null, co_mapping: co || null, topics: topics.slice(0,20) });
  }

  return {
    programName: programName || '',
    courseName: courseName || '',
    code: code || '',
    type: typeRaw || 'DSC',
    semester,
    yearLabel,
    teachingHours,
    teachingPeriods,
    cieMarks,
    seeMarks,
    credits,
    examinationType: examType || '',
    examinationHoursCie: cieExamH || '',
    examinationHoursSee: seeExamH || '',
    objectives,
    outcomes,
    pedagogy,
    modules: mods,
  };
}

async function bufferToText(buffer, orig, mime) {
  const ext = String(orig || '').toLowerCase().split('.').pop() || '';
  const mt = String(mime || '').toLowerCase();
  if (ext === 'docx' || mt.includes('wordprocessingml') || mt.includes('officedocument')) {
    if (!mammoth) throw Object.assign(new Error('DOCX parser not installed on server'), { status: 503 });
    const r = await mammoth.extractRawText({ buffer });
    return r.value || '';
  }
  if (ext === 'pdf' || mt.includes('pdf')) {
    if (!pdfParse) throw Object.assign(new Error('PDF parser not installed on server'), { status: 503 });
    const data = await pdfParse(buffer);
    return data.text || '';
  }
  if (ext === 'xlsx' || ext === 'xls' || mt.includes('spreadsheetml') || mt.includes('excel')) {
    if (!XLSX) throw Object.assign(new Error('XLSX parser not installed on server'), { status: 503 });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sht = wb.Sheets[wb.SheetNames[0]];
    if (!sht) throw Object.assign(new Error('XLSX has no sheets'), { status: 400 });
    const rows = XLSX.utils.sheet_to_json(sht, { header: 1, defval: '' });
    return rows.map(r => Array.isArray(r) ? r.join(' | ') : String(r)).join('\n');
  }
  if (ext === 'csv' || mt.includes('csv')) {
    if (XLSX) {
      try {
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const sht = wb.Sheets[wb.SheetNames[0]];
        if (sht) {
          const rows = XLSX.utils.sheet_to_json(sht, { header: 1, defval: '' });
          if (rows.length) return rows.map(r => Array.isArray(r) ? r.join(' | ') : String(r)).join('\n');
        }
      } catch {}
    }
    return buffer.toString('utf-8');
  }
  if (ext === 'html' || ext === 'htm' || mt.includes('text/html')) {
    let s = buffer.toString('utf-8');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<[^>]+>/g, '\n');
    s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"');
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }
  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || mt.includes('text/plain') || mt.includes('text/markdown')) {
    return buffer.toString('utf-8');
  }
  if (ext === 'pptx' || ext === 'ppt' || mt.includes('presentationml') || mt.includes('powerpoint')) {
    try {
      const s = buffer.toString('utf-8');
      const hits = [...s.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
      if (hits.length) return hits.join('\n');
      const stripped = s.replace(/[^\x20-\x7Eऀ-ॿ\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (stripped.length > 20) return stripped;
    } catch {}
    throw Object.assign(new Error('PPT/PPTX text extraction is best-effort — if empty, export to PDF/DOCX and re-upload'), { status: 422 });
  }
  throw Object.assign(new Error('Unsupported file type. Use .docx, .pdf, .xlsx, .csv, .html, .txt/.md, .pptx'), { status: 400 });
}

app.post('/api/curriculum/parse', authMiddleware, (req, res, next) => {
  const ct = String(req.headers['content-type'] || '');
  if (upload && ct.includes('multipart/form-data')) return upload.single('file')(req, res, next);
  next();
}, async (req, res) => {
  try {
    const level = await getAccessLevel(req.auth.profile, 'curriculum');
    if (!level || (LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Manage']) return res.status(403).json({ error: 'Manage on Curriculum required to parse syllabus files.' });
    let buffer = null, orig = '', mime = '', size = 0;
    if (req.file && req.file.buffer) {
      buffer = req.file.buffer; orig = String(req.file.originalname || ''); mime = String(req.file.mimetype || ''); size = req.file.size || buffer.length;
    } else if (req.body && req.body.data) {
      orig = String(req.body.filename || req.body.originalname || req.body.name || 'upload.docx');
      mime = String(req.body.mime || req.body.mimetype || '');
      const b64 = String(req.body.data || '');
      if (b64.length > 22 * 1024 * 1024) return res.status(413).json({ error: 'File too large (max 15 MB)' });
      try { buffer = Buffer.from(b64, 'base64'); } catch { return res.status(400).json({ error: 'Invalid base64 data' }); }
      size = buffer.length;
    } else {
      return res.status(400).json({ error: 'No file uploaded. Send multipart field "file" or JSON { filename, mime, data: base64 }' });
    }
    let text = '';
    try { text = await bufferToText(buffer, orig, mime); }
    catch (e) { const s = e.status || 422; return res.status(s).json({ error: 'Failed to extract text: ' + (e.message || e) }); }
    if (!text || !text.trim()) return res.status(422).json({ error: 'No extractable text found in file.' });
    const chunks = splitSyllabusChunks(text);
    const papers = chunks.map(c => parseSyllabusText(c));
    const parsed = papers[0] || parseSyllabusText(text);
    res.json({ filename: orig, size, parsed, papers, rawPreview: text.slice(0, 4000), rawPreviews: chunks.map(c => c.slice(0, 2000)) });
  } catch (e) { res.status(500).json({ error: e.message || 'Parse failed' }); }
});

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
    const level = await getAccessLevel(req.auth.profile, 'curriculum');
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



// Organisation endpoints
const UNIT_TYPES = ['School', 'Faculty', 'Department', 'Centre', 'Unit', 'Office'];

// Least privilege: the backend gates every route, not just the UI.
const requireLevel = async (req, res, moduleKey, action) => {
  const level = await getAccessLevel(req.auth.profile, moduleKey);
  if (!level || !canAccess(level, action)) {
    res.status(403).json({ error: `You do not have ${action === 'list' ? 'View' : action === 'create' ? 'Create' : action === 'update' ? 'Edit' : 'Delete'} access for ${moduleKey}.` });
    return null;
  }
  return level;
};

app.get('/api/organisation/units', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'organisation', 'list');
    if (!level) return;
    const { data, error } = await supabase.from('organisational_units').select('*').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/organisation/units', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'organisation', 'create');
    if (!level) return;
    const { campus_id, parent_unit_id, name, type } = req.body;
    if (!String(name || '').trim()) return res.status(400).json({ error: 'name is required' });
    if (!UNIT_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${UNIT_TYPES.join(', ')}` });
    const { data, error } = await supabase.from('organisational_units').insert([{
      campus_id: campus_id || null, parent_unit_id: parent_unit_id || null,
      name: String(name).trim().slice(0, 160), type,
    }]).select();
    if (error) throw error;
    await recordAudit(req, {
      action: 'create', entityType: 'organisational_units', entityId: data[0].id,
      summary: `Created ${type} "${data[0].name}"`, newValue: data[0],
    });
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Organisation: institutions / campuses / positions / reporting ─────────
// Plain-text name/code fields are trimmed and length-capped at the boundary
// rather than in the UI, so every client gets the same guarantee.

const orgCrud = (table, orderCol, { fields, validate }) => {
  app.get(`/api/organisation/${fields.route}`, authMiddleware, async (req, res) => {
    try {
      const level = await requireLevel(req, res, 'organisation', 'list');
      if (!level) return;
      const { data, error } = await supabase.from(table).select('*').order(orderCol);
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/organisation/${fields.route}`, authMiddleware, async (req, res) => {
    try {
      const level = await requireLevel(req, res, 'organisation', 'create');
      if (!level) return;
      const payload = {};
      for (const [key, maxLen] of Object.entries(fields.columns)) {
        if (req.body[key] === undefined) continue;
        payload[key] = req.body[key] === '' ? null : String(req.body[key]).trim().slice(0, maxLen);
      }
      const err = validate(payload);
      if (err) return res.status(400).json({ error: err });
      const { data, error } = await supabase.from(table).insert([payload]).select();
      if (error) throw error;
      await recordAudit(req, {
        action: 'create', entityType: table, entityId: data[0].id,
        summary: `Created ${fields.label} "${data[0].name || data[0].title || data[0].code}"`,
        newValue: data[0],
      });
      res.status(201).json(data[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: `${fields.label} code already exists` });
      res.status(500).json({ error: e.message });
    }
  });
};

orgCrud('institutions', 'name', {
  fields: { route: 'institutions', label: 'Institution', columns: { name: 160, code: 40, type: 80 } },
  validate: (p) => (!p.name ? 'name is required' : !p.code ? 'code is required' : null),
});
orgCrud('campuses', 'name', {
  fields: { route: 'campuses', label: 'Campus', columns: { name: 160, code: 40, institution_id: 36 } },
  validate: (p) => (!p.name ? 'name is required' : !p.code ? 'code is required' : null),
});
orgCrud('positions', 'title', {
  fields: { route: 'positions', label: 'Position', columns: { unit_id: 36, title: 160, description: 500 } },
  validate: (p) => (!p.title ? 'title is required' : null),
});

// A reporting line is historical, not mutable: it is closed with effective_to
// and a new row is inserted, so past org charts stay reproducible.
app.post('/api/organisation/reporting', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'organisation', 'create');
    if (!level) return;
    const supervisor_id = String(req.body.supervisor_id || '');
    const subordinate_id = String(req.body.subordinate_id || '');
    if (!supervisor_id || !subordinate_id) return res.status(400).json({ error: 'supervisor_id and subordinate_id are required' });
    if (supervisor_id === subordinate_id) return res.status(400).json({ error: 'A person cannot report to themselves' });
    const effective_from = req.body.effective_from || new Date().toISOString().slice(0, 10);
    const { data: dupe } = await supabase.from('reporting_relationships')
      .select('id').eq('supervisor_id', supervisor_id).eq('subordinate_id', subordinate_id)
      .is('effective_to', null).maybeSingle();
    if (dupe) return res.status(409).json({ error: 'This reporting line is already open' });
    const { data, error } = await supabase.from('reporting_relationships')
      .insert([{ supervisor_id, subordinate_id, effective_from }]).select();
    if (error) throw error;
    await recordAudit(req, {
      action: 'create', entityType: 'reporting_relationships', entityId: data[0].id,
      summary: `Added reporting line from ${supervisor_id} to ${subordinate_id}`,
      newValue: data[0],
    });
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/organisation/reporting', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'organisation', 'list');
    if (!level) return;
    const { data, error } = await supabase.from('reporting_relationships').select('*').order('effective_from', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Closing a line writes history rather than deleting it.
app.post('/api/organisation/reporting/:id/close', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'organisation', 'update');
    if (!level) return;
    const effective_to = req.body.effective_to || new Date().toISOString().slice(0, 10);
    const { data: cur } = await supabase.from('reporting_relationships').select('*').eq('id', req.params.id).single();
    if (!cur) return res.status(404).json({ error: 'Reporting line not found' });
    if (cur.effective_to) return res.status(409).json({ error: 'This line is already closed' });
    const { data, error } = await supabase.from('reporting_relationships')
      .update({ effective_to }).eq('id', req.params.id).select();
    if (error) throw error;
    await recordAudit(req, {
      action: 'update', entityType: 'reporting_relationships', entityId: req.params.id,
      summary: `Closed reporting line effective ${effective_to}`,
      previousValue: cur, newValue: data[0],
    });
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admissions endpoints
const APPLICATION_STATUSES = ['submitted', 'screening', 'audition', 'selected', 'admitted', 'rejected'];
const SCREENING_STATUSES = ['pending', 'pass', 'fail'];
const AUDITION_STATUSES = ['scheduled', 'completed', 'passed', 'failed'];

app.get('/api/admissions/applications', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'admissions', 'list');
    if (!level) return;
    let query = supabase.from('admissions_applications').select('*').order('submitted_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admissions/applications', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'admissions', 'create');
    if (!level) return;
    const { applicant_id, programme_id, status } = req.body;
    if (!applicant_id) return res.status(400).json({ error: 'applicant_id is required' });
    if (status !== undefined && !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${APPLICATION_STATUSES.join(', ')}` });
    }
    const { data, error } = await supabase.from('admissions_applications')
      .insert([{ applicant_id, programme_id: programme_id || null, ...(status ? { status } : {}) }]).select();
    if (error) throw error;
    await recordAudit(req, {
      action: 'create', entityType: 'admissions_applications', entityId: data[0].id,
      summary: `Created admissions application for applicant ${applicant_id}`,
      newValue: { applicant_id, programme_id: programme_id || null, status: data[0].status },
    });
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admissions pipeline only moves forward: rejected and admitted are terminal,
// so a decision already recorded cannot be silently rewritten.
const APPLICATION_FLOW = ['submitted', 'screening', 'audition', 'selected', 'admitted', 'rejected'];

app.put('/api/admissions/applications/:id', authMiddleware, async (req, res) => {
  try {
    const level = await requireLevel(req, res, 'admissions', 'update');
    if (!level) return;
    const { data: cur } = await supabase.from('admissions_applications').select('*').eq('id', req.params.id).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Application not found' });
    const patch = {};
    if (req.body.status !== undefined) {
      const next = String(req.body.status);
      if (!APPLICATION_FLOW.includes(next)) return res.status(400).json({ error: `status must be one of: ${APPLICATION_FLOW.join(', ')}` });
      const from = APPLICATION_FLOW.indexOf(cur.status);
      const to = APPLICATION_FLOW.indexOf(next);
      // A terminal decision stays put; anything else may only move forward.
      if (cur.status === 'admitted' || cur.status === 'rejected') {
        if (next !== cur.status) return res.status(409).json({ error: `Application is already ${cur.status} and cannot be changed.` });
      } else if (to <= from) {
        return res.status(409).json({ error: `Cannot move from ${cur.status} back to ${next}.` });
      }
      patch.status = next;
    }
    if (req.body.programme_id !== undefined) patch.programme_id = req.body.programme_id || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
    const { data, error } = await supabase.from('admissions_applications').update(patch).eq('id', req.params.id).select();
    if (error) throw error;
    await recordAudit(req, {
      action: 'update', entityType: 'admissions_applications', entityId: req.params.id,
      summary: `Application status ${cur.status} → ${patch.status || cur.status}`,
      previousValue: cur, newValue: data[0],
    });
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const admissionsCrud = (table, route, { label, columns, validate }) => {
  app.get(`/api/admissions/${route}`, authMiddleware, async (req, res) => {
    try {
      const level = await requireLevel(req, res, 'admissions', 'list');
      if (!level) return;
      let query = supabase.from(table).select('*').order('created_at', { ascending: false });
      if (req.query.application_id) query = query.eq('application_id', req.query.application_id);
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/admissions/${route}`, authMiddleware, async (req, res) => {
    try {
      const level = await requireLevel(req, res, 'admissions', 'create');
      if (!level) return;
      const payload = {};
      for (const [key, maxLen] of Object.entries(columns)) {
        if (req.body[key] === undefined) continue;
        payload[key] = req.body[key] === '' ? null : String(req.body[key]).trim().slice(0, maxLen);
      }
      const err = validate(payload);
      if (err) return res.status(400).json({ error: err });
      const { data, error } = await supabase.from(table).insert([payload]).select();
      if (error) throw error;
      await recordAudit(req, {
        action: 'create', entityType: table, entityId: data[0].id,
        summary: `Created ${label} ${data[0].id}`, newValue: data[0],
      });
      res.status(201).json(data[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: `A ${label} with these details already exists` });
      res.status(500).json({ error: e.message });
    }
  });
};

admissionsCrud('applicants', 'applicants', {
  label: 'Applicant',
  columns: { name: 120, email: 160, phone: 20, date_of_birth: 10 },
  validate: (p) => (!p.name ? 'name is required' : !p.email ? 'email is required'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? 'email is not valid' : null),
});
admissionsCrud('screening_records', 'screening', {
  label: 'Screening record',
  columns: { application_id: 36, reviewer_id: 36, score: 3, feedback: 1000, status: 10 },
  validate: (p) => {
    if (!p.application_id) return 'application_id is required';
    if (p.status && !SCREENING_STATUSES.includes(p.status)) return `status must be one of: ${SCREENING_STATUSES.join(', ')}`;
    if (p.score !== undefined && p.score !== null && (isNaN(Number(p.score)) || Number(p.score) < 0 || Number(p.score) > 100))
      return 'score must be 0-100';
    return null;
  },
});
admissionsCrud('auditions', 'auditions', {
  label: 'Audition',
  columns: { application_id: 36, audition_date: 10, panelists: 2000, rubric_scores: 2000, status: 10 },
  validate: (p) => {
    if (!p.application_id) return 'application_id is required';
    if (p.status && !AUDITION_STATUSES.includes(p.status)) return `status must be one of: ${AUDITION_STATUSES.join(', ')}`;
    return null;
  },
});

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
      const level = await getAccessLevel(req.auth.profile, 'curriculum');
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
