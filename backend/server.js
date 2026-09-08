const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Supabase (Backend uses Service Role Key for full access)
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

// --- Users API (CRUD + Permissions) ---
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/users', async (req, res) => {
  const { name, email, role_key, custom_permissions } = req.body;
  const payload = { name, email, role_key, status: 'active' };
  if (custom_permissions) payload.custom_permissions = custom_permissions;
  const { data, error } = await supabase
    .from('users')
    .insert([payload])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put('/api/users/:id', async (req, res) => {
  const { name, email, role_key, status, custom_permissions } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (email !== undefined) patch.email = email;
  if (role_key !== undefined) patch.role_key = role_key;
  if (status !== undefined) patch.status = status;
  if (custom_permissions !== undefined) patch.custom_permissions = custom_permissions;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/users/:id', async (req, res) => {
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- Curriculum API (CRUD) ---
app.get('/api/curriculum', async (req, res) => {
  const { data, error } = await supabase.from('disciplines').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/curriculum', async (req, res) => {
  const { name, description, levels, lead_faculty_id } = req.body;
  const { data, error } = await supabase
    .from('disciplines')
    .insert([{ name, description, levels, lead_faculty_id }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put('/api/curriculum/:id', async (req, res) => {
  const { name, description, levels, lead_faculty_id } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (levels !== undefined) patch.levels = levels;
  if (lead_faculty_id !== undefined) patch.lead_faculty_id = lead_faculty_id;

  const { data, error } = await supabase
    .from('disciplines')
    .update(patch)
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/curriculum/:id', async (req, res) => {
  const { error } = await supabase.from('disciplines').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- Batches API (CRUD) ---
app.get('/api/batches', async (req, res) => {
  const { data, error } = await supabase.from('batches').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/batches', async (req, res) => {
  const { name, discipline_id, level, faculty_id, capacity } = req.body;
  const { data, error } = await supabase
    .from('batches')
    .insert([{ name, discipline_id, level, faculty_id, capacity }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put('/api/batches/:id', async (req, res) => {
  const { name, discipline_id, level, faculty_id, capacity, status } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (discipline_id !== undefined) patch.discipline_id = discipline_id;
  if (level !== undefined) patch.level = level;
  if (faculty_id !== undefined) patch.faculty_id = faculty_id;
  if (capacity !== undefined) patch.capacity = capacity;
  if (status !== undefined) patch.status = status;

  const { data, error } = await supabase
    .from('batches')
    .update(patch)
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/api/batches/:id', async (req, res) => {
  const { error } = await supabase.from('batches').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- Timetable API (CRUD) ---
app.get('/api/timetable', async (req, res) => {
  const { data, error } = await supabase.from('timetable_slots').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/timetable', async (req, res) => {
  const { batch_id, day_of_week, start_time, end_time, room } = req.body;
  const { data, error } = await supabase
    .from('timetable_slots')
    .insert([{ batch_id, day_of_week, start_time, end_time, room }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.delete('/api/timetable/:id', async (req, res) => {
  const { error } = await supabase.from('timetable_slots').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Nada Gurukulam API server running on port ${PORT}`);
});
