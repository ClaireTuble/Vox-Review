-- PROPOSAL ONLY: compare with the current deployed schema and review before applying.
-- Never execute this file from application code.
--
-- The migration runner MUST execute the entire file transactionally. Do not use
-- a runner that autocommits statements individually. The runner must connect as
-- postgres, be a superuser, or have sufficient role membership/ownership to
-- ALTER FUNCTION ... OWNER TO postgres. This migration intentionally aborts
-- rather than accepting schema drift or an unexpected OTP RPC overload.
--
-- Existing Supabase sessions without a row in superadmin_otp_sessions will be
-- denied Super Admin access and must reauthenticate and complete email OTP.
-- Recovery is forward-only: inspect the failed statement and actual catalogs,
-- correct this proposal or the staging schema, then rerun the whole transaction.
-- Do NOT restore the old permissive is_superadmin_session_active implementation.
--
-- Post-migration checklist (run as a database operator in staging):
-- [ ] All functions below are owned by postgres; the existing OTP function remains INVOKER.
-- [ ] The registration/session-check functions are SECURITY DEFINER.
-- [ ] Their search_path is empty; signatures and ACLs match the GRANT/REVOKE statements.
-- [ ] The OTP RPC signature is exactly (uuid,text,text,timestamptz,varchar).
-- [ ] Table columns, constraints, indexes and RLS match this proposal.
-- [ ] anon/authenticated have no table privileges or EXECUTE on sensitive RPCs.
-- [ ] service_role can invoke the intended RPCs and update session activity/revocation.
-- [ ] Correct user/session succeeds; another user's or session's pair fails.
-- [ ] Replayed and expired OTPs fail; concurrent redemption succeeds at most once.
-- [ ] Revoking a session makes is_superadmin_session_active return false.

-- Fail before DDL if a known table has drifted or an unexpected overload exists.
set local role postgres;

do $preflight$
declare
  v_count integer;
  v_column record;
  v_expected record;
  v_name text;
  v_signature regprocedure;
