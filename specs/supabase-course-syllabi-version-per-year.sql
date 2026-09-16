-- Per-year versioning for course_syllabi
-- Idempotent
create unique index if not exists course_syllabi_course_year_version_uidx on public.course_syllabi(course_id, academic_year, version_number);
