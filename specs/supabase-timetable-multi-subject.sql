-- Multi-subject per slot — one row per batch invariant, subjects as JSON array.
-- Idempotent. Backfills from legacy subject.
alter table public.timetable_slots
  add column if not exists subjects jsonb default '[]'::jsonb,
  add column if not exists course_ids uuid[] default '{}';
-- ponytail: jsonb preserves order; course_ids optional link for filtered view. Upgrade to join table when reporting needs FKs.
update public.timetable_slots set subjects = to_jsonb(array[subject]) where subject is not null and subject <> '' and (subjects is null or subjects = '[]'::jsonb);
create index if not exists timetable_subjects_idx on public.timetable_slots using gin (subjects);
