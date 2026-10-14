import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "./revoke_public_user_table_client_privileges.sql",
  import.meta.url,
);

test("privilege hardening revokes client table, column, and sequence access", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(
    migration,
    /revoke all privileges on table public\.users, public\.user_activities\s+from anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke select \([\s\S]*?\), insert \([\s\S]*?\), update \([\s\S]*?\), references \([\s\S]*?\) on table public\.users\s+from anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke select \([\s\S]*?\), insert \([\s\S]*?\), update \([\s\S]*?\), references \([\s\S]*?\) on table public\.user_activities\s+from anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke all privileges on sequence public\.users_user_id_seq\s+from anon, authenticated;/i,
  );
  assert.doesNotMatch(migration, /\bservice_role\b/i);
});
