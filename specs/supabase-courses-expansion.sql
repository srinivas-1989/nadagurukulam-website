-- Course detail expansion: pedagogy, structured objectives/outcomes, duration aliases,
-- teaching_hours numeric, module topics child table
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

-- ── courses: new / altered columns ───────────────────────────────────────
alter table public.courses add column if not exists cie_duration text;
alter table public.courses add column if not exists see_duration text;
alter table public.courses add column if not exists pedagogy text;
alter table public.courses add column if not exists objectives_json jsonb default '[]'::jsonb;
alter table public.courses add column if not exists outcomes_json jsonb default '[]'::jsonb;

-- Keep examination_hours_cie/see as canonical durations; cie/see_duration are aliases
-- (backend coalesces them). No need to backfill here.

-- teaching_hours: int → numeric(6,2) so 75.00 etc. can be stored exactly
do $$
begin
  alter table public.courses alter column teaching_hours type numeric(6,2) using teaching_hours::numeric(6,2);
exception when others then null;
end $$;

-- ── course_module_topics: multiple topics per module ─────────────────────
create table if not exists public.course_module_topics (
  id uuid default uuid_generate_v4() primary key,
  module_id uuid references public.course_modules(id) on delete cascade not null,
  topic text not null,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.course_module_topics enable row level security;
create index if not exists cmt_module_id_idx on public.course_module_topics(module_id);
