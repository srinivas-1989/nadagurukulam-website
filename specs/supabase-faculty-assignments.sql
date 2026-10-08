-- Faculty Assignments (manual §10 / §24)
-- "Do not permanently attach Faculty to Course. Use
--  Course Offering → Faculty Assignment → Person/Employee. This supports
--  multiple teachers, guest gurus, accompanists and team teaching."
--
-- course_offerings.faculty_id stays as the lead teacher so existing
-- registration and timetable code keeps working; this table is the full
-- teaching team.

create table if not exists public.faculty_assignments (
  id uuid default uuid_generate_v4() primary key,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text default 'teacher' check (role in (
    'teacher',        -- regular faculty
    'guest_guru',     -- visiting teacher
    'accompanist',    -- harmonium / mridangam support
    'assistant',      -- teaching assistant
    'visiting'        -- guest lecture
  )),
  is_lead boolean default false,
  status text not null default 'active' check (status in ('active', 'replaced', 'ended')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  constraint faculty_assignments_date_order check (end_date is null or start_date is null or end_date >= start_date)
);

-- One person holds one role per offering; re-appointing after being replaced
-- is a status transition on the same row, not a second row.
create unique index if not exists faculty_assignments_offering_user_role_idx
  on public.faculty_assignments (course_offering_id, user_id, role);

create index if not exists faculty_assignments_offering_idx on public.faculty_assignments (course_offering_id);
create index if not exists faculty_assignments_user_idx on public.faculty_assignments (user_id);

alter table public.faculty_assignments enable row level security;