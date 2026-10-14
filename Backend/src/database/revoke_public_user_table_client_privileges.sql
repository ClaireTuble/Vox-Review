revoke all privileges on table public.users, public.user_activities
  from anon, authenticated;

revoke select (
  auth_user_id,
  avatar_url,
  created_at,
  email,
  full_name,
  role,
  user_id
), insert (
  auth_user_id,
  avatar_url,
  created_at,
  email,
  full_name,
  role,
  user_id
), update (
  auth_user_id,
  avatar_url,
  created_at,
  email,
  full_name,
  role,
  user_id
), references (
  auth_user_id,
  avatar_url,
  created_at,
  email,
  full_name,
  role,
  user_id
) on table public.users
  from anon, authenticated;

revoke select (
  activity_type,
  created_at,
  id,
  platform,
  user_id
), insert (
  activity_type,
  created_at,
  id,
  platform,
  user_id
), update (
  activity_type,
  created_at,
  id,
  platform,
  user_id
), references (
  activity_type,
  created_at,
  id,
  platform,
  user_id
) on table public.user_activities
  from anon, authenticated;

revoke all privileges on sequence public.users_user_id_seq
  from anon, authenticated;
