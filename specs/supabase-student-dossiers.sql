-- Student Dossiers & Progress Assessments (integrated from Dossiers App)
--
-- Extends Phase 5 & 6 with structured monthly/periodic student appraisal dossiers,
-- evaluation blueprints, sections, questions, and weighted scoring.

create table if not exists public.evaluation_blueprints (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  is_deleted boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.evaluation_sections (
  id uuid default uuid_generate_v4() primary key,
  blueprint_id uuid not null references public.evaluation_blueprints(id) on delete cascade,
  title text not null,
  "order" integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists eval_sections_blueprint_idx on public.evaluation_sections(blueprint_id);

create table if not exists public.evaluation_questions (
  id uuid default uuid_generate_v4() primary key,
  section_id uuid not null references public.evaluation_sections(id) on delete cascade,
  title text not null,
  field_type text not null default 'symbolic_scale',
  meta_config jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists eval_questions_section_idx on public.evaluation_questions(section_id);

create table if not exists public.student_assessments (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid not null references public.users(id) on delete cascade,
  month text not null, -- e.g. '2026-10'
  blueprint_id uuid references public.evaluation_blueprints(id) on delete set null,
  blueprint_snapshot jsonb not null default '{}'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  files jsonb not null default '{}'::jsonb,
  status_state text not null default 'draft' check (status_state in ('draft', 'submitted', 'in_review', 'finalized', 'reviewed')),
  flags jsonb not null default '{}'::jsonb,
  section_last_edit jsonb not null default '{}'::jsonb,
  dossier_history jsonb not null default '[]'::jsonb,
  dossier_last jsonb not null default '{}'::jsonb,
  submitted_by jsonb,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (student_id, month)
);

create index if not exists student_assessments_student_idx on public.student_assessments(student_id);
create index if not exists student_assessments_month_idx on public.student_assessments(month);

alter table public.evaluation_blueprints enable row level security;
alter table public.evaluation_sections enable row level security;
alter table public.evaluation_questions enable row level security;
alter table public.student_assessments enable row level security;
