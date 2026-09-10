-- ============================================================================
-- RLS POLICIES — Nada Gurukulam
-- Apply via Supabase SQL Editor or: node backend/scripts/apply-rls.js
-- Note: backend uses service_role key which bypasses RLS.
-- These policies protect direct Supabase client access only.
-- ============================================================================

-- Helper: check if a user has a given access level for a module
-- (mirrors the backend guard logic, so policies align with server-side enforcement)
-- NOTE: this function uses the service_role key internally so it can always
-- look up role_permissions. For direct client access, the caller's auth.uid()
-- is used to find their role.

-- ============================================================================
-- ROLES & USERS
-- ============================================================================
create policy "Roles are readable by all authenticated users"
  on public.roles for select
  to authenticated
  using (true);

create policy "Super Admin can manage roles"
  on public.roles for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'roles'
      and rp.access_level = 'Full'
    )
  );

create policy "Users can read their own row"
  on public.users for select
  to authenticated
  using (auth.uid() = auth_user_id);

create policy "Super Admin can manage users"
  on public.users for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'users'
      and rp.access_level = 'Full'
    )
  );

create policy "Role permissions are readable by all authenticated"
  on public.role_permissions for select
  to authenticated
  using (true);

create policy "Super Admin can manage role_permissions"
  on public.role_permissions for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'roles'
      and rp.access_level = 'Full'
    )
  );

-- ============================================================================
-- ACADEMIC STRUCTURE
-- ============================================================================
create policy "Disciplines are readable by all authenticated"
  on public.disciplines for select
  to authenticated
  using (true);

create policy "Super Admin can manage disciplines"
  on public.disciplines for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'curriculum'
      and rp.access_level = 'Full'
    )
  );

create policy "Batches are readable by enrolled students / faculty"
  on public.batches for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.enrollments e on e.student_id = u.id
      where u.auth_user_id = auth.uid() and e.batch_id = batches.id
    )
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role_key in ('teacher', 'guest_faculty', 'admin', 'super_admin')
    )
    or exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'batches'
      and rp.access_level in ('View', 'Manage', 'Full')
    )
  );

create policy "Super Admin / Admin can manage batches"
  on public.batches for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'batches'
      and rp.access_level in ('Manage', 'Full')
    )
  );

-- ============================================================================
-- TIMETABLE & LIVE CLASSES
-- ============================================================================
create policy "Timetable slots are readable by batch members"
  on public.timetable_slots for select
  to authenticated
  using (
    batch_id in (
      select b.id from public.batches b
      join public.enrollments e on e.batch_id = b.id
      join public.users u on u.id = e.student_id
      where u.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role_key in ('teacher', 'admin', 'super_admin')
    )
  );

create policy "Super Admin / Admin can manage timetable"
  on public.timetable_slots for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'timetable'
      and rp.access_level in ('Manage', 'Full')
    )
  );

create policy "Live sessions are readable by batch members"
  on public.live_sessions for select
  to authenticated
  using (
    batch_id in (
      select b.id from public.batches b
      join public.enrollments e on e.batch_id = b.id
      join public.users u on u.id = e.student_id
      where u.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role_key in ('teacher', 'admin', 'super_admin')
    )
  );

create policy "Super Admin / Admin can manage live sessions"
  on public.live_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'liveclasses'
      and rp.access_level in ('Manage', 'Full')
    )
  );

-- ============================================================================
-- LESSON PLANS
-- ============================================================================
create policy "Lesson plans readable by batch members and author"
  on public.lesson_plans for select
  to authenticated
  using (
    batch_id in (
      select b.id from public.batches b
      join public.enrollments e on e.batch_id = b.id
      join public.users u on u.id = e.student_id
      where u.auth_user_id = auth.uid()
    )
    or author_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Super Admin / Admin can manage lesson plans"
  on public.lesson_plans for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'lessonplans'
      and rp.access_level in ('Manage', 'Full')
    )
  );

-- ============================================================================
-- ASSIGNMENTS
-- ============================================================================
create policy "Assignments readable by batch members"
  on public.assignments for select
  to authenticated
  using (
    batch_id in (
      select b.id from public.batches b
      join public.enrollments e on e.batch_id = b.id
      join public.users u on u.id = e.student_id
      where u.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role_key in ('teacher', 'admin', 'super_admin')
    )
  );

create policy "Super Admin / Admin can manage assignments"
  on public.assignments for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'assignments'
      and rp.access_level in ('Manage', 'Full')
    )
  );

