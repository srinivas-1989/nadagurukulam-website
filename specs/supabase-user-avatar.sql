-- Self-service profile picture. Stored as an object key in the existing
-- "attachments" storage bucket; the public URL is what users.avatar_url holds.
-- Idempotent — safe to re-run.
alter table public.users add column if not exists avatar_url text;