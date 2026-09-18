-- Add profile and KYC fields to public.users
alter table public.users
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists profile_pic_url text,
  add column if not exists date_of_birth date,
  add column if not exists blood_group text,
  add column if not exists alternate_email text,
  add column if not exists correspondence_address text,
  add column if not exists permanent_address text,
  add column if not exists is_active boolean default true;

-- Create user_kyc_docs table
create table if not exists public.user_kyc_docs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  doc_type text not null check (doc_type in ('aadhar', 'pan', 'voter_id', 'passport')),
  doc_number text not null,
  file_url text not null,
  created_at timestamptz default now()
);

-- RLS policies for user_kyc_docs
alter table public.user_kyc_docs enable row level security;

create policy "Users can view their own KYC docs or admins can view all"
  on public.user_kyc_docs for select
  using (
    auth.uid() in (select auth_user_id from public.users where id = user_kyc_docs.user_id)
    or exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid() and rp.module_key = 'users' and rp.access_level in ('Manage', 'Full')
    )
  );

create policy "Users or admins can insert KYC docs"
  on public.user_kyc_docs for insert
  with check (
    auth.uid() in (select auth_user_id from public.users where id = user_kyc_docs.user_id)
    or exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid() and rp.module_key = 'users' and rp.access_level in ('Manage', 'Full')
    )
  );

create policy "Admins can delete KYC docs"
  on public.user_kyc_docs for delete
  using (
    exists (
      select 1 from public.users u
      join public.role_permissions rp on rp.role_key = u.role_key
      where u.auth_user_id = auth.uid() and rp.module_key = 'users' and rp.access_level in ('Manage', 'Full')
    )
  );
