'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const inputStyle = { padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px', marginBottom: '12px' };
const btn = { background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' };

const RESOURCE_TYPES = ['video', 'audio', 'pdf', 'notation', 'image', 'external_link', 'downloadable'];
const ACTIVITY_TYPES = ['assignment', 'quiz', 'discussion', 'practice_submission', 'reflection', 'project'];
const RELATIONSHIP_TYPES = ['guru', 'academic_mentor', 'course_faculty', 'hostel_mentor', 'advisor'];

function StatusBadge({ value }) {
  if (!value) return null;
  return <span style={{ fontSize: '11px', textTransform: 'capitalize', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>{value}</span>;
}

export default function LmsPage() {
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [activities, setActivities] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [notes, setNotes] = useState([]);
  const [people, setPeople] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  async function apiCall(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  }

  async function reload() {
    try {
      const [c, m, l, r, a, o, rel, n, p] = await Promise.all([
        apiCall('/api/courses'), apiCall('/api/course_modules'),
        apiCall('/api/lessons'), apiCall('/api/resources'),
        apiCall('/api/lesson_activities'), apiCall('/api/learning_outcomes'),
        apiCall('/api/student_relationships'), apiCall('/api/mentor_progress_notes'),
        apiCall('/api/users'),
      ]);
      setCourses(Array.isArray(c) ? c : []);
      setModules(Array.isArray(m) ? m : []);
      setLessons(Array.isArray(l) ? l : []);
      setResources(Array.isArray(r) ? r : []);
      setActivities(Array.isArray(a) ? a : []);
      setOutcomes(Array.isArray(o) ? o : []);
      setRelationships(Array.isArray(rel) ? rel : []);
      setNotes(Array.isArray(n) ? n : []);
      setPeople(Array.isArray(p) ? p : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function submit(path, payload, method = 'POST') {
    setError(''); setMessage('');
    try {
      await apiCall(path, { method, body: JSON.stringify(payload) });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  function addCourseModule(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    submit('/api/course_modules', {
      course_id: courseId, module_number: f.get('module_number'),
      title: f.get('title'), visibility: f.get('visibility') || 'private',
      status: f.get('status') || 'draft',
    }).then(() => e.target.reset());
  }

  function addLesson(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    submit('/api/lessons', {
      module_id: moduleId, lesson_number: f.get('lesson_number'),
      title: f.get('title'), visibility: f.get('visibility') || 'private',
      status: f.get('status') || 'draft',
    }).then(() => e.target.reset());
  }

  function addResource(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    submit('/api/resources', {
      lesson_id: lessonId, title: f.get('title'),
      type: f.get('type'), url: f.get('url'),
    }).then(() => e.target.reset());
  }

  function addActivity(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    submit('/api/lesson_activities', {
      lesson_id: lessonId, title: f.get('title'), type: f.get('type'),
    }).then(() => e.target.reset());
  }

  function addOutcome(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    submit('/api/learning_outcomes', {
      course_id: courseId, code: f.get('code'), statement: f.get('statement'),
      bloom_level: f.get('bloom_level') || null,
    }).then(() => e.target.reset());
  }

  function addRelationship(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    submit('/api/student_relationships', {
      student_id: f.get('student_id'), mentor_id: f.get('mentor_id'),
      relationship_type: f.get('relationship_type'), scope: f.get('scope'),
    }).then(() => e.target.reset());
  }

  if (loading) return <div style={{ padding: '20px' }}>Loading…</div>;

  const courseModules = modules.filter(m => m.course_id === courseId).sort((a, b) => (a.module_number || 0) - (b.module_number || 0));
  const moduleLessons = lessons.filter(l => l.module_id === moduleId).sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0));
  const lessonResources = resources.filter(r => r.lesson_id === lessonId);
  const lessonActivities = activities.filter(a => a.lesson_id === lessonId);
  const courseOutcomes = outcomes.filter(o => o.course_id === courseId);

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ color: 'var(--primary)', marginBottom: '6px' }}>Learning Management</h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '18px' }}>
        Course → Module → Lesson → Learning Resources and Activities
      </p>

      {error && <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', color: '#8b1f1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
      {message && <div style={{ background: '#eaf7ea', border: '1px solid #a0d0a0', color: '#1f6b1f', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>{message}</div>}

      <div style={{ ...cardStyle, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={courseId} onChange={e => { setCourseId(e.target.value); setModuleId(''); setLessonId(''); }} style={inputStyle}>
          <option value="">Select Course...</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
        </select>
        <select value={moduleId} disabled={!courseId} onChange={e => { setModuleId(e.target.value); setLessonId(''); }} style={inputStyle}>
          <option value="">Select Module...</option>
          {courseModules.map(m => <option key={m.id} value={m.id}>{m.module_number}. {m.title}</option>)}
        </select>
        <select value={lessonId} disabled={!moduleId} onChange={e => setLessonId(e.target.value)} style={inputStyle}>
          <option value="">Select Lesson...</option>
          {moduleLessons.map(l => <option key={l.id} value={l.id}>{l.lesson_number}. {l.title}</option>)}
        </select>
      </div>

      {courseId && (
        <form onSubmit={addCourseModule} style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', fontSize: '15px', marginBottom: '12px' }}>Modules in this course ({courseModules.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            <input name="module_number" type="number" placeholder="No." required style={inputStyle} />
            <input name="title" placeholder="Module title" required style={{ ...inputStyle, flex: '1 1 220px' }} />
            <select name="visibility" style={inputStyle}>
              <option value="private">Private</option><option value="internal">Internal</option><option value="public">Public</option>
            </select>
            <select name="status" style={inputStyle}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
            <button type="submit" style={btn}>Add Module</button>
          </div>
          {courseModules.map(m => (
            <div key={m.id} style={{ ...cardStyle, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '14px' }}>{m.module_number}. {m.title}</strong>
                <span style={{ marginLeft: '8px' }}><StatusBadge value={m.status} /></span>
                <span style={{ marginLeft: '6px' }}><StatusBadge value={m.visibility} /></span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>v{m.version || 1}</span>
            </div>
          ))}
          {courseModules.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No modules yet.</p>}
        </form>
      )}

      {moduleId && (
        <form onSubmit={addLesson} style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', fontSize: '15px', marginBottom: '12px' }}>Lessons in this module ({moduleLessons.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            <input name="lesson_number" type="number" placeholder="No." required style={inputStyle} />
            <input name="title" placeholder="Lesson title" required style={{ ...inputStyle, flex: '1 1 220px' }} />
            <select name="visibility" style={inputStyle}>
              <option value="private">Private</option><option value="internal">Internal</option><option value="public">Public</option>
            </select>
            <select name="status" style={inputStyle}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
            <button type="submit" style={btn}>Add Lesson</button>
          </div>
          {moduleLessons.map(l => (
            <div key={l.id} style={{ ...cardStyle, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '14px' }}>{l.lesson_number}. {l.title}</strong>
                <span style={{ marginLeft: '8px' }}><StatusBadge value={l.status} /></span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                {resources.filter(r => r.lesson_id === l.id).length} resources · {activities.filter(a => a.lesson_id === l.id).length} activities
              </span>
            </div>
          ))}
          {moduleLessons.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No lessons yet.</p>}
        </form>
      )}

      {lessonId && (
        <>
          <form onSubmit={addResource} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', fontSize: '15px', marginBottom: '12px' }}>Learning Resources ({lessonResources.length})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              <input name="title" placeholder="Resource title" required style={{ ...inputStyle, flex: '1 1 180px' }} />
              <select name="type" style={inputStyle} required>
                {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
              <input name="url" type="url" placeholder="https://..." required style={{ ...inputStyle, flex: '1 1 180px' }} />
              <button type="submit" style={btn}>Add Resource</button>
            </div>
            {lessonResources.map(r => (
              <div key={r.id} style={{ ...cardStyle, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: '13px' }}>{r.title}</strong>
                  <span style={{ marginLeft: '8px' }}><StatusBadge value={r.type.replace('_', ' ')} /></span>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</div>
                </div>
                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>Open</a>
              </div>
            ))}
            {lessonResources.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No resources attached.</p>}
          </form>

          <form onSubmit={addActivity} style={cardStyle}>
            <h3 style={{ color: 'var(--primary)', fontSize: '15px', marginBottom: '12px' }}>Learning Activities ({lessonActivities.length})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              <input name="title" placeholder="Activity title" required style={{ ...inputStyle, flex: '1 1 180px' }} />
              <select name="type" style={inputStyle} required>
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
              <button type="submit" style={btn}>Add Activity</button>
            </div>
            {lessonActivities.map(a => (
              <div key={a.id} style={{ ...cardStyle, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '13px' }}>{a.title}</strong>
                  <span style={{ marginLeft: '8px' }}><StatusBadge value={a.type.replace('_', ' ')} /></span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}><StatusBadge value={a.status} /></span>
              </div>
            ))}
            {lessonActivities.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No activities attached.</p>}
          </form>
        </>
      )}

      {courseId && (
        <form onSubmit={addOutcome} style={cardStyle}>
          <h3 style={{ color: 'var(--primary)', fontSize: '15px', marginBottom: '12px' }}>Learning Outcomes ({courseOutcomes.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            <input name="code" placeholder="CO1" required style={inputStyle} />
            <input name="statement" placeholder="Outcome statement" required style={{ ...inputStyle, flex: '1 1 240px' }} />
            <input name="bloom_level" placeholder="Bloom level" style={inputStyle} />
            <button type="submit" style={btn}>Add Outcome</button>
          </div>
          {courseOutcomes.map(o => (
            <div key={o.id} style={{ ...cardStyle, marginBottom: '6px' }}>
              <strong style={{ fontSize: '13px' }}>{o.code}</strong>
              <span style={{ marginLeft: '8px', fontSize: '13px' }}>{o.statement}</span>
              {o.bloom_level && <span style={{ marginLeft: '8px' }}><StatusBadge value={o.bloom_level} /></span>}
            </div>
          ))}
          {courseOutcomes.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No outcomes defined.</p>}
        </form>
      )}

      <form onSubmit={addRelationship} style={cardStyle}>
        <h3 style={{ color: 'var(--primary)', fontSize: '15px', marginBottom: '12px' }}>Guru, Mentor &amp; Advisor Relationships ({relationships.length})</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          <select name="student_id" style={inputStyle} required>
            <option value="">Select Student...</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="mentor_id" style={inputStyle} required>
            <option value="">Select Mentor...</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="relationship_type" style={inputStyle}>
            {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <select name="scope" style={inputStyle}>
            <option value="institutional">Institutional</option>
            <option value="campus">Campus</option>
            <option value="department">Department</option>
            <option value="course">Course</option>
            <option value="assigned">Assigned</option>
          </select>
          <button type="submit" style={btn}>Assign Mentor</button>
        </div>
        {relationships.map(r => {
          const student = people.find(p => p.id === r.student_id);
          const mentor = people.find(p => p.id === r.mentor_id);
          const relNotes = notes.filter(n => n.relationship_id === r.id);
          return (
            <div key={r.id} style={{ ...cardStyle, marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <div>
                  <strong>{student?.name || '—'}</strong>
                  <span style={{ color: 'var(--text-faint)' }}> → </span>
                  <strong>{mentor?.name || '—'}</strong>
                  <span style={{ marginLeft: '8px' }}><StatusBadge value={r.relationship_type.replace('_', ' ')} /></span>
                  <span style={{ marginLeft: '6px' }}><StatusBadge value={r.status} /></span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{relNotes.length} notes</span>
              </div>
              {relNotes.map(n => (
                <div key={n.id} style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text)' }}>{n.title}</strong>{n.is_confidential ? ' (confidential)' : ''}
                  <div>{n.content}</div>
                </div>
              ))}
            </div>
          );
        })}
        {relationships.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No mentoring relationships recorded.</p>}
      </form>
    </div>
  );
}