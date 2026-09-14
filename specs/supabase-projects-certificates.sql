-- Projects & Certificates — student portfolio (phase C)
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

-- ── projects: student-initiated works beyond curriculum ───────────────────
create table if not exists public.projects (
  id uuid default uuid_generate_v4() primary key,
  batch_id uuid references public.batches(id) on delete cascade not null,
  student_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  description text,
  course_id uuid references public.courses(id) on delete set null,
  topic_text text,
  attachment_url text,
  status text default 'active' check (status in ('active','archived')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists projects_batch_idx on public.projects(batch_id);
create index if not exists projects_student_idx on public.projects(student_id);
create index if not exists projects_course_idx on public.projects(course_id) where course_id is not null;
alter table public.projects enable row level security;

-- ── certificates: institutional + external uploads per student ────────────
create table if not exists public.certificates (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  issuer text,
  issue_date date,
  certificate_type text default 'external' check (certificate_type in ('institutional','external')),
  file_url text,
  description text,
  verified boolean default false,
  verified_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists certificates_student_idx on public.certificates(student_id);
create index if not exists certificates_type_idx on public.certificates(certificate_type);
alter table public.certificates enable row level security;

-- ── permission seeds for new modules (super_admin = Full) ─────────────────
insert into public.role_permissions (role_key, module_key, access_level)
select 'super_admin', m, 'Full' from unnest(array['projects','certificates']) as m
on conflict (role_key, module_key) do nothing;
