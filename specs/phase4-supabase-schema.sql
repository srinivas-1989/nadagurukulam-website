-- ============================================================================
-- NADA GURUKULAM — SUPABASE POSTGRESQL DATABASE SCHEMA (PHASE 4 + ALL MODULES)
-- Run this complete script in the Supabase SQL Editor.
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. ROLES & USERS
create table if not exists public.roles (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  name text not null,
  description text
);

create table if not exists public.users (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  name text not null,
  role_key text references public.roles(key) not null,
  status text default 'active' check (status in ('active', 'inactive')),
  phone text,
  custom_permissions jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed default roles
insert into public.roles (key, name, description) values
  ('super_admin', 'Super Admin', 'Everything — all modules, creates all accounts.'),
  ('admin', 'Admin', 'Day-to-day operations; cannot create Admin/Super Admin.'),
  ('teacher', 'Teacher', 'Own batches: lesson plans, live classes, assignments.'),
  ('guest_faculty', 'Guest Faculty', 'Scoped specifically to assigned sessions.'),
  ('staff', 'Staff', 'Enquiries, Jobs, Events, Activities.'),
  ('student', 'Student', 'Portal for timetable, assignments, live classes.')
on conflict (key) do nothing;


-- 2. ACADEMIC STRUCTURE
create table if not exists public.disciplines (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  description text,
  levels text,
  lead_faculty_id uuid references public.users(id),
  syllabus_content_id text
);

create table if not exists public.batches (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  level text not null,
  faculty_id uuid references public.users(id),
  capacity int default 20,
  status text default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.batch_faculty (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  faculty_id uuid references public.users(id) on delete cascade not null,
  role text default 'primary'
);

create table if not exists public.enrollments (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  batch_id uuid references public.batches(id) on delete cascade not null,
  status text default 'enrolled' check (status in ('enrolled', 'completed', 'dropped')),
  enrolled_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(student_id, batch_id)
);


-- 3. SCHEDULING, LIVE CLASSES & ACADEMIC WORKFLOW
create table if not exists public.timetable_slots (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  day_of_week text not null check (day_of_week in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_time time not null,
  end_time time not null,
  room text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.live_sessions (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  title text not null,
  room_name text unique not null,
  session_date date not null,
  start_time time not null,
  status text default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.session_attendance (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.live_sessions(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  status text default 'present' check (status in ('present', 'absent', 'late')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  left_at timestamp with time zone
);

create table if not exists public.lesson_plans (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  subject text not null,
  session_date date not null,
  objectives text,
  status text default 'draft' check (status in ('draft', 'submitted', 'approved', 'needs_revision')),
  review_comments text,
  author_id uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.assignments (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  title text not null,
  type text default 'audio_video' check (type in ('audio_video', 'file', 'text')),
  due_date date not null,
  description text,
  status text default 'open' check (status in ('open', 'closed', 'graded')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.feedback (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  recipient text not null,
  author text not null,
  comment text not null,
  date date default CURRENT_DATE,
  type text default 'faculty_to_student',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.activities (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  title text not null,
  category text default 'Performance',
  date date not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- 4. DOCUMENTS & SENSITIVE STORAGE
create table if not exists public.documents (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  file_path text not null,
  file_type text,
  file_size int,
  visibility text default 'students' check (visibility in ('public', 'students', 'staff', 'private')),
  is_sensitive boolean default false,
  uploader_id uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.document_access_log (
  id uuid default uuid_generate_v4() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  accessor_id uuid references public.users(id) not null,
  accessed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  action text not null check (action in ('view', 'download')),
  ip_address text
);


-- 5. PUBLIC ENGAGEMENT & ENQUIRIES
create table if not exists public.events (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  date date not null,
  venue text not null,
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  author_id uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.event_rsvps (
  id uuid default uuid_generate_v4() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  name text not null,
  email text not null,
  phone text,
  status text default 'confirmed',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.jobs (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  department text not null,
  type text default 'Full-time',
  description text,
  status text default 'draft' check (status in ('draft', 'published', 'closed')),
  author_id uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.job_applicants (
  id uuid default uuid_generate_v4() primary key,
  job_id uuid references public.jobs(id) on delete cascade not null,
  name text not null,
  email text not null,
  phone text,
  resume_doc_id uuid references public.documents(id),
  status text default 'applied' check (status in ('applied', 'shortlisted', 'hired', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.enquiries (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  contact text not null,
  type text not null check (type in ('admission', 'general')),
  message text,
  status text default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================================
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.disciplines enable row level security;
alter table public.batches enable row level security;
alter table public.batch_faculty enable row level security;
alter table public.enrollments enable row level security;
alter table public.timetable_slots enable row level security;
alter table public.live_sessions enable row level security;
alter table public.session_attendance enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.assignments enable row level security;
alter table public.feedback enable row level security;
alter table public.activities enable row level security;
alter table public.documents enable row level security;
alter table public.document_access_log enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.jobs enable row level security;
alter table public.job_applicants enable row level security;
alter table public.enquiries enable row level security;
