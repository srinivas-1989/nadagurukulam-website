-- ============================================================================
-- SAMPLE / TEMPORARY SEED DATA — editable & deletable
-- ----------------------------------------------------------------------------
-- Purpose: give every module real rows to work with while the portal grows.
-- This is PURE DATA, exactly the rows Super Admin would create via the UI —
-- no roles or fields are hardcoded anywhere in app code. Every row is a plain
-- record you can edit or delete in the portal once testing is done, or wipe
-- wholesale with the CLEANUP block at the bottom.
--
-- Covers: programmes (disciplines), student/staff/admin/guest-faculty users,
-- academic years/terms, batches, enrollments, courses/offerings,
-- faculty assignments. Runs anywhere (SQL editor / apply-schema.js).
-- Idempotent: safe to re-run; on conflict do nothing.
-- ============================================================================

-- ── 0. Ensure base tables exist (idempotent) ────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 1. ROLES  (data, not hardcode — mirror of a portal "Add Role") ─────────
-- Only super_admin is pre-seeded elsewhere; the portal admins see these rows
-- and can edit names/permissions or delete them afterwards.
insert into public.roles (key, name, description, category) values
  ('admin',             'Administrator',     'Senior administrator — organise & manage broadly.', 'administration'),
  ('teaching_faculty',  'Teaching Faculty',  'Core faculty (gurus / accompanists).',              'staff'),
  ('non_teaching_faculty', 'Non-teaching Faculty', 'Academic support & operations staff.',         'staff'),
  ('guest_faculty',     'Guest Faculty',     'Visiting gurus & guest lecturers.',                 'staff'),
  ('student',           'Student',           'Enrolled at NDG.',                                  'student')
on conflict (key) do update set name = excluded.name, category = excluded.category;

-- ── 2. MINIMUM STAFF TREE (category_level_values) ───────────────────────────
-- Super Admin creates these in the Roles & Categories editor. They hang under
-- the 'staff' category so user forms can pick Department → Designation.
-- Guarded with "where not exists" (not ON CONFLICT) so it runs whether the
-- installed tree schema has the plain sibling index or the lower(name) form.
insert into public.category_level_values (category_key, parent_id, role_key, name, sort_order)
select 'staff', null, r.key, r.key, 100
from public.roles r
where r.key in ('guest_faculty','non_teaching_faculty','teaching_faculty')
  and not exists (
    select 1 from public.category_level_values c
    where c.category_key='staff' and c.role_key = r.key and c.parent_id is null);

insert into public.category_level_values (category_key, parent_id, role_key, name, sort_order)
select 'staff', root.id, null, 'Department', 10
from public.category_level_values root
where root.category_key='staff' and root.role_key='teaching_faculty' and root.parent_id is null
  and not exists (
    select 1 from public.category_level_values c
    where c.category_key='staff' and c.name='Department' and c.parent_id = root.id);

insert into public.category_level_values (category_key, parent_id, name, sort_order)
select 'staff', dept.id, d.name, d.sort_order
from (values ('Carnatic Music', 1), ('Percussion', 2), ('Strings & Winds', 3), ('Administration', 10)) as d(name, sort_order)
cross join lateral (
  select id from public.category_level_values
  where category_key='staff' and name='Department' and parent_id is not null limit 1) dept
where dept.id is not null
  and not exists (
    select 1 from public.category_level_values c
    where c.category_key='staff' and c.parent_id = dept.id and lower(c.name)=lower(d.name));

insert into public.category_level_values (category_key, parent_id, name, sort_order)
select 'staff', dept.id, s.name, s.sort_order
from (values
        ('Carnatic Music','Guru', 1), ('Carnatic Music','Vocal Staff Artist', 2),
        ('Percussion','Mridangam Guru', 1), ('Percussion','Tabla Guru', 2),
        ('Strings & Winds','Violin Guru', 1), ('Strings & Winds','Flute Guru', 2),
        ('Administration','Office Executive', 1), ('Administration','Accounts Officer', 2)
     ) as s(dept_name, name, sort_order)
join lateral (
  select id from public.category_level_values
  where category_key='staff' and lower(name)=lower(s.dept_name)
    and parent_id is not null limit 1) dept on true
where dept.id is not null
  and not exists (
    select 1 from public.category_level_values c
    where c.category_key='staff' and c.parent_id = dept.id and lower(c.name)=lower(s.name));

