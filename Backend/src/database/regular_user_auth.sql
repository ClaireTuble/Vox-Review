-- Regular-user authentication migration only.
-- This keeps the existing public.users.user_id as the application key.
-- It adds a real Supabase Auth mapping via auth.users.id.

-- 1) Add a one-to-one link from the existing app user row to the real auth identity.
alter table public.users
  add column if not exists auth_user_id uuid unique;

create unique index if not exists users_auth_user_id_idx
  on public.users (auth_user_id);

-- 2) Enforce the foreign key to Supabase Auth identity.
alter table public.users
  add constraint users_auth_user_fk
  foreign key (auth_user_id)
  references auth.users(id)
  on delete set null
  on update cascade;

-- 3) Create or link app user rows when a Supabase Auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If a matching app user already exists by email, link it if it is currently unassigned.
  if exists (
    select 1
    from public.users u
    where u.email = new.email
      and u.auth_user_id is null
  ) then
    update public.users
    set auth_user_id = new.id
    where email = new.email
      and auth_user_id is null;

    return new;
  end if;

  -- If the same auth_user_id is already assigned, do nothing.
  if exists (
    select 1
    from public.users u
    where u.auth_user_id = new.id
  ) then
    return new;
  end if;

  -- If no app-user row exists for this email, create one.
  insert into public.users (auth_user_id, email)
  values (new.id, new.email)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- 4) Backfill rule for legacy rows
-- This is intentionally manual and should be reviewed before running in production.
-- Use a controlled update similar to:
-- update public.users
-- set auth_user_id = auth_users.id
-- from auth.users
-- where public.users.email = auth_users.email
--   and public.users.auth_user_id is null;
