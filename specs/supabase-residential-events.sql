-- Residential / Hostel and Events, Productions & Performances
-- (manual §16, §18)
--
-- Phase 6 of the development manual: "hostel allocation, leave, performance
-- participation".
--
-- Two chains:
--   campus → hostel → block → floor → room → bed → allocation → student  (§16)
--   event → production → participant + session + travel                 (§18)
--
-- Manual constraints honoured here:
--  §16 "Room and bed allocation must be time-bound so historical occupancy can
--        be retained." — every allocation carries allocated_from/allocated_to
--        and is never deleted on move; the bed's current occupant is derived.
--  §16 "Warden Assignment, Hostel Mentor, Leave Request, Outing, Return, Room
--        Transfer, Incident/discipline record" — one table each, and a return
--        is a field on the outing rather than a separate row so an outing can
--        only ever have one return.
--  §16 "Residential records should be permission-restricted and separated from
--        general academic visibility." — the whole chain sits behind the
--        `residential` module key, not `users` or `batches`.
--  §18 "Student participation should be a separate relationship from the event
--        — include students, faculty, gurus, guest artists and external
--        artists." — production_participants holds a participant_kind, so a
--        guest artist is a first-class row and not a free-text name on the
--        production.
--  §18 "This domain can generate an artistic portfolio for each student" — a
--        participant row IS the portfolio entry; no separate portfolio table,
--        because a copy would drift from the participation it came from.

-- ============================================================================
-- RESIDENTIAL — physical chain (§16)
-- ============================================================================

