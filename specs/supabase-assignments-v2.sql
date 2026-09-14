-- Assignments v2: course-linked + per-student lifecycle + grading
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

-- ── assignments: richer spec fields ───────────────────────────────────────
alter table public.assignments add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.assignments add column if not exists module_id uuid references public.course_modules(id) on delete set null;
alter table public.assignments add column if not exists topic_id uuid references public.course_module_topics(id) on delete set null;
alter table public.assignments add column if not exists topic_text text;
alter table public.assignments add column if not exists attachment_url text;
alter table public.assignments add column if not exists created_by uuid references public.users(id);
create index if not exists assignments_course_idx on public.assignments(course_id) where course_id is not null;
create index if not exists assignments_batch_idx on public.assignments(batch_id);
create index if not exists assignments_created_by_idx on public.assignments(created_by) where created_by is not null;

-- ── assignment_submissions: started → submitted → graded (late derived) ──
-- ponytail: 1 row per (assignment, student). Notifications deferred — UI badge = new assignments not yet started.
create table if not exists public.assignment_submissions (
  id uuid default uuid_generate_v4() primary key,
  assignment_id uuid references public.assignments(id) on delete cascade not null,
  batch_id uuid references public.batches(id) on delete cascade not null,
  student_id uuid references public.users(id) on delete cascade not null,
  status text default 'started' check (status in ('started','submitted','graded')),
  submitted_at timestamp with time zone,
  grade text,
  feedback text,
  attachment_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(assignment_id, student_id)
);
create index if not exists assignment_submissions_assignment_idx on public.assignment_submissions(assignment_id);
create index if not exists assignment_submissions_student_idx on public.assignment_submissions(student_id);
create index if not exists assignment_submissions_batch_idx on public.assignment_submissions(batch_id);
alter table public.assignment_submissions enable row level security;
