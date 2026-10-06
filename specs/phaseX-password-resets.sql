-- Password reset requests queue table. Idempotent.
create table if not exists public.password_reset_requests (
  id uuid default uuid_generate_v4() primary key,
  email text not null,
  reason text not null,
  status text default 'pending' check (status in ('pending', 'processed', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.password_reset_requests enable row level security;

drop policy if exists "Super admin read password reset requests" on public.password_reset_requests;
create policy "Super admin read password reset requests"
  on public.password_reset_requests for select to authenticated
  using (
    exists (
      select 1 from public.users
      where users.auth_user_id = public.my_user_id()
      and users.role_key = 'super_admin'
    )
  );

drop policy if exists "Super admin modify password reset requests" on public.password_reset_requests;
create policy "Super admin modify password reset requests"
  on public.password_reset_requests for update to authenticated
  using (
    exists (
      select 1 from public.users
      where users.auth_user_id = public.my_user_id()
      and users.role_key = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.auth_user_id = public.my_user_id()
      and users.role_key = 'super_admin'
    )
  );

drop policy if exists "Public insert password reset requests" on public.password_reset_requests;
create policy "Public insert password reset requests"
  on public.password_reset_requests for insert to anon, authenticated
  with check (true);

create index if not exists password_reset_requests_status_idx
  on public.password_reset_requests(status, created_at desc);
