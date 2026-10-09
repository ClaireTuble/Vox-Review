import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPaths = [
  new URL("./regular_user_auth.sql", import.meta.url),
  new URL("./manage_users_foundation.sql", import.meta.url),
];

async function getAuthTriggerDefinition(migrationPath) {
  const migration = await readFile(migrationPath, "utf8");
  const match = migration.match(/create or replace function public\.handle_new_auth_user\(\)[\s\S]*?^\$\$;/m);
  assert.ok(match, `Auth trigger function is missing from ${migrationPath.pathname}`);
  return match[0];
}

test("auth migrations define identical profile, avatar, and status trigger behavior", async () => {
  const [regularUserDefinition, foundationDefinition] = await Promise.all(
    migrationPaths.map(getAuthTriggerDefinition),
  );

  assert.equal(
    regularUserDefinition.replace(/\r\n/g, "\n"),
    foundationDefinition.replace(/\r\n/g, "\n"),
  );
});

test("auth foreign-key creation is guarded and repeatable in both migrations", async () => {
  for (const migrationPath of migrationPaths) {
    const migration = await readFile(migrationPath, "utf8");
    assert.match(migration, /if not exists\s*\([\s\S]*?pg_constraint[\s\S]*?conname = 'users_auth_user_fk'[\s\S]*?\)\s*then[\s\S]*?add constraint users_auth_user_fk/i);
  }
});
