-- Proposed migration: populate profile names and avatars for new Auth users.
-- This intentionally leaves public.users.role and status at their column defaults.
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
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), '')
  );
  v_avatar_url := coalesce(
    nullif(trim(new.raw_user_meta_data->>'custom_avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data->>'picture'), '')
  );

  if exists (
    select 1
    from public.users u
    where u.auth_user_id = new.id
  ) then
    update public.users
    set email = coalesce(new.email, email),
        full_name = coalesce(nullif(trim(full_name), ''), v_full_name),
        avatar_url = coalesce(nullif(trim(avatar_url), ''), v_avatar_url)
    where auth_user_id = new.id;
    return new;
  end if;

  update public.users
  set auth_user_id = new.id,
      email = coalesce(new.email, email),
      full_name = coalesce(nullif(trim(full_name), ''), v_full_name),
      avatar_url = coalesce(nullif(trim(avatar_url), ''), v_avatar_url)
  where email = new.email
    and auth_user_id is null;

  if found then
    return new;
  end if;

  insert into public.users (auth_user_id, email, full_name, avatar_url)
  values (new.id, new.email, v_full_name, v_avatar_url)
  on conflict (auth_user_id) do update
    set email = coalesce(excluded.email, public.users.email),
        full_name = coalesce(nullif(trim(public.users.full_name), ''), excluded.full_name),
        avatar_url = coalesce(nullif(trim(public.users.avatar_url), ''), excluded.avatar_url);

  return new;
end;
$$;
