-- Timetable enhancements: room optional + subject/topic per slot
-- ponytail: period_number kept optional; grid derives order from start_time when null.
alter table public.timetable_slots alter column room drop not null;
alter table public.timetable_slots add column if not exists subject text;
alter table public.timetable_slots add column if not exists period_number integer check (period_number between 1 and 12);
create index if not exists timetable_period_idx on public.timetable_slots(period_number);
