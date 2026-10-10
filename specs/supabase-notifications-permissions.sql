-- Notifications are personal: every user sees only their own rows
-- (scoped server-side by recipient_id). Grant View to all roles so the
-- global topbar bell works for everyone; create/update are individually
-- guarded (recipients can only mark their own read).
insert into public.role_permissions (role_key, module_key, access_level)
select key, 'notifications', 'View' from public.roles
on conflict (role_key, module_key) do nothing;