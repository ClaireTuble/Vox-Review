-- Regular-user authentication migration only.
-- This keeps the existing public.users.user_id as the application key.
-- It adds a real Supabase Auth mapping via auth.users.id.

-- 1) Add a one-to-one link from the existing app user row to the real auth identity.
alter table public.users
  add column if not exists auth_user_id uuid,
  add column if not exists status text default 'Active',
  add column if not exists avatar_url text;

create unique index if not exists users_auth_user_id_idx
  on public.users (auth_user_id);

update public.users
set status = 'Active'
where status is null;

-- 2) Enforce the foreign key to Supabase Auth identity.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_auth_user_fk'
  ) then
    alter table public.users
      add constraint users_auth_user_fk
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null
      on update cascade;
  end if;
end;
$$;

-- 3) Create or link app user rows when a Supabase Auth user is created.
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
  v_avatar_url text;
begin
  v_first_name := nullif(trim(new.raw_user_meta_data->>'firstName'), '');
  v_last_name  := nullif(trim(new.raw_user_meta_data->>'lastName'), '');
  v_full_name  := nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '');
  v_full_name := coalesce(
    v_full_name,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );
  v_avatar_url := coalesce(
    nullif(new.raw_user_meta_data->>'custom_avatar_url', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', '')
  );

  if exists (
    select 1
    from public.users u
    where u.auth_user_id = new.id
  ) then
    update public.users
    set email = coalesce(new.email, email),
        full_name = coalesce(v_full_name, full_name),
        avatar_url = coalesce(v_avatar_url, avatar_url),
        status = coalesce(status, 'Active')
    where auth_user_id = new.id;
    return new;
  end if;

  -- If a matching app user already exists by email, link it if it is currently unassigned.
  if exists (
    select 1
    from public.users u
    where u.email = new.email
      and u.auth_user_id is null
  ) then
    update public.users
    set auth_user_id = new.id,
        email = coalesce(new.email, email),
        full_name = coalesce(v_full_name, full_name),
        avatar_url = coalesce(v_avatar_url, avatar_url),
        status = coalesce(status, 'Active')
    where email = new.email
      and auth_user_id is null;

    return new;
  end if;

  -- If no app-user row exists for this email, create one.
  insert into public.users (auth_user_id, email, full_name, avatar_url, status)
  values (new.id, new.email, v_full_name, v_avatar_url, 'Active')
  on conflict (auth_user_id) do update
    set email = coalesce(excluded.email, public.users.email),
        full_name = coalesce(excluded.full_name, public.users.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
        status = coalesce(public.users.status, 'Active');

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
