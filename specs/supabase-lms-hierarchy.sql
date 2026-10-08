-- LMS Architecture (manual §12 / §24)
-- Learning hierarchy: Course → Module → Lesson → Learning Resources and Activities
-- Reuses public.course_modules as the Module layer.
-- Idempotent — safe re-run via node backend/scripts/apply-schema.js

-- 1. Module layer gains the §12 item metadata
--    (ownership, visibility, publication status, ordering, version, created/updated)
alter table public.course_modules add column if not exists owner_id uuid references public.users(id);
alter table public.course_modules add column if not exists visibility text default 'private' check (visibility in ('private', 'internal', 'public'));
alter table public.course_modules add column if not exists status text default 'draft' check (status in ('draft', 'published', 'archived'));
alter table public.course_modules add column if not exists version int default 1;
alter table public.course_modules add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

-- Ordering backfill: module_number is the existing ordering key
create index if not exists course_modules_course_id_idx on public.course_modules(course_id);

-- 2. Lessons (Module 1:N Lessons)
create table if not exists public.lessons (
  id uuid default uuid_generate_v4() primary key,
  module_id uuid references public.course_modules(id) on delete cascade not null,
  title text not null,
  lesson_number int not null,
  description text,
  owner_id uuid references public.users(id),
  visibility text default 'private' check (visibility in ('private', 'internal', 'public')),
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  version int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Learning resources — §12 types verbatim
create table if not exists public.resources (
  id uuid default uuid_generate_v4() primary key,
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  title text not null,
  type text not null check (type in ('video', 'audio', 'pdf', 'notation', 'image', 'external_link', 'downloadable')),
  url text not null,
  sort_order int default 0,
  owner_id uuid references public.users(id),
  visibility text default 'private' check (visibility in ('private', 'internal', 'public')),
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  version int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Learning activities — §12 types verbatim.
--    Named lesson_activities: public.activities is the co-curricular events table.
create table if not exists public.lesson_activities (
  id uuid default uuid_generate_v4() primary key,
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  title text not null,
  type text not null check (type in ('assignment', 'quiz', 'discussion', 'practice_submission', 'reflection', 'project')),
  sort_order int default 0,
  owner_id uuid references public.users(id),
  visibility text default 'private' check (visibility in ('private', 'internal', 'public')),
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  version int default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Outcome chain: Learning Outcome → Content/Activity → Evidence → Evaluation
create table if not exists public.learning_outcomes (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  code text not null,
  statement text not null,
  bloom_level text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create unique index if not exists learning_outcomes_course_code_idx on public.learning_outcomes(course_id, code);

create table if not exists public.outcome_mappings (
  id uuid default uuid_generate_v4() primary key,
  outcome_id uuid references public.learning_outcomes(id) on delete cascade not null,
  module_id uuid references public.course_modules(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  activity_id uuid references public.lesson_activities(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint outcome_mappings_one_target check (num_nonnulls(module_id, lesson_id, activity_id) = 1)
);

create index if not exists lessons_module_id_idx on public.lessons(module_id);
create index if not exists resources_lesson_id_idx on public.resources(lesson_id);
create index if not exists lesson_activities_lesson_id_idx on public.lesson_activities(lesson_id);
create index if not exists outcome_mappings_outcome_id_idx on public.outcome_mappings(outcome_id);

-- 6. RLS — learner read access to published items, full control for curriculum managers
alter table public.lessons enable row level security;
alter table public.resources enable row level security;
alter table public.lesson_activities enable row level security;
alter table public.learning_outcomes enable row level security;
alter table public.outcome_mappings enable row level security;

drop policy if exists "Curriculum managers manage lessons" on public.lessons;
create policy "Curriculum managers manage lessons"
  on public.lessons for all to authenticated
  using (public.has_permission('lms', array['Full']))
  with check (public.has_permission('lms', array['Full']));

drop policy if exists "Curriculum managers manage resources" on public.resources;
create policy "Curriculum managers manage resources"
  on public.resources for all to authenticated
  using (public.has_permission('lms', array['Full']))
  with check (public.has_permission('lms', array['Full']));

drop policy if exists "Curriculum managers manage lesson activities" on public.lesson_activities;
create policy "Curriculum managers manage lesson activities"
  on public.lesson_activities for all to authenticated
  using (public.has_permission('lms', array['Full']))
  with check (public.has_permission('lms', array['Full']));

drop policy if exists "Curriculum managers manage learning outcomes" on public.learning_outcomes;
create policy "Curriculum managers manage learning outcomes"
  on public.learning_outcomes for all to authenticated
  using (public.has_permission('lms', array['Full']))
  with check (public.has_permission('lms', array['Full']));

drop policy if exists "Curriculum managers manage outcome mappings" on public.outcome_mappings;
create policy "Curriculum managers manage outcome mappings"
  on public.outcome_mappings for all to authenticated
  using (public.has_permission('lms', array['Full']))
  with check (public.has_permission('lms', array['Full']));