-- Dynamic examination types (e.g. Theory / Practical / Viva / Project)
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

create table if not exists public.examination_types (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.examination_types (name) values
  ('Theory'),
  ('Practical'),
  ('Viva'),
  ('Project')
on conflict (name) do nothing;

alter table public.examination_types enable row level security;

-- Add FK column on courses (keep legacy text column during transition)
alter table public.courses add column if not exists examination_type_id uuid references public.examination_types(id) on delete set null;
create index if not exists courses_examination_type_id_idx on public.courses(examination_type_id) where examination_type_id is not null;

-- Backfill: map legacy text values to the new FK
do $$
begin
  update public.courses c
  set examination_type_id = e.id
  from public.examination_types e
  where c.examination_type_id is null
    and c.examination_type is not null
    and lower(trim(c.examination_type)) = lower(e.name);
exception when undefined_column then null;
end $$;
