-- Guru, Mentor and Advisor Relationships (manual §11)
-- "Make mentoring explicit. Student may have a Guru, Academic Mentor,
--  Course Faculty, Hostel Mentor and other advisors. These are separate
--  relationship types.
--  Use a Student Relationship table with relationship type, person,
--  start date, end date, scope and status. This preserves history when
--  mentors change.
--  Guru–Shishya relationships can support progress notes, mentor assessments
--  and student development records without being confused with course
--  teaching assignments."

create table if not exists public.student_relationships (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid not null references public.users(id) on delete cascade,
  mentor_id uuid not null references public.users(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'guru',
    'academic_mentor',
    'course_faculty',
    'hostel_mentor',
    'advisor'
  )),
  status text not null default 'active' check (status in ('active', 'suspended', 'ended')),
  scope text default 'institutional' check (scope in ('institutional', 'campus', 'department', 'course', 'assigned')),
  start_date date not null default current_date,
  end_date date,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  constraint student_relationships_date_order check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.mentor_progress_notes (
  id uuid default uuid_generate_v4() primary key,
  relationship_id uuid not null references public.student_relationships(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  note_date date not null default current_date,
  title text not null,
  content text not null,
  is_confidential boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists student_relationships_student_idx on public.student_relationships(student_id);
create index if not exists student_relationships_mentor_idx on public.student_relationships(mentor_id);
create index if not exists mentor_progress_notes_rel_idx on public.mentor_progress_notes(relationship_id);

alter table public.student_relationships enable row level security;
alter table public.mentor_progress_notes enable row level security;
