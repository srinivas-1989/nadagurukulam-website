-- Audit trail — records who did what, where, when, and the values before/after.
-- Append-only: rows are never updated or deleted by the application, so the
-- table is read-only to every role except via the backend service_role.
create table if not exists public.audit_log (
  id uuid default uuid_generate_v4() primary key,
  actor_id uuid references public.users(id) on delete set null,
  actor_name text,
  actor_role text,
  action text not null,            -- create, update, delete, login, logout, approve, reject
  entity_type text not null,       -- table or domain name, e.g. 'organisational_units'
  entity_id text,                  -- text: entity ids are not always uuid
  summary text,
  previous_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;

-- Admins can read the trail; nobody writes through the client. Writes come
-- from the backend (service_role), which bypasses RLS.
drop policy if exists "Admins can read audit log" on public.audit_log;
create policy "Admins can read audit log"
  on public.audit_log for select
  to authenticated
  using (public.has_permission('roles', array['Full']));
