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
    { key: 'roles', name: 'Roles & Permissions', desc: 'Create roles and set what each can do in every module.' },
    { key: 'teachinglogs', name: 'Teaching Logs', desc: 'Weekly class logs & XLSX exports (Mon–Sat).' }
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
    users: [], curriculum: [], batches: [], timetable: [], timetable_periods: [],
    events: [], enquiries: [], jobs: [], courses: [], course_modules: [], course_module_topics: [], examination_types: [],
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
        ['users', 'users'], ['curriculum', 'curriculum'], ['batches', 'batches'], ['timetable', 'timetable'], ['timetable_periods', 'timetable_periods'],
        ['events', 'events'], ['enquiries', 'enquiries'], ['jobs', 'jobs'], ['courses', 'courses'],
        ['course_modules', 'course_modules'], ['course_module_topics', 'course_module_topics'], ['examination_types', 'examination_types'], ['program_categories', 'program_categories'], ['course_syllabi', 'course_syllabi'], ['liveclasses', 'live_sessions'],
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

  const roleCategory = (key) => {
    const found = roles.find(r => r.key === key);
    if (found?.category) return found.category;
    if (key === 'student' || key === 'students') return 'student';
    if (key === 'super_admin') return 'system';
    if (key === 'teacher' || key === 'teaching_faculty') return 'staff';
    return 'staff';
  };
  const newRoleCat = roleCategory(newUserRole);
  const editRoleCat = roleCategory(editUserRoleKey);
  const isStudentCat = (c) => c === 'student' || c === 'both';
  const isStaffCat = (c) => c === 'staff' || c === 'both' || c === 'system';
  const hasSuperAdminUser = (dbData.users || []).some(u => u.role_key === 'super_admin');
  useEffect(() => {
    if (newRoleCat === 'student') { setNewEmployeeId(''); setNewDesignation(''); setNewDateOfJoining(''); }
    else if (newRoleCat === 'staff' || newRoleCat === 'system') { setNewRollNo(''); setNewProgramId(''); setNewYearComm(''); }
  }, [newRoleCat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editingUser) return;
    if (editRoleCat === 'student') { setEditUserEmployeeId(''); setEditUserDesignation(''); setEditUserDateOfJoining(''); }
    else if (editRoleCat === 'staff' || editRoleCat === 'system') { setEditUserRollNo(''); setEditUserProgramId(''); setEditUserYearComm(''); }
  }, [editRoleCat, editingUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [newDiscTotalSems, setNewDiscTotalSems] = useState(4);
  const [newDiscMonthCount, setNewDiscMonthCount] = useState(12);
  const [newDiscCat, setNewDiscCat] = useState('');
  const [newDiscPeriodMins, setNewDiscPeriodMins] = useState(45);
  const [newDiscEffFrom, setNewDiscEffFrom] = useState('');
  const [editingDisc, setEditingDisc] = useState(null);
  const [discEditName, setDiscEditName] = useState('');
  const [discEditLevels, setDiscEditLevels] = useState('');
  const [discEditDesc, setDiscEditDesc] = useState('');
  const [discEditStructure, setDiscEditStructure] = useState('semester');
  const [discEditYearCount, setDiscEditYearCount] = useState(2);
  const [discEditSemPerYear, setDiscEditSemPerYear] = useState(2);
  const [discEditTotalSems, setDiscEditTotalSems] = useState(4);
  const [discEditMonthCount, setDiscEditMonthCount] = useState(12);
  const [discEditCat, setDiscEditCat] = useState('');
  const [discEditPeriodMins, setDiscEditPeriodMins] = useState(45);
  const [discEditEffFrom, setDiscEditEffFrom] = useState('');
  const [newProgCatName, setNewProgCatName] = useState('');
  const [newProgCatDurVal, setNewProgCatDurVal] = useState('');
  const [newProgCatDurUnit, setNewProgCatDurUnit] = useState('years');
  const [editingProgCat, setEditingProgCat] = useState(null);
  const [progCatEditName, setProgCatEditName] = useState('');
  const [progCatEditDurVal, setProgCatEditDurVal] = useState('');
  const [progCatEditDurUnit, setProgCatEditDurUnit] = useState('years');

  // Course form — hours input → periods auto; exam duration hrs+mins split
  const [courseDisc, setCourseDisc] = useState('');
  const [courseSem, setCourseSem] = useState('Semester I');
  const [courseYearLabel, setCourseYearLabel] = useState('');
  const [courseMonthLabel, setCourseMonthLabel] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseKind, setCourseKind] = useState('DSC');
  const [courseCredits, setCourseCredits] = useState(5);
  const [courseHours, setCourseHours] = useState('');
  const [courseCie, setCourseCie] = useState(50);
  const [courseSee, setCourseSee] = useState(50);
  const [courseCieH, setCourseCieH] = useState('');
  const [courseCieM, setCourseCieM] = useState('');
  const [courseSeeH, setCourseSeeH] = useState('');
  const [courseSeeM, setCourseSeeM] = useState('');
  const [courseExamTypeId, setCourseExamTypeId] = useState('');
  const [courseExamType, setCourseExamType] = useState('Practical');
  const [courseObjectives, setCourseObjectives] = useState([]); // ["text",...] via Add Course Objectives
  const [courseOutcomes, setCourseOutcomes] = useState([]); // [{code:'CO1', text:''}]
  const [coursePedagogyList, setCoursePedagogyList] = useState([]); // ["text",...] via Add Pedagogy
  const [coursePedagogy, setCoursePedagogy] = useState(''); // legacy textarea for bulk import fallback
  const [newExamTypeName, setNewExamTypeName] = useState('');
  const [showAddCourse, setShowAddCourse] = useState(false);
  // Curriculum file import: DOCX/PDF/XLSX -> parsed preview -> verified save (bulk multi-paper)
  const [syllabusFile, setSyllabusFile] = useState(null);
  const [syllabusParsing, setSyllabusParsing] = useState(false);
  const [syllabusParsed, setSyllabusParsed] = useState(null); // {filename,size,parsed,papers,rawPreview}
  const [syllabusParseErr, setSyllabusParseErr] = useState('');
  const [syllabusSaving, setSyllabusSaving] = useState(false);
  const [syllabusTargetDisc, setSyllabusTargetDisc] = useState('');
  const [syllabusDrafts, setSyllabusDrafts] = useState([]); // editable copies of papers [{...parsed,_include,_verified,_expanded}]
  const [bulkSaving, setBulkSaving] = useState(false);
  // Postgres modules (course_modules + course_module_topics) — per spec Add Syllabus flow
  const [modTitle, setModTitle] = useState('');
  const [modHours, setModHours] = useState('');
  const [modPeriods, setModPeriods] = useState('');
  const [modRbtList, setModRbtList] = useState([]); // ["L1","L2"...] — RBT Levels multi
  const [modRbtDraft, setModRbtDraft] = useState('L1');
  const [modMethodList, setModMethodList] = useState([]); // ["Lecture demo",...] filtered from pedagogy
  const [modMethodDraft, setModMethodDraft] = useState('');
  const [modTopics, setModTopics] = useState([]); // [{topic:"",description:""}]
  const [modTopicsText, setModTopicsText] = useState(''); // legacy bulk fallback
  const [modCo, setModCo] = useState([]); // ['CO1',...]
  const [modCoDetail, setModCoDetail] = useState('');
  const [modRbt, setModRbt] = useState('Remember'); // legacy single
  const [modMethod, setModMethod] = useState(''); // legacy single textarea
  const [editingModId, setEditingModId] = useState(null);
  const [showAddSyllabus, setShowAddSyllabus] = useState(false);
  const academicYearFor = (d=new Date()) => { const y=d.getFullYear(), m=d.getMonth()+1; const s=m>=4?y:y-1; return `${s}-${String(s+1).slice(2)}`; };
  const [syllModAcademicYear, setSyllModAcademicYear] = useState(academicYearFor());
  const [pendingSyllMods, setPendingSyllMods] = useState([]); // queued modules for one-version batch save
  const [viewCourse, setViewCourse] = useState(null); // readOnly view (eye) — course+syllabus
  const RBT_OPTS = [
    { v: 'L1', label: 'L1 — Remember' }, { v: 'L2', label: 'L2 — Understand' }, { v: 'L3', label: 'L3 — Apply' },
    { v: 'L4', label: 'L4 — Analyze' }, { v: 'L5', label: 'L5 — Evaluate' }, { v: 'L6', label: 'L6 — Create' },
  ];

  // Course list: inline edit + client filters ("Select Course" vs "Add Course")
  const [editingCourse, setEditingCourse] = useState(null);
  const [editCourse, setEditCourse] = useState({});
  const [editObjectives, setEditObjectives] = useState([]);
  const [editOutcomes, setEditOutcomes] = useState([]); // [{code,text}]
  const [editPedagogyList, setEditPedagogyList] = useState([]);
  const [editPedagogy, setEditPedagogy] = useState('');
  const [filterDisc, setFilterDisc] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const selectedDisc = dbData.curriculum.find(d => d.id === courseDisc) || null;
  const selectedDiscStructure = selectedDisc?.structure_mode || 'semester';
  const selCat = selectedDisc ? (dbData.program_categories||[]).find(c=>c.id===selectedDisc.category_id) : null;
  const categoryLimit = (() => { if (!selCat?.duration_value) return null; return { v: selCat.duration_value, u: selCat.duration_unit }; })();
  // strict program limits from category
  const maxYearsForProgram = (() => { if (!categoryLimit) return 10; return categoryLimit.u==='months' ? Math.floor(categoryLimit.v/12) || 1 : categoryLimit.v; })();
  const newDiscSelCat = (dbData.program_categories||[]).find(c=>c.id===newDiscCat) || null;
  const newDiscCatLimit = newDiscSelCat?.duration_value ? { v: newDiscSelCat.duration_value, u: newDiscSelCat.duration_unit } : null;
  const newDiscMaxYears = newDiscCatLimit ? (newDiscCatLimit.u==='months' ? Math.floor(newDiscCatLimit.v/12)||1 : newDiscCatLimit.v) : 10;
  const newDiscMaxMonths = newDiscCatLimit ? (newDiscCatLimit.u==='months' ? newDiscCatLimit.v : newDiscCatLimit.v*12) : 24;
  const editDiscSelCat = (dbData.program_categories||[]).find(c=>c.id===discEditCat) || null;
  const editDiscCatLimit = editDiscSelCat?.duration_value ? { v: editDiscSelCat.duration_value, u: editDiscSelCat.duration_unit } : null;
  const editDiscMaxYears = editDiscCatLimit ? (editDiscCatLimit.u==='months' ? Math.floor(editDiscCatLimit.v/12)||1 : editDiscCatLimit.v) : 10;
  const yearOptions = (() => {
    const n = Math.min(Number(selectedDisc?.year_count) || 2, maxYearsForProgram);
    return Array.from({ length: Math.min(n, 10) }, (_, i) => `Year ${ROMAN[i]}`);
  })();
  const monthOptions = (() => {
    const n = Math.min(Number(selectedDisc?.month_count) || 12, categoryLimit?.u==='months' ? categoryLimit.v : 24);
    return Array.from({ length: n }, (_, i) => `Month ${i+1}`);
  })();
  const semestersPerProgram = (() => {
    const yrs = Number(selectedDisc?.year_count) || (categoryLimit?.u==='months'? Math.floor((Number(selCat?.duration_value)||24)/6) : categoryLimit?.v || 2);
    const perYear = Number(selectedDisc?.semesters_per_year) || 2;
    return yrs * perYear;
  })();
  const courseSemesters = (() => {
    if (selectedDiscStructure==='semester') return Array.from({ length: semestersPerProgram }, (_, i) => `Semester ${ROMAN[i] || i+1}`);
    return Array.from({ length: Number(selectedDisc?.semesters_per_year)||2 }, (_, i) => `Semester ${ROMAN[i]}`);
  })();
  // year→semester mapping: 4yr 2/yr → Yr3 gets Sem5,6
  const semestersForSelectedYear = (() => {
    if (selectedDiscStructure!=='semester' || !courseYearLabel) return courseSemesters;
    const yi = ROMAN.indexOf(courseYearLabel.replace('Year ','').trim()); if (yi<0) return courseSemesters;
    const perYear = Number(selectedDisc?.semesters_per_year)||2;
    const start = yi*perYear;
    return courseSemesters.slice(start, start+perYear);
  })();
  const progMins = (() => { const v = Number(selectedDisc?.period_minutes); return Number.isFinite(v) && v>=10 && v<=120 ? v : 45; })();
  const derivedPeriods = (() => { const h = Number(courseHours); if (!Number.isFinite(h)||h<=0) return ''; return Math.round(h*60/progMins); })();
  const pedagogyOptions = (() => {
    if (activeSyllabusCourse?.pedagogy) { const t=String(activeSyllabusCourse.pedagogy).split('\n').map(s=>s.trim()).filter(Boolean); if(t.length) return t; }
    if (coursePedagogyList.length) return coursePedagogyList.filter(s=>String(s).trim());
    const t = String(coursePedagogy||'').split('\n').map(s=>s.trim()).filter(Boolean);
    return t;
  })();

  useEffect(() => { if (!courseDisc && dbData.curriculum.length) setCourseDisc(dbData.curriculum[0].id); }, [dbData.curriculum]);
  useEffect(() => { const opts = semestersForSelectedYear; if (opts.length && !opts.includes(courseSem)) setCourseSem(opts[0]); }, [courseDisc, courseYearLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedDiscStructure !== 'semester' || !courseSem) return; const idx = courseSemesters.indexOf(courseSem); if (idx < 0) return; const per = Number(selectedDisc?.semesters_per_year) || 2; const want = `Year ${ROMAN[Math.floor(idx / per)] || 'I'}`; if (want !== courseYearLabel) setCourseYearLabel(want); }, [courseSem]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeModule === 'curriculum') { setShowAddCourse(false); setShowAddSyllabus(false); } }, [activeModule]);
  useEffect(() => {
    if (!selectedDisc) return;
    const mode = selectedDisc.structure_mode || 'semester';
    if (mode === 'semester') {
      if (!courseYearLabel && yearOptions.length) setCourseYearLabel(yearOptions[0]);
    } else if (mode === 'yearly') {
      if (!courseYearLabel && yearOptions.length) setCourseYearLabel(yearOptions[0]);
      if (courseSem) setCourseSem('');
    } else if (mode === 'monthly') {
      if (!courseMonthLabel && monthOptions.length) setCourseMonthLabel(monthOptions[0]);
    }
    if (mode !== 'semester' && mode !== 'yearly' && courseYearLabel && mode==='monthly') setCourseYearLabel('');
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

  // Timetable — dynamic columns (timetable_periods table) with 8-period fallback.
  // Default: 1 2 3 | BREAK | 4 5 | LUNCH | NAP | 6 7 8  — clubbed via colspan inside segments. Admin can rename/reorder via Period Manager.
  const FALLBACK_TT = [
    { key:'p1', label:'1', start:'08:15', end:'09:00', kind:'period', num:1, sort_order:1 },
    { key:'p2', label:'2', start:'09:00', end:'09:45', kind:'period', num:2, sort_order:2 },
    { key:'p3', label:'3', start:'09:45', end:'10:30', kind:'period', num:3, sort_order:3 },
    { key:'br1', label:'BREAK', start:'10:30', end:'10:45', kind:'break', num:null, sort_order:4 },
    { key:'p4', label:'4', start:'10:45', end:'11:30', kind:'period', num:4, sort_order:5 },
    { key:'p5', label:'5', start:'11:30', end:'12:15', kind:'period', num:5, sort_order:6 },
    { key:'lunch', label:'LUNCH', start:'12:15', end:'13:00', kind:'break', num:null, sort_order:7 },
    { key:'nap', label:'NAP', start:'13:00', end:'13:25', kind:'break', num:null, sort_order:8 },
    { key:'p6', label:'6', start:'13:30', end:'14:30', kind:'period', num:6, sort_order:9 },
    { key:'p7', label:'7', start:'14:30', end:'15:15', kind:'period', num:7, sort_order:10 },
    { key:'p8', label:'8', start:'15:15', end:'16:00', kind:'period', num:8, sort_order:11 },
  ];
  const TT = (() => {
    const rows = (dbData.timetable_periods || []).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    if (!rows.length) return FALLBACK_TT;
    return rows.map(r => ({ key:r.key, label:r.label, start:String(r.start_time||'').slice(0,5), end:String(r.end_time||'').slice(0,5), kind:r.kind, num:r.num ?? null, sort_order:r.sort_order, id:r.id }));
  })();
  const FIXED_TT = TT;
  const FIXED_TEACH = TT.filter(c=>c.kind!=='break');
  const FIXED_MAP = Object.fromEntries(TT.map(c=>[c.key,c]));
  const TT_SEGMENTS = (() => { const segs=[]; let cur=[]; TT.forEach(c=>{ if(c.kind==='break'){ if(cur.length) segs.push([...cur]); cur=[]; } else cur.push(c.key); }); if(cur.length) segs.push(cur); return segs.length?segs:[FIXED_TEACH.map(c=>c.key)]; })();
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
  const [newSlotSubjects, setNewSlotSubjects] = useState([]);
  const [newSlotInput, setNewSlotInput] = useState('');
  const [editingSlot, setEditingSlot] = useState(null);
  const [editSlotDay, setEditSlotDay] = useState('Monday');
  const [editSlotFrom, setEditSlotFrom] = useState('p1');
  const [editSlotTo, setEditSlotTo] = useState('p1');
  const [editSlotRoom, setEditSlotRoom] = useState('');
  const [editSlotSubject, setEditSlotSubject] = useState('');
  const [editSlotSubjects, setEditSlotSubjects] = useState([]);
  const [editSlotInput, setEditSlotInput] = useState('');
  const [editSlotBatch, setEditSlotBatch] = useState('');
  const [timetableBatch, setTimetableBatch] = useState('');
  const [timetableCombined, setTimetableCombined] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState(null);
  const [periodKey, setPeriodKey] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('08:15');
  const [periodEnd, setPeriodEnd] = useState('09:00');
  const [periodKind, setPeriodKind] = useState('period');
  const [periodNum, setPeriodNum] = useState('');
  const [periodSort, setPeriodSort] = useState('');
  const [showPeriodMgr, setShowPeriodMgr] = useState(false);
  const [ttCourseIds, setTtCourseIds] = useState([]);
  const [editTtCourseIds, setEditTtCourseIds] = useState([]);
  const slotDisplaySubjects = (s) => {
    if (s?.subjects && Array.isArray(s.subjects) && s.subjects.length) return s.subjects.join(' / ');
    if (s?.subject) return s.subject;
    return '—';
  };

  const handleAddSlot = async (e) => {
    e.preventDefault();
    if (!newSlotBatch) return;
    const subjectsArr = newSlotSubjects.length ? newSlotSubjects : (newSlotSubject.trim() ? [newSlotSubject.trim()] : []);
    if (!subjectsArr.length) { alert('Enter Class / Topic'); return; }
    const fc = FIXED_MAP[newSlotFrom], tc = FIXED_MAP[newSlotTo];
    if (!fc || !tc) return;
    const fi = FIXED_TT.findIndex(c=>c.key===newSlotFrom), ti = FIXED_TT.findIndex(c=>c.key===newSlotTo);
    if (ti < fi) { alert('Invalid period range'); return; }
    if (ttSegmentOf(newSlotFrom) !== ttSegmentOf(newSlotTo)) { alert('Club only within same block (periods separated by breaks cannot be merged)'); return; }
    const candidate = { batch_id: newSlotBatch, day_of_week: newSlotDay, start_time: fc.start, end_time: tc.end, room: newSlotRoom.trim() || null, subject: subjectsArr[0], subjects: subjectsArr, period_number: fc.num || null, course_ids: ttCourseIds.length ? ttCourseIds : null };
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
    setNewSlotRoom(''); setNewSlotSubject(''); setNewSlotSubjects([]); setNewSlotInput(''); setTtCourseIds([]); fetchData();
  };
  const handleUpdateSlot = async (id) => {
    const fc = FIXED_MAP[editSlotFrom], tc = FIXED_MAP[editSlotTo];
    if (!fc || !tc) { alert('Pick period range'); return; }
    const fi = FIXED_TT.findIndex(c=>c.key===editSlotFrom), ti = FIXED_TT.findIndex(c=>c.key===editSlotTo);
    if (ti < fi) { alert('Invalid period range'); return; }
    if (ttSegmentOf(editSlotFrom) !== ttSegmentOf(editSlotTo)) { alert('Club only within same block (periods separated by breaks cannot be merged)'); return; }
    const subjectsArr = editSlotSubjects.length ? editSlotSubjects : (editSlotSubject.trim() ? [editSlotSubject.trim()] : []);
    const payload = { batch_id: editSlotBatch || undefined, day_of_week: editSlotDay, start_time: fc.start, end_time: tc.end, room: editSlotRoom.trim() || null, subject: subjectsArr[0] || null, subjects: subjectsArr, period_number: fc.num || null, course_ids: editTtCourseIds.length ? editTtCourseIds : null };
    const res = await apiCall(`${apiUrl}/api/timetable/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Update failed'); return; }
    setEditingSlot(null); fetchData();
  };
  const handleAddPeriod = async (e) => {
    e.preventDefault();
    if (!periodKey.trim() || !periodLabel.trim()) { alert('Key and label required'); return; }
    const key = periodKey.trim().toLowerCase().replace(/\s+/g, '_');
    const so = periodSort !== '' ? Number(periodSort) : (Math.max(0, ...TT.map(c=>c.sort_order||0)) + 1);
    const payload = { key, label: periodLabel.trim(), start_time: periodStart, end_time: periodEnd, kind: periodKind, num: periodNum !== '' ? Number(periodNum) : null, sort_order: so };
    const res = await apiCall(`${apiUrl}/api/timetable_periods`, { method:'POST', body: JSON.stringify(payload) });
    if (!res.ok) { const j=await res.json().catch(()=>({})); alert(j.error||'Add period failed'); return; }
    setPeriodKey(''); setPeriodLabel(''); setPeriodNum(''); setPeriodSort(''); fetchData();
  };
  const handleUpdatePeriod = async () => {
    if (!editingPeriodId) return;
    const payload = { label: periodLabel.trim(), start_time: periodStart, end_time: periodEnd, kind: periodKind, num: periodNum !== '' ? Number(periodNum) : null, sort_order: periodSort !== '' ? Number(periodSort) : undefined };
    const res = await apiCall(`${apiUrl}/api/timetable_periods/${editingPeriodId}`, { method:'PUT', body: JSON.stringify(payload) });
    if (!res.ok) { const j=await res.json().catch(()=>({})); alert(j.error||'Update failed'); return; }
    setEditingPeriodId(null); setPeriodKey(''); setPeriodLabel(''); setPeriodSort(''); fetchData();
  };
  const handleDeletePeriod = async (id) => {
    if (!confirm('Delete period column? Slots keep their times.')) return;
    await apiCall(`${apiUrl}/api/timetable_periods/${id}`, { method:'DELETE' }); fetchData();
  };
  const movePeriod = async (id, dir) => {
    const sorted = [...TT].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const idx = sorted.findIndex(p=>p.id===id);
    const swap = dir==='up' ? idx-1 : idx+1;
    if (swap<0||swap>=sorted.length) return;
    const a=sorted[idx], b=sorted[swap];
    await apiCall(`${apiUrl}/api/timetable_periods/${a.id}`, { method:'PUT', body: JSON.stringify({ sort_order: b.sort_order }) });
    await apiCall(`${apiUrl}/api/timetable_periods/${b.id}`, { method:'PUT', body: JSON.stringify({ sort_order: a.sort_order }) });
    fetchData();
  };

  // ── Class completion loop — one entry per slot per date, student confirmations, analytics ──
  const [ceSlot, setCeSlot] = useState('');
  const [ceDate, setCeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ceCourse, setCeCourse] = useState('');
  const [ceModule, setCeModule] = useState('');
  const [ceTopic, setCeTopic] = useState('');
  const [ceTopicText, setCeTopicText] = useState('');
  const [ceNotes, setCeNotes] = useState('');
  const [ceConducted, setCeConducted] = useState(true);
  const [ceL, setCeL] = useState(0);
  const [ceTh, setCeTh] = useState(1);
  const [ceP, setCeP] = useState(0);
  const [ceRemarks, setCeRemarks] = useState('');
  const [cePeriodLabel, setCePeriodLabel] = useState('');
  const [ceWeekStart, setCeWeekStart] = useState(()=>{ const d=new Date(); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); const m=new Date(d.setDate(diff)); return m.toISOString().slice(0,10); });
  const ceModules = ceCourse ? (dbData.course_modules || []).filter(m => m.course_id === ceCourse) : [];
  const ceTopics = ceModule ? (dbData.course_module_topics || []).filter(t => t.module_id === ceModule) : [];
  const ceSlotPeriodLabel = (slot) => {
    if (!slot) return '';
    const k = slotToKeys(slot);
    const fc = FIXED_MAP[k.from], tc = FIXED_MAP[k.to];
    if (!fc || !tc) return slot.subject || '';
    if (k.from===k.to) return fc.num ? String(fc.num) : fc.label;
    return `${fc.label}→${tc.label}`;
  };

  const handleAddClassEntry = async (e) => {
    e.preventDefault();
    if (!ceSlot || !ceDate) { alert('Pick a slot and date'); return; }
    const slot = dbData.timetable.find(s => s.id === ceSlot);
    if (!slot) { alert('Invalid slot'); return; }
    const derivedLabel = cePeriodLabel.trim() || ceSlotPeriodLabel(slot);
    const payload = { timetable_slot_id: ceSlot, batch_id: slot.batch_id, class_date: ceDate, course_id: ceCourse || null, module_id: ceModule || null, topic_id: ceTopic || null, topic_text: ceTopicText.trim() || null, notes: ceNotes.trim() || null, taught_by: myProfile?.id || null, status: 'submitted', is_conducted: ceConducted, l_count: Number(ceL)||0, th_count: Number(ceTh)||0, p_count: Number(ceP)||0, remarks: ceRemarks.trim() || null, period_label: derivedLabel || null };
    if (payload.is_conducted && !payload.course_id && !payload.topic_text) { alert('Pick a course/topic or enter a free topic'); return; }
    if (!payload.is_conducted && !payload.remarks) { alert('Add reason in Remarks when class not conducted'); return; }
    const res = await apiCall(`${apiUrl}/api/class_entries`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Failed to log class'); return; }
    setCeTopic(''); setCeTopicText(''); setCeNotes(''); setCeRemarks(''); setCePeriodLabel(''); fetchData();
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

  const downloadWeeklyXlsx = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Dept. of Performing Arts.');
      ws.properties.defaultRowHeight = 13.75;
      ws.columns = [
        { width: 5.16 }, { width: 15.16 }, { width: 15.16 }, { width: 17.66 }, { width: 23.33 },
        { width: 83.66 }, { width: 6 }, { width: 13 }, { width: 13 }, { width: 45.66 },
      ];
      const facultyName = myProfile?.name || 'Faculty';
      const start = ceWeekStart ? new Date(ceWeekStart + 'T00:00:00') : new Date();
      const end = new Date(start); end.setDate(start.getDate()+5);
      const fmt = (d) => d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      const weekLabel = `${fmt(start)} to ${fmt(end)}`;
      ws.mergeCells('A1:E1'); ws.getCell('A1').value = 'Dept. of Performing Arts.';
      ws.mergeCells('G1:I1'); ws.getCell('G1').value = `Week: ${weekLabel}`;
      ws.mergeCells('A2:E2'); ws.getCell('A2').value = 'Name of Faculty';
      ws.mergeCells('G2:I2'); ws.getCell('G2').value = facultyName;
      ws.mergeCells('A3:F3'); ws.getCell('A3').value = 'Total';
      ws.getCell('A1').font = { bold: true, size: 11 }; ws.getCell('G1').font = { size: 10, italic: true };
      ws.getCell('A2').font = { bold: true, size: 10 }; ws.getCell('G2').font = { bold: true, size: 10 };
      ws.getCell('A3').font = { bold: true }; ws.getCell('A3').alignment = { horizontal: 'center' };
      const headerStyle = { font: { bold: true, size: 10 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} } };
      ws.getCell('A4').value='S.No.'; ws.getCell('B4').value='Date'; ws.getCell('C4').value='Day'; ws.getCell('D4').value='Time'; ws.getCell('E4').value='Period No.'; ws.getCell('F4').value='Topic'; ws.getCell('G4').value='L'; ws.getCell('H4').value='Th'; ws.getCell('I4').value='P'; ws.getCell('J4').value='Remarks';
      ['A4','B4','C4','D4','E4','F4','G4','H4','I4','J4'].forEach(a=>{ const c=ws.getCell(a); Object.assign(c, headerStyle); c.fill={ type:'pattern', pattern:'solid', fgColor:{ argb:'FFFDF3E0' } }; });
      ws.getRow(4).height = 18;
      ws.getCell('G3').value = { formula: 'SUM(G5:G202)' }; ws.getCell('H3').value = { formula: 'SUM(H5:H202)' }; ws.getCell('I3').value = { formula: 'SUM(I5:I202)' };
      ['G3','H3','I3'].forEach(a=>{ ws.getCell(a).border={ top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; ws.getCell(a).alignment={ horizontal:'center' }; });
      const fromStr = ceWeekStart; const toDate = new Date(start); toDate.setDate(start.getDate()+6);
      const toStr = toDate.toISOString().slice(0,10);
      const isSuper = role==='super_admin';
      let rows = (dbData.class_entries||[]).filter(r=> r.class_date >= fromStr && r.class_date <= toStr);
      if (!isSuper && myProfile?.id) rows = rows.filter(r=> String(r.taught_by)===String(myProfile.id));
      rows.sort((a,b)=> String(a.class_date).localeCompare(String(b.class_date)));
      rows.forEach((entry, idx)=>{
        const n = idx+5;
        const slot = dbData.timetable.find(s=> s.id===entry.timetable_slot_id);
        const day = slot?.day_of_week || (entry.class_date ? new Date(entry.class_date+'T00:00:00').toLocaleDateString('en-US',{weekday:'long'}) : '');
        const time = slot ? `${slot.start_time?.slice(0,5)} to ${slot.end_time?.slice(0,5)}` : '';
        const period = entry.period_label || (slot ? ceSlotPeriodLabel(slot) : '');
        const topic = dbData.course_module_topics.find(t=>t.id===entry.topic_id)?.topic || dbData.course_modules.find(m=>m.id===entry.module_id)?.title || dbData.courses.find(c=>c.id===entry.course_id)?.name || entry.topic_text || (entry.is_conducted===false ? 'Class not conducted' : '—');
        const dt = entry.class_date ? new Date(entry.class_date+'T00:00:00') : null;
        const row = ws.getRow(n);
        row.getCell(1).value = idx+1;
        row.getCell(2).value = dt; row.getCell(2).numFmt = 'dd-mmm-yyyy';
        row.getCell(3).value = day;
        row.getCell(4).value = time;
        row.getCell(5).value = period;
        row.getCell(6).value = topic; row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(7).value = Number(entry.l_count ?? 0);
        row.getCell(8).value = Number(entry.th_count ?? 0);
        row.getCell(9).value = Number(entry.p_count ?? 0);
        row.getCell(10).value = entry.remarks || entry.notes || (entry.is_conducted===false ? 'Not conducted' : '');
        for(let c=1;c<=10;c++){ const cell=row.getCell(c); cell.border={ top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; cell.font={ size:10 }; if(c<=5||c>=7) cell.alignment={ horizontal:'center', vertical:'middle' }; }
        row.height = 16;
      });
      if (rows.length===0){
        const row=ws.getRow(5); row.getCell(1).value=1; row.getCell(6).value='No classes logged in this week'; for(let c=1;c<=10;c++) row.getCell(c).border={ top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      }
      ws.getCell('K1').value='Legend'; ws.getCell('K1').font={ bold:true, size:9 }; ws.getCell('L1').value='Th. = Theory'; ws.getCell('L2').value='T = Tutorial'; ws.getCell('L3').value='Pr. = Practical'; ws.getCell('L4').value='L = Lecture';
      ['L1','L2','L3','L4'].forEach(a=> ws.getCell(a).font={ size:9 });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`Teaching-log-Weekly-${facultyName.replace(/\s+/g,'-')}-${fromStr}_to_${toStr}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000);
    } catch(e){ alert('Download failed: '+(e.message||e)); }
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
    if (!newDiscName.trim()) return;
    if (!newDiscCat) { alert('Choose a Program Category first.'); return; }
    // strict category limit check client-side mirrors backend
    const cat = (dbData.program_categories||[]).find(c=>c.id===newDiscCat);
    if (cat?.duration_value) {
      const toYears=(v,u)=> u==='months'? v/12 : v;
      const catYears = toYears(cat.duration_value, cat.duration_unit);
      const progYears = newDiscStructure==='monthly' ? Number(newDiscMonthCount)/12 : Number(newDiscYearCount);
      if (progYears > catYears + 1e-9) { alert(`Program exceeds category duration ${cat.duration_value} ${cat.duration_unit}`); return; }
    }
    const body = {
      name: newDiscName.trim(), levels: newDiscLevels.trim(), description: newDiscDesc.trim(),
      structure_mode: newDiscStructure, category_id: newDiscCat, period_minutes: Number(newDiscPeriodMins) || 45, period_effective_from: newDiscEffFrom || null,
    };
    if (newDiscStructure==='monthly') body.month_count = Number(newDiscMonthCount) || 12;
    else if (newDiscStructure==='yearly') body.year_count = Number(newDiscYearCount) || 2;
    else if (newDiscStructure==='semester') {
      const yrs=Number(newDiscYearCount)||2, per=Number(newDiscSemPerYear)||2;
      if(!Number.isFinite(yrs)||yrs<1||yrs>10){ alert('Years must be 1-10.'); return; }
      if(!Number.isFinite(per)||per<1||per>4){ alert('Semesters per year must be 1-4.'); return; }
      body.year_count=yrs; body.semesters_per_year=per;
    }
    const res = await apiCall(`${apiUrl}/api/curriculum`, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) { const j=await res.json().catch(()=>({})); alert(j.error||'Create failed'); return; }
    setNewDiscName(''); setNewDiscLevels(''); setNewDiscDesc(''); setNewDiscEffFrom(''); fetchData();
  };
  const handleAddProgCat = async () => {
    const name = newProgCatName.trim(); if (!name) return;
    const body = { name };
    if (newProgCatDurVal) { body.duration_value = Number(newProgCatDurVal); body.duration_unit = newProgCatDurUnit; }
    const res = await apiCall(`${apiUrl}/api/program_categories`, { method:'POST', body: JSON.stringify(body) });
    if (!res.ok) { const j=await res.json().catch(()=>({})); alert(j.error||'Add failed'); return; }
    setNewProgCatName(''); setNewProgCatDurVal(''); fetchData();
  };
  const handleUpdateProgCat = async (row) => {
    const name = progCatEditName.trim(); if (!name) return;
    const body = { name };
    if (progCatEditDurVal) { body.duration_value = Number(progCatEditDurVal); body.duration_unit = progCatEditDurUnit; }
    else { body.duration_value = null; body.duration_unit = null; }
    const res = await apiCall(`${apiUrl}/api/program_categories/${row.id}`, { method:'PUT', body: JSON.stringify(body) });
    if (!res.ok) { const j=await res.json().catch(()=>({})); alert(j.error||'Update failed'); return; }
    setEditingProgCat(null); fetchData();
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
    if (!courseName.trim() || !courseCode.trim()) return;
    if (!courseDisc) { alert('Choose a Program first.'); return; }
    const disc = dbData.curriculum.find(d => d.id === courseDisc);
    const mode = disc?.structure_mode || 'semester';
    const pedText = coursePedagogyList.length ? coursePedagogyList.filter(s=>String(s).trim()).join('\n') : (coursePedagogy.trim() || null);
    const objArr = courseObjectives.length ? courseObjectives.filter(s=>String(s).trim()) : [];
    const h = Number(courseHours); if (!Number.isFinite(h)||courseHours==='') { alert('Enter Teaching Hours.'); return; }
    const mins = (()=>{ const v=Number(disc?.period_minutes); return Number.isFinite(v)&&v>=10&&v<=120?v:45; })();
    const periods = Math.round(h*60/mins);
    const payload = {
      discipline_id: courseDisc, code: courseCode.trim(), name: courseName.trim(),
      type: courseKind, credits: Number(courseCredits) || 0, teaching_hours: h, teaching_periods: periods,
      cie_marks: Number(courseCie) || 0, see_marks: Number(courseSee) || 0,
      examination_type: courseExamType || null, examination_type_id: courseExamTypeId || null,
      cie_hours: courseCieH===''?null:Number(courseCieH), cie_mins: courseCieM===''?null:Number(courseCieM),
      see_hours: courseSeeH===''?null:Number(courseSeeH), see_mins: courseSeeM===''?null:Number(courseSeeM),
      examination_hours_cie: (courseCieH||courseCieM)? `${courseCieH||0}h ${courseCieM||0}m` : null,
      examination_hours_see: (courseSeeH||courseSeeM)? `${courseSeeH||0}h ${courseSeeM||0}m` : null,
      objectives_json: objArr,
      outcomes_json: courseOutcomes.filter(o=>o.text.trim()).map(o=>({ code:o.code, text:o.text.trim() })),
      pedagogy: pedText,
    };
    if (mode === 'monthly') {
      if (!courseMonthLabel) { alert('Choose a Month.'); return; } payload.month_label = courseMonthLabel; payload.year_label=null; payload.year_number=null; payload.semester=null;
    } else if (mode === 'yearly') {
      if (!courseYearLabel) { alert('Choose a Year.'); return; } payload.year_label = courseYearLabel; payload.year_number = ROMAN.indexOf(courseYearLabel.replace('Year ', '')) + 1 || null; payload.semester = null; payload.month_label=null;
    } else if (mode === 'semester') {
      if (!courseYearLabel) { alert('Choose a Year.'); return; } payload.year_label = courseYearLabel; payload.year_number = ROMAN.indexOf(courseYearLabel.replace('Year ', '')) + 1 || null; payload.semester = courseSem; payload.month_label=null;
      // validate semester belongs to selected year
      if (!semestersForSelectedYear.includes(courseSem)) { alert('Semester does not belong to selected year.'); return; }
    }
    const res = await apiCall(`${apiUrl}/api/courses`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Add course failed'); return; }
    setCourseCode(''); setCourseName(''); setCourseHours(''); setCourseObjectives([]); setCourseOutcomes([]); setCoursePedagogyList([]); setCoursePedagogy(''); setShowAddCourse(false); fetchData();
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
  const parseSyllabusFile = async () => {
    if (!syllabusFile) { alert('Pick a .docx/.pdf/.xlsx first'); return; }
    if (syllabusFile.size > 15 * 1024 * 1024) { setSyllabusParseErr('File too large (max 15 MB)'); return; }
    setSyllabusParsing(true); setSyllabusParseErr(''); setSyllabusParsed(null); setSyllabusDrafts([]);
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(syllabusFile); });
      const { data: { session: sess } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (sess?.access_token) headers.Authorization = `Bearer ${sess.access_token}`;
      const res = await fetch(`${apiUrl}/api/curriculum/parse`, { method: 'POST', headers, body: JSON.stringify({ filename: syllabusFile.name, mime: syllabusFile.type || 'application/octet-stream', data: b64 }) });
      const j = await res.json().catch(()=>({}));
      if (!res.ok) { setSyllabusParseErr(j.error || 'Parse failed'); return; }
      setSyllabusParsed(j);
      const papers = Array.isArray(j.papers) && j.papers.length ? j.papers : (j.parsed ? [j.parsed] : []);
      const shred = (s)=>{ const m=String(s||'').match(/(\d+)\s*h/i), n=String(s||'').match(/(\d+)\s*m/i); return {h:m?m[1]:'',mm:n?n[1]:''}; };
      setSyllabusDrafts(papers.map((p, i) => { const a=shred(p.examinationHoursCie), b=shred(p.examinationHoursSee); return { ...p, _idx: i, _include: true, _verified: false, _expanded: i === 0, _cieH: a.h, _cieM: a.mm, _seeH: b.h, _seeM: b.mm }; }));
      const prog = j.parsed?.programName || papers[0]?.programName;
      if (prog) {
        const hit = dbData.curriculum.find(d => d.name.toLowerCase() === String(prog).trim().toLowerCase());
        if (hit) setSyllabusTargetDisc(hit.id);
      }
    } catch (e) { setSyllabusParseErr(String(e.message||e)); } finally { setSyllabusParsing(false); }
  };
  const updateDraft = (idx, patch) => setSyllabusDrafts(ds => ds.map((d, i) => i === idx ? { ...d, ...patch } : d));
  const saveBulkDrafts = async () => {
    const discId = syllabusTargetDisc || courseDisc || dbData.curriculum[0]?.id;
    if (!discId) { alert('Pick a Program first.'); return; }
    const toSave = syllabusDrafts.filter(d => d._include);
    if (!toSave.length) { alert('Nothing selected.'); return; }
    const unverified = toSave.filter(d => !d._verified);
    if (unverified.length) { if (!confirm(`${unverified.length} paper(s) not marked Verified — publish anyway?`)) return; }
    for (const d of toSave) { if (!d.courseName || !d.code) { alert(`Paper ${d._idx + 1}: Course Name and Code required.`); return; } }
    setBulkSaving(true);
    const disc = dbData.curriculum.find(x => x.id === discId);
    const mode = disc?.structure_mode || 'semester';
    let ok = 0, fail = 0; const errs = [];
    for (const d of toSave) {
      const matched = (dbData.examination_types || []).find(t => t.name.toLowerCase() === String(d.examinationType || '').toLowerCase());
      const examTypeId = matched?.id || courseExamTypeId || null;
      const vM = Number(disc?.period_minutes); const minsEff = Number.isFinite(vM)&&vM>=10&&vM<=120?vM:45;
      const thRaw = d.teachingHours; const th = thRaw!=null && thRaw!=='' ? Number(thRaw) : (d.teachingPeriods!=null ? Math.round(Number(d.teachingPeriods)*minsEff/60*100)/100 : null);
      const tp = th!=null && Number.isFinite(th) && th>0 ? Math.round(th*60/minsEff) : null;
      const objectives = (d.objectives || []).filter(Boolean);
      const outcomes = (d.outcomes || []).filter(Boolean).map((t, i) => ({ code: `CO${i + 1}`, text: t }));
      const pedagogy = String(d.pedagogy || '').trim() || null;
      const cieH = d._cieH, cieM = d._cieM, seeH = d._seeH, seeM = d._seeM;
      const cieStr = (cieH!==''&&cieH!=null)||(cieM!==''&&cieM!=null) ? `${cieH||0}h ${cieM||0}m` : (d.examinationHoursCie || null);
      const seeStr = (seeH!==''&&seeH!=null)||(seeM!==''&&seeM!=null) ? `${seeH||0}h ${seeM||0}m` : (d.examinationHoursSee || null);
      const payload = {
        discipline_id: discId, code: String(d.code).trim(), name: String(d.courseName).trim(),
        type: d.type || courseKind, credits: d.credits ?? 0, teaching_hours: th, teaching_periods: tp,
        cie_marks: d.cieMarks ?? 0, see_marks: d.seeMarks ?? 0,
        examination_type: d.examinationType || null, examination_type_id: examTypeId,
        cie_hours: cieH===''?null:(cieH!=null?Number(cieH):null), cie_mins: cieM===''?null:(cieM!=null?Number(cieM):null),
        see_hours: seeH===''?null:(seeH!=null?Number(seeH):null), see_mins: seeM===''?null:(seeM!=null?Number(seeM):null),
        examination_hours_cie: cieStr, examination_hours_see: seeStr,
        cie_duration: cieStr, see_duration: seeStr,
        objectives_json: objectives, outcomes_json: outcomes, pedagogy,
        semester: d.semester || courseSem, year_label: d.yearLabel || (mode === 'yearly' ? courseYearLabel : null),
        year_number: d.yearLabel ? (ROMAN.indexOf(String(d.yearLabel).replace('Year ', '').trim()) + 1 || null) : null,
      };
      if (mode === 'yearly' && !payload.year_label) { errs.push(`${d.code}: Year required for this program`); fail++; continue; }
      try {
        const res = await apiCall(`${apiUrl}/api/courses`, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Create failed'); }
        const created = await res.json().catch(() => null);
        const courseId = created?.id;
        const mods = d.modules || [];
        // ensure modules land in versioned syllabus (like handleAddModule)
        let bulkSyllId = null;
        if (courseId && mods.length) {
          const existingSyll = (dbData.course_syllabi||[]).filter(s=>s.course_id===courseId).sort((a,b)=> (b.version_number||0)-(a.version_number||0))[0];
          if (existingSyll) bulkSyllId = existingSyll.id;
          else {
            const ay = syllModAcademicYear || `${new Date().getFullYear()}-${String(new Date().getFullYear()+1).slice(2)}`;
            const rr2 = await apiCall(`${apiUrl}/api/course_syllabi`, { method:'POST', body: JSON.stringify({ course_id: courseId, academic_year: ay, status: 'draft' }) });
            if (rr2.ok) { const j2=await rr2.json().catch(()=>null); if (j2?.id) bulkSyllId=j2.id; }
          }
        }
        if (courseId && mods.length) {
          for (const mm of mods) {
            const rr = await apiCall(`${apiUrl}/api/course_modules`, { method: 'POST', body: JSON.stringify({ course_id: courseId, syllabus_id: bulkSyllId, module_number: mm.module_number, title: mm.title, hours: mm.hours ?? null, rbt_level: mm.rbt_level || null, methodology: mm.methodology || null, co_mapping: mm.co_mapping || null }) });
            const mc = await rr.json().catch(() => null);
            const modId = mc?.id;
            if (modId && mm.topics?.length) for (let i = 0; i < mm.topics.length; i++) await apiCall(`${apiUrl}/api/course_module_topics`, { method: 'POST', body: JSON.stringify({ module_id: modId, topic: mm.topics[i], sort_order: i }) });
          }
        }
        if (courseId && (objectives.length || outcomes.length || mods.length)) {
          await apiCall(`${apiUrl}/api/curriculum-content/course_${courseId}`, { method: 'PUT', body: JSON.stringify({ objectives, outcomes: outcomes.map(o => o.text), pedagogy: pedagogy ? pedagogy.split('\n').filter(Boolean) : [], modules: mods.map(m => ({ title: m.title, hours: m.hours, rbt_level: m.rbt_level, methodology: m.methodology, co_mapping: m.co_mapping, topics: m.topics, description: '' })), assessments: '' }) }).catch(() => {});
        }
        ok++;
      } catch (e) { fail++; errs.push(`${d.code || 'Paper ' + (d._idx + 1)}: ${e.message}`); }
    }
    setBulkSaving(false);
    if (ok) { alert(`Published ${ok} paper(s)${fail ? `, ${fail} failed:\n` + errs.join('\n') : '.'}`); setSyllabusParsed(null); setSyllabusDrafts([]); setSyllabusFile(null); fetchData(); }
    else alert('All failed:\n' + errs.join('\n'));
  };
  const parseDurationToHM = (s) => { const m = String(s||'').match(/(\d+)\s*h/i); const n = String(s||'').match(/(\d+)\s*m/i); return { h: m ? m[1] : '', mm: n ? n[1] : '' }; };
  const applyParsedToCourseForm = () => {
    if (!syllabusParsed?.parsed) return;
    const p = syllabusParsed.parsed;
    if (p.courseName) setCourseName(p.courseName);
    if (p.code) setCourseCode(p.code);
    if (p.type) setCourseKind(p.type);
    if (p.credits != null) setCourseCredits(p.credits);
    if (p.teachingHours != null) setCourseHours(String(p.teachingHours));
    else if (p.teachingPeriods != null) { const dd=dbData.curriculum.find(x=>x.id===(syllabusTargetDisc||courseDisc))||null; const mm2=(()=>{const v=Number(dd?.period_minutes); return Number.isFinite(v)&&v>=10&&v<=120?v:45;})(); setCourseHours(String(Math.round(Number(p.teachingPeriods)*mm2/60*100)/100)); }
    if (p.cieMarks != null) setCourseCie(p.cieMarks);
    if (p.seeMarks != null) setCourseSee(p.seeMarks);
    if (p.examinationType) setCourseExamType(p.examinationType);
    if (p.examinationHoursCie) { const {h,mm}=parseDurationToHM(p.examinationHoursCie); setCourseCieH(h); setCourseCieM(mm); }
    if (p.examinationHoursSee) { const {h,mm}=parseDurationToHM(p.examinationHoursSee); setCourseSeeH(h); setCourseSeeM(mm); }
    if (p.semester) setCourseSem(p.semester);
    if (p.yearLabel) setCourseYearLabel(p.yearLabel);
    if (p.objectives?.length) setCourseObjectives(p.objectives);
    if (p.outcomes?.length) setCourseOutcomes(p.outcomes.map((t,i)=>({code:`CO${i+1}`, text:t})));
    if (p.pedagogy) { const lines=String(p.pedagogy).split('\n').map(s=>s.trim()).filter(Boolean); setCoursePedagogyList(lines); setCoursePedagogy(String(p.pedagogy)); }
    if (p.modules?.length) setSyllabusParsed(prev => ({ ...prev, _pendingModules: p.modules }));
    setShowAddCourse(true);
    alert('Parsed fields filled into Add Course form — review and submit.');
  };
  const saveParsedAsCourse = async () => {
    if (!syllabusParsed?.parsed) return;
    const p = syllabusParsed.parsed;
    const discId = syllabusTargetDisc || courseDisc || dbData.curriculum[0]?.id;
    if (!discId) { alert('Pick a Program first.'); return; }
    if (!p.courseName || !p.code) { alert('Course Name and Code required — edit preview or course form.'); return; }
    const matched = (dbData.examination_types||[]).find(t => t.name.toLowerCase()===String(p.examinationType||'').toLowerCase());
    const examTypeId = matched?.id || courseExamTypeId || null;
    const minsEff2 = (()=>{ const v=Number(dbData.curriculum.find(x=>x.id===discId)?.period_minutes); return Number.isFinite(v)&&v>=10&&v<=120?v:45; })();
    const thRaw2 = p.teachingHours; const th = thRaw2!=null && thRaw2!=='' ? Number(thRaw2) : (p.teachingPeriods!=null ? Math.round(Number(p.teachingPeriods)*minsEff2/60*100)/100 : null);
    const tp = th!=null && Number.isFinite(th) && th>0 ? Math.round(th*60/minsEff2) : null;
    const objectives = (p.objectives||[]).filter(Boolean);
    const outcomes = (p.outcomes||[]).filter(Boolean).map((t,i)=>({code:`CO${i+1}`, text:t}));
    const pedagogy = String(p.pedagogy||'').trim() || null;
    const disc = dbData.curriculum.find(d=>d.id===discId);
    const mode = disc?.structure_mode || 'semester';
    const _shred2=(s)=>{const m=String(s||'').match(/(\d+)\s*h/i), n=String(s||'').match(/(\d+)\s*m/i); return {h:m?m[1]:'', mm:n?n[1]:''};};
    const _a2 = p._cieH!=null||p._cieM!=null ? {h:p._cieH||'',mm:p._cieM||''} : _shred2(p.examinationHoursCie);
    const _b2 = p._seeH!=null||p._seeM!=null ? {h:p._seeH||'',mm:p._seeM||''} : _shred2(p.examinationHoursSee);
    const cieStr2 = (_a2.h!==''||_a2.mm!=='')?`${_a2.h||0}h ${_a2.mm||0}m`:(p.examinationHoursCie||null);
    const seeStr2 = (_b2.h!==''||_b2.mm!=='')?`${_b2.h||0}h ${_b2.mm||0}m`:(p.examinationHoursSee||null);
    const coursePayload = {
      discipline_id: discId, code: String(p.code).trim(), name: String(p.courseName).trim(),
      type: p.type || courseKind, credits: p.credits ?? 0, teaching_hours: th, teaching_periods: tp,
      cie_marks: p.cieMarks ?? 0, see_marks: p.seeMarks ?? 0,
      examination_type: p.examinationType || null, examination_type_id: examTypeId,
      cie_hours: _a2.h===''?null:(_a2.h!=null?Number(_a2.h):null), cie_mins: _a2.mm===''?null:(_a2.mm!=null?Number(_a2.mm):null),
      see_hours: _b2.h===''?null:(_b2.h!=null?Number(_b2.h):null), see_mins: _b2.mm===''?null:(_b2.mm!=null?Number(_b2.mm):null),
      examination_hours_cie: cieStr2, examination_hours_see: seeStr2,
      cie_duration: cieStr2, see_duration: seeStr2,
      objectives_json: objectives, outcomes_json: outcomes, pedagogy,
      semester: p.semester || courseSem, year_label: p.yearLabel || (mode==='yearly' ? courseYearLabel : null),
      year_number: p.yearLabel ? (ROMAN.indexOf(String(p.yearLabel).replace('Year ','').trim())+1 || null) : null,
    };
    if (mode==='yearly' && !coursePayload.year_label) { alert('Choose a Year for this program.'); return; }
    setSyllabusSaving(true);
    try {
      const res = await apiCall(`${apiUrl}/api/courses`, { method:'POST', body: JSON.stringify(coursePayload) });
      if (!res.ok) { const e=await res.json().catch(()=>({})); alert(e.error||'Create course failed'); return; }
      const created = await res.json().catch(()=>null);
      const courseId = created?.id;
      const mods = syllabusParsed._pendingModules || p.modules || [];
      let singleSyllId = null;
      if (courseId && mods.length) {
        const existingSyll2 = (dbData.course_syllabi||[]).filter(s=>s.course_id===courseId).sort((a,b)=> (b.version_number||0)-(a.version_number||0))[0];
        if (existingSyll2) singleSyllId = existingSyll2.id;
        else {
          const ay2 = syllModAcademicYear || `${new Date().getFullYear()}-${String(new Date().getFullYear()+1).slice(2)}`;
          const rr2 = await apiCall(`${apiUrl}/api/course_syllabi`, { method:'POST', body: JSON.stringify({ course_id: courseId, academic_year: ay2, status: 'draft' }) });
          if (rr2.ok) { const j2=await rr2.json().catch(()=>null); if (j2?.id) singleSyllId=j2.id; }
        }
      }
      if (courseId && mods.length) {
        for (const mm of mods) {
          const rr = await apiCall(`${apiUrl}/api/course_modules`, { method:'POST', body: JSON.stringify({ course_id: courseId, syllabus_id: singleSyllId, module_number: mm.module_number, title: mm.title, hours: mm.hours ?? null, rbt_level: mm.rbt_level || null, methodology: mm.methodology || null, co_mapping: mm.co_mapping || null }) });
          const mc = await rr.json().catch(()=>null);
          const modId = mc?.id;
          if (modId && mm.topics?.length) {
            for (let i=0;i<mm.topics.length;i++) await apiCall(`${apiUrl}/api/course_module_topics`, { method:'POST', body: JSON.stringify({ module_id: modId, topic: mm.topics[i], sort_order: i }) });
          }
        }
      }
      // also save structured syllabus to Mongo for detail view
      if (courseId && (objectives.length || outcomes.length || mods.length)) {
        await apiCall(`${apiUrl}/api/curriculum-content/course_${courseId}`, { method:'PUT', body: JSON.stringify({ objectives, outcomes: outcomes.map(o=>o.text), pedagogy: pedagogy ? pedagogy.split('\n').filter(Boolean) : [], modules: mods.map(m=>({ title:m.title, hours:m.hours, rbt_level:m.rbt_level, methodology:m.methodology, co_mapping:m.co_mapping, topics:m.topics, description:'' })), assessments: '' }) }).catch(()=>{});
      }
      alert('Course + modules saved from file.');
      setSyllabusParsed(null); setSyllabusFile(null); setSyllabusTargetDisc(''); fetchData();
    } finally { setSyllabusSaving(false); }
  };
  const downloadTemplate = async () => {
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const headers = {};
      if (sess?.access_token) headers.Authorization = `Bearer ${sess.access_token}`;
      const res = await fetch(`${apiUrl}/api/curriculum/template`, { headers });
      if (!res.ok) { const j=await res.json().catch(()=>({})); alert(j.error||'Template download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'NadaGurukulam_Curriculum_Import_Template.xlsx'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { alert(String(e.message||e)); }
  };
  const clearModuleForm = () => { setModTitle(''); setModHours(''); setModPeriods(''); setModRbtList([]); setModMethodList([]); setModMethod(''); setModTopics([]); setModTopicsText(''); setModCo([]); setModCoDetail(''); };
  const collectCurrentModule = () => {
    if (!modTitle.trim()) return null;
    const disc = dbData.curriculum.find(d=>d.id===activeSyllabusCourse?.discipline_id);
    const mins = (()=>{ const v=Number(disc?.period_minutes); return Number.isFinite(v)&&v>=10&&v<=120?v:45; })();
    let hrs = null;
    if (modHours !== '' && modHours != null) hrs = Number(modHours);
    else if (modPeriods !== '' && modPeriods != null) hrs = Math.round(Number(modPeriods) * mins / 60 * 100)/100;
    const rbtLevels = modRbtList.length ? modRbtList : (modRbt ? [modRbt] : []);
    const methList = modMethodList.length ? modMethodList : (modMethod ? modMethod.split('\n').map(s=>s.trim()).filter(Boolean) : []);
    const topicsArr = modTopics.length ? modTopics.filter(t=>String(t.topic||'').trim()).map((t,i)=>({ topic: String(t.topic).trim(), description: String(t.description||'').trim()||null, sort_order: i })) : (modTopicsText.trim() ? modTopicsText.split('\n').map(s=>s.trim()).filter(Boolean).map((topic,i)=>({ topic, description:null, sort_order:i })) : []);
    return { title: modTitle.trim(), hours: hrs, rbt_level: rbtLevels[0]||null, rbt_levels: rbtLevels, methodology: methList.join('\n')||null, methodology_list: methList, co_mapping: modCo.join(', ')||null, topicsArr };
  };
  const handleQueueModule = () => {
    const cur = collectCurrentModule();
    if (!cur) { alert('Enter Module Name'); return; }
    setPendingSyllMods(prev=>[...prev, cur]);
    clearModuleForm();
  };
  const handleSaveSyllabusBatch = async () => {
    if (!activeSyllabusCourse?.id) return;
    const toSave = [...pendingSyllMods];
    const cur = collectCurrentModule();
    if (cur) toSave.push(cur);
    if (!toSave.length) { alert('Add at least one module (fill Module Name and click + Add Module, or fill and Save directly).'); return; }
    let syllId = null;
    const existingForYear = (dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id && s.academic_year===syllModAcademicYear).sort((a,b)=> (b.version_number||0)-(a.version_number||0))[0];
    const anyExisting = (dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id).sort((a,b)=> (b.version_number||0)-(a.version_number||0))[0];
    if (existingForYear) syllId = existingForYear.id;
    else if (anyExisting && !syllModAcademicYear) syllId = anyExisting.id;
    else if (syllModAcademicYear) {
      const rr = await apiCall(`${apiUrl}/api/course_syllabi`, { method:'POST', body: JSON.stringify({ course_id: activeSyllabusCourse.id, academic_year: syllModAcademicYear, status: 'draft' }) });
      if (!rr.ok) { const e=await rr.json().catch(()=>({})); alert(e.error||'Create syllabus version failed'); return; }
      const j=await rr.json().catch(()=>null); if (j?.id) syllId = j.id;
    }
    const all = dbData.course_modules.filter(m=>m.course_id===activeSyllabusCourse.id);
    let nextNum = all.reduce((m,x)=>Math.max(m, Number(x.module_number)||0), 0) + 1;
    for (const entry of toSave) {
      const r = await apiCall(`${apiUrl}/api/course_modules`, { method:'POST', body: JSON.stringify({ course_id: activeSyllabusCourse.id, syllabus_id: syllId, module_number: nextNum++, title: entry.title, hours: entry.hours, rbt_level: entry.rbt_level, rbt_levels: entry.rbt_levels, methodology: entry.methodology, methodology_list: entry.methodology_list, co_mapping: entry.co_mapping }) });
      if (!r.ok) { const e=await r.json().catch(()=>({})); alert(e.error||'Add module failed'); return; }
      const created = await r.json().catch(()=>null); const modId=created?.id;
      if (modId && entry.topicsArr?.length) {
        for (let i=0;i<entry.topicsArr.length;i++) { const t=entry.topicsArr[i]; await apiCall(`${apiUrl}/api/course_module_topics`, { method:'POST', body: JSON.stringify({ module_id: modId, topic: t.topic, description: t.description||null, sort_order: t.sort_order }) }); }
      }
    }
    setPendingSyllMods([]); clearModuleForm(); fetchData();
  };
  const handleAddModule = handleQueueModule;
  const handleDeleteModule = async (id) => {
    if (!confirm('Delete module?')) return;
    await apiCall(`${apiUrl}/api/course_modules/${id}`, { method:'DELETE' }); fetchData();
  };

  const handleUpdateCourse = async (id, payload) => {
    const full = {
      ...payload,
      objectives_json: editObjectives.filter(s=>String(s).trim()),
      outcomes_json: editOutcomes.filter(o=>o.text.trim()).map(o=>({code:o.code,text:o.text.trim()})),
      pedagogy: editPedagogyList.length ? editPedagogyList.filter(s=>String(s).trim()).join('\n') : (editPedagogy.trim()||null),
    };
    const res = await apiCall(`${apiUrl}/api/courses/${id}`, { method: 'PUT', body: JSON.stringify(full) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Update failed'); return; }
    setEditingCourse(null); setEditObjectives([]); setEditOutcomes([]); setEditPedagogyList([]); setEditPedagogy(''); fetchData();
  };
  const hydrateEditCourse = (c) => {
    setEditingCourse(c.id); setEditCourse({ ...c });
    try { const a=c.objectives_json; setEditObjectives(Array.isArray(a)?a:(typeof a==='string'?JSON.parse(a):[])); } catch { setEditObjectives([]); }
    try { const j=c.outcomes_json; const arr=Array.isArray(j)?j:(typeof j==='string'?JSON.parse(j):[]); setEditOutcomes(arr.map((o,i)=>typeof o==='string'?{code:`CO${i+1}`,text:o}:{code:o.code||`CO${i+1}`,text:o.text||''})); } catch { setEditOutcomes([]); }
    const ped=String(c.pedagogy||''); setEditPedagogy(ped); setEditPedagogyList(ped?ped.split('\n').map(s=>s.trim()).filter(Boolean):[]);
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
            {(() => {
              const all = pubDisciplines.length ? pubDisciplines : dbData.curriculum;
              const groups = {};
              all.forEach(a => { const k = a.category_name || 'Other'; (groups[k] = groups[k] || []).push(a); });
              const keys = Object.keys(groups).sort();
              if (all.length===0) return <p style={{ color: 'var(--text-faint)' }}>Disciplines will appear here as they&apos;re added in the portal (Curricula module).</p>;
              return keys.map(cat => (
                <div key={cat} style={{ marginBottom: '22px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-deep)', marginBottom: '10px', letterSpacing: '0.04em' }}>{cat.toUpperCase()}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    {groups[cat].map(art => (
                      <div key={art.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
                        <h4 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>{art.name}</h4>
                        <p style={{ fontSize: '14px', color: 'var(--text-soft)', margin: 0 }}>{art.description || art.levels || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
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
          <main style={{ padding: activeModule==='timetable' ? '20px 16px' : '36px', maxWidth: activeModule==='timetable' ? 'none' : '940px', width: '100%', overflow: activeModule==='timetable' ? 'visible' : undefined }}>
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
                        {roles.filter(r => !(r.key === 'super_admin' && hasSuperAdminUser)).map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
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
                                <select value={editUserRoleKey} onChange={e => setEditUserRoleKey(e.target.value)} disabled={u.role_key === 'super_admin'} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', minWidth: '150px', opacity: u.role_key === 'super_admin' ? 0.6 : 1 }} title={u.role_key === 'super_admin' ? 'Super Admin cannot be changed' : undefined}>
                                  {roles.filter(r => !(r.key === 'super_admin' && u.role_key !== 'super_admin' && hasSuperAdminUser)).map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
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
                              {isFull('users') && u.role_key !== 'super_admin' && <button onClick={() => handleDelete('users', u.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
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
                <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-saffron)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px 22px 18px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  <div className="ndg-corner" style={{ top: '-18px', right: '-18px', width: '90px', height: '90px', borderRadius: '50%', background: 'var(--primary)', opacity: 0.06 }} />
                  <div className="ndg-corner" style={{ bottom: '-24px', left: '-24px', width: '120px', height: '120px', borderRadius: '50%', background: 'var(--accent)', opacity: 0.08 }} />
                  <div style={{ position: 'absolute', inset: '10px', border: '1px dashed var(--divider)', borderRadius: 'var(--radius-xl)', opacity: 0.55, pointerEvents: 'none' }} />
                  <div className="ndg-watermark" style={{ right: '18px', top: '50%', transform: 'translateY(-50%)', fontSize: '120px', opacity: 0.07, fontFamily: 'Amita, serif' }}>ॐ</div>
                  <div style={{ position: 'relative' }}>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary-deep)', letterSpacing: '-0.01em', marginBottom: '6px' }}>Curriculum & Syllabus</h2>
                    <p style={{ color: 'var(--text-soft)', fontSize: '13px', lineHeight: 1.5, margin: 0, maxWidth: '640px' }}>Dynamic university syllabus structure — Programs, Semesters and Courses in the MPA document format. Manage categories, programs, courses and syllabus versions in one place.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '14px' }}>
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl-sm)', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}><div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Programs</div><div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary-deep)', lineHeight: 1 }}>{dbData.curriculum.length}</div><div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>active disciplines</div></div>
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl-sm)', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}><div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Categories</div><div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary-deep)', lineHeight: 1 }}>{(dbData.program_categories||[]).length}</div><div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>UG / PG / Diploma</div></div>
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl-sm)', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}><div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Courses</div><div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary-deep)', lineHeight: 1 }}>{(dbData.courses||[]).length}</div><div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>across all programs</div></div>
                    </div>
                  </div>
                </div>
                <div className="ndg-om-divider" style={{ margin: '0 0 18px', fontSize: '13px' }}>ॐ</div>
                {/* Program categories — centrally managed (UG/PG/Diploma…) */}
                {canCreate('curriculum') && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <b style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Program Categories</b>
                      <input placeholder="New category (e.g. Diploma)" value={newProgCatName} onChange={e => setNewProgCatName(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 160px', fontSize: '13px' }} />
                      <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-soft)', fontWeight: 600 }}>Duration
                        <input type="number" min="1" max="99" placeholder="e.g. 2" value={newProgCatDurVal} onChange={e => setNewProgCatDurVal(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '70px', fontSize: '13px' }} />
                        <select value={newProgCatDurUnit} onChange={e => setNewProgCatDurUnit(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}>
                          <option value="years">Years</option><option value="months">Months</option>
                        </select>
                      </label>
                      <button type="button" onClick={handleAddProgCat} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>Add</button>
                    </div>
                    {(dbData.program_categories||[]).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {(dbData.program_categories||[]).map(cat => editingProgCat===cat.id ? (
                          <span key={cat.id} style={{ display:'flex', gap:'6px', alignItems:'center', background:'#fff', border:'1px solid var(--border)', padding:'4px 8px', borderRadius:'99px', flexWrap:'wrap' }}>
                            <input value={progCatEditName} onChange={e=>setProgCatEditName(e.target.value)} style={{ padding:'4px 8px', border:'1px solid var(--border)', borderRadius:'99px', fontSize:'12px', width:'110px' }} />
                            <input type="number" min="1" max="99" value={progCatEditDurVal} onChange={e=>setProgCatEditDurVal(e.target.value)} placeholder="Dur" style={{ padding:'4px 8px', border:'1px solid var(--border)', borderRadius:'99px', fontSize:'12px', width:'60px' }} />
                            <select value={progCatEditDurUnit} onChange={e=>setProgCatEditDurUnit(e.target.value)} style={{ padding:'4px 8px', border:'1px solid var(--border)', borderRadius:'99px', fontSize:'11px' }}>
                              <option value="years">Years</option><option value="months">Months</option>
                            </select>
                            <button type="button" onClick={()=>handleUpdateProgCat(cat)} style={{ background:'var(--primary)', color:'#fff', border:'none', padding:'3px 10px', borderRadius:'99px', cursor:'pointer', fontSize:'11px' }}>Save</button>
                            <button type="button" onClick={()=>setEditingProgCat(null)} style={{ background:'none', border:'1px solid var(--border)', padding:'3px 10px', borderRadius:'99px', cursor:'pointer', fontSize:'11px' }}>Cancel</button>
                          </span>
                        ) : (
                          <span key={cat.id} style={{ display:'flex', gap:'6px', alignItems:'center', background:'#fff', border:'1px solid var(--border)', padding:'4px 10px', borderRadius:'99px', fontSize:'12.5px' }}>
                            {cat.name}{cat.duration_value ? <span style={{ fontSize:'11px', color:'var(--text-faint)', border:'1px solid var(--border)', padding:'1px 6px', borderRadius:'99px', background:'var(--bg)' }}>{cat.duration_value} {cat.duration_unit}</span> : null}
                            {canAdmin('curriculum') && <button type="button" onClick={()=>{setEditingProgCat(cat.id); setProgCatEditName(cat.name); setProgCatEditDurVal(cat.duration_value ? String(cat.duration_value) : ''); setProgCatEditDurUnit(cat.duration_unit||'years');}} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'11px', color:'var(--primary)' }}>Edit</button>}
                            {isFull('curriculum') && <button type="button" onClick={()=>{ if(confirm(`Delete category "${cat.name}"?`)) apiCall(`${apiUrl}/api/program_categories/${cat.id}`,{method:'DELETE'}).then(r=>{ if(!r.ok) r.json().then(j=>alert(j.error||'Delete failed')).catch(()=>alert('Delete failed')); else fetchData(); }); }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'11px', color:'var(--primary)' }}>Delete</button>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {canCreate('curriculum') && (
                  <form onSubmit={handleAddDiscipline} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '18px', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 220px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-soft)' }}>Program Name
                        <input placeholder="Program / Discipline name" value={newDiscName} onChange={e => setNewDiscName(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }} required />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-soft)' }}>Category (UG/PG)
                        <select value={newDiscCat} onChange={e => setNewDiscCat(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                          <option value="">— Uncategorized —</option>
                          {(dbData.program_categories||[]).map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-soft)' }}>Structure
                        <select value={newDiscStructure} onChange={e => setNewDiscStructure(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }} title="Structure">
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="semester">Semester Based</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      {newDiscStructure === 'monthly' && (
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>No. of Months (equal split) {newDiscCatLimit ? <span style={{ fontWeight:400, color:'var(--text-faint)' }}>(max {newDiscMaxMonths})</span> : null}
                          <input type="number" min="1" max={newDiscMaxMonths} value={newDiscMonthCount} onChange={e => setNewDiscMonthCount(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '130px' }} />
                        </label>
                      )}
                      {newDiscStructure === 'yearly' && (
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>No. of Years {newDiscCatLimit ? <span style={{ fontWeight:400, color:'var(--text-faint)' }}>(max {newDiscMaxYears} from category)</span> : null}
                          <input type="number" min="1" max={newDiscMaxYears} value={newDiscYearCount} onChange={e => setNewDiscYearCount(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '110px' }} />
                        </label>
                      )}
                      {newDiscStructure === 'semester' && (
                        <>
                          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>No. of Years {newDiscCatLimit ? <span style={{ fontWeight:400, color:'var(--text-faint)' }}>(max {newDiscMaxYears})</span> : null}
                            <input type="number" min="1" max={newDiscMaxYears} value={newDiscYearCount} onChange={e => setNewDiscYearCount(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '110px' }} />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>Semesters / Year
                            <input type="number" min="1" max="4" value={newDiscSemPerYear} onChange={e => setNewDiscSemPerYear(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '95px' }} />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>Total Semesters (derived) {newDiscCatLimit ? <span style={{ fontWeight:400, color:'var(--text-faint)' }}>(max {newDiscMaxYears*4})</span> : null}
                            <input value={String((Number(newDiscYearCount)||0)*(Number(newDiscSemPerYear)||0) || '')} readOnly placeholder="—" title="Auto: Years × Per Year" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '110px', background: 'var(--bg)', color: 'var(--text-faint)' }} />
                          </label>
                          <span style={{ fontSize: '11px', color: 'var(--text-faint)', alignSelf: 'flex-end', paddingBottom: '10px' }}>{(Number(newDiscYearCount)||0)*(Number(newDiscSemPerYear)||0) ? `${Number(newDiscYearCount)}y × ${Number(newDiscSemPerYear)}/yr = ${(Number(newDiscYearCount)||0)*(Number(newDiscSemPerYear)||0)} sem` : '—'}</span>
                        </>
                      )}
                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>Period duration (mins)
                        <input type="number" min="10" max="120" value={newDiscPeriodMins} onChange={e => setNewDiscPeriodMins(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '130px' }} title="Minutes per period — used for hours↔periods everywhere for this program" />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', gap: '4px' }}>Effective from (future courses)
                        <input type="date" value={newDiscEffFrom} onChange={e => setNewDiscEffFrom(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }} title="When new period applies — future courses only" />
                      </label>
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-soft)' }}>Description
                      <textarea value={newDiscDesc} onChange={e => setNewDiscDesc(e.target.value)} rows={2} placeholder="Program description — appears on public Courses offered" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'inherit', fontSize: '13.5px' }} />
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>Add Program</button>
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Period = {newDiscPeriodMins} min · {progMins ? `${progMins} min` : '45 min'} per period for hours conversion</span>
                    </div>
                  </form>
                )}

                {/* Programs list — grouped by category; category + structure + period */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: '24px', boxShadow: 'var(--shadow-sm)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Program</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Category</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Structure</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Period</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Description</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.curriculum.length === 0 ? (
                        <tr><td colSpan="6" style={{ padding: '18px', textAlign: 'center', color: 'var(--text-faint)' }}>No programs yet.</td></tr>
                      ) : dbData.curriculum.map(d => {
                        const catName = (dbData.program_categories||[]).find(c=>c.id===d.category_id)?.name || '';
                        return editingDisc === d.id ? (
                          <tr key={d.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                            <td style={{ padding: '8px' }}><label style={{ fontSize: '11px', color: 'var(--text-soft)', fontWeight: 600 }}>Name<br /><input value={discEditName} onChange={e => setDiscEditName(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></label></td>
                            <td style={{ padding: '8px' }}><label style={{ fontSize: '11px', color: 'var(--text-soft)', fontWeight: 600 }}>Category<br /><select value={discEditCat} onChange={e => setDiscEditCat(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }}><option value="">—</option>{(dbData.program_categories||[]).map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></td>
                            <td style={{ padding: '8px' }}>
                              <label style={{ fontSize: '11px', color: 'var(--text-soft)', fontWeight: 600 }}>Structure<br /><select value={discEditStructure} onChange={e => setDiscEditStructure(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', marginBottom: '6px' }}>
                                <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="semester">Semester Based</option>
                              </select></label>
                              {discEditStructure === 'monthly' && <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Months{editDiscCatLimit?<span style={{color:'var(--text-faint)'}}> (max {editDiscMaxYears*12})</span>:null}<br /><input type="number" min="1" max={editDiscCatLimit ? editDiscMaxYears*12 : 24} value={discEditMonthCount} onChange={e => setDiscEditMonthCount(e.target.value)} placeholder="Months" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', marginBottom: '6px' }} /></label>}
                              {discEditStructure === 'yearly' && <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Years{editDiscCatLimit?<span style={{color:'var(--text-faint)'}}> (max {editDiscMaxYears})</span>:null}<br /><input type="number" min="1" max={editDiscMaxYears} value={discEditYearCount} onChange={e => setDiscEditYearCount(e.target.value)} placeholder="Years" title="Years" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', marginBottom: '6px' }} /></label>}
                              {discEditStructure === 'semester' && <><label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Years{editDiscCatLimit?<span style={{color:'var(--text-faint)'}}> (max {editDiscMaxYears})</span>:null}<br /><input type="number" min="1" max={editDiscMaxYears} value={discEditYearCount} onChange={e => setDiscEditYearCount(e.target.value)} placeholder="Years" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width:'100%', marginBottom:'4px' }} /></label><label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Per Year<br /><input type="number" min="1" max="4" value={discEditSemPerYear} onChange={e => setDiscEditSemPerYear(e.target.value)} placeholder="Per Year" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', marginBottom:'4px' }} /></label><label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Total (derived){editDiscCatLimit?<span style={{color:'var(--text-faint)'}}> (max {editDiscMaxYears*4})</span>:null}<br /><input value={String((Number(discEditYearCount)||0)*(Number(discEditSemPerYear)||0) || '')} readOnly placeholder="—" title="Auto: Years × Per Year" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width:'100%', marginBottom:'4px', background:'var(--bg)' }} /></label></>}
                            </td>
                            <td style={{ padding: '8px' }}>
                              <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Mins<br /><input type="number" min="10" max="120" value={discEditPeriodMins} onChange={e => setDiscEditPeriodMins(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', marginBottom: '6px' }} /></label>
                              <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>From<br /><input type="date" value={discEditEffFrom||''} onChange={e => setDiscEditEffFrom(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></label>
                            </td>
                            <td style={{ padding: '8px' }}><label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Description<br /><input value={discEditDesc} onChange={e => setDiscEditDesc(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} /></label></td>
                            <td style={{ padding: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button onClick={() => { const b={ name: discEditName.trim(), levels: discEditLevels.trim(), description: discEditDesc.trim(), structure_mode: discEditStructure, category_id: discEditCat || null, period_minutes: Number(discEditPeriodMins) || 45, period_effective_from: discEditEffFrom || null }; if(discEditStructure==='monthly') b.month_count=Number(discEditMonthCount)||12; else if(discEditStructure==='yearly') b.year_count=Number(discEditYearCount)||2; else { const yrs=Number(discEditYearCount)||2, per=Number(discEditSemPerYear)||2; if(!Number.isFinite(yrs)||yrs<1||yrs>10){ alert('Years must be 1-10.'); return; } if(!Number.isFinite(per)||per<1||per>4){ alert('Semesters per year must be 1-4.'); return; } b.year_count=yrs; b.semesters_per_year=per; } handleUpdateDiscipline(d,b); }} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                              <button onClick={() => setEditingDisc(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.name}<br /><span style={{ fontWeight: 400, fontSize: '11.5px', color: 'var(--text-faint)' }}>{d.levels || ''}</span></td>
                            <td style={{ padding: '10px 12px' }}>{catName ? <span style={{ background: 'var(--primary)', color: '#fff', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700 }}>{catName}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-soft)', fontSize: '12.5px' }}>
                              {d.structure_mode === 'monthly' ? `Monthly · ${d.month_count||12} mo` : d.structure_mode === 'yearly' ? `Yearly · ${d.year_count || 2} yrs` : `Semester · ${d.year_count||2}y × ${d.semesters_per_year || 2}/yr`}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-soft)', fontSize: '12.5px' }}>{d.period_minutes ? `${d.period_minutes} min` : '45 min'}{d.period_effective_from ? <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}><br />from {d.period_effective_from}</span> : ''}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-soft)' }}>{d.description || '—'}</td>
                            <td style={{ padding: '10px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {canAdmin('curriculum') && <button onClick={() => { setEditingDisc(d.id); setDiscEditName(d.name || ''); setDiscEditLevels(d.levels || ''); setDiscEditDesc(d.description || ''); setDiscEditStructure(d.structure_mode || 'semester'); const yc=d.year_count||2, sp=d.semesters_per_year||2; setDiscEditYearCount(yc); setDiscEditSemPerYear(sp); setDiscEditTotalSems(String(yc*sp)); setDiscEditMonthCount(d.month_count||12); setDiscEditCat(d.category_id || ''); setDiscEditPeriodMins(d.period_minutes || 45); setDiscEditEffFrom(d.period_effective_from || ''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
                              {isFull('curriculum') && <button onClick={() => handleDelete('curriculum', d.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {canCreate('curriculum') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    {/* Add Course — collapsible, 15 ordered fields with side headings */}
                    {!showAddCourse ? (
                      <button type="button" onClick={() => setShowAddCourse(true)} style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: 'var(--shadow-sm)' }}>+ Add Course</button>
                    ) : (
                    <form onSubmit={handleAddCourse} style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                      <div className="ndg-corner" style={{ top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary)', opacity: 0.05 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b style={{ fontSize: '15px', color: 'var(--primary-deep)' }}>Add Course</b>
                        <button type="button" onClick={() => setShowAddCourse(false)} style={{ background: 'none', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Collapse</button>
                      </div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--primary-deep)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '-4px' }}><span style={{ width: '3px', height: '14px', background: 'var(--primary)', borderRadius: '99px' }} /> Context</div>
                      {/* 1. Choose program */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>1. Choose Program</label>
                        <select value={courseDisc} onChange={e => setCourseDisc(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 220px', minWidth: '180px' }}>
                          <option value="">Select Program…</option>
                          {dbData.curriculum.map(d => { const cat=(dbData.program_categories||[]).find(c=>c.id===d.category_id)?.name; return <option key={d.id} value={d.id}>{d.name}{cat?` · ${cat}`:''}</option>; })}
                        </select>
                        {selectedDisc && <span style={{ fontSize: '11px', color: 'var(--text-faint)', background: 'var(--bg)', padding: '3px 8px', borderRadius: '99px', border: '1px solid var(--border)' }}>{progMins} min / period</span>}
                      </div>
                      {/* 2. Year / Semester / Month — per structure */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>2. Year / Semester / Month</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                          {selectedDiscStructure === 'monthly' && (
                            <select value={courseMonthLabel} onChange={e => setCourseMonthLabel(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 140px' }}>
                              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          )}
                          {selectedDiscStructure === 'yearly' && (
                            <select value={courseYearLabel} onChange={e => setCourseYearLabel(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 140px' }}>
                              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          )}
                          {selectedDiscStructure === 'semester' && (
                            <>
                              <select value={courseYearLabel} onChange={e => setCourseYearLabel(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 120px' }}>
                                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                              <select value={courseSem} onChange={e => { const v=e.target.value; setCourseSem(v); if(selectedDiscStructure==='semester'){ const per=Number(selectedDisc?.semesters_per_year)||2; const idx=(courseSemesters||[]).indexOf(v); if(idx>=0){ const yIdx=Math.floor(idx/per); const want=`Year ${ROMAN[yIdx]||'I'}`; if(want!==courseYearLabel) setCourseYearLabel(want); } } }} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 120px' }}>
                                {semestersForSelectedYear.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <span style={{ fontSize: '11px', color: 'var(--text-faint)', alignSelf: 'center' }}>Year {courseYearLabel.replace('Year ', '')} → {semestersForSelectedYear.join(', ')}</span>
                            </>
                          )}
                          {!['monthly','yearly','semester'].includes(selectedDiscStructure) && <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Pick Program first</span>}
                        </div>
                      </div>
                      <div style={{ height: '1px', background: 'var(--divider)', opacity: 0.6, margin: '4px 0' }} />
                      <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--primary-deep)', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '3px', height: '14px', background: 'var(--primary)', borderRadius: '99px' }} /> Identity</div>
                      {/* 3. Course name */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>3. Course Name</label>
                        <input placeholder="Course Name *" value={courseName} onChange={e => setCourseName(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 260px' }} required />
                      </div>
                      {/* 4. Course Code */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>4. Course Code</label>
                        <input placeholder="Code (BCVP310) *" value={courseCode} onChange={e => setCourseCode(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', flex: '1 1 160px', width: '160px' }} required />
                      </div>
                      {/* 5. Course Type */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>5. Course Type</label>
                        <select value={courseKind} onChange={e => setCourseKind(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '140px' }} title="Type">
                          <option value="DSC">DSC</option><option value="SEC">SEC</option><option value="DSE">DSE</option><option value="AECC">AECC</option><option value="GE">GE</option><option value="Core">Core</option>
                        </select>
                      </div>
                      {/* 6. Credits */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>6. No. of Credits</label>
                        <input type="number" min="0" placeholder="Credits" title="Credits" value={courseCredits} onChange={e => setCourseCredits(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '110px' }} />
                      </div>
                      <div style={{ height: '1px', background: 'var(--divider)', opacity: 0.6, margin: '4px 0' }} />
                      <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--primary-deep)', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '3px', height: '14px', background: 'var(--primary)', borderRadius: '99px' }} /> Workload & Exams</div>
                      {/* 7. Teaching hours → periods (reverse: hours input, periods auto) */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>7. Teaching Hours</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: 'var(--text-soft)' }}>Hours
                            <input type="number" min="0" step="0.5" placeholder="Hours" value={courseHours} onChange={e => setCourseHours(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '110px' }} />
                          </label>
                          <span style={{ fontSize: '18px', color: 'var(--text-faint)', paddingTop: '14px' }}>→</span>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: 'var(--text-soft)' }}>Periods (auto)
                            <input type="text" value={derivedPeriods === '' ? '' : String(derivedPeriods)} readOnly placeholder="auto" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '110px', background: 'var(--bg)', color: 'var(--text-faint)' }} />
                          </label>
                          <span style={{ fontSize: '11px', color: 'var(--text-faint)', paddingTop: '14px' }}>hours × 60 / {progMins} min — periods auto</span>
                        </div>
                      </div>
                      {/* 8. CIE Marks */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>8. CIE Marks</label>
                        <input type="number" min="0" placeholder="CIE marks" value={courseCie} onChange={e => setCourseCie(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '120px' }} />
                      </div>
                      {/* 9. CIE duration — hours + mins */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>9. CIE Duration</label>
                        <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="99" value={courseCieH} onChange={e=>setCourseCieH(e.target.value)} placeholder="hrs" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '70px' }} /> hrs</label>
                        <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="59" value={courseCieM} onChange={e=>setCourseCieM(e.target.value)} placeholder="mins" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '70px' }} /> mins</label>
                      </div>
                      {/* 10. SEE Marks */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>10. SEE Marks</label>
                        <input type="number" min="0" placeholder="SEE marks" value={courseSee} onChange={e => setCourseSee(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '120px' }} />
                      </div>
                      {/* 11. SEE duration — hours + mins */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>11. SEE Duration</label>
                        <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="99" value={courseSeeH} onChange={e=>setCourseSeeH(e.target.value)} placeholder="hrs" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '70px' }} /> hrs</label>
                        <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="59" value={courseSeeM} onChange={e=>setCourseSeeM(e.target.value)} placeholder="mins" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '70px' }} /> mins</label>
                      </div>
                      {/* 12. Exam type */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0 }}>12. Exam Type</label>
                        <select value={courseExamTypeId} onChange={e => setCourseExamTypeId(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', minWidth: '180px', flex: '1 1 180px' }} title="Examination Type (dynamic)">
                          <option value="">Examination type…</option>
                          {(dbData.examination_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <input placeholder="New exam type" value={newExamTypeName} onChange={e => setNewExamTypeName(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '150px' }} />
                        <button type="button" onClick={handleAddExamType} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px' }}>+ Add type</button>
                      </div>
                      <div style={{ height: '1px', background: 'var(--divider)', opacity: 0.6, margin: '4px 0' }} />
                      <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--primary-deep)', display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '3px', height: '14px', background: 'var(--primary)', borderRadius: '99px' }} /> Objectives & Pedagogy</div>
                      {/* 13. Course Objectives */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0, paddingTop: '6px' }}>13. Course Objectives</label>
                        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button type="button" onClick={() => setCourseObjectives([...courseObjectives, ''])} style={{ alignSelf: 'flex-start', background: 'var(--accent)', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ Add Course Objectives</button>
                          {courseObjectives.length === 0 ? <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No objectives yet — click Add.</span> : courseObjectives.map((txt, i) => (
                            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', minWidth: '22px' }}>{i + 1}.</span>
                              <input value={txt} onChange={e => { const c=[...courseObjectives]; c[i]=e.target.value; setCourseObjectives(c); }} placeholder={`Objective ${i + 1}`} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }} />
                              <button type="button" onClick={() => setCourseObjectives(courseObjectives.filter((_,j)=>j!==i))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* 14. Course Outcomes */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0, paddingTop: '6px' }}>14. Course Outcomes</label>
                        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button type="button" onClick={() => { const n = courseOutcomes.length+1; setCourseOutcomes([...courseOutcomes, { code: `CO${n}`, text: '' }]); }} style={{ alignSelf: 'flex-start', background: 'var(--accent)', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ Add Course Outcomes</button>
                          {courseOutcomes.length === 0 ? (
                            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No outcomes yet — click Add.</span>
                          ) : courseOutcomes.map((o, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ background: 'var(--primary)', color: '#fff', padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, minWidth: '42px', textAlign: 'center' }}>{o.code}</span>
                              <input value={o.text} onChange={e => { const c=[...courseOutcomes]; c[idx]={...c[idx], text:e.target.value}; setCourseOutcomes(c); }} placeholder={`Outcome ${o.code} text`} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }} />
                              <button type="button" onClick={() => setCourseOutcomes(courseOutcomes.filter((_,i)=>i!==idx).map((x,i)=>({ ...x, code:`CO${i+1}` })))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* 15. Pedagogy */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <label style={{ width: '160px', fontSize: '12px', fontWeight: 700, color: 'var(--text-soft)', flexShrink: 0, paddingTop: '6px' }}>15. Pedagogy</label>
                        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button type="button" onClick={() => setCoursePedagogyList([...coursePedagogyList, ''])} style={{ alignSelf: 'flex-start', background: 'var(--accent)', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ Add Pedagogy</button>
                          {coursePedagogyList.length === 0 && !coursePedagogy ? <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No pedagogy yet — click Add.</span> : null}
                          {coursePedagogyList.map((txt, i) => (
                            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', minWidth: '22px' }}>{i + 1}.</span>
                              <input value={txt} onChange={e => { const c=[...coursePedagogyList]; c[i]=e.target.value; setCoursePedagogyList(c); }} placeholder={`Pedagogy ${i + 1}`} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }} />
                              <button type="button" onClick={() => setCoursePedagogyList(coursePedagogyList.filter((_,j)=>j!==i))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                            </div>
                          ))}
                          {coursePedagogyList.length===0 && coursePedagogy ? <textarea value={coursePedagogy} onChange={e=>setCoursePedagogy(e.target.value)} rows={2} placeholder="Live demo involving students..." style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'inherit', fontSize: '13px' }} /> : null}
                        </div>
                      </div>
                      <button type="submit" style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>Save Course</button>
                    </form>
                    )}

                    {/* Import syllabus file — DOCX/PDF/XLSX/CSV/HTML/TXT/PPTX parsed preview then verified save */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <b style={{ fontSize: '14px', color: 'var(--primary-deep)' }}>Import from file</b>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>DOCX / PDF / XLSX / CSV / HTML / TXT / MD / PPTX</span>
                          <button type="button" onClick={downloadTemplate} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>⬇ Download Import Template</button>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Parses program, CIE/SEE, hours/periods, objectives, outcomes, pedagogy, modules → preview → edit & verify per level → publish. Template has Courses + Modules_Topics sheets matching the exact fields.</div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input type="file" accept=".docx,.pdf,.xlsx,.xls,.csv,.html,.htm,.txt,.md,.pptx,.ppt" onChange={e => { setSyllabusFile(e.target.files?.[0] || null); setSyllabusParsed(null); setSyllabusDrafts([]); setSyllabusParseErr(''); }} style={{ flex: '1 1 200px', fontSize: '13px' }} />
                        <select value={syllabusTargetDisc} onChange={e => setSyllabusTargetDisc(e.target.value)} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 180px', fontSize: '13px' }}>
                          <option value="">Program (from file or pick)</option>
                          {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <button type="button" onClick={parseSyllabusFile} disabled={!syllabusFile || syllabusParsing} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '13px', fontWeight:700, boxShadow:'var(--shadow-sm)', opacity: syllabusParsing ? 0.6 : 1 }}>{syllabusParsing ? 'Parsing…' : 'Parse & preview'}</button>
                      </div>
                      {syllabusParseErr && <div style={{ color: 'var(--primary)', fontSize: '13px', background: 'var(--bg-saffron)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>{syllabusParseErr}</div>}
                      {syllabusDrafts.length > 0 && (
                        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ padding: '10px 14px', background: 'var(--bg-saffron)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <b style={{ color: 'var(--primary-deep)' }}>{syllabusDrafts.length} paper{syllabusDrafts.length===1?'':'s'} from {syllabusParsed?.filename || syllabusFile?.name || 'file'} · {(syllabusParsed?.size ?? syllabusFile?.size ?? 0)/1024 ? `${((syllabusParsed?.size ?? syllabusFile?.size ?? 0)/1024).toFixed(1)} KB` : ''}</b>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button type="button" onClick={() => setSyllabusDrafts(ds => ds.map(d => ({ ...d, _include: true })))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Select all</button>
                              <button type="button" onClick={() => setSyllabusDrafts(ds => ds.map(d => ({ ...d, _include: false })))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>None</button>
                              <button type="button" onClick={() => setSyllabusDrafts(ds => ds.map(d => ({ ...d, _expanded: true })))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Expand all</button>
                              <button type="button" onClick={() => setSyllabusDrafts(ds => ds.map(d => ({ ...d, _expanded: false })))} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Collapse</button>
                              <button type="button" onClick={() => { setSyllabusParsed(null); setSyllabusDrafts([]); setSyllabusFile(null); setSyllabusParseErr(''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Clear</button>
                            </div>
                          </div>
                          <div style={{ padding: '10px 14px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{syllabusDrafts.filter(d=>d._include).length} selected · {syllabusDrafts.filter(d=>d._verified).length} verified</span>
                            <button type="button" onClick={saveBulkDrafts} disabled={bulkSaving || !syllabusDrafts.some(d=>d._include)} style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, opacity: bulkSaving || !syllabusDrafts.some(d=>d._include) ? 0.6 : 1 }}>{bulkSaving ? 'Publishing…' : `Publish selected (${syllabusDrafts.filter(d=>d._include).length})`}</button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: 'var(--bg)' }}>
                            {syllabusDrafts.map((d, idx) => (
                              <div key={idx} style={{ border: `1.5px solid ${d._verified ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '10px', overflow: 'hidden', background: '#fff', opacity: d._include ? 1 : 0.55 }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '9px 12px', background: d._verified ? 'var(--bg-saffron)' : 'var(--bg)', flexWrap: 'wrap' }}>
                                  <input type="checkbox" checked={!!d._include} onChange={e => updateDraft(idx, { _include: e.target.checked })} title="Include in publish" />
                                  <b style={{ color: 'var(--primary-deep)', fontSize: '13px', flex: '1 1 160px' }}>{d.code || '(no code)'} · {d.courseName || '(no name)'}</b>
                                  <span style={{ fontSize: '11px', color: 'var(--text-faint)', background: '#fff', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: '99px' }}>{d.semester || '—'} {d.yearLabel ? `· ${d.yearLabel}` : ''} · {d.type || 'DSC'} · {d.modules?.length ?? 0} mods</span>
                                  <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '11.5px', color: d._verified ? 'var(--primary)' : 'var(--text-faint)', cursor: 'pointer' }}><input type="checkbox" checked={!!d._verified} onChange={e => updateDraft(idx, { _verified: e.target.checked })} /> Verified</label>
                                  <button type="button" onClick={() => updateDraft(idx, { _expanded: !d._expanded })} style={{ background: 'none', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>{d._expanded ? 'Collapse' : 'Edit'}</button>
                                  <button type="button" onClick={() => setSyllabusDrafts(ds => ds.filter((_, i) => i !== idx))} style={{ background: 'none', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px', color: 'var(--primary)' }}>Remove</button>
                                </div>
                                {d._expanded && (
                                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                      <input value={d.code || ''} onChange={e => updateDraft(idx, { code: e.target.value })} placeholder="Code *" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '120px', fontSize: '13px' }} />
                                      <input value={d.courseName || ''} onChange={e => updateDraft(idx, { courseName: e.target.value })} placeholder="Course Name *" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 200px', fontSize: '13px' }} />
                                      <select value={d.type || 'DSC'} onChange={e => updateDraft(idx, { type: e.target.value })} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }}><option value="DSC">DSC</option><option value="SEC">SEC</option><option value="DSE">DSE</option><option value="AECC">AECC</option><option value="GE">GE</option><option value="Core">Core</option></select>
                                      <input value={d.semester || ''} onChange={e => updateDraft(idx, { semester: e.target.value })} placeholder="Semester" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '130px', fontSize: '13px' }} />
                                      <input value={d.yearLabel || ''} onChange={e => updateDraft(idx, { yearLabel: e.target.value })} placeholder="Year" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '110px', fontSize: '13px' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                      {(() => { const v=Number((dbData.curriculum.find(x=>x.id===(syllabusTargetDisc||courseDisc))||{}).period_minutes); const mins=Number.isFinite(v)&&v>=10&&v<=120?v:45; const hh=Number(d.teachingHours); const per=(Number.isFinite(hh)&&hh>0)?Math.round(hh*60/mins):''; return <>
                                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>Hours <input type="number" min="0" step="0.5" value={d.teachingHours ?? ''} onChange={e => updateDraft(idx, { teachingHours: e.target.value === '' ? null : Number(e.target.value) })} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '90px', fontSize: '13px' }} /></label>
                                      <span style={{ fontSize: '16px', color: 'var(--text-faint)', paddingBottom: '6px' }}>→</span>
                                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>Periods (auto) <input type="text" value={per===''? '': String(per)} readOnly placeholder="auto" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '90px', fontSize: '13px', background: 'var(--bg)', color: 'var(--text-faint)' }} title={`auto: hours × 60 / ${mins} min`} /></label>
                                      <span style={{ fontSize: '11px', color: 'var(--text-faint)', paddingBottom: '8px' }}>{mins} min/period</span>
                                      </>; })()}
                                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>Credits <input type="number" value={d.credits ?? ''} onChange={e => updateDraft(idx, { credits: e.target.value === '' ? null : Number(e.target.value) })} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '80px', fontSize: '13px' }} /></label>
                                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>CIE <input type="number" value={d.cieMarks ?? ''} onChange={e => updateDraft(idx, { cieMarks: e.target.value === '' ? null : Number(e.target.value) })} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '13px' }} /></label>
                                      <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-soft)', gap: '2px' }}>SEE <input type="number" value={d.seeMarks ?? ''} onChange={e => updateDraft(idx, { seeMarks: e.target.value === '' ? null : Number(e.target.value) })} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '13px' }} /></label>
                                      <input value={d.examinationType || ''} onChange={e => updateDraft(idx, { examinationType: e.target.value })} placeholder="Exam type" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', flex: '1 1 120px', fontSize: '13px' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-soft)' }}>CIE Duration</span>
                                      <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="99" value={d._cieH ?? ''} onChange={e=>updateDraft(idx,{_cieH:e.target.value})} placeholder="hrs" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '13px' }} /> hrs</label>
                                      <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="59" value={d._cieM ?? ''} onChange={e=>updateDraft(idx,{_cieM:e.target.value})} placeholder="mins" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '13px' }} /> mins</label>
                                      <span style={{ width:'12px' }} />
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-soft)' }}>SEE Duration</span>
                                      <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="99" value={d._seeH ?? ''} onChange={e=>updateDraft(idx,{_seeH:e.target.value})} placeholder="hrs" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '13px' }} /> hrs</label>
                                      <label style={{ display: 'flex', gap: '3px', alignItems: 'center', fontSize: '11px', color: 'var(--text-soft)' }}><input type="number" min="0" max="59" value={d._seeM ?? ''} onChange={e=>updateDraft(idx,{_seeM:e.target.value})} placeholder="mins" style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '13px' }} /> mins</label>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)' }}>Objectives — per item</label><button type="button" onClick={() => updateDraft(idx, { objectives: [...(d.objectives || []), ''] })} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>+ Add Objective</button></div>
                                      {(d.objectives || []).length === 0 ? <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No objectives — click Add.</span> : (d.objectives || []).map((txt, oi) => (
                                        <div key={oi} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', minWidth: '18px' }}>{oi + 1}.</span>
                                          <input value={txt} onChange={e => { const a = [...(d.objectives || [])]; a[oi] = e.target.value; updateDraft(idx, { objectives: a }); }} placeholder={`Objective ${oi + 1}`} style={{ flex: 1, padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                          <button type="button" onClick={() => { const a = (d.objectives || []).filter((_, j) => j !== oi); updateDraft(idx, { objectives: a }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)' }}>Outcomes — per item (→ CO1, CO2…)</label><button type="button" onClick={() => updateDraft(idx, { outcomes: [...(d.outcomes || []), ''] })} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>+ Add Outcome</button></div>
                                      {(d.outcomes || []).length === 0 ? <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No outcomes — click Add.</span> : (d.outcomes || []).map((txt, oi) => (
                                        <div key={oi} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                          <span style={{ background: 'var(--primary)', color: '#fff', padding: '3px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, minWidth: '38px', textAlign: 'center' }}>{`CO${oi + 1}`}</span>
                                          <input value={txt} onChange={e => { const a = [...(d.outcomes || [])]; a[oi] = e.target.value; updateDraft(idx, { outcomes: a }); }} placeholder={`Outcome CO${oi + 1} text`} style={{ flex: 1, padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                          <button type="button" onClick={() => { const a = (d.outcomes || []).filter((_, j) => j !== oi); updateDraft(idx, { outcomes: a }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)' }}>Pedagogy — per item</label><button type="button" onClick={() => { const cur = String(d.pedagogy || ''); updateDraft(idx, { pedagogy: cur ? cur + '\n' : '' }); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>+ Add Pedagogy</button></div>
                                      {(() => { const lines = d.pedagogy ? String(d.pedagogy).split('\n') : []; if (lines.length === 0) return <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No pedagogy — click Add.</span>; return lines.map((txt, pi) => (
                                        <div key={pi} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', minWidth: '18px' }}>{pi + 1}.</span>
                                          <input value={txt} onChange={e => { const a = String(d.pedagogy || '').split('\n'); a[pi] = e.target.value; updateDraft(idx, { pedagogy: a.join('\n') }); }} placeholder={`Pedagogy ${pi + 1}`} style={{ flex: 1, padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                          <button type="button" onClick={() => { const a = String(d.pedagogy || '').split('\n').filter((_, j) => j !== pi); updateDraft(idx, { pedagogy: a.join('\n') }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                                        </div>
                                      )); })()}
                                    </div>
                                    {d.modules?.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <b style={{ fontSize: '12px', color: 'var(--primary-deep)' }}>Modules ({d.modules.length})</b>
                                        {d.modules.map((m, mi) => (
                                          <div key={mi} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg)' }}>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                              <span style={{ fontSize: '11px', fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '2px 7px', borderRadius: '99px' }}>{m.module_number}</span>
                                              <input value={m.title || ''} onChange={e => { const mods = [...d.modules]; mods[mi] = { ...mods[mi], title: e.target.value }; updateDraft(idx, { modules: mods }); }} placeholder="Module title" style={{ flex: '1 1 180px', padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                              <input type="number" value={m.hours ?? ''} onChange={e => { const mods = [...d.modules]; mods[mi] = { ...mods[mi], hours: e.target.value === '' ? null : Number(e.target.value) }; updateDraft(idx, { modules: mods }); }} placeholder="Hrs" style={{ width: '70px', padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                              <input value={m.rbt_level || ''} onChange={e => { const mods = [...d.modules]; mods[mi] = { ...mods[mi], rbt_level: e.target.value }; updateDraft(idx, { modules: mods }); }} placeholder="RBT" style={{ width: '90px', padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px' }} />
                                              <button type="button" onClick={() => { const mods = d.modules.filter((_, j) => j !== mi).map((x, j) => ({ ...x, module_number: j + 1 })); updateDraft(idx, { modules: mods }); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                                            </div>
                                            <textarea value={(m.topics || []).join('\n')} onChange={e => { const mods = [...d.modules]; mods[mi] = { ...mods[mi], topics: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }; updateDraft(idx, { modules: mods }); }} rows={2} placeholder="Topics — one per line" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '12.5px' }} />
                                          </div>
                                        ))}
                                        <button type="button" onClick={() => { const mods = [...(d.modules || []), { module_number: (d.modules?.length || 0) + 1, title: '', hours: null, rbt_level: '', methodology: '', co_mapping: '', topics: [] }]; updateDraft(idx, { modules: mods, _expanded: true }); }} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add module</button>
                                      </div>
                                    )}
                                    {(!d.modules || d.modules.length === 0) && (
                                      <button type="button" onClick={() => updateDraft(idx, { modules: [{ module_number: 1, title: '', hours: null, rbt_level: '', methodology: '', co_mapping: '', topics: [] }] })} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add module</button>
                                    )}
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
                                      <button type="button" onClick={() => { const p = d; if (p.courseName) setCourseName(p.courseName); if (p.code) setCourseCode(p.code); if (p.type) setCourseKind(p.type); if (p.credits != null) setCourseCredits(p.credits); if (p.teachingHours != null) setCourseHours(String(p.teachingHours)); else if (p.teachingPeriods != null) { const dd=dbData.curriculum.find(x=>x.id===(syllabusTargetDisc||courseDisc))||null; const mm2=(()=>{const v=Number(dd?.period_minutes); return Number.isFinite(v)&&v>=10&&v<=120?v:45;})(); setCourseHours(String(Math.round(Number(p.teachingPeriods)*mm2/60*100)/100)); } if (p.cieMarks != null) setCourseCie(p.cieMarks); if (p.seeMarks != null) setCourseSee(p.seeMarks); if (p.examinationType) setCourseExamType(p.examinationType); if (p._cieH!=null||p._cieM!=null){ setCourseCieH(p._cieH||''); setCourseCieM(p._cieM||''); } else if (p.examinationHoursCie){ const m=String(p.examinationHoursCie).match(/(\d+)\s*h/i), n=String(p.examinationHoursCie).match(/(\d+)\s*m/i); setCourseCieH(m?m[1]:''); setCourseCieM(n?n[1]:''); } if (p._seeH!=null||p._seeM!=null){ setCourseSeeH(p._seeH||''); setCourseSeeM(p._seeM||''); } else if (p.examinationHoursSee){ const m=String(p.examinationHoursSee).match(/(\d+)\s*h/i), n=String(p.examinationHoursSee).match(/(\d+)\s*m/i); setCourseSeeH(m?m[1]:''); setCourseSeeM(n?n[1]:''); } if (p.semester) setCourseSem(p.semester); if (p.yearLabel) setCourseYearLabel(p.yearLabel); if (p.objectives?.length) setCourseObjectives(p.objectives); if (p.outcomes?.length) setCourseOutcomes(p.outcomes.map((t, i) => ({ code: `CO${i + 1}`, text: t }))); if (p.pedagogy) { const lines=String(p.pedagogy).split('\n').map(s=>s.trim()).filter(Boolean); setCoursePedagogyList(lines); setCoursePedagogy(String(p.pedagogy)); } if(p.modules?.length) setSyllabusParsed(prev=>({...prev,_pendingModules:p.modules})); setShowAddCourse(true); alert('Filled into Add Course form — review and submit single.'); }} style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px' }}>Fill Add Course form ↓</button>
                                      <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '11.5px', color: d._verified ? 'var(--primary)' : 'var(--text-faint)', cursor: 'pointer', marginLeft: 'auto' }}><input type="checkbox" checked={!!d._verified} onChange={e => updateDraft(idx, { _verified: e.target.checked })} /> Mark verified</label>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Select Course — filtered list */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-deep)' }}>Select Course:</span>
                  <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">All Programs</option>
                    {dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">All Types</option>
                    <option value="DSC">DSC</option><option value="SEC">SEC</option><option value="DSE">DSE</option><option value="AECC">AECC</option><option value="GE">GE</option><option value="Core">Core</option>
                  </select>
                  <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">All Years</option>
                    {ROMAN.slice(0, 8).map(r => <option key={r} value={`Year ${r}`}>Year {r}</option>)}
                  </select>
                  <select value={filterSem} onChange={e => setFilterSem(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">All Semesters</option>
                    {Array.from({ length: 8 }, (_, i) => `Semester ${ROMAN[i]}`).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {(filterDisc || filterType || filterSem || filterYear) && <button onClick={() => { setFilterDisc(''); setFilterType(''); setFilterSem(''); setFilterYear(''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '99px', cursor: 'pointer', fontSize: '12px' }}>Clear</button>}
                  <span style={{ fontSize: '12px', color: 'var(--text-faint)', marginLeft: 'auto' }}>{(() => { const n = dbData.courses.filter(c => (!filterDisc || c.discipline_id === filterDisc) && (!filterType || (c.type||'') === filterType) && (!filterSem || c.semester === filterSem) && (!filterYear || c.year_label === filterYear)).length; return n === dbData.courses.length ? `${n} course${n===1?'':'s'}` : `${n} / ${dbData.courses.length} shown`; })()}</span>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflowX: 'auto', boxShadow: 'var(--shadow-sm)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', minWidth: '820px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Program</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Course</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Code</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Type</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Year</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Semester</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Credits</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Hours</th><th style={{ padding: '12px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--primary-deep)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filtered = dbData.courses.filter(c => (!filterDisc || c.discipline_id === filterDisc) && (!filterType || (c.type||'') === filterType) && (!filterSem || c.semester === filterSem) && (!filterYear || c.year_label === filterYear));
                        if (filtered.length === 0) return <tr><td colSpan="9" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>{dbData.courses.length === 0 ? 'No courses yet — use Add Course above.' : 'No courses match filters.'}</td></tr>;
                        return filtered.map(c => {
                          const prog = dbData.curriculum.find(d => d.id === c.discipline_id);
                          const isEditing = editingCourse === c.id;
                          if (isEditing) {
                            return (
                              <>
                              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                                <td style={{ padding: '6px' }}><select value={editCourse.discipline_id || ''} onChange={e => setEditCourse({ ...editCourse, discipline_id: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%', fontSize: '12px' }}>{dbData.curriculum.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                                <td style={{ padding: '6px' }}><input value={editCourse.name || ''} onChange={e => setEditCourse({ ...editCourse, name: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '140px', fontSize: '12px' }} placeholder="Name" /></td>
                                <td style={{ padding: '6px' }}><input value={editCourse.code || ''} onChange={e => setEditCourse({ ...editCourse, code: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '12px' }} placeholder="Code" /></td>
                                <td style={{ padding: '6px' }}><select value={editCourse.type || 'DSC'} onChange={e => setEditCourse({ ...editCourse, type: e.target.value })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '90px' }}><option value="DSC">DSC</option><option value="SEC">SEC</option><option value="DSE">DSE</option><option value="AECC">AECC</option><option value="GE">GE</option><option value="Core">Core</option></select></td>
                                <td style={{ padding: '6px' }}><select value={editCourse.year_label || ''} onChange={e => setEditCourse({ ...editCourse, year_label: e.target.value || null, year_number: e.target.value ? ROMAN.indexOf(e.target.value.replace('Year ', '')) + 1 : null })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '90px' }}><option value="">—</option>{ROMAN.slice(0, 8).map(r => <option key={r} value={`Year ${r}`}>Year {r}</option>)}</select></td>
                                <td style={{ padding: '6px' }}><select value={editCourse.semester || ''} onChange={e => { const v=e.target.value||null; const dDisc=dbData.curriculum.find(x=>x.id===(editCourse.discipline_id||'')); const per=Number(dDisc?.semesters_per_year)||2; const all=Array.from({length:per*10},(_,i)=>`Semester ${ROMAN[i]}`); const idx=all.indexOf(v); let patch={semester:v}; if(idx>=0){ const yIdx=Math.floor(idx/per); patch.year_label=`Year ${ROMAN[yIdx]||'I'}`; patch.year_number=yIdx+1; } setEditCourse({ ...editCourse, ...patch }); }} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', width: '110px' }}><option value="">—</option>{Array.from({ length: 8 }, (_, i) => `Semester ${ROMAN[i]}`).map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                                <td style={{ padding: '6px' }}><input type="number" value={editCourse.credits ?? ''} onChange={e => setEditCourse({ ...editCourse, credits: e.target.value === '' ? '' : Number(e.target.value) })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '56px', fontSize: '12px' }} /></td>
                                <td style={{ padding: '6px' }}><input type="number" value={editCourse.teaching_hours ?? ''} onChange={e => setEditCourse({ ...editCourse, teaching_hours: e.target.value === '' ? '' : Number(e.target.value) })} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '56px', fontSize: '12px' }} placeholder="Hrs" /></td>
                                <td style={{ padding: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <button onClick={() => handleUpdateCourse(c.id, { code: editCourse.code, name: editCourse.name, discipline_id: editCourse.discipline_id, type: editCourse.type, semester: editCourse.semester || null, year_label: editCourse.year_label || null, year_number: editCourse.year_number || null, credits: editCourse.credits === '' ? null : Number(editCourse.credits), teaching_hours: editCourse.teaching_hours === '' ? null : Number(editCourse.teaching_hours) })} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                                  <button onClick={() => { setEditingCourse(null); setEditObjectives([]); setEditOutcomes([]); setEditPedagogyList([]); setEditPedagogy(''); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                                </td>
                              </tr>
                              <tr key={`${c.id}-edit-extra`} style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={9} style={{ padding: '14px 12px' }}>
                                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><b style={{ fontSize:'12.5px', color:'var(--primary-deep)' }}>Objectives</b><button type="button" onClick={()=>setEditObjectives([...editObjectives,''])} style={{ background:'var(--accent)', color:'#fff', border:'none', padding:'4px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'11.5px' }}>+ Add Objective</button></div>
                                      {editObjectives.length===0 ? <span style={{ fontSize:'12px', color:'var(--text-faint)' }}>No objectives — click Add.</span> : editObjectives.map((txt,j)=>(<div key={j} style={{ display:'flex', gap:'6px', alignItems:'center' }}><span style={{ minWidth:'18px', fontSize:'11px', fontWeight:700, color:'var(--primary)' }}>{j+1}.</span><input value={txt} onChange={e=>{ const a=[...editObjectives]; a[j]=e.target.value; setEditObjectives(a); }} placeholder={`Objective ${j+1}`} style={{ flex:1, padding:'7px', border:'1px solid var(--border)', borderRadius:'4px', fontSize:'13px' }} /><button type="button" onClick={()=>setEditObjectives(editObjectives.filter((_,k)=>k!==j))} style={{ background:'none', border:'1px solid var(--border)', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>Remove</button></div>))}
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><b style={{ fontSize:'12.5px', color:'var(--primary-deep)' }}>Outcomes (CO)</b><button type="button" onClick={()=>{ const n=editOutcomes.length+1; setEditOutcomes([...editOutcomes,{code:`CO${n}`,text:''}]); }} style={{ background:'var(--accent)', color:'#fff', border:'none', padding:'4px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'11.5px' }}>+ Add Outcome</button></div>
                                      {editOutcomes.length===0 ? <span style={{ fontSize:'12px', color:'var(--text-faint)' }}>No outcomes — click Add.</span> : editOutcomes.map((o,oi)=>(<div key={oi} style={{ display:'flex', gap:'6px', alignItems:'center' }}><span style={{ background:'var(--primary)', color:'#fff', padding:'3px 8px', borderRadius:'99px', fontSize:'11px', fontWeight:700, minWidth:'38px', textAlign:'center' }}>{o.code}</span><input value={o.text} onChange={e=>{ const a=[...editOutcomes]; a[oi]={...a[oi],text:e.target.value}; setEditOutcomes(a); }} placeholder={`Outcome ${o.code}`} style={{ flex:1, padding:'7px', border:'1px solid var(--border)', borderRadius:'4px', fontSize:'13px' }} /><button type="button" onClick={()=>setEditOutcomes(editOutcomes.filter((_,k)=>k!==oi).map((x,i)=>({...x,code:`CO${i+1}`})))} style={{ background:'none', border:'1px solid var(--border)', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>Remove</button></div>))}
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><b style={{ fontSize:'12.5px', color:'var(--primary-deep)' }}>Pedagogy</b><button type="button" onClick={()=>setEditPedagogyList([...editPedagogyList,''])} style={{ background:'var(--accent)', color:'#fff', border:'none', padding:'4px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'11.5px' }}>+ Add Pedagogy</button></div>
                                      {editPedagogyList.length===0 && !editPedagogy ? <span style={{ fontSize:'12px', color:'var(--text-faint)' }}>No pedagogy — click Add.</span> : null}
                                      {editPedagogyList.map((txt,j)=>(<div key={j} style={{ display:'flex', gap:'6px', alignItems:'center' }}><span style={{ minWidth:'18px', fontSize:'11px', fontWeight:700, color:'var(--primary)' }}>{j+1}.</span><input value={txt} onChange={e=>{ const a=[...editPedagogyList]; a[j]=e.target.value; setEditPedagogyList(a); }} placeholder={`Pedagogy ${j+1}`} style={{ flex:1, padding:'7px', border:'1px solid var(--border)', borderRadius:'4px', fontSize:'13px' }} /><button type="button" onClick={()=>setEditPedagogyList(editPedagogyList.filter((_,k)=>k!==j))} style={{ background:'none', border:'1px solid var(--border)', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'11px' }}>Remove</button></div>))}
                                      {editPedagogyList.length===0 && editPedagogy ? <textarea value={editPedagogy} onChange={e=>setEditPedagogy(e.target.value)} rows={2} placeholder="Pedagogy (fallback)" style={{ padding:'8px', border:'1px solid var(--border)', borderRadius:'4px', fontFamily:'inherit', fontSize:'13px' }} /> : null}
                                      <div style={{ fontSize:'11px', color:'var(--text-faint)' }}>Pedagogy items feed the Add Syllabus Teaching methodology dropdown (filtered).</div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              </>
                            );
                          }
                          return (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 8px', color: 'var(--text-soft)', fontSize: '12.5px' }}>{prog?.name || '—'}</td>
                            <td style={{ padding: '10px 8px' }}><span style={{ color:'var(--primary)', textDecoration:'underline', fontWeight:600 }}>{c.name}</span></td>
                            <td style={{ padding: '10px 8px' }}><button onClick={() => setActiveSyllabusCourse(c)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}><b style={{ color:'var(--primary)', textDecoration:'underline' }}>{c.code}</b></button></td>
                            <td style={{ padding: '10px 8px' }}>{c.type || '—'}</td>
                            <td style={{ padding: '10px 8px' }}>{c.year_label || '—'}</td>
                            <td style={{ padding: '10px 8px' }}>{c.semester || '—'}</td>
                            <td style={{ padding: '10px 8px' }}>{c.credits ?? '—'}</td>
                            <td style={{ padding: '10px 8px', fontSize: '12.5px', color: 'var(--text-soft)' }}>{c.teaching_hours != null ? `${c.teaching_hours}${c.teaching_periods ? ` / ${c.teaching_periods}` : ''}` : '—'}</td>
                            <td style={{ padding: '10px 8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {perm('curriculum') && <button onClick={() => setViewCourse(c)} style={{ background: 'none', border: '1px solid var(--primary)', color:'var(--primary)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight:600, display:'inline-flex', alignItems:'center', gap:'4px' }} title="View course & syllabus"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg> View</button>}
                              {canAdmin('curriculum') && <button onClick={() => hydrateEditCourse(c)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight:600 }}>Edit</button>}
                              {isFull('curriculum') && <button onClick={() => handleDelete('courses', c.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight:600 }}>Delete</button>}
                              <button onClick={() => { setActiveSyllabusCourse(c); setShowAddSyllabus(true); setSyllModAcademicYear(academicYearFor()); setTimeout(()=>document.getElementById('add-syllabus-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),120); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '12px', fontWeight:700, boxShadow:'var(--shadow-sm)' }}>Syllabus</button>
                            </td>
                          </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* View (eye) — readOnly course + syllabus (no edit controls) */}
                {viewCourse && (() => {
                  const vProg = dbData.curriculum.find(d=>d.id===viewCourse.discipline_id)?.name||'—';
                  const vObjs = (()=>{ try{const j=viewCourse.objectives_json; if(Array.isArray(j)) return j; if(typeof j==='string') return JSON.parse(j);}catch{} return []; })();
                  const vOuts = (()=>{ try{const j=viewCourse.outcomes_json; if(Array.isArray(j)) return j.map(o=>typeof o==='string'?o:(o.text||'')); if(typeof j==='string'){const a=JSON.parse(j); return a.map(o=>typeof o==='string'?o:(o.text||''));}}catch{} return []; })();
                  const vPed = String(viewCourse.pedagogy||'').split('\n').map(s=>s.trim()).filter(Boolean);
                  const vMods = (dbData.course_modules||[]).filter(m=>m.course_id===viewCourse.id).sort((a,b)=>(a.module_number||0)-(b.module_number||0));
                  return (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-xl)', marginTop:'24px', overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-saffron)' }}>
                        <h3 style={{ fontSize:'18px', color:'var(--primary-deep)', margin:0 }}>{viewCourse.code} — {viewCourse.name} <span style={{ fontSize:'11px', background:'var(--primary)', color:'#fff', padding:'2px 8px', borderRadius:'99px' }}>View</span></h3>
                        <button onClick={()=>setViewCourse(null)} style={{ background:'none', border:'1px solid var(--border)', color:'var(--text-faint)', padding:'6px 12px', borderRadius:'6px', cursor:'pointer' }}>✕ Close</button>
                      </div>
                      <div style={{ padding:'16px 20px' }}>
                        <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', fontSize:'13.5px' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Program</div><div style={{ padding:'9px 12px', gridColumn:'span 3', fontWeight:600, color:'var(--primary-deep)' }}>{vProg}</div></div>
                          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Course</div><div style={{ padding:'9px 12px', borderRight:'1px solid var(--border)' }}>{viewCourse.name}</div><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Type</div><div style={{ padding:'9px 12px' }}>{viewCourse.type||'—'}</div></div>
                          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Code</div><div style={{ padding:'9px 12px', borderRight:'1px solid var(--border)', fontWeight:600 }}>{viewCourse.code}</div><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Semester</div><div style={{ padding:'9px 12px' }}>{viewCourse.semester||'—'}{viewCourse.year_label?` · ${viewCourse.year_label}`:''}</div></div>
                          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)', fontSize:'12.5px' }}>Teaching Hours / Periods</div><div style={{ padding:'9px 12px', borderRight:'1px solid var(--border)' }}>{viewCourse.teaching_hours??'—'}{viewCourse.teaching_periods?` / ${viewCourse.teaching_periods}`:''}</div><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>CIE Marks</div><div style={{ padding:'9px 12px' }}>{viewCourse.cie_marks??50}</div></div>
                          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Credits</div><div style={{ padding:'9px 12px', borderRight:'1px solid var(--border)' }}>{viewCourse.credits??'—'}</div><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>SEE Marks</div><div style={{ padding:'9px 12px' }}>{viewCourse.see_marks??50}</div></div>
                          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px,160px) 1fr minmax(110px,140px) 110px' }}><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)', fontSize:'12.5px' }}>Examination Type</div><div style={{ padding:'9px 12px', borderRight:'1px solid var(--border)' }}>{viewCourse.examination_type||'—'}</div><div style={{ padding:'9px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)', fontSize:'12px' }}>Examination Hours<br/><span style={{ fontWeight:400, fontSize:'11px', color:'var(--text-soft)' }}>CIE / SEE</span></div><div style={{ padding:'9px 12px', fontSize:'12.5px' }}>{viewCourse.examination_hours_cie?`CIE: ${viewCourse.examination_hours_cie}`:'—'}{viewCourse.examination_hours_see?` · SEE: ${viewCourse.examination_hours_see}`:''}</div></div>
                        </div>
                      </div>
                      <div style={{ padding:'0 20px 20px', display:'grid', gap:'14px' }}>
                        {vObjs.length? <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}><div style={{ padding:'8px 14px', background:'var(--surface-muted)', fontWeight:700, fontSize:'13px', borderBottom:'1px solid var(--border)', color:'var(--primary-deep)' }}>OBJECTIVES:</div><ol style={{ margin:0, padding:'12px 12px 12px 28px', color:'var(--text-soft)', fontSize:'13.5px', lineHeight:1.6 }}>{vObjs.map((o,i)=><li key={i} style={{ marginBottom:'6px' }}>{typeof o==='string'?o:(o.text||JSON.stringify(o))}</li>)}</ol></div> : <div style={{ padding:'14px', border:'1px dashed var(--border)', borderRadius:'8px', color:'var(--text-faint)', textAlign:'center', fontSize:'13px' }}>No objectives.</div>}
                        {vOuts.length? <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}><div style={{ padding:'8px 14px', background:'var(--surface-muted)', fontWeight:700, fontSize:'13px', borderBottom:'1px solid var(--border)', color:'var(--primary-deep)' }}>OUTCOMES:</div><ol style={{ margin:0, padding:'12px 12px 12px 28px', color:'var(--text-soft)', fontSize:'13.5px', lineHeight:1.6 }}>{vOuts.map((o,i)=><li key={i} style={{ marginBottom:'6px' }}>{o}</li>)}</ol></div> : null}
                        {vPed.length? <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}><div style={{ padding:'8px 14px', background:'var(--surface-muted)', fontWeight:700, fontSize:'13px', borderBottom:'1px solid var(--border)', color:'var(--primary-deep)' }}>Pedagogy:</div><ol style={{ margin:0, padding:'12px 12px 12px 28px', color:'var(--text-soft)', fontSize:'13.5px', lineHeight:1.6 }}>{vPed.map((p,i)=><li key={i}>{p}</li>)}</ol></div> : null}
                        {vMods.length? vMods.map(mod=>{ const topics=(dbData.course_module_topics||[]).filter(t=>t.module_id===mod.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)); return (<div key={mod.id} style={{ border:'1.5px solid var(--primary)', borderRadius:'12px', overflow:'hidden' }}><div style={{ padding:'9px 14px', background:'var(--primary)', color:'#fff', fontWeight:700, fontSize:'13.5px' }}>Module {mod.module_number} — {mod.title}</div><div style={{ display:'grid', gridTemplateColumns:'110px 1fr 110px 120px', fontSize:'13px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'8px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Hours:</div><div style={{ padding:'8px 12px', borderRight:'1px solid var(--border)' }}>{mod.hours??'—'}</div><div style={{ padding:'8px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>RBT Level:</div><div style={{ padding:'8px 12px' }}>{mod.rbt_level||'—'}</div></div>{mod.methodology && <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', fontSize:'13px', borderBottom:'1px solid var(--border)' }}><div style={{ padding:'8px 12px', background:'var(--bg)', fontWeight:600, borderRight:'1px solid var(--border)' }}>Teaching Methodology</div><div style={{ padding:'8px 12px', color:'var(--text-soft)', whiteSpace:'pre-wrap' }}>{mod.methodology}</div></div>}{topics.length? <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}><ol style={{ margin:0, paddingLeft:'20px', color:'var(--text)', fontSize:'13.5px', lineHeight:1.6 }}>{topics.map(t=><li key={t.id}>{t.topic}</li>)}</ol></div> : null}<div style={{ padding:'8px 14px', background:'var(--bg-saffron)', fontSize:'12.5px' }}><b>CO Mapping:</b> <span style={{ color:'var(--text-soft)' }}>{mod.co_mapping||'—'}</span></div></div>); }) : <div style={{ padding:'14px', border:'1px dashed var(--border)', borderRadius:'8px', color:'var(--text-faint)', textAlign:'center', fontSize:'13px' }}>No modules yet.</div>}
                      </div>
                    </div>
                  );
                })()}
                {/* SYLLABUS DETAIL — structured exactly like the BPA document (BCVP310) */}
                {activeSyllabusCourse && (() => {
                  const progName = dbData.curriculum.find(d => d.id === activeSyllabusCourse.discipline_id)?.name || '—';
                  const semLabel = activeSyllabusCourse.semester ? activeSyllabusCourse.semester.replace('Semester ', '') : '—';
                  const yearLabel = activeSyllabusCourse.year_label || null;
                  return (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', marginTop: '24px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-saffron)' }}>
                      <h3 style={{ fontSize: '18px', color: 'var(--primary-deep)', margin: 0 }}>{activeSyllabusCourse.code} — {activeSyllabusCourse.name}</h3>
                      <button onClick={() => setActiveSyllabusCourse(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-faint)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>← Back to Courses</button>
                    </div>

                    {/* Header table — mirrors the image header */}
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', fontSize: '13.5px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Program Name</div>
                          <div style={{ padding: '9px 12px', gridColumn: 'span 3', fontWeight: 600, color: 'var(--primary-deep)' }}>{progName}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Course Name</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.name}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Type</div>
                          <div style={{ padding: '9px 12px' }}>{activeSyllabusCourse.type || '—'}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Code</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)', fontWeight: 600 }}>{activeSyllabusCourse.code}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Semester</div>
                          <div style={{ padding: '9px 12px' }}>{semLabel}{yearLabel ? ` · ${yearLabel}` : ''}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)', fontSize: '12.5px' }}>Teaching Hours / Periods</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.teaching_hours ?? '—'}{activeSyllabusCourse.teaching_periods ? ` / ${activeSyllabusCourse.teaching_periods}` : ''}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>CIE Marks</div>
                          <div style={{ padding: '9px 12px' }}>{activeSyllabusCourse.cie_marks ?? 50}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,160px) 1fr minmax(110px,140px) 110px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>Credits</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.credits ?? '—'}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>SEE Marks</div>
                          <div style={{ padding: '9px 12px' }}>{activeSyllabusCourse.see_marks ?? 50}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,160px) 1fr minmax(110px,140px) 110px' }}>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)', fontSize: '12.5px' }}>Examination Type</div>
                          <div style={{ padding: '9px 12px', borderRight: '1px solid var(--border)' }}>{activeSyllabusCourse.examination_type || '—'}</div>
                          <div style={{ padding: '9px 12px', background: 'var(--bg)', fontWeight: 600, borderRight: '1px solid var(--border)', fontSize: '12px', lineHeight: 1.3 }}>Examination Hours<br /><span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-soft)' }}>CIE / SEE</span></div>
                          <div style={{ padding: '9px 12px', fontSize: '12.5px' }}>{activeSyllabusCourse.examination_hours_cie ? `CIE: ${activeSyllabusCourse.examination_hours_cie}` : '—'}{activeSyllabusCourse.examination_hours_see ? ` · SEE: ${activeSyllabusCourse.examination_hours_see}` : ''}</div>
                        </div>
                      </div>
                    </div>

                    {/* Syllabus body — Objectives / Outcomes / Pedagogy / Modules */}
                    <div style={{ padding: '0 20px 20px', display: 'grid', gap: '14px' }}>
                      {!syllabusContent ? (() => {
                        const fbObjs = (()=>{ try{const j=activeSyllabusCourse.objectives_json; if(Array.isArray(j)) return j.filter(Boolean).map(o=>typeof o==='string'?o:(o.text||String(o))); if(typeof j==='string'){const a=JSON.parse(j); return (Array.isArray(a)?a:[]).filter(Boolean).map(o=>typeof o==='string'?o:(o.text||String(o)));} }catch{} return []; })();
                        const fbOuts = (()=>{ try{const j=activeSyllabusCourse.outcomes_json; if(Array.isArray(j)) return j.filter(Boolean).map(o=>typeof o==='string'?o:(o.text||'')); if(typeof j==='string'){const a=JSON.parse(j); return (Array.isArray(a)?a:[]).filter(Boolean).map(o=>typeof o==='string'?o:(o.text||''));} }catch{} return []; })();
                        const fbPed = String(activeSyllabusCourse.pedagogy||'').split('\n').map(s=>s.trim()).filter(Boolean);
                        const hasFb = fbObjs.length || fbOuts.length || fbPed.length;
                        if (!hasFb) return <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '28px', border: '1px dashed var(--border)', borderRadius: '8px' }}>No detailed syllabus yet. Click <b>Add Syllabus</b> below to create it from the document.</div>;
                        return (<>
                          <div style={{ background: 'var(--primary-deep)', color: '#fff', textAlign: 'center', padding: '9px', borderRadius: '6px', fontSize: '13px', letterSpacing: '0.06em', fontWeight: 700 }}>COURSE OBJECTIVES AND OUTCOMES</div>
                          {fbObjs.length ? <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}><div style={{ padding: '8px 14px', background: 'var(--surface-muted)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color:'var(--primary-deep)' }}>OBJECTIVES:</div><ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>{fbObjs.map((o,i)=><li key={i} style={{ marginBottom:'6px' }}>{o}</li>)}</ol></div> : null}
                          {fbOuts.length ? <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}><div style={{ padding: '8px 14px', background: 'var(--surface-muted)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color:'var(--primary-deep)' }}>OUTCOMES: <span style={{ fontWeight:400, color:'var(--text-soft)' }}>At the end of the course, the student will be able to:</span></div><ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>{fbOuts.map((o,i)=><li key={i} style={{ marginBottom:'6px' }}>{o}</li>)}</ol></div> : null}
                          {fbPed.length ? <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}><div style={{ padding: '8px 14px', background: 'var(--surface-muted)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color:'var(--primary-deep)' }}>Pedagogy:</div><ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>{fbPed.map((p,i)=><li key={i}>{p}</li>)}</ol></div> : null}
                        </>);
                      })() : (
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
                              <div style={{ padding: '8px 14px', background: 'var(--surface-muted)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color:'var(--primary-deep)' }}>OUTCOMES: <span style={{ fontWeight: 400, color: 'var(--text-soft)' }}>At the end of the course, the student will be able to:</span></div>
                              <ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>
                                {syllabusContent.outcomes.map((o, i) => <li key={i} style={{ marginBottom: '6px' }}>{o}</li>)}
                              </ol>
                            </div>
                          )}
                          {syllabusContent.pedagogy?.length > 0 && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '8px 14px', background: 'var(--surface-muted)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color:'var(--primary-deep)' }}>Pedagogy:</div>
                              <ol style={{ margin: 0, padding: '12px 12px 12px 28px', color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>
                                {syllabusContent.pedagogy.map((p, i) => <li key={i}>{p}</li>)}
                              </ol>
                            </div>
                          )}

                          {syllabusContent.modules?.length > 0 ? syllabusContent.modules.map((mod, mi) => (
                            <div key={mi} style={{ border: '1.5px solid var(--primary)', borderRadius: '12px', overflow: 'hidden' }}>
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
                              <div style={{ padding: '8px 14px', background: 'var(--surface-muted)', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color:'var(--primary-deep)' }}>Assessment Plan</div>
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
                              <div key={mod.id} style={{ border: '1.5px solid var(--primary)', borderRadius: '12px', overflow: 'hidden' }}>
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
                            <div id="add-syllabus-panel" style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--primary)', borderRadius: '12px', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: showAddSyllabus ? 'var(--primary)' : 'var(--bg-saffron)', color: showAddSyllabus ? '#fff' : 'var(--primary-deep)', cursor: 'pointer' }} onClick={() => setShowAddSyllabus(!showAddSyllabus)}>
                                <b style={{ fontSize: '14px' }}>{showAddSyllabus ? '▾ Add Syllabus — Adding Modules' : '▸ Add Syllabus'}</b>
                                <span style={{ fontSize: '11px', opacity: 0.85 }}>{showAddSyllabus ? 'Collapse' : 'Click to add modules'}</span>
                              </div>
                              {showAddSyllabus && (
                                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#fff' }}>
                                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '140px', flexShrink: 0 }}>Academic Year</label>
                                    <input value={syllModAcademicYear} onChange={e => setSyllModAcademicYear(e.target.value)} placeholder={academicYearFor()} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '130px', fontSize: '13px' }} />
                                    {(() => { const v=(dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id&&s.academic_year===syllModAcademicYear).reduce((m,s)=>Math.max(m,Number(s.version_number)||0),0)+1; return <span style={{ background:'var(--primary)', color:'#fff', padding:'3px 9px', borderRadius:'99px', fontSize:'11px', fontWeight:700 }}>V{v}</span>; })()}
                                    <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Version auto-increments per course per year</span>
                                    {role==='super_admin' && (()=>{ const ms=(dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id&&s.academic_year===syllModAcademicYear).reduce((m,s)=>Math.max(m,Number(s.version_number)||0),0); return ms>0 ? <button type="button" onClick={async()=>{ if(!confirm(`Reset versions for ${syllModAcademicYear}? Current max V${ms}. This will delete all V${ms} syllabi for this course/year (Super Admin only).`)) return; const toDel=(dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id&&s.academic_year===syllModAcademicYear&&Number(s.version_number)===ms); for(const s of toDel){ await apiCall(`${apiUrl}/api/course_syllabi/${s.id}`,{method:'DELETE'}); } alert(`Deleted V${ms} for ${syllModAcademicYear}. Next save will be V${ms} (reuse) or V${ms+1} if kept.`); fetchData(); }} style={{ background:'none', border:'1px solid var(--primary)', color:'var(--primary)', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'11px' }}>Reset version</button> : null; })()}
                                  </div>
                                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <b style={{ fontSize: '13px', color: 'var(--primary-deep)' }}>Add Module</b>
                                      <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>All fields have side headings — every input labeled</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '150px', flexShrink: 0 }}>Module Name</label>
                                      <input placeholder="Module Name *" value={modTitle} onChange={e => setModTitle(e.target.value)} style={{ flex: '1 1 220px', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '150px', flexShrink: 0 }}>Teaching Hours</label>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                                        <input type="number" min="0" step="0.5" value={modHours} onChange={e => { setModHours(e.target.value); if (e.target.value !== '' && e.target.value != null) { const v = Number(e.target.value); const mins = (()=>{ const d=dbData.curriculum.find(x=>x.id===activeSyllabusCourse.discipline_id); const m=Number(d?.period_minutes); return Number.isFinite(m)&&m>=10&&m<=120?m:45; })(); if (Number.isFinite(v)) setModPeriods(String(Math.round(v*60/mins))); }} } placeholder="Hours" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '100px', fontSize: '13px' }} />
                                        <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>→</span>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: 'var(--text-soft)' }}>Periods (auto)
                                          <input type="text" value={modPeriods} readOnly placeholder="auto" style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', width: '90px', background: 'var(--bg)', color: 'var(--text-faint)', fontSize: '13px' }} title="Auto: hours × 60 / period mins — not editable" />
                                        </label>
                                        <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                                          {(() => { const d=dbData.curriculum.find(x=>x.id===activeSyllabusCourse.discipline_id); const m=Number(d?.period_minutes); const mins=Number.isFinite(m)&&m>=10&&m<=120?m:45; return `period = ${mins} min (from Program)`; })()}
                                        </span>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '150px', flexShrink: 0, paddingTop: '7px' }}>Add RBT Levels</label>
                                      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                          <select value={modRbtDraft} onChange={e => setModRbtDraft(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', flex: '1 1 160px' }}>
                                            {RBT_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                                          </select>
                                          <button type="button" onClick={() => { if (!modRbtList.includes(modRbtDraft)) setModRbtList([...modRbtList, modRbtDraft].sort((a,b)=>{ const o={L1:1,L2:2,L3:3,L4:4,L5:5,L6:6}; return (o[a]||9)-(o[b]||9); })); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ Add RBT Level</button>
                                        </div>
                                        {modRbtList.length ? (
                                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {modRbtList.map(lv => {
                                              const lab = RBT_OPTS.find(o=>o.v===lv)?.label || lv;
                                              return <span key={lv} style={{ background: 'var(--primary)', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>{lab} <button type="button" onClick={() => setModRbtList(modRbtList.filter(x=>x!==lv))} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: '99px', cursor: 'pointer', padding: '1px 6px', fontSize: '11px' }}>×</button></span>;
                                            })}
                                          </div>
                                        ) : <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>No RBT levels yet — add one or more.</span>}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '150px', flexShrink: 0, paddingTop: '7px' }}>Add Teaching Methodology</label>
                                      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                          <select value={modMethodDraft} onChange={e => setModMethodDraft(e.target.value)} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', flex: '1 1 200px' }}>
                                            <option value="">Select methodology…</option>
                                            {pedagogyOptions.map((p, i) => <option key={i} value={p}>{p}</option>)}
                                          </select>
                                          <button type="button" onClick={() => { const v = modMethodDraft.trim(); if (v && !modMethodList.includes(v)) { setModMethodList([...modMethodList, v]); setModMethodDraft(''); } }} disabled={!modMethodDraft} style={{ background: pedagogyOptions.length ? 'var(--accent)' : 'var(--text-faint)', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: pedagogyOptions.length ? 'pointer' : 'not-allowed', fontSize: '12px', opacity: modMethodDraft ? 1 : 0.6 }}>+ Add Methodology</button>
                                        </div>
                                        {pedagogyOptions.length === 0 ? <span style={{ fontSize: '11.5px', color: 'var(--primary)', background: 'var(--bg-saffron)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>No pedagogy in this course yet — add pedagogy to the course first (in course form above). Methodology list is filtered from course pedagogy only.</span> : null}
                                        {modMethodList.length ? (
                                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {modMethodList.map(m => <span key={m} style={{ background: 'var(--primary-deep)', color: '#fff', padding: '4px 10px', borderRadius: '99px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>{m} <button type="button" onClick={() => setModMethodList(modMethodList.filter(x=>x!==m))} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: '99px', cursor: 'pointer', padding: '1px 6px', fontSize: '11px' }}>×</button></span>)}
                                          </div>
                                        ) : pedagogyOptions.length ? <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>No methodology selected — add from dropdown (only pedagogy options).</span> : null}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '150px', flexShrink: 0, paddingTop: '7px' }}>Topics</label>
                                      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {modTopics.length === 0 ? <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>No topics yet — click Add Topic below (each topic has optional description).</span> : <>{modTopics.map((t, i) => (
                                          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', minWidth: '22px', paddingTop: '8px' }}>{i + 1}.</span>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                              <label style={{ fontSize: '11px', color: 'var(--text-soft)', fontWeight: 600 }}>Topic
                                                <input value={t.topic} onChange={e => { const c=[...modTopics]; c[i]={...c[i], topic:e.target.value}; setModTopics(c); }} placeholder="Topic name" style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', marginTop: '3px' }} />
                                              </label>
                                              <label style={{ fontSize: '11px', color: 'var(--text-soft)', fontWeight: 600 }}>Description (optional)
                                                <input value={t.description} onChange={e => { const c=[...modTopics]; c[i]={...c[i], description:e.target.value}; setModTopics(c); }} placeholder="Brief description for this topic" style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', marginTop: '3px' }} />
                                              </label>
                                            </div>
                                            <button type="button" onClick={() => setModTopics(modTopics.filter((_, j)=>j!==i))} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', alignSelf: 'flex-start' }}>Remove</button>
                                          </div>
                                        ))}</>}
                                        <button type="button" onClick={() => setModTopics([...modTopics, { topic: '', description: '' }])} style={{ alignSelf: 'flex-start', background: 'none', border: '1.5px dashed var(--primary)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>+ Add Topic</button>
                                        {modTopics.length===0 && modTopicsText ? (
                                          <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Bulk topics (fallback — one per line)
                                            <textarea value={modTopicsText} onChange={e=>setModTopicsText(e.target.value)} rows={2} placeholder="One topic per line (fallback) — or use Add Topic above" style={{ width: '100%', padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '13px', marginTop: '3px' }} />
                                          </label>
                                        ) : null}
                                      </div>
                                    </div>
                                    {coList.length > 0 && (
                                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-soft)', width: '150px', flexShrink: 0, paddingTop: '6px' }}>CO Mapping</label>
                                        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {coList.map(o => (
                                              <label key={o.code} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', background: modCo.includes(o.code) ? 'var(--primary)' : 'var(--surface)', color: modCo.includes(o.code) ? '#fff' : 'var(--text)', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={modCo.includes(o.code)} onChange={e => {
                                                  const next = e.target.checked ? [...modCo, o.code] : modCo.filter(c=>c!==o.code);
                                                  setModCo(next);
                                                  setModCoDetail(next.map(c=>{ const h=coList.find(x=>x.code===c); return h?`${h.code}: ${h.text}`:c; }).join('\n'));
                                                }} style={{ accentColor: 'var(--primary)' }} />{o.code}
                                              </label>
                                            ))}
                                          </div>
                                          <textarea value={modCoDetail} readOnly placeholder="Select a CO to see its details here (non-editable) — shows outcome text for mapped COs." style={{ width: '100%', minHeight: '56px', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '12.5px', background: 'var(--bg)', color: 'var(--text-soft)' }} />
                                          {modCo.length ? <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Mapped: {modCo.join(', ')}</div> : null}
                                        </div>
                                      </div>
                                    )}
                                    {pendingSyllMods.length > 0 && (
                                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                        <div style={{ padding: '7px 10px', background: 'var(--bg)', fontWeight: 700, fontSize: '12px', borderBottom: '1px solid var(--border)' }}>Queued modules — {pendingSyllMods.length} (single version V{(() => { const v=(dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id&&s.academic_year===syllModAcademicYear).reduce((m,s)=>Math.max(m,Number(s.version_number)||0),0)+1; return v; })()} · {syllModAcademicYear})</div>
                                        {pendingSyllMods.map((q, qi) => (
                                          <div key={qi} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderBottom: qi===pendingSyllMods.length-1?'none':'1px solid var(--border)', fontSize: '12.5px' }}>
                                            <span><b>{qi+1}.</b> {q.title} <span style={{ color:'var(--text-faint)' }}>{q.hours!=null?`· ${q.hours} hrs`:''}{q.topicsArr?.length?` · ${q.topicsArr.length} topic${q.topicsArr.length===1?'':'s'}`:''}</span></span>
                                            <button type="button" onClick={()=>setPendingSyllMods(prev=>prev.filter((_,j)=>j!==qi))} style={{ background:'none', border:'1px solid var(--border)', padding:'3px 8px', borderRadius:'6px', cursor:'pointer', fontSize:'11px' }}>Remove</button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                      <button type="button" onClick={handleQueueModule} style={{ background: 'none', border: '1.5px solid var(--primary)', color: 'var(--primary)', padding: '9px 18px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Module</button>
                                      <button type="button" onClick={handleSaveSyllabusBatch} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 'var(--radius-xl-sm)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, boxShadow:'var(--shadow-sm)' }}>{(() => { const cur=modTitle.trim()?1:0; const n=pendingSyllMods.length+cur; return n?`Save Syllabus — ${n} module${n===1?'':'s'} (V${(dbData.course_syllabi||[]).filter(s=>s.course_id===activeSyllabusCourse.id&&s.academic_year===syllModAcademicYear).reduce((m,s)=>Math.max(m,Number(s.version_number)||0),0)+1})`:'Save Syllabus'; })()}</button>
                                      <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>+ Add Module queues — Save creates one syllabus version with all queued modules.</span>
                                    </div>
                                  </div>
                                </div>
                              )}
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
                      <div style={{ margin: '0 20px 20px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow:'var(--shadow-sm)' }}>
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
                    {role==='super_admin' ? (
                      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: newSlotSubjects.length ? 'auto' : 0 }}>{newSlotSubjects.map((s,i)=><span key={i} style={{ background: 'var(--bg-saffron)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '99px', fontSize: '12px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>{s}<button type="button" onClick={()=>setNewSlotSubjects(a=>a.filter((_,j)=>j!==i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px' }}>×</button></span>)}</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input placeholder="Class / Topic * — Enter to add chip (e.g. Sarali / Janta)" value={newSlotInput} onChange={e=>setNewSlotInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); const v=newSlotInput.trim(); if(v){ setNewSlotSubjects(a=>[...a, v]); setNewSlotInput(''); } } }} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: 1 }} />
                          <button type="button" onClick={()=>{ const v=newSlotInput.trim(); if(v){ setNewSlotSubjects(a=>[...a, v]); setNewSlotInput(''); } }} style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Add</button>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Super Admin: add multiple subjects in one slot — staff see only their batch.</div>
                      </div>
                    ) : (
                      <input placeholder="Class / Topic * (e.g. Practical 1, Theory)" value={newSlotSubject} onChange={e => setNewSlotSubject(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
                    )}
                    <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{ttCourseIds.map(id => { const c=dbData.courses.find(x=>x.id===id); return <span key={id} style={{ background: 'var(--bg)', border: '1px solid var(--primary)', padding: '3px 8px', borderRadius: '99px', fontSize: '11px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>{c ? `${c.code}` : id.slice(0,6)}<button type="button" onClick={()=>setTtCourseIds(a=>a.filter(x=>x!==id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>×</button></span>; })}</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select id="ttCoursePick" defaultValue="" onChange={e=>{ const v=e.target.value; if(v&&!ttCourseIds.includes(v)) setTtCourseIds(a=>[...a,v]); e.target.value=''; }} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', flex: 1, fontSize: '12px' }}>
                          <option value="">Link course (curriculum)…</option>
                          {dbData.courses.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                        </select>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Optional: wire slot to curriculum course — drives teaching logs & filtered views. Free subjects still work as extra topics.</div>
                    </div>
                    <input placeholder="Room (optional)" value={newSlotRoom} onChange={e => setNewSlotRoom(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '130px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add Slot</button>
                  </form>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '10px', lineHeight: 1.5 }}>Columns: {TT.map(c=>`${c.kind==='break'?`[${c.label}]`:`<b>${c.label}</b>`} ${c.start}–${c.end}`).join(' · ')} — club within same break-separated block (colspan). Default 8 periods; edit below.</div>
                {canAdmin('timetable') && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <b style={{ fontSize: '13px', color: 'var(--primary-deep)' }}>Period manager — columns are data</b>
                      <button type="button" onClick={()=>setShowPeriodMgr(v=>!v)} style={{ background: showPeriodMgr?'var(--primary)':'none', color: showPeriodMgr?'#fff':'var(--primary)', border: '1px solid var(--primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>{showPeriodMgr ? 'Hide' : 'Edit columns'}</button>
                    </div>
                    {showPeriodMgr && (
                      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <form onSubmit={handleAddPeriod} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <input placeholder="key (e.g. p9)" value={periodKey} onChange={e=>setPeriodKey(e.target.value)} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '90px', fontSize: '12px' }} required />
                          <input placeholder="Label (e.g. 9)" value={periodLabel} onChange={e=>setPeriodLabel(e.target.value)} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '90px', fontSize: '12px' }} required />
                          <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Start<input type="time" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', display: 'block' }} /></label>
                          <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>End<input type="time" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', display: 'block' }} /></label>
                          <select value={periodKind} onChange={e=>setPeriodKind(e.target.value)} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px' }}><option value="period">period</option><option value="break">break</option><option value="block">block</option></select>
                          <input type="number" placeholder="No." value={periodNum} onChange={e=>setPeriodNum(e.target.value)} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '12px' }} title="period_number" />
                          <input type="number" placeholder="Order" value={periodSort} onChange={e=>setPeriodSort(e.target.value)} style={{ padding: '7px', border: '1px solid var(--border)', borderRadius: '4px', width: '70px', fontSize: '12px' }} title="sort_order" />
                          <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Add column</button>
                        </form>
                        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead><tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}><th style={{ padding: '6px 8px' }}>Key/Label</th><th style={{ padding: '6px 8px' }}>Time</th><th style={{ padding: '6px 8px' }}>Kind</th><th style={{ padding: '6px 8px' }}>Order</th><th style={{ padding: '6px 8px' }}></th></tr></thead>
                            <tbody>
                              {TT.map(p => editingPeriodId===p.id ? (
                                <tr key={p.id} style={{ background: 'var(--bg-saffron)', borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px' }}><span style={{ fontWeight: 600 }}>{p.key}</span><input value={periodLabel} onChange={e=>setPeriodLabel(e.target.value)} style={{ marginLeft: '6px', padding: '4px', border: '1px solid var(--border)', borderRadius: '4px', width: '80px' }} /></td>
                                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}><input type="time" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }} />–<input type="time" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }} /></td>
                                  <td style={{ padding: '6px' }}><select value={periodKind} onChange={e=>setPeriodKind(e.target.value)} style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }}><option value="period">period</option><option value="break">break</option><option value="block">block</option></select></td>
                                  <td style={{ padding: '6px' }}><input type="number" value={periodSort} onChange={e=>setPeriodSort(e.target.value)} style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px', width: '60px' }} /></td>
                                  <td style={{ padding: '6px', display: 'flex', gap: '4px' }}><button onClick={handleUpdatePeriod} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Save</button><button onClick={()=>setEditingPeriodId(null)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Cancel</button></td>
                                </tr>
                              ) : (
                                <tr key={p.id||p.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px 8px' }}><b>{p.label}</b> <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{p.key}{p.num?` · #${p.num}`:''}</span></td>
                                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{p.start}–{p.end}</td>
                                  <td style={{ padding: '6px 8px' }}><span style={{ padding: '1px 6px', borderRadius: '99px', background: p.kind==='break'?'var(--bg-saffron)':'var(--primary)', color: p.kind==='break'?'var(--text-soft)':'#fff', fontSize: '11px' }}>{p.kind}</span></td>
                                  <td style={{ padding: '6px 8px' }}>{p.sort_order}</td>
                                  <td style={{ padding: '6px 8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    <button onClick={()=>movePeriod(p.id,'up')} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>↑</button>
                                    <button onClick={()=>movePeriod(p.id,'down')} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>↓</button>
                                    <button onClick={()=>{ setEditingPeriodId(p.id); setPeriodKey(p.key); setPeriodLabel(p.label); setPeriodStart(p.start); setPeriodEnd(p.end); setPeriodKind(p.kind); setPeriodNum(p.num?String(p.num):''); setPeriodSort(String(p.sort_order)); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                                    <button onClick={()=>handleDeletePeriod(p.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Delete</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Reorder with ↑/↓ (swaps sort_order). Breaks split clubbing segments. Changes apply to grid instantly; existing slots keep their start/end times.</div>
                      </div>
                    )}
                  </div>
                )}
                {/* Batch picker + combined view + search */}
                {dbData.batches.length > 0 && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-soft)', fontWeight: 600 }}>Grid for batch</label>
                    <select value={timetableBatch} onChange={e => { setTimetableBatch(e.target.value); setTimetableCombined(false); }} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '180px' }} disabled={timetableCombined}>
                      {dbData.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {canAdmin('timetable') && <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-soft)', cursor: 'pointer' }}><input type="checkbox" checked={timetableCombined} onChange={e=>setTimetableCombined(e.target.checked)} /> Combined (all batches)</label>}
                    <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>{timetableCombined ? 'Admin combined — day × period stacked by batch' : 'header period, sub-header timing, cell class (colspan)'}</span>
                  </div>
                )}

                {/* Weekly grid — single or combined */}
                {(() => {
                  const gridDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                  const allSlots = dbData.timetable;
                  const batchId = timetableBatch || (dbData.batches[0]?.id || '');
                  if (timetableCombined && canAdmin('timetable')) {
                    if (!allSlots.length) return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13.5px', marginBottom: '16px' }}>No slots yet — add periods above.</div>;
                    return (
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: '16px' }}>
                        <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-soft)', background: 'var(--bg-saffron)', borderBottom: '1px solid var(--border)' }}>Combined view — every batch stacked per period · <b>Edit</b> any chip via batch filter above</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                          <colgroup><col style={{ width: '84px' }} />{FIXED_TT.map(c=><col key={c.key} style={{ width: c.kind==='break' ? '6%' : `${Math.max(7, (94 - FIXED_TT.filter(x=>x.kind==='break').length*6) / FIXED_TT.filter(x=>x.kind!=='break').length)}%` }} />)}</colgroup>
                          <thead>
                            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                              <th style={{ padding: '10px 8px', borderRight: '1px solid var(--border)', textAlign: 'left' }}>DAY</th>
                              {FIXED_TT.map(col => <th key={col.key} style={{ padding: '8px 4px', borderRight: '1px solid var(--border)', fontWeight: col.kind==='break'?600:700, color: col.kind==='break'?'var(--text-faint)':'var(--primary-deep)', background: col.kind==='break'?'var(--bg-saffron)':'var(--bg)', fontSize: col.kind==='break'?'11px':'13px' }}>{col.label}</th>)}
                            </tr>
                            <tr style={{ background: 'var(--bg-saffron)', borderBottom: '2px solid var(--border)', textAlign: 'center', fontSize: '11px', color: 'var(--text-soft)' }}>
                              <th style={{ padding: '5px 8px', borderRight: '1px solid var(--border)' }}></th>
                              {FIXED_TT.map(col => <th key={col.key} style={{ padding: '5px 2px', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', background: col.kind==='break'?'var(--bg-saffron)':'#fff' }}>{col.start}–{col.end.slice(0,5)}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {gridDays.map(day => (
                              <tr key={day} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 8px', fontWeight: 700, background: 'var(--bg)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{day.slice(0,3).toUpperCase()}</td>
                                {FIXED_TT.map(col => {
                                  if (col.kind==='break') return <td key={col.key} style={{ padding: '10px 4px', borderRight: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg-saffron)', color: 'var(--text-faint)', fontSize: '10px', fontWeight: 600 }}>{col.label}</td>;
                                  const starters = allSlots.filter(s=> s.day_of_week===day && slotToKeys(s).from===col.key);
                                  const covered = allSlots.some(s=>{ if(s.day_of_week!==day) return false; const {from,to}=slotToKeys(s); const fi=FIXED_TT.findIndex(c=>c.key===from), ti=FIXED_TT.findIndex(c=>c.key===to); const ci=FIXED_TT.findIndex(c=>c.key===col.key); return ci>fi&&ci<=ti; });
                                  if (covered) return null;
                                  if (!starters.length) return <td key={col.key} style={{ padding: '8px 4px', borderRight: '1px solid var(--border)', textAlign: 'center', verticalAlign: 'middle', background: 'var(--surface)', color: 'var(--text-faint)', fontSize: '12px' }}>—</td>;
                                  // use max span among starters for colspan, but render all starters stacked
                                  const span = Math.max(...starters.map(s=>{ const {from,to}=slotToKeys(s); return FIXED_TT.findIndex(c=>c.key===to)-FIXED_TT.findIndex(c=>c.key===from)+1; }));
                                  return (
                                    <td key={col.key} colSpan={span>1?span:undefined} style={{ padding: '6px', borderRight: '1px solid var(--border)', verticalAlign: 'top', background: 'var(--surface)' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {starters.map(slot => {
                                          const batch = dbData.batches.find(b=>b.id===slot.batch_id);
                                          return <div key={slot.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 6px', fontSize: '11.5px' }}><span style={{ fontWeight: 700, color: 'var(--primary-deep)' }}>{slotDisplaySubjects(slot)}</span><span style={{ color: 'var(--text-faint)' }}> · {batch?.name || '—'}{slot.room?` · ${slot.room}`:''}</span></div>;
                                        })}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  const batchSlots = batchId ? allSlots.filter(s => s.batch_id === batchId) : [];
                  if (!batchId) return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13.5px', marginBottom: '16px' }}>Create a batch and add slots to see the weekly grid.</div>;
                  if (batchSlots.length === 0) return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '22px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13.5px', marginBottom: '16px' }}>No slots for this batch yet — add the first period above (pick From/To to club periods).</div>;
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
                  const starterForDay = (day, colKey) => daySlots(day).find(s=> slotToKeys(s).from===colKey) || null;
                  return (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: '16px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                        <colgroup><col style={{ width: '84px' }} />{FIXED_TT.map(c=><col key={c.key} style={{ width: c.kind==='break' ? '6.5%' : '9.35%' }} />)}</colgroup>
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
                                      <div style={{ fontWeight: 600, color: 'var(--primary-deep)', fontSize: '13px', lineHeight: 1.25 }}>{slotDisplaySubjects(slot)}</div>
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
                      <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>PERIOD → timing → class. Club periods via From/To within same break-separated block. BREAK/LUNCH/NAP fixed.</div>
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
                                <td style={{ padding: '8px' }}>{role==='super_admin' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>{editSlotSubjects.map((s,i)=><span key={i} style={{ background: 'var(--bg-saffron)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '99px', fontSize: '11px' }}>{s}<button type="button" onClick={()=>setEditSlotSubjects(a=>a.filter((_,j)=>j!==i))} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px' }}>×</button></span>)}</div>
                                    <div style={{ display: 'flex', gap: '4px' }}><input value={editSlotInput} onChange={e=>setEditSlotInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); const v=editSlotInput.trim(); if(v){ setEditSlotSubjects(a=>[...a,v]); setEditSlotInput(''); } } }} placeholder="Add" style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px', flex: 1, fontSize: '12px' }} /><button type="button" onClick={()=>{ const v=editSlotInput.trim(); if(v){ setEditSlotSubjects(a=>[...a,v]); setEditSlotInput(''); } }} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>+</button></div>
                                  </div>
                                ) : <input value={editSlotSubject} onChange={e => setEditSlotSubject(e.target.value)} placeholder="Class / Topic" style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', width: '100%' }} />}</td>
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
                                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--primary-deep)' }}>{slotDisplaySubjects(s) !== '—' ? slotDisplaySubjects(s) : <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>—</span>}</td>
                                <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{batch?.name || '—'}</td>
                                <td style={{ padding: '12px', color: 'var(--text-soft)' }}>{s.room || <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                                <td style={{ padding: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {canAdmin('timetable') && <button onClick={() => { const k=slotToKeys(s); setEditingSlot(s.id); setEditSlotDay(s.day_of_week); setEditSlotFrom(k.from); setEditSlotTo(k.to); setEditSlotRoom(s.room || ''); const arr = Array.isArray(s.subjects) ? s.subjects : (s.subject ? [s.subject] : []); setEditSlotSubject(arr[0]||''); setEditSlotSubjects(arr); setEditSlotInput(''); setEditSlotBatch(s.batch_id); }} style={{ background: 'none', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>}
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

            {activeModule === 'teachinglogs' && (
              <div>
                <p style={{ color: 'var(--text-soft)', marginBottom: '12px' }}>Weekly log — teacher records what was taught per slot per date (L/Th/P, remarks, done/not). Students confirm. XLSX matches legacy A1:O202.</p>
                {/* ── Class completion loop — log what was taught (+ done/not, L/Th/P, remarks, weekly XLSX) ── */}
                {canCreate('teachinglogs') && (
                  <form onSubmit={handleAddClassEntry} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-xl)', marginTop: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 220px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-soft)', display: 'block', marginBottom: '4px' }}>Slot</label>
                      <select value={ceSlot} onChange={e => { setCeSlot(e.target.value); const s=dbData.timetable.find(x=>x.id===e.target.value); setCePeriodLabel(s?ceSlotPeriodLabel(s):''); }} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '100%' }}>
                        <option value="">Pick slot…</option>
                        {dbData.timetable.map(s => {
                          const b = dbData.batches.find(x => x.id === s.batch_id);
                          return <option key={s.id} value={s.id}>{s.day_of_week} {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)} · {b?.name || s.batch_id.slice(0, 6)} · {s.room} · {slotDisplaySubjects(s)}</option>;
                        })}
                      </select>
                    </div>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Date <input type="date" value={ceDate} onChange={e => setCeDate(e.target.value)} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', display: 'block' }} /></label>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)', display: 'flex', flexDirection: 'column', gap: '4px' }}>Conducted
                      <select value={ceConducted ? '1' : '0'} onChange={e=>setCeConducted(e.target.value==='1')} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        <option value="1">Done</option><option value="0">Not done</option>
                      </select>
                    </label>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>L <input type="number" min="0" value={ceL} onChange={e=>setCeL(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '60px', display: 'block' }} /></label>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Th <input type="number" min="0" value={ceTh} onChange={e=>setCeTh(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '60px', display: 'block' }} /></label>
                    <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>P <input type="number" min="0" value={ceP} onChange={e=>setCeP(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '60px', display: 'block' }} /></label>
                    <input placeholder="Period label (e.g. all periods (1st Sem))" value={cePeriodLabel} onChange={e=>setCePeriodLabel(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 180px' }} />
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
                    <input placeholder="Remarks (On Leave / Holiday …)" value={ceRemarks} onChange={e => setCeRemarks(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <input placeholder="notes (optional)" value={ceNotes} onChange={e => setCeNotes(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: '1 1 160px' }} />
                    <button type="submit" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Log class</button>
                  </form>
                )}
                {/* Weekly XLSX download — linked to timetable */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px', background: 'var(--bg-saffron)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary-deep)' }}>Weekly teaching log</span>
                  <label style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Week start (Mon) <input type="date" value={ceWeekStart} onChange={e=>setCeWeekStart(e.target.value)} style={{ padding: '6px', border: '1px solid var(--border)', borderRadius: '4px', display: 'block' }} /></label>
                  <button type="button" onClick={downloadWeeklyXlsx} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Download XLSX</button>
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>A1:O202 layout, SUM totals, thin borders — linked to Fixed timetable. Super Admin exports all faculty; staff exports own.</span>
                </div>

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
                                {canAdmin('teachinglogs') && <button onClick={() => handleDelete('class_entries', entry.id)} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginLeft: '4px' }}>Delete</button>}
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
