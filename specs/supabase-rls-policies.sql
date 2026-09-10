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

create policy "Users can read their own row"
  on public.users for select
  to authenticated
  using (auth.uid() = auth_user_id);

create policy "Super Admin can manage users"
  on public.users for all
  to authenticated
  using (public.has_permission('users', array['Full']))
  with check (public.has_permission('users', array['Full']));

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

create policy "Batches are readable by enrolled students / faculty"
  on public.batches for select
  to authenticated
  using (
    batches.id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'guest_faculty', 'admin', 'super_admin')
    or public.has_permission('batches', array['View','Manage','Full'])
  );

create policy "Super Admin / Admin can manage batches"
  on public.batches for all
  to authenticated
  using (public.has_permission('batches', array['Manage','Full']))
  with check (public.has_permission('batches', array['Manage','Full']));

-- ============================================================================
-- TIMETABLE & LIVE CLASSES
-- ============================================================================
create policy "Timetable slots are readable by batch members"
  on public.timetable_slots for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('timetable', array['View','Manage','Full'])
  );

create policy "Super Admin / Admin can manage timetable"
  on public.timetable_slots for all
  to authenticated
  using (public.has_permission('timetable', array['Manage','Full']))
  with check (public.has_permission('timetable', array['Manage','Full']));

create policy "Live sessions are readable by batch members"
  on public.live_sessions for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('liveclasses', array['View','Manage','Full'])
  );

create policy "Super Admin / Admin can manage live sessions"
  on public.live_sessions for all
  to authenticated
  using (public.has_permission('liveclasses', array['Manage','Full']))
  with check (public.has_permission('liveclasses', array['Manage','Full']));

-- ============================================================================
-- LESSON PLANS
-- ============================================================================
create policy "Lesson plans readable by batch members and author"
  on public.lesson_plans for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or author_id = public.my_user_id()
    or public.has_permission('lessonplans', array['View','Manage','Full'])
  );

create policy "Super Admin / Admin can manage lesson plans"
  on public.lesson_plans for all
  to authenticated
  using (public.has_permission('lessonplans', array['Manage','Full']))
  with check (public.has_permission('lessonplans', array['Manage','Full']));

-- ============================================================================
-- ASSIGNMENTS
-- ============================================================================
create policy "Assignments readable by batch members"
  on public.assignments for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('assignments', array['View','Manage','Full'])
  );

create policy "Super Admin / Admin can manage assignments"
  on public.assignments for all
  to authenticated
  using (public.has_permission('assignments', array['Manage','Full']))
  with check (public.has_permission('assignments', array['Manage','Full']));

-- ============================================================================
-- FEEDBACK
-- ============================================================================
create policy "Feedback readable by recipient or author"
  on public.feedback for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or recipient = public.my_user_name()
    or author = public.my_user_name()
    or public.my_role_key() in ('admin', 'super_admin')
  );

create policy "Super Admin / Admin can manage feedback"
  on public.feedback for all
  to authenticated
  using (public.has_permission('feedback', array['Manage','Full']))
  with check (public.has_permission('feedback', array['Manage','Full']));

-- ============================================================================
-- EVENTS
-- ============================================================================
create policy "Published events are public (anyone)"
  on public.events for select
  using (status = 'published');

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
create policy "Published jobs are public"
  on public.jobs for select
  using (status = 'published');

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
create policy "Activities readable by batch members"
  on public.activities for select
  to authenticated
  using (
    batch_id = any(public.my_batch_ids())
    or public.my_role_key() in ('teacher', 'admin', 'super_admin')
    or public.has_permission('activities', array['View','Manage','Full'])
  );

create policy "Super Admin / Admin can manage activities"
  on public.activities for all
  to authenticated
  using (public.has_permission('activities', array['Manage','Full']))
  with check (public.has_permission('activities', array['Manage','Full']));

-- ============================================================================
-- DOCUMENTS & DOCUMENT ACCESS LOG
-- ============================================================================
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

create policy "Document access log readable by accessor"
  on public.document_access_log for select
  to authenticated
  using (accessor_id = public.my_user_id());

-- ============================================================================
-- COURSE TYPES & COURSE MODULES (structured MPA format)
-- ============================================================================
create policy "Course types are readable by all authenticated"
  on public.course_types for select
  to authenticated
  using (true);

drop policy if exists "Super Admin can manage course types" on public.course_types;
create policy "Super Admin can manage course types"
  on public.course_types for all
  to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

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
-- BATCH FACULTY & ENROLLMENTS
-- ============================================================================
create policy "Batch faculty readable by batch members"
  on public.batch_faculty for select
  to authenticated
  using (
    faculty_id = public.my_user_id()
    or batch_id = any(public.my_batch_ids())
  );

create policy "Enrollments readable by student or faculty"
  on public.enrollments for select
  to authenticated
  using (
    student_id = public.my_user_id()
    or batch_id = any(public.my_batch_ids())
  );

-- ============================================================================
-- SESSION ATTENDANCE
-- ============================================================================
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