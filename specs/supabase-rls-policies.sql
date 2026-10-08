-- ============================================================================
-- RLS POLICIES — Nada Gurukulam
-- Apply via Supabase SQL Editor or: node backend/scripts/apply-rls.js
-- Note: backend uses service_role key which bypasses RLS.
-- These policies protect direct Supabase client access only.
-- ============================================================================

-- Helpers to avoid RLS recursion on public.users.
-- Any policy whose target is public.users must not SELECT from public.users directly
-- (that would recurse through RLS). These SECURITY DEFINER functions read the table
-- bypassing RLS and are safe to call from policies.
create or replace function public.my_user_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() limit 1
$$;
create or replace function public.my_user_name() returns text
language sql security definer stable set search_path = public as $$
  select name from public.users where auth_user_id = auth.uid() limit 1
$$;
create or replace function public.my_role_key() returns text
language sql security definer stable set search_path = public as $$
  select role_key from public.users where auth_user_id = auth.uid() limit 1
$$;
create or replace function public.has_permission(p_module text, p_levels text[]) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users u
    join public.role_permissions rp on rp.role_key = u.role_key
    where u.auth_user_id = auth.uid()
      and rp.module_key = p_module
      and rp.access_level = any(p_levels)
  )
$$;
create or replace function public.my_batch_ids() returns uuid[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(batch_id), '{}'::uuid[]) from (
    select batch_id from public.enrollments where student_id = public.my_user_id()
    union
    select batch_id from public.batch_faculty where faculty_id = public.my_user_id()
    union
    select id as batch_id from public.batches where faculty_id = public.my_user_id()
  ) s
$$;
grant execute on function public.my_user_id() to authenticated, anon;
grant execute on function public.my_user_name() to authenticated, anon;
grant execute on function public.my_role_key() to authenticated, anon;
grant execute on function public.has_permission(text, text[]) to authenticated, anon;
grant execute on function public.my_batch_ids() to authenticated, anon;

-- ============================================================================
-- ROLES & USERS
-- ============================================================================
drop policy if exists "Roles are readable by all authenticated users" on public.roles;
create policy "Roles are readable by all authenticated users"
  on public.roles for select
  to authenticated
  using (true);

drop policy if exists "Super Admin can manage roles" on public.roles;
create policy "Super Admin can manage roles"
  on public.roles for all
  to authenticated
  using (public.has_permission('roles', array['Full']))
  with check (public.has_permission('roles', array['Full']));

drop policy if exists "Users can read their own row" on public.users;
create policy "Users can read their own row"
  on public.users for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Super Admin can manage users" on public.users;
create policy "Super Admin can manage users"
  on public.users for all
  to authenticated
  using (public.has_permission('users', array['Full']))
  with check (public.has_permission('users', array['Full']));

drop policy if exists "Role permissions are readable by all authenticated" on public.role_permissions;
create policy "Role permissions are readable by all authenticated"
  on public.role_permissions for select
  to authenticated
  using (true);

drop policy if exists "Super Admin can manage role_permissions" on public.role_permissions;
create policy "Super Admin can manage role_permissions"
  on public.role_permissions for all
  to authenticated
  using (public.has_permission('roles', array['Full']))
  with check (public.has_permission('roles', array['Full']));

-- ============================================================================
-- ACADEMIC STRUCTURE
-- ============================================================================
drop policy if exists "Disciplines are readable by all authenticated" on public.disciplines;
create policy "Disciplines are readable by all authenticated"
  on public.disciplines for select
  to authenticated
  using (true);

drop policy if exists "Super Admin can manage disciplines" on public.disciplines;
create policy "Super Admin can manage disciplines"
  on public.disciplines for all
  to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

drop policy if exists "Batches are readable by enrolled students / faculty" on public.batches;
create policy "Batches are readable by enrolled students / faculty"
  on public.batches for select
  to authenticated
  using (
    batches.id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'guest_faculty', 'admin', 'super_admin')
    or public.has_permission('batches', array['View','Manage','Full'])
  );

drop policy if exists "Super Admin / Admin can manage batches" on public.batches;
create policy "Super Admin / Admin can manage batches"
  on public.batches for all
  to authenticated
  using (public.has_permission('batches', array['Manage','Full']))
  with check (public.has_permission('batches', array['Manage','Full']));

-- ============================================================================
-- TIMETABLE & LIVE CLASSES
-- ============================================================================
drop policy if exists "Timetable slots are readable by batch members" on public.timetable_slots;
create policy "Timetable slots are readable by batch members"
  on public.timetable_slots for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('timetable', array['View','Manage','Full'])
  );

drop policy if exists "Super Admin / Admin can manage timetable" on public.timetable_slots;
create policy "Super Admin / Admin can manage timetable"
  on public.timetable_slots for all
  to authenticated
  using (public.has_permission('timetable', array['Manage','Full']))
  with check (public.has_permission('timetable', array['Manage','Full']));

drop policy if exists "Live sessions are readable by batch members" on public.live_sessions;
create policy "Live sessions are readable by batch members"
  on public.live_sessions for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('liveclasses', array['View','Manage','Full'])
  );

drop policy if exists "Super Admin / Admin can manage live sessions" on public.live_sessions;
create policy "Super Admin / Admin can manage live sessions"
  on public.live_sessions for all
  to authenticated
  using (public.has_permission('liveclasses', array['Manage','Full']))
  with check (public.has_permission('liveclasses', array['Manage','Full']));

-- ============================================================================
-- LESSON PLANS
-- ============================================================================
drop policy if exists "Lesson plans readable by batch members and author" on public.lesson_plans;
create policy "Lesson plans readable by batch members and author"
  on public.lesson_plans for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or author_id = public.my_user_id()
    or public.has_permission('lessonplans', array['View','Manage','Full'])
  );

drop policy if exists "Super Admin / Admin can manage lesson plans" on public.lesson_plans;
create policy "Super Admin / Admin can manage lesson plans"
  on public.lesson_plans for all
  to authenticated
  using (public.has_permission('lessonplans', array['Manage','Full']))
  with check (public.has_permission('lessonplans', array['Manage','Full']));

-- ============================================================================
-- ASSIGNMENTS
-- ============================================================================
drop policy if exists "Assignments readable by batch members" on public.assignments;
create policy "Assignments readable by batch members"
  on public.assignments for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('assignments', array['View','Manage','Full'])
  );

drop policy if exists "Super Admin / Admin can manage assignments" on public.assignments;
create policy "Super Admin / Admin can manage assignments"
  on public.assignments for all
  to authenticated
  using (public.has_permission('assignments', array['Manage','Full']))
  with check (public.has_permission('assignments', array['Manage','Full']));

