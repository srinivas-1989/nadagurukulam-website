-- Organisation & Governance tables
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisational_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  parent_unit_id UUID REFERENCES organisational_units(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- School, Faculty, Department, Centre, Unit, Office
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES organisational_units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reporting_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL, -- references persons/employees
  subordinate_id UUID NOT NULL,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admissions tables
CREATE TABLE IF NOT EXISTS applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admissions_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID REFERENCES applicants(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES disciplines(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'submitted', -- submitted, screening, audition, selected, admitted, rejected
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screening_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES admissions_applications(id) ON DELETE CASCADE,
  reviewer_id UUID,
  score INT,
  feedback TEXT,
  status TEXT DEFAULT 'pending', -- pass, fail, pending
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES admissions_applications(id) ON DELETE CASCADE,
  audition_date TIMESTAMPTZ,
  panelists JSONB,
  rubric_scores JSONB,
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, passed, failed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Without RLS enabled the anon key reads every row directly, bypassing the
-- backend's permission checks. Policies live in supabase-rls-policies.sql.
alter table institutions enable row level security;
alter table campuses enable row level security;
alter table organisational_units enable row level security;
alter table positions enable row level security;
alter table reporting_relationships enable row level security;
alter table applicants enable row level security;
alter table admissions_applications enable row level security;
alter table screening_records enable row level security;
alter table auditions enable row level security;
