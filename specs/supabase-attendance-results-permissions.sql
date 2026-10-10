-- Attendance and Results are their own sidebar modules, so each needs a seeded
-- role_permissions row per role or the module is invisible to everyone but
-- Super Admin (rule 5/6). Both read marks/attendance under the `assessment`
-- umbrella server-side; these rows are what the sidebar filter checks.
insert into public.role_permissions (role_key, module_key, access_level) values
  ('super_admin','attendance','Full'),        ('super_admin','results','Full'),
  ('admin','attendance','Manage'),            ('admin','results','Manage'),
  ('teaching_faculty','attendance','Manage'), ('teaching_faculty','results','Manage'),
  ('non_teaching_faculty','attendance','View'), ('non_teaching_faculty','results','View'),
  ('guest_faculty','attendance','View'),      ('guest_faculty','results','View'),
  ('student','attendance','View'),            ('student','results','Self')
on conflict (role_key, module_key) do nothing;
