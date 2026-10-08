-- Dossier access control + version history.
--
-- Dossiers are filled by hostel mentors, reviewed by the campus warden and
-- finalised by them. One or two sections are handed to specific academic
-- teachers instead, who must see and edit that section and nothing else.
--
-- Two tables carry that:
--   dossier_section_assignments — narrows a user to named sections. A user who
--     has any assignment row sees ONLY those sections, whatever their role says.
--   student_assessment_versions — every state change keeps a full snapshot, so
--     a wrong or malicious entry can always be walked back.

alter table public.evaluation_sections
  add column if not exists editable_by text[] not null default '{hostel_mentor,campus_incharge}',
  add column if not exists visible_to_parent boolean not null default false;

-- Sections seeded before this column existed carry the old placeholder roles,
-- which match no real role_key and would silently lock every mentor out.
update public.evaluation_sections set editable_by = '{hostel_mentor,campus_incharge}'::text[]
  where editable_by = '{mentor,incharge}'::text[];

alter table public.users
  add column if not exists dossier_blueprint_id uuid references public.evaluation_blueprints(id) on delete set null;

-- Assignment = "this person fills this section". Absence of any row means the
-- person follows their role-based rules instead, so this table only ever
-- narrows access, never grants it by omission.
create table if not exists public.dossier_section_assignments (
  id uuid default uuid_generate_v4() primary key,
  section_id uuid not null references public.evaluation_sections(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  note text,
  assigned_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (section_id, user_id)
);

create index if not exists dossier_section_assignments_user_idx
  on public.dossier_section_assignments (user_id);
create index if not exists dossier_section_assignments_section_idx
  on public.dossier_section_assignments (section_id);

-- Full-fidelity history. `responses`/`files`/`blueprint_snapshot` are copied in
-- whole so a restored version needs nothing else to be readable.
create table if not exists public.student_assessment_versions (
  id uuid default uuid_generate_v4() primary key,
  assessment_id uuid not null references public.student_assessments(id) on delete cascade,
  version_no integer not null,
  from_status text,
  to_status text not null,
  reason text,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (assessment_id, version_no)
);

create index if not exists student_assessment_versions_assessment_idx
  on public.student_assessment_versions (assessment_id);

alter table public.dossier_section_assignments enable row level security;
alter table public.student_assessment_versions enable row level security;