import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("./proposed_superadmin_otp_session_enforcement.sql", import.meta.url);
const serviceUrl = new URL("../services/adminTwoFactorService.js", import.meta.url);

test("OTP registration verifies and records the exact authenticated Supabase session atomically", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const service = await readFile(serviceUrl, "utf8");

  assert.match(sql, /create table if not exists public\.superadmin_otp_sessions/i);
  assert.match(sql, /session_id uuid primary key/i);
  assert.match(sql, /admin_user_id uuid not null references auth\.users\(id\)/i);
  assert.match(sql, /challenge_token_hash text not null unique/i);
  assert.match(sql, /p_admin_user_id uuid,[\s\S]*?p_session_id uuid,[\s\S]*?p_challenge_token_hash text/i);
  assert.match(sql, /auth_session\.user_id = p_admin_user_id[\s\S]*?auth_session\.id = p_session_id/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /v_otp_result := public\.verify_and_consume_admin_otp/i);
  assert.match(sql, /insert into public\.superadmin_otp_sessions/i);
  assert.match(sql, /when unique_violation then[\s\S]*?session_already_registered/i);
  assert.match(sql, /v_now \+ interval '12 hours'/i);
  assert.match(sql, /otp_session\.revoked_at is null/i);
  assert.match(sql, /otp_session\.expires_at > pg_catalog\.clock_timestamp\(\)/i);
  assert.match(service, /"verify_and_register_superadmin_otp_session"[\s\S]*?p_admin_user_id: adminUser\.id[\s\S]*?p_session_id: sessionId[\s\S]*?p_challenge_token_hash: challengeTokenHash[\s\S]*?p_submitted_otp_hash: submittedOtpHmac[\s\S]*?p_purpose: "login"/i);
  assert.doesNotMatch(sql, /superadmin_login_grants|complete_superadmin_otp_session/i);
});

test("migration preserves the deployed five-argument OTP RPC contract and password-change purpose", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const service = await readFile(serviceUrl, "utf8");

  assert.match(sql, /verify_and_consume_admin_otp\(uuid,text,text,timestamptz,character varying\)/i);
  assert.match(sql, /p_challenge_token_hash text,[\s\S]*?p_submitted_otp_hash text,[\s\S]*?p_now timestamptz[\s\S]*?p_purpose varchar/i);
  assert.match(service, /"verify_and_consume_admin_otp"[\s\S]*?p_admin_user_id:[\s\S]*?p_challenge_token_hash:[\s\S]*?p_submitted_otp_hash:[\s\S]*?p_now:[\s\S]*?p_purpose:\s*"password_change"/i);
  assert.match(service, /p_purpose:\s*"login"/i);
  assert.match(sql, /p_purpose is distinct from 'password_change'/i);
  assert.match(sql, /p_purpose is distinct from 'login'/i);
});

test("migration establishes explicit postgres ownership and narrowly grants RPC/table access", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /alter function public\.verify_and_consume_admin_otp\(uuid, text, text, timestamptz, varchar\)\s+owner to postgres/i);
  assert.match(sql, /alter function public\.verify_and_register_superadmin_otp_session\([\s\S]*?\)\s+owner to postgres/i);
  assert.match(sql, /alter function public\.is_superadmin_session_active\(uuid, uuid\) owner to postgres/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke execute on function public\.verify_and_register_superadmin_otp_session[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.verify_and_register_superadmin_otp_session[\s\S]*?to service_role/i);
  assert.match(sql, /revoke all on table public\.superadmin_otp_sessions[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant select, update on table public\.superadmin_otp_sessions to service_role/i);
  assert.match(sql, /grant select, insert on table public\.superadmin_otp_sessions to postgres/i);
  assert.match(sql, /service_role cannot|service_role receives no direct auth-schema privileges/i);
  assert.match(sql, /has_table_privilege\('service_role', 'auth\.sessions', 'SELECT'\)/i);
  assert.match(sql, /has_table_privilege\('service_role', 'auth\.users', 'SELECT'\)/i);
});

test("migration aborts on overload or schema drift, validates index definitions, and documents transactional recovery", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /Unexpected verify_and_consume_admin_otp overload found/i);
  assert.match(sql, /pg_get_indexdef/i);
  assert.match(sql, /pg_get_constraintdef/i);
  assert.match(sql, /expected exactly 9/i);
  assert.match(sql, /runner MUST execute the entire file transactionally/i);
  assert.match(sql, /Recovery is forward-only/i);
  assert.match(sql, /Do NOT restore the old permissive is_superadmin_session_active/i);
  assert.doesNotMatch(sql, /\bdrop\s+(?:table|function|index)\b/i);
  assert.doesNotMatch(sql, /\bdelete\s+from\s+public\.(?:admin_2fa_challenges|audit_logs)\b/i);
});
