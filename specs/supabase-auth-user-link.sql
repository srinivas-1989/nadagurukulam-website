-- ============================================================================
-- AUTH USER LINK — Link Supabase Auth users to public.users table
-- This migration adds auth_user_id to public.users so that Supabase Auth
-- users can be matched to their portal profile.
-- ============================================================================

-- Add auth_user_id column to link Supabase Auth users
alter table public.users add column if not exists auth_user_id uuid references auth.users(id) on delete cascade unique;

-- Create a trigger that automatically links a new Supabase Auth user to a public.users row
-- when the user signs up via the portal (email matches).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- If the user already exists in public.users with matching email, link them
  if exists (select 1 from public.users where email = new.email) then
    update public.users
    set auth_user_id = new.id
    where email = new.email and auth_user_id is null;
  end if;
  return new;
end;
$$;

-- Create the trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Grant the trigger function to authenticated users
grant execute on function public.handle_new_auth_user() to authenticated;
