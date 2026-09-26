-- Drop legacy course_types system (Undergraduate/Masters) — fully superseded by program_categories
-- Idempotent
do $$ begin
  if to_regclass('public.course_types') is not null then
    drop policy if exists "Course types are readable by all authenticated" on public.course_types;
    drop policy if exists "Super Admin can manage course types" on public.course_types;
    drop table if exists public.course_types cascade;
  end if;
end $$;
alter table public.courses drop column if exists course_type;