-- ── 3. Programmes = disciplines (Academic Master) ───────────────────────────
-- One row per programme/stream. Each is a plain record, editable/deletable.

-- Category row (UG/PG/Diploma/Certificate) — mirrors the curriculum editor.
insert into public.program_categories (name, sort_order) values
  ('UG', 1), ('PG', 2), ('Diploma', 3), ('Certificate', 4)
on conflict (name) do nothing;

insert into public.disciplines (name, description, structure_mode, year_count, category_id, period_minutes) values
  ('Bachelor of Performing Arts — Bharatanatyam',   'UG BPA — Bharatanatyam stream, semester-based.', 'semester', 3, (select id from public.program_categories where name='UG'), 45),
  ('Bachelor of Performing Arts — Carnatic Vocal',  'UG BPA — Carnatic vocal stream, semester-based.', 'semester', 3, (select id from public.program_categories where name='UG'), 45),
  ('BPA — Carnatic Violin',                         'UG BPA — Carnatic violin stream, semester-based.', 'semester', 3, (select id from public.program_categories where name='UG'), 45),
  ('BPA — Mridangam',                               'UG BPA — Mridangam stream, semester-based.',      'semester', 3, (select id from public.program_categories where name='UG'), 45),
  ('Master of Performing Arts — Bharatanatyam',     'PG MPA — Bharatanatyam stream, semester-based.',  'semester', 2, (select id from public.program_categories where name='PG'), 45),
  ('Master of Performing Arts — Carnatic Vocal',    'PG MPA — Carnatic vocal stream, semester-based.', 'semester', 2, (select id from public.program_categories where name='PG'), 45),
  ('PG — Carnatic Flute',                           'PG MPA — Carnatic flute stream, semester-based.',  'semester', 2, (select id from public.program_categories where name='PG'), 45),
  ('Diploma in Carnatic Vocal',                     'Diploma course, yearly basis.',        'yearly', 2, (select id from public.program_categories where name='Diploma'), 45),
  ('Diploma in Tabla',                              'Diploma course, yearly basis.',        'yearly', 2, (select id from public.program_categories where name='Diploma'), 45),
  ('Diploma in Hindustani Instrumental',            'Diploma course, yearly basis.',        'yearly', 2, (select id from public.program_categories where name='Diploma'), 45),
  ('Certificate in Hindustani Flute — intro',       'Short certificate course (few months).', 'yearly', 1, (select id from public.program_categories where name='Certificate'), 45)
on conflict (name) do nothing;

-- ── 4. ACADEMIC YEAR + TERMS ────────────────────────────────────────────────
insert into public.academic_years (label, start_date, end_date, is_current) values
  ('2026-27', '2026-06-01', '2027-04-30', true)
on conflict (label) do nothing;

insert into public.terms (academic_year_id, name, sequence, start_date, end_date)
select a.id, t.name, t.seq, t.sd::date, t.ed::date
from public.academic_years a,
     (values
        ('Fall Semester 2026', 1, '2026-06-01', '2026-10-31'),
        ('Spring Semester 2027', 2, '2026-11-01', '2027-04-30')) as t(name, seq, sd, ed)
where a.label = '2026-27'
  and not exists (
    select 1 from public.terms x where x.academic_year_id = a.id and x.name = t.name);

-- ── 5. USERS (Super Admin "Add User" — data rows, all editable/deletable) ──
-- NOTE: each user must ALSO exist in supabase auth.users (created by the portal
-- with a temp password + first-login OTP). Seed the portal records here; a real
-- login needs the matching auth row (see CLEANUP note, section 9).
insert into public.users
  (email, name, role_key, status, phone, employee_id, roll_no, designation, level_values, program_id, date_of_joining, year_of_commencement, must_change_password)
