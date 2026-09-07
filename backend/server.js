const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', institution: 'Nada Gurukulam', timestamp: new Date().toISOString() });
});

// API Routes placeholder for the 13 modules
app.get('/api/modules', (req, res) => {
  res.json({
    modules: [
      'overview', 'users', 'curriculum', 'timetable', 'batches',
      'lessonplans', 'liveclasses', 'assignments', 'feedback',
      'events', 'jobs', 'enquiries', 'activities'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Nada Gurukulam API server running on port ${PORT}`);
});