-- ============================================================================
-- FEEDBACK
-- ============================================================================
create policy "Feedback readable by recipient or author"
  on public.feedback for select
  to authenticated
  using (
    recipient = (select name from public.users where auth_user_id = auth.uid())
    or author = (select name from public.users where auth_user_id = auth.uid())
  );

create policy "Super Admin / Admin can manage feedback"
  on public.feedback for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'feedback'
      and rp.access_level in ('Manage', 'Full')
    )
  );

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

create policy "Author or Admin can manage events"
  on public.events for all
  to authenticated
  using (
    author_id in (select id from public.users where auth_user_id = auth.uid())
    or exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'events'
      and rp.access_level in ('Manage', 'Full')
    )
  );

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

create policy "Staff/Admin can manage jobs"
  on public.jobs for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'jobs'
      and rp.access_level in ('Manage', 'Full')
    )
  );

-- ============================================================================
-- ENQUIRIES
-- ============================================================================
create policy "Enquiries readable by staff and author"
  on public.enquiries for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'enquiries'
      and rp.access_level in ('View', 'Manage', 'Full')
    )
  );

create policy "Super Admin can manage enquiries"
  on public.enquiries for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'enquiries'
      and rp.access_level = 'Full'
    )
  );

-- ============================================================================
-- ACTIVITIES
-- ============================================================================
create policy "Activities readable by batch members"
  on public.activities for select
  to authenticated
  using (
    batch_id in (
      select b.id from public.batches b
      join public.enrollments e on e.batch_id = b.id
      join public.users u on u.id = e.student_id
      where u.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role_key in ('teacher', 'admin', 'super_admin')
    )
  );

create policy "Super Admin / Admin can manage activities"
  on public.activities for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'activities'
      and rp.access_level in ('Manage', 'Full')
    )
  );

-- ============================================================================
-- DOCUMENTS & DOCUMENT ACCESS LOG
-- ============================================================================
create policy "Documents readable by visibility rules"
  on public.documents for select
  to authenticated
  using (
    visibility = 'public'
    or (visibility = 'students' and exists (
      select 1 from public.enrollments e
      join public.users u on u.id = e.student_id
      where e.student_id = u.id and u.auth_user_id = auth.uid()
    ))
    or (visibility = 'staff' and exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
      and u.role_key in ('teacher', 'admin', 'super_admin')
    ))
    or (visibility = 'private' and uploader_id in (
      select id from public.users where auth_user_id = auth.uid()
    ))
  );

create policy "Uploader can manage their documents"
  on public.documents for all
  to authenticated
  using (
    uploader_id in (select id from public.users where auth_user_id = auth.uid())
  );

create policy "Document access log readable by accessor"
  on public.document_access_log for select
  to authenticated
  using (accessor_id in (select id from public.users where auth_user_id = auth.uid()));

-- ============================================================================
-- COURSE TYPES & COURSE MODULES (structured MPA format)
-- ============================================================================
create policy "Course types are readable by all authenticated"
  on public.course_types for select
  to authenticated
  using (true);

create policy "Super Admin can manage course types"
  on public.course_types for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'curriculum'
      and rp.access_level = 'Full'
    )
  );

create policy "Course modules are readable by all authenticated"
  on public.course_modules for select
  to authenticated
  using (true);

create policy "Super Admin can manage course modules"
  on public.course_modules for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'curriculum'
      and rp.access_level = 'Full'
    )
  );

-- ============================================================================
-- BATCH FACULTY & ENROLLMENTS
-- ============================================================================
create policy "Batch faculty readable by batch members"
  on public.batch_faculty for select
  to authenticated
  using (
    batch_id in (
      select b.id from public.batches b
      join public.enrollments e on e.batch_id = b.id
      join public.users u on u.id = e.student_id
      where u.auth_user_id = auth.uid()
    )
    or faculty_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Enrollments readable by student or faculty"
  on public.enrollments for select
  to authenticated
  using (
    student_id in (select id from public.users where auth_user_id = auth.uid())
    or batch_id in (
      select b.id from public.batches b
      join public.batch_faculty bf on bf.batch_id = b.id
      where bf.faculty_id in (select id from public.users where auth_user_id = auth.uid())
    )
  );

-- ============================================================================
-- SESSION ATTENDANCE
-- ============================================================================
create policy "Attendance readable by session participants"
  on public.session_attendance for select
  to authenticated
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

create policy "Super Admin / Admin can manage attendance"
  on public.session_attendance for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid()
      and rp.module_key = 'liveclasses'
      and rp.access_level in ('Manage', 'Full')
    )
  );