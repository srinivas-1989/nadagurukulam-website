-- Rename display names & fix categories — idempotent, safe to re-run.
-- teacher -> Teaching Faculty, staff -> Non-teaching Faculty (keys stay the same, only names change)
update public.roles set name = 'Teaching Faculty' where key = 'teacher' and name != 'Teaching Faculty';
update public.roles set name = 'Non-teaching Faculty' where key = 'staff' and name != 'Non-teaching Faculty';
-- common variants if created with those keys
update public.roles set name = 'Teaching Faculty' where key = 'teaching_faculty' and name != 'Teaching Faculty';
update public.roles set name = 'Non-teaching Faculty' where key = 'non_teaching_faculty' and name != 'Non-teaching Faculty';
update public.roles set name = 'Non-teaching Faculty' where key = 'non_teaching' and name != 'Non-teaching Faculty';

-- fix categories so student form toggles correctly
update public.roles set category = 'staff'   where key in ('teacher','teaching_faculty') and category != 'staff';
update public.roles set category = 'staff'   where key in ('staff','non_teaching_faculty','non_teaching') and category != 'staff';
update public.roles set category = 'student' where key in ('student','students') and category != 'student';
update public.roles set category = 'system'  where key = 'super_admin' and category != 'system';

-- enforce single super_admin user at DB level (unique partial index)
create unique index if not exists one_super_admin_user on public.users (role_key) where role_key = 'super_admin';
