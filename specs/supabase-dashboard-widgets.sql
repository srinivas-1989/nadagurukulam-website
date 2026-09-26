-- Per-user overview widget layout. A personal preference, not a module: it is
-- deliberately absent from role_permissions, so it grants no access and does
-- not appear in the sidebar. Idempotent — safe to re-run.
create table if not exists public.dashboard_widgets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  module_key text not null,
  sort_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, module_key)
);
alter table public.dashboard_widgets enable row level security;

drop policy if exists "Own dashboard widgets readable" on public.dashboard_widgets;
create policy "Own dashboard widgets readable"
  on public.dashboard_widgets for select to authenticated
  using (user_id = public.my_user_id());

drop policy if exists "Own dashboard widgets insertable" on public.dashboard_widgets;
create policy "Own dashboard widgets insertable"
  on public.dashboard_widgets for insert to authenticated
  with check (user_id = public.my_user_id());

drop policy if exists "Own dashboard widgets updatable" on public.dashboard_widgets;
create policy "Own dashboard widgets updatable"
  on public.dashboard_widgets for update to authenticated
  using (user_id = public.my_user_id())
  with check (user_id = public.my_user_id());

drop policy if exists "Own dashboard widgets deletable" on public.dashboard_widgets;
create policy "Own dashboard widgets deletable"
  on public.dashboard_widgets for delete to authenticated
  using (user_id = public.my_user_id());

create index if not exists dashboard_widgets_user_sort_idx
  on public.dashboard_widgets(user_id, sort_order);
