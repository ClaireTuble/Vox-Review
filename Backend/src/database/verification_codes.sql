-- Migration: Verification Codes & Pending Registrations Table
-- Stores short-lived, single-use, hashed verification codes and encrypted pending signup payloads.

create table if not exists public.verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default null,
  email text,
  purpose text not null,
  code_hash text not null,
  pending_payload text default null,
  expires_at timestamp with time zone not null,
  attempts integer not null default 0,
  used_at timestamp with time zone default null,
  created_at timestamp with time zone default now()
);

-- Index for lookup of active verification codes per email & purpose (for signup)
create index if not exists idx_verification_codes_email_purpose 
  on public.verification_codes(email, purpose, created_at desc);

-- Index for lookup of active verification codes per user_id & purpose (for authenticated user actions)
create index if not exists idx_verification_codes_user_purpose 
  on public.verification_codes(user_id, purpose, created_at desc);

-- Enable Row Level Security (RLS) to prevent public / anon direct client access
alter table public.verification_codes enable row level security;

-- Deny all direct client access (anon and authenticated). Only service_role via backend admin client has access.
drop policy if exists "No direct client access to verification codes" on public.verification_codes;

create policy "No direct client access to verification codes"
  on public.verification_codes
  for all
  to authenticated, anon
  using (false);
