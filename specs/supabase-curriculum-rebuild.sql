-- Curriculum rebuild — Program categories, period per program, versioned syllabi,
-- RBT/methodology arrays, topic descriptions.
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

-- ── Program categories (centrally managed, e.g. UG / PG / Diploma) ──────────
create table if not exists public.program_categories (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
insert into public.program_categories (name, sort_order) values
  ('UG', 1),
  ('PG', 2)
on conflict (name) do nothing;

alter table public.program_categories enable row level security;
drop policy if exists "Program categories readable by all authenticated" on public.program_categories;
create policy "Program categories readable by all authenticated"
  on public.program_categories for select to authenticated using (true);
drop policy if exists "Curriculum managers manage program categories" on public.program_categories;
create policy "Curriculum managers manage program categories"
  on public.program_categories for all to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

-- ── Disciplines — category + period config ──────────────────────────────────
alter table public.disciplines add column if not exists category_id uuid references public.program_categories(id) on delete set null;
create index if not exists disciplines_category_id_idx on public.disciplines(category_id) where category_id is not null;

alter table public.disciplines add column if not exists period_minutes int default 45 check (period_minutes between 10 and 120);
alter table public.disciplines add column if not exists period_effective_from date;

-- ── Course syllabi — versioned per course (auto-increment + academic year) ──
create table if not exists public.course_syllabi (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  version_number int not null check (version_number >= 1),
  academic_year text not null, -- e.g. 2024-25
  status text default 'draft' check (status in ('draft','published','archived')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(course_id, version_number)
);
create index if not exists course_syllabi_course_id_idx on public.course_syllabi(course_id);
create index if not exists course_syllabi_status_idx on public.course_syllabi(status);

alter table public.course_syllabi enable row level security;
drop policy if exists "Course syllabi readable by all authenticated" on public.course_syllabi;
create policy "Course syllabi readable by all authenticated"
  on public.course_syllabi for select to authenticated using (true);
drop policy if exists "Curriculum managers manage syllabi" on public.course_syllabi;
create policy "Curriculum managers manage syllabi"
  on public.course_syllabi for all to authenticated
  using (public.has_permission('curriculum', array['Full']))
  with check (public.has_permission('curriculum', array['Full']));

-- ── Course modules — syllabus scope + structured arrays ─────────────────────
alter table public.course_modules add column if not exists syllabus_id uuid references public.course_syllabi(id) on delete cascade;
create index if not exists course_modules_syllabus_id_idx on public.course_modules(syllabus_id) where syllabus_id is not null;

alter table public.course_modules add column if not exists rbt_levels jsonb default '[]'::jsonb;
alter table public.course_modules add column if not exists methodology_list jsonb default '[]'::jsonb;

-- ── Module topics — optional description ────────────────────────────────────
alter table public.course_module_topics add column if not exists description text;
