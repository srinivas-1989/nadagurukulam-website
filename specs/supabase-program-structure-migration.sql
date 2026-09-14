-- Per-program yearly/semester structure + course header fields matching BPA syllabus (BCVP310)
-- Idempotent — safe to re-run via node backend/scripts/apply-schema.js

-- ── disciplines: structure for yearly vs semester breakup ───────────────
alter table public.disciplines add column if not exists structure_mode text default 'semester'
  check (structure_mode in ('yearly','semester','yearly_semester'));
alter table public.disciplines add column if not exists year_count int default 2 check (year_count between 1 and 10);
alter table public.disciplines add column if not exists semesters_per_year int default 2 check (semesters_per_year between 1 and 4);

-- ── courses: header fields from syllabus image ──────────────────────────
-- image header: Program, Course Name, Type(DSC), Code(BCVP310), Semester(III),
-- Teaching Hours/Periods(75/100), CIE(50)/SEE(50), Credits(05),
-- Examination Type(Practical), Examination Hours CIE 45 Min / SEE 1 hour,
-- plus year breakup for yearly programs.
alter table public.courses add column if not exists teaching_periods int;
alter table public.courses add column if not exists examination_type text;
alter table public.courses add column if not exists examination_hours_cie text;
alter table public.courses add column if not exists examination_hours_see text;
alter table public.courses add column if not exists year_label text;
alter table public.courses add column if not exists year_number int check (year_number between 1 and 10);
-- make semester nullable so yearly-only programs can leave it empty
do $$ begin
  alter table public.courses alter column semester drop not null;
exception when others then null; end $$;