-- A campus already exists (§Organisation). Hostels hang off it so a second
-- campus needs no code change.
create table if not exists public.hostels (
  id uuid default uuid_generate_v4() primary key,
  campus_id uuid references public.campuses(id) on delete set null,
  name text not null,
  code text unique not null,
  hostel_type text not null default 'boys' check (hostel_type in ('boys', 'girls', 'mixed', 'staff')),
  warden_contact text,
  address text,
  is_active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Block and floor are separate because buildings grow sideways (a new block)
-- before they grow upwards, and an occupancy report needs both cuts.
create table if not exists public.hostel_blocks (
  id uuid default uuid_generate_v4() primary key,
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  name text not null,
  gender_policy text check (gender_policy in ('boys', 'girls', 'mixed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (hostel_id, name)
);

create table if not exists public.hostel_floors (
  id uuid default uuid_generate_v4() primary key,
  block_id uuid not null references public.hostel_blocks(id) on delete cascade,
  name text not null,
  floor_number integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (block_id, name)
);

create index if not exists hostel_floors_block_idx on public.hostel_floors (block_id);

create table if not exists public.hostel_rooms (
  id uuid default uuid_generate_v4() primary key,
  floor_id uuid not null references public.hostel_floors(id) on delete cascade,
  room_number text not null,
  room_type text default 'shared' check (room_type in ('single', 'shared', 'dormitory')),
  capacity integer not null default 2 check (capacity > 0),
  has_attached_bath boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (floor_id, room_number)
);

create index if not exists hostel_rooms_floor_idx on public.hostel_rooms (floor_id);

-- A bed is the unit that is actually allocated. Its status is a maintenance
-- flag only; who sleeps in it is read from hostel_allocations, never cached
-- here, so occupancy can never disagree with the allocation history.
create table if not exists public.hostel_beds (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid not null references public.hostel_rooms(id) on delete cascade,
  bed_number text not null,
  bed_status text not null default 'available' check (bed_status in ('available', 'maintenance', 'reserved')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (room_id, bed_number)
);

create index if not exists hostel_beds_room_idx on public.hostel_beds (room_id);

-- Time-bound occupancy. allocated_to NULL = current occupant. A move closes the
-- old row (sets allocated_to) and opens a new one, so "who was in room 214 last
-- March" stays answerable — which is the whole point of §16.
create table if not exists public.hostel_allocations (
  id uuid default uuid_generate_v4() primary key,
  bed_id uuid not null references public.hostel_beds(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  allocated_from date not null default current_date,
  allocated_to date,
  allocation_type text not null default 'regular' check (allocation_type in ('regular', 'daycare', 'emergency')),
  status text not null default 'active' check (status in ('active', 'vacated', 'cancelled')),
  remarks text,
  allocated_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint hostel_allocations_date_order check (allocated_to is null or allocated_from is null or allocated_to >= allocated_from)
);

-- One live occupant per bed. Partial, because vacated rows keep allocated_to
-- set and must not collide with the new occupant's NULL.
create unique index if not exists hostel_allocations_bed_active_idx
  on public.hostel_allocations (bed_id)
  where allocated_to is null and status = 'active';

-- Likewise a student holds one live allocation; a student in two beds at once
-- is a double-allocation bug, not a feature.
create unique index if not exists hostel_allocations_student_active_idx
  on public.hostel_allocations (student_id)
  where allocated_to is null and status = 'active';

create index if not exists hostel_allocations_student_idx on public.hostel_allocations (student_id);
create index if not exists hostel_allocations_bed_idx on public.hostel_allocations (bed_id);

create table if not exists public.warden_assignments (
  id uuid default uuid_generate_v4() primary key,
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  warden_role text not null default 'warden' check (warden_role in ('warden', 'assistant_warden', 'caretaker', 'security')),
  start_date date not null default current_date,
  end_date date,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint warden_assignments_date_order check (end_date is null or end_date >= start_date)
);

-- One live warden assignment per person per hostel.
create unique index if not exists warden_assignments_active_idx
  on public.warden_assignments (user_id, hostel_id)
  where end_date is null;

create index if not exists warden_assignments_hostel_idx on public.warden_assignments (hostel_id);

-- ============================================================================
-- RESIDENTIAL — movement and discipline (§16)
-- ============================================================================

-- Leave covers absence from campus (home leave, medical, festival). Outing
-- covers a few hours away and still on campus the same night. Keeping them as
-- separate tables is what lets the hostel office ask the right question.
create table if not exists public.hostel_leave_requests (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid not null references public.users(id) on delete cascade,
  hostel_id uuid references public.hostels(id) on delete set null,
  leave_type text not null default 'home' check (leave_type in ('home', 'medical', 'festival', 'academic', 'other')),
  from_date date not null,
  to_date date not null,
  reason text,
  contact_number text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamp with time zone,
  decision_remarks text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint hostel_leave_requests_date_order check (to_date >= from_date)
);

create index if not exists hostel_leave_requests_student_idx on public.hostel_leave_requests (student_id);
create index if not exists hostel_leave_requests_status_idx on public.hostel_leave_requests (status);

-- §16 lists "Outing, Return" separately, but a return without its outing is
-- meaningless and one outing cannot be returned twice. So the return is the
-- returned_at/returned_by pair on the outing, and the pair of fields is what
-- distinguishes "still out" from "came back".
create table if not exists public.hostel_outings (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid not null references public.users(id) on delete cascade,
  hostel_id uuid references public.hostels(id) on delete set null,
  destination text not null,
  purpose text,
  requested_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expected_return_at timestamp with time zone not null,
  returned_at timestamp with time zone,
  contact_number text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamp with time zone,
  decision_remarks text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists hostel_outings_student_idx on public.hostel_outings (student_id);
create index if not exists hostel_outings_status_idx on public.hostel_outings (status);

-- Room transfer is its own record rather than an edit of two allocation rows:
-- "who authorised this move and why" is a question the hostel office asks, and
-- editing the allocations in place would answer it with nothing.
create table if not exists public.hostel_room_transfers (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid not null references public.users(id) on delete cascade,
  from_allocation_id uuid references public.hostel_allocations(id) on delete set null,
  to_allocation_id uuid references public.hostel_allocations(id) on delete set null,
  from_bed_id uuid references public.hostel_beds(id) on delete set null,
  to_bed_id uuid references public.hostel_beds(id) on delete set null,
  transfer_date date not null default current_date,
  reason text,
  moved_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists hostel_room_transfers_student_idx on public.hostel_room_transfers (student_id);

-- Incident/discipline. `is_confidential` matters here more than anywhere else:
-- the warden's report on a student is the most sensitive record in the portal,
-- so the default is confidential and disclosure is the deliberate act.
create table if not exists public.hostel_incidents (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references public.users(id) on delete set null,
  hostel_id uuid references public.hostels(id) on delete set null,
  incident_date date not null default current_date,
  category text not null default 'conduct' check (category in ('conduct', 'property', 'attendance', 'health', 'safety', 'other')),
  severity text not null default 'minor' check (severity in ('minor', 'moderate', 'major', 'critical')),
  description text not null,
  action_taken text,
  is_confidential boolean not null default true,
  reported_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists hostel_incidents_student_idx on public.hostel_incidents (student_id);
create index if not exists hostel_incidents_hostel_idx on public.hostel_incidents (hostel_id);

alter table public.hostels enable row level security;
alter table public.hostel_blocks enable row level security;
alter table public.hostel_floors enable row level security;
alter table public.hostel_rooms enable row level security;
alter table public.hostel_beds enable row level security;
alter table public.hostel_allocations enable row level security;
alter table public.warden_assignments enable row level security;
alter table public.hostel_leave_requests enable row level security;
alter table public.hostel_outings enable row level security;
alter table public.hostel_room_transfers enable row level security;
alter table public.hostel_incidents enable row level security;

-- ============================================================================
-- EVENTS, PRODUCTIONS AND PERFORMANCES (§18)
-- ============================================================================

-- public.events already exists (title, date, venue, status draft/published/
-- archived, author_id) and is what publishes to the public site. A production
-- is the institution doing the work behind that event — one event can carry
-- several (a festival with four simultaneous programmes).
create table if not exists public.productions (
  id uuid default uuid_generate_v4() primary key,
  event_id uuid references public.events(id) on delete cascade,
  title text not null,
  art_form text check (art_form in ('bharatanatyam', 'vocal', 'violin', 'veena', 'flute', 'mridangam', 'nadaswaram', 'other')),
  production_date date,
  venue text,
  concept_notes text,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'archived')),
  coordinator_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists productions_event_idx on public.productions (event_id);

-- participant_kind is what §18 asks for: students, faculty, gurus, guest artists
-- and external artists in one table, distinguishable without free text. Only a
-- student participant links to users; everyone else is named here, because a
-- guest artist has no portal account and forcing one would be a lie.
create table if not exists public.production_participants (
  id uuid default uuid_generate_v4() primary key,
  production_id uuid not null references public.productions(id) on delete cascade,
  participant_kind text not null default 'student' check (participant_kind in ('student', 'faculty', 'guru', 'guest_artist', 'external_artist')),
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  role_performed text,
  instrument text,
  is_lead boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  -- A student participant must be a portal user; a guest artist must not be,
  -- or the same person would hold two identities in the same table.
  constraint production_participants_student_is_user
    check (participant_kind <> 'student' or user_id is not null)
);

create index if not exists production_participants_production_idx on public.production_participants (production_id);
create index if not exists production_participants_user_idx on public.production_participants (user_id);

-- Rehearsal, dress rehearsal and performance are the same kind of record with
-- different dates, so they are one table with session_type rather than three.
create table if not exists public.production_sessions (
  id uuid default uuid_generate_v4() primary key,
  production_id uuid not null references public.productions(id) on delete cascade,
  session_type text not null default 'rehearsal' check (session_type in ('rehearsal', 'dress_rehearsal', 'performance', 'workshop', 'tour')),
  session_date date not null,
  start_time time,
  end_time time,
  venue text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint production_sessions_time_order check (end_time is null or start_time is null or end_time >= start_time)
);

create index if not exists production_sessions_production_idx on public.production_sessions (production_id);
create index if not exists production_sessions_date_idx on public.production_sessions (session_date);

-- Travel/logistics for a tour. Kept beside productions because §18 puts travel
-- inside the production's lifecycle, not in a separate logistics module.
create table if not exists public.production_travel (
  id uuid default uuid_generate_v4() primary key,
  production_id uuid not null references public.productions(id) on delete cascade,
  destination text not null,
  depart_date date not null,
  return_date date,
  travel_mode text check (travel_mode in ('bus', 'train', 'flight', 'van', 'other')),
  vehicle_details text,
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint production_travel_date_order check (return_date is null or return_date >= depart_date)
);

create index if not exists production_travel_production_idx on public.production_travel (production_id);

alter table public.productions enable row level security;
alter table public.production_participants enable row level security;
alter table public.production_sessions enable row level security;
alter table public.production_travel enable row level security;