begin
  if pg_catalog.to_regclass('public.admin_2fa_challenges') is null then
    raise exception 'Required table public.admin_2fa_challenges is missing.';
  end if;
  if pg_catalog.to_regclass('public.audit_logs') is null then
    raise exception 'Required table public.audit_logs is missing.';
  end if;

  -- Validate every challenge column for which authoritative deployed-schema
  -- evidence was supplied. Do not infer the id column default from local SQL.
  for v_expected in
    select * from (values
      ('id', 'uuid', false, null::text),
      ('admin_user_id', 'uuid', false, null::text),
      ('admin_email', 'text', false, null::text),
      ('challenge_token_hash', 'text', false, null::text),
      ('otp_hash', 'text', false, null::text),
      ('attempts_count', 'int4', false, '0'),
      ('max_attempts', 'int4', false, '3'),
      ('expires_at', 'timestamptz', false, null::text),
      ('consumed_at', 'timestamptz', true, null::text),
      ('created_at', 'timestamptz', false, 'now()'),
      ('purpose', 'varchar', false, '''login''::character varying')
    ) as expected(name, type_name, nullable, default_expr)
  loop
    select c.udt_name, c.is_nullable, c.column_default
      into v_column
      from information_schema.columns as c
     where c.table_schema = 'public'
       and c.table_name = 'admin_2fa_challenges'
       and c.column_name = v_expected.name;

    if not found then
      raise exception 'Schema drift: public.admin_2fa_challenges.% is missing.', v_expected.name;
    end if;
    if v_column.udt_name <> v_expected.type_name
       or (v_column.is_nullable = 'YES') <> v_expected.nullable then
      raise exception 'Schema drift: public.admin_2fa_challenges.% has unexpected type or nullability.', v_expected.name;
    end if;
    if v_expected.default_expr is not null
       and lower(regexp_replace(coalesce(v_column.column_default, ''), '[[:space:]()]', '', 'g'))
           <> lower(regexp_replace(v_expected.default_expr, '[[:space:]()]', '', 'g')) then
      raise exception 'Schema drift: public.admin_2fa_challenges.% has unexpected default.', v_expected.name;
    end if;
  end loop;

  -- Audit columns in the verified inventory are not altered. Check they exist;
  -- validate the two added columns separately if they already exist.
  foreach v_name in array array[
    'admin_user_id', 'admin_email', 'action', 'target', 'resource_type',
    'status', 'event_type', 'device', 'ip_address', 'details', 'created_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns as c
       where c.table_schema = 'public'
         and c.table_name = 'audit_logs'
         and c.column_name = v_name
    ) then
      raise exception 'Schema drift: verified audit_logs column % is missing.', v_name;
    end if;
  end loop;

  foreach v_name in array array['session_id', 'user_agent'] loop
    select c.udt_name, c.is_nullable, c.column_default
      into v_column
      from information_schema.columns as c
     where c.table_schema = 'public'
       and c.table_name = 'audit_logs'
       and c.column_name = v_name;
    if found and (
      v_column.udt_name <> case v_name when 'session_id' then 'uuid' else 'text' end
      or v_column.is_nullable <> 'YES'
      or v_column.column_default is not null
    ) then
      raise exception 'Schema drift: audit_logs.% must be nullable with no default and the expected type.', v_name;
    end if;
  end loop;
  select count(*) into v_count
    from information_schema.columns as c
   where c.table_schema = 'public'
     and c.table_name = 'admin_2fa_challenges';
  if v_count <> 11 then
    raise exception 'Schema drift: public.admin_2fa_challenges has % columns; expected 11.', v_count;
  end if;
  select count(*) into v_count
    from information_schema.columns as c
   where c.table_schema = 'public'
     and c.table_name = 'audit_logs';
  if v_count < 12 or v_count > 14 then
    raise exception 'Schema drift: public.audit_logs has an unexpected number of columns (%).', v_count;
  end if;

  if exists (
    select 1
      from public.admin_2fa_challenges
     group by admin_user_id, challenge_token_hash
    having count(*) > 1
  ) then
    raise exception 'Duplicate admin_2fa_challenges user/hash pairs prevent the required unique index.';
  end if;

  -- The deployed catalog evidence showed exactly this five-argument function,
  -- owned by postgres and SECURITY INVOKER. Abort on any unexpected overload;
  -- do not silently retain or drop a legacy variant.
  v_signature := pg_catalog.to_regprocedure(
    'public.verify_and_consume_admin_otp(uuid,text,text,timestamptz,character varying)'
  );
  if v_signature is null then
    raise exception 'Required deployed signature public.verify_and_consume_admin_otp(uuid,text,text,timestamptz,varchar) is missing.';
  end if;
  select count(*) into v_count
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'verify_and_consume_admin_otp'
     and p.oid <> v_signature::oid;
  if v_count > 0 then
    raise exception 'Unexpected verify_and_consume_admin_otp overload found; stop and review before migration.';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid = v_signature::oid
       and p.proowner = 'postgres'::regrole
       and not p.prosecdef
  ) then
    raise exception 'The deployed five-argument OTP function owner/security mode differs from verified evidence.';
  end if;
  if pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'The deployed OTP function ACL differs from the verified backend-only ACL.';
  end if;
  if pg_catalog.to_regprocedure('public.is_superadmin_session_active(uuid,uuid)') is not null then
    if exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = 'public.is_superadmin_session_active(uuid,uuid)'::regprocedure
         and (p.proowner <> 'postgres'::regrole
           or not p.prosecdef
           or not (p.proconfig @> array['search_path=""']))
    ) then
      raise exception 'Existing is_superadmin_session_active owner/security configuration differs from verified evidence.';
    end if;
  end if;
  if not pg_catalog.has_table_privilege('postgres', 'auth.sessions', 'SELECT')
     or not pg_catalog.has_table_privilege('postgres', 'auth.users', 'SELECT')
     or not pg_catalog.has_table_privilege('postgres', 'public.admin_2fa_challenges', 'SELECT')
     or not pg_catalog.has_table_privilege('postgres', 'public.admin_2fa_challenges', 'UPDATE') then
    raise exception 'postgres lacks a required privilege on auth.sessions, auth.users, or admin_2fa_challenges.';
  end if;
  if pg_catalog.has_table_privilege('service_role', 'auth.sessions', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'auth.users', 'SELECT') then
    raise exception 'Unexpected direct auth-schema read privilege for service_role; stop and review.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class as c
     where c.oid = 'public.admin_2fa_challenges'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.admin_2fa_challenges.';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.admin_2fa_challenges', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.admin_2fa_challenges', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.admin_2fa_challenges', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.admin_2fa_challenges', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_2fa_challenges', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_2fa_challenges', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_2fa_challenges', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_2fa_challenges', 'DELETE') then
    raise exception 'anon/authenticated have unexpected table privileges on admin_2fa_challenges.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as c
     where c.oid = 'public.audit_logs'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on public.audit_logs.';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.audit_logs', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.audit_logs', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.audit_logs', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.audit_logs', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.audit_logs', 'DELETE') then
    raise exception 'anon/authenticated have unexpected table privileges on audit_logs.';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_policies as policy
     where policy.schemaname = 'public'
       and policy.tablename = 'admin_2fa_challenges'
       and policy.roles && array['public', 'anon', 'authenticated']::name[]
  ) then
    raise exception 'Client-facing RLS policy found on admin_2fa_challenges; review before migration.';
  end if;

  if pg_catalog.to_regclass('public.superadmin_otp_sessions') is not null and exists (
    select 1
      from pg_catalog.pg_policies as policy
     where policy.schemaname = 'public'
       and policy.tablename = 'superadmin_otp_sessions'
  ) then
    raise exception 'Existing RLS policies found on superadmin_otp_sessions; review before migration.';
  end if;
end
$preflight$;

alter table public.audit_logs
  add column if not exists session_id uuid,
  add column if not exists user_agent text;

alter table public.admin_2fa_challenges
  add column if not exists purpose varchar(32) not null default 'login';

-- Defensively validate named existing indexes before CREATE INDEX IF NOT EXISTS.
do $index_preflight$
declare
  v_expected record;
  v_definition text;
  v_predicate text;
  v_unique boolean;
  v_valid boolean;
begin
  for v_expected in
    select * from (values
      ('idx_audit_logs_session_id', 'audit_logs', 'session_id', false, null::text),
      ('idx_admin_2fa_purpose', 'admin_2fa_challenges', 'admin_user_id,purpose,consumed_at,expires_at', false, null::text),
      ('uq_admin_2fa_challenge_lookup', 'admin_2fa_challenges', 'admin_user_id,challenge_token_hash', true, null::text)
    ) as expected(index_name, table_name, columns_sql, is_unique, predicate_sql)
  loop
    if pg_catalog.to_regclass('public.' || v_expected.index_name) is null then
      continue;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_class as index_relation
       where index_relation.oid = pg_catalog.to_regclass('public.' || v_expected.index_name)
         and index_relation.relkind = 'i'
    ) then
      raise exception 'Relation public.% exists but is not an index.', v_expected.index_name;
    end if;
    select lower(regexp_replace(pg_catalog.pg_get_indexdef(i.indexrelid), '[[:space:]"]', '', 'g')),
           pg_catalog.pg_get_expr(i.indpred, i.indrelid),
           i.indisunique,
           i.indisvalid and i.indisready
      into v_definition, v_predicate, v_unique, v_valid
      from pg_catalog.pg_index as i
     where i.indexrelid = pg_catalog.to_regclass('public.' || v_expected.index_name);
    if not v_valid
       or v_unique <> v_expected.is_unique
       or position(
         'onpublic.' || v_expected.table_name || 'usingbtree(' || v_expected.columns_sql || ')'
         in v_definition
       ) = 0
       or v_predicate is not null then
      raise exception 'Index % exists with an incompatible definition.', v_expected.index_name;
    end if;
  end loop;
end
$index_preflight$;

create index if not exists idx_audit_logs_session_id
  on public.audit_logs (session_id);

create index if not exists idx_admin_2fa_purpose
  on public.admin_2fa_challenges (admin_user_id, purpose, consumed_at, expires_at);

-- Prevent duplicate challenge registrations without updating or deleting rows.
create unique index if not exists uq_admin_2fa_challenge_lookup
  on public.admin_2fa_challenges (admin_user_id, challenge_token_hash);

-- If the session table already exists, validate it BEFORE CREATE TABLE IF NOT
-- EXISTS can accept it. The post-create validator below repeats this check.
do $existing_session_preflight$
declare
  v_count integer;
  v_expected record;
  v_actual record;
  v_constraint record;
  v_index_definition text;
  v_index_predicate text;
  v_index_unique boolean;
  v_index_valid boolean;
begin
  if pg_catalog.to_regclass('public.superadmin_otp_sessions') is null then
    return;
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_class as session_table
     where session_table.oid = pg_catalog.to_regclass('public.superadmin_otp_sessions')
       and session_table.relkind = 'r'
  ) then
    raise exception 'public.superadmin_otp_sessions exists but is not a regular table.';
  end if;

  select count(*) into v_count
    from information_schema.columns as c
   where c.table_schema = 'public'
     and c.table_name = 'superadmin_otp_sessions';
  if v_count <> 9 then
    raise exception 'Existing superadmin_otp_sessions has % columns; expected exactly 9.', v_count;
  end if;

  for v_expected in
    select * from (values
      ('session_id', 'uuid', 'NO', null::text),
      ('admin_user_id', 'uuid', 'NO', null::text),
      ('challenge_token_hash', 'text', 'NO', null::text),
      ('verified_at', 'timestamptz', 'NO', 'pg_catalog.clock_timestamp()'),
      ('expires_at', 'timestamptz', 'NO', null::text),
      ('revoked_at', 'timestamptz', 'YES', null::text),
      ('ip_address', 'text', 'YES', null::text),
      ('user_agent', 'text', 'YES', null::text),
      ('last_active_at', 'timestamptz', 'NO', 'pg_catalog.clock_timestamp()')
    ) as expected(name, type_name, nullable, default_expr)
  loop
    select c.udt_name, c.is_nullable, c.column_default
      into v_actual
      from information_schema.columns as c
     where c.table_schema = 'public'
       and c.table_name = 'superadmin_otp_sessions'
       and c.column_name = v_expected.name;
    if not found
       or v_actual.udt_name <> v_expected.type_name
       or v_actual.is_nullable <> v_expected.nullable then
      raise exception 'Existing superadmin_otp_sessions.% has incompatible type/nullability.', v_expected.name;
    end if;
    if v_expected.default_expr is null and v_actual.column_default is not null then
      raise exception 'Existing superadmin_otp_sessions.% has an unexpected default.', v_expected.name;
    end if;
    if v_expected.default_expr is not null
       and lower(regexp_replace(coalesce(v_actual.column_default, ''), '[[:space:]()]', '', 'g'))
           <> lower(regexp_replace(v_expected.default_expr, '[[:space:]()]', '', 'g')) then
      raise exception 'Existing superadmin_otp_sessions.% has an unexpected default.', v_expected.name;
    end if;
  end loop;

  for v_constraint in
    select * from (values
      ('superadmin_otp_sessions_pkey', 'p', 'primarykey(session_id)'),
      ('superadmin_otp_sessions_admin_user_id_fkey', 'f', 'foreignkey(admin_user_id)referencesauth.users(id)ondeletecascade'),
      ('superadmin_otp_sessions_challenge_token_hash_key', 'u', 'unique(challenge_token_hash)'),
      ('superadmin_otp_sessions_challenge_token_hash_check', 'c', null::text),
      ('superadmin_otp_sessions_expiry_after_verification', 'c', 'expires_at>verified_at')
    ) as expected(name, type_code, definition_fragment)
  loop
    select c.contype::text as contype,
           lower(regexp_replace(pg_catalog.pg_get_constraintdef(c.oid), '[[:space:]"]', '', 'g')) as definition
      into v_actual
      from pg_catalog.pg_constraint as c
     where c.conrelid = 'public.superadmin_otp_sessions'::regclass
       and c.conname = v_constraint.name;
    if not found
       or v_actual.contype <> v_constraint.type_code
       or (
         v_constraint.name = 'superadmin_otp_sessions_challenge_token_hash_check'
         and (
           position('~' in v_actual.definition) = 0
           or position('^[0-9a-f]{64}$' in v_actual.definition) = 0
         )
       )
       or (
         v_constraint.definition_fragment is not null
         and position(v_constraint.definition_fragment in v_actual.definition) = 0
       ) then
      raise exception 'Existing constraint % on superadmin_otp_sessions is missing or incompatible.', v_constraint.name;
    end if;
  end loop;
  select count(*) into v_count
    from pg_catalog.pg_constraint as c
   where c.conrelid = 'public.superadmin_otp_sessions'::regclass;
  if v_count <> 5 then
    raise exception 'Existing superadmin_otp_sessions has % constraints; expected exactly 5.', v_count;
  end if;

  if pg_catalog.to_regclass('public.idx_superadmin_otp_sessions_admin_active') is not null then
    if not exists (
      select 1
        from pg_catalog.pg_class as index_relation
       where index_relation.oid = pg_catalog.to_regclass('public.idx_superadmin_otp_sessions_admin_active')
         and index_relation.relkind = 'i'
    ) then
      raise exception 'Relation public.idx_superadmin_otp_sessions_admin_active exists but is not an index.';
    end if;
    select lower(regexp_replace(pg_catalog.pg_get_indexdef(i.indexrelid), '[[:space:]"]', '', 'g')),
           lower(regexp_replace(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '[[:space:]()]', '', 'g')),
           i.indisunique,
           i.indisvalid and i.indisready
      into v_index_definition, v_index_predicate, v_index_unique, v_index_valid
      from pg_catalog.pg_index as i
     where i.indexrelid = pg_catalog.to_regclass('public.idx_superadmin_otp_sessions_admin_active');
    if not v_index_valid
       or v_index_unique
       or position('onpublic.superadmin_otp_sessionsusingbtree(admin_user_id,expires_atdesc)' in v_index_definition) = 0
       or v_index_predicate <> 'revoked_atisnull' then
      raise exception 'Existing idx_superadmin_otp_sessions_admin_active has an incompatible definition.';
    end if;
  end if;
  select count(*) into v_count
    from pg_catalog.pg_index as i
   where i.indrelid = 'public.superadmin_otp_sessions'::regclass;
  if v_count <> case
      when pg_catalog.to_regclass('public.idx_superadmin_otp_sessions_admin_active') is null then 2
      else 3
    end then
    raise exception 'Existing superadmin_otp_sessions has an unexpected number of indexes (%).', v_count;
  end if;

  if exists (
    select 1
      from pg_catalog.pg_policies as policy
     where policy.schemaname = 'public'
       and policy.tablename = 'superadmin_otp_sessions'
  ) then
    raise exception 'Existing policies on superadmin_otp_sessions require review before migration.';
  end if;
end
$existing_session_preflight$;

create table if not exists public.superadmin_otp_sessions (
  session_id uuid primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  challenge_token_hash text not null unique
    check (challenge_token_hash ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  last_active_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint superadmin_otp_sessions_expiry_after_verification
    check (expires_at > verified_at)
);

-- Validate the complete table shape and constraints even when it pre-existed.
do $session_table_validation$
declare
  v_expected record;
  v_actual record;
  v_constraint record;
  v_count integer;
begin
  select count(*) into v_count
    from information_schema.columns as c
   where c.table_schema = 'public'
     and c.table_name = 'superadmin_otp_sessions';
  if v_count <> 9 then
    raise exception 'Schema drift: superadmin_otp_sessions has % columns; expected exactly 9.', v_count;
  end if;

  for v_expected in
    select * from (values
      ('session_id', 'uuid', 'NO', null::text),
      ('admin_user_id', 'uuid', 'NO', null::text),
      ('challenge_token_hash', 'text', 'NO', null::text),
      ('verified_at', 'timestamptz', 'NO', 'pg_catalog.clock_timestamp()'),
      ('expires_at', 'timestamptz', 'NO', null::text),
      ('revoked_at', 'timestamptz', 'YES', null::text),
      ('ip_address', 'text', 'YES', null::text),
      ('user_agent', 'text', 'YES', null::text),
      ('last_active_at', 'timestamptz', 'NO', 'pg_catalog.clock_timestamp()')
    ) as expected(name, type_name, nullable, default_expr)
  loop
    select c.udt_name, c.is_nullable, c.column_default
      into v_actual
      from information_schema.columns as c
     where c.table_schema = 'public'
       and c.table_name = 'superadmin_otp_sessions'
       and c.column_name = v_expected.name;
    if not found
       or v_actual.udt_name <> v_expected.type_name
       or v_actual.is_nullable <> v_expected.nullable then
      raise exception 'Schema drift: superadmin_otp_sessions.% has unexpected type/nullability.', v_expected.name;
    end if;
    if v_expected.default_expr is null and v_actual.column_default is not null then
      raise exception 'Schema drift: superadmin_otp_sessions.% has an unexpected default.', v_expected.name;
    end if;
    if v_expected.default_expr is not null
       and lower(regexp_replace(coalesce(v_actual.column_default, ''), '[[:space:]()]', '', 'g'))
           <> lower(regexp_replace(v_expected.default_expr, '[[:space:]()]', '', 'g')) then
      raise exception 'Schema drift: superadmin_otp_sessions.% has an unexpected default.', v_expected.name;
    end if;
  end loop;

  for v_constraint in
    select * from (values
      ('superadmin_otp_sessions_pkey', 'p', 'primarykey(session_id)'),
      ('superadmin_otp_sessions_admin_user_id_fkey', 'f', 'foreignkey(admin_user_id)referencesauth.users(id)ondeletecascade'),
      ('superadmin_otp_sessions_challenge_token_hash_key', 'u', 'unique(challenge_token_hash)'),
      ('superadmin_otp_sessions_challenge_token_hash_check', 'c', 'challenge_token_hash~''^[0-9a-f]{64}''::text'),
      ('superadmin_otp_sessions_expiry_after_verification', 'c', 'expires_at>verified_at')
    ) as expected(name, type_code, definition_fragment)
  loop
    select c.contype::text as contype,
           lower(regexp_replace(pg_catalog.pg_get_constraintdef(c.oid), '[[:space:]"]', '', 'g')) as definition
      into v_actual
      from pg_catalog.pg_constraint as c
     where c.conrelid = 'public.superadmin_otp_sessions'::regclass
       and c.conname = v_constraint.name;
    if not found
       or v_actual.contype <> v_constraint.type_code
       or (
         v_constraint.name = 'superadmin_otp_sessions_challenge_token_hash_check'
         and (
           position('~' in v_actual.definition) = 0
           or position('^[0-9a-f]{64}$' in v_actual.definition) = 0
         )
       )
       or (
         v_constraint.name <> 'superadmin_otp_sessions_challenge_token_hash_check'
         and position(v_constraint.definition_fragment in v_actual.definition) = 0
       ) then
      raise exception 'Constraint % is missing or incompatible on superadmin_otp_sessions.', v_constraint.name;
    end if;
  end loop;
  select count(*) into v_count
    from pg_catalog.pg_constraint as c
   where c.conrelid = 'public.superadmin_otp_sessions'::regclass;
  if v_count <> 5 then
    raise exception 'Schema drift: superadmin_otp_sessions has % constraints; expected exactly 5.', v_count;
  end if;
end
$session_table_validation$;

create index if not exists idx_superadmin_otp_sessions_admin_active
  on public.superadmin_otp_sessions (admin_user_id, expires_at desc)
  where revoked_at is null;

-- Validate any existing same-named session index by actual catalog definition.
do $session_index_validation$
declare
  v_definition text;
  v_predicate text;
  v_valid boolean;
  v_unique boolean;
begin
  if not exists (
    select 1
      from pg_catalog.pg_class as index_relation
     where index_relation.oid = 'public.idx_superadmin_otp_sessions_admin_active'::regclass
       and index_relation.relkind = 'i'
  ) then
    raise exception 'Relation public.idx_superadmin_otp_sessions_admin_active is missing or is not an index.';
  end if;

  select lower(regexp_replace(pg_catalog.pg_get_indexdef(i.indexrelid), '[[:space:]"]', '', 'g')),
         lower(regexp_replace(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '[[:space:]()]', '', 'g')),
         i.indisvalid and i.indisready,
         i.indisunique
    into v_definition, v_predicate, v_valid, v_unique
    from pg_catalog.pg_index as i
   where i.indexrelid = 'public.idx_superadmin_otp_sessions_admin_active'::regclass;
  if not v_valid
     or v_unique
     or position('onpublic.superadmin_otp_sessionsusingbtree(admin_user_id,expires_atdesc)' in v_definition) = 0
     or v_predicate <> 'revoked_atisnull' then
    raise exception 'Index idx_superadmin_otp_sessions_admin_active has an incompatible definition.';
  end if;
  if (
    select count(*)
      from pg_catalog.pg_index as i
     where i.indrelid = 'public.superadmin_otp_sessions'::regclass
  ) <> 3 then
    raise exception 'superadmin_otp_sessions has an unexpected number of indexes.';
  end if;
end
$session_index_validation$;

alter table public.superadmin_otp_sessions enable row level security;
revoke all on table public.superadmin_otp_sessions from public, anon, authenticated;
grant select, update on table public.superadmin_otp_sessions to service_role;
grant select, insert on table public.superadmin_otp_sessions to postgres;

revoke all on table public.admin_2fa_challenges from public, anon, authenticated;
grant select, insert, update on table public.admin_2fa_challenges to service_role;
grant select, update on table public.admin_2fa_challenges to postgres;

-- Preserve the deployed OTP function identity: (uuid, text, text, timestamptz,
-- varchar) -> jsonb. It remains SECURITY INVOKER. The registration RPC below is
-- owned by postgres, so this nested call executes with postgres privileges;
-- password-change callers continue to execute this function as service_role.
create or replace function public.verify_and_consume_admin_otp(
  p_admin_user_id uuid,
  p_challenge_token_hash text,
  p_submitted_otp_hash text,
  p_now timestamptz default pg_catalog.now(),
  p_purpose varchar default 'login'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $otp$
declare
  v_challenge public.admin_2fa_challenges%rowtype;
begin
  if p_purpose is distinct from 'login'
     and p_purpose is distinct from 'password_change' then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'INVALID_PURPOSE',
      'message', 'The verification challenge purpose is invalid.'
    );
  end if;

  select challenge.*
    into v_challenge
    from public.admin_2fa_challenges as challenge
   where challenge.admin_user_id = p_admin_user_id
     and challenge.challenge_token_hash = p_challenge_token_hash
     and challenge.purpose = p_purpose
     and challenge.consumed_at is null
   for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'NOT_FOUND',
      'message', 'No active verification challenge found or challenge has already been consumed.'
    );
  end if;

  if v_challenge.expires_at <= p_now then
    update public.admin_2fa_challenges
       set consumed_at = p_now
     where id = v_challenge.id;
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'EXPIRED',
      'message', 'The verification code has expired. Please request a new code.'
    );
  end if;

  if v_challenge.attempts_count >= v_challenge.max_attempts then
    update public.admin_2fa_challenges
       set consumed_at = p_now
     where id = v_challenge.id;
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'MAX_ATTEMPTS_EXCEEDED',
      'attempts', v_challenge.attempts_count,
      'max_attempts', v_challenge.max_attempts,
      'message', 'Maximum verification attempts exceeded. Challenge invalidated.'
    );
  end if;

  if v_challenge.otp_hash <> p_submitted_otp_hash then
    update public.admin_2fa_challenges
       set attempts_count = attempts_count + 1
     where id = v_challenge.id
     returning attempts_count into v_challenge.attempts_count;

    if v_challenge.attempts_count >= v_challenge.max_attempts then
      update public.admin_2fa_challenges
         set consumed_at = p_now
       where id = v_challenge.id;
      return pg_catalog.jsonb_build_object(
        'success', false,
        'reason', 'MAX_ATTEMPTS_EXCEEDED',
        'attempts', v_challenge.attempts_count,
        'max_attempts', v_challenge.max_attempts,
        'message', 'Incorrect code. Maximum attempts reached. Challenge invalidated.'
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'INVALID_OTP',
      'attempts', v_challenge.attempts_count,
      'max_attempts', v_challenge.max_attempts,
      'message', 'Incorrect verification code. Please try again.'
    );
  end if;

  update public.admin_2fa_challenges
     set consumed_at = p_now
   where id = v_challenge.id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'reason', 'VERIFIED',
    'admin_user_id', v_challenge.admin_user_id,
    'admin_email', v_challenge.admin_email,
    'purpose', v_challenge.purpose,
    'message', 'Two-factor verification successful.'
  );
end;
$otp$;

alter function public.verify_and_consume_admin_otp(uuid, text, text, timestamptz, varchar)
  owner to postgres;
revoke execute on function public.verify_and_consume_admin_otp(uuid, text, text, timestamptz, varchar)
  from public, anon, authenticated;
grant execute on function public.verify_and_consume_admin_otp(uuid, text, text, timestamptz, varchar)
  to service_role;

-- The outer definer requires postgres to read auth tables and write the OTP
-- session table. The postgres privileges on auth.users/auth.sessions are
-- preflight-verified; service_role receives no direct auth-schema privileges.
create or replace function public.verify_and_register_superadmin_otp_session(
  p_admin_user_id uuid,
  p_session_id uuid,
  p_challenge_token_hash text,
  p_submitted_otp_hash text,
  p_now timestamptz,
  p_purpose varchar,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $register$
declare
  v_otp_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_purpose is distinct from 'login' then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'INVALID_PURPOSE',
      'message', 'Only login OTP challenges can establish an administrator session.'
    );
  end if;

  if not exists (
    select 1
      from auth.users as admin_user
     where admin_user.id = p_admin_user_id
       and admin_user.raw_app_meta_data ->> 'role' = 'superadmin'
  ) then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'ROLE_REJECTED',
      'message', 'The account is not an active Super Admin.'
    );
  end if;

  if not exists (
    select 1
      from auth.sessions as auth_session
     where auth_session.user_id = p_admin_user_id
       and auth_session.id = p_session_id
  ) then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'SESSION_NOT_FOUND',
      'message', 'The authenticated Supabase session is not active.'
    );
  end if;

  v_otp_result := public.verify_and_consume_admin_otp(
    p_admin_user_id,
    p_challenge_token_hash,
    p_submitted_otp_hash,
    p_now,
    p_purpose
  );
  if coalesce((v_otp_result ->> 'success')::boolean, false) is not true then
    return v_otp_result;
  end if;

  insert into public.superadmin_otp_sessions (
    session_id, admin_user_id, challenge_token_hash, verified_at,
    expires_at, ip_address, user_agent, last_active_at
  ) values (
    p_session_id, p_admin_user_id, p_challenge_token_hash, v_now,
    v_now + interval '12 hours', p_ip_address,
    pg_catalog.left(p_user_agent, 512), v_now
  );

  return v_otp_result || pg_catalog.jsonb_build_object('session_id', p_session_id);
exception
  when unique_violation then
    -- This exception block rolls back the nested OTP consumption as well.
    return pg_catalog.jsonb_build_object(
      'success', false,
      'reason', 'SESSION_ALREADY_REGISTERED',
      'message', 'This session or OTP challenge has already been registered.'
    );
end;
$register$;

alter function public.verify_and_register_superadmin_otp_session(
  uuid, uuid, text, text, timestamptz, varchar, text, text
) owner to postgres;
revoke execute on function public.verify_and_register_superadmin_otp_session(
  uuid, uuid, text, text, timestamptz, varchar, text, text
) from public, anon, authenticated;
grant execute on function public.verify_and_register_superadmin_otp_session(
  uuid, uuid, text, text, timestamptz, varchar, text, text
) to service_role;

create or replace function public.is_superadmin_session_active(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $session_check$
  select exists (
    select 1
      from auth.sessions as auth_session
      join auth.users as admin_user
        on admin_user.id = auth_session.user_id
       and admin_user.raw_app_meta_data ->> 'role' = 'superadmin'
      join public.superadmin_otp_sessions as otp_session
        on otp_session.session_id = auth_session.id
       and otp_session.admin_user_id = auth_session.user_id
     where auth_session.user_id = p_user_id
       and auth_session.id = p_session_id
       and otp_session.revoked_at is null
       and otp_session.expires_at > pg_catalog.clock_timestamp()
  );
$session_check$;

alter function public.is_superadmin_session_active(uuid, uuid) owner to postgres;
revoke execute on function public.is_superadmin_session_active(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_superadmin_session_active(uuid, uuid)
  to service_role;

-- Final ACL assertions fail transactionally if effective privileges differ.
do $postcheck$
declare
  v_function record;
  v_signature regprocedure;
  v_count integer;
begin
  for v_function in
    select p.oid, p.proowner, p.prosecdef, p.proconfig
      from pg_catalog.pg_proc as p
     where p.oid in (
       'public.verify_and_consume_admin_otp(uuid,text,text,timestamptz,varchar)'::regprocedure,
       'public.verify_and_register_superadmin_otp_session(uuid,uuid,text,text,timestamptz,varchar,text,text)'::regprocedure,
       'public.is_superadmin_session_active(uuid,uuid)'::regprocedure
     )
  loop
    if v_function.proowner <> 'postgres'::regrole
       or not pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE') then
      raise exception 'Function owner or EXECUTE ACL postcheck failed for OID %.', v_function.oid;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_proc as p
     where p.oid = 'public.verify_and_consume_admin_otp(uuid,text,text,timestamptz,varchar)'::regprocedure
       and not p.prosecdef
       and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'OTP function must remain SECURITY INVOKER with an empty search_path.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as p
     where p.oid in (
       'public.verify_and_register_superadmin_otp_session(uuid,uuid,text,text,timestamptz,varchar,text,text)'::regprocedure,
       'public.is_superadmin_session_active(uuid,uuid)'::regprocedure
     )
       and (not p.prosecdef or not (p.proconfig @> array['search_path=""']))
  ) then
    raise exception 'SECURITY DEFINER function or empty search_path postcheck failed.';
  end if;

  v_signature := pg_catalog.to_regprocedure(
    'public.verify_and_consume_admin_otp(uuid,text,text,timestamptz,character varying)'
  );
  if exists (
    select 1
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'verify_and_consume_admin_otp'
       and p.oid <> v_signature::oid
  ) then
    raise exception 'Unexpected OTP RPC overload exists after migration.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class as c
     where c.oid = 'public.superadmin_otp_sessions'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on superadmin_otp_sessions.';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.superadmin_otp_sessions', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.superadmin_otp_sessions', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.superadmin_otp_sessions', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.superadmin_otp_sessions', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.superadmin_otp_sessions', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.superadmin_otp_sessions', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.superadmin_otp_sessions', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.superadmin_otp_sessions', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.superadmin_otp_sessions', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.superadmin_otp_sessions', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.superadmin_otp_sessions', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.superadmin_otp_sessions', 'UPDATE')
     or not pg_catalog.has_table_privilege('postgres', 'public.superadmin_otp_sessions', 'SELECT')
     or not pg_catalog.has_table_privilege('postgres', 'public.superadmin_otp_sessions', 'INSERT') then
    raise exception 'superadmin_otp_sessions RLS/table privileges do not match the backend contract.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies as policy
     where policy.schemaname = 'public'
       and policy.tablename = 'superadmin_otp_sessions'
  ) then
    raise exception 'Unexpected RLS policies exist on superadmin_otp_sessions.';
  end if;
  if not pg_catalog.has_function_privilege(
    'postgres',
    'public.verify_and_consume_admin_otp(uuid,text,text,timestamptz,varchar)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'postgres cannot execute the nested OTP verification function.';
  end if;
  if pg_catalog.has_table_privilege('service_role', 'auth.sessions', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'auth.users', 'SELECT') then
    raise exception 'service_role unexpectedly has direct privileges on auth tables.';
  end if;
  select count(*) into v_count
    from information_schema.columns as c
   where c.table_schema = 'public'
     and c.table_name = 'audit_logs';
  if v_count <> 14 then
    raise exception 'audit_logs has % columns after migration; expected 14.', v_count;
  end if;
end
$postcheck$;
