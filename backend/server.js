const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());

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
    // Fetch the user's role from public.users
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('role_key, id, name, email')
      .eq('id', user.id)
      .single();
    if (profileErr || !profile) {
      // User exists in auth but not in our users table — deny
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

// Maps the API route key to the modules list key for permission lookup
const API_TO_MODULE = {
  users: 'users', curriculum: 'curriculum', batches: 'batches',
  timetable: 'timetable', liveclasses: 'liveclasses', lessonplans: 'lessonplans',
  assignments: 'assignments', feedback: 'feedback', events: 'events',
  jobs: 'jobs', enquiries: 'enquiries', activities: 'activities',
  courses: 'curriculum', course_modules: 'curriculum', course_types: 'curriculum',
  roles: 'roles', role_permissions: 'roles'
};

// Enhanced CRUD — server-side permission check added
const crud = (table, orderCol = 'created_at') => ({
  list: async (req, res) => {
    try {
      const moduleKey = API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (!level || !canAccess(level, 'list')) {
        return res.status(403).json({ error: 'You do not have View access for this module.' });
      }
      let query = supabase.from(table).select('*');
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  create: async (req, res) => {
    try {
      const moduleKey = API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (!level || !canAccess(level, 'create')) {
        return res.status(403).json({ error: 'You do not have Create access for this module.' });
      }
      const { data, error } = await supabase.from(table).insert([req.body]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  update: async (req, res) => {
    try {
      const moduleKey = API_TO_MODULE[table] || table;
      const level = await getAccessLevel(req.auth.profile.role_key, moduleKey);
      if (!level || !canAccess(level, 'update')) {
        return res.status(403).json({ error: 'You do not have Manage access for this module.' });
      }
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
      const moduleKey = API_TO_MODULE[table] || table;
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
const TABLES_WITH_UPDATED_AT = new Set(['users', 'events', 'jobs', 'enquiries']);
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
}, { timestamps: true });
const CmsBlock = mongoose.models.CmsBlock || mongoose.model('CmsBlock', cmsBlockSchema);

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

app.put('/api/cms/:key', async (req, res) => {
  try {
    if (!cmsReady) return res.status(503).json({ error: 'MongoDB not connected' });
    const block = await CmsBlock.findOneAndUpdate(
      { key: req.params.key },
      { key: req.params.key, content: req.body },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    res.json({ key: block.key, content: block.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Nada Gurukulam API active on ${PORT}`));
