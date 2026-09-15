-- Curriculum structure fix — align with 11 spec items
-- Idempotent
-- Structure: monthly / yearly / semester
do $$ begin
  alter table public.disciplines drop constraint if exists disciplines_structure_mode_check;
exception when others then null; end $$;
alter table public.disciplines add constraint disciplines_structure_mode_check
  check (structure_mode in ('monthly','yearly','semester'));
-- migrate legacy values: yearly_semester -> semester (semesters split across years), keep yearly/semester
update public.disciplines set structure_mode='semester' where structure_mode='yearly_semester';
-- disciplines: add month_count for monthly structure (equal months); keep year_count/semesters_per_year for other modes
alter table public.disciplines add column if not exists month_count int check (month_count between 1 and 24);
-- courses: exam duration as hours+mins split; keep legacy text for compat, add numeric columns
alter table public.courses add column if not exists cie_hours int check (cie_hours >= 0 and cie_hours <= 99);
alter table public.courses add column if not exists cie_mins int check (cie_mins >= 0 and cie_mins < 60);
alter table public.courses add column if not exists see_hours int check (see_hours >= 0 and see_hours <= 99);
alter table public.courses add column if not exists see_mins int check (see_mins >= 0 and see_mins < 60);
-- courses: month_label for monthly programs ( Month 1..N )
alter table public.courses add column if not exists month_label text;
-- category duration: restrict to years/months only (done in supabase-category-duration.sql, but ensure here too)
do $$ begin
  alter table public.program_categories drop constraint if exists program_categories_duration_unit_check;
exception when others then null; end $$;
alter table public.program_categories add constraint program_categories_duration_unit_check
  check (duration_unit is null or duration_unit in ('years','months'));
