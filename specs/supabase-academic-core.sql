-- Academic Core Migration: Academic Years and Terms
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT UNIQUE NOT NULL, -- e.g. "2024-25"
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "Fall 2024", "Semester 1"
  sequence INT DEFAULT 1,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;

drop policy if exists "Academic years readable by all authenticated" on public.academic_years;
create policy "Academic years readable by all authenticated"
  on public.academic_years for select to authenticated
  using (true);

drop policy if exists "Academic years manageable by full admins" on public.academic_years;
create policy "Academic years manageable by full admins"
  on public.academic_years for all to authenticated
  using (public.has_permission('curriculum', array['Manage','Full']))
  with check (public.has_permission('curriculum', array['Manage','Full']));

drop policy if exists "Terms readable by all authenticated" on public.terms;
create policy "Terms readable by all authenticated"
  on public.terms for select to authenticated
  using (true);

drop policy if exists "Terms manageable by full admins" on public.terms;
create policy "Terms manageable by full admins"
  on public.terms for all to authenticated
  using (public.has_permission('curriculum', array['Manage','Full']))
  with check (public.has_permission('curriculum', array['Manage','Full']));
