-- Analytics is its own sidebar module; without a role_permissions row per role
-- the item is hidden for everyone but Super Admin (rule 5/6). It is an
-- institution-wide roll-up, so only staff roles get a row — students are
-- deliberately omitted, which keeps the module off their sidebar.
insert into public.role_permissions (role_key, module_key, access_level) values
  ('super_admin','analytics','Full'),
  ('admin','analytics','Manage'),
  ('teaching_faculty','analytics','View'),
  ('non_teaching_faculty','analytics','View')
on conflict (role_key, module_key) do nothing;
