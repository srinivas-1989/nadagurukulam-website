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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', institution: 'Nada Gurukulam', timestamp: new Date().toISOString() });
});

// Helper for generic CRUD
const crud = (table, orderCol = 'created_at') => ({
  list: async (req, res) => {
    try {
      let query = supabase.from(table).select('*');
      if (orderCol) query = query.order(orderCol, { ascending: false });
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    try {
      const { data, error } = await supabase.from(table).insert([req.body]).select();
      if (error) return res.status(500).json({ error: error.message });
      res.status(201).json(data[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    try {
      const { data, error } = await supabase.from(table).update(req.body).eq('id', req.params.id).select();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    try {
      const { error } = await supabase.from(table).delete().eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
});

// --- Core Academic Modules ---
const users = crud('users');
app.get('/api/users', users.list);
app.post('/api/users', users.create);
app.put('/api/users/:id', users.update);
app.delete('/api/users/:id', users.delete);

const curriculum = crud('disciplines', 'name');
app.get('/api/curriculum', curriculum.list);
app.post('/api/curriculum', curriculum.create);
app.put('/api/curriculum/:id', curriculum.update);
app.delete('/api/curriculum/:id', curriculum.delete);

const batches = crud('batches');
app.get('/api/batches', batches.list);
app.post('/api/batches', batches.create);
app.put('/api/batches/:id', batches.update);
app.delete('/api/batches/:id', batches.delete);

const timetable = crud('timetable_slots', null);
app.get('/api/timetable', timetable.list);
app.post('/api/timetable', timetable.create);
app.put('/api/timetable/:id', timetable.update);
app.delete('/api/timetable/:id', timetable.delete);

// --- Public Engagement Modules ---
const events = crud('events', 'date');
app.get('/api/events', events.list);
app.post('/api/events', events.create);
app.put('/api/events/:id', events.update);
app.delete('/api/events/:id', events.delete);

const enquiries = crud('enquiries');
app.get('/api/enquiries', enquiries.list);
app.post('/api/enquiries', enquiries.create);
app.put('/api/enquiries/:id', enquiries.update);
app.delete('/api/enquiries/:id', enquiries.delete);

const jobs = crud('jobs');
app.get('/api/jobs', jobs.list);
app.post('/api/jobs', jobs.create);
app.put('/api/jobs/:id', jobs.update);
app.delete('/api/jobs/:id', jobs.delete);

// --- Advanced Academic & Student Workflow Modules ---
const liveclasses = crud('live_sessions', 'session_date');
app.get('/api/liveclasses', liveclasses.list);
app.post('/api/liveclasses', liveclasses.create);
app.put('/api/liveclasses/:id', liveclasses.update);
app.delete('/api/liveclasses/:id', liveclasses.delete);

const lessonplans = crud('lesson_plans', 'session_date');
app.get('/api/lessonplans', lessonplans.list);
app.post('/api/lessonplans', lessonplans.create);
app.put('/api/lessonplans/:id', lessonplans.update);
app.delete('/api/lessonplans/:id', lessonplans.delete);

const assignments = crud('assignments', 'due_date');
app.get('/api/assignments', assignments.list);
app.post('/api/assignments', assignments.create);
app.put('/api/assignments/:id', assignments.update);
app.delete('/api/assignments/:id', assignments.delete);

const feedback = crud('feedback', 'created_at');
app.get('/api/feedback', feedback.list);
app.post('/api/feedback', feedback.create);
app.put('/api/feedback/:id', feedback.update);
app.delete('/api/feedback/:id', feedback.delete);

const activities = crud('activities', 'date');
app.get('/api/activities', activities.list);
app.post('/api/activities', activities.create);
app.put('/api/activities/:id', activities.update);
app.delete('/api/activities/:id', activities.delete);

app.listen(PORT, () => console.log(`Nada Gurukulam API server running on port ${PORT}`));
