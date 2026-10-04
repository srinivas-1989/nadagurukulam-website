-- Add avatar_initials to users
alter table public.users add column if not exists avatar_initials text;
