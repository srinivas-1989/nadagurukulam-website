-- Add dynamic Course and Course Module tables to Supabase schema

create table if not exists public.courses (
  id uuid default uuid_generate_v4() primary key,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  semester text not null, -- e.g. 'Semester I', 'Semester II'
  code text unique not null, -- e.g. 'MBNP110'
  name text not null, -- e.g. 'Nritya Marga Purvanga-1'
  type text default 'DSC', -- DSC, SEC, etc.
  credits int default 6,
  teaching_hours int default 90,
  cie_marks int default 50,
  see_marks int default 50,
  objectives text,
  outcomes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.course_modules (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  module_number int not null,
  title text not null,
  hours int,
  methodology text,
  rbt_level text,
  co_mapping text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
