-- Course Offerings & Registration
--
-- The portal could already put a course id on a timetable slot
-- (timetable_slots.course_ids), but nothing recorded that the course was
-- actually offered to a batch that term. This adds the missing layer:
-- a course is delivered as an *offering*, scoped to a term and a batch,
-- taught by a faculty member, and students register for the offering.
--
-- Students never reference a course directly — the manual forbids it, and
-- a course alone carries no term, batch, or teacher.

create table if not exists public.course_offerings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  faculty_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned',   -- planned, active, completed, cancelled
  capacity INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- One delivery of a course to a batch per term. batch_id is nullable (a
-- course may be offered programme-wide), so the uniqueness is a partial
-- index — a plain unique constraint would let duplicates through on NULL.
create unique index if not exists course_offerings_course_term_batch_idx
  on public.course_offerings (course_id, term_id, batch_id)
  where batch_id is not null;

create index if not exists course_offerings_term_idx on public.course_offerings (term_id);
create index if not exists course_offerings_batch_idx on public.course_offerings (batch_id);
create index if not exists course_offerings_faculty_idx on public.course_offerings (faculty_id);

create table if not exists public.course_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_offering_id UUID NOT NULL REFERENCES public.course_offerings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered',  -- registered, dropped, completed
  registered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- A student registers once per offering; re-registering after a drop is a
-- status transition on the same row, never a second row.
create unique index if not exists course_registrations_offering_student_idx
  on public.course_registrations (course_offering_id, student_id);

create index if not exists course_registrations_student_idx on public.course_registrations (student_id);

-- Without RLS enabled the anon key reads every row directly, bypassing the
-- backend's permission checks. Policies live in supabase-rls-policies.sql.
alter table public.course_offerings enable row level security;
alter table public.course_registrations enable row level security;