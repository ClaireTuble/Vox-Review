-- Deployment prerequisite: the migration executor must be able to CREATE in
-- public; replacing an existing function requires its owner (or a superuser).
-- The executor must also have authority to REVOKE and GRANT function execution.
-- Confirm these privileges in the target Supabase project before applying.
create or replace function public.is_superadmin_session_active(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
-- SECURITY DEFINER lets the narrowly granted service_role call read auth.sessions
-- using the function owner's rights. The owner must have SELECT on auth.sessions.
security definer
-- Prevent object shadowing; referenced schemas and relations are fully qualified.
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions as active_session
    where active_session.user_id = p_user_id
      and active_session.id = p_session_id
  );
$$;

-- Only the backend service-role client needs session-status checks; client-facing
-- anon/authenticated roles must not be able to query active Supabase sessions.
revoke execute on function public.is_superadmin_session_active(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_superadmin_session_active(uuid, uuid)
  to service_role;
