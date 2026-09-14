-- Class completion loop: teacher logs what was taught per slot per date,
-- student confirms. Analytics compares taught vs confirmed. Minimal tables.
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

create table if not exists public.class_entries (
  id uuid default uuid_generate_v4() primary key,
  timetable_slot_id uuid references public.timetable_slots(id) on delete cascade not null,
  batch_id uuid references public.batches(id) on delete cascade not null,
  class_date date not null,
  course_id uuid references public.courses(id) on delete set null,
  module_id uuid references public.course_modules(id) on delete set null,
  topic_id uuid references public.course_module_topics(id) on delete set null,
  topic_text text,
  taught_by uuid references public.users(id),
  notes text,
  status text default 'submitted' check (status in ('submitted')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(timetable_slot_id, class_date)
);

create index if not exists class_entries_batch_date_idx on public.class_entries(batch_id, class_date);
create index if not exists class_entries_slot_idx on public.class_entries(timetable_slot_id);
create index if not exists class_entries_course_idx on public.class_entries(course_id) where course_id is not null;
alter table public.class_entries enable row level security;

create table if not exists public.class_confirmations (
  id uuid default uuid_generate_v4() primary key,
  class_entry_id uuid references public.class_entries(id) on delete cascade not null,
  batch_id uuid references public.batches(id) on delete cascade not null,
  student_id uuid references public.users(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending','confirmed','disputed')),
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(class_entry_id, student_id)
);

create index if not exists class_confirmations_entry_idx on public.class_confirmations(class_entry_id);
create index if not exists class_confirmations_student_idx on public.class_confirmations(student_id);
create index if not exists class_confirmations_batch_idx on public.class_confirmations(batch_id);
alter table public.class_confirmations enable row level security;