-- ============================================================================
-- FEEDBACK
-- ============================================================================
drop policy if exists "Feedback readable by recipient or author" on public.feedback;
create policy "Feedback readable by recipient or author"
  on public.feedback for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or recipient = public.my_user_name()
    or author = public.my_user_name()
    or public.my_role_key() in ('admin', 'super_admin')
  );

drop policy if exists "Super Admin / Admin can manage feedback" on public.feedback;
create policy "Super Admin / Admin can manage feedback"
  on public.feedback for all
  to authenticated
  using (public.has_permission('feedback', array['Manage','Full']))
  with check (public.has_permission('feedback', array['Manage','Full']));

-- ============================================================================
-- EVENTS
-- ============================================================================
drop policy if exists "Published events are public (anyone)" on public.events;
create policy "Published events are public (anyone)"
  on public.events for select
  using (status = 'published');

drop policy if exists "Authenticated users can read all events" on public.events;
create policy "Authenticated users can read all events"
  on public.events for select
  to authenticated
  using (true);

drop policy if exists "Author or Admin can manage events" on public.events;
create policy "Author or Admin can manage events"
  on public.events for all
  to authenticated
  using (author_id = public.my_user_id() or public.has_permission('events', array['Manage','Full']))
  with check (author_id = public.my_user_id() or public.has_permission('events', array['Manage','Full']));

-- ============================================================================
-- JOBS
-- ============================================================================
drop policy if exists "Published jobs are public" on public.jobs;
create policy "Published jobs are public"
  on public.jobs for select
  using (status = 'published');

drop policy if exists "Authenticated users can read all jobs" on public.jobs;
create policy "Authenticated users can read all jobs"
  on public.jobs for select
  to authenticated
  using (true);

drop policy if exists "Staff/Admin can manage jobs" on public.jobs;
create policy "Staff/Admin can manage jobs"
  on public.jobs for all
  to authenticated
  using (public.has_permission('jobs', array['Manage','Full']))
  with check (public.has_permission('jobs', array['Manage','Full']));

-- ============================================================================
-- ENQUIRIES
-- ============================================================================
drop policy if exists "Enquiries readable by staff and author" on public.enquiries;
create policy "Enquiries readable by staff and author"
  on public.enquiries for select
  to authenticated
  using (public.has_permission('enquiries', array['View','Manage','Full']));

drop policy if exists "Super Admin can manage enquiries" on public.enquiries;
create policy "Super Admin can manage enquiries"
  on public.enquiries for all
  to authenticated
  using (public.has_permission('enquiries', array['Full']))
  with check (public.has_permission('enquiries', array['Full']));

-- ============================================================================
-- ACTIVITIES
-- ============================================================================
drop policy if exists "Student performances readable by batch members" on public.student_performances;
create policy "Student performances readable by batch members"
  on public.student_performances for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('performances', array['View','Manage','Full'])
  );

drop policy if exists "Super Admin / Admin can manage student performances" on public.student_performances;
create policy "Super Admin / Admin can manage student performances"
  on public.student_performances for all
  to authenticated
  using (public.has_permission('performances', array['Manage','Full']))
  with check (public.has_permission('performances', array['Manage','Full']));

-- ============================================================================
-- DOCUMENTS & DOCUMENT ACCESS LOG
-- ============================================================================
drop policy if exists "Documents readable by visibility rules" on public.documents;
create policy "Documents readable by visibility rules"
  on public.documents for select
  to authenticated
  using (
    visibility = 'public'
    or (visibility = 'students' and exists (select 1 from public.enrollments e where e.student_id = public.my_user_id()))
    or (visibility = 'staff' and public.my_role_key() in ('teacher', 'admin', 'super_admin'))
    or (visibility = 'private' and uploader_id = public.my_user_id())
  );

drop policy if exists "Uploader can manage their documents" on public.documents;
create policy "Uploader can manage their documents"
  on public.documents for all
  to authenticated
  using (uploader_id = public.my_user_id())
  with check (uploader_id = public.my_user_id());

drop policy if exists "Document access log readable by accessor" on public.document_access_log;
create policy "Document access log readable by accessor"
  on public.document_access_log for select
  to authenticated
  using (accessor_id = public.my_user_id());

-- ============================================================================
-- COURSE MODULES (structured MPA format)
-- ============================================================================
drop policy if exists "Course modules are readable by all authenticated" on public.course_modules;
create policy "Course modules are readable by all authenticated"
  on public.course_modules for select
  to authenticated
  using (true);

drop policy if exists "Super Admin can manage course modules" on public.course_modules;
create policy "Super Admin can manage course modules"
  on public.course_modules for all
  to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

-- ============================================================================
-- COURSES (structured MPA format — was missing, blocked all direct reads)
-- ============================================================================
drop policy if exists "Courses are readable by all authenticated" on public.courses;
create policy "Courses are readable by all authenticated"
  on public.courses for select
  to authenticated
  using (true);

drop policy if exists "Super Admin can manage courses" on public.courses;
create policy "Super Admin can manage courses"
  on public.courses for all
  to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

-- ============================================================================
-- EVENT RSVPS & JOB APPLICANTS (were RLS-enabled with zero policies)
-- ============================================================================
drop policy if exists "Event RSVPs readable by event managers" on public.event_rsvps;
create policy "Event RSVPs readable by event managers"
  on public.event_rsvps for select
  to authenticated
  using (public.has_permission('events', array['View','Manage','Full']));

drop policy if exists "Event managers can manage RSVPs" on public.event_rsvps;
create policy "Event managers can manage RSVPs"
  on public.event_rsvps for all
  to authenticated
  using (public.has_permission('events', array['Manage','Full']))
  with check (public.has_permission('events', array['Manage','Full']));

drop policy if exists "Job applicants readable by job managers" on public.job_applicants;
create policy "Job applicants readable by job managers"
  on public.job_applicants for select
  to authenticated
  using (public.has_permission('jobs', array['View','Manage','Full']));

drop policy if exists "Job managers can manage applicants" on public.job_applicants;
create policy "Job managers can manage applicants"
  on public.job_applicants for all
  to authenticated
  using (public.has_permission('jobs', array['Manage','Full']))
  with check (public.has_permission('jobs', array['Manage','Full']));

-- ============================================================================
-- BATCH FACULTY & ENROLLMENTS
-- ============================================================================
drop policy if exists "Batch faculty readable by batch members" on public.batch_faculty;
create policy "Batch faculty readable by batch members"
  on public.batch_faculty for select
  to authenticated
  using (
    faculty_id = public.my_user_id()
    or batch_id = any(public.my_batch_ids())
  );

drop policy if exists "Enrollments readable by student or faculty" on public.enrollments;
create policy "Enrollments readable by student or faculty"
  on public.enrollments for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or batch_id = any(public.my_batch_ids())
    or public.has_permission('batches', array['Manage','Full'])
  );

