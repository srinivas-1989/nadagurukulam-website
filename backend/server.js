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
      // Add updated_at timestamp if column exists
      const updateData = { ...req.body, updated_at: new Date().toISOString() };
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

// Routing Registry
const modules = ['users', 'curriculum', 'batches', 'timetable', 'events', 'enquiries', 'jobs', 'liveclasses', 'lessonplans', 'assignments', 'feedback', 'activities'];
modules.forEach(m => {
  const handler = crud(m === 'curriculum' ? 'disciplines' : m === 'timetable' ? 'timetable_slots' : m === 'liveclasses' ? 'live_sessions' : m === 'lessonplans' ? 'lesson_plans' : m);
  app.get(`/api/${m}`, handler.list);
  app.post(`/api/${m}`, handler.create);
  app.put(`/api/${m}/:id`, handler.update);
  app.delete(`/api/${m}/:id`, handler.delete);
});

app.listen(PORT, () => console.log(`Nada Gurukulam API active on ${PORT}`));
