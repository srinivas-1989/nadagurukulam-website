-- Phase 7: Documents, Media & Notifications
-- (manual §19, §20)

create table if not exists public.document_folders (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  parent_id uuid references public.document_folders(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.documents (
  id uuid default uuid_generate_v4() primary key,
  folder_id uuid references public.document_folders(id) on delete set null,
  title text not null,
  file_url text not null,
  file_type text,
  file_size integer,
  visibility text default 'internal' check (visibility in ('public', 'internal', 'restricted', 'confidential')),
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.media (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  url text not null,
  media_type text default 'image' check (media_type in ('image', 'video', 'audio', 'document')),
  tags text[],
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.notification_templates (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  subject text not null,
  body_template text not null,
  trigger_event text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  recipient_id uuid references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  channel text default 'in_app' check (channel in ('in_app', 'email', 'sms', 'push')),
  status text default 'unread' check (status in ('unread', 'read', 'failed')),
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.document_folders enable row level security;
alter table public.documents enable row level security;
alter table public.media enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notifications enable row level security;