values
  -- Staff
  ('admin@ndg.example', 'Rukmini Venkat', 'admin', 'active', '9840000001', 'NDG-001',
   null, null, jsonb_build_object(), null, '2024-06-01', null, false),
  ('guru.carnatic@ndg.example', 'Kalaimamani Srinivasa Rao', 'teaching_faculty', 'active', '9840000002', 'NDG-002',
   null, 'Guru', jsonb_build_object('department','Carnatic Music','designation','Guru'), null, '2019-06-01', null, false),
  ('guru.mridangam@ndg.example', 'M. Subramania Pillai', 'teaching_faculty', 'active', '9840000003', 'NDG-003',
   null, 'Mridangam Guru', jsonb_build_object('department','Percussion','designation','Mridangam Guru'), null, '2018-05-15', null, false),
  ('office@ndg.example', 'Meenakshi Iyer', 'non_teaching_faculty', 'active', '9840000004', 'NDG-004',
   null, 'Office Executive', jsonb_build_object('department','Administration','designation','Office Executive'), null, '2022-08-01', null, false),
  ('guest.tabla@ndg.example', 'Ustad Farid Khan', 'guest_faculty', 'active', '9840000005', 'NDG-005',
   null, 'Tabla Guru', jsonb_build_object('department','Percussion','designation','Tabla Guru'), null, null, null, false),
  -- Students (University UG/PG - semester)
  ('stu.bha.2026@ndg.example', 'Ananya Srinivasan', 'student', 'active', '9900000001',
   null, '2026BPA01', null, jsonb_build_object('course','BPA – Bharatanatyam'),
   (select id from public.disciplines where name='Bachelor of Performing Arts — Bharatanatyam'), null, 2026, false),
  ('stu.cv.2026@ndg.example', 'Karthik Iyer', 'student', 'active', '9900000002',
   null, '2026BPA02', null, jsonb_build_object('course','BPA – Carnatic Vocal'),
   (select id from public.disciplines where name='Bachelor of Performing Arts — Carnatic Vocal'), null, 2026, false),
  ('stu.mpa.bha@ndg.example', 'Divya Sundaram', 'student', 'active', '9900000003',
   null, '2025MPA01', null, jsonb_build_object('course','MPA – Bharatanatyam'),
   (select id from public.disciplines where name='Master of Performing Arts — Bharatanatyam'), null, 2025, false),
  -- Student (Diploma - yearly)
  ('stu.diploma@ndg.example', 'Varun Krishnan', 'student', 'active', '9900000004',
   null, '2026DIP01', null, jsonb_build_object('course','Diploma in Carnatic Vocal'),
   (select id from public.disciplines where name='Diploma in Carnatic Vocal'), null, 2026, false)
on conflict (email) do update set status = excluded.status, role_key = excluded.role_key, program_id = excluded.program_id;

-- ── 6. BATCHES + ENROLLMENTS ────────────────────────────────────────────────
insert into public.batches (name, discipline_id, level, faculty_id, capacity, status)
select 'BPA Bharatanatyam – Batch of 2029', d.id, 'Year 1', u.id, 20, 'active'
from public.disciplines d
cross join public.users u
where d.name = 'Bachelor of Performing Arts — Bharatanatyam'
  and u.email = 'guru.carnatic@ndg.example'
  and not exists (select 1 from public.batches b where b.name = 'BPA Bharatanatyam – Batch of 2029');

insert into public.batches (name, discipline_id, level, faculty_id, capacity, status)
select 'BPA Carnatic Vocal – Batch of 2029', d.id, 'Year 1', u.id, 20, 'active'
from public.disciplines d
cross join public.users u
where d.name = 'Bachelor of Performing Arts — Carnatic Vocal'
  and u.email = 'guru.carnatic@ndg.example'
  and not exists (select 1 from public.batches b where b.name = 'BPA Carnatic Vocal – Batch of 2029');

insert into public.batches (name, discipline_id, level, faculty_id, capacity, status)
select 'MPA Bharatanatyam – Batch of 2028', d.id, 'Year 1', u.id, 15, 'active'
from public.disciplines d
cross join public.users u
where d.name = 'Master of Performing Arts — Bharatanatyam'
  and u.email = 'guru.carnatic@ndg.example'
  and not exists (select 1 from public.batches b where b.name = 'MPA Bharatanatyam – Batch of 2028');

insert into public.batches (name, discipline_id, level, faculty_id, capacity, status)
select 'Diploma Carnatic Vocal – 2026-27', d.id, 'Year 1', u.id, 20, 'active'
from public.disciplines d
cross join public.users u
where d.name = 'Diploma in Carnatic Vocal'
  and u.email = 'guru.carnatic@ndg.example'
  and not exists (select 1 from public.batches b where b.name = 'Diploma Carnatic Vocal – 2026-27');

-- Enroll each sample student into their programme's batch
insert into public.enrollments (student_id, batch_id, status)
select stu.id, b.id, 'enrolled'
from public.users stu
join public.batches b on b.discipline_id = stu.program_id
where stu.role_key = 'student'
on conflict (student_id, batch_id) do nothing;

