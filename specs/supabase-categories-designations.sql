-- Fully configurable category hierarchies.
--
-- A category declares its own ordered levels, e.g.
--   [{"key":"designation","name":"Designation"},{"key":"department","name":"Department"}]
-- Level 1 is always Role (public.roles) because permissions hang off it; the
-- declared levels are everything below it.
--
-- Every level below Role shares one table, so adding a new level to a category
-- is data, not a migration.

-- 1. Categories carry their ordered levels
create table if not exists public.user_categories (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  name text not null,
  levels jsonb not null default '[]'::jsonb,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Older installs may still have hierarchy_type from the first cut.
alter table public.user_categories add column if not exists levels jsonb not null default '[]'::jsonb;
alter table public.user_categories drop column if exists hierarchy_type;

insert into public.user_categories (key, name, levels, sort_order) values
  ('staff', 'Staff',
     '[{"key":"designation","name":"Designation"}]'::jsonb, 10),
  ('student', 'Student',
     '[{"key":"course","name":"Course"}]'::jsonb, 20),
  ('administration', 'Administration',
     '[{"key":"designation","name":"Designation"}]'::jsonb, 30)
on conflict (key) do update set name = EXCLUDED.name, levels = EXCLUDED.levels;

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

-- 2. One table holds every value below Role, at any depth.
--    parent_id walks deeper levels; role_key anchors a value under a role.
create table if not exists public.category_level_values (
  id uuid default uuid_generate_v4() primary key,
  category_key text not null references public.user_categories(key) on update cascade on delete cascade,
  level_key text not null,
  role_key text references public.roles(key) on update cascade on delete cascade,
  parent_id uuid references public.category_level_values(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists clv_category_level_idx on public.category_level_values(category_key, level_key);
create index if not exists clv_parent_idx on public.category_level_values(parent_id) where parent_id is not null;

-- Same value name may repeat across levels/parents, but not twice in one place.
create unique index if not exists clv_unique_per_parent
  on public.category_level_values (category_key, level_key, coalesce(role_key, ''), coalesce(parent_id::text, ''), lower(name));

alter table public.category_level_values enable row level security;

drop policy if exists "Authenticated users read category_level_values" on public.category_level_values;
create policy "Authenticated users read category_level_values"
  on public.category_level_values for select to authenticated
  using (true);

drop policy if exists "Super admin manage category_level_values" on public.category_level_values;
create policy "Super admin manage category_level_values"
  on public.category_level_values for all to authenticated
  using (
    exists (
      select 1 from public.users
      where users.auth_user_id = public.my_user_id()
      and users.role_key = 'super_admin'
    )
  );

-- 3. Carry the existing designations across, then drop the old table.
alter table public.users add column if not exists level_values jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.designations') is not null then
    insert into public.category_level_values (category_key, level_key, name)
    select d.category_key, 'designation', d.name from public.designations d
    on conflict do nothing;

    update public.users u
    set level_values = u.level_values || jsonb_build_object('designation', d.name)
    from public.designations d
    where d.id = u.designation_id;
  end if;
end $$;

alter table public.users drop constraint if exists users_designation_id_fkey;
alter table public.users drop column if exists designation_id;
drop table if exists public.designations;

-- 4. Rename the 'system' category to 'administration', then relax the
--    roles.category check so custom categories can hold roles.
alter table public.roles drop constraint if exists roles_category_check;
update public.roles set category = 'administration' where category = 'system';