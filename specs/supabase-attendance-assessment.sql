-- Attendance, Assessment and Results (manual §13, §14, §15)
--
-- Phase 5 of the development manual: "sessions, attendance, rubrics,
-- evaluations, grades, results".
--
-- Three chains, each hanging off a Course Offering:
--   offering → class_session → attendance_record → student      (§13)
--   offering → assessment_plan → assessment → evaluation        (§14)
--   offering → student + evaluation → result                    (§15)
--
-- Manual constraints honoured here:
--  §13 "Attendance should be based on actual Class Sessions rather than a
--        single percentage field" and "Attendance summaries are derived
--        data; the session-level records remain the source of truth." So no
--        percentage column exists anywhere — percentages are computed on read.
--  §13 "Attendance should support Present, Absent, Excused, Late and other
--        configurable states" — hence attendance_states as data, not a CHECK.
--  §14 "Use a generic assessment engine that can support academic and artistic
--        evaluation" and "Rubrics should be data-driven, not coded into the
--        application" — hence rubrics + rubric_criteria rows.
--  §15 "Do not overwrite results. Corrections should create an auditable change
--        record." — results carry a correction log, and publishing is one-way.
--  §36 grading schemes are configurable, so bands live in data, not code.

-- ============================================================================
-- ATTENDANCE (§13)
-- ============================================================================

