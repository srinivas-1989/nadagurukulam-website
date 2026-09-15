-- Category duration — per UG/PG/Certificate/Diploma category (years or months only)
-- Idempotent
alter table public.program_categories add column if not exists duration_value int check (duration_value >= 1 and duration_value <= 99);
alter table public.program_categories add column if not exists duration_unit text check (duration_unit in ('years','months'));
do $$ begin
  alter table public.program_categories drop constraint if exists program_categories_duration_unit_check;
exception when others then null; end $$;
alter table public.program_categories add constraint program_categories_duration_unit_check check (duration_unit is null or duration_unit in ('years','months'));
-- normalize any legacy semesters/weeks to years
update public.program_categories set duration_unit='years' where duration_unit in ('semesters','weeks');
-- normalize existing nulls: leave null until set in UI
