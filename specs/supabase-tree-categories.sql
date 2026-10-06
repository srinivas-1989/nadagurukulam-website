-- Clean migration for fully dynamic tree-structured category hierarchy
-- Drop old tables if needed and recreate user_categories and category_level_values with arbitrary parent_id tree support.

drop table if exists public.category_level_values cascade;
drop table if exists public.user_categories cascade;

create table public.user_categories (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  name text not null,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.user_categories (key, name, sort_order) values
  ('staff', 'Staff', 10),
  ('student', 'Student', 20),
  ('administration', 'Administration', 30);

create table public.category_level_values (
  id uuid default uuid_generate_v4() primary key,
  category_key text not null references public.user_categories(key) on update cascade on delete cascade,
  parent_id uuid references public.category_level_values(id) on delete cascade,
  role_key text references public.roles(key) on update cascade on delete set null,
  name text not null,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed the Staff tree the portal is expected to open with. Everything below is
-- plain rows, so the shape changes by editing data rather than by migrating.
-- Role nodes carry role_key because permissions hang off a role; every other
-- node is a plain bucket.
with r as (
  select key as role_key from public.roles where key in ('guest_faculty', 'non_teaching_faculty', 'teaching_faculty')
), roots as (
  insert into public.category_level_values (category_key, parent_id, role_key, name, sort_order)
  select 'staff', null, r.role_key, r.role_key, 100
  from r
  returning id, role_key
), dept as (
  insert into public.category_level_values (category_key, parent_id, role_key, name, sort_order)
  select 'staff', roots.id, null, 'Department', 10
  from roots where roots.role_key = 'teaching_faculty'
  returning id
)
insert into public.category_level_values (category_key, parent_id, role_key, name, sort_order)
select 'staff', dept.id, null, 'Designation', 10 from dept;

create index if not exists clv_category_idx on public.category_level_values(category_key);
create index if not exists clv_parent_idx on public.category_level_values(parent_id) where parent_id is not null;
create index if not exists clv_role_idx on public.category_level_values(role_key) where role_key is not null;

-- Sibling names must be unique within one parent, or the tree reads ambiguously.
create unique index if not exists clv_unique_sibling
  on public.category_level_values (coalesce(parent_id::text, ''), lower(name));

alter table public.user_categories enable row level security;
alter table public.category_level_values enable row level security;

create policy "Authenticated users read user_categories" on public.user_categories for select to authenticated using (true);
create policy "Super admin manage user_categories" on public.user_categories for all to authenticated using (
  exists (select 1 from public.users where users.auth_user_id = public.my_user_id() and users.role_key = 'super_admin')
);

create policy "Authenticated users read category_level_values" on public.category_level_values for select to authenticated using (true);
create policy "Super admin manage category_level_values" on public.category_level_values for all to authenticated using (
  exists (select 1 from public.users where users.auth_user_id = public.my_user_id() and users.role_key = 'super_admin')
);

-- Ensure users table supports tree node path storage or level_values
alter table public.users add column if not exists level_values jsonb not null default '{}'::jsonb;

-- Per-person permission grants. A role grants its baseline (role_permissions);
-- a row here only ever raises that person's level, never lowers it, so a grant
-- is additive. No row = whatever the role already says.
create table if not exists public.user_permissions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  module_key text not null,
  access_level text not null check (access_level in ('View','Self','Submits','Own','Manage','Full')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, module_key)
);

create index if not exists up_user_idx on public.user_permissions(user_id);

alter table public.user_permissions enable row level security;

create policy "Users read own permissions" on public.user_permissions for select to authenticated using (
  exists (select 1 from public.users u where u.id = public.user_permissions.user_id and u.auth_user_id = public.my_user_id())
  or exists (select 1 from public.users u where u.auth_user_id = public.my_user_id() and u.role_key = 'super_admin')
);

create policy "Super admin manage user_permissions" on public.user_permissions for all to authenticated using (
  exists (select 1 from public.users where users.auth_user_id = public.my_user_id() and users.role_key = 'super_admin')
);
