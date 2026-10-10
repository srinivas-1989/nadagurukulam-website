-- Phase 7: Finance & HR
-- (manual §17, §Finance)

-- HR: Employee profiles extending users
create table if not exists public.employees (
  id uuid primary key references public.users(id) on delete cascade,
  designation_id uuid references public.category_level_values(id),
  department_id uuid references public.organisational_units(id),
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'visiting')),
  joining_date date,
  pan_number text,
  bank_account_no text,
  ifsc_code text,
  salary_base numeric(12,2),
  status text default 'active' check (status in ('active', 'on_leave', 'resigned', 'terminated')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Finance: Fee Structures
create table if not exists public.fee_structures (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  academic_year text not null,
  total_amount numeric(12,2) not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.fee_items (
  id uuid default uuid_generate_v4() primary key,
  fee_structure_id uuid references public.fee_structures(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Finance: Payments
create table if not exists public.fee_payments (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references public.users(id) on delete cascade,
  fee_structure_id uuid references public.fee_structures(id),
  amount_paid numeric(12,2) not null,
  payment_date date default current_date,
  payment_mode text check (payment_mode in ('cash', 'bank_transfer', 'upi', 'cheque')),
  transaction_ref text,
  receipt_no text unique,
  status text default 'verified' check (status in ('pending', 'verified', 'failed')),
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Payroll / Salary Slips (HR + Finance bridge)
create table if not exists public.salary_slips (
  id uuid default uuid_generate_v4() primary key,
  employee_id uuid references public.employees(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  basic_pay numeric(12,2) not null,
  allowances numeric(12,2) default 0,
  deductions numeric(12,2) default 0,
  net_pay numeric(12,2) not null,
  status text default 'draft' check (status in ('draft', 'paid', 'cancelled')),
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.employees enable row level security;
alter table public.fee_structures enable row level security;
alter table public.fee_items enable row level security;
alter table public.fee_payments enable row level security;
alter table public.salary_slips enable row level security;
