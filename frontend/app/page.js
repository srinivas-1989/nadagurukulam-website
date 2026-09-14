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
    { key: 'projects', name: 'Projects', desc: 'Student portfolio — works beyond curriculum.' },
    { key: 'certificates', name: 'Certificates', desc: 'Institutional + external achievements.' },
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
    supabase.from('users').select('role_key, id').eq('auth_user_id', uid).single();
  const loadMyProfile = (uid) =>
    supabase.from('users').select('id, role_key, name, email').eq('auth_user_id', uid).single().then(({ data }) => { if (data) setMyProfile(data); return data; });

  // Load initial session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        resolveRole(s.user.id).then(({ data }) => {
          if (data) setRole(data.role_key);
          setView('admin');
        });
        loadMyProfile(s.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) {
        resolveRole(sess.user.id).then(({ data }) => {
          if (data) setRole(data.role_key);
          setView('admin');
        });
        loadMyProfile(sess.user.id);
      } else {
        setRole(null);
        setMyProfile(null);
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
    events: [], enquiries: [], jobs: [], courses: [], course_modules: [], course_module_topics: [], course_types: [], examination_types: [],
    live_sessions: [], lesson_plans: [], assignments: [], feedback: [], activities: [], projects: [], certificates: [], role_permissions: [], assignment_submissions: [],
    class_entries: [], class_confirmations: []
  });
  const [roles, setRoles] = useState([]);
  const [myProfile, setMyProfile] = useState(null);

  // Auth helper functions
  const apiCall = async (url, options = {}) => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (sess?.access_token) headers.Authorization = `Bearer ${sess.access_token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { setSession(null); setRole(null); setView('login'); }
    else if (res.status === 403) {
      let j = null; try { j = await res.clone().json(); } catch {}
      if (j?.code === 'PASSWORD_CHANGE_REQUIRED') { setOtpMode(true); setView('login'); }
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
  const [uploadingKey, setUploadingKey] = useState(null);
  const uploadFile = async (file, onUrl) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { alert('File too large (max 15 MB)'); return; }
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
    setUploadingKey(file.name);
    try {
      const resp = await apiCall(`${apiUrl}/api/upload`, { method: 'POST', body: JSON.stringify({ filename: file.name, mime: file.type || 'application/octet-stream', data: b64 }) });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { alert(j.error || 'Upload failed — create Storage bucket "attachments" in Supabase'); return; }
      onUrl(j.url);
    } finally { setUploadingKey(null); }
  };

  // Public-site copy is data too: a cms/home block in MongoDB, edited inline by Super Admin.
  // The fallback below only covers a cold start (before the block is saved) — the DB is the source of truth.
  const CMS_FALLBACK = {
    heroHeading: 'Nurturing Talent, Inspiring Excellence',
    heroTagline: 'One World, One Family',
    heroLede: "Nada Gurukulam blends India's timeless classical performing arts traditions with contemporary academic management under Sadguru Sri Madhusudan Sai. 100% free of cost.",
    disciplinesHeading: 'Disciplines Taught',
    disciplinesSub: 'Offered completely free of charge, funded entirely by donations.',
    footerAddress: 'Nada Gurukulam, Muddenahalli, India',
    footerPhone: '+91 99999 99999',
    footerEmail: 'contact@nadagurukulam.org'
  };
  const [cmsHome, setCmsHome] = useState(null);
  const [cmsEditing, setCmsEditing] = useState(false);
  const [cmsForm, setCmsForm] = useState(CMS_FALLBACK);
  const cms = { ...CMS_FALLBACK, ...(cmsHome || {}) };
  const [pubDisciplines, setPubDisciplines] = useState([]);
  const [pubEvents, setPubEvents] = useState([]);
  const [pubJobs, setPubJobs] = useState([]);
  const [pubEnqName, setPubEnqName] = useState('');
  const [pubEnqContact, setPubEnqContact] = useState('');
  const [pubEnqType, setPubEnqType] = useState('general');
  const [pubEnqMsg, setPubEnqMsg] = useState('');
  const [pubEnqSent, setPubEnqSent] = useState('');

  // Detailed Syllabus State (MongoDB curriculum_content)
  const [activeSyllabusCourse, setActiveSyllabusCourse] = useState(null);
  const [syllabusContent, setSyllabusContent] = useState(null);
  const [editingSyllabus, setEditingSyllabus] = useState(false);
  const [syllabusForm, setSyllabusForm] = useState({});

  const loadSyllabus = (courseId) => {
    if (!courseId) return;
    fetch(`${apiUrl}/api/curriculum-content/course_${courseId}`)
      .then(r => r.json())
      .then(d => setSyllabusContent(d.content))
      .catch(() => setSyllabusContent(null));
  };

  useEffect(() => {
    if (activeSyllabusCourse) {
      loadSyllabus(activeSyllabusCourse.id);
    } else {
      setSyllabusContent(null);
      setEditingSyllabus(false);
    }
  }, [activeSyllabusCourse]);

  const handleSaveSyllabus = async () => {
    if (!activeSyllabusCourse) return;
    const res = await apiCall(`${apiUrl}/api/curriculum-content/course_${activeSyllabusCourse.id}`, {
      method: 'PUT',
      body: JSON.stringify(syllabusForm)
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Save failed'); return; }
    setEditingSyllabus(false);
    loadSyllabus(activeSyllabusCourse.id);
  };

  const deleteSyllabus = async () => {
    if (!activeSyllabusCourse) return;
    const res = await apiCall(`${apiUrl}/api/curriculum-content/course_${activeSyllabusCourse.id}`, {
      method: 'PUT',
      body: JSON.stringify(null)
    });
    if (!res.ok) { alert('Delete failed'); return; }
    setSyllabusContent(null);
    setEditingSyllabus(false);
  };

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
      if (session?.user?.id) loadMyProfile(session.user.id);
      const endpoints = [
        ['users', 'users'], ['curriculum', 'curriculum'], ['batches', 'batches'], ['timetable', 'timetable'],
        ['events', 'events'], ['enquiries', 'enquiries'], ['jobs', 'jobs'], ['courses', 'courses'],
        ['course_modules', 'course_modules'], ['course_module_topics', 'course_module_topics'], ['course_types', 'course_types'], ['examination_types', 'examination_types'], ['liveclasses', 'live_sessions'],
        ['lessonplans', 'lesson_plans'], ['assignments', 'assignments'], ['feedback', 'feedback'], ['activities', 'activities'], ['projects', 'projects'], ['certificates', 'certificates'],
        ['role_permissions', 'role_permissions'], ['class_entries', 'class_entries'], ['class_confirmations', 'class_confirmations'], ['assignment_submissions', 'assignment_submissions']
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

  useEffect(() => {
    loadCms();
    fetch(`${apiUrl}/api/public/disciplines`).then(r=>r.json()).then(d=>Array.isArray(d)&&setPubDisciplines(d)).catch(()=>{});
    fetch(`${apiUrl}/api/public/events`).then(r=>r.json()).then(d=>Array.isArray(d)&&setPubEvents(d)).catch(()=>{});
    fetch(`${apiUrl}/api/public/jobs`).then(r=>r.json()).then(d=>Array.isArray(d)&&setPubJobs(d)).catch(()=>{});
  }, []);

  useEffect(() => {
    if (view === 'admin' && session) fetchData();
  }, [view, activeModule, session]);

  // If the selected course type was deleted, fall back to the first available type.
  useEffect(() => {
    if (dbData.course_types.length && !dbData.course_types.some(t => t.name === courseType)) {
      setCourseType(dbData.course_types[0].name);
    }
  }, [dbData.course_types]);
  useEffect(() => {
    if (dbData.batches.length && !timetableBatch) setTimetableBatch(dbData.batches[0].id);
    if (dbData.batches.length && timetableBatch && !dbData.batches.some(b => b.id === timetableBatch)) setTimetableBatch(dbData.batches[0].id);
  }, [dbData.batches]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (endpoint, id) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    const res = await apiCall(`${apiUrl}/api/${endpoint}/${id}`, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Delete failed'); return; }
    if (endpoint === 'courses' && activeSyllabusCourse?.id === id) setActiveSyllabusCourse(null);
    if (endpoint === 'curriculum' && courseDisc === id) setCourseDisc('');
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

  // Form states — Users (expanded)
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState('teacher');
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newRollNo, setNewRollNo] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newProgramId, setNewProgramId] = useState('');
  const [newDateOfJoining, setNewDateOfJoining] = useState('');
  const [newYearComm, setNewYearComm] = useState('');
  const [userNotice, setUserNotice] = useState(null); // { tempPassword, otp, email }
  const [editingUser, setEditingUser] = useState(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserRoleKey, setEditUserRoleKey] = useState('');
  const [editUserEmployeeId, setEditUserEmployeeId] = useState('');
  const [editUserRollNo, setEditUserRollNo] = useState('');
  const [editUserDesignation, setEditUserDesignation] = useState('');
  const [editUserProgramId, setEditUserProgramId] = useState('');
  const [editUserDateOfJoining, setEditUserDateOfJoining] = useState('');
  const [editUserYearComm, setEditUserYearComm] = useState('');

  const roleCategory = (key) => roles.find(r => r.key === key)?.category || 'staff';
  const newRoleCat = roleCategory(newUserRole);
  const editRoleCat = roleCategory(editUserRoleKey);
  const isStudentCat = (c) => c === 'student' || c === 'both';
  const isStaffCat = (c) => c === 'staff' || c === 'both' || c === 'system';

  // First-login OTP flow
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');

  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscLevels, setNewDiscLevels] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');
  const [newDiscStructure, setNewDiscStructure] = useState('semester');
  const [newDiscYearCount, setNewDiscYearCount] = useState(2);
  const [newDiscSemPerYear, setNewDiscSemPerYear] = useState(2);
  const [editingDisc, setEditingDisc] = useState(null);
  const [discEditName, setDiscEditName] = useState('');
  const [discEditLevels, setDiscEditLevels] = useState('');
  const [discEditDesc, setDiscEditDesc] = useState('');
  const [discEditStructure, setDiscEditStructure] = useState('semester');
  const [discEditYearCount, setDiscEditYearCount] = useState(2);
  const [discEditSemPerYear, setDiscEditSemPerYear] = useState(2);

  // Course form (BPA/MPA syllabus header — image BCVP310) — 21-field header
  const [courseDisc, setCourseDisc] = useState('');
  const [courseType, setCourseType] = useState('Masters');
  const [courseSem, setCourseSem] = useState('Semester I');
  const [courseYearLabel, setCourseYearLabel] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseKind, setCourseKind] = useState('DSC');
  const [courseCredits, setCourseCredits] = useState(5);
  const [coursePeriods, setCoursePeriods] = useState(100);
  const derivedHours = (() => { const n = Number(coursePeriods); if (!Number.isFinite(n) || n <= 0) return ''; return Math.round(n * 45 / 60 * 100) / 100; })();
  const [courseCie, setCourseCie] = useState(50);
  const [courseSee, setCourseSee] = useState(50);
  const [courseCieDur, setCourseCieDur] = useState('45 Min');
  const [courseSeeDur, setCourseSeeDur] = useState('1 hour');
  const [courseExamTypeId, setCourseExamTypeId] = useState('');
  const [courseExamType, setCourseExamType] = useState('Practical');
  const [courseObjectives, setCourseObjectives] = useState('');
  const [courseOutcomes, setCourseOutcomes] = useState([]); // [{code:'CO1', text:''}]
  const [coursePedagogy, setCoursePedagogy] = useState('');
  const [newExamTypeName, setNewExamTypeName] = useState('');
  // Postgres modules (course_modules + course_module_topics)
  const [modTitle, setModTitle] = useState('');
  const [modHours, setModHours] = useState('');
  const [modRbt, setModRbt] = useState('Remember');
  const [modMethod, setModMethod] = useState('');
  const [modTopicsText, setModTopicsText] = useState('');
  const [modCo, setModCo] = useState([]); // ['CO1',...]
  const [editingModId, setEditingModId] = useState(null);

  // Course list: inline edit + client filters ("Select Course" vs "Add Course")
  const [editingCourse, setEditingCourse] = useState(null);
  const [editCourse, setEditCourse] = useState({});
  const [filterDisc, setFilterDisc] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const activeCourseType = dbData.course_types.find(t => t.name === courseType);
  const courseSemesters = Array.from({ length: activeCourseType?.semester_count || 4 }, (_, i) => `Semester ${ROMAN[i]}`);
  const selectedDisc = dbData.curriculum.find(d => d.id === courseDisc) || null;
  const selectedDiscStructure = selectedDisc?.structure_mode || 'semester';
  const yearOptions = (() => {
    const n = Number(selectedDisc?.year_count) || 2;
    return Array.from({ length: Math.min(n, 10) }, (_, i) => `Year ${ROMAN[i]}`);
  })();

  useEffect(() => { if (!courseDisc && dbData.curriculum.length) setCourseDisc(dbData.curriculum[0].id); }, [dbData.curriculum]);
  useEffect(() => { if (courseSemesters.length && !courseSemesters.includes(courseSem)) setCourseSem(courseSemesters[0]); }, [courseSemesters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedDisc) return;
    const mode = selectedDisc.structure_mode || 'semester';
    if (mode === 'yearly' || mode === 'yearly_semester') {
      if (!courseYearLabel && yearOptions.length) setCourseYearLabel(yearOptions[0]);
      else if (courseYearLabel && !yearOptions.includes(courseYearLabel)) setCourseYearLabel(yearOptions[0] || '');
    } else if (courseYearLabel) setCourseYearLabel('');
  }, [courseDisc, dbData.curriculum]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [newAssignCourse, setNewAssignCourse] = useState('');
  const [newAssignModule, setNewAssignModule] = useState('');
  const [newAssignTopic, setNewAssignTopic] = useState('');
  const [newAssignTopicText, setNewAssignTopicText] = useState('');
  const [newAssignAttachment, setNewAssignAttachment] = useState('');
  const [submitAttachments, setSubmitAttachments] = useState({});

  const assignModules = newAssignCourse ? (dbData.course_modules || []).filter(m => m.course_id === newAssignCourse) : [];
  const assignTopics = newAssignModule ? (dbData.course_module_topics || []).filter(t => t.module_id === newAssignModule) : [];

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignBatch || !newAssignTitle || !newAssignDue) return;
    await apiCall(`${apiUrl}/api/assignments`, {
      method: 'POST',
      body: JSON.stringify({ batch_id: newAssignBatch, title: newAssignTitle, type: newAssignType, due_date: newAssignDue, description: newAssignDesc, status: 'open', course_id: newAssignCourse || null, module_id: newAssignModule || null, topic_id: newAssignTopic || null, topic_text: newAssignTopicText.trim() || null, attachment_url: newAssignAttachment.trim() || null, created_by: myProfile?.id || null })
    });
    setNewAssignBatch(''); setNewAssignTitle(''); setNewAssignType('audio_video'); setNewAssignDue(''); setNewAssignDesc(''); setNewAssignCourse(''); setNewAssignModule(''); setNewAssignTopic(''); setNewAssignTopicText(''); setNewAssignAttachment(''); fetchData();
  };

  const handleUpdateAssignmentStatus = async (id, status) => {
    await apiCall(`${apiUrl}/api/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    fetchData();
  };

  const handleStartAssignment = async (assignment) => {
    if (!myProfile?.id) { alert('Profile not loaded'); return; }
    const res = await apiCall(`${apiUrl}/api/assignment_submissions`, {
      method: 'POST',
      body: JSON.stringify({ assignment_id: assignment.id, batch_id: assignment.batch_id, student_id: myProfile.id, status: 'started' })
    });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Failed to start'); return; }
    fetchData();
  };
  const handleSubmitAssignment = async (assignment) => {
    if (!myProfile?.id) return;
    const sub = (dbData.assignment_submissions || []).find(s => s.assignment_id === assignment.id && s.student_id === myProfile.id);
    if (!sub) { alert('Start assignment first'); return; }
    const att = (submitAttachments[assignment.id] || '').trim() || sub.attachment_url || null;
    const res = await apiCall(`${apiUrl}/api/assignment_submissions/${sub.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'submitted', submitted_at: new Date().toISOString(), attachment_url: att })
    });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Failed to submit'); return; }
    fetchData();
  };
  const handleGradeSubmission = async (sub) => {
    const grade = prompt('Grade (e.g. A / 85%)', sub.grade || '');
    if (grade === null) return;
    const feedback = prompt('Feedback', sub.feedback || '') || null;
    const res = await apiCall(`${apiUrl}/api/assignment_submissions/${sub.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'graded', grade: grade || null, feedback })
    });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Failed to grade'); return; }
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

  // Projects — student portfolio (beyond curriculum)
  const [newProjBatch, setNewProjBatch] = useState('');
  const [newProjTitle, setNewProjTitle] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjCourse, setNewProjCourse] = useState('');
  const [newProjTopic, setNewProjTopic] = useState('');
  const [newProjAttachment, setNewProjAttachment] = useState('');
  const [editingProject, setEditingProject] = useState(null);
  const [editProj, setEditProj] = useState({});
  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newProjBatch || !newProjTitle) return;
    const res = await apiCall(`${apiUrl}/api/projects`, { method: 'POST', body: JSON.stringify({ batch_id: newProjBatch, title: newProjTitle, description: newProjDesc || null, course_id: newProjCourse || null, topic_text: newProjTopic.trim() || null, attachment_url: newProjAttachment.trim() || null, student_id: myProfile?.id || undefined }) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Failed to create project'); return; }
    setNewProjTitle(''); setNewProjDesc(''); setNewProjCourse(''); setNewProjTopic(''); setNewProjAttachment(''); fetchData();
  };
  const handleSaveProject = async () => {
    if (!editingProject) return;
    const res = await apiCall(`${apiUrl}/api/projects/${editingProject}`, { method: 'PUT', body: JSON.stringify(editProj) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Save failed'); return; }
    setEditingProject(null); setEditProj({}); fetchData();
  };

  // Certificates — per-student (scan upload + institutional)
  const [newCertTitle, setNewCertTitle] = useState('');
  const [newCertIssuer, setNewCertIssuer] = useState('');
  const [newCertDate, setNewCertDate] = useState('');
  const [newCertType, setNewCertType] = useState('external');
  const [newCertFile, setNewCertFile] = useState('');
  const [newCertDesc, setNewCertDesc] = useState('');
  const [editingCert, setEditingCert] = useState(null);
  const [editCert, setEditCert] = useState({});
  const handleAddCertificate = async (e) => {
    e.preventDefault();
    if (!newCertTitle) return;
    const res = await apiCall(`${apiUrl}/api/certificates`, { method: 'POST', body: JSON.stringify({ title: newCertTitle, issuer: newCertIssuer || null, issue_date: newCertDate || null, certificate_type: newCertType, file_url: newCertFile.trim() || null, description: newCertDesc || null, student_id: myProfile?.id || undefined }) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Failed to add certificate'); return; }
    setNewCertTitle(''); setNewCertIssuer(''); setNewCertDate(''); setNewCertFile(''); setNewCertDesc(''); fetchData();
  };
  const handleSaveCert = async () => {
    if (!editingCert) return;
    const res = await apiCall(`${apiUrl}/api/certificates/${editingCert}`, { method: 'PUT', body: JSON.stringify(editCert) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Save failed'); return; }
    setEditingCert(null); setEditCert({}); fetchData();
  };
  const handleVerifyCert = async (c) => {
    const res = await apiCall(`${apiUrl}/api/certificates/${c.id}`, { method: 'PUT', body: JSON.stringify({ verified: !c.verified }) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Verify failed'); return; }
    fetchData();
  };

  // Batches — cohorts: roster anchor for timetable, live classes, assignments, feedback.
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDisc, setNewBatchDisc] = useState('');
  const [newBatchLevel, setNewBatchLevel] = useState('');
  const [newBatchFaculty, setNewBatchFaculty] = useState('');
  const [newBatchCapacity, setNewBatchCapacity] = useState(20);
  const [editingBatch, setEditingBatch] = useState(null);
  const [editBatchName, setEditBatchName] = useState('');
  const [editBatchDisc, setEditBatchDisc] = useState('');
  const [editBatchLevel, setEditBatchLevel] = useState('');
  const [editBatchFaculty, setEditBatchFaculty] = useState('');
  const [editBatchCapacity, setEditBatchCapacity] = useState(20);

  const handleAddBatch = async (e) => {
    e.preventDefault();
    if (!newBatchName || !newBatchDisc || !newBatchLevel) return;
    await apiCall(`${apiUrl}/api/batches`, {
      method: 'POST',
      body: JSON.stringify({ name: newBatchName, discipline_id: newBatchDisc, level: newBatchLevel, faculty_id: newBatchFaculty || null, capacity: Number(newBatchCapacity) || 20, status: 'active' })
    });
    setNewBatchName(''); setNewBatchLevel(''); setNewBatchFaculty(''); setNewBatchCapacity(20); fetchData();
  };
  const handleUpdateBatch = async (id) => {
    const res = await apiCall(`${apiUrl}/api/batches/${id}`, { method: 'PUT', body: JSON.stringify({ name: editBatchName.trim(), discipline_id: editBatchDisc || null, level: editBatchLevel.trim(), faculty_id: editBatchFaculty || null, capacity: Number(editBatchCapacity) || 20 }) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Update failed'); return; }
    setEditingBatch(null); fetchData();
  };

  // Timetable — FIXED grid 08:15–16:00 (45m periods + breaks), XLS style.
  // Columns always fixed: 1 2 3 | BREAK | 4 5 | LUNCH | NAP | EXTRA | STUDY — clubbed via colspan.
  const FIXED_TT = [
    { key:'p1', label:'1', start:'08:15', end:'09:00', kind:'period', num:1 },
    { key:'p2', label:'2', start:'09:00', end:'09:45', kind:'period', num:2 },
    { key:'p3', label:'3', start:'09:45', end:'10:30', kind:'period', num:3 },
    { key:'br1', label:'BREAK', start:'10:30', end:'10:45', kind:'break' },
    { key:'p4', label:'4', start:'10:45', end:'11:30', kind:'period', num:4 },
    { key:'p5', label:'5', start:'11:30', end:'12:15', kind:'period', num:5 },
    { key:'lunch', label:'LUNCH', start:'12:15', end:'13:00', kind:'break' },
    { key:'nap', label:'NAP', start:'13:00', end:'13:25', kind:'break' },
    { key:'extra', label:'EXTRA', start:'13:30', end:'14:30', kind:'block', num:6 },
    { key:'study', label:'STUDY', start:'14:30', end:'16:00', kind:'block', num:7 },
  ];
  const FIXED_TEACH = FIXED_TT.filter(c=>c.kind!=='break');
  const FIXED_MAP = Object.fromEntries(FIXED_TT.map(c=>[c.key,c]));
  const TT_SEGMENTS = [['p1','p2','p3'],['p4','p5'],['extra','study']];
  const ttSegmentOf = (k) => TT_SEGMENTS.findIndex(s=>s.includes(k));
  const slotsOverlap = (a, b) => a.start < b.end && b.start < a.end;
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const toMinTT = (t) => { const [h,m]=String(t).split(':').map(Number); return h*60+(m||0); };
  const fmtTT = (t) => String(t||'').slice(0,5);
  const slotCoversCol = (slot, col) => {
    const s=toMinTT(slot.start_time), e=toMinTT(slot.end_time), cs=toMinTT(col.start), ce=toMinTT(col.end);
    return s<=cs+1 && e>=ce-1;
  };
  const slotToKeys = (slot) => {
    if (!slot) return {from:'p1', to:'p1'};
    let fromKey=null, toKey=null;
    if (slot.period_number!=null) {
      const fc=FIXED_TT.find(c=>c.num===slot.period_number);
      if (fc) fromKey=fc.key;
    }
    if (!fromKey) {
      const fc=FIXED_TT.find(c=>c.kind!=='break' && toMinTT(c.start)===toMinTT(slot.start_time));
      if (fc) fromKey=fc.key;
      else { const m=FIXED_TEACH.find(c=>slotCoversCol(slot,c)); if (m) fromKey=m.key; }
    }
    if (!fromKey) fromKey='p1';
    const tc=FIXED_TT.find(c=>c.kind!=='break' && toMinTT(c.end)===toMinTT(slot.end_time));
    if (tc) toKey=tc.key;
    else { let last=null; FIXED_TT.forEach(c=>{ if(c.kind!=='break'&&slotCoversCol(slot,c)) last=c.key; }); if(last) toKey=last; }
    if (!toKey) toKey=fromKey;
    const fi=FIXED_TT.findIndex(c=>c.key===fromKey), ti=FIXED_TT.findIndex(c=>c.key===toKey);
    if (ti<fi) toKey=fromKey;
    return {from:fromKey, to:toKey};
  };
  const [newSlotBatch, setNewSlotBatch] = useState('');
  const [newSlotDay, setNewSlotDay] = useState('Monday');
  const [newSlotFrom, setNewSlotFrom] = useState('p1');
  const [newSlotTo, setNewSlotTo] = useState('p1');
  const [newSlotRoom, setNewSlotRoom] = useState('');
  const [newSlotSubject, setNewSlotSubject] = useState('');
  const [editingSlot, setEditingSlot] = useState(null);
  const [editSlotDay, setEditSlotDay] = useState('Monday');
  const [editSlotFrom, setEditSlotFrom] = useState('p1');
  const [editSlotTo, setEditSlotTo] = useState('p1');
  const [editSlotRoom, setEditSlotRoom] = useState('');
  const [editSlotSubject, setEditSlotSubject] = useState('');
  const [editSlotBatch, setEditSlotBatch] = useState('');
  const [timetableBatch, setTimetableBatch] = useState('');

  const handleAddSlot = async (e) => {
    e.preventDefault();
    if (!newSlotBatch) return;
    if (!newSlotSubject.trim()) { alert('Enter Class / Topic'); return; }
    const fc = FIXED_MAP[newSlotFrom], tc = FIXED_MAP[newSlotTo];
    if (!fc || !tc) return;
    const fi = FIXED_TT.findIndex(c=>c.key===newSlotFrom), ti = FIXED_TT.findIndex(c=>c.key===newSlotTo);
    if (ti < fi) { alert('Invalid period range'); return; }
    if (ttSegmentOf(newSlotFrom) !== ttSegmentOf(newSlotTo)) { alert('Club only within same block: 1-3, or 4-5, or Extra+Study'); return; }
    const candidate = { batch_id: newSlotBatch, day_of_week: newSlotDay, start_time: fc.start, end_time: tc.end, room: newSlotRoom.trim() || null, subject: newSlotSubject.trim() || null, period_number: fc.num || null };
    const sameBatch = (a,b) => a===b;
    const sameRoom = (a,b) => a && b && String(a).trim() && String(b).trim() && String(a).trim()===String(b).trim();
    const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
    const clash = dbData.timetable.find(s =>
      s.day_of_week === candidate.day_of_week &&
      (sameBatch(s.batch_id, candidate.batch_id) || sameRoom(s.room, candidate.room)) &&
      slotsOverlap({ start: toMin(candidate.start_time), end: toMin(candidate.end_time) }, { start: toMin(s.start_time), end: toMin(s.end_time) })
    );
    if (clash) {
      const batchName = dbData.batches.find(b => b.id === clash.batch_id)?.name || 'a batch';
      const ok = confirm(`Conflicts with ${clash.day_of_week} ${clash.start_time}–${clash.end_time} (${batchName === dbData.batches.find(b=>b.id===candidate.batch_id)?.name ? 'same batch' : 'room ' + clash.room}). Add anyway?`);
      if (!ok) return;
    }
    const slotRes = await apiCall(`${apiUrl}/api/timetable`, { method: 'POST', body: JSON.stringify(candidate) });
    if (!slotRes.ok) { const x = await slotRes.json().catch(() => ({})); alert(x.error || 'Failed to add slot'); return; }
    setNewSlotRoom(''); setNewSlotSubject(''); fetchData();
  };
  const handleUpdateSlot = async (id) => {
    const fc = FIXED_MAP[editSlotFrom], tc = FIXED_MAP[editSlotTo];
    if (!fc || !tc) { alert('Pick period range'); return; }
    const fi = FIXED_TT.findIndex(c=>c.key===editSlotFrom), ti = FIXED_TT.findIndex(c=>c.key===editSlotTo);
    if (ti < fi) { alert('Invalid period range'); return; }
    if (ttSegmentOf(editSlotFrom) !== ttSegmentOf(editSlotTo)) { alert('Club only within same block: 1-3, or 4-5, or Extra+Study'); return; }
    const payload = { batch_id: editSlotBatch || undefined, day_of_week: editSlotDay, start_time: fc.start, end_time: tc.end, room: editSlotRoom.trim() || null, subject: editSlotSubject.trim() || null, period_number: fc.num || null };
    const res = await apiCall(`${apiUrl}/api/timetable/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Update failed'); return; }
    setEditingSlot(null); fetchData();
  };

  // ── Class completion loop — one entry per slot per date, student confirmations, analytics ──
  const [ceSlot, setCeSlot] = useState('');
  const [ceDate, setCeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ceCourse, setCeCourse] = useState('');
  const [ceModule, setCeModule] = useState('');
  const [ceTopic, setCeTopic] = useState('');
  const [ceTopicText, setCeTopicText] = useState('');
  const [ceNotes, setCeNotes] = useState('');
  const ceModules = ceCourse ? (dbData.course_modules || []).filter(m => m.course_id === ceCourse) : [];
  const ceTopics = ceModule ? (dbData.course_module_topics || []).filter(t => t.module_id === ceModule) : [];

  const handleAddClassEntry = async (e) => {
    e.preventDefault();
    if (!ceSlot || !ceDate) { alert('Pick a slot and date'); return; }
    const slot = dbData.timetable.find(s => s.id === ceSlot);
    if (!slot) { alert('Invalid slot'); return; }
    const payload = { timetable_slot_id: ceSlot, batch_id: slot.batch_id, class_date: ceDate, course_id: ceCourse || null, module_id: ceModule || null, topic_id: ceTopic || null, topic_text: ceTopicText.trim() || null, notes: ceNotes.trim() || null, taught_by: myProfile?.id || null, status: 'submitted' };
    if (!payload.course_id && !payload.topic_text) { alert('Pick a course/topic or enter a free topic'); return; }
    const res = await apiCall(`${apiUrl}/api/class_entries`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Failed to log class'); return; }
    setCeTopic(''); setCeTopicText(''); setCeNotes(''); fetchData();
  };

  const handleConfirm = async (entry, nextStatus) => {
    if (!myProfile?.id) { alert('Profile not loaded'); return; }
    const existing = (dbData.class_confirmations || []).find(c => c.class_entry_id === entry.id && c.student_id === myProfile.id);
    let comment = null;
    if (nextStatus === 'disputed') { comment = prompt('What was different? (optional)') || null; }
    const body = { class_entry_id: entry.id, batch_id: entry.batch_id, student_id: myProfile.id, status: nextStatus, comment };
    let res;
    if (existing) res = await apiCall(`${apiUrl}/api/class_confirmations/${existing.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus, comment }) });
    else res = await apiCall(`${apiUrl}/api/class_confirmations`, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Failed'); return; }
    fetchData();
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

  const [newRoleCategory, setNewRoleCategory] = useState('staff');
  const [editRoleCategory, setEditRoleCategory] = useState('staff');
  const handleAddRole = async (e) => {
    e.preventDefault();
    const key = newRoleName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) return;
    const res = await apiCall(`${apiUrl}/api/roles`, {
      method: 'POST',
      body: JSON.stringify({ key, name: newRoleName, description: newRoleDesc, category: newRoleCategory })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Create role failed'); return; }
    setNewRoleName(''); setNewRoleDesc(''); setNewRoleCategory('staff'); fetchData();
  };

  const handleUpdateRole = async (id) => {
    const res = await apiCall(`${apiUrl}/api/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: editRoleName, description: editRoleDesc, category: editRoleCategory })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Update failed'); return; }
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
    const cat = roleCategory(newUserRole);
    const payload = { name: newName.trim(), email: newEmail.trim(), role_key: newUserRole, phone: newPhone.trim() || null,
      employee_id: newEmployeeId.trim() || null, roll_no: newRollNo.trim() || null,
      designation: newDesignation.trim() || null, program_id: newProgramId || null,
      date_of_joining: newDateOfJoining || null, year_of_commencement: newYearComm ? Number(newYearComm) : null };
    if (cat === 'student' && (!payload.roll_no || !payload.program_id || !payload.year_of_commencement)) { alert('Students require Roll No, Course (Program) and Year of commencement'); return; }
    const res = await apiCall(`${apiUrl}/api/users`, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Create user failed'); return; }
    if (data.tempPassword || data.otp) setUserNotice({ tempPassword: data.tempPassword, otp: data.otp, email: data.email || payload.email, emailSent: data.emailSent });
    setNewName(''); setNewEmail(''); setNewPhone(''); setNewEmployeeId(''); setNewRollNo(''); setNewDesignation(''); setNewProgramId(''); setNewDateOfJoining(''); setNewYearComm('');
    fetchData();
  };

  const handleAddDiscipline = async (e) => {
    e.preventDefault();
    if (!newDiscName) return;
    await apiCall(`${apiUrl}/api/curriculum`, {
      method: 'POST',
      body: JSON.stringify({
        name: newDiscName, levels: newDiscLevels, description: newDiscDesc,
        structure_mode: newDiscStructure, year_count: Number(newDiscYearCount) || 2, semesters_per_year: Number(newDiscSemPerYear) || 2,
      })
    });
    setNewDiscName(''); setNewDiscLevels(''); setNewDiscDesc(''); fetchData();
  };

  const handleUpdateUser = async (u) => {
    const payload = { name: editUserName.trim(), email: editUserEmail.trim(), role_key: editUserRoleKey,
      phone: editUserPhone.trim() || null, employee_id: editUserEmployeeId.trim() || null, roll_no: editUserRollNo.trim() || null,
      designation: editUserDesignation.trim() || null, program_id: editUserProgramId || null,
      date_of_joining: editUserDateOfJoining || null, year_of_commencement: editUserYearComm ? Number(editUserYearComm) : null };
    if (!payload.name || !payload.email || !payload.role_key) return;
    const res = await apiCall(`${apiUrl}/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Update failed'); return; }
    setEditingUser(null); fetchData();
  };

  const handleUpdateDiscipline = async (d, payload) => {
    const res = await apiCall(`${apiUrl}/api/curriculum/${d.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Update failed'); return; }
    setEditingDisc(null); fetchData();
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!courseName || !courseCode) return;
    if (!courseDisc) { alert('Choose a Program first.'); return; }
    const disc = dbData.curriculum.find(d => d.id === courseDisc);
    const mode = disc?.structure_mode || 'semester';
    const derived = derivedHours === '' ? null : Number(derivedHours);
    const payload = {
      discipline_id: courseDisc, course_type: courseType, code: courseCode, name: courseName,
      type: courseKind, credits: Number(courseCredits) || 0, teaching_hours: derived,
      teaching_periods: coursePeriods !== '' ? Number(coursePeriods) : null,
      cie_marks: Number(courseCie) || 0, see_marks: Number(courseSee) || 0,
      examination_type: courseExamType || null, examination_type_id: courseExamTypeId || null,
      examination_hours_cie: courseCieDur || null, examination_hours_see: courseSeeDur || null,
      cie_duration: courseCieDur || null, see_duration: courseSeeDur || null,
      objectives_json: courseObjectives ? courseObjectives.split('\n').filter(s=>s.trim()).map(s=>s.trim()) : [],
      outcomes_json: courseOutcomes.filter(o=>o.text.trim()).map(o=>({ code:o.code, text:o.text.trim() })),
      pedagogy: coursePedagogy.trim() || null,
    };
    if (mode === 'yearly') {
      if (!courseYearLabel) { alert('Choose a Year.'); return; }
      payload.year_label = courseYearLabel;
      payload.year_number = ROMAN.indexOf(courseYearLabel.replace('Year ', '')) + 1 || null;
      payload.semester = null;
    } else if (mode === 'yearly_semester') {
      if (!courseYearLabel) { alert('Choose a Year.'); return; }
      payload.year_label = courseYearLabel;
      payload.year_number = ROMAN.indexOf(courseYearLabel.replace('Year ', '')) + 1 || null;
      payload.semester = courseSem;
    } else {
      payload.semester = courseSem;
      payload.year_label = null; payload.year_number = null;
    }
    const res = await apiCall(`${apiUrl}/api/courses`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Add course failed'); return; }
    setCourseCode(''); setCourseName(''); fetchData();
  };
  const handleAddExamType = async () => {
    const name = newExamTypeName.trim();
    if (!name) return;
    const res = await apiCall(`${apiUrl}/api/examination_types`, { method: 'POST', body: JSON.stringify({ name }) });
    if (!res.ok) { const e = await res.json().catch(()=>({})); alert(e.error||'Add failed'); return; }
    const j = await res.json().catch(()=>null);
    if (j?.id) setCourseExamTypeId(j.id);
    setNewExamTypeName(''); fetchData();
  };
  const handleAddModule = async () => {
    if (!activeSyllabusCourse?.id || !modTitle.trim()) { alert('Enter module title'); return; }
    const all = dbData.course_modules.filter(m=>m.course_id===activeSyllabusCourse.id);
    const maxNum = all.reduce((m,x)=>Math.max(m, Number(x.module_number)||0), 0);
    const r = await apiCall(`${apiUrl}/api/course_modules`, { method:'POST', body: JSON.stringify({ course_id: activeSyllabusCourse.id, module_number: maxNum+1, title: modTitle.trim(), hours: modHours ? Number(modHours): null, rbt_level: modRbt||null, methodology: modMethod.trim()||null, co_mapping: modCo.join(', ')||null }) });
    if (!r.ok) { const e=await r.json().catch(()=>({})); alert(e.error||'Add module failed'); return; }
    const created = await r.json().catch(()=>null);
    const modId = created?.id;
    if (modId && modTopicsText.trim()) {
      const topics = modTopicsText.split('\n').map(s=>s.trim()).filter(Boolean);
      for (let i=0;i<topics.length;i++) { await apiCall(`${apiUrl}/api/course_module_topics`, { method:'POST', body: JSON.stringify({ module_id: modId, topic: topics[i], sort_order: i }) }); }
    }
    setModTitle(''); setModHours(''); setModMethod(''); setModTopicsText(''); setModCo([]); fetchData();
  };
  const handleDeleteModule = async (id) => {
    if (!confirm('Delete module?')) return;
    await apiCall(`${apiUrl}/api/course_modules/${id}`, { method:'DELETE' }); fetchData();
  };

  const handleUpdateCourse = async (id, payload) => {
    const res = await apiCall(`${apiUrl}/api/courses/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Update failed'); return; }
    setEditingCourse(null); fetchData();
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
          <section style={{ background: 'var(--bg-saffron)', padding: '64px 8vw 72px', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
            {/* NDG brand elements: corner quarter-circles, Nataraja watermark (10–15% opacity) */}
            <div className="ndg-corner" style={{ top: '-140px', right: '-140px', width: '340px', height: '340px', borderRadius: '50%', background: 'var(--primary)' }} />
            <div className="ndg-corner" style={{ bottom: '-170px', left: '-170px', width: '400px', height: '400px', borderRadius: '50%', background: 'var(--accent)', opacity: 0.35 }} />
            <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', bottom: '16px', border: '1px dashed var(--divider)', borderRadius: 'var(--radius-xl)', pointerEvents: 'none', opacity: 0.6 }} />
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
                <input value={cmsForm.footerAddress} onChange={e => setCmsForm({ ...cmsForm, footerAddress: e.target.value })} placeholder="Footer Address" style={{ padding: '8px', border: '1px solid var(--border)' }} />
                <input value={cmsForm.footerPhone} onChange={e => setCmsForm({ ...cmsForm, footerPhone: e.target.value })} placeholder="Footer Phone" style={{ padding: '8px', border: '1px solid var(--border)' }} />
                <input value={cmsForm.footerEmail} onChange={e => setCmsForm({ ...cmsForm, footerEmail: e.target.value })} placeholder="Footer Email" style={{ padding: '8px', border: '1px solid var(--border)' }} />
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
              {(pubDisciplines.length ? pubDisciplines : dbData.curriculum).length === 0 && <p style={{ color: 'var(--text-faint)', gridColumn: '1 / -1' }}>Disciplines will appear here as they&apos;re added in the portal (Curricula module).</p>}
              {(pubDisciplines.length ? pubDisciplines : dbData.curriculum).map(art => (
                <div key={art.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
                  <h4 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>{art.name}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>{art.description || art.levels || '—'}</p>
                </div>
              ))}
            </div>
            {pubEvents.length > 0 && (
              <section style={{ marginTop: '48px' }}>
                <h3 style={{ fontSize: '22px', color: 'var(--primary-deep)', marginBottom: '8px' }}>Upcoming Events</h3>
                <p style={{ color: 'var(--text-soft)', marginBottom: '16px' }}>Published from the portal — only what Admin has approved appears here.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  {pubEvents.map(ev => (
                    <div key={ev.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '18px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{ev.title}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '4px' }}>{ev.date} · {ev.venue}</div>
                      {ev.description && <p style={{ fontSize: '13.5px', color: 'var(--text-soft)', marginTop: '8px' }}>{ev.description}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {pubJobs.length > 0 && (
              <section style={{ marginTop: '48px' }}>
                <h3 style={{ fontSize: '22px', color: 'var(--primary-deep)', marginBottom: '8px' }}>Careers</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {pubJobs.map(j => (
                    <div key={j.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div><div style={{ fontWeight: 600 }}>{j.title}</div><div style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{j.department} · {j.type}</div></div>
                      {j.description && <div style={{ fontSize: '13px', color: 'var(--text-soft)', maxWidth: '42ch' }}>{j.description.slice(0, 160)}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section style={{ marginTop: '48px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px' }}>
              <h3 style={{ fontSize: '18px', color: 'var(--primary-deep)', marginBottom: '6px' }}>Enquire</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-soft)', marginBottom: '14px' }}>Admissions or general — we&apos;ll get back on the contact you share.</p>
              {pubEnqSent && <div style={{ background: 'var(--bg-saffron)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}>{pubEnqSent}</div>}
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!pubEnqName.trim() || !pubEnqContact.trim()) { setPubEnqSent('Name and contact required.'); return; }
                const r = await fetch(`${apiUrl}/api/public/enquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pubEnqName.trim(), contact: pubEnqContact.trim(), type: pubEnqType, message: pubEnqMsg.trim() || null }) });
                const j = await r.json().catch(()=>({}));
                if (!r.ok) { setPubEnqSent(j.error || 'Failed to send'); return; }
                setPubEnqSent('Thank you — we received your enquiry.'); setPubEnqName(''); setPubEnqContact(''); setPubEnqMsg('');
              }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input placeholder="Full name *" value={pubEnqName} onChange={e=>setPubEnqName(e.target.value)} style={{ flex: '1 1 160px', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }} />
                  <input placeholder="Phone or email *" value={pubEnqContact} onChange={e=>setPubEnqContact(e.target.value)} style={{ flex: '1 1 160px', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }} />
                  <select value={pubEnqType} onChange={e=>setPubEnqType(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }}><option value="general">General</option><option value="admission">Admission</option></select>
                </div>
                <textarea placeholder="Message (optional)" value={pubEnqMsg} onChange={e=>setPubEnqMsg(e.target.value)} rows={3} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }} />
                <button type="submit" style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 'var(--radius-xl-sm)', fontWeight: 600, cursor: 'pointer' }}>Send enquiry</button>
              </form>
            </section>
          </main>

          <footer style={{ background: 'var(--surface-muted)', borderTop: '1px solid var(--border)', padding: '40px 24px', marginTop: '60px' }}>
            <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <h4 style={{ fontSize: '18px', color: 'var(--primary-deep)', margin: '0 0 6px' }}>Nada Gurukulam</h4>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-soft)' }}>{cms.footerAddress}</p>
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-soft)', textAlign: 'right' }}>
                <div>Phone: {cms.footerPhone}</div>
                <div>Email: {cms.footerEmail}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--text-faint)', borderTop: '1px solid var(--divider)', paddingTop: '16px' }}>
              © {new Date().getFullYear()} Nada Gurukulam. All rights reserved.
            </div>
          </footer>
        </div>
      )}

      {/* VIEW 2: LOGIN / AUTH — supports first-login OTP password change */}
      {view === 'login' && !session && (
        <div style={{ maxWidth: '720px', margin: '60px auto', padding: '0 24px', flex: 1 }}>
          <h2 style={{ fontSize: '28px', color: 'var(--primary-deep)', textAlign: 'center', marginBottom: '8px' }}>{otpMode ? 'Set your password' : 'Sign in to Portal'}</h2>
          <p style={{ color: 'var(--text-soft)', textAlign: 'center', marginBottom: '24px' }}>
            {otpMode ? 'You must change your temporary password using an OTP sent to your official email.' : 'Use your Supabase Auth credentials to access the portal.'}
          </p>
          {otpMode ? (
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--accent)', padding: '22px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {otpMsg && <div style={{ background: 'var(--bg-saffron)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'var(--text-soft)' }}>{otpMsg}</div>}
              <input type="email" placeholder="Official email" value={otpEmail} onChange={e => setOtpEmail(e.target.value)} style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '15px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="6-digit OTP" value={otpCode} onChange={e => setOtpCode(e.target.value)} maxLength={6} style={{ flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '15px', letterSpacing: '0.12em' }} />
                <button type="button" onClick={async () => {
                  if (!otpEmail) { setOtpMsg('Enter your official email first'); return; }
                  const r = await fetch(`${apiUrl}/api/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: otpEmail }) });
                  const j = await r.json().catch(()=>({}));
                  if (!r.ok) { setOtpMsg(j.error || 'Failed to send OTP'); return; }
                  setOtpMsg(j.emailSent ? `OTP sent to ${otpEmail} (expires 10 min)` : `Dev OTP: ${j.otp} — copy and paste above (email not configured)`);
                  if (j.otp) setOtpCode(j.otp);
                }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>Send / Resend OTP</button>
              </div>
              <input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '15px' }} />
              <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '15px' }} />
              <button type="button" onClick={async () => {
                if (!otpEmail || !otpCode) { setOtpMsg('Email and OTP required'); return; }
                if (newPassword.length < 8) { setOtpMsg('Password must be at least 8 characters'); return; }
                if (newPassword !== confirmPassword) { setOtpMsg('Passwords do not match'); return; }
                const r = await fetch(`${apiUrl}/api/auth/first-password-change`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: otpEmail, otp: otpCode, newPassword }) });
                const j = await r.json().catch(()=>({}));
                if (!r.ok) { setOtpMsg(j.error || 'Failed to change password'); return; }
                setOtpMsg('Password changed — signing you in…');
                const { error } = await supabase.auth.signInWithPassword({ email: otpEmail, password: newPassword });
                if (error) { setOtpMsg('Password changed — please sign in with your new password. ' + error.message); setOtpMode(false); return; }
                setOtpMode(false); setOtpCode(''); setNewPassword(''); setConfirmPassword(''); setOtpMsg('');
              }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '13px', borderRadius: 'var(--radius-xl-sm)', fontWeight: 700, cursor: 'pointer', fontSize: '15px' }}>Verify OTP & Set Password</button>
              <button type="button" onClick={() => { setOtpMode(false); setOtpMsg(''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Back to Sign In</button>
            </div>
          ) : authLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
          ) : (
            <>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setAuthLoading(true);
                try {
                  const loginEmail = email;
                  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
                  if (error) { alert(error.message); return; }
                  const uid = data?.user?.id;
                  if (uid) {
                    const { data: prof } = await supabase.from('users').select('must_change_password, email').eq('auth_user_id', uid).single();
                    if (prof?.must_change_password) {
                      setOtpMode(true); setOtpEmail(prof.email || loginEmail); setOtpMsg('Password change required — request OTP to continue');
                      try {
                        const rr = await fetch(`${apiUrl}/api/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: prof.email || loginEmail }) });
                        const jj = await rr.json().catch(()=>({}));
                        if (rr.ok) setOtpMsg(jj.emailSent ? `OTP sent to ${prof.email || loginEmail}` : `Dev OTP: ${jj.otp}`);
                        if (jj?.otp) setOtpCode(jj.otp);
                      } catch {}
                    }
                  }
                  setEmail(''); setPassword('');
                } catch (err) { alert('Login failed'); } finally { setAuthLoading(false); }
              }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: 'var(--radius-xl)', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '16px' }} />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '16px' }} />
                <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 'var(--radius-xl-sm)', fontWeight: 600, cursor: 'pointer', fontSize: '16px' }}>Sign In</button>
              </form>
              <button type="button" onClick={() => setOtpMode(true)} style={{ display: 'block', margin: '0 auto', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '13.5px', textDecoration: 'underline' }}>First login? Set password with OTP</button>
            </>
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
            {perm('timetable') && myProfile && dbData.timetable.length > 0 && (() => {
              const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
              const todaySlots = dbData.timetable.filter(s => s.day_of_week === dayName).sort((a,b)=>toMinTT(a.start_time)-toMinTT(b.start_time));
              if (todaySlots.length===0) return null;
              return (
                <div style={{ marginTop: '18px', padding: '12px', background: 'var(--bg-saffron)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '8px' }}>My Timetable — {dayName.slice(0,3)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {todaySlots.slice(0,5).map(s => {
                      const k = slotToKeys(s);
                      const lab = k.from===k.to ? FIXED_MAP[k.from]?.label : `${FIXED_MAP[k.from]?.label}→${FIXED_MAP[k.to]?.label}`;
                      return <div key={s.id} style={{ fontSize: '12.5px', lineHeight: 1.35 }}><span style={{ fontWeight: 700, color: 'var(--primary-deep)' }}>{lab}</span> <span style={{ color: 'var(--text-faint)' }}>{fmtTT(s.start_time)}–{fmtTT(s.end_time)}</span><br /><span style={{ color: 'var(--text)' }}>{s.subject || '—'}</span>{s.room ? <span style={{ color: 'var(--text-faint)' }}> · {s.room}</span> : null}</div>;
                    })}
                  </div>
                  <button onClick={() => setActiveModule('timetable')} style={{ marginTop: '8px', background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '99px', cursor: 'pointer', fontSize: '11.5px', color: 'var(--primary)' }}>Open full timetable →</button>
                </div>
              );
            })()}
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

            {/* USERS MODULE — expanded capture */}
            {activeModule === 'users' && (
              <div>
                {userNotice && (
                  <div style={{ background: 'var(--bg-saffron)', border: '1.5px solid var(--accent)', padding: '14px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary-deep)', fontSize: '13.5px' }}>User created — credentials{userNotice.emailSent ? ' emailed' : ''}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Email: <b>{userNotice.email}</b></div>
                    {userNotice.tempPassword && <div style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>Temp password: <code style={{ background: '#fff', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px' }}>{userNotice.tempPassword}</code> <button onClick={() => navigator.clipboard.writeText(userNotice.tempPassword)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Copy</button></div>}
                    {userNotice.otp && <div style={{ fontSize: '13px' }}>OTP: <code style={{ background: '#fff', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>{userNotice.otp}</code> <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>(expires 10 min)</span> <button onClick={() => navigator.clipboard.writeText(userNotice.otp)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '6px' }}>Copy OTP</button></div>}
                    {!userNotice.emailSent && <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Email not configured — share the temp password & OTP manually. Configure SMTP_HOST in backend/.env to auto-email.</div>}
                    <button onClick={() => setUserNotice(null)} style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>Dismiss</button>
                  </div>
                )}
                {canCreate('users') && (
                  <form onSubmit={handleAddUser} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input type="text" placeholder="Full name *" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} required />
                      <input type="email" placeholder="Official email *" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} required />
                      <input type="text" placeholder="Contact number" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 140px' }} />
                      <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '150px' }}>
                        {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {isStaffCat(newRoleCat) && <input placeholder="Employee ID" value={newEmployeeId} onChange={e => setNewEmployeeId(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 140px' }} />}
                      {isStudentCat(newRoleCat) && <input placeholder="Roll No. / Reg No. *" value={newRollNo} onChange={e => setNewRollNo(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 140px' }} required={isStudentCat(newRoleCat)} />}
                      {isStaffCat(newRoleCat) && <input placeholder="Designation" value={newDesignation} onChange={e => setNewDesignation(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px' }} />}
                      {isStudentCat(newRoleCat) && (
                        <select value={newProgramId} onChange={e => setNewProgramId(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} required>
                          <option value="">Course (Program) *</option>
                          {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )}
                      {isStaffCat(newRoleCat) && <input type="date" title="Date of joining" value={newDateOfJoining} onChange={e => setNewDateOfJoining(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} />}
                      {isStudentCat(newRoleCat) && <input type="number" min="2000" max="2100" placeholder="Year of commencement *" title="Year of commencement" value={newYearComm} onChange={e => setNewYearComm(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '170px' }} required />}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add User</button>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>Temp password auto-generated · user must change at first login via OTP to official email</span>
                    </div>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Name</th><th style={{ padding: '10px 12px' }}>Email / Contact</th><th style={{ padding: '10px 12px' }}>Role / Identifiers</th><th style={{ padding: '10px 12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.users.map(u => {
                        const prog = dbData.curriculum.find(d => d.id === u.program_id);
                        return editingUser === u.id ? (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                            <td colSpan={4} style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                <input value={editUserName} onChange={e => setEditUserName(e.target.value)} placeholder="Full name" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 160px' }} />
                                <input value={editUserEmail} onChange={e => setEditUserEmail(e.target.value)} placeholder="Email" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 180px' }} />
                                <input value={editUserPhone} onChange={e => setEditUserPhone(e.target.value)} placeholder="Phone" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 130px' }} />
                                <select value={editUserRoleKey} onChange={e => setEditUserRoleKey(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', minWidth: '150px' }}>
                                  {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                                </select>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                {isStaffCat(editRoleCat) && <input value={editUserEmployeeId} onChange={e => setEditUserEmployeeId(e.target.value)} placeholder="Employee ID" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 130px' }} />}
                                {isStudentCat(editRoleCat) && <input value={editUserRollNo} onChange={e => setEditUserRollNo(e.target.value)} placeholder="Roll No." style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 130px' }} />}
                                {isStaffCat(editRoleCat) && <input value={editUserDesignation} onChange={e => setEditUserDesignation(e.target.value)} placeholder="Designation" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 150px' }} />}
                                {isStudentCat(editRoleCat) && <select value={editUserProgramId} onChange={e => setEditUserProgramId(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 160px' }}><option value="">Program</option>{dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
                                {isStaffCat(editRoleCat) && <input type="date" value={editUserDateOfJoining || ''} onChange={e => setEditUserDateOfJoining(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }} />}
                                {isStudentCat(editRoleCat) && <input type="number" min="2000" max="2100" value={editUserYearComm || ''} onChange={e => setEditUserYearComm(e.target.value)} placeholder="Year" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '110px' }} />}
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => handleUpdateUser(u)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                                <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 600 }}>{u.name}</div><div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{u.designation || ''}{u.must_change_password ? <span style={{ marginLeft: '6px', background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: '99px', fontSize: '10px' }}>password reset required</span> : ''}</div></td>
                            <td style={{ padding: '10px 12px' }}><div style={{ color: 'var(--text-soft)', fontSize: '12.5px' }}>{u.email}</div><div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{u.phone || ''}</div></td>
                            <td style={{ padding: '10px 12px' }}><div style={{ textTransform: 'capitalize' }}>{roles.find(r => r.key === u.role_key)?.name || u.role_key}</div><div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{u.employee_id ? `Emp: ${u.employee_id}` : ''}{u.employee_id && u.roll_no ? ' · ' : ''}{u.roll_no ? `Roll: ${u.roll_no}` : ''}</div><div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{prog ? prog.name : ''}{u.year_of_commencement ? ` · ${u.year_of_commencement}` : ''}{u.date_of_joining ? ` · Joined ${u.date_of_joining}` : ''}</div></td>
                            <td style={{ padding: '10px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {canAdmin('users') && <button onClick={() => { setEditingUser(u.id); setEditUserName(u.name || ''); setEditUserEmail(u.email || ''); setEditUserPhone(u.phone || ''); setEditUserRoleKey(u.role_key || roles[0]?.key || ''); setEditUserEmployeeId(u.employee_id || ''); setEditUserRollNo(u.roll_no || ''); setEditUserDesignation(u.designation || ''); setEditUserProgramId(u.program_id || ''); setEditUserDateOfJoining(u.date_of_joining || ''); setEditUserYearComm(u.year_of_commencement ? String(u.year_of_commencement) : ''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
                              {isFull('users') && <button onClick={() => handleDelete('users', u.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                            </td>
                          </tr>
                        );
                      })}
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
                  <form onSubmit={handleAddDiscipline} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <input placeholder="Program / Discipline name" value={newDiscName} onChange={e => setNewDiscName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 220px' }} required />
                    <input placeholder="Levels (e.g. 2 Years / 4 Semesters)" value={newDiscLevels} onChange={e => setNewDiscLevels(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <select value={newDiscStructure} onChange={e => setNewDiscStructure(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} title="Structure">
                      <option value="semester">Semester only</option>
                      <option value="yearly">Yearly only</option>
                      <option value="yearly_semester">Yearly + Semester</option>
                    </select>
                    {(newDiscStructure === 'yearly' || newDiscStructure === 'yearly_semester') && (
                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: 'var(--text-soft)' }}>Years
                        <input type="number" min="1" max="10" value={newDiscYearCount} onChange={e => setNewDiscYearCount(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '90px' }} />
                      </label>
                    )}
                    {(newDiscStructure === 'semester' || newDiscStructure === 'yearly_semester') && (
                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: 'var(--text-soft)' }}>Sems / Year
                        <input type="number" min="1" max="4" value={newDiscSemPerYear} onChange={e => setNewDiscSemPerYear(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '95px' }} />
                      </label>
                    )}
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Program</button>
                  </form>
                )}

                {/* Programs list — structure defines yearly vs semester breakup (separate boxes). */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Program</th><th style={{ padding: '10px 12px' }}>Levels</th><th style={{ padding: '10px 12px' }}>Structure</th><th style={{ padding: '10px 12px' }}>Description</th><th style={{ padding: '10px 12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.curriculum.length === 0 ? (
                        <tr><td colSpan="5" style={{ padding: '18px', textAlign: 'center', color: 'var(--text-faint)' }}>No programs yet.</td></tr>
                      ) : dbData.curriculum.map(d => (
                        editingDisc === d.id ? (
                          <tr key={d.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                            <td style={{ padding: '8px' }}><input value={discEditName} onChange={e => setDiscEditName(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></td>
                            <td style={{ padding: '8px' }}><input value={discEditLevels} onChange={e => setDiscEditLevels(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></td>
                            <td style={{ padding: '8px' }}>
                              <select value={discEditStructure} onChange={e => setDiscEditStructure(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', marginBottom: '6px' }}>
                                <option value="semester">Semester only</option><option value="yearly">Yearly only</option><option value="yearly_semester">Yearly + Semester</option>
                              </select>
                              {(discEditStructure === 'yearly' || discEditStructure === 'yearly_semester') && <input type="number" min="1" max="10" value={discEditYearCount} onChange={e => setDiscEditYearCount(e.target.value)} placeholder="Years" title="Years" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', marginBottom: '6px' }} />}
                              {(discEditStructure === 'semester' || discEditStructure === 'yearly_semester') && <input type="number" min="1" max="4" value={discEditSemPerYear} onChange={e => setDiscEditSemPerYear(e.target.value)} placeholder="Sems/Year" title="Sems per Year" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} />}
                            </td>
                            <td style={{ padding: '8px' }}><input value={discEditDesc} onChange={e => setDiscEditDesc(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></td>
                            <td style={{ padding: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button onClick={() => handleUpdateDiscipline(d, { name: discEditName.trim(), levels: discEditLevels.trim(), description: discEditDesc.trim(), structure_mode: discEditStructure, year_count: Number(discEditYearCount) || 2, semesters_per_year: Number(discEditSemPerYear) || 2 })} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                              <button onClick={() => setEditingDisc(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.name}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-soft)' }}>{d.levels || '—'}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-soft)', fontSize: '12.5px' }}>
                              {d.structure_mode === 'yearly' ? `Yearly · ${d.year_count || 2} yrs` : d.structure_mode === 'yearly_semester' ? `Yearly + Sem · ${d.year_count || 2}y × ${d.semesters_per_year || 2}/yr` : `Semester · ${d.semesters_per_year || 2}/yr`}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-soft)' }}>{d.description || '—'}</td>
                            <td style={{ padding: '10px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {canAdmin('curriculum') && <button onClick={() => { setEditingDisc(d.id); setDiscEditName(d.name || ''); setDiscEditLevels(d.levels || ''); setDiscEditDesc(d.description || ''); setDiscEditStructure(d.structure_mode || 'semester'); setDiscEditYearCount(d.year_count || 2); setDiscEditSemPerYear(d.semesters_per_year || 2); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
                              {isFull('curriculum') && <button onClick={() => handleDelete('curriculum', d.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>

                {canCreate('curriculum') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    {/* Add Course — 21-field header: periods→hours auto, dynamic exam types, structured COs */}
                    <form onSubmit={handleAddCourse} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <select value={courseDisc} onChange={e => setCourseDisc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', minWidth: '180px' }}>
                          <option value="">Select Program…</option>
                          {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        {dbData.course_types.length === 0 ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-faint)', alignSelf: 'center' }}>No course types — add one below.</span>
                        ) : (
                          <select value={courseType} onChange={e => setCourseType(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                            {dbData.course_types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                          </select>
                        )}
                        {(selectedDiscStructure === 'yearly' || selectedDiscStructure === 'yearly_semester') && (
                          <select value={courseYearLabel} onChange={e => setCourseYearLabel(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        )}
                        {(selectedDiscStructure === 'semester' || selectedDiscStructure === 'yearly_semester') && (
                          <select value={courseSem} onChange={e => setCourseSem(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }}>
                            {courseSemesters.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                        <input placeholder="Code (BCVP310) *" value={courseCode} onChange={e => setCourseCode(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '130px' }} required />
                        <input placeholder="Course Name *" value={courseName} onChange={e => setCourseName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 220px' }} required />
                        <select value={courseKind} onChange={e => setCourseKind(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '110px' }} title="Type">
                          <option value="DSC">DSC</option><option value="SEC">SEC</option><option value="DSE">DSE</option><option value="AECC">AECC</option><option value="GE">GE</option><option value="Core">Core</option>
                        </select>
                        <input type="number" min="0" placeholder="Credits" title="Credits" value={courseCredits} onChange={e => setCourseCredits(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '90px' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>Teaching periods
                          <input type="number" min="0" placeholder="Periods" title="Teaching Periods (45 min each)" value={coursePeriods} onChange={e => setCoursePeriods(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '110px' }} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>Teaching hours (auto)
                          <input type="text" value={derivedHours === '' ? '' : String(derivedHours)} readOnly placeholder="auto" title="Auto: periods × 45 / 60" style={{ padding: '8px', border: '1px solid var(--border)', width: '110px', background: 'var(--bg)', color: 'var(--text-faint)' }} />
                        </label>
                        <span style={{ fontSize: '11px', color: 'var(--text-faint)', alignSelf: 'flex-end', paddingBottom: '8px' }}>periods × 45 min</span>
                        <input type="number" min="0" placeholder="CIE marks" title="CIE Marks" value={courseCie} onChange={e => setCourseCie(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '100px' }} />
                        <input placeholder="CIE duration (e.g. 45 Min)" title="CIE exam duration" value={courseCieDur} onChange={e => setCourseCieDur(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '150px' }} />
                        <input type="number" min="0" placeholder="SEE marks" title="SEE Marks" value={courseSee} onChange={e => setCourseSee(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '100px' }} />
                        <input placeholder="SEE duration (e.g. 1 hour)" title="SEE exam duration" value={courseSeeDur} onChange={e => setCourseSeeDur(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '150px' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={courseExamTypeId} onChange={e => setCourseExamTypeId(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', minWidth: '160px' }} title="Examination Type (dynamic)">
                          <option value="">Examination type…</option>
                          {(dbData.examination_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>or add:</span>
                        <input placeholder="New exam type" value={newExamTypeName} onChange={e => setNewExamTypeName(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', width: '150px' }} />
                        <button type="button" onClick={handleAddExamType} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>+ Add type</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-soft)' }}>Course objectives (one per line)</label>
                        <textarea value={courseObjectives} onChange={e => setCourseObjectives(e.target.value)} rows={3} placeholder="e.g. Add on to existing repertoire..." style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '13.5px' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-soft)' }}>Course outcomes → CO1, CO2… (used for CO mapping in modules)</label>
                          <button type="button" onClick={() => { const n = courseOutcomes.length+1; setCourseOutcomes([...courseOutcomes, { code: `CO${n}`, text: '' }]); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add outcome</button>
                        </div>
                        {courseOutcomes.length === 0 ? (
                          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', padding: '8px', border: '1px dashed var(--border)', borderRadius: '6px' }}>No outcomes yet — click + Add outcome.</div>
                        ) : courseOutcomes.map((o, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ background: 'var(--primary)', color: '#fff', padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, minWidth: '42px', textAlign: 'center' }}>{o.code}</span>
                            <input value={o.text} onChange={e => { const c=[...courseOutcomes]; c[idx]={...c[idx], text:e.target.value}; setCourseOutcomes(c); }} placeholder={`Outcome ${o.code} text`} style={{ flex: 1, padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                            <button type="button" onClick={() => setCourseOutcomes(courseOutcomes.filter((_,i)=>i!==idx).map((x,i)=>({ ...x, code:`CO${i+1}` })))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-soft)' }}>Pedagogy (one per line)</label>
                        <textarea value={coursePedagogy} onChange={e => setCoursePedagogy(e.target.value)} rows={2} placeholder="Live demo involving students..." style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '13.5px' }} />
                      </div>
                      <button type="submit" style={{ alignSelf: 'flex-start', background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Add Course</button>
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
                                {isFull('curriculum') && <button type="button" title="Delete course type" onClick={() => handleDelete('course_types', t.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Delete</button>}
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Select Course — filtered list (fixes "Select vs Add" and ghost after delete). */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-deep)' }}>Select Course:</span>
                  <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}>
                    <option value="">All Programs</option>
                    {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}>
                    <option value="">All Types</option>
                    {dbData.course_types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}>
                    <option value="">All Years</option>
                    {ROMAN.slice(0, 8).map(r => <option key={r} value={`Year ${r}`}>Year {r}</option>)}
                  </select>
                  <select value={filterSem} onChange={e => setFilterSem(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}>
                    <option value="">All Semesters</option>
                    {Array.from({ length: 8 }, (_, i) => `Semester ${ROMAN[i]}`).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {(filterDisc || filterType || filterSem || filterYear) && <button onClick={() => { setFilterDisc(''); setFilterType(''); setFilterSem(''); setFilterYear(''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '99px', cursor: 'pointer', fontSize: '12px' }}>Clear</button>}
                  <span style={{ fontSize: '12px', color: 'var(--text-faint)', marginLeft: 'auto' }}>{(() => { const n = dbData.courses.filter(c => (!filterDisc || c.discipline_id === filterDisc) && (!filterType || c.course_type === filterType) && (!filterSem || c.semester === filterSem) && (!filterYear || c.year_label === filterYear)).length; return n === dbData.courses.length ? `${n} course${n===1?'':'s'}` : `${n} / ${dbData.courses.length} shown`; })()}</span>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', minWidth: '820px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px' }}>Program</th><th style={{ padding: '10px 8px' }}>Code &amp; Course</th><th style={{ padding: '10px 8px' }}>Type</th><th style={{ padding: '10px 8px' }}>Year</th><th style={{ padding: '10px 8px' }}>Semester</th><th style={{ padding: '10px 8px' }}>Credits</th><th style={{ padding: '10px 8px' }}>Hours</th><th style={{ padding: '10px 8px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filtered = dbData.courses.filter(c => (!filterDisc || c.discipline_id === filterDisc) && (!filterType || c.course_type === filterType) && (!filterSem || c.semester === filterSem) && (!filterYear || c.year_label === filterYear));
                        if (filtered.length === 0) return <tr><td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>{dbData.courses.length === 0 ? 'No courses yet — use Add Course above.' : 'No courses match filters.'}</td></tr>;
                        return filtered.map(c => {
                          const prog = dbData.curriculum.find(d => d.id === c.discipline_id);
                          const isEditing = editingCourse === c.id;
                          if (isEditing) {
                            return (
                              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                                <td style={{ padding: '6px' }}><select value={editCourse.discipline_id || ''} onChange={e => setEditCourse({ ...editCourse, discipline_id: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', fontSize: '12px' }}>{dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                                <td style={{ padding: '6px' }}><input value={editCourse.code || ''} onChange={e => setEditCourse({ ...editCourse, code: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '12px' }} placeholder="Code" /><input value={editCourse.name || ''} onChange={e => setEditCourse({ ...editCourse, name: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '140px', fontSize: '12px', marginLeft: '4px' }} placeholder="Name" /></td>
                                <td style={{ padding: '6px' }}><select value={editCourse.course_type || ''} onChange={e => setEditCourse({ ...editCourse, course_type: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '90px' }}>{dbData.course_types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select><select value={editCourse.type || 'DSC'} onChange={e => setEditCourse({ ...editCourse, type: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '70px', marginTop: '4px' }}><option value="DSC">DSC</option><option value="SEC">SEC</option><option value="DSE">DSE</option><option value="AECC">AECC</option><option value="GE">GE</option><option value="Core">Core</option></select></td>
                                <td style={{ padding: '6px' }}><select value={editCourse.year_label || ''} onChange={e => setEditCourse({ ...editCourse, year_label: e.target.value || null, year_number: e.target.value ? ROMAN.indexOf(e.target.value.replace('Year ', '')) + 1 : null })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '90px' }}><option value="">—</option>{ROMAN.slice(0, 8).map(r => <option key={r} value={`Year ${r}`}>Year {r}</option>)}</select></td>
                                <td style={{ padding: '6px' }}><select value={editCourse.semester || ''} onChange={e => setEditCourse({ ...editCourse, semester: e.target.value || null })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '110px' }}><option value="">—</option>{Array.from({ length: 8 }, (_, i) => `Semester ${ROMAN[i]}`).map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                                <td style={{ padding: '6px' }}><input type="number" value={editCourse.credits ?? ''} onChange={e => setEditCourse({ ...editCourse, credits: e.target.value === '' ? '' : Number(e.target.value) })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '56px', fontSize: '12px' }} /></td>
                                <td style={{ padding: '6px' }}><input type="number" value={editCourse.teaching_hours ?? ''} onChange={e => setEditCourse({ ...editCourse, teaching_hours: e.target.value === '' ? '' : Number(e.target.value) })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '56px', fontSize: '12px' }} placeholder="Hrs" /></td>
                                <td style={{ padding: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <button onClick={() => handleUpdateCourse(c.id, { code: editCourse.code, name: editCourse.name, discipline_id: editCourse.discipline_id, course_type: editCourse.course_type, type: editCourse.type, semester: editCourse.semester || null, year_label: editCourse.year_label || null, year_number: editCourse.year_number || null, credits: editCourse.credits === '' ? null : Number(editCourse.credits), teaching_hours: editCourse.teaching_hours === '' ? null : Number(editCourse.teaching_hours) })} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                                  <button onClick={() => setEditingCourse(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                                </td>
                              </tr>
                            );
                          }
                          return (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 8px', color: 'var(--text-soft)', fontSize: '12.5px' }}>{prog?.name || '—'}</td>
                            <td style={{ padding: '10px 8px' }}><b>{c.code}</b><br /><span style={{ color: 'var(--text-soft)' }}>{c.name}</span></td>
                            <td style={{ padding: '10px 8px' }}>{c.type || c.course_type || '—'}</td>
                            <td style={{ padding: '10px 8px' }}>{c.year_label || '—'}</td>
                            <td style={{ padding: '10px 8px' }}>{c.semester || '—'}</td>
                            <td style={{ padding: '10px 8px' }}>{c.credits ?? '—'}</td>
                            <td style={{ padding: '10px 8px', fontSize: '12.5px', color: 'var(--text-soft)' }}>{c.teaching_hours != null ? `${c.teaching_hours}${c.teaching_periods ? ` / ${c.teaching_periods}` : ''}` : '—'}</td>
                            <td style={{ padding: '10px 8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {canAdmin('curriculum') && <button onClick={() => { setEditingCourse(c.id); setEditCourse({ ...c }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
                              {isFull('curriculum') && <button onClick={() => handleDelete('courses', c.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                              <button onClick={() => setActiveSyllabusCourse(c)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Syllabus</button>
                            </td>
                          </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* SYLLABUS DETAIL — structured exactly like the BPA document (BCVP310) */}
                {activeSyllabusCourse && (() => {
                  const progName = dbData.curriculum.find(d => d.id === activeSyllabusCourse.discipline_id)?.name || '—';
                  const semLabel = activeSyllabusCourse.semester ? activeSyllabusCourse.semester.replace('Semester ', '') : '—';
                  const yearLabel = activeSyllabusCourse.year_label || null;
                  return (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', marginTop: '24px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                      <h3 style={{ fontSize: '18px', color: 'var(--primary-deep)', margin: 0 }}>{activeSyllabusCourse.code} — {activeSyllabusCourse.name}</h3>
                      <button onClick={() => setActiveSyllabusCourse(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-faint)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>← Back to Courses</button>
                    </div>

                    {/* Header table — mirrors the image header */}
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', fontSize: '13.5px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Program Name</div>
                          <div style={{ padding: '9px 12px', gridColumn: 'span 3', fontWeight: 600, color: 'var(--primary-deep)' }}>{progName}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Course Name</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.name}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Type</div>
                          <div style={{ padding: '9px 12px' }}>{activeSyllabusCourse.type || activeSyllabusCourse.course_type || '—'}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Code</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)', fontWeight: 600 }}>{activeSyllabusCourse.code}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Semester</div>
                          <div style={{ padding: '9px 12px' }}>{semLabel}{yearLabel ? ` · ${yearLabel}` : ''}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)', fontSize: '12.5px' }}>Teaching Hours / Periods</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.teaching_hours ?? '—'}{activeSyllabusCourse.teaching_periods ? ` / ${activeSyllabusCourse.teaching_periods}` : ''}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>CIE Marks</div>
                          <div style={{ padding: '9px 12px' }}>{activeSyllabusCourse.cie_marks ?? 50}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Credits</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.credits ?? '—'}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>SEE Marks</div>
                          <div style={{ padding: '9px 12px' }}>{activeSyllabusCourse.see_marks ?? 50}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px 110px' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)', fontSize: '12.5px' }}>Examination Type</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.examination_type || '—'}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)', fontSize: '12px', lineHeight: 1.3 }}>Examination Hours<br /><span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-soft)' }}>CIE / SEE</span></div>
                          <div style={{ padding: '9px 12px', fontSize: '12.5px' }}>{activeSyllabusCourse.examination_hours_cie ? `CIE: ${activeSyllabusCourse.examination_hours_cie}` : '—'}{activeSyllabusCourse.examination_hours_see ? ` · SEE: ${activeSyllabusCourse.examination_hours_see}` : ''}</div>
                        </div>
                      </div>
                    </div>

                    {/* Syllabus body — Objectives / Outcomes / Pedagogy / Modules */}
                    <div style={{ padding: '0 20px 20px', display: 'grid', gap: '14px' }}>
                      {!syllabusContent ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '28px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                          No detailed syllabus yet. Click <b>Add Syllabus</b> below to create it from the document.
                        </div>
                      ) : (
                        <>
                          <div style={{ background: 'var(--primary-deep)', color: '#fff', textAlign: 'center', padding: '9px', borderRadius: '6px', fontSize: '13px', letterSpacing: '0.06em', fontWeight: 700 }}>COURSE OBJECTIVES AND OUTCOMES</div>

                          {syllabusContent.objectives?.length > 0 && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '8px 14px', background: 'var(--bg)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)' }}>OBJECTIVES:</div>
                              <ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>
                                {syllabusContent.objectives.map((o, i) => <li key={i} style={{ marginBottom: '6px' }}>{o}</li>)}
                              </ol>
                            </div>
                          )}
                          {syllabusContent.outcomes?.length > 0 && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '8px 14px', background: 'var(--bg)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)' }}>OUTCOMES: <span style={{ fontWeight: 400, color: 'var(--text-soft)' }}>At the end of the course, the student will be able to:</span></div>
                              <ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>
                                {syllabusContent.outcomes.map((o, i) => <li key={i} style={{ marginBottom: '6px' }}>{o}</li>)}
                              </ol>
                            </div>
                          )}
                          {syllabusContent.pedagogy?.length > 0 && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '8px 14px', background: 'var(--bg)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)' }}>Pedagogy:</div>
                              <ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>
                                {syllabusContent.pedagogy.map((p, i) => <li key={i}>{p}</li>)}
                              </ol>
                            </div>
                          )}

                          {syllabusContent.modules?.length > 0 ? syllabusContent.modules.map((mod, mi) => (
                            <div key={mi} style={{ border: '1.5px solid var(--primary)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '9px 14px', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '13.5px' }}>
                                Module {mi + 1} - {mod.title || 'Untitled'}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 120px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Hours:</div>
                                <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border)' }}>{mod.hours || '—'}</div>
                                <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>RBT Level:</div>
                                <div style={{ padding: '8px 12px' }}>{mod.rbt_level || '—'}</div>
                              </div>
                              {(mod.methodology || mod.teaching_methodology) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Teaching Methodology</div>
                                  <div style={{ padding: '8px 12px', color: 'var(--text-soft)', whiteSpace: 'pre-wrap' }}>{mod.methodology || mod.teaching_methodology}</div>
                                </div>
                              )}
                              {mod.topics?.length > 0 && (
                                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                                  <ol style={{ margin: 0, paddingLeft: '20px', color: 'var(--text)', fontSize: '13.5px', lineHeight: 1.6 }}>
                                    {mod.topics.map((t, ti) => <li key={ti}>{t}</li>)}
                                  </ol>
                                </div>
                              )}
                              {mod.description && <div style={{ padding: '10px 14px', color: 'var(--text-soft)', fontSize: '13px', whiteSpace: 'pre-wrap', borderBottom: '1px solid var(--border)' }}>{mod.description}</div>}
                              <div style={{ padding: '8px 14px', background: 'var(--bg-saffron)', fontSize: '12.5px' }}>
                                <b>CO Mapping:</b> <span style={{ color: 'var(--text-soft)' }}>{mod.co_mapping || '—'}</span>
                              </div>
                            </div>
                          )) : (
                            <div style={{ padding: '14px', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-faint)', textAlign: 'center', fontSize: '13px' }}>No modules yet — add them in Edit Syllabus.</div>
                          )}

                          {syllabusContent.assessments && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '8px 14px', background: 'var(--bg)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)' }}>Assessment Plan</div>
                              <pre style={{ margin: 0, padding: '12px 14px', whiteSpace: 'pre-wrap', color: 'var(--text-soft)', fontSize: '13px', fontFamily: 'inherit' }}>{syllabusContent.assessments}</pre>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Postgres modules — structured source of truth (course_modules + topics) */}
                    {(() => {
                      const pgModules = (dbData.course_modules || []).filter(m => m.course_id === activeSyllabusCourse.id).sort((a,b) => (a.module_number||0)-(b.module_number||0));
                      const sumHrs = pgModules.reduce((s,m)=>s+(Number(m.hours)||0),0);
                      const warnHours = activeSyllabusCourse.teaching_hours != null && pgModules.length > 0 && Math.abs(sumHrs - Number(activeSyllabusCourse.teaching_hours)) > 0.01;
                      const coList = (() => { try { const j = activeSyllabusCourse.outcomes_json; if (Array.isArray(j)) return j; if (typeof j==='string') return JSON.parse(j); } catch {} return []; })();
                      return (
                        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--primary-deep)' }}>Modules (Postgres) — {pgModules.length} module{pgModules.length===1?'':'s'}{pgModules.length>0 ? ` · ${sumHrs} hrs` : ''}{warnHours ? <span style={{ marginLeft: '8px', background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '99px', fontSize: '11px' }}>≠ course hours {activeSyllabusCourse.teaching_hours}</span> : ''}</h4>
                          </div>
                          {pgModules.length === 0 ? (
                            <div style={{ padding: '14px', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-faint)', textAlign: 'center', fontSize: '13px' }}>No Postgres modules yet — add one below.</div>
                          ) : pgModules.map((mod) => {
                            const topics = (dbData.course_module_topics || []).filter(t => t.module_id === mod.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
                            return (
                              <div key={mod.id} style={{ border: '1.5px solid var(--primary)', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '9px 14px', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '13.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Module {mod.module_number} — {mod.title}</span>
                                  {canAdmin('curriculum') && <button onClick={() => handleDeleteModule(mod.id)} style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Delete</button>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 120px', fontSize: '13px', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Hours:</div>
                                  <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border)' }}>{mod.hours ?? '—'}</div>
                                  <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>RBT Level:</div>
                                  <div style={{ padding: '8px 12px' }}>{mod.rbt_level || '—'}</div>
                                </div>
                                {mod.methodology && <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', fontSize: '13px', borderBottom: '1px solid var(--border)' }}><div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Teaching Methodology</div><div style={{ padding: '8px 12px', color: 'var(--text-soft)', whiteSpace: 'pre-wrap' }}>{mod.methodology}</div></div>}
                                {topics.length > 0 && <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}><ol style={{ margin: 0, paddingLeft: '20px', color: 'var(--text)', fontSize: '13.5px', lineHeight: 1.6 }}>{topics.map(t => <li key={t.id}>{t.topic}</li>)}</ol></div>}
                                <div style={{ padding: '8px 14px', background: 'var(--bg-saffron)', fontSize: '12.5px' }}><b>CO Mapping:</b> <span style={{ color: 'var(--text-soft)' }}>{mod.co_mapping || '—'}</span></div>
                              </div>
                            );
                          })}
                          {canCreate('curriculum') && (
                            <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary-deep)' }}>Add Module (Postgres)</div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <input placeholder="Module title *" value={modTitle} onChange={e => setModTitle(e.target.value)} style={{ flex: '1 1 220px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                <input placeholder="Hours" type="number" min="0" value={modHours} onChange={e => setModHours(e.target.value)} style={{ width: '90px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                <select value={modRbt} onChange={e => setModRbt(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}>
                                  <option value="Remember">Remember</option><option value="Understand">Understand</option><option value="Apply">Apply</option><option value="Analyze">Analyze</option><option value="Evaluate">Evaluate</option><option value="Create">Create</option>
                                </select>
                              </div>
                              <textarea placeholder="Teaching methodology" value={modMethod} onChange={e => setModMethod(e.target.value)} rows={2} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }} />
                              <textarea placeholder="Topics — one per line" value={modTopicsText} onChange={e => setModTopicsText(e.target.value)} rows={3} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }} />
                              {coList.length > 0 && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-soft)' }}>CO mapping:</span>
                                  {coList.map(o => (
                                    <label key={o.code} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', background: modCo.includes(o.code) ? 'var(--primary)' : 'var(--surface)', color: modCo.includes(o.code) ? '#fff' : 'var(--text)', padding: '3px 8px', borderRadius: '99px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={modCo.includes(o.code)} onChange={e => setModCo(e.target.checked ? [...modCo, o.code] : modCo.filter(c=>c!==o.code))} style={{ accentColor: 'var(--primary)' }} />{o.code}
                                    </label>
                                  ))}
                                </div>
                              )}
                              <button type="button" onClick={handleAddModule} style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Add Module</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {canCreate('curriculum') && (
                      <div style={{ padding: '0 20px 16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => { setEditingSyllabus(true); setSyllabusForm(syllabusContent ? { ...syllabusContent } : { objectives: [], outcomes: [], pedagogy: [], modules: [], assessments: '' }); }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                          {syllabusContent ? 'Edit Syllabus (Mongo)' : 'Add Syllabus (Mongo)'}
                        </button>
                        {syllabusContent && <button onClick={deleteSyllabus} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Delete Mongo Syllabus</button>}
                      </div>
                    )}
                    {editingSyllabus && (
                      <div style={{ margin: '0 20px 20px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                        <h4 style={{ color: 'var(--primary-deep)', marginBottom: '16px' }}>{syllabusContent ? 'Edit' : 'Add'} Detailed Syllabus — matches the document structure</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-soft)', marginBottom: '6px', fontWeight: 600 }}>Course Objectives — one per line (numbered in display)</label>
                            <textarea value={(syllabusForm.objectives || []).join('\n')} onChange={e => setSyllabusForm({ ...syllabusForm, objectives: e.target.value.split('\n').filter(l => l.trim()) })} rows={5} placeholder={"Add on to the existing repertoire of Adi Tala Varnas..." } style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-soft)', marginBottom: '6px', fontWeight: 600 }}>Course Outcomes — one per line (renders as 1) 2) 3) …)</label>
                            <textarea value={(syllabusForm.outcomes || []).join('\n')} onChange={e => setSyllabusForm({ ...syllabusForm, outcomes: e.target.value.split('\n').filter(l => l.trim()) })} rows={5} placeholder={"Sing Tana Varnas in Kalyani and Vasanta..."} style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-soft)', marginBottom: '6px', fontWeight: 600 }}>Pedagogy — one per line (e.g. Live demo involving students)</label>
                            <textarea value={(syllabusForm.pedagogy || []).join('\n')} onChange={e => setSyllabusForm({ ...syllabusForm, pedagogy: e.target.value.split('\n').filter(l => l.trim()) })} rows={4} placeholder={"Live demo involving students\nGuiding how to sing phrase by phrase"} style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px' }} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <label style={{ fontSize: '13px', color: 'var(--text-soft)', fontWeight: 700 }}>Modules — exactly like the image: title / hours / RBT / methodology / topics / CO mapping</label>
                              <button type="button" onClick={() => setSyllabusForm({ ...syllabusForm, modules: [...(syllabusForm.modules || []), { title: '', hours: '', rbt_level: 'L1 to L4', methodology: '', topics: [], co_mapping: '' }] })} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add Module</button>
                            </div>
                            {(syllabusForm.modules || []).length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-faint)', padding: '10px', border: '1px dashed var(--border)', borderRadius: '6px' }}>No modules yet. Click + Add Module and fill as per the document.</div>}
                            {(syllabusForm.modules || []).map((mod, mi) => (
                              <div key={mi} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <b style={{ fontSize: '13px', color: 'var(--primary)' }}>Module {mi + 1}</b>
                                  <button type="button" onClick={() => setSyllabusForm({ ...syllabusForm, modules: (syllabusForm.modules || []).filter((_, i) => i !== mi) })} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                                </div>
                                <input placeholder="Module title — e.g. Tana Varna - Adi Tala" value={mod.title || ''} onChange={e => { const ms = [...(syllabusForm.modules || [])]; ms[mi] = { ...ms[mi], title: e.target.value }; setSyllabusForm({ ...syllabusForm, modules: ms }); }} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <input placeholder="Hours — e.g. 20" value={mod.hours || ''} onChange={e => { const ms = [...(syllabusForm.modules || [])]; ms[mi] = { ...ms[mi], hours: e.target.value }; setSyllabusForm({ ...syllabusForm, modules: ms }); }} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', width: '120px', fontSize: '13px' }} />
                                  <input placeholder="RBT Level — e.g. L1 to L4" value={mod.rbt_level || ''} onChange={e => { const ms = [...(syllabusForm.modules || [])]; ms[mi] = { ...ms[mi], rbt_level: e.target.value }; setSyllabusForm({ ...syllabusForm, modules: ms }); }} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 140px', fontSize: '13px' }} />
                                  <input placeholder="CO Mapping — e.g. CO1" value={mod.co_mapping || ''} onChange={e => { const ms = [...(syllabusForm.modules || [])]; ms[mi] = { ...ms[mi], co_mapping: e.target.value }; setSyllabusForm({ ...syllabusForm, modules: ms }); }} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', width: '130px', fontSize: '13px' }} />
                                </div>
                                <textarea placeholder="Teaching Methodology — one per line" value={mod.methodology || mod.teaching_methodology || ''} onChange={e => { const ms = [...(syllabusForm.modules || [])]; ms[mi] = { ...ms[mi], methodology: e.target.value }; setSyllabusForm({ ...syllabusForm, modules: ms }); }} rows={2} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }} />
                                <textarea placeholder="Topics / Content — one per line (e.g. Kalyani Varna)" value={(mod.topics || []).join('\n')} onChange={e => { const ms = [...(syllabusForm.modules || [])]; ms[mi] = { ...ms[mi], topics: e.target.value.split('\n').filter(l => l.trim()) }; setSyllabusForm({ ...syllabusForm, modules: ms }); }} rows={4} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }} />
                              </div>
                            ))}
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-soft)', marginBottom: '6px', fontWeight: 600 }}>Assessment Plan (free text)</label>
                            <textarea value={syllabusForm.assessments || ''} onChange={e => setSyllabusForm({ ...syllabusForm, assessments: e.target.value })} rows={3} style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px' }} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={handleSaveSyllabus} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                            <button onClick={() => { setEditingSyllabus(false); setSyllabusForm(syllabusContent ? { ...syllabusContent } : {}); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}
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

            {/* ASSIGNMENTS MODULE — v2: course-linked, started→submitted→graded, late detection */}
            {activeModule === 'assignments' && (
              <div>
                {(() => {
                  const isStudent = myProfile && isStudentCat(roleCategory(myProfile.role_key));
                  const newBadgeCount = isStudent ? dbData.assignments.filter(a => !(dbData.assignment_submissions||[]).some(s => s.assignment_id===a.id && s.student_id===myProfile.id)).length : 0;
                  return null;
                })()}
                {isStudentCat(roleCategory(myProfile?.role_key)) && (() => {
                  const subs = dbData.assignment_submissions || [];
                  const mine = myProfile ? subs.filter(s=>s.student_id===myProfile.id) : [];
                  const newCount = dbData.assignments.filter(a=> !mine.some(s=>s.assignment_id===a.id)).length;
                  return newCount ? <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12.5px' }}>🔔 {newCount} new assignment{newCount>1?'s':''} — start to notify your teacher.</div> : null;
                })()}
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
                    <select value={newAssignCourse} onChange={e => { setNewAssignCourse(e.target.value); setNewAssignModule(''); setNewAssignTopic(''); }} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Course (optional)</option>
                      {dbData.courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                    <select value={newAssignModule} onChange={e => { setNewAssignModule(e.target.value); setNewAssignTopic(''); }} disabled={!newAssignCourse} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Unit / Module</option>
                      {assignModules.map(m => <option key={m.id} value={m.id}>{m.module_number}. {m.title}</option>)}
                    </select>
                    <select value={newAssignTopic} onChange={e => setNewAssignTopic(e.target.value)} disabled={!newAssignModule} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Topic</option>
                      {assignTopics.map(tt => <option key={tt.id} value={tt.id}>{tt.topic}</option>)}
                    </select>
                    <input placeholder="or free topic" value={newAssignTopicText} onChange={e => setNewAssignTopicText(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadFile(f, u=>setNewAssignAttachment(u)); e.target.value='';}} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px', fontSize: '12px' }} />
                    <input placeholder="Attachment URL" value={newAssignAttachment} onChange={e => setNewAssignAttachment(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />{uploadingKey && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>uploading…</span>}
                    <textarea placeholder="Description / Instructions" value={newAssignDesc} onChange={e => setNewAssignDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Create Assignment</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.assignments.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No assignments created yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {dbData.assignments.map(a => {
                        const batch = dbData.batches.find(b => b.id === a.batch_id);
                        const course = dbData.courses.find(c => c.id === a.course_id);
                        const mod = dbData.course_modules.find(m => m.id === a.module_id);
                        const top = dbData.course_module_topics.find(tt => tt.id === a.topic_id);
                        const subs = (dbData.assignment_submissions||[]).filter(s => s.assignment_id === a.id);
                        const mySub = myProfile ? subs.find(s => s.student_id === myProfile.id) : null;
                        const isStudent = myProfile && isStudentCat(roleCategory(myProfile.role_key));
                        const due = a.due_date ? new Date(a.due_date + 'T23:59:59') : null;
                        const isOverdue = due && new Date() > due;
                        const started = subs.filter(s=>s.status==='started').length;
                        const submitted = subs.filter(s=>s.status==='submitted').length;
                        const graded = subs.filter(s=>s.status==='graded').length;
                        const late = subs.filter(s=> s.submitted_at && due && new Date(s.submitted_at) > due).length;
                        const onTime = subs.filter(s=> s.submitted_at && due && new Date(s.submitted_at) <= due).length;
                        // ponytail: not-submitted-before-due = started (not yet submitted) + implicitly not-started (no row) — needs enrollments for exact roster count; add when enrollments fetched
                        const topicLabel = top?.topic || a.topic_text || mod?.title || course?.name || '—';
                        const lateFlag = mySub?.submitted_at && due && new Date(mySub.submitted_at) > due;
                        return (
                          <div key={a.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                              <div style={{ flex: '1 1 280px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--primary-deep)', fontSize: '14.5px' }}>{a.title} <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: '11.5px' }}>{a.type?.replace('_',' ') || ''} · {batch?.name || '—'}</span></div>
                                <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginTop: '2px' }}>{course ? <span>{course.code} · {course.name} {mod ? '› ' + mod.title : ''} {top ? '› ' + top.topic : a.topic_text ? '› ' + a.topic_text : ''}</span> : topicLabel !== '—' ? topicLabel : ''} {a.attachment_url ? <a href={a.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', marginLeft: '8px' }}>📎 attachment</a> : null}</div>
                                {a.description ? <div style={{ fontSize: '12.5px', color: 'var(--text-soft)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{a.description}</div> : null}
                                <div style={{ fontSize: '11.5px', color: isOverdue ? '#b45309' : 'var(--text-faint)', marginTop: '4px' }}>Due: {a.due_date} {isOverdue ? '· overdue' : ''} · Status: {a.status || 'open'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {canCreate('assignments') ? (
                                  <select value={a.status || 'open'} onChange={e => handleUpdateAssignmentStatus(a.id, e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }}>
                                    <option value="open">Open</option>
                                    <option value="closed">Closed</option>
                                    <option value="graded">Graded</option>
                                  </select>
                                ) : <span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{a.status || 'open'}</span>}
                                {canAdmin('assignments') && <button onClick={() => handleDelete('assignments', a.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                              </div>
                            </div>
                            {!isStudent ? (
                              <div style={{ marginTop: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-soft)', marginBottom: '6px' }}>
                                  <b style={{ color: 'var(--text)' }}>{subs.length} submission{subs.length!==1?'s':''}</b> · <span style={{ color: '#b45309' }}>{started} started</span> · <span style={{ color: 'var(--primary)' }}>{onTime} on time</span> · <span style={{ color: '#991b1b' }}>{late} late</span> · {submitted} submitted · {graded} graded
                                  {/* ponytail: not-submitted count needs roster (enrollments) — add when enrollments fetched */}
                                </div>
                                {subs.length === 0 ? <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No student activity yet — students' Start will appear here.</div> : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                                    <thead>
                                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }}>
                                        <th style={{ padding: '6px 8px' }}>Student</th><th style={{ padding: '6px 8px' }}>Status</th><th style={{ padding: '6px 8px' }}>Submitted</th><th style={{ padding: '6px 8px' }}>Grade</th><th style={{ padding: '6px 8px' }}></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subs.map(s => {
                                        const u = dbData.users.find(x=>x.id===s.student_id);
                                        const sLate = s.submitted_at && due && new Date(s.submitted_at) > due;
                                        return (
                                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '6px 8px' }}>{u?.name || s.student_id.slice(0,6)} <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{u?.roll_no || ''}</span></td>
                                            <td style={{ padding: '6px 8px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: s.status==='graded' ? 'var(--primary)' : s.status==='submitted' ? '#15803d' : '#b45309', color: '#fff' }}>{s.status}{sLate ? ' · late' : ''}</span></td>
                                            <td style={{ padding: '6px 8px', fontSize: '11.5px', color: 'var(--text-soft)' }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—'}{s.attachment_url ? <a href={s.attachment_url} target="_blank" rel="noreferrer" style={{ marginLeft: '6px', color: 'var(--primary)' }}>📎</a> : ''}</td>
                                            <td style={{ padding: '6px 8px' }}>{s.grade ? <b style={{ color: 'var(--primary-deep)' }}>{s.grade}</b> : <span style={{ color: 'var(--text-faint)' }}>—</span>}{s.feedback ? <span style={{ color: 'var(--text-soft)', fontSize: '11px', marginLeft: '6px' }}>· {s.feedback.slice(0,40)}</span> : null}</td>
                                            <td style={{ padding: '6px 8px' }}><button onClick={()=>handleGradeSubmission(s)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Grade</button></td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            ) : (
                              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {!mySub ? (
                                  <><span style={{ fontSize: '12px', color: 'var(--text-faint)', background: 'var(--bg)', padding: '4px 8px', borderRadius: '99px' }}>Not started</span><button onClick={()=>handleStartAssignment(a)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Start</button></>
                                ) : mySub.status === 'started' ? (
                                  <><span style={{ background: '#b45309', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '11.5px' }}>Started</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadFile(f, u=>setSubmitAttachments(prev=>({ ...prev, [a.id]: u }))); e.target.value='';}} style={{ fontSize: '12px', maxWidth: '180px' }} /><input placeholder="Attachment URL (optional)" value={submitAttachments[a.id] || ''} onChange={e=>setSubmitAttachments(prev=>({ ...prev, [a.id]: e.target.value }))} style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px', maxWidth: '220px' }} /><button onClick={()=>handleSubmitAssignment(a)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Submit{lateFlag ? '' : ''}</button>{mySub.submitted_at && lateFlag ? <span style={{ fontSize: '11px', color: '#991b1b' }}>will be marked late</span> : null}</>
                                ) : mySub.status === 'submitted' ? (
                                  <><span style={{ background: '#15803d', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '11.5px' }}>Submitted{lateFlag ? ' · late' : ' · on time'}</span><span style={{ fontSize: '11.5px', color: 'var(--text-soft)' }}>{mySub.submitted_at ? new Date(mySub.submitted_at).toLocaleDateString() : ''}</span>{mySub.attachment_url ? <a href={mySub.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary)' }}>📎 your file</a> : null}<span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>· awaiting grade</span></>
                                ) : (
                                  <><span style={{ background: 'var(--primary)', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '11.5px' }}>Graded</span>{mySub.grade ? <b style={{ color: 'var(--primary-deep)' }}>{mySub.grade}</b> : null}{mySub.feedback ? <span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>· {mySub.feedback}</span> : null}</>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                    <input placeholder="Job Title" value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 250px' }} />
                    <input placeholder="Department" value={newJobDept} onChange={e => setNewJobDept(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
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

            {/* PROJECTS MODULE — student portfolio */}
            {activeModule === 'projects' && (
              <div>
                {canCreate('projects') && (
                  <form onSubmit={handleAddProject} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select value={newProjBatch} onChange={e => setNewProjBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }}>
                      <option value="">Select Batch…</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input placeholder="Project title" value={newProjTitle} onChange={e => setNewProjTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 250px' }} />
                    <select value={newProjCourse} onChange={e => setNewProjCourse(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }}>
                      <option value="">Course (optional)</option>
                      {dbData.courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                    <input placeholder="Topic / subject (free text)" value={newProjTopic} onChange={e => setNewProjTopic(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadFile(f, u=>setNewProjAttachment(u)); e.target.value='';}} style={{ fontSize: '12px', flex: '1 1 160px' }} />
                    <input placeholder="Attachment URL" value={newProjAttachment} onChange={e => setNewProjAttachment(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                    <textarea placeholder="Description" value={newProjDesc} onChange={e => setNewProjDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Add Project</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {(dbData.projects || []).length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No projects yet — students' own works beyond curriculum appear here.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Student</th><th style={{ padding: '12px' }}>Course / Topic</th><th style={{ padding: '12px' }}>Attachment</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dbData.projects || []).map(p => {
                          const batch = dbData.batches.find(b => b.id === p.batch_id);
                          const student = dbData.users.find(u => u.id === p.student_id);
                          const course = dbData.courses.find(c => c.id === p.course_id);
                          const isOwner = myProfile && String(p.student_id) === String(myProfile.id);
                          const canEdit = isOwner || canAdmin('projects');
                          if (editingProject === p.id) {
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                                <td colSpan={6} style={{ padding: '12px' }}>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <input value={editProj.title ?? p.title} onChange={e => setEditProj(s => ({ ...s, title: e.target.value }))} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 200px' }} />
                                    <input value={editProj.topic_text ?? p.topic_text ?? ''} onChange={e => setEditProj(s => ({ ...s, topic_text: e.target.value }))} placeholder="Topic" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 160px' }} />
                                    <input value={editProj.attachment_url ?? p.attachment_url ?? ''} onChange={e => setEditProj(s => ({ ...s, attachment_url: e.target.value }))} placeholder="Attachment URL" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 200px' }} />
                                  </div>
                                  <textarea value={editProj.description ?? p.description ?? ''} onChange={e => setEditProj(s => ({ ...s, description: e.target.value }))} placeholder="Description" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', minHeight: '60px', marginBottom: '8px' }} />
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={handleSaveProject} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                                    <button onClick={() => { setEditingProject(null); setEditProj({}); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px', fontWeight: 600 }}>{p.title}<div style={{ fontSize: '12px', color: 'var(--text-soft)', fontWeight: 400, whiteSpace: 'pre-wrap' }}>{p.description ? p.description.slice(0, 120) : ''}</div></td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '12px' }}>{student?.name || p.student_id.slice(0, 6)} <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{student?.roll_no || ''}</span></td>
                              <td style={{ padding: '12px', fontSize: '12.5px', color: 'var(--text-soft)' }}>{course ? course.code + ' · ' + course.name : ''}{p.topic_text ? (course ? ' › ' : '') + p.topic_text : ''}{!course && !p.topic_text ? '—' : ''}</td>
                              <td style={{ padding: '12px' }}>{p.attachment_url ? <a href={p.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>📎 file</a> : '—'}</td>
                              <td style={{ padding: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {canEdit && <button onClick={() => { setEditingProject(p.id); setEditProj({ title: p.title, description: p.description || '', topic_text: p.topic_text || '', attachment_url: p.attachment_url || '' }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
                                {canEdit && <button onClick={() => handleDelete('projects', p.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
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

            {/* CERTIFICATES MODULE — institutional + external uploads */}
            {activeModule === 'certificates' && (
              <div>
                {canCreate('certificates') && (
                  <form onSubmit={handleAddCertificate} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input placeholder="Certificate title *" value={newCertTitle} onChange={e => setNewCertTitle(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 250px' }} />
                    <input placeholder="Issuer (e.g. NDG / External org)" value={newCertIssuer} onChange={e => setNewCertIssuer(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                    <input type="date" value={newCertDate} onChange={e => setNewCertDate(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                    <select value={newCertType} onChange={e => setNewCertType(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <option value="external">External</option>
                      <option value="institutional">Institutional</option>
                    </select>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadFile(f, u=>setNewCertFile(u)); e.target.value='';}} style={{ fontSize: '12px', flex: '1 1 160px' }} />
                    <input placeholder="File URL" value={newCertFile} onChange={e => setNewCertFile(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 200px' }} />{uploadingKey && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>uploading…</span>}
                    <textarea placeholder="Description" value={newCertDesc} onChange={e => setNewCertDesc(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 100%', minHeight: '60px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', flex: '1 1 100%' }}>Add Certificate</button>
                  </form>
                )}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {(dbData.certificates || []).length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No certificates yet — upload institutional or external achievements here.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Title</th><th style={{ padding: '12px' }}>Student</th><th style={{ padding: '12px' }}>Issuer</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Type</th><th style={{ padding: '12px' }}>File</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dbData.certificates || []).map(c => {
                          const student = dbData.users.find(u => u.id === c.student_id);
                          const isOwner = myProfile && String(c.student_id) === String(myProfile.id);
                          const canEdit = isOwner || canAdmin('certificates');
                          if (editingCert === c.id) {
                            return (
                              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                                <td colSpan={7} style={{ padding: '12px' }}>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <input value={editCert.title ?? c.title} onChange={e => setEditCert(s => ({ ...s, title: e.target.value }))} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 200px' }} />
                                    <input value={editCert.issuer ?? c.issuer ?? ''} onChange={e => setEditCert(s => ({ ...s, issuer: e.target.value }))} placeholder="Issuer" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 160px' }} />
                                    <input type="date" value={editCert.issue_date ?? c.issue_date ?? ''} onChange={e => setEditCert(s => ({ ...s, issue_date: e.target.value }))} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }} />
                                    <input value={editCert.file_url ?? c.file_url ?? ''} onChange={e => setEditCert(s => ({ ...s, file_url: e.target.value }))} placeholder="File URL" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 200px' }} />
                                  </div>
                                  <textarea value={editCert.description ?? c.description ?? ''} onChange={e => setEditCert(s => ({ ...s, description: e.target.value }))} placeholder="Description" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', minHeight: '60px', marginBottom: '8px' }} />
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={handleSaveCert} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                                    <button onClick={() => { setEditingCert(null); setEditCert({}); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px', fontWeight: 600 }}>{c.title} {c.verified ? <span style={{ marginLeft: '6px', background: '#15803d', color: '#fff', padding: '1px 6px', borderRadius: '99px', fontSize: '10px' }}>verified</span> : null}<div style={{ fontSize: '12px', color: 'var(--text-soft)', fontWeight: 400 }}>{c.description ? c.description.slice(0, 100) : ''}</div></td>
                              <td style={{ padding: '12px' }}>{student?.name || c.student_id.slice(0, 6)}</td>
                              <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{c.issuer || '—'}</td>
                              <td style={{ padding: '12px' }}>{c.issue_date || '—'}</td>
                              <td style={{ padding: '12px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', background: c.certificate_type === 'institutional' ? 'var(--primary)' : 'var(--accent)', color: '#fff' }}>{c.certificate_type}</span></td>
                              <td style={{ padding: '12px' }}>{c.file_url ? <a href={c.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>📎 view</a> : '—'}</td>
                              <td style={{ padding: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {canAdmin('certificates') && <button onClick={() => handleVerifyCert(c)} style={{ background: c.verified ? 'var(--text-faint)' : 'var(--primary)', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>{c.verified ? 'Unverify' : 'Verify'}</button>}
                                {canEdit && <button onClick={() => { setEditingCert(c.id); setEditCert({ title: c.title, issuer: c.issuer || '', issue_date: c.issue_date || '', file_url: c.file_url || '', description: c.description || '' }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
                                {canEdit && <button onClick={() => handleDelete('certificates', c.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
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
                          if (editingBatch === b.id) return (
                            <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                              <td style={{ padding: '8px' }}><input value={editBatchName} onChange={e => setEditBatchName(e.target.value)} placeholder="Batch name" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></td>
                              <td style={{ padding: '8px' }}><select value={editBatchDisc} onChange={e => setEditBatchDisc(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }}><option value="">—</option>{dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                              <td style={{ padding: '8px' }}><input value={editBatchLevel} onChange={e => setEditBatchLevel(e.target.value)} placeholder="Level" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></td>
                              <td style={{ padding: '8px' }}><select value={editBatchFaculty} onChange={e => setEditBatchFaculty(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }}><option value="">—</option>{dbData.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                              <td style={{ padding: '8px' }}><input type="number" min="1" value={editBatchCapacity} onChange={e => setEditBatchCapacity(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px' }} /></td>
                              <td style={{ padding: '8px' }}><span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', background: b.status === 'active' ? 'var(--primary)' : 'var(--text-faint)', color: '#fff' }}>{b.status}</span></td>
                              <td style={{ padding: '8px', display: 'flex', gap: '6px' }}><button onClick={() => handleUpdateBatch(b.id)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button><button onClick={() => setEditingBatch(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button></td>
                            </tr>
                          );
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
                              <td style={{ padding: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {canAdmin('batches') && <button onClick={() => { setEditingBatch(b.id); setEditBatchName(b.name || ''); setEditBatchDisc(b.discipline_id || ''); setEditBatchLevel(b.level || ''); setEditBatchFaculty(b.faculty_id || ''); setEditBatchCapacity(b.capacity ?? 20); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
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

            {/* TIMETABLE — fixed 08:15–16:00 grid: day × period with clubbed colspan + per-user in sidebar */}
            {activeModule === 'timetable' && (
              <div>
                {canCreate('timetable') && (
                  <form onSubmit={handleAddSlot} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <select value={newSlotBatch} onChange={e => setNewSlotBatch(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px' }}>
                      <option value="">Batch *</option>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select value={newSlotDay} onChange={e => setNewSlotDay(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {DAYS.slice(0,6).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Period from
                      <select value={newSlotFrom} onChange={e => { setNewSlotFrom(e.target.value); const fi=FIXED_TT.findIndex(c=>c.key===e.target.value), ti=FIXED_TT.findIndex(c=>c.key===newSlotTo); if(ti<fi) setNewSlotTo(e.target.value); }} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', display: 'block', minWidth: '120px' }}>
                        {FIXED_TEACH.map(c => <option key={c.key} value={c.key}>{c.label} · {c.start}–{c.end}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>to
                      <select value={newSlotTo} onChange={e => setNewSlotTo(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', display: 'block', minWidth: '120px' }}>
                        {FIXED_TEACH.filter(c => FIXED_TT.findIndex(x=>x.key===c.key) >= FIXED_TT.findIndex(x=>x.key===newSlotFrom) && ttSegmentOf(c.key)===ttSegmentOf(newSlotFrom)).map(c => <option key={c.key} value={c.key}>{c.label} · {c.end}</option>)}
                      </select>
                    </label>
                    <input placeholder="Class / Topic * (e.g. Practical 1, Theory)" value={newSlotSubject} onChange={e => setNewSlotSubject(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                    <input placeholder="Room (optional)" value={newSlotRoom} onChange={e => setNewSlotRoom(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '130px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add Slot</button>
                  </form>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '10px', lineHeight: 1.5 }}>Fixed columns: <b>1</b> 08:15–09:00 · <b>2</b> 09:00–09:45 · <b>3</b> 09:45–10:30 · <b>BREAK</b> 10:30–10:45 · <b>4</b> 10:45–11:30 · <b>5</b> 11:30–12:15 · <b>LUNCH</b> 12:15–13:00 · <b>NAP</b> 13:00–13:25 · <b>EXTRA</b> 13:30–14:30 · <b>STUDY</b> 14:30–16:00 — club within 1-3, 4-5, or Extra+Study (spans columns).</div>

                {/* Batch picker for the weekly grid */}
                {dbData.batches.length > 0 && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-soft)', fontWeight: 600 }}>Grid for batch</label>
                    <select value={timetableBatch} onChange={e => setTimetableBatch(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>Fixed grid — header period, sub-header timing, cell class (clubbed via colspan)</span>
                  </div>
                )}

                {/* Fixed weekly grid — 10 cols, breaks shaded, clubbed slots colspan */}
                {(() => {
                  const batchId = timetableBatch || (dbData.batches[0]?.id || '');
                  const batchSlots = batchId ? dbData.timetable.filter(s => s.batch_id === batchId) : [];
                  if (!batchId) return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13.5px', marginBottom: '16px' }}>Create a batch and add slots to see the weekly grid.</div>;
                  if (batchSlots.length === 0) return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13.5px', marginBottom: '16px' }}>No slots for this batch yet — add the first period above (pick From/To to club periods).</div>;
                  const gridDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                  const daySlots = (day) => batchSlots.filter(s=>s.day_of_week===day);
                  const coveredForDay = (day) => {
                    const m=new Set();
                    daySlots(day).forEach(s=>{
                      const {from,to}=slotToKeys(s);
                      const fi=FIXED_TT.findIndex(c=>c.key===from), ti=FIXED_TT.findIndex(c=>c.key===to);
                      for(let i=fi;i<=ti;i++){ const k=FIXED_TT[i]?.key; if(k&&k!==from) m.add(k); }
                    });
                    return m;
                  };
                  const starterForDay = (day, colKey) => {
                    return daySlots(day).find(s=>{
                      const {from}=slotToKeys(s);
                      return from===colKey;
                    }) || null;
                  };
                  return (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'auto', marginBottom: '16px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '980px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                            <th style={{ padding: '10px 8px', borderRight: '1px solid var(--border)', minWidth: '84px', textAlign: 'left' }}>DAY</th>
                            {FIXED_TT.map(col => (
                              <th key={col.key} style={{ padding: '8px 4px', borderRight: '1px solid var(--border)', minWidth: col.kind==='break' ? '82px' : '96px', fontWeight: col.kind==='break' ? 600 : 700, color: col.kind==='break' ? 'var(--text-faint)' : 'var(--primary-deep)', background: col.kind==='break' ? 'var(--bg-saffron)' : 'var(--bg)', fontSize: col.kind==='break' ? '11px' : '13px' }}>{col.label}</th>
                            ))}
                          </tr>
                          <tr style={{ background: 'var(--bg-saffron)', borderBottom: '2px solid var(--border)', textAlign: 'center', fontSize: '11px', color: 'var(--text-soft)' }}>
                            <th style={{ padding: '5px 8px', borderRight: '1px solid var(--border)', fontWeight: 600, textAlign: 'left' }}></th>
                            {FIXED_TT.map(col => <th key={col.key} style={{ padding: '5px 2px', borderRight: '1px solid var(--border)', fontWeight: 500, whiteSpace: 'nowrap', background: col.kind==='break' ? 'var(--bg-saffron)' : '#fff' }}>{col.start}–{col.end.slice(0,5)}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {gridDays.map(day => {
                            const covered=coveredForDay(day);
                            return (
                              <tr key={day} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 8px', fontWeight: 700, background: 'var(--bg)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{day.slice(0, 3).toUpperCase()}</td>
                                {FIXED_TT.map(col => {
                                  if (covered.has(col.key)) return null;
                                  if (col.kind==='break') {
                                    return <td key={col.key} style={{ padding: '10px 4px', borderRight: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg-saffron)', color: 'var(--text-faint)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em' }}>{col.label}</td>;
                                  }
                                  const slot=starterForDay(day, col.key);
                                  if (!slot) return <td key={col.key} style={{ padding: '8px 4px', borderRight: '1px solid var(--border)', textAlign: 'center', verticalAlign: 'middle', background: 'var(--surface)', color: 'var(--text-faint)', fontSize: '12px' }}>—</td>;
                                  const {from,to}=slotToKeys(slot);
                                  const fi=FIXED_TT.findIndex(c=>c.key===from), ti=FIXED_TT.findIndex(c=>c.key===to);
                                  const span=Math.max(1, ti-fi+1);
                                  return (
                                    <td key={col.key} colSpan={span} style={{ padding: '8px 6px', borderRight: '1px solid var(--border)', textAlign: 'center', verticalAlign: 'middle', background: 'var(--surface)' }}>
                                      <div style={{ fontWeight: 600, color: 'var(--primary-deep)', fontSize: '13px', lineHeight: 1.25 }}>{slot.subject || '—'}</div>
                                      {slot.room ? <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>{slot.room}</div> : null}
                                      {span>1 ? <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '2px' }}>({span} periods)</div> : null}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>Fixed PERIOD → timing → class. Club periods via From/To (within 1-3, 4-5, Extra+Study) — grid spans columns. BREAK/LUNCH/NAP always fixed columns.</div>
                    </div>
                  );
                })()}

                {/* Editable slot list — Now From/To period selects, derived times */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  {dbData.timetable.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No slots yet — add the first weekly class slot above.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Day</th><th style={{ padding: '12px' }}>Periods</th><th style={{ padding: '12px' }}>Time</th><th style={{ padding: '12px' }}>Class / Topic</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Room</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.slice(0,6).map(day =>
                          dbData.timetable.filter(s => s.day_of_week === day).sort((a,b) => toMinTT(a.start_time) - toMinTT(b.start_time)).map(s => {
                            if (editingSlot === s.id) return (
                              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                                <td style={{ padding: '8px' }}><select value={editSlotDay} onChange={e => setEditSlotDay(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }}>{DAYS.slice(0,6).map(d => <option key={d} value={d}>{d}</option>)}</select></td>
                                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                  <select value={editSlotFrom} onChange={e => { setEditSlotFrom(e.target.value); const fi=FIXED_TT.findIndex(c=>c.key===e.target.value), ti=FIXED_TT.findIndex(c=>c.key===editSlotTo); if(ti<fi) setEditSlotTo(e.target.value); }} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }}>{FIXED_TEACH.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                                  {' → '}
                                  <select value={editSlotTo} onChange={e => setEditSlotTo(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }}>{FIXED_TEACH.filter(c => FIXED_TT.findIndex(x=>x.key===c.key) >= FIXED_TT.findIndex(x=>x.key===editSlotFrom) && ttSegmentOf(c.key)===ttSegmentOf(editSlotFrom)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                                </td>
                                <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-soft)' }}>{FIXED_MAP[editSlotFrom]?.start || ''}–{FIXED_MAP[editSlotTo]?.end || ''}</td>
                                <td style={{ padding: '8px' }}><input value={editSlotSubject} onChange={e => setEditSlotSubject(e.target.value)} placeholder="Class / Topic" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></td>
                                <td style={{ padding: '8px' }}><select value={editSlotBatch} onChange={e => setEditSlotBatch(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }}>{dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                                <td style={{ padding: '8px' }}><input value={editSlotRoom} onChange={e => setEditSlotRoom(e.target.value)} placeholder="optional" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100px' }} /></td>
                                <td style={{ padding: '8px', display: 'flex', gap: '6px' }}><button onClick={() => handleUpdateSlot(s.id)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button><button onClick={() => setEditingSlot(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button></td>
                              </tr>
                            );
                            const batch = dbData.batches.find(b => b.id === s.batch_id);
                            const {from,to}=slotToKeys(s);
                            const fc=FIXED_MAP[from], tc=FIXED_MAP[to];
                            const perLabel = from===to ? (fc?.label||from) : `${fc?.label||from}→${tc?.label||to}`;
                            return (
                              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '12px', fontWeight: 600 }}>{day}</td>
                                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>{perLabel}</td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-soft)' }}>{fmtTT(s.start_time)}–{fmtTT(s.end_time)}</td>
                                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--primary-deep)' }}>{s.subject || <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>—</span>}</td>
                                <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                                <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{s.room || <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                                <td style={{ padding: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {canAdmin('timetable') && <button onClick={() => { const k=slotToKeys(s); setEditingSlot(s.id); setEditSlotDay(s.day_of_week); setEditSlotFrom(k.from); setEditSlotTo(k.to); setEditSlotRoom(s.room || ''); setEditSlotSubject(s.subject || ''); setEditSlotBatch(s.batch_id); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
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

                {/* ── Class completion loop — log what was taught ── */}
                {canCreate('timetable') && (
                  <form onSubmit={handleAddClassEntry} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginTop: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 220px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-soft)', display: 'block', marginBottom: '4px' }}>Slot</label>
                      <select value={ceSlot} onChange={e => setCeSlot(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '100%' }}>
                        <option value="">Pick slot…</option>
                        {dbData.timetable.map(s => {
                          const b = dbData.batches.find(x => x.id === s.batch_id);
                          return <option key={s.id} value={s.id}>{s.day_of_week} {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)} · {b?.name || s.batch_id.slice(0, 6)} · {s.room}</option>;
                        })}
                      </select>
                    </div>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Date <input type="date" value={ceDate} onChange={e => setCeDate(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', display: 'block' }} /></label>
                    <div style={{ flex: '1 1 160px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-soft)', display: 'block', marginBottom: '4px' }}>Course (curriculum)</label>
                      <select value={ceCourse} onChange={e => { setCeCourse(e.target.value); setCeModule(''); setCeTopic(''); }} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '100%' }}>
                        <option value="">— no course —</option>
                        {dbData.courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-soft)', display: 'block', marginBottom: '4px' }}>Module</label>
                      <select value={ceModule} onChange={e => { setCeModule(e.target.value); setCeTopic(''); }} disabled={!ceCourse} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '100%' }}>
                        <option value="">—</option>
                        {ceModules.map(m => <option key={m.id} value={m.id}>{m.module_number}. {m.title}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-soft)', display: 'block', marginBottom: '4px' }}>Topic</label>
                      <select value={ceTopic} onChange={e => setCeTopic(e.target.value)} disabled={!ceModule} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '100%' }}>
                        <option value="">—</option>
                        {ceTopics.map(t => <option key={t.id} value={t.id}>{t.topic}</option>)}
                      </select>
                    </div>
                    <input placeholder="or free topic" value={ceTopicText} onChange={e => setCeTopicText(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <input placeholder="notes (optional)" value={ceNotes} onChange={e => setCeNotes(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Log class</button>
                  </form>
                )}

                {/* Entries + student confirmations */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginTop: '16px' }}>
                  {(dbData.class_entries || []).length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>No classes logged yet — teacher logs what was taught per slot per date; students confirm.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px' }}>Date</th><th style={{ padding: '10px 12px' }}>Slot</th><th style={{ padding: '10px 12px' }}>Batch</th><th style={{ padding: '10px 12px' }}>What was taught</th><th style={{ padding: '10px 12px' }}>Taught by</th><th style={{ padding: '10px 12px' }}>Confirm</th><th style={{ padding: '10px 12px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dbData.class_entries || []).slice().sort((a, b) => String(b.class_date).localeCompare(String(a.class_date))).map(entry => {
                          const slot = dbData.timetable.find(s => s.id === entry.timetable_slot_id);
                          const batch = dbData.batches.find(b => b.id === entry.batch_id);
                          const course = dbData.courses.find(c => c.id === entry.course_id);
                          const mod = dbData.course_modules.find(m => m.id === entry.module_id);
                          const top = dbData.course_module_topics.find(t => t.id === entry.topic_id);
                          const taughtBy = dbData.users.find(u => u.id === entry.taught_by);
                          const myConf = myProfile ? (dbData.class_confirmations || []).find(c => c.class_entry_id === entry.id && c.student_id === myProfile.id) : null;
                          const confs = (dbData.class_confirmations || []).filter(c => c.class_entry_id === entry.id);
                          const confirmed = confs.filter(c => c.status === 'confirmed').length;
                          const disputed = confs.filter(c => c.status === 'disputed').length;
                          const pending = confs.filter(c => c.status === 'pending').length;
                          const topicLabel = top?.topic || mod?.title || course?.name || entry.topic_text || '—';
                          const who = taughtBy?.name || '—';
                          const isStudent = myProfile && isStudentCat(roleCategory(myProfile.role_key));
                          return (
                            <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{entry.class_date}</td>
                              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-soft)', fontSize: '12.5px' }}>{slot ? `${slot.day_of_week.slice(0, 3)} ${slot.start_time?.slice(0, 5)}–${slot.end_time?.slice(0, 5)} · ${slot.room}` : '—'}</td>
                              <td style={{ padding: '10px 12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                              <td style={{ padding: '10px 12px' }}><b style={{ color: 'var(--primary-deep)' }}>{topicLabel}</b>{course ? <span style={{ color: 'var(--text-faint)', fontSize: '11.5px' }}> · {course.code}</span> : null}<br /><span style={{ fontSize: '11.5px', color: 'var(--text-soft)' }}>{entry.topic_text && top ? entry.topic_text : ''}{entry.notes ? ` — ${entry.notes}` : ''}</span></td>
                              <td style={{ padding: '10px 12px', fontSize: '12.5px', color: 'var(--text-soft)' }}>{who}</td>
                              <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                                {isStudent ? (
                                  myConf?.status === 'confirmed' ? <span style={{ background: 'var(--primary)', color: '#fff', padding: '2px 8px', borderRadius: '99px' }}>confirmed ✓</span>
                                    : myConf?.status === 'disputed' ? <span style={{ background: '#b45309', color: '#fff', padding: '2px 8px', borderRadius: '99px' }}>disputed</span>
                                      : <span style={{ display: 'flex', gap: '4px' }}><button onClick={() => handleConfirm(entry, 'confirmed')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Confirm</button><button onClick={() => handleConfirm(entry, 'disputed')} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Dispute</button></span>
                                ) : (
                                  <span style={{ color: 'var(--text-faint)', fontSize: '11.5px' }} title="confirmations">{confirmed}✓ {disputed ? `· ${disputed} disputed` : ''}{pending ? ` · ${pending} pending` : ''}{disputed ? ' ⚠ mismatch' : ''}</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isStudent && myConf && myConf.status !== 'pending' && <button onClick={() => handleConfirm(entry, myConf.status === 'confirmed' ? 'disputed' : 'confirmed')} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>switch</button>}
                                {canAdmin('timetable') && <button onClick={() => handleDelete('class_entries', entry.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginLeft: '4px' }}>Delete</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Analytics: taught vs confirmed, syllabus %, hours left */}
                {(() => {
                  const entries = dbData.class_entries || [];
                  const confs = dbData.class_confirmations || [];
                  const total = entries.length;
                  const confirmedConfs = confs.filter(c => c.status === 'confirmed').length;
                  const disputedConfs = confs.filter(c => c.status === 'disputed').length;
                  const perCourse = {};
                  entries.forEach(e => {
                    const k = e.course_id || '_free';
                    perCourse[k] = (perCourse[k] || 0) + 1;
                  });
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '14px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Classes logged</div>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary)' }}>{total}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginTop: '4px' }}>{confirmedConfs} confirmed · {disputedConfs} disputed{disputedConfs ? ' ⚠ gap' : ''}</div>
                      </div>
                      {Object.entries(perCourse).slice(0, 6).map(([cid, cnt]) => {
                        const course = dbData.courses.find(c => c.id === cid);
                        const name = course ? `${course.code} ${course.name}` : 'Free topic';
                        const totalTopics = course ? (dbData.course_module_topics || []).filter(t => { const m = dbData.course_modules.find(mm => mm.id === t.module_id); return m?.course_id === cid; }).length : 0;
                        const taughtTopics = course ? new Set(entries.filter(e => e.course_id === cid && e.topic_id).map(e => e.topic_id)).size : 0;
                        const pct = totalTopics ? Math.round(taughtTopics / totalTopics * 100) : 0;
                        const hrsTotal = course?.teaching_hours ?? null;
                        // ponytail: 1 class = 1 period = 0.75h; upgrade to slot duration when timetable stores period count
                        const hrsUsed = Math.round(cnt * 0.75 * 100) / 100;
                        const hrsLeft = hrsTotal !== null ? Math.round((Number(hrsTotal) - hrsUsed) * 100) / 100 : null;
                        return (
                          <div key={cid} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '14px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary-deep)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginTop: '4px' }}>{cnt} class{cnt === 1 ? '' : 'es'} logged{totalTopics ? ` · ${taughtTopics}/${totalTopics} topics · ${pct}%` : ''}</div>
                            {hrsTotal !== null && <div style={{ fontSize: '12px', color: hrsLeft !== null && hrsLeft < 0 ? 'var(--primary)' : 'var(--text-soft)', marginTop: '2px' }}>{hrsUsed}h taught{hrsLeft !== null ? ` · ${hrsLeft}h left of ${hrsTotal}h` : ''}</div>}
                            {disputedConfs ? <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px' }}>teacher vs student mismatch — review disputed rows above</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
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
                  {(dbData.lesson_plans || []).length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No lesson plans yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px' }}>Subject</th><th style={{ padding: '12px' }}>Batch</th><th style={{ padding: '12px' }}>Date</th><th style={{ padding: '12px' }}>Status</th><th style={{ padding: '12px' }}>Reviewer note</th><th style={{ padding: '12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dbData.lesson_plans || []).map(p => {
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
                                  <button onClick={() => handlePlanTransition(p.id, 'submitted', '')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Submit for review</button>
                                )}
                                {canAdmin('lessonplans') && p.status === 'submitted' && (
                                  <>
                                    <button onClick={() => handlePlanTransition(p.id, 'approved', '')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>Approve</button>
                                    <button onClick={() => handlePlanTransition(p.id, 'needs_revision', '')} style={{ background: 'var(--text-faint)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Return</button>
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
                <form onSubmit={handleAddRole} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input placeholder="Role name (e.g. Examiner)" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                  <input placeholder="Description" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', flex: '1 1 200px' }} />
                  <select value={newRoleCategory} onChange={e => setNewRoleCategory(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)' }} title="Category">
                    <option value="staff">Staff</option><option value="student">Student</option><option value="both">Both</option>
                  </select>
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
                            <input value={editRoleName} onChange={e => setEditRoleName(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', flex: '1 1 140px' }} />
                            <input value={editRoleDesc} onChange={e => setEditRoleDesc(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                            <select value={editRoleCategory} onChange={e => setEditRoleCategory(e.target.value)} disabled={fixed} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px' }}>
                              <option value="staff">Staff</option><option value="student">Student</option><option value="both">Both</option>{fixed && <option value="system">System</option>}
                            </select>
                            <button onClick={() => handleUpdateRole(r.id)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Save</button>
                            <button onClick={() => setEditingRole(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <b style={{ color: 'var(--primary)', fontSize: '15px' }}>{r.name}</b>
                            {fixed && <span style={{ fontSize: '11px', background: 'var(--surface-muted)', padding: '2px 10px', borderRadius: '99px', color: 'var(--text-soft)' }}>fixed</span>}
                            <span style={{ fontSize: '11px', background: 'var(--bg)', padding: '2px 8px', borderRadius: '99px', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>{r.category || 'staff'}</span>
                            <span style={{ color: 'var(--text-soft)', fontSize: '13px', flex: '1 1 160px' }}>{r.description}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{granted} module{granted === 1 ? '' : 's'}</span>
                            <button onClick={() => setOpenRole(openRole === r.key ? null : r.key)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Permissions</button>
                            {!fixed && <button onClick={() => { setEditingRole(r.id); setEditRoleName(r.name); setEditRoleDesc(r.description || ''); setEditRoleCategory(r.category || 'staff'); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}>Edit</button>}
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