-- ── 7. COURSES + OFFERINGS + FACULTY TEAM ───────────────────────────────────
insert into public.courses (discipline_id, semester, code, name, type, credits, teaching_hours, cie_marks, see_marks)
select
  d.id, 'Semester I', 'BPA-BVN-101', 'Bharatanatyam Foundations – I', 'DSC', 6, 90, 50, 50
from public.disciplines d
where d.name = 'Bachelor of Performing Arts — Bharatanatyam'
on conflict (code) do nothing;

insert into public.courses (discipline_id, semester, code, name, type, credits, teaching_hours, cie_marks, see_marks)
select
  d.id, 'Semester I', 'BPA-CV-101', 'Carnatic Vocal Theory – I', 'DSC', 6, 90, 50, 50
from public.disciplines d
where d.name = 'Bachelor of Performing Arts — Carnatic Vocal'
on conflict (code) do nothing;

insert into public.courses (discipline_id, semester, code, name, type, credits, teaching_hours, cie_marks, see_marks)
select
  d.id, 'Semester I', 'MPA-BHA-501', 'Advanced Bharatanatyam – I', 'DSC', 6, 90, 50, 50
from public.disciplines d
where d.name = 'Master of Performing Arts — Bharatanatyam'
on conflict (code) do nothing;

-- Offer the Fall-semester courses to the right batches (lead teacher + teaching team).
insert into public.course_offerings (course_id, term_id, batch_id, faculty_id, status, capacity, notes)
select c.id, t.id, b.id, s.id, 'planned', 20, 'Sample offering'
from public.courses c
cross join public.terms t
cross join public.batches b
cross join public.users s
where c.code = 'BPA-BVN-101'
  and t.name = 'Fall Semester 2026'
  and b.name = 'BPA Bharatanatyam – Batch of 2029'
  and s.email = 'guru.carnatic@ndg.example'
on conflict (course_id, term_id, batch_id) where batch_id is not null do nothing;

insert into public.course_offerings (course_id, term_id, batch_id, faculty_id, status, capacity, notes)
select c.id, t.id, b.id, s.id, 'planned', 20, 'Sample offering'
from public.courses c
cross join public.terms t
cross join public.batches b
cross join public.users s
where c.code = 'BPA-CV-101'
  and t.name = 'Fall Semester 2026'
  and b.name = 'BPA Carnatic Vocal – Batch of 2029'
  and s.email = 'guru.carnatic@ndg.example'
on conflict (course_id, term_id, batch_id) where batch_id is not null do nothing;

insert into public.course_offerings (course_id, term_id, batch_id, faculty_id, status, capacity, notes)
select c.id, t.id, b.id, s.id, 'planned', 15, 'Sample offering'
from public.courses c
cross join public.terms t
cross join public.batches b
cross join public.users s
where c.code = 'MPA-BHA-501'
  and t.name = 'Fall Semester 2026'
  and b.name = 'MPA Bharatanatyam – Batch of 2028'
  and s.email = 'guru.carnatic@ndg.example'
on conflict (course_id, term_id, batch_id) where batch_id is not null do nothing;

-- Faculty team: the offering's faculty_id is the lead guru; these rows add the
-- team — mridangam guru accompanies the Bharatanatyam class, and a guest tabla
-- guru teaches a percussion workshop inside the Carnatic Vocal offering.
insert into public.faculty_assignments (course_offering_id, user_id, role, is_lead, status, start_date, notes)
select o.id, s.id, 'accompanist', false, 'active', '2026-06-01', 'Mridangam support'
from public.course_offerings o
cross join public.users s
where o.course_id = (select id from public.courses where code = 'BPA-BVN-101')
  and s.email = 'guru.mridangam@ndg.example'
on conflict (course_offering_id, user_id, role) do nothing;

insert into public.faculty_assignments (course_offering_id, user_id, role, is_lead, status, start_date, notes)
select o.id, s.id, 'guest_guru', false, 'active', '2026-06-01', 'Guest tabla workshop'
from public.course_offerings o
cross join public.users s
where o.course_id = (select id from public.courses where code = 'BPA-CV-101')
  and s.email = 'guest.tabla@ndg.example'
on conflict (course_offering_id, user_id, role) do nothing;

