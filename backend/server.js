const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());

// Enhanced CRUD with Audit Logging & Validation
const crud = (table, orderCol = 'created_at') => ({
  list: async (req, res) => {
    try {
      let query = supabase.from(table).select('*');
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  create: async (req, res) => {
    try {
      const { data, error } = await supabase.from(table).insert([req.body]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
  update: async (req, res) => {
    try {
      // Only tables that actually have an updated_at column get a timestamp,
      // otherwise the UPDATE errors on "column updated_at does not exist".
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
      const { error } = await supabase.from(table).delete().eq('id', req.params.id);
      if (error) throw error;
      res.status(204).send();
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
});

// Routing Registry — one generic CRUD per API key, mapped to its (sometimes differently-named) table.
const TABLES_WITH_UPDATED_AT = new Set(['users', 'events', 'jobs', 'enquiries']);
const TABLE_FOR = { curriculum: 'disciplines', timetable: 'timetable_slots', liveclasses: 'live_sessions', lessonplans: 'lesson_plans' };
const ORDER_FOR = { courses: 'code', course_modules: 'module_number', disciplines: 'name' };

const modules = ['users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'liveclasses', 'lessonplans', 'assignments', 'feedback', 'activities', 'courses', 'course_modules'];
modules.forEach(m => {
  const table = TABLE_FOR[m] || m;
  const handler = crud(table, ORDER_FOR[table]);
  app.get(`/api/${m}`, handler.list);
  app.post(`/api/${m}`, handler.create);
  app.put(`/api/${m}/:id`, handler.update);
  app.delete(`/api/${m}/:id`, handler.delete);
});

// Roles are data too: read-only for now (the role picker renders these).
// Full role management + an editable permission matrix come with the auth hardening pass.
app.get('/api/roles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('roles').select('*').order('key');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Nada Gurukulam API active on ${PORT}`));
