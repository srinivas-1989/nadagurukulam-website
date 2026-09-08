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

// --- Users API ---
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/users', async (req, res) => {
  const { name, email, role_key } = req.body;
  const { data, error } = await supabase
    .from('users')
    .insert([{ name, email, role_key, status: 'active' }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// --- Curriculum API ---
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

app.delete('/api/curriculum/:id', async (req, res) => {
  const { error } = await supabase.from('disciplines').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- Batches API ---
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

app.listen(PORT, () => {
  console.log(`Nada Gurukulam API server running on port ${PORT}`);
});
