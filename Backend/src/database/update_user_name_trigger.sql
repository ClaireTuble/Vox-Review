-- Migration: Sync public.users.full_name on auth.users metadata update
create or replace function public.handle_auth_user_updated()
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

  update public.users
  set full_name = v_full_name
  where auth_user_id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_updated
after update of raw_user_meta_data on auth.users
for each row
execute function public.handle_auth_user_updated();
