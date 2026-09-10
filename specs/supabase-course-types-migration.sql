-- Course types are data too: a program level + how many semesters it runs.
-- (Seeded: Masters = 4 semesters, Undergraduate = 6 — Super Admin/Admin can add, edit, delete.)
create table if not exists public.course_types (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  semester_count int not null default 4,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.course_types (name, semester_count) values
  ('Masters', 4),
  ('Undergraduate', 6)
on conflict (name) do nothing;

alter table public.course_types enable row level security;
