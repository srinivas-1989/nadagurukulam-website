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
    let query = supabase.from(table).select('*');
    if (orderCol) query = query.order(orderCol, { ascending: false });
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  },
  create: async (req, res) => {
    const { data, error } = await supabase.from(table).insert([req.body]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data[0]);
  },
  update: async (req, res) => {
    const { data, error } = await supabase.from(table).update(req.body).eq('id', req.params.id).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
  },
  delete: async (req, res) => {
    const { error } = await supabase.from(table).delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
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

app.listen(PORT, () => console.log(`Nada Gurukulam API server running on port ${PORT}`));