-- ── 8. PERMISSIONS FOR SAMPLE ROLES (portal-managed; these just bootstrap) ──
-- module_keys are the exact panel keys (sidebar + server table-mapped keys,
-- matching the super_admin seed in supabase-roles-migration.sql). No row = the
-- module stays hidden for that role. Edit freely in the portal.
insert into public.role_permissions (role_key, module_key, access_level) values
  -- Administrator
  ('admin','overview','View'),        ('admin','users','Manage'),
  ('admin','curriculum','Manage'),    ('admin','batches','Manage'),
  ('admin','timetable','Manage'),     ('admin','lessonplans','Manage'),
  ('admin','liveclasses','Manage'),   ('admin','assignments','Manage'),
  ('admin','feedback','Manage'),      ('admin','events','Manage'),
  ('admin','jobs','Manage'),          ('admin','enquiries','Manage'),
  ('admin','performances','Manage'),  ('admin','lms','Manage'),
  ('admin','organisation','Manage'),  ('admin','admissions','Manage'),
  ('admin','documents','Manage'),     ('admin','media','Manage'),
  ('admin','notifications','Manage'), ('admin','finance','Manage'),
  ('admin','hr','Manage'),            ('admin','teachinglogs','Manage'),
  ('admin','assessment','Manage'),
  ('admin','attendance','Manage'),    ('admin','results','Manage'),
  -- Teaching faculty — runs classes, marks attendance/grades, uploads resources.
  ('teaching_faculty','overview','View'), ('teaching_faculty','curriculum','View'),
  ('teaching_faculty','batches','View'),  ('teaching_faculty','timetable','View'),
  ('teaching_faculty','lessonplans','Manage'), ('teaching_faculty','liveclasses','Manage'),
  ('teaching_faculty','assignments','Manage'), ('teaching_faculty','feedback','Manage'),
  ('teaching_faculty','performances','Manage'), ('teaching_faculty','lms','Manage'),
  ('teaching_faculty','teachinglogs','Manage'), ('teaching_faculty','assessment','Manage'),
  ('teaching_faculty','attendance','Manage'),  ('teaching_faculty','results','Manage'),
  ('teaching_faculty','events','View'), ('teaching_faculty','documents','View'),
  ('teaching_faculty','notifications','View'),
  -- Non-teaching faculty — front-office + documents + enquiries.
  ('non_teaching_faculty','overview','View'), ('non_teaching_faculty','curriculum','View'),
  ('non_teaching_faculty','batches','View'), ('non_teaching_faculty','timetable','View'),
  ('non_teaching_faculty','events','Manage'), ('non_teaching_faculty','enquiries','Manage'),
  ('non_teaching_faculty','jobs','Manage'), ('non_teaching_faculty','documents','Manage'),
  ('non_teaching_faculty','notifications','View'),
  -- Guest faculty — read-only view + submit observation feedback.
  ('guest_faculty','overview','View'), ('guest_faculty','lms','View'),
  ('guest_faculty','lessonplans','View'), ('guest_faculty','liveclasses','View'),
  ('guest_faculty','assignments','View'), ('guest_faculty','feedback','Submits'),
  ('guest_faculty','performances','View'), ('guest_faculty','events','View'),
  ('guest_faculty','notifications','View'),
  -- Student — personal view + classroom read (Self/Own scoping drives rows).
  ('student','overview','View'), ('student','lms','View'), ('student','assignments','View'),
  ('student','feedback','View'), ('student','performances','View'),
  ('student','assessment','Self'), ('student','events','View'),
  ('student','attendance','View'), ('student','results','Self'),
  ('student','documents','View'), ('student','notifications','View')
on conflict (role_key, module_key) do nothing;

-- ── 9. CLEANUP (run only when testing done) ─────────────────────────────────
-- Deletes the sample rows above, leaving super_admin and the schema intact.
-- Use AFTER removing the matching auth.users rows (the portal UI deletes users
-- via the Users screen which removes both the auth row and this profile row).
-- -- delete from public.faculty_assignments where notes in ('Mridangam support','Guest tabla workshop');
-- -- delete from public.course_offerings where notes = 'Sample offering';
-- -- delete from public.courses where code in ('BPA-BVN-101','BPA-CV-101','MPA-BHA-501');
-- -- delete from public.enrollments where student_id in (
-- --   select id from public.users where email like '%@ndg.example');
-- -- delete from public.batches where name like '%- 2029' or name like '%- 2028' or name like '%- 2026-27';
-- -- delete from public.users where email like '%@ndg.example';
-- -- delete from public.disciplines where name like 'BPA%' or name like 'MPA%' or name like 'Diploma%' or name like 'Certificate%';