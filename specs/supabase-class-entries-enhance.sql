-- Teaching log XLSX columns — extend class_entries so export is a SELECT.
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js
-- ponytail: l/th/p map 1:1 to XLSX cols G/I; period_label snapshots FIXED label at log time so export stable if timetable later edits.
alter table public.class_entries
  add column if not exists is_conducted boolean default true,
  add column if not exists l_count integer default 0 check (l_count >= 0),
  add column if not exists th_count integer default 0 check (th_count >= 0),
  add column if not exists p_count integer default 0 check (p_count >= 0),
  add column if not exists remarks text,
  add column if not exists period_label text;
create index if not exists class_entries_conducted_idx on public.class_entries(is_conducted);
