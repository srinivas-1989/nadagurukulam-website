-- 1. User Categories master table (Staff, Student, Administration Category, + custom categories)
create table if not exists public.user_categories (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  name text not null,
  hierarchy_type text not null default 'role_designation' check (hierarchy_type in ('role_designation', 'course')),
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.user_categories (key, name, hierarchy_type, sort_order) values
  ('staff', 'Staff', 'role_designation', 10),
  ('student', 'Student', 'course', 20),
  ('administration', 'Administration', 'role_designation', 30)
on conflict (key) do update set name = EXCLUDED.name, hierarchy_type = EXCLUDED.hierarchy_type;

alter table public.user_categories enable row level security;

drop policy if exists "Authenticated users read user_categories" on public.user_categories;
create policy "Authenticated users read user_categories"
  on public.user_categories for select to authenticated
  using (true);

drop policy if exists "Super admin manage user_categories" on public.user_categories;
create policy "Super admin manage user_categories"
  on public.user_categories for all to authenticated
  using (
    exists (
      select 1 from public.users
      where users.auth_user_id = public.my_user_id()
      and users.role_key = 'super_admin'
    )
  );

-- 2. Designations master table, scoped to the category that owns it
create table if not exists public.designations (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  category_key text references public.user_categories(key) on update cascade on delete restrict default 'staff',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.designations enable row level security;

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

-- 3. Add designation_id FK to users
alter table public.users add column if not exists designation_id uuid references public.designations(id) on delete set null;
create index if not exists users_designation_id_idx on public.users(designation_id) where designation_id is not null;

-- 4. Rename the 'system' category to 'administration', then relax the
--    roles.category check so custom categories can hold roles.
alter table public.roles drop constraint if exists roles_category_check;
update public.roles set category = 'administration' where category = 'system';