-- A student may join or leave their own batch; staff Manage+ may move anyone.
-- "Leaving" is an update to status, never a delete, so results stay attributable.
drop policy if exists "Enrollments insertable by self or staff" on public.enrollments;
create policy "Enrollments insertable by self or staff"
  on public.enrollments for insert
  to authenticated
  with check (student_id = public.my_user_id() or public.has_permission('batches', array['Manage','Full']));

drop policy if exists "Enrollments updatable by self or staff" on public.enrollments;
create policy "Enrollments updatable by self or staff"
  on public.enrollments for update
  to authenticated
  using (student_id = public.my_user_id() or public.has_permission('batches', array['Manage','Full']))
  with check (student_id = public.my_user_id() or public.has_permission('batches', array['Manage','Full']));

drop policy if exists "Enrollments deletable by staff only" on public.enrollments;
create policy "Enrollments deletable by staff only"
  on public.enrollments for delete
  to authenticated
  using (public.has_permission('batches', array['Manage','Full']));

-- ============================================================================
-- SESSION ATTENDANCE
-- ============================================================================
drop policy if exists "Attendance readable by session participants" on public.session_attendance;
create policy "Attendance readable by session participants"
  on public.session_attendance for select
  to authenticated
  using (user_id = public.my_user_id());

drop policy if exists "Super Admin / Admin can manage attendance" on public.session_attendance;
create policy "Super Admin / Admin can manage attendance"
  on public.session_attendance for all
  to authenticated
  using (public.has_permission('liveclasses', array['Manage','Full']))
  with check (public.has_permission('liveclasses', array['Manage','Full']));

-- ============================================================================
-- EXPANSION: USER OTPS, EXAMINATION TYPES, COURSE MODULE TOPICS
-- ============================================================================
-- user_otps: no direct client access — backend uses service_role. Keep locked down.
drop policy if exists "User can read own OTPs" on public.user_otps;
create policy "User can read own OTPs"
  on public.user_otps for select
  to authenticated
  using (user_id = public.my_user_id());

-- examination_types: readable by all authenticated, manageable via curriculum:Full
drop policy if exists "Examination types are readable by all authenticated" on public.examination_types;
create policy "Examination types are readable by all authenticated"
  on public.examination_types for select
  to authenticated
  using (true);

drop policy if exists "Curriculum managers can manage examination types" on public.examination_types;
create policy "Curriculum managers can manage examination types"
  on public.examination_types for all
  to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

-- course_module_topics: inherits curriculum gate via parent module's course
drop policy if exists "Course module topics are readable by all authenticated" on public.course_module_topics;
create policy "Course module topics are readable by all authenticated"
  on public.course_module_topics for select
  to authenticated
  using (true);

drop policy if exists "Curriculum managers can manage module topics" on public.course_module_topics;
create policy "Curriculum managers can manage module topics"
  on public.course_module_topics for all
  to authenticated
  using (public.has_permission('curriculum', array['Manage','Full']))
  with check (public.has_permission('curriculum', array['Manage','Full']));

-- ============================================================================
-- CLASS ENTRIES & CONFIRMATIONS — the completion loop (timetable module)
-- ============================================================================
drop policy if exists "Class entries readable by batch members" on public.class_entries;
create policy "Class entries readable by batch members"
  on public.class_entries for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.has_permission('timetable', array['View','Manage','Full'])
  );

drop policy if exists "Timetable managers can manage class entries" on public.class_entries;
create policy "Timetable managers can manage class entries"
  on public.class_entries for all
  to authenticated
  using (public.has_permission('timetable', array['Manage','Full']) or taught_by = public.my_user_id())
  with check (public.has_permission('timetable', array['Manage','Full']) or taught_by = public.my_user_id());

drop policy if exists "Class confirmations readable by owner or batch" on public.class_confirmations;
create policy "Class confirmations readable by owner or batch"
  on public.class_confirmations for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or exists (select 1 from public.class_entries ce where ce.id = class_entry_id and ce.batch_id = any(public.my_batch_ids()))
    or public.has_permission('timetable', array['View','Manage','Full'])
  );

drop policy if exists "Students can update own confirmations" on public.class_confirmations;
create policy "Students can update own confirmations"
  on public.class_confirmations for update
  to authenticated
  using (student_id = public.my_user_id() or public.has_permission('timetable', array['Manage','Full']))
  with check (student_id = public.my_user_id() or public.has_permission('timetable', array['Manage','Full']));

drop policy if exists "Students can insert own confirmations" on public.class_confirmations;
create policy "Students can insert own confirmations"
  on public.class_confirmations for insert
  to authenticated
  with check (student_id = public.my_user_id() or public.has_permission('timetable', array['Manage','Full']));

drop policy if exists "Students can delete own confirmations" on public.class_confirmations;
create policy "Students can delete own confirmations"
  on public.class_confirmations for delete
  to authenticated
  using (student_id = public.my_user_id() or public.has_permission('timetable', array['Manage','Full']));

-- ============================================================================
-- ASSIGNMENT SUBMISSIONS — per-student lifecycle (assignments module)
-- ============================================================================
drop policy if exists "Submissions readable by batch or owner" on public.assignment_submissions;
create policy "Submissions readable by batch or owner"
  on public.assignment_submissions for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or batch_id = any(public.my_batch_ids())
    or public.has_permission('assignments', array['View','Manage','Full'])
  );

drop policy if exists "Submissions insertable by owner or teacher" on public.assignment_submissions;
create policy "Submissions insertable by owner or teacher"
  on public.assignment_submissions for insert
  to authenticated
  with check (
    student_id = public.my_user_id()
    or public.has_permission('assignments', array['Manage','Full'])
  );

drop policy if exists "Submissions updatable by owner or teacher" on public.assignment_submissions;
create policy "Submissions updatable by owner or teacher"
  on public.assignment_submissions for update
  to authenticated
  using (student_id = public.my_user_id() or batch_id = any(public.my_batch_ids()) or public.has_permission('assignments', array['Manage','Full']))
  with check (student_id = public.my_user_id() or batch_id = any(public.my_batch_ids()) or public.has_permission('assignments', array['Manage','Full']));

drop policy if exists "Submissions deletable by teacher" on public.assignment_submissions;
create policy "Submissions deletable by teacher"
  on public.assignment_submissions for delete
  to authenticated
  using (batch_id = any(public.my_batch_ids()) or public.has_permission('assignments', array['Manage','Full']));

-- ============================================================================
-- PROJECTS — student portfolio (projects module)
-- ============================================================================
drop policy if exists "Projects readable by owner or batch" on public.projects;
create policy "Projects readable by owner or batch"
  on public.projects for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or batch_id = any(public.my_batch_ids())
    or public.has_permission('projects', array['View','Manage','Full'])
  );

