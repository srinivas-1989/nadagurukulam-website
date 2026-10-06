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
  name text not null,
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists clv_category_idx on public.category_level_values(category_key);
create index if not exists clv_parent_idx on public.category_level_values(parent_id) where parent_id is not null;

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
