-- Phase 9: Integrations (Payment Gateway, Email/SMS Logs & Webhooks)

-- Payment Orders (Payment Gateway Integration)
create table if not exists public.payment_orders (
  id uuid default uuid_generate_v4() primary key,
  order_id text unique not null,
  gateway text not null check (gateway in ('razorpay', 'stripe', 'mock')),
  student_id uuid references public.users(id) on delete cascade,
  fee_structure_id uuid references public.fee_structures(id) on delete set null,
  amount numeric(12,2) not null,
  currency text default 'INR',
  status text default 'created' check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),
  gateway_payment_id text,
  gateway_signature text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Transactional Communication Logs (Email & SMS Integrations)
create table if not exists public.communication_logs (
  id uuid default uuid_generate_v4() primary key,
  provider text not null check (provider in ('sendgrid', 'aws_ses', 'twilio', 'fast2sms', 'mock')),
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  recipient text not null,
  subject text,
  message text not null,
  status text default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  error_message text,
  external_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.payment_orders enable row level security;
alter table public.communication_logs enable row level security;

-- Permissions: Staff can manage payments & logs; students can view their own payment orders
insert into public.role_permissions (role_key, module_key, access_level)
select key, 'integrations', 'Manage' from public.roles where key in ('super_admin', 'admin', 'non_teaching_faculty')
on conflict (role_key, module_key) do nothing;

insert into public.role_permissions (role_key, module_key, access_level)
select key, 'integrations', 'View' from public.roles where key in ('teaching_faculty', 'guest_faculty', 'student')
on conflict (role_key, module_key) do nothing;
