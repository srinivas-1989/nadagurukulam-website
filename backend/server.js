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
    const level = await getAccessLevel(req.auth.profile.role_key, 'curriculum');
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
  course_types: 'curriculum', examination_types: 'curriculum', program_categories: 'curriculum', course_syllabi: 'curriculum',
  timetable_periods: 'timetable',
  roles: 'roles', role_permissions: 'roles',
  class_entries: 'teachinglogs', class_confirmations: 'teachinglogs',
  assignment_submissions: 'assignments',
  projects: 'projects', certificates: 'certificates'
};
// Reverse: table name → module_key (crud is instantiated with table names)
const TABLE_TO_MODULE = {
  disciplines: 'curriculum', timetable_slots: 'timetable', timetable_periods: 'timetable',
  live_sessions: 'liveclasses', lesson_plans: 'lessonplans',
  courses: 'curriculum', course_modules: 'curriculum', course_module_topics: 'curriculum',
  course_types: 'curriculum', examination_types: 'curriculum', program_categories: 'curriculum', course_syllabi: 'curriculum',
  class_entries: 'teachinglogs', class_confirmations: 'teachinglogs',
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
      // ── courses: auto-derive teaching_hours via program period_minutes ──
      let payload = { ...req.body };
      if (table === 'courses' && payload.teaching_periods !== undefined && payload.teaching_periods !== '' && payload.teaching_periods !== null) {
        let mins = 45;
        if (payload.discipline_id) {
          try { const { data: d } = await supabase.from('disciplines').select('period_minutes').eq('id', payload.discipline_id).single(); if (d?.period_minutes) mins = d.period_minutes; } catch {}
        }
        const derived = deriveHours(payload.teaching_periods, mins);
        if (derived !== null) payload.teaching_hours = derived;
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
        if (payload.period_minutes !== undefined && payload.period_minutes !== '' && payload.period_minutes !== null) {
          const v = Number(payload.period_minutes); payload.period_minutes = Number.isFinite(v) ? Math.min(120, Math.max(10, Math.round(v))) : 45;
        } else if (payload.period_minutes === '') payload.period_minutes = 45;
        if (payload.period_effective_from === '') payload.period_effective_from = null;
        if (payload.description === '') payload.description = null;
      }
      if (table === 'program_categories') {
        if ((LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) return res.status(403).json({ error: 'Managing program categories requires Full access on Curriculum.' });
        if (payload.name !== undefined) payload.name = String(payload.name).trim();
        if (payload.duration_unit !== undefined && payload.duration_unit !== '' && payload.duration_unit !== null && !['years','months','semesters','weeks'].includes(payload.duration_unit)) return res.status(400).json({ error: 'Invalid duration_unit' });
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
        if (!payload.version_number) {
          const { data: rows } = await supabase.from('course_syllabi').select('version_number').eq('course_id', payload.course_id).order('version_number', { ascending: false }).limit(1);
          payload.version_number = rows && rows[0] ? Number(rows[0].version_number) + 1 : 1;
        }
        if (payload.notes === '') payload.notes = null;
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
        let mins = 45;
        const did = updateData.discipline_id || (await supabase.from('courses').select('discipline_id').eq('id', req.params.id).single().then(r=>r.data?.discipline_id).catch(()=>null));
        if (did) { try { const { data: d } = await supabase.from('disciplines').select('period_minutes').eq('id', did).single(); if (d?.period_minutes) mins = d.period_minutes; } catch {} }
        const derived = deriveHours(updateData.teaching_periods, mins);
        if (derived !== null) updateData.teaching_hours = derived;
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
        if (updateData.period_minutes !== undefined && updateData.period_minutes !== '' && updateData.period_minutes !== null) {
          const v = Number(updateData.period_minutes); updateData.period_minutes = Number.isFinite(v) ? Math.min(120, Math.max(10, Math.round(v))) : 45;
        } else if (updateData.period_minutes === '') updateData.period_minutes = 45;
        if (updateData.period_effective_from === '') updateData.period_effective_from = null;
        if (updateData.description === '') updateData.description = null;
      }
      if (table === 'program_categories') {
        if ((LEVEL_ORDER[level] ?? 0) < LEVEL_ORDER['Full']) return res.status(403).json({ error: 'Managing program categories requires Full access on Curriculum.' });
        if (updateData.name !== undefined) updateData.name = String(updateData.name).trim();
        if (updateData.duration_unit !== undefined && updateData.duration_unit !== '' && updateData.duration_unit !== null && !['years','months','semesters','weeks'].includes(updateData.duration_unit)) return res.status(400).json({ error: 'Invalid duration_unit' });
        if (updateData.duration_value !== undefined && updateData.duration_value !== '' && updateData.duration_value !== null) { const v=Number(updateData.duration_value); if(!Number.isFinite(v)||v<1||v>99) return res.status(400).json({ error: 'duration_value 1..99' }); updateData.duration_value=Math.round(v); }
        if (updateData.duration_value === '') updateData.duration_value = null;
        if (updateData.duration_unit === '') updateData.duration_unit = null;
      }
      if (table === 'course_syllabi') {
        if (updateData.status && !['draft','published','archived'].includes(updateData.status)) return res.status(400).json({ error: 'Invalid status' });
        if (updateData.notes === '') updateData.notes = null;
        if (updateData.academic_year === '') return res.status(400).json({ error: 'academic_year cannot be empty' });
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
// Only one super_admin user may exist — it cannot be deleted or demoted, and a second cannot be created.
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
const ORDER_FOR = { courses: 'code', course_modules: 'module_number', course_module_topics: 'sort_order', disciplines: 'name', course_types: 'name', examination_types: 'name', roles: 'name', role_permissions: 'module_key', class_entries: 'class_date', class_confirmations: 'created_at', assignment_submissions: 'created_at', projects: 'created_at', certificates: 'created_at', timetable_periods: 'sort_order', program_categories: 'sort_order', course_syllabi: 'created_at' };

const modules = ['users', 'curriculum', 'batches', 'timetable', 'timetable_periods', 'events', 'enquiries', 'jobs', 'liveclasses', 'lessonplans', 'assignments', 'feedback', 'activities', 'courses', 'course_modules', 'course_module_topics', 'course_types', 'examination_types', 'program_categories', 'course_syllabi', 'role_permissions', 'class_entries', 'class_confirmations', 'assignment_submissions', 'projects', 'certificates'];
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
    const level = await getAccessLevel(req.auth.profile.role_key, 'curriculum');
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
