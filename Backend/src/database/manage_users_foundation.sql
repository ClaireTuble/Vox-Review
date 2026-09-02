-- Migration: Manage Users Foundation & User Activities
-- 1. Add status column to public.users (default to 'Active')
alter table public.users
  add column if not exists status text default 'Active';

update public.users
  set status = 'Active'
  where status is null;

-- 2. Update handle_new_auth_user() to populate full_name & status
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text;
  v_last_name text;
  v_full_name text;
begin
  v_first_name := new.raw_user_meta_data->>'firstName';
  v_last_name  := new.raw_user_meta_data->>'lastName';
  v_full_name  := trim(concat_ws(' ', v_first_name, v_last_name));
  
  if v_full_name = '' then
    v_full_name := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  end if;

  if exists (
    select 1 from public.users u where u.email = new.email and u.auth_user_id is null
  ) then
    update public.users
    set auth_user_id = new.id,
        full_name = coalesce(full_name, v_full_name),
        status = coalesce(status, 'Active')
    where email = new.email and auth_user_id is null;
    return new;
  end if;

  if exists (
    select 1 from public.users u where u.auth_user_id = new.id
  ) then
    return new;
  end if;

  insert into public.users (auth_user_id, email, full_name, status)
  values (new.id, new.email, v_full_name, 'Active')
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

-- 3. Backfill full_name for existing regular users from auth.users metadata
update public.users u
set full_name = trim(concat_ws(' ', a.raw_user_meta_data->>'firstName', a.raw_user_meta_data->>'lastName'))
from auth.users a
where u.auth_user_id = a.id
  and (u.full_name is null or u.full_name = '');

-- 4. Create user_activities table
create table if not exists public.user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(user_id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  activity_type text not null check (activity_type in ('Used', 'Analyzed')),
  product_title text,
  product_url text,
  created_at timestamp with time zone default now()
);

alter table public.user_activities
  add column if not exists product_title text,
  add column if not exists product_url text;

create index if not exists idx_user_activities_user_id on public.user_activities(user_id);
create index if not exists idx_user_activities_auth_user_id on public.user_activities(auth_user_id);
