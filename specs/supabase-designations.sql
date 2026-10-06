-- Designations master table
create table if not exists public.designations (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.designations enable row level security;

-- Drop existing designation text column and replace with FK
alter table public.users add column if not exists designation_id uuid references public.designations(id) on delete set null;
create index if not exists users_designation_id_idx on public.users(designation_id) where designation_id is not null;

-- Enable RLS for designations
drop policy if exists "Authenticated users read designations" on public.designations;
create policy "Authenticated users read designations"
  on public.designations for select to authenticated
  using (true);

drop policy if exists "Admin manage designations" on public.designations;
create policy "Admin manage designations"
  on public.designations for all to authenticated
  using (
    exists (
      select 1 from public.users
      where users.auth_user_id = public.my_user_id()
      and users.role_key = 'super_admin'
    )
  );