-- Configurable states. counts_as_present decides whether the state contributes
-- to an attendance percentage; Excused is typically true, Absent false. Late
-- can be true or false per institution, which is exactly why it is a row.
create table if not exists public.attendance_states (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  label text not null,
  counts_as_present boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.attendance_states (key, label, counts_as_present, sort_order) values
  ('present', 'Present', true, 1),
  ('late', 'Late', true, 2),
  ('excused', 'Excused', true, 3),
  ('absent', 'Absent', false, 4)
on conflict (key) do nothing;

-- The session is the record. timetable_slots describe the weekly plan; this
-- describes the one class that actually happened on one date.
create table if not exists public.class_sessions (
  id uuid default uuid_generate_v4() primary key,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  session_date date not null,
  start_time time,
  end_time time,
  taught_by uuid references public.users(id) on delete set null,
  delivery_mode text default 'room' check (delivery_mode in ('room', 'online', 'hybrid')),
  room text,
  meeting_link text,
  topic text,
  session_type text default 'theory',
  status text not null default 'planned' check (status in ('planned', 'held', 'cancelled')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  constraint class_sessions_time_order check (end_time is null or start_time is null or end_time >= start_time)
);

-- One class per offering per start time. start_time is nullable, so the
-- uniqueness is a partial index — a plain unique constraint lets NULLs repeat.
create unique index if not exists class_sessions_offering_date_start_idx
  on public.class_sessions (course_offering_id, session_date, start_time)
  where start_time is not null;

create index if not exists class_sessions_offering_idx on public.class_sessions (course_offering_id);
create index if not exists class_sessions_date_idx on public.class_sessions (session_date);

create table if not exists public.attendance_records (
  id uuid default uuid_generate_v4() primary key,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  state_id uuid not null references public.attendance_states(id) on delete restrict,
  notes text,
  marked_by uuid references public.users(id) on delete set null,
  marked_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Re-marking a student corrects the existing row. Attendance is corrected far
-- more often than a student changes, so a second row per pair is always wrong.
create unique index if not exists attendance_records_session_student_idx
  on public.attendance_records (class_session_id, student_id);

create index if not exists attendance_records_student_idx on public.attendance_records (student_id);
create index if not exists attendance_records_state_idx on public.attendance_records (state_id);

alter table public.attendance_states enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance_records enable row level security;

-- ============================================================================
-- GRADING SCHEMES (§15 / §36)
-- ============================================================================

-- bands: [{"min_percent": 90, "grade": "A+", "grade_point": 10}, ...]
-- A JSON array rather than a band table: bands are always read and graded as a
-- whole set, never joined row-by-row, and the institution edits them as one
-- document in the portal.
create table if not exists public.grading_schemes (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  scale_max numeric not null default 100 check (scale_max > 0),
  passing_percent numeric not null default 40 check (passing_percent >= 0 and passing_percent <= scale_max),
  bands jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.rubrics (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  description text,
  is_default boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.rubric_criteria (
  id uuid default uuid_generate_v4() primary key,
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  name text not null,
  description text,
  weight numeric not null default 1 check (weight > 0),
  max_score numeric not null default 10 check (max_score > 0),
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (rubric_id, name)
);

create index if not exists rubric_criteria_rubric_idx on public.rubric_criteria (rubric_id);

alter table public.grading_schemes enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_criteria enable row level security;

-- ============================================================================
-- ASSESSMENT (§14)
-- ============================================================================

-- The weight sheet for one offering in one term. Assessed work hangs off the
-- plan, so changing the split never touches individual assessment rows.
create table if not exists public.assessment_plans (
  id uuid default uuid_generate_v4() primary key,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  name text not null,
  grading_scheme_id uuid references public.grading_schemes(id) on delete set null,
  total_weight numeric not null default 100 check (total_weight > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'locked')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists assessment_plans_offering_idx on public.assessment_plans (course_offering_id);

-- assessment_scope drives which passing rules apply: internal work is usually
-- a proportion of the final, external examinations are not. examination_type_id
-- reuses the existing lookup rather than adding a second one.
create table if not exists public.assessments (
  id uuid default uuid_generate_v4() primary key,
  plan_id uuid not null references public.assessment_plans(id) on delete cascade,
  examination_type_id uuid references public.examination_types(id) on delete set null,
  title text not null,
  description text,
  rubric_id uuid references public.rubrics(id) on delete set null,
  max_marks numeric not null default 100 check (max_marks > 0),
  weight_percent numeric not null default 0 check (weight_percent >= 0),
  assessment_scope text not null default 'internal' check (assessment_scope in ('internal', 'external', 'practical', 'skill')),
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'published', 'open', 'closed', 'evaluated')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists assessments_plan_idx on public.assessments (plan_id);

create table if not exists public.assessment_submissions (
  id uuid default uuid_generate_v4() primary key,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  evidence_url text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'evaluated')),
  submitted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (assessment_id, student_id)
);

create index if not exists assessment_submissions_offering_idx on public.assessment_submissions (course_offering_id);
create index if not exists assessment_submissions_student_idx on public.assessment_submissions (student_id);

-- rubric_scores: {"<rubric_criteria id>": <score>}. The rubric definition is
-- data, so the scores are addressed by criterion id and need no columns of
-- their own when the institution adds or retires a criterion.
create table if not exists public.evaluations (
  id uuid default uuid_generate_v4() primary key,
  submission_id uuid not null references public.assessment_submissions(id) on delete cascade,
  evaluator_id uuid references public.users(id) on delete set null,
  marks_obtained numeric check (marks_obtained is null or marks_obtained >= 0),
  rubric_scores jsonb not null default '{}'::jsonb,
  feedback text,
  evaluated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- One evaluation per submission at a time. Re-evaluating replaces the score
-- and writes a result_correction; it never stacks a second opinion on top.
create unique index if not exists evaluations_submission_idx on public.evaluations (submission_id);
create index if not exists evaluations_evaluator_idx on public.evaluations (evaluator_id);

-- ============================================================================
-- RESULTS (§15)
-- ============================================================================

-- The derived end-of-offering outcome. Written once from the evaluations, then
-- only ever corrected through result_corrections — never silently overwritten.
create table if not exists public.results (
  id uuid default uuid_generate_v4() primary key,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  grading_scheme_id uuid references public.grading_schemes(id) on delete set null,
  obtained_marks numeric,
  maximum_marks numeric,
  percentage numeric check (percentage is null or (percentage >= 0 and percentage <= 100)),
  grade text,
  grade_point numeric,
  outcome text check (outcome in ('pass', 'fail', 'pending')),
  is_published boolean not null default false,
  published_at timestamp with time zone,
  published_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (course_offering_id, student_id)
);

create index if not exists results_student_idx on public.results (student_id);
create index if not exists results_offering_idx on public.results (course_offering_id);

-- "Do not overwrite results. Corrections should create an auditable change
-- record." Every change to a computed or published result lands here.
create table if not exists public.result_corrections (
  id uuid default uuid_generate_v4() primary key,
  result_id uuid not null references public.results(id) on delete cascade,
  reason text not null,
  previous_value jsonb,
  new_value jsonb,
  corrected_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists result_corrections_result_idx on public.result_corrections (result_id);

alter table public.assessment_plans enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_submissions enable row level security;
alter table public.evaluations enable row level security;
alter table public.results enable row level security;
alter table public.result_corrections enable row level security;