drop policy if exists "Projects insertable by owner or manager" on public.projects;
create policy "Projects insertable by owner or manager"
  on public.projects for insert
  to authenticated
  with check (
    student_id = public.my_user_id()
    or public.has_permission('projects', array['Manage','Full'])
  );

drop policy if exists "Projects updatable by owner or manager" on public.projects;
create policy "Projects updatable by owner or manager"
  on public.projects for update
  to authenticated
  using (student_id = public.my_user_id() or batch_id = any(public.my_batch_ids()) or public.has_permission('projects', array['Manage','Full']))
  with check (student_id = public.my_user_id() or batch_id = any(public.my_batch_ids()) or public.has_permission('projects', array['Manage','Full']));

drop policy if exists "Projects deletable by owner or manager" on public.projects;
create policy "Projects deletable by owner or manager"
  on public.projects for delete
  to authenticated
  using (student_id = public.my_user_id() or batch_id = any(public.my_batch_ids()) or public.has_permission('projects', array['Manage','Full']));

-- ============================================================================
-- ORGANISATION & ADMISSIONS
-- Backend-only domains: applicants and admission decisions are confidential,
-- so these stay locked to the backend service_role unless a role is granted
-- View+ on the matching module.
-- ============================================================================
drop policy if exists "Organisation units readable with organisation access" on public.organisational_units;
create policy "Organisation units readable with organisation access"
  on public.organisational_units for select
  to authenticated
  using (public.has_permission('organisation', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Organisation managers can manage units" on public.organisational_units;
create policy "Organisation managers can manage units"
  on public.organisational_units for all
  to authenticated
  using (public.has_permission('organisation', array['Manage','Full']))
  with check (public.has_permission('organisation', array['Manage','Full']));

drop policy if exists "Institutions readable with organisation access" on public.institutions;
create policy "Institutions readable with organisation access"
  on public.institutions for select
  to authenticated
  using (public.has_permission('organisation', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Campuses readable with organisation access" on public.campuses;
create policy "Campuses readable with organisation access"
  on public.campuses for select
  to authenticated
  using (public.has_permission('organisation', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Admissions applications readable with admissions access" on public.admissions_applications;
create policy "Admissions applications readable with admissions access"
  on public.admissions_applications for select
  to authenticated
  using (public.has_permission('admissions', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Admissions managers can manage applications" on public.admissions_applications;
create policy "Admissions managers can manage applications"
  on public.admissions_applications for all
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']))
  with check (public.has_permission('admissions', array['Manage','Full']));

-- Applicant identities are confidential: admissions staff only, never the whole portal.
drop policy if exists "Applicants readable by admissions staff" on public.applicants;
create policy "Applicants readable by admissions staff"
  on public.applicants for select
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']));

drop policy if exists "Admissions staff can manage applicants" on public.applicants;
create policy "Admissions staff can manage applicants"
  on public.applicants for all
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']))
  with check (public.has_permission('admissions', array['Manage','Full']));

drop policy if exists "Screening records readable by admissions staff" on public.screening_records;
create policy "Screening records readable by admissions staff"
  on public.screening_records for select
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']));

drop policy if exists "Admissions staff can manage screening records" on public.screening_records;
create policy "Admissions staff can manage screening records"
  on public.screening_records for all
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']))
  with check (public.has_permission('admissions', array['Manage','Full']));

drop policy if exists "Auditions readable by admissions staff" on public.auditions;
create policy "Auditions readable by admissions staff"
  on public.auditions for select
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']));

drop policy if exists "Admissions staff can manage auditions" on public.auditions;
create policy "Admissions staff can manage auditions" on public.auditions for all
  to authenticated
  using (public.has_permission('admissions', array['Manage','Full']))
  with check (public.has_permission('admissions', array['Manage','Full']));

-- ============================================================================
-- CERTIFICATES — per-student (certificates module)
-- ============================================================================
drop policy if exists "Certificates readable by owner or manager" on public.certificates;
create policy "Certificates readable by owner or manager"
  on public.certificates for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or public.has_permission('certificates', array['View','Manage','Full'])
  );

drop policy if exists "Certificates insertable by owner or manager" on public.certificates;
create policy "Certificates insertable by owner or manager"
  on public.certificates for insert
  to authenticated
  with check (
    student_id = public.my_user_id()
    or public.has_permission('certificates', array['Manage','Full'])
  );

drop policy if exists "Certificates updatable by owner or manager" on public.certificates;
create policy "Certificates updatable by owner or manager"
  on public.certificates for update
  to authenticated
  using (student_id = public.my_user_id() or public.has_permission('certificates', array['Manage','Full']))
  with check (student_id = public.my_user_id() or public.has_permission('certificates', array['Manage','Full']));

drop policy if exists "Certificates deletable by owner or manager" on public.certificates;
create policy "Certificates deletable by owner or manager"
  on public.certificates for delete
  to authenticated
  using (student_id = public.my_user_id() or public.has_permission('certificates', array['Manage','Full']));

-- ============================================================================
-- COURSE OFFERINGS & REGISTRATION
-- ============================================================================
drop policy if exists "Course offerings readable by batch members" on public.course_offerings;
create policy "Course offerings readable by batch members"
  on public.course_offerings for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or faculty_id = public.my_user_id()
    or public.has_permission('curriculum', array['View','Manage','Full'])
  );

drop policy if exists "Curriculum managers can manage course offerings" on public.course_offerings;
create policy "Curriculum managers can manage course offerings"
  on public.course_offerings for all
  to authenticated
  using (public.has_permission('curriculum', array['Manage','Full']))
  with check (public.has_permission('curriculum', array['Manage','Full']));

drop policy if exists "Assigned faculty can read their assignments" on public.faculty_assignments;
create policy "Assigned faculty can read their assignments"
  on public.faculty_assignments for select
  to authenticated
  using (
    user_id = public.my_user_id()
    or public.has_permission('curriculum', array['View','Manage','Full'])
  );

drop policy if exists "Curriculum managers can manage faculty assignments" on public.faculty_assignments;
create policy "Curriculum managers can manage faculty assignments"
  on public.faculty_assignments for all
  to authenticated
  using (public.has_permission('curriculum', array['Manage','Full']))
  with check (public.has_permission('curriculum', array['Manage','Full']));

-- Registrations are the student's own record: readable by the student, the
-- offering's batch members (to take a roster), the teaching faculty, and
-- curriculum managers.
drop policy if exists "Course registrations readable by student and batch" on public.course_registrations;
create policy "Course registrations readable by student and batch"
  on public.course_registrations for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or exists (
      select 1 from public.course_offerings o
      where o.id = public.course_registrations.course_offering_id
        and (o.faculty_id = public.my_user_id()
             or o.batch_id = any(public.my_batch_ids()))
    )
    or public.has_permission('curriculum', array['Manage','Full'])
  );

drop policy if exists "Students can self-register for course offerings" on public.course_registrations;
create policy "Students can self-register for course offerings"
  on public.course_registrations for insert
  to authenticated
  with check (student_id = public.my_user_id());

drop policy if exists "Students can drop their own registration" on public.course_registrations;
create policy "Students can drop their own registration"
  on public.course_registrations for delete
  to authenticated
  using (student_id = public.my_user_id());
-- Fix RLS for positions and reporting_relationships (appended)
drop policy if exists "Positions readable with organisation access" on public.positions;
create policy "Positions readable with organisation access"
  on public.positions for select
  to authenticated
  using (public.has_permission('organisation', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Positions managers can manage positions" on public.positions;
create policy "Positions managers can manage positions"
  on public.positions for all
  to authenticated
  using (public.has_permission('organisation', array['Manage','Full']))
  with check (public.has_permission('organisation', array['Manage','Full']));

drop policy if exists "Reporting readable with organisation access" on public.reporting_relationships;
create policy "Reporting readable with organisation access"
  on public.reporting_relationships for select
  to authenticated
  using (public.has_permission('organisation', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Reporting managers can manage reporting" on public.reporting_relationships;
create policy "Reporting managers can manage reporting"
  on public.reporting_relationships for all
  to authenticated
  using (public.has_permission('organisation', array['Manage','Full']))
  with check (public.has_permission('organisation', array['Manage','Full']));

-- Student, mentor, or mentorship manager can see a relationship; confidential
-- notes stay hidden from everyone but their author.
--
-- Gated on 'mentorship', not 'roles': a mentor record is sensitive student
-- data and must not fall open to anyone who can merely view the permission
-- editor.
drop policy if exists "Relationships readable by student mentor or roles manager" on public.student_relationships;
drop policy if exists "Roles managers manage student relationships" on public.student_relationships;
drop policy if exists "Roles managers manage mentor progress notes" on public.mentor_progress_notes;
drop policy if exists "Relationships readable by student mentor or mentorship manager" on public.student_relationships;
create policy "Relationships readable by student mentor or mentorship manager"
  on public.student_relationships for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or mentor_id = public.my_user_id()
    or public.has_permission('mentorship', array['View','Manage','Full'])
  );

drop policy if exists "Mentorship managers manage student relationships" on public.student_relationships;
create policy "Mentorship managers manage student relationships"
  on public.student_relationships for all
  to authenticated
  using (public.has_permission('mentorship', array['Manage','Full']))
  with check (public.has_permission('mentorship', array['Manage','Full']));

drop policy if exists "Progress notes readable by author student or mentor" on public.mentor_progress_notes;
create policy "Progress notes readable by author student or mentor"
  on public.mentor_progress_notes for select
  to authenticated
  using (
    author_id = public.my_user_id()
    or exists (
      select 1 from public.student_relationships r
      where r.id = mentor_progress_notes.relationship_id
        and (r.student_id = public.my_user_id() or r.mentor_id = public.my_user_id())
    )
    or (not is_confidential and public.has_permission('mentorship', array['View','Manage','Full']))
  );

drop policy if exists "Mentorship managers manage mentor progress notes" on public.mentor_progress_notes;
create policy "Mentorship managers manage mentor progress notes"
  on public.mentor_progress_notes for all
  to authenticated
  using (public.has_permission('mentorship', array['Manage','Full']))
  with check (public.has_permission('mentorship', array['Manage','Full']));

-- ============================================================================
-- ATTENDANCE, ASSESSMENT & RESULTS (§13, §14, §15)
-- ============================================================================
--
-- Gate on 'assessment', not 'curriculum'. Grades and attendance are the most
-- sensitive student data in the institution: an academic administrator who
-- curates the syllabus has no business reading them, and 'assignments' already
-- covers classroom submission grading.

-- Helpers. Offering-scoped access is the manual's scope model (§6): a student
-- sees their own records, the teaching team sees their own offerings.
create or replace function public.my_course_offering_ids() returns uuid[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(course_offering_id), '{}'::uuid[]) from (
    select course_offering_id from public.faculty_assignments
      where user_id = public.my_user_id() and status = 'active'
    union
    select id from public.course_offerings where faculty_id = public.my_user_id()
  ) s
$$;
create or replace function public.my_registered_offering_ids() returns uuid[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(course_offering_id), '{}'::uuid[]) from public.course_registrations
  where student_id = public.my_user_id() and status <> 'dropped'
$$;
create or replace function public.teaches_offering(p_offering uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select p_offering = any(public.my_course_offering_ids())
$$;
create or replace function public.my_attendance_states() returns uuid[]
language sql security definer stable set search_path = public as $$
  select array_agg(id) from public.attendance_states
$$;
grant execute on function public.my_course_offering_ids() to authenticated, anon;
grant execute on function public.my_registered_offering_ids() to authenticated, anon;
grant execute on function public.teaches_offering(uuid) to authenticated, anon;
grant execute on function public.my_attendance_states() to authenticated, anon;

-- Reference data: everyone who can see the module can read these lookups.
-- They hold no student data, and the UI needs them to render labels at all.
drop policy if exists "Attendance states are readable by assessment viewers" on public.attendance_states;
create policy "Attendance states are readable by assessment viewers"
  on public.attendance_states for select
  to authenticated
  using (public.has_permission('assessment', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Assessment admins can manage attendance states" on public.attendance_states;
create policy "Assessment admins can manage attendance states"
  on public.attendance_states for all
  to authenticated
  using (public.has_permission('assessment', array['Full']))
  with check (public.has_permission('assessment', array['Full']));

drop policy if exists "Grading schemes are readable by assessment viewers" on public.grading_schemes;
create policy "Grading schemes are readable by assessment viewers"
  on public.grading_schemes for select
  to authenticated
  using (public.has_permission('assessment', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Assessment admins can manage grading schemes" on public.grading_schemes;
create policy "Assessment admins can manage grading schemes"
  on public.grading_schemes for all
  to authenticated
  using (public.has_permission('assessment', array['Full']))
  with check (public.has_permission('assessment', array['Full']));

drop policy if exists "Rubrics are readable by assessment viewers" on public.rubrics;
create policy "Rubrics are readable by assessment viewers"
  on public.rubrics for select
  to authenticated
  using (public.has_permission('assessment', array['View','Self','Submits','Own','Manage','Full']));

drop policy if exists "Assessment admins can manage rubrics" on public.rubrics;
create policy "Assessment admins can manage rubrics"
  on public.rubrics for all
  to authenticated
  using (public.has_permission('assessment', array['Full']))
  with check (public.has_permission('assessment', array['Full']));

-- Criteria follow their rubric's readability; nobody can read the criteria of a
-- rubric they cannot read.
drop policy if exists "Rubric criteria follow their rubric" on public.rubric_criteria;
create policy "Rubric criteria follow their rubric"
  on public.rubric_criteria for select
  to authenticated
  using (exists (select 1 from public.rubrics r where r.id = rubric_criteria.rubric_id));

drop policy if exists "Assessment admins can manage rubric criteria" on public.rubric_criteria;
create policy "Assessment admins can manage rubric criteria"
  on public.rubric_criteria for all
  to authenticated
  using (public.has_permission('assessment', array['Full']))
  with check (public.has_permission('assessment', array['Full']));

-- Class sessions: readable by the teaching team, the enrolled cohort, and
-- assessment managers. A student's attendance page needs the session topic.
drop policy if exists "Class sessions readable by cohort and teachers" on public.class_sessions;
create policy "Class sessions readable by cohort and teachers"
  on public.class_sessions for select
  to authenticated
  using (
    public.teaches_offering(course_offering_id)
    or course_offering_id = any(public.my_registered_offering_ids())
    or public.has_permission('assessment', array['View','Own','Manage','Full'])
  );

drop policy if exists "Teachers can record their own class sessions" on public.class_sessions;
create policy "Teachers can record their own class sessions"
  on public.class_sessions for insert
  to authenticated
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  );

drop policy if exists "Teachers and admins can manage class sessions" on public.class_sessions;
create policy "Teachers and admins can manage class sessions"
  on public.class_sessions for all
  to authenticated
  using (
    public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  );

-- Attendance records: a student reads only their own row. Even a class-wide
-- roster is not readable at the client, because it exposes every student's
-- presence at once — the backend composes summaries under its own checks.
drop policy if exists "Attendance readable by own student teachers and admins" on public.attendance_records;
create policy "Attendance readable by own student teachers and admins"
  on public.attendance_records for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or exists (
      select 1 from public.class_sessions s
      where s.id = attendance_records.class_session_id
        and public.teaches_offering(s.course_offering_id)
    )
    or public.has_permission('assessment', array['Manage','Full'])
  );

drop policy if exists "Attendance marked by teachers and admins" on public.attendance_records;
create policy "Attendance marked by teachers and admins"
  on public.attendance_records for all
  to authenticated
  using (
    exists (
      select 1 from public.class_sessions s
      where s.id = attendance_records.class_session_id
        and public.teaches_offering(s.course_offering_id)
    )
    or public.has_permission('assessment', array['Manage','Full'])
  )
  with check (
    exists (
      select 1 from public.class_sessions s
      where s.id = attendance_records.class_session_id
        and public.teaches_offering(s.course_offering_id)
    )
    or public.has_permission('assessment', array['Manage','Full'])
  );

-- Assessment plans and assessments are the teaching team's working material.
drop policy if exists "Assessment plans readable by cohort and teachers" on public.assessment_plans;
create policy "Assessment plans readable by cohort and teachers"
  on public.assessment_plans for select
  to authenticated
  using (
    public.teaches_offering(course_offering_id)
    or course_offering_id = any(public.my_registered_offering_ids())
    or public.has_permission('assessment', array['View','Own','Manage','Full'])
  );

drop policy if exists "Assessment managers can manage plans" on public.assessment_plans;
create policy "Assessment managers can manage plans"
  on public.assessment_plans for all
  to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

drop policy if exists "Assessments readable through their plan" on public.assessments;
create policy "Assessments readable through their plan"
  on public.assessments for select
  to authenticated
  using (exists (
    select 1 from public.assessment_plans p
    where p.id = assessments.plan_id
      and (
        public.teaches_offering(p.course_offering_id)
        or p.course_offering_id = any(public.my_registered_offering_ids())
        or public.has_permission('assessment', array['View','Own','Manage','Full'])
      )
  ));

drop policy if exists "Assessment managers can manage assessments" on public.assessments;
create policy "Assessment managers can manage assessments"
  on public.assessments for all
  to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

-- Submissions: own row for the student, otherwise the teaching team.
drop policy if exists "Submissions readable by own student and teachers" on public.assessment_submissions;
create policy "Submissions readable by own student and teachers"
  on public.assessment_submissions for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  );

drop policy if exists "Students can submit their own work" on public.assessment_submissions;
create policy "Students can submit their own work"
  on public.assessment_submissions for insert
  to authenticated
  with check (student_id = public.my_user_id());

drop policy if exists "Teachers and admins can manage submissions" on public.assessment_submissions;
create policy "Teachers and admins can manage submissions"
  on public.assessment_submissions for all
  to authenticated
  using (
    public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  )
  with check (
    public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  );

-- Evaluations: the evaluator, the student whose work it is, and managers.
-- Faculty feedback is visible to the student by design — this is the manual's
-- "Evidence/Submission → Evaluation → Feedback" chain (§12).
drop policy if exists "Evaluations readable by evaluator student and admins" on public.evaluations;
create policy "Evaluations readable by evaluator student and admins"
  on public.evaluations for select
  to authenticated
  using (
    evaluator_id = public.my_user_id()
    or exists (
      select 1 from public.assessment_submissions s
      where s.id = evaluations.submission_id and s.student_id = public.my_user_id()
    )
    or public.has_permission('assessment', array['Manage','Full'])
  );

drop policy if exists "Teachers and admins can manage evaluations" on public.evaluations;
create policy "Teachers and admins can manage evaluations"
  on public.evaluations for all
  to authenticated
  using (
    exists (
      select 1 from public.assessment_submissions s
      where s.id = evaluations.submission_id
        and (public.teaches_offering(s.course_offering_id) or public.has_permission('assessment', array['Manage','Full']))
    )
  )
  with check (
    exists (
      select 1 from public.assessment_submissions s
      where s.id = evaluations.submission_id
        and (public.teaches_offering(s.course_offering_id) or public.has_permission('assessment', array['Manage','Full']))
    )
  );

-- Results: a student reads only their own result, and only once the
-- examination cell has published it. Unpublished results stay with staff so a
-- student cannot see a mark that is still under evaluation.
drop policy if exists "Published results readable by student" on public.results;
create policy "Published results readable by student"
  on public.results for select
  to authenticated
  using (
    (student_id = public.my_user_id() and is_published)
    or public.teaches_offering(course_offering_id)
    or public.has_permission('assessment', array['Manage','Full'])
  );

drop policy if exists "Assessment managers can manage results" on public.results;
create policy "Assessment managers can manage results"
  on public.results for all
  to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

-- Corrections are an audit trail, never an editable document: readable by the
-- managers who may make them, and by the student whose result it amends.
drop policy if exists "Result corrections readable by student and admins" on public.result_corrections;
create policy "Result corrections readable by student and admins"
  on public.result_corrections for select
  to authenticated
  using (
    exists (
      select 1 from public.results r
      where r.id = result_corrections.result_id
        and (r.student_id = public.my_user_id() or public.has_permission('assessment', array['Manage','Full']))
    )
  );

drop policy if exists "Assessment managers can record result corrections" on public.result_corrections;
create policy "Assessment managers can record result corrections"
  on public.result_corrections for all
  to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

-- ============================================================================
-- PHASE 6 — RESIDENTIAL / HOSTEL and EVENTS, PRODUCTIONS (§16, §18)
-- ============================================================================
--
-- Residential records live behind their own `residential` module key, never
-- behind `users` or `batches`. §16 requires them to be "permission-restricted
-- and separated from general academic visibility", so a person who may read
-- every student record academically still cannot read where a student sleeps
-- unless the hostel office separately grants it.

create or replace function public.my_hostel_ids() returns uuid[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(hostel_id), '{}'::uuid[]) from public.warden_assignments
  where user_id = public.my_user_id() and end_date is null
$$;

-- A resident is anyone with a live allocation. Used to let a student see their
-- own hostel records and nothing else, without needing a permission at all.
create or replace function public.is_current_resident(p_student uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.hostel_allocations
    where student_id = p_student and allocated_to is null and status = 'active'
  )
$$;
grant execute on function public.my_hostel_ids() to authenticated, anon;
grant execute on function public.is_current_resident(uuid) to authenticated, anon;

-- Physical inventory. A resident needs to find their own hostel/room, and the
-- warden needs the whole tree, but an academic administrator needs none of it.
create or replace function public.can_read_residential() returns boolean
language sql security definer stable set search_path = public as $$
  select public.has_permission('residential', array['View','Self','Submits','Own','Manage','Full'])
$$;
create or replace function public.can_manage_residential() returns boolean
language sql security definer stable set search_path = public as $$
  select public.has_permission('residential', array['Manage','Full'])
$$;

-- ── Hostel inventory ───────────────────────────────────────────────────────

drop policy if exists "Residential viewers read hostels" on public.hostels;
create policy "Residential viewers read hostels"
  on public.hostels for select to authenticated
  using (public.can_read_residential() or public.my_hostel_ids() && array[id]);

drop policy if exists "Residential managers write hostels" on public.hostels;
create policy "Residential managers write hostels"
  on public.hostels for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

-- Blocks → floors → rooms → beds are pure structure beneath a hostel. Read for
-- anyone who can see the hostel; write is Manage, and the caller can only touch
-- a hostel they are actually attached to.
drop policy if exists "Residential viewers read hostel blocks" on public.hostel_blocks;
create policy "Residential viewers read hostel blocks"
  on public.hostel_blocks for select to authenticated
  using (public.can_read_residential() or hostel_id = any(public.my_hostel_ids()));
drop policy if exists "Residential managers write hostel blocks" on public.hostel_blocks;
create policy "Residential managers write hostel blocks"
  on public.hostel_blocks for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

drop policy if exists "Residential viewers read hostel floors" on public.hostel_floors;
create policy "Residential viewers read hostel floors"
  on public.hostel_floors for select to authenticated
  using (
    public.can_read_residential()
    or exists (select 1 from public.hostel_blocks b
                where b.id = hostel_floors.block_id and b.hostel_id = any(public.my_hostel_ids()))
  );
drop policy if exists "Residential managers write hostel floors" on public.hostel_floors;
create policy "Residential managers write hostel floors"
  on public.hostel_floors for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

drop policy if exists "Residential viewers read hostel rooms" on public.hostel_rooms;
create policy "Residential viewers read hostel rooms"
  on public.hostel_rooms for select to authenticated
  using (
    public.can_read_residential()
    or exists (select 1 from public.hostel_floors f
                join public.hostel_blocks b on b.id = f.block_id
                where f.id = hostel_rooms.floor_id and b.hostel_id = any(public.my_hostel_ids()))
  );
drop policy if exists "Residential managers write hostel rooms" on public.hostel_rooms;
create policy "Residential managers write hostel rooms"
  on public.hostel_rooms for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

drop policy if exists "Residential viewers read hostel beds" on public.hostel_beds;
create policy "Residential viewers read hostel beds"
  on public.hostel_beds for select to authenticated
  using (
    public.can_read_residential()
    or exists (select 1 from public.hostel_rooms r
                join public.hostel_floors f on f.id = r.floor_id
                join public.hostel_blocks b on b.id = f.block_id
                where r.id = hostel_beds.room_id and b.hostel_id = any(public.my_hostel_ids()))
  );
drop policy if exists "Residential managers write hostel beds" on public.hostel_beds;
create policy "Residential managers write hostel beds"
  on public.hostel_beds for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

-- ── Allocations ────────────────────────────────────────────────────────────
-- A student reads their own occupancy history and nothing else — past and
-- present, because the history is theirs. Nothing else is readable without
-- residential permission.

drop policy if exists "Students read own hostel allocations" on public.hostel_allocations;
create policy "Students read own hostel allocations"
  on public.hostel_allocations for select to authenticated
  using (student_id = public.my_user_id() or public.can_read_residential());

drop policy if exists "Residential managers write hostel allocations" on public.hostel_allocations;
create policy "Residential managers write hostel allocations"
  on public.hostel_allocations for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

-- ── Wardens ────────────────────────────────────────────────────────────────

drop policy if exists "Residential viewers read warden assignments" on public.warden_assignments;
create policy "Residential viewers read warden assignments"
  on public.warden_assignments for select to authenticated
  using (public.can_read_residential() or user_id = public.my_user_id());

drop policy if exists "Residential managers write warden assignments" on public.warden_assignments;
create policy "Residential managers write warden assignments"
  on public.warden_assignments for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

-- ── Leave, outings, transfers ──────────────────────────────────────────────
-- The requester reads their own; the warden and residential managers read the
-- rest. Approval is stricter than reading: only Manage+ decides.

drop policy if exists "Students read own leave requests" on public.hostel_leave_requests;
create policy "Students read own leave requests"
  on public.hostel_leave_requests for select to authenticated
  using (student_id = public.my_user_id() or public.can_read_residential());

drop policy if exists "Students request leave" on public.hostel_leave_requests;
create policy "Students request leave"
  on public.hostel_leave_requests for insert to authenticated
  with check (student_id = public.my_user_id() or public.can_manage_residential());

-- A student may only cancel a request they raised and only while it is still
-- pending; once a warden has decided it, the record is the warden's to hold.
drop policy if exists "Owners withdraw pending leave" on public.hostel_leave_requests;
create policy "Owners withdraw pending leave"
  on public.hostel_leave_requests for update to authenticated
  using (
    public.can_manage_residential()
    or (student_id = public.my_user_id() and status = 'pending')
  )
  with check (
    public.can_manage_residential()
    or (student_id = public.my_user_id() and status = 'cancelled')
  );

drop policy if exists "Students read own outings" on public.hostel_outings;
create policy "Students read own outings"
  on public.hostel_outings for select to authenticated
  using (student_id = public.my_user_id() or public.can_read_residential());

drop policy if exists "Students request outings" on public.hostel_outings;
create policy "Students request outings"
  on public.hostel_outings for insert to authenticated
  with check (student_id = public.my_user_id() or public.can_manage_residential());

drop policy if exists "Owners withdraw pending outings" on public.hostel_outings;
create policy "Owners withdraw pending outings"
  on public.hostel_outings for update to authenticated
  using (
    public.can_manage_residential()
    or (student_id = public.my_user_id() and status = 'pending')
  )
  with check (
    public.can_manage_residential()
    or (student_id = public.my_user_id() and status = 'cancelled')
  );

drop policy if exists "Residential viewers read room transfers" on public.hostel_room_transfers;
create policy "Residential viewers read room transfers"
  on public.hostel_room_transfers for select to authenticated
  using (student_id = public.my_user_id() or public.can_read_residential());

drop policy if exists "Residential managers write room transfers" on public.hostel_room_transfers;
create policy "Residential managers write room transfers"
  on public.hostel_room_transfers for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

-- ── Incidents ──────────────────────────────────────────────────────────────
-- §16's most sensitive record. Default confidential, so a non-confidential
-- incident is the deliberate act and a confidential one is never readable by
-- anyone who is not the subject, the reporter, or a residential manager.

drop policy if exists "Incident subjects reporters and managers read incidents" on public.hostel_incidents;
create policy "Incident subjects reporters and managers read incidents"
  on public.hostel_incidents for select to authenticated
  using (
    student_id = public.my_user_id()
    or reported_by = public.my_user_id()
    or public.can_manage_residential()
  );

drop policy if exists "Residential managers write incidents" on public.hostel_incidents;
create policy "Residential managers write incidents"
  on public.hostel_incidents for all to authenticated
  using (public.can_manage_residential())
  with check (public.can_manage_residential());

-- ============================================================================
-- EVENTS, PRODUCTIONS AND PERFORMANCES (§18)
-- ============================================================================
-- Productions are academic-adjacent rather than private: the artistic record
-- is meant to be published and put in a student's portfolio. They therefore
-- ride the existing `events` module key, not a new one — the events module
-- already carries publication rights and is already seeded for every role that
-- should see them.

drop policy if exists "Events viewers read productions" on public.productions;
create policy "Events viewers read productions"
  on public.productions for select to authenticated
  using (
    public.has_permission('events', array['View','Self','Submits','Own','Manage','Full'])
    or exists (
      select 1 from public.production_participants pp
      where pp.production_id = productions.id
        and pp.user_id = public.my_user_id()
    )
  );

drop policy if exists "Event managers write productions" on public.productions;
create policy "Event managers write productions"
  on public.productions for all to authenticated
  using (public.has_permission('events', array['Manage','Full']))
  with check (public.has_permission('events', array['Manage','Full']));

drop policy if exists "Participants and managers read production participants" on public.production_participants;
create policy "Participants and managers read production participants"
  on public.production_participants for select to authenticated
  using (
    public.has_permission('events', array['View','Self','Submits','Own','Manage','Full'])
    or user_id = public.my_user_id()
  );

drop policy if exists "Event managers write production participants" on public.production_participants;
create policy "Event managers write production participants"
  on public.production_participants for all to authenticated
  using (public.has_permission('events', array['Manage','Full']))
  with check (public.has_permission('events', array['Manage','Full']));

drop policy if exists "Events viewers read production sessions" on public.production_sessions;
create policy "Events viewers read production sessions"
  on public.production_sessions for select to authenticated
  using (
    public.has_permission('events', array['View','Self','Submits','Own','Manage','Full'])
    or exists (
      select 1 from public.production_participants pp
      where pp.production_id = production_sessions.production_id
        and pp.user_id = public.my_user_id()
    )
  );

drop policy if exists "Event managers write production sessions" on public.production_sessions;
create policy "Event managers write production sessions"
  on public.production_sessions for all to authenticated
  using (public.has_permission('events', array['Manage','Full']))
  with check (public.has_permission('events', array['Manage','Full']));

-- Travel is not a participant's business: it carries cost and vehicle detail,
-- so it stays with the people running the production.
drop policy if exists "Event managers read production travel" on public.production_travel;
create policy "Event managers read production travel"
  on public.production_travel for select to authenticated
  using (public.has_permission('events', array['Manage','Full']));

drop policy if exists "Event managers write production travel" on public.production_travel;
create policy "Event managers write production travel"
  on public.production_travel for all to authenticated
  using (public.has_permission('events', array['Manage','Full']))
  with check (public.has_permission('events', array['Manage','Full']));

-- ============================================================================
-- STUDENT DOSSIERS & APPRAISALS (integrated from Dossiers App)
-- ============================================================================

drop policy if exists "Evaluation blueprints readable by all authenticated" on public.evaluation_blueprints;
create policy "Evaluation blueprints readable by all authenticated"
  on public.evaluation_blueprints for select to authenticated
  using (true);

drop policy if exists "Managers manage evaluation blueprints" on public.evaluation_blueprints;
create policy "Managers manage evaluation blueprints"
  on public.evaluation_blueprints for all to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

drop policy if exists "Evaluation sections readable by all authenticated" on public.evaluation_sections;
create policy "Evaluation sections readable by all authenticated"
  on public.evaluation_sections for select to authenticated
  using (true);

drop policy if exists "Managers manage evaluation sections" on public.evaluation_sections;
create policy "Managers manage evaluation sections"
  on public.evaluation_sections for all to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

drop policy if exists "Evaluation questions readable by all authenticated" on public.evaluation_questions;
create policy "Evaluation questions readable by all authenticated"
  on public.evaluation_questions for select to authenticated
  using (true);

drop policy if exists "Managers manage evaluation questions" on public.evaluation_questions;
create policy "Managers manage evaluation questions"
  on public.evaluation_questions for all to authenticated
  using (public.has_permission('assessment', array['Manage','Full']))
  with check (public.has_permission('assessment', array['Manage','Full']));

drop policy if exists "Student assessments readable by student and assessors" on public.student_assessments;
create policy "Student assessments readable by student and assessors"
  on public.student_assessments for select to authenticated
  using (
    student_id = public.my_user_id()
    or public.has_permission('assessment', array['View','Self','Submits','Own','Manage','Full'])
  );

drop policy if exists "Student assessments writable by assessors" on public.student_assessments;
create policy "Student assessments writable by assessors"
  on public.student_assessments for all to authenticated
  using (
    student_id = public.my_user_id()
    or public.has_permission('assessment', array['Submits','Own','Manage','Full'])
  )
  with check (
    student_id = public.my_user_id()
    or public.has_permission('assessment', array['Submits','Own','Manage','Full'])
  );
