-- User profile expansion: staff/student identifiers, program link, joining dates,
-- role category flag, must_change_password + OTP support
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

-- ── roles: category flag (data, not hardcode) ─────────────────────────────
alter table public.roles add column if not exists category text default 'staff'
  check (category in ('staff','student','both','system'));
update public.roles set category = 'system' where key = 'super_admin' and category = 'staff';

-- ── users: expanded capture ──────────────────────────────────────────────
alter table public.users add column if not exists employee_id text;
alter table public.users add column if not exists roll_no text;
alter table public.users add column if not exists designation text;
alter table public.users add column if not exists program_id uuid references public.disciplines(id) on delete set null;
alter table public.users add column if not exists date_of_joining date;
alter table public.users add column if not exists year_of_commencement int check (year_of_commencement between 2000 and 2100);
alter table public.users add column if not exists must_change_password boolean default false;

create unique index if not exists users_employee_id_idx on public.users(employee_id) where employee_id is not null;
create unique index if not exists users_roll_no_idx on public.users(roll_no) where roll_no is not null;
create index if not exists users_program_id_idx on public.users(program_id) where program_id is not null;

-- ── OTP table ─────────────────────────────────────────────────────────────
create table if not exists public.user_otps (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  otp_code text not null,
  expires_at timestamp with time zone not null,
  consumed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.user_otps enable row level security;
