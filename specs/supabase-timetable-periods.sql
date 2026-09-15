-- Dynamic timetable periods — columns are data, not code. Default 8 periods.
-- Idempotent — safe to re-run. Ponytail: kind break/period/block drives shading + clubbing.
create table if not exists public.timetable_periods (
  id uuid default uuid_generate_v4() primary key,
  key text unique not null,
  label text not null,
  start_time time not null,
  end_time time not null,
  kind text not null check (kind in ('period','break','block')),
  num integer,
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.timetable_periods enable row level security;

drop policy if exists "Timetable periods readable by all authenticated" on public.timetable_periods;
create policy "Timetable periods readable by all authenticated"
  on public.timetable_periods for select to authenticated using (true);
drop policy if exists "Timetable managers can manage periods" on public.timetable_periods;
create policy "Timetable managers can manage periods"
  on public.timetable_periods for all to authenticated
  using (public.has_permission('timetable', array['Manage','Full']))
  with check (public.has_permission('timetable', array['Manage','Full']));

create index if not exists timetable_periods_sort_idx on public.timetable_periods(sort_order);

-- Seed default 8 periods (Mon-Sat 08:15-16:00). Upsert on key so re-run safe.
insert into public.timetable_periods (key, label, start_time, end_time, kind, num, sort_order) values
  ('p1','1','08:15','09:00','period',1,1),
  ('p2','2','09:00','09:45','period',2,2),
  ('p3','3','09:45','10:30','period',3,3),
  ('br1','BREAK','10:30','10:45','break',null,4),
  ('p4','4','10:45','11:30','period',4,5),
  ('p5','5','11:30','12:15','period',5,6),
  ('lunch','LUNCH','12:15','13:00','break',null,7),
  ('nap','NAP','13:00','13:25','break',null,8),
  ('p6','6','13:30','14:30','period',6,9),
  ('p7','7','14:30','15:15','period',7,10),
  ('p8','8','15:15','16:00','period',8,11)
on conflict (key) do update set
  label=excluded.label, start_time=excluded.start_time, end_time=excluded.end_time,
  kind=excluded.kind, num=excluded.num, sort_order=excluded.sort_order;
