-- Add 'pending' to users status check constraint
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check check (status in ('pending', 'active', 'inactive'));
