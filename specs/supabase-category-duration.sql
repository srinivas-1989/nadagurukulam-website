-- Category duration — decide duration per UG/PG/Certificate/Diploma category
-- Idempotent
alter table public.program_categories add column if not exists duration_value int check (duration_value >= 1 and duration_value <= 99);
alter table public.program_categories add column if not exists duration_unit text check (duration_unit in ('years','months','semesters','weeks'));
-- normalize existing nulls: leave null until set in UI
