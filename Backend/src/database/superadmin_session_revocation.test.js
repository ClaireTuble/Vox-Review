import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("./superadmin_session_revocation.sql", import.meta.url);

test("Super Admin session RPC exposes only a boolean and matches user and session IDs", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /returns boolean/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=\s*''/i);
  assert.match(sql, /from auth\.sessions as active_session/i);
  assert.match(sql, /active_session\.user_id\s*=\s*p_user_id/i);
  assert.match(sql, /active_session\.id\s*=\s*p_session_id/i);
  assert.doesNotMatch(sql, /returns table|returns setof/i);
});

test("Super Admin session RPC execution is restricted to the server service role", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(
    sql,
    /revoke execute on function public\.is_superadmin_session_active\(uuid,\s*uuid\)\s+from public,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.is_superadmin_session_active\(uuid,\s*uuid\)\s+to service_role/i,
  );
});
