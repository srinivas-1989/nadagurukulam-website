const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

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
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true, cms: mongoose.connection.readyState === 1 ? 'up' : 'down' }));

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
      .select('role_key, id, name, email')
      .eq('auth_user_id', user.id)
      .single();
    if (profileErr || !profile) {
      // User exists in Supabase Auth but not in our users table — deny
      return res.status(403).json({ error: 'User not registered in portal' });
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
  courses: 'curriculum', course_modules: 'curriculum', course_types: 'curriculum',
  roles: 'roles', role_permissions: 'roles'
};
// Reverse: table name → module_key (crud is instantiated with table names)
const TABLE_TO_MODULE = {
  disciplines: 'curriculum', timetable_slots: 'timetable',
  live_sessions: 'liveclasses', lesson_plans: 'lessonplans',
  courses: 'curriculum', course_modules: 'curriculum', course_types: 'curriculum'
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

const OWN_BATCH_TABLES = new Set(['timetable_slots', 'live_sessions', 'lesson_plans', 'assignments', 'feedback', 'activities']);

function applyListScope(query, table, level, profile, ownedBatchIds) {
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
    const BATCH_TABLES = new Set(['timetable_slots', 'live_sessions', 'lesson_plans', 'assignments', 'feedback', 'activities']);
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
    if (s.batch_id !== candidate.batch_id && s.room !== candidate.room) continue;
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
      if (!level || !canAccess(level, 'create')) {
        return res.status(403).json({ error: 'You do not have Create access for this module.' });
      }
      const gateErr = await checkPublishGate(table, req.body, level);
      if (gateErr) return res.status(403).json({ error: gateErr });
      if (table === 'timetable_slots') {
        const clash = await checkTimetableConflict(req.body);
        if (clash && level !== 'Full') {
          return res.status(409).json({ error: `Timetable conflict: overlaps with slot ${clash.day_of_week} ${clash.start_time}–${clash.end_time} (room ${clash.room}).` });
        }
      }
      const { data, error } = await supabase.from(table).insert([req.body]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  update: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (!level || !canAccess(level, 'update')) {
        return res.status(403).json({ error: 'You do not have Manage access for this module.' });
      }
      const owns = await checkRowOwnership(table, level, req.auth.profile, req.params.id);
      if (!owns) return res.status(403).json({ error: 'You do not own this record.' });
      const gateErr = await checkPublishGate(table, req.body, level);
      if (gateErr) return res.status(403).json({ error: gateErr });
      const blocked = await guard(table, req.params.id, req.body);
      if (blocked) return res.status(403).json({ error: blocked });
      const updateData = TABLES_WITH_UPDATED_AT.has(table)
        ? { ...req.body, updated_at: new Date().toISOString() }
        : req.body;
      const { data, error } = await supabase.from(table).update(updateData).eq('id', req.params.id).select();
      if (error) throw error;
      res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  delete: async (req, res) => {
    try {
      const moduleKey = TABLE_TO_MODULE[table] || API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (!level || !canAccess(level, 'delete')) {
        return res.status(403).json({ error: 'You do not have Full access for this module.' });
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

// Routing Registry — one generic CRUD per API key, mapped to its (sometimes differently-named) table.
const TABLES_WITH_UPDATED_AT = new Set(['users', 'events', 'enquiries']);
const TABLE_FOR = { curriculum: 'disciplines', timetable: 'timetable_slots', liveclasses: 'live_sessions', lessonplans: 'lesson_plans' };
const ORDER_FOR = { courses: 'code', course_modules: 'module_number', disciplines: 'name', course_types: 'name', roles: 'name', role_permissions: 'module_key' };

const modules = ['users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'liveclasses', 'lessonplans', 'assignments', 'feedback', 'activities', 'courses', 'course_modules', 'course_types', 'roles', 'role_permissions'];
modules.forEach(m => {
  const table = TABLE_FOR[m] || m;
  const handler = crud(table, ORDER_FOR[table]);
  // All module routes require auth (role picker is replaced by Supabase Auth)
  app.get(`/api/${m}`, authMiddleware, handler.list);
  app.post(`/api/${m}`, authMiddleware, handler.create);
  app.put(`/api/${m}/:id`, authMiddleware, handler.update);
  app.delete(`/api/${m}/:id`, authMiddleware, handler.delete);
});

// Roles endpoint — requires authentication (any authenticated user can view roles)
app.get('/api/roles', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('roles').select('*').order('key');
    if (error) throw error;
    res.json(data || []);
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
