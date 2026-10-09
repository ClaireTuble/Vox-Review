create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Security', 'Platform', 'Users')),
  type text not null check (type in ('alert', 'danger', 'warning', 'success', 'info')),
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  source_event text,
  actor_user_id uuid,
  is_active boolean not null default true
);

create index if not exists idx_notifications_created_at on public.notifications (created_at desc);
create index if not exists idx_notifications_unread on public.notifications (read, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  target text,
  resource_type text,
  status text not null check (status in ('Successful', 'Failed', 'Warning')),
  event_type text not null check (event_type in ('Authentication', 'Access', 'Configuration', 'Diagnostic')),
  device text,
  ip_address text,
  details text,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_admin_user_id on public.audit_logs (admin_user_id);
create index if not exists idx_audit_logs_event_type on public.audit_logs (event_type);

-- Security: Enforce Row Level Security (RLS) & lock down direct client access
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.notifications from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
