-- Roles & permissions are data. Super Admin is the one fixed anchor role;
-- every other role (and what it can do in each module) is created and edited in the portal.

-- The permission matrix: one row per (role, module). No row = module hidden for that role.
create table if not exists public.role_permissions (
  id uuid default uuid_generate_v4() primary key,
  role_key text references public.roles(key) on delete cascade not null,
  module_key text not null,
  access_level text not null default 'View'
    check (access_level in ('View', 'Self', 'Submits', 'Own', 'Manage', 'Full')),
  unique(role_key, module_key)
);

-- Renaming a role keeps user accounts pointing at it; deleting a role
-- is blocked while users still hold it.
alter table public.users drop constraint if exists users_role_key_fkey;
alter table public.users
  add constraint users_role_key_fkey
  foreign key (role_key) references public.roles(key)
  on update cascade on delete restrict;

-- Super Admin starts with Full access everywhere; new roles start with nothing.
insert into public.role_permissions (role_key, module_key, access_level)
select 'super_admin', m, 'Full' from unnest(array[
  'overview', 'users', 'curriculum', 'timetable', 'batches', 'lessonplans',
  'liveclasses', 'assignments', 'feedback', 'events', 'jobs', 'enquiries',
  'activities', 'roles'
]) as m
on conflict (role_key, module_key) do nothing;

alter table public.role_permissions enable row level security;
