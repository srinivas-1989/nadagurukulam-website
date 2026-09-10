'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  // Roles are data (the `roles` table, seeded by the Phase 4 schema) — the picker renders the API's response.

  // Modules are the app's own screens — structural, this code implements them.
  // WHO can do WHAT in each module is data: the role_permissions table, edited in Roles & Permissions.
  const MODULES = [
    { key: 'overview', name: 'Overview', desc: 'Dashboard tiles across every module.' },
    { key: 'users', name: 'Users', desc: 'Every account — created and permissioned here.' },
    { key: 'curriculum', name: 'Curriculum & Syllabus', desc: 'Disciplines, course types, courses, and modules.' },
    { key: 'timetable', name: 'Timetable & Schedules', desc: 'When and where every class happens.' },
    { key: 'batches', name: 'Batches', desc: 'Cohorts — roster, capacity, faculty mapping.' },
    { key: 'lessonplans', name: 'Lesson Plans', desc: 'Draft → submit → Admin approves.' },
    { key: 'liveclasses', name: 'Live Classes', desc: 'Jitsi-based sessions, recordings, attendance.' },
    { key: 'assignments', name: 'Assignments', desc: 'Set, submit, grade — including audio/video.' },
    { key: 'feedback', name: 'Feedback', desc: 'Structured two-way feedback cycles.' },
    { key: 'events', name: 'Events', desc: 'Staff drafts, Admin publishes to public site.' },
    { key: 'jobs', name: 'Jobs', desc: 'Faculty & Staff postings, applicant tracking.' },
    { key: 'enquiries', name: 'Enquiries', desc: 'Admissions & general enquiries inbox.' },
    { key: 'activities', name: 'Activities', desc: 'Competitions, performances, achievements.' },
    { key: 'roles', name: 'Roles & Permissions', desc: 'Create roles and set what each can do in every module.' }
  ];

  const [view, setView] = useState('public'); // public | login | admin
  const [role, setRole] = useState(null);
  const [activeModule, setActiveModule] = useState('overview');

  // Auth state (from Supabase Auth)
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const resolveRole = (uid) =>
    supabase.from('users').select('role_key').eq('auth_user_id', uid).single();

  // Load initial session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        resolveRole(s.user.id).then(({ data }) => {
          if (data) setRole(data.role_key);
          setView('admin');
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) {
        resolveRole(sess.user.id).then(({ data }) => {
          if (data) setRole(data.role_key);
          setView('admin');
        });
      } else {
        setRole(null);
        setView('public');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Logout function
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // API Data State
  const [dbData, setDbData] = useState({
    users: [], curriculum: [], batches: [], timetable: [],
    events: [], enquiries: [], jobs: [], courses: [], course_modules: [], course_types: [],
    live_sessions: [], assignments: [], feedback: [], activities: [], role_permissions: []
  });
  const [roles, setRoles] = useState([]);

  // Auth helper functions
  const apiCall = async (url, options = {}) => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (sess?.access_token) {
      headers.Authorization = `Bearer ${sess.access_token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      setSession(null);
      setRole(null);
      setView('login');
    }
    return res;
  };

  // Permission matrix as data (role_permissions table): permsMap[role_key][module_key] = { id, level }.
  const LEVELS = ['View', 'Self', 'Submits', 'Own', 'Manage', 'Full'];
  const permsMap = {};
  dbData.role_permissions.forEach(p => { (permsMap[p.role_key] = permsMap[p.role_key] || {})[p.module_key] = { id: p.id, level: p.access_level }; });
  const perm = (m) => (role && permsMap[role]?.[m]?.level) || null;
  const canCreate = (m) => ['Submits', 'Own', 'Manage', 'Full'].includes(perm(m));
  const canAdmin = (m) => ['Manage', 'Full'].includes(perm(m));
  const isFull = (m) => perm(m) === 'Full';

  const [editing, setEditing] = useState(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

  // Public-site copy is data too: a cms/home block in MongoDB, edited inline by Super Admin.
  // The fallback below only covers a cold start (before the block is saved) — the DB is the source of truth.
  const CMS_FALLBACK = {
    heroHeading: 'Nurturing Talent, Inspiring Excellence',
    heroTagline: 'One World, One Family',
    heroLede: "Nada Gurukulam blends India's timeless classical performing arts traditions with contemporary academic management under Sadguru Sri Madhusudan Sai. 100% free of cost.",
    disciplinesHeading: 'Disciplines Taught',
    disciplinesSub: 'Offered completely free of charge, funded entirely by donations.',
  };
  const [cmsHome, setCmsHome] = useState(null);
  const [cmsEditing, setCmsEditing] = useState(false);
  const [cmsForm, setCmsForm] = useState(CMS_FALLBACK);
  const cms = { ...CMS_FALLBACK, ...(cmsHome || {}) };

  const loadCms = () => fetch(`${apiUrl}/api/cms/home`).then(r => r.json()).then(d => setCmsHome(d.content)).catch(() => {});

  const handleSaveCms = async () => {
    const res = await apiCall(`${apiUrl}/api/cms/home`, {
      method: 'PUT',
      body: JSON.stringify(cmsForm)
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Save failed'); return; }
    setCmsEditing(false); loadCms();
  };

  const fetchData = async () => {
    try {
      // [api endpoint, state key] — the API route and the state key differ for live classes.
      const endpoints = [
        ['users', 'users'], ['curriculum', 'curriculum'], ['batches', 'batches'], ['timetable', 'timetable'],
        ['events', 'events'], ['enquiries', 'enquiries'], ['jobs', 'jobs'], ['courses', 'courses'],
        ['course_modules', 'course_modules'], ['course_types', 'course_types'], ['liveclasses', 'live_sessions'],
        ['assignments', 'assignments'], ['feedback', 'feedback'], ['activities', 'activities'],
        ['role_permissions', 'role_permissions']
      ];
      const results = await Promise.all(endpoints.map(([ep]) =>
        apiCall(`${apiUrl}/api/${ep}`).then(r => r.json()).catch(() => [])
      ));
      const mapped = {};
      endpoints.forEach(([ep, key], idx) => { mapped[key] = Array.isArray(results[idx]) ? results[idx] : []; });
      setDbData(mapped);
      apiCall(`${apiUrl}/api/roles`).then(r => r.json()).then(setRoles).catch(() => {});
    } catch (err) { console.error('Fetch error:', err); }
  };

  // Public content (CMS) is unauthenticated; admin data requires a session.
  useEffect(() => { loadCms(); }, []);

  useEffect(() => {
    if (view === 'admin' && session) fetchData();
  }, [view, activeModule, session]);

  useEffect(() => {
    if (!session) return;
    fetchData();
  }, [session]);

  // If the selected course type was deleted, fall back to the first available type.
  useEffect(() => {
    if (dbData.course_types.length && !dbData.course_types.some(t => t.name === courseType)) {
      setCourseType(dbData.course_types[0].name);
    }
  }, [dbData.course_types]);

  const handleDelete = async (endpoint, id) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    const res = await apiCall(`${apiUrl}/api/${endpoint}/${id}`, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Delete failed'); return; }
    fetchData();
  };

  const handleSave = async (endpoint, id, payload) => {
    await apiCall(`${apiUrl}/api/${endpoint}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    setEditing(null);
    fetchData();
  };

  // Form states
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('teacher');

  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscLevels, setNewDiscLevels] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');

  // Course form (MPA Syllabus format)
  const [courseDisc, setCourseDisc] = useState('');
  const [courseType, setCourseType] = useState('Masters');
  const [courseSem, setCourseSem] = useState('Semester I');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseCredits, setCourseCredits] = useState(6);
  const [courseHours, setCourseHours] = useState(90);

  // Semester list derives from the selected course type's data (semester_count) — not from code.
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const activeCourseType = dbData.course_types.find(t => t.name === courseType);
  const courseSemesters = Array.from({ length: activeCourseType?.semester_count || 4 }, (_, i) => `Semester ${ROMAN[i]}`);

  // Live session form state
  const [newSessionBatch, setNewSessionBatch] = useState('');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('');
  const [newSessionTime, setNewSessionTime] = useState('');

  const handleAddLiveSession = async (e) => {
    e.preventDefault();
    if (!newSessionBatch || !newSessionTitle || !newSessionDate) return;
    const roomName = `NADA-${newSessionTitle.replace(/\s+/g, '-').toUpperCase()}-${newSessionDate}`;
    const roomLink = `https://meet.jit.si/${roomName}`;
    await apiCall(`${apiUrl}/api/liveclasses`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: newSessionBatch, title: newSessionTitle, room_name: roomName, room_link: roomLink, session_date: newSessionDate, status: 'scheduled' })
    });
    setNewSessionBatch(''); setNewSessionTitle(''); setNewSessionDate(''); setNewSessionTime(''); fetchData();
  };

  const handleJoinSession = (roomLink) => {
    window.open(roomLink, '_blank');
  };

  // Assignment form state
  const [newAssignBatch, setNewAssignBatch] = useState('');
  const [newAssignTitle, setNewAssignTitle] = useState('');
  const [newAssignType, setNewAssignType] = useState('audio_video');
  const [newAssignDue, setNewAssignDue] = useState('');
  const [newAssignDesc, setNewAssignDesc] = useState('');

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignBatch || !newAssignTitle || !newAssignDue) return;
    await apiCall(`${apiUrl}/api/assignments`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: newAssignBatch, title: newAssignTitle, type: newAssignType, due_date: newAssignDue, description: newAssignDesc, status: 'open' })
    });
    setNewAssignBatch(''); setNewAssignTitle(''); setNewAssignType('audio_video'); setNewAssignDue(''); setNewAssignDesc(''); fetchData();
  };

  const handleUpdateAssignmentStatus = async (id, status) => {
    await apiCall(`${apiUrl}/api/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    fetchData();
  };

  // Feedback form state
  const [newFeedbackBatch, setNewFeedbackBatch] = useState('');
  const [newFeedbackType, setNewFeedbackType] = useState('faculty_to_student');
  const [newFeedbackAuthor, setNewFeedbackAuthor] = useState('');
  const [newFeedbackComment, setNewFeedbackComment] = useState('');

  const handleAddFeedback = async (e) => {
    e.preventDefault();
    if (!newFeedbackBatch || !newFeedbackAuthor || !newFeedbackComment) return;
    await apiCall(`${apiUrl}/api/feedback`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: newFeedbackBatch, recipient: newFeedbackAuthor, author: 'current_user', comment: newFeedbackComment, type: newFeedbackType })
    });
    setNewFeedbackBatch(''); setNewFeedbackAuthor(''); setNewFeedbackType('faculty_to_student'); setNewFeedbackComment(''); fetchData();
  };

  // Jobs form state (Staff draft → Admin/Super Admin publishes)
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDept, setNewJobDept] = useState('');
  const [newJobType, setNewJobType] = useState('Full-time');
  const [newJobDesc, setNewJobDesc] = useState('');
  const [newJobStatus, setNewJobStatus] = useState('draft');

  const handleAddJob = async (e) => {
    e.preventDefault();
    if (!newJobTitle || !newJobDept) return;
    await apiCall(`${apiUrl}/api/jobs`, {
      method: 'POST',
      body: JSON.stringify({ title: newJobTitle, department: newJobDept, type: newJobType, description: newJobDesc, status: newJobStatus })
    });
    setNewJobTitle(''); setNewJobDept(''); setNewJobType('Full-time'); setNewJobDesc(''); setNewJobStatus('draft'); fetchData();
  };

  const handleUpdateJobStatus = async (id, status) => {
    await apiCall(`${apiUrl}/api/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    fetchData();
  };

  // Activities form state (Staff Manage, Teacher/Guest Faculty Own, Student view)
  const [newActivityBatch, setNewActivityBatch] = useState('');
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityCategory, setNewActivityCategory] = useState('Performance');
  const [newActivityDate, setNewActivityDate] = useState('');
  const [newActivityDesc, setNewActivityDesc] = useState('');

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!newActivityBatch || !newActivityTitle || !newActivityDate) return;
    await apiCall(`${apiUrl}/api/activities`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: newActivityBatch, title: newActivityTitle, category: newActivityCategory, date: newActivityDate, description: newActivityDesc })
    });
    setNewActivityBatch(''); setNewActivityTitle(''); setNewActivityCategory('Performance'); setNewActivityDate(''); setNewActivityDesc(''); fetchData();
  };

  // Batches — cohorts: roster anchor for timetable, live classes, assignments, feedback.
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDisc, setNewBatchDisc] = useState('');
  const [newBatchLevel, setNewBatchLevel] = useState('');
  const [newBatchFaculty, setNewBatchFaculty] = useState('');
  const [newBatchCapacity, setNewBatchCapacity] = useState(20);

  const handleAddBatch = async (e) => {
    e.preventDefault();
    if (!newBatchName || !newBatchDisc || !newBatchLevel) return;
    await apiCall(`${apiUrl}/api/batches`, {
      method: 'POST',
      body: JSON.stringify({ name: newBatchName, discipline_id: newBatchDisc, level: newBatchLevel, faculty_id: newBatchFaculty || null, capacity: Number(newBatchCapacity) || 20, status: 'active' })
    });
    setNewBatchName(''); setNewBatchLevel(''); setNewBatchFaculty(''); setNewBatchCapacity(20); fetchData();
  };

  // Timetable — recurring weekly slots per batch, with conflict detection:
  // a new slot that overlaps an existing one for the same batch OR the same room asks first.
  const slotsOverlap = (a, b) => a.start < b.end && b.start < a.end;
  const [newSlotBatch, setNewSlotBatch] = useState('');
  const [newSlotDay, setNewSlotDay] = useState('Monday');
  const [newSlotStart, setNewSlotStart] = useState('');
  const [newSlotEnd, setNewSlotEnd] = useState('');
  const [newSlotRoom, setNewSlotRoom] = useState('');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const handleAddSlot = async (e) => {
    e.preventDefault();
    if (!newSlotBatch || !newSlotStart || !newSlotEnd || !newSlotRoom) return;
    const candidate = { batch_id: newSlotBatch, day_of_week: newSlotDay, start_time: newSlotStart, end_time: newSlotEnd, room: newSlotRoom };
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const clash = dbData.timetable.find(s =>
      s.day_of_week === candidate.day_of_week &&
      (s.batch_id === candidate.batch_id || s.room === candidate.room) &&
      slotsOverlap({ start: toMin(newSlotStart), end: toMin(newSlotEnd) }, { start: toMin(s.start_time), end: toMin(s.end_time) })
    );
    if (clash) {
      const batchName = dbData.batches.find(b => b.id === clash.batch_id)?.name || 'a batch';
      const ok = confirm(`Conflicts with an existing slot (${clash.day_of_week} ${clash.start_time}–${clash.end_time}, ${batchName === dbData.batches.find(b => b.id === candidate.batch_id)?.name ? 'same batch' : 'room ' + clash.room}). Add anyway?`);
      if (!ok) return;
    }
    const slotRes = await apiCall(`${apiUrl}/api/timetable`, {
      method: 'POST',
      body: JSON.stringify(candidate)
    });
    if (!slotRes.ok) { const e = await slotRes.json().catch(() => ({})); alert(e.error || 'Failed to add slot'); return; }
    setNewSlotStart(''); setNewSlotEnd(''); setNewSlotRoom(''); fetchData();
  };

  // Lesson plans — draft → submitted → approved / needs_revision (Admin approves or returns).
  const [newPlanBatch, setNewPlanBatch] = useState('');
  const [newPlanSubject, setNewPlanSubject] = useState('');
  const [newPlanDate, setNewPlanDate] = useState('');
  const [newPlanObjectives, setNewPlanObjectives] = useState('');

  const handleAddLessonPlan = async (e) => {
    e.preventDefault();
    if (!newPlanBatch || !newPlanSubject || !newPlanDate) return;
    await apiCall(`${apiUrl}/api/lessonplans`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: newPlanBatch, subject: newPlanSubject, session_date: newPlanDate, objectives: newPlanObjectives, status: 'draft' })
    });
    setNewPlanSubject(''); setNewPlanDate(''); setNewPlanObjectives(''); fetchData();
  };

  const handlePlanTransition = async (id, status, review_comments) => {
    if (review_comments === undefined) {
      const note = prompt(status === 'needs_revision' ? 'What needs revision?' : 'Reviewer note (optional)') || '';
      review_comments = note;
    }
    const r = await apiCall(`${apiUrl}/api/lessonplans/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, review_comments: review_comments || null })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Transition failed'); return; }
    fetchData();
  };

  // Events — Staff/Admin draft; only Admin/Super Admin (canAdmin) publishes to the public site.
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!newEventTitle || !newEventDate || !newEventVenue) return;
    await apiCall(`${apiUrl}/api/events`, {
      method: 'POST',
      body: JSON.stringify({ title: newEventTitle, date: newEventDate, venue: newEventVenue, description: newEventDesc, status: 'draft' })
    });
    setNewEventTitle(''); setNewEventDate(''); setNewEventVenue(''); setNewEventDesc(''); fetchData();
  };

  const handleEventTransition = async (id, status) => {
    const r = await apiCall(`${apiUrl}/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Transition failed'); return; }
    fetchData();
  };

  // Enquiries — the public forms land here; staff move them new → contacted → converted/closed.
  const [newEnqName, setNewEnqName] = useState('');
  const [newEnqContact, setNewEnqContact] = useState('');
  const [newEnqType, setNewEnqType] = useState('admission');
  const [newEnqMessage, setNewEnqMessage] = useState('');

  const handleAddEnquiry = async (e) => {
    e.preventDefault();
    if (!newEnqName || !newEnqContact) return;
    await apiCall(`${apiUrl}/api/enquiries`, {
      method: 'POST',
      body: JSON.stringify({ name: newEnqName, contact: newEnqContact, type: newEnqType, message: newEnqMessage, status: 'new' })
    });
    setNewEnqName(''); setNewEnqContact(''); setNewEnqMessage(''); fetchData();
  };

  // Roles & Permissions — Super Admin is the one fixed role; everything else is data.
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [openRole, setOpenRole] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');

  const handleAddRole = async (e) => {
    e.preventDefault();
    const key = newRoleName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) return;
    await apiCall(`${apiUrl}/api/roles`, {
      method: 'POST',
      body: JSON.stringify({ key, name: newRoleName, description: newRoleDesc })
    });
    setNewRoleName(''); setNewRoleDesc(''); fetchData();
  };

  const handleUpdateRole = async (id) => {
    await apiCall(`${apiUrl}/api/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: editRoleName, description: editRoleDesc })
    });
    setEditingRole(null); fetchData();
  };

  const handleDeleteRole = async (r) => {
    if (!confirm(`Delete role "${r.name}"? Users holding it must be reassigned first.`)) return;
    const res = await apiCall(`${apiUrl}/api/roles/${r.id}`, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Delete failed'); }
    fetchData();
  };

  const handlePermChange = async (roleKey, moduleKey, level) => {
    const row = permsMap[roleKey]?.[moduleKey];
    if (level === '—') {
      if (row) await apiCall(`${apiUrl}/api/role_permissions/${row.id}`, { method: 'DELETE' });
    } else if (row) {
      await apiCall(`${apiUrl}/api/role_permissions/${row.id}`, {
        method: 'PUT', body: JSON.stringify({ access_level: level })
      });
    } else {
      await apiCall(`${apiUrl}/api/role_permissions`, {
        method: 'POST',
        body: JSON.stringify({ role_key: roleKey, module_key: moduleKey, access_level: level })
      });
    }
    fetchData();
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    await apiCall(`${apiUrl}/api/users`, {
      method: 'POST',
      body: JSON.stringify({ name: newName, email: newEmail, role_key: newUserRole })
    });
    setNewName(''); setNewEmail(''); fetchData();
  };

  const handleAddDiscipline = async (e) => {
    e.preventDefault();
    if (!newDiscName) return;
    await apiCall(`${apiUrl}/api/curriculum`, {
      method: 'POST',
      body: JSON.stringify({ name: newDiscName, levels: newDiscLevels, description: newDiscDesc })
    });
    setNewDiscName(''); setNewDiscLevels(''); setNewDiscDesc(''); fetchData();
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!courseName || !courseCode) return;
    await apiCall(`${apiUrl}/api/courses`, {
      method: 'POST',
      body: JSON.stringify({ discipline_id: courseDisc || dbData.curriculum[0]?.id, course_type: courseType, semester: courseSem, code: courseCode, name: courseName, credits: courseCredits, teaching_hours: courseHours })
    });
    setCourseCode(''); setCourseName(''); fetchData();
  };

  // Course types are data — Super Admin/Admin add, edit (rename / change semester count) and delete them.
  const [newCourseTypeName, setNewCourseTypeName] = useState('');
  const [newCourseTypeSemesters, setNewCourseTypeSemesters] = useState(4);
  const [editingCourseType, setEditingCourseType] = useState(null);
  const [ctEditName, setCtEditName] = useState('');
  const [ctEditSems, setCtEditSems] = useState(4);

  const handleAddCourseType = async () => {
    if (!newCourseTypeName) return;
    await apiCall(`${apiUrl}/api/course_types`, {
      method: 'POST',
      body: JSON.stringify({ name: newCourseTypeName, semester_count: Number(newCourseTypeSemesters) || 4 })
    });
    setNewCourseTypeName(''); setNewCourseTypeSemesters(4); fetchData();
  };

  const handleUpdateCourseType = async (t, payload) => {
    await apiCall(`${apiUrl}/api/course_types/${t.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (payload.name && payload.name !== t.name) {
      const affected = dbData.courses.filter(c => c.course_type === t.name);
      await Promise.all(affected.map(c => apiCall(`${apiUrl}/api/courses/${c.id}`, {
        method: 'PUT', body: JSON.stringify({ course_type: payload.name })
      })));
    }
    setEditingCourseType(null); fetchData();
  };

  const currentModules = role ? MODULES.filter(m => perm(m.key)) : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <header style={{ background: 'var(--primary)', color: '#fff', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setView('public')} title="Nada Gurukulam — home">
          <img src="/logo-landscape.png" alt="Nada Gurukulam" style={{ height: '46px', width: 'auto', background: 'var(--bg)', padding: '6px 12px', borderRadius: 'var(--radius-xl-sm)', display: 'block' }} />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {role && (
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '5px 14px', borderRadius: '99px', fontSize: '13px' }}>
              Role: <b>{roles.find(r => r.key === role)?.name || role}</b>
            </span>
          )}
          {view !== 'public' && (
            <button onClick={() => setView('public')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Public Site
            </button>
          )}
          {!role ? (
            <button onClick={() => setView('login')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
              Sign In
            </button>
          ) : (
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Log out
            </button>
          )}
        </div>
      </header>

      {/* VIEW 1: PUBLIC HOMEPAGE */}
      {view === 'public' && (
        <div style={{ flex: 1 }}>
          <section style={{ background: 'var(--bg-saffron)', padding: '64px 8vw 72px', position: 'relative', overflow: 'hidden' }}>
            {/* NDG brand elements: corner quarter-circles, Nataraja watermark (10–15% opacity) */}
            <div className="ndg-corner" style={{ top: '-140px', right: '-140px', width: '340px', height: '340px', borderRadius: '50%', background: 'var(--primary)' }} />
            <div className="ndg-corner" style={{ bottom: '-170px', left: '-170px', width: '400px', height: '400px', borderRadius: '50%', background: 'var(--accent)', opacity: 0.35 }} />
            <img className="ndg-watermark" src="/logo-mark.png" alt="" style={{ bottom: '-60px', right: '3vw', width: '380px', height: 'auto', opacity: 0.1 }} />
            {role === 'super_admin' && !cmsEditing && (
              <button onClick={() => { setCmsForm(cms); setCmsEditing(true); }} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.7)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '6px 14px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, zIndex: 2 }}>
                ✏️ Edit homepage copy
              </button>
            )}
            {cmsEditing ? (
              <div style={{ position: 'relative', background: 'var(--surface)', padding: '18px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input value={cmsForm.heroHeading} onChange={e => setCmsForm({ ...cmsForm, heroHeading: e.target.value })} placeholder="Hero heading" style={{ padding: '8px', border: '1px solid var(--border)', fontSize: '18px', fontWeight: 600 }} />
                <input value={cmsForm.heroTagline} onChange={e => setCmsForm({ ...cmsForm, heroTagline: e.target.value })} placeholder="Tagline (script)" className="font-script" style={{ padding: '8px', border: '1px solid var(--border)', fontSize: '18px' }} />
                <textarea value={cmsForm.heroLede} onChange={e => setCmsForm({ ...cmsForm, heroLede: e.target.value })} placeholder="Lede paragraph" rows={3} style={{ padding: '8px', border: '1px solid var(--border)' }} />
                <input value={cmsForm.disciplinesHeading} onChange={e => setCmsForm({ ...cmsForm, disciplinesHeading: e.target.value })} placeholder="Disciplines section heading" style={{ padding: '8px', border: '1px solid var(--border)' }} />
                <input value={cmsForm.disciplinesSub} onChange={e => setCmsForm({ ...cmsForm, disciplinesSub: e.target.value })} placeholder="Disciplines section subline" style={{ padding: '8px', border: '1px solid var(--border)' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleSaveCms} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-xl-sm)', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setCmsEditing(false)} style={{ background: 'none', border: '1px solid var(--border)', padding: '8px 18px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--primary-deep)', maxWidth: '18ch', margin: 0, position: 'relative' }}>
                  {cms.heroHeading}
                </h1>
                <div className="font-script" style={{ color: 'var(--accent-deep)', fontSize: '26px', marginTop: '10px', position: 'relative' }}>
                  {cms.heroTagline}
                </div>
                <p style={{ maxWidth: '60ch', color: 'var(--text-soft)', marginTop: '20px', fontSize: '16.5px', lineHeight: 1.65, position: 'relative' }}>
                  {cms.heroLede}
                </p>
              </>
            )}
            <div style={{ marginTop: '30px', position: 'relative' }}>
              <button onClick={() => setView('login')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '12px 28px', fontWeight: 600, cursor: 'pointer', fontSize: '15px', borderRadius: 'var(--radius-xl-sm)' }}>
                Access Academic Portal
              </button>
            </div>
          </section>
          <div className="ndg-om-divider font-devanagari" style={{ fontSize: '24px', marginTop: '36px' }}>ॐ</div>

          <main style={{ maxWidth: '1080px', margin: '40px auto', padding: '0 24px' }}>
            <h3 style={{ fontSize: '22px', color: 'var(--primary-deep)', marginBottom: '8px' }}>{cms.disciplinesHeading}</h3>
            <p style={{ color: 'var(--text-soft)', marginBottom: '24px' }}>{cms.disciplinesSub}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {dbData.curriculum.length === 0 && <p style={{ color: 'var(--text-faint)', gridColumn: '1 / -1' }}>Disciplines will appear here as they&apos;re added in the portal (Curricula module).</p>}
              {dbData.curriculum.map(art => (
                <div key={art.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
                  <h4 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>{art.name}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>{art.description || art.levels || '—'}</p>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}

      {/* VIEW 2: LOGIN / AUTH */}
      {view === 'login' && !session && (
        <div style={{ maxWidth: '720px', margin: '60px auto', padding: '0 24px', flex: 1 }}>
          <h2 style={{ fontSize: '28px', color: 'var(--primary-deep)', textAlign: 'center', marginBottom: '8px' }}>Sign in to Portal</h2>
          <p style={{ color: 'var(--text-soft)', textAlign: 'center', marginBottom: '32px' }}>
            Use your Supabase Auth credentials to access the portal.
          </p>
          {authLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
          ) : (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setAuthLoading(true);
              try {
                const { data, error } = await supabase.auth.signInWithPassword({
                  email,
                  password
                });
                if (error) {
                  alert(error.message);
                }
                setEmail('');
                setPassword('');
              } catch (err) {
                alert('Login failed');
              } finally {
                setAuthLoading(false);
              }
            }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '16px' }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '16px' }}
              />
              <button
                type="submit"
                style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 'var(--radius-xl-sm)', fontWeight: 600, cursor: 'pointer', fontSize: '16px' }}
              >
                Sign In
              </button>
            </form>
          )}
          <button onClick={() => setView('public')} style={{ display: 'block', margin: '40px auto 0', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}>
            ← Back to public site
          </button>
        </div>
      )}

      {/* VIEW 3: ADMIN PORTAL SHELL */}
      {view === 'admin' && role && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: '75vh' }}>
          {/* Sidebar */}
          <nav style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '24px 12px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', padding: '0 12px 10px', letterSpacing: '0.05em' }}>
              Portal Modules
            </div>
            {currentModules.length === 0 && (
              <p style={{ fontSize: '12.5px', color: 'var(--text-faint)', padding: '0 12px', margin: 0 }}>
                No modules assigned to this role yet — set them in Roles &amp; Permissions as Super Admin.
              </p>
            )}
            {currentModules.map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px', borderRadius: '6px', background: activeModule === m.key ? 'var(--primary)' : 'none', color: activeModule === m.key ? '#fff' : 'var(--text)', border: 'none', textAlign: 'left', fontWeight: activeModule === m.key ? 600 : 500, cursor: 'pointer', marginBottom: '2px', fontSize: '14px' }}>
                <span>{m.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 6px', borderRadius: '99px', background: activeModule === m.key ? 'rgba(255,255,255,0.25)' : 'var(--bg)', color: activeModule === m.key ? '#fff' : 'var(--text-faint)' }}>
                  {perm(m.key) || '—'}
                </span>
              </button>
            ))}
          </nav>

          {/* Main Content Area */}
          <main style={{ padding: '36px', maxWidth: '940px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '24px', color: 'var(--primary-deep)' }}>
                {MODULES.find(m => m.key === activeModule)?.name}
              </h2>
              <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>
                Access Level: <b>{perm(activeModule) || '—'}</b>
              </span>
            </div>

            {/* OVERVIEW */}
            {activeModule === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.users.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>System Users</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.curriculum.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Disciplines / Programs</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--primary)' }}>{dbData.courses.length}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Dynamic Courses &amp; Syllabi</div>
                </div>
              </div>
            )}

            {/* USERS MODULE */}
            {activeModule === 'users' && (
              <div>
                {canCreate('users') && (
                  <form onSubmit={handleAddUser} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                    <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                    </select>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add User</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Name</th><th style={{ padding: '12px' }}>Email</th><th style={{ padding: '12px' }}>Role</th><th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.users.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px' }}>{u.name}</td>
                          <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{u.email}</td>
                          <td style={{ padding: '12px', textTransform: 'capitalize' }}>{u.role_key}</td>
                          <td style={{ padding: '12px' }}>
                            {isFull('users') && <button onClick={() => handleDelete('users', u.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CURRICULUM & SYLLABUS MODULE (Dynamic MPA Format) */}
            {activeModule === 'curriculum' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>
                  Dynamic university syllabus structure (Programs, Semesters, and Courses matching the MPA format).
                </p>
                {canCreate('curriculum') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    {/* Add Discipline */}
                    <form onSubmit={handleAddDiscipline} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input placeholder="Program / Discipline (e.g. MPA Bharatanatyam)" value={newDiscName} onChange={e => setNewDiscName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 220px' }} required />
                      <input placeholder="Levels (e.g. 2 Years / 4 Semesters)" value={newDiscLevels} onChange={e => setNewDiscLevels(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                      <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Program</button>
                    </form>

                    {/* Add Course */}
                    <form onSubmit={handleAddCourse} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <select value={courseDisc} onChange={e => setCourseDisc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                        {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <select value={courseType} onChange={e => setCourseType(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                        {(dbData.course_types.length ? dbData.course_types : [{ name: 'Masters' }]).map(t => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <select value={courseSem} onChange={e => setCourseSem(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                        {courseSemesters.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input placeholder="Course Code (e.g. MBNP110)" value={courseCode} onChange={e => setCourseCode(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '130px' }} required />
                      <input placeholder="Course Name (e.g. Nritya Marga Purvanga-1)" value={courseName} onChange={e => setCourseName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                      <button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Course</button>
                    </form>

                    {/* Course types are data too — add, edit and delete freely. */}
                    <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input placeholder="New course type (e.g. Diploma)" value={newCourseTypeName} onChange={e => setNewCourseTypeName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                        <input type="number" min="1" max="12" title="How many semesters this program runs" value={newCourseTypeSemesters} onChange={e => setNewCourseTypeSemesters(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '110px' }} />
                        <button type="button" onClick={handleAddCourseType} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Type</button>
                      </div>
                      {dbData.course_types.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {dbData.course_types.map(t => (
                            editingCourseType === t.id ? (
                              <div key={t.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input value={ctEditName} onChange={e => setCtEditName(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', flex: '1 1 150px' }} />
                                <input type="number" min="1" max="12" title="Semesters" value={ctEditSems} onChange={e => setCtEditSems(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', width: '90px' }} />
                                <button type="button" onClick={() => handleUpdateCourseType(t, { name: ctEditName, semester_count: Number(ctEditSems) })} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Save</button>
                                <button type="button" onClick={() => setEditingCourseType(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Cancel</button>
                              </div>
                            ) : (
                              <div key={t.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <b style={{ minWidth: '150px' }}>{t.name}</b>
                                <span style={{ color: 'var(--text-soft)', fontSize: '13px' }}>{t.semester_count} semester{t.semester_count === 1 ? '' : 's'}</span>
                                <button type="button" onClick={() => { setEditingCourseType(t.id); setCtEditName(t.name); setCtEditSems(t.semester_count); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Edit</button>
                                <button type="button" title="Delete course type" onClick={() => handleDelete('course_types', t.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Delete</button>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Courses List */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Code &amp; Course Name</th><th style={{ padding: '12px' }}>Semester</th><th style={{ padding: '12px' }}>Credits</th><th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.courses.length === 0 ? (
                        <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No dynamic courses added yet.</td></tr>
                      ) : dbData.courses.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px' }}><b>{c.code}</b> — {c.name}</td>
                          <td style={{ padding: '12px' }}>{c.semester}</td>
                          <td style={{ padding: '12px' }}>{c.credits} Credits</td>
                          <td style={{ padding: '12px' }}>
                            <button onClick={() => handleDelete('courses', c.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LIVE CLASSES MODULE */}
            {activeModule === 'liveclasses' && (
              <div>
                {canCreate('liveclasses') && (
                  <form onSubmit={handleAddLiveSession} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <select value={newSessionBatch} onChange={e => setNewSessionBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input placeholder="Session Title (e.g. Week 5 Ragam)" value={newSessionTitle} onChange={e => setNewSessionTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <input type="date" value={newSessionDate} onChange={e => setNewSessionDate(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Schedule Session</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.live_sessions.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No sessions scheduled yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Session</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Room Link</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.live_sessions.map(s => {
                          const batch = dbData.batches.find(b => b.id === s.batch_id);
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px' }}>{s.title}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{s.session_date}</td>
                              <td style={{ padding: '12px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: s.status === 'live' ? 'var(--primary)' : s.status === 'ended' ? 'var(--text-faint)' : 'var(--accent)', color: s.status === 'live' ? '#fff' : '#fff' }}>{s.status}</span></td>
                              <td style={{ padding: '12px' }}>
                                {s.room_link && <button onClick={() => handleJoinSession(s.room_link)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Join Jitsi</button>}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {canAdmin('liveclasses') && <button onClick={() => handleDelete('liveclasses', s.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ASSIGNMENTS MODULE */}
            {activeModule === 'assignments' && (
              <div>
                {canCreate('assignments') && (
                  <form onSubmit={handleAddAssignment} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select value={newAssignBatch} onChange={e => setNewAssignBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input placeholder="Assignment Title (e.g. Week 3 Kritis)" value={newAssignTitle} onChange={e => setNewAssignTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <select value={newAssignType} onChange={e => setNewAssignType(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="audio_video">Audio/Video</option>
                      <option value="file">File Upload</option>
                      <option value="text">Text</option>
                    </select>
                    <input type="date" value={newAssignDue} onChange={e => setNewAssignDue(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                    <textarea placeholder="Description / Instructions" value={newAssignDesc} onChange={e => setNewAssignDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Create Assignment</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.assignments.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No assignments created yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Type</th><th style={{ padding: '12px' }}>Due Date</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.assignments.map(a => {
                          const batch = dbData.batches.find(b => b.id === a.batch_id);
                          return (
                            <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px' }}>{a.title}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{a.type?.replace('_', ' ') || '—'}</td>
                              <td style={{ padding: '12px' }}>{a.due_date}</td>
                              <td style={{ padding: '12px' }}>
                                {canCreate('assignments') ? (
                                  <select value={a.status || 'open'} onChange={e => handleUpdateAssignmentStatus(a.id, e.target.value)} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }}>
                                    <option value="open">Open</option>
                                    <option value="closed">Closed</option>
                                    <option value="graded">Graded</option>
                                  </select>
                                ) : <span style={{ fontSize: '12.5px', color: 'var(--text-soft)' }}>{a.status || 'open'}</span>}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {canAdmin('assignments') && <button onClick={() => handleDelete('assignments', a.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* FEEDBACK MODULE */}
            {activeModule === 'feedback' && (
              <div>
                {canCreate('feedback') && (
                  <form onSubmit={handleAddFeedback} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select value={newFeedbackBatch} onChange={e => setNewFeedbackBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select value={newFeedbackType} onChange={e => setNewFeedbackType(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="faculty_to_student">Faculty → Student</option>
                      <option value="student_to_faculty">Student → Faculty</option>
                      <option value="peer">Peer</option>
                    </select>
                    <input placeholder="Recipient (Student/Faculty Name)" value={newFeedbackAuthor} onChange={e => setNewFeedbackAuthor(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <textarea placeholder="Feedback Comment" value={newFeedbackComment} onChange={e => setNewFeedbackComment(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '80px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Submit Feedback</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.feedback.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No feedback entries yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Type</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Recipient</th><th style={{ padding: '12px' }}>Author</th><th style={{ padding: '12px' }}>Comment</th><th style={{ padding: '12px' }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.feedback.map(f => {
                          const batch = dbData.batches.find(b => b.id === f.batch_id);
                          return (
                            <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px' }}>{f.type?.replace('_', ' → ') || '—'}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{f.recipient}</td>
                              <td style={{ padding: '12px' }}>{f.author}</td>
                              <td style={{ padding: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.comment}</td>
                              <td style={{ padding: '12px' }}>{f.date || f.created_at?.split('T')[0]}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* JOBS MODULE (draft → publish workflow, per the permission matrix) */}
            {activeModule === 'jobs' && (
              <div>
                {canCreate('jobs') && (
                  <form onSubmit={handleAddJob} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Job Title (e.g. Bharatanatyam Instructor)" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 250px' }} />
                    <input placeholder="Department (e.g. Performing Arts)" value={newJobDept} onChange={e => setNewJobDept(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <select value={newJobType} onChange={e => setNewJobType(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Volunteer">Volunteer</option>
                    </select>
                    <textarea placeholder="Job Description" value={newJobDesc} onChange={e => setNewJobDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <select value={newJobStatus} onChange={e => setNewJobStatus(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>{perm('jobs') === 'Submits' ? 'Submit Draft' : 'Post Job'}</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.jobs.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No job postings yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Department</th><th style={{ padding: '12px' }}>Type</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.jobs.map(j => (
                          <tr key={j.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px' }}>{j.title}</td>
                            <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{j.department}</td>
                            <td style={{ padding: '12px' }}>{j.type}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: j.status === 'published' ? 'var(--primary)' : j.status === 'closed' ? 'var(--text-faint)' : 'var(--accent)', color: '#fff' }}>{j.status}</span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              {canAdmin('jobs') && (
                                <>
                                  {j.status === 'draft' && <button onClick={() => handleUpdateJobStatus(j.id, 'published')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Publish</button>}
                                  {j.status === 'published' && <button onClick={() => handleUpdateJobStatus(j.id, 'closed')} style={{ background: 'var(--text-faint)', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Close</button>}
                                  <button onClick={() => handleDelete('jobs', j.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVITIES MODULE */}
            {activeModule === 'activities' && (
              <div>
                {canCreate('activities') && (
                  <form onSubmit={handleAddActivity} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select value={newActivityBatch} onChange={e => setNewActivityBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input placeholder="Activity Title (e.g. Annual Day Performance)" value={newActivityTitle} onChange={e => setNewActivityTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 250px' }} />
                    <select value={newActivityCategory} onChange={e => setNewActivityCategory(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="Performance">Performance</option>
                      <option value="Competition">Competition</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Achievement">Achievement</option>
                    </select>
                    <input type="date" value={newActivityDate} onChange={e => setNewActivityDate(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                    <textarea placeholder="Description / Evidence" value={newActivityDesc} onChange={e => setNewActivityDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>{perm('activities') === 'Submits' ? 'Submit Activity' : 'Add Activity'}</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.activities.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No activities logged yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Category</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Description</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.activities.map(a => {
                          const batch = dbData.batches.find(b => b.id === a.batch_id);
                          return (
                            <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px' }}>{a.title}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{a.category}</td>
                              <td style={{ padding: '12px' }}>{a.date}</td>
                              <td style={{ padding: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</td>
                              <td style={{ padding: '12px' }}>
                                {canAdmin('activities') && <button onClick={() => handleDelete('activities', a.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* BATCHES MODULE */}
            {activeModule === 'batches' && (
              <div>
                {canCreate('batches') && (
                  <form onSubmit={handleAddBatch} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Batch name (e.g. BN-2026-Morning)" value={newBatchName} onChange={e => setNewBatchName(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <select value={newBatchDisc} onChange={e => setNewBatchDisc(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)' }}>
                      <option value="">Discipline...</option>
                      {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <input placeholder="Level (e.g. Beginner / Semester I)" value={newBatchLevel} onChange={e => setNewBatchLevel(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <select value={newBatchFaculty} onChange={e => setNewBatchFaculty(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                      <option value="">Faculty (optional)...</option>
                      {dbData.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <input type="number" min="1" placeholder="Capacity" value={newBatchCapacity} onChange={e => setNewBatchCapacity(e.target.value)} title="Capacity" style={{ padding: '8px', border: '1px solid var(--border)', width: '100px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Batch</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.batches.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No batches yet — add the first cohort above.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Discipline</th><th style={{ padding: '12px' }}>Level</th><th style={{ padding: '12px' }}>Faculty</th><th style={{ padding: '12px' }}>Capacity</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.batches.map(b => {
                          const disc = dbData.curriculum.find(d => d.id === b.discipline_id);
                          const fac = dbData.users.find(u => u.id === b.faculty_id);
                          return (
                            <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px', fontWeight: 600 }}>{b.name}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{disc?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{b.level}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{fac?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{b.capacity ?? '—'}</td>
                              <td style={{ padding: '12px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: b.status === 'active' ? 'var(--primary)' : 'var(--text-faint)', color: '#fff' }}>{b.status}</span></td>
                              <td style={{ padding: '12px' }}>
                                {isFull('batches') && <button onClick={() => handleDelete('batches', b.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* TIMETABLE MODULE (conflict detection on same batch or same room) */}
            {activeModule === 'timetable' && (
              <div>
                {canCreate('timetable') && (
                  <form onSubmit={handleAddSlot} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <select value={newSlotBatch} onChange={e => setNewSlotBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select value={newSlotDay} onChange={e => setNewSlotDay(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <label style={{ fontSize: '12px', color: 'var(--text-soft)' }}>From <input type="time" value={newSlotStart} onChange={e => setNewSlotStart(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} /></label>
                    <label style={{ fontSize: '12px', color: 'var(--text-soft)' }}>to <input type="time" value={newSlotEnd} onChange={e => setNewSlotEnd(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} /></label>
                    <input placeholder="Room (e.g. Hall 1)" value={newSlotRoom} onChange={e => setNewSlotRoom(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '130px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add Slot</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.timetable.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No slots yet — add the first weekly class slot above.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Day</th><th style={{ padding: '12px' }}>Time</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Room</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day =>
                          dbData.timetable.filter(s => s.day_of_week === day).map(s => {
                            const batch = dbData.batches.find(b => b.id === s.batch_id);
                            return (
                              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px', fontWeight: 600 }}>{day}</td>
                                <td style={{ padding: '12px' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</td>
                                <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                                <td style={{ padding: '12px' }}>{s.room}</td>
                                <td style={{ padding: '12px' }}>
                                  {canAdmin('timetable') && <button onClick={() => handleDelete('timetable', s.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* LESSON PLANS MODULE (draft → submitted → approved / needs_revision) */}
            {activeModule === 'lessonplans' && (
              <div>
                {canCreate('lessonplans') && (
                  <form onSubmit={handleAddLessonPlan} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select value={newPlanBatch} onChange={e => setNewPlanBatch(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch...</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input placeholder="Subject (e.g. Varnams — Week 4)" value={newPlanSubject} onChange={e => setNewPlanSubject(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <input type="date" value={newPlanDate} onChange={e => setNewPlanDate(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)' }} />
                    <textarea placeholder="Objectives" value={newPlanObjectives} onChange={e => setNewPlanObjectives(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Save Draft</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.lesson_plans.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No lesson plans yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Subject</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Reviewer note</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.lesson_plans.map(p => {
                          const batch = dbData.batches.find(b => b.id === p.batch_id);
                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px' }}><b>{p.subject}</b><br /><span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{p.objectives}</span></td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{p.session_date}</td>
                              <td style={{ padding: '12px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: p.status === 'approved' ? 'var(--primary)' : p.status === 'submitted' ? 'var(--accent)' : p.status === 'needs_revision' ? 'var(--text-faint)' : 'var(--divider)', color: p.status === 'draft' ? 'var(--primary-deep)' : '#fff' }}>{p.status?.replace('_', ' ')}</span></td>
                              <td style={{ padding: '12px', fontSize: '12.5px', color: 'var(--text-soft)', maxWidth: '220px' }}>{p.review_comments || '—'}</td>
                              <td style={{ padding: '12px' }}>
                                {canCreate('lessonplans') && (p.status === 'draft' || p.status === 'needs_revision') && (
                                  <button onClick={() => handlePlanTransition(p.id, 'submitted')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Submit for review</button>
                                )}
                                {canAdmin('lessonplans') && p.status === 'submitted' && (
                                  <>
                                    <button onClick={() => handlePlanTransition(p.id, 'approved', '')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Approve</button>
                                    <button onClick={() => handlePlanTransition(p.id, 'needs_revision')} style={{ background: 'var(--text-faint)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Return</button>
                                  </>
                                )}
                                {canAdmin('lessonplans') && <button onClick={() => handleDelete('lessonplans', p.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}>Delete</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* EVENTS MODULE (Staff/Admin draft → Admin publishes to public site) */}
            {activeModule === 'events' && (
              <div>
                {canCreate('events') && (
                  <form onSubmit={handleAddEvent} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Event title (e.g. Annual Day)" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 220px' }} />
                    <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)' }} />
                    <input placeholder="Venue" value={newEventVenue} onChange={e => setNewEventVenue(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <textarea placeholder="Description" value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Save Draft</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.events.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No events yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Event</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Venue</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.events.map(ev => (
                          <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px' }}><b>{ev.title}</b><br /><span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{ev.description}</span></td>
                            <td style={{ padding: '12px' }}>{ev.date}</td>
                            <td style={{ padding: '12px' }}>{ev.venue}</td>
                            <td style={{ padding: '12px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: ev.status === 'published' ? 'var(--primary)' : ev.status === 'archived' ? 'var(--text-faint)' : 'var(--accent)', color: '#fff' }}>{ev.status}</span></td>
                            <td style={{ padding: '12px' }}>
                              {canAdmin('events') && ev.status === 'draft' && <button onClick={() => handleEventTransition(ev.id, 'published')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Publish</button>}
                              {canAdmin('events') && ev.status === 'published' && <button onClick={() => handleEventTransition(ev.id, 'archived')} style={{ background: 'var(--text-faint)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Archive</button>}
                              {canAdmin('events') && <button onClick={() => handleDelete('events', ev.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ENQUIRIES MODULE (public form inbox: new → contacted → converted / closed) */}
            {activeModule === 'enquiries' && (
              <div>
                {canCreate('enquiries') && (
                  <form onSubmit={handleAddEnquiry} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Name" value={newEnqName} onChange={e => setNewEnqName(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <input placeholder="Contact (phone / email)" value={newEnqContact} onChange={e => setNewEnqContact(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <select value={newEnqType} onChange={e => setNewEnqType(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                      <option value="admission">Admission</option>
                      <option value="general">General</option>
                    </select>
                    <textarea placeholder="Message" value={newEnqMessage} onChange={e => setNewEnqMessage(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '50px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Add Enquiry</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.enquiries.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No enquiries yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Name</th><th style={{ padding: '12px' }}>Contact</th><th style={{ padding: '12px' }}>Type</th><th style={{ padding: '12px' }}>Message</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.enquiries.map(q => (
                          <tr key={q.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px', fontWeight: 600 }}>{q.name}</td>
                            <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{q.contact}</td>
                            <td style={{ padding: '12px', textTransform: 'capitalize' }}>{q.type}</td>
                            <td style={{ padding: '12px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.message || '—'}</td>
                            <td style={{ padding: '12px' }}>
                              {canCreate('enquiries') ? (
                                <select value={q.status || 'new'} onChange={e => handleSave('enquiries', q.id, { status: e.target.value })} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }}>
                                  <option value="new">New</option>
                                  <option value="contacted">Contacted</option>
                                  <option value="converted">Converted</option>
                                  <option value="closed">Closed</option>
                                </select>
                              ) : <span>{q.status}</span>}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {canAdmin('enquiries') && <button onClick={() => handleDelete('enquiries', q.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ROLES & PERMISSIONS — Super Admin fixed; every other role and its access is data */}
            {activeModule === 'roles' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>
                  Super Admin is the one fixed role. Create every other role here, and set exactly what each one can do in each module — no row means the module is hidden for that role.
                </p>
                <form onSubmit={handleAddRole} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input placeholder="Role name (e.g. Examiner)" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                  <input placeholder="Description" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 240px' }} />
                  <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Role</button>
                </form>
                {roles.map(r => {
                  const granted = Object.keys(permsMap[r.key] || {}).length;
                  const fixed = r.key === 'super_admin';
                  return (
                    <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', marginBottom: '14px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', flexWrap: 'wrap' }}>
                        {editingRole === r.id ? (
                          <>
                            <input value={editRoleName} onChange={e => setEditRoleName(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                            <input value={editRoleDesc} onChange={e => setEditRoleDesc(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', flex: '1 1 240px' }} />
                            <button onClick={() => handleUpdateRole(r.id)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Save</button>
                            <button onClick={() => setEditingRole(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <b style={{ color: 'var(--primary)', fontSize: '15px' }}>{r.name}</b>
                            {fixed && <span style={{ fontSize: '11px', background: 'var(--surface-muted)', padding: '2px 10px', borderRadius: '99px', color: 'var(--text-soft)' }}>fixed</span>}
                            <span style={{ color: 'var(--text-soft)', fontSize: '13px', flex: '1 1 200px' }}>{r.description}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{granted} module{granted === 1 ? '' : 's'}</span>
                            <button onClick={() => setOpenRole(openRole === r.key ? null : r.key)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Permissions</button>
                            {!fixed && <button onClick={() => { setEditingRole(r.id); setEditRoleName(r.name); setEditRoleDesc(r.description || ''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Edit</button>}
                            {!fixed && <button onClick={() => handleDeleteRole(r)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Delete</button>}
                          </>
                        )}
                      </div>
                      {openRole === r.key && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', background: 'var(--surface-muted)' }}>
                          {MODULES.map(m => (
                            <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                              <span style={{ flex: 1 }}>{m.name}</span>
                              <select value={permsMap[r.key]?.[m.key]?.level || '—'} disabled={fixed} onChange={e => handlePermChange(r.key, m.key, e.target.value)} style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px', background: 'var(--surface)' }}>
                                <option value="—">—</option>
                                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </label>
                          ))}
                          {fixed && <p style={{ fontSize: '12px', color: 'var(--text-faint)', gridColumn: '1 / -1', margin: 0 }}>Super Admin always has Full access everywhere — this cannot be changed.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* DEFAULT FALLBACK FOR OTHER MODULES */}
            {![ 'overview', 'users', 'curriculum', 'timetable', 'batches', 'lessonplans', 'liveclasses', 'assignments', 'feedback', 'events', 'jobs', 'enquiries', 'activities', 'roles'].includes(activeModule) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
                <h4 style={{ fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>
                  {MODULES.find(m => m.key === activeModule)?.name} — Portal Module
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>
                  Fully wired to the backend API and ready for management.
                </p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
