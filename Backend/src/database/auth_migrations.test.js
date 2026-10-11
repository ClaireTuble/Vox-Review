import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPaths = [
  new URL("./regular_user_auth.sql", import.meta.url),
  new URL("./manage_users_foundation.sql", import.meta.url),
];
const googleProfileTriggerPath = new URL("./google_auth_profile_trigger.sql", import.meta.url);

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

test("proposed Google profile trigger preserves linking and defaults without trusting metadata roles", async () => {
  const migration = await readFile(googleProfileTriggerPath, "utf8");
  const definition = migration.match(
    /create or replace function public\.handle_new_auth_user\(\)[\s\S]*?^\$\$;/m,
  )?.[0];

  assert.ok(definition);
  assert.match(definition, /security definer/i);
  assert.match(definition, /where u\.auth_user_id = new\.id/);
  assert.match(definition, /where email = new\.email\s+and auth_user_id is null/);
  assert.match(definition, /insert into public\.users \(auth_user_id, email, full_name, avatar_url\)/i);
  assert.doesNotMatch(definition, /raw_user_meta_data->>'role'|status\s*[=,)]|role\s*[=,)]/i);
  assert.match(definition, /raw_user_meta_data->>'firstName'/);
  assert.match(definition, /raw_user_meta_data->>'lastName'/);
  assert.match(definition, /raw_user_meta_data->>'avatar_url'/);
});

test("new Auth users receive metadata name and avatar with ordered provider fallbacks", async () => {
  const migration = await readFile(googleProfileTriggerPath, "utf8");
  const definition = migration.match(
    /create or replace function public\.handle_new_auth_user\(\)[\s\S]*?^\$\$;/m,
  )?.[0];

  assert.ok(definition);
  assert.match(
    definition,
    /insert into public\.users \(auth_user_id, email, full_name, avatar_url\)\s+values \(new\.id, new\.email, v_full_name, v_avatar_url\)/i,
  );
  assert.match(
    definition,
    /v_full_name := coalesce\([\s\S]*?raw_user_meta_data->>'full_name'[\s\S]*?raw_user_meta_data->>'name'[\s\S]*?raw_user_meta_data->>'username'[\s\S]*?split_part\(coalesce\(new\.email, ''\), '@', 1\)/,
  );
  assert.match(
    definition,
    /v_avatar_url := coalesce\([\s\S]*?raw_user_meta_data->>'custom_avatar_url'[\s\S]*?raw_user_meta_data->>'avatar_url'[\s\S]*?raw_user_meta_data->>'picture'/,
  );
});

test("existing nonblank profile name and avatar win over Auth metadata in every write path", async () => {
  const migration = await readFile(googleProfileTriggerPath, "utf8");
  const definition = migration.match(
    /create or replace function public\.handle_new_auth_user\(\)[\s\S]*?^\$\$;/m,
  )?.[0];

  assert.ok(definition);
  assert.equal(
    (definition.match(/full_name = coalesce\(nullif\(trim\((?:public\.users\.)?full_name\), ''\), (?:v_full_name|excluded\.full_name)\)/g) || []).length,
    3,
  );
  assert.equal(
    (definition.match(/avatar_url = coalesce\(nullif\(trim\((?:public\.users\.)?avatar_url\), ''\), (?:v_avatar_url|excluded\.avatar_url)\)/g) || []).length,
    3,
  );
});

test("NULL or blank stored profile values are eligible for Auth metadata backfill", async () => {
  const migration = await readFile(googleProfileTriggerPath, "utf8");
  const definition = migration.match(
    /create or replace function public\.handle_new_auth_user\(\)[\s\S]*?^\$\$;/m,
  )?.[0];

  assert.ok(definition);
  assert.match(definition, /nullif\(trim\(full_name\), ''\), v_full_name/);
  assert.match(definition, /nullif\(trim\(avatar_url\), ''\), v_avatar_url/);
  assert.match(definition, /nullif\(trim\(public\.users\.full_name\), ''\), excluded\.full_name/);
  assert.match(definition, /nullif\(trim\(public\.users\.avatar_url\), ''\), excluded\.avatar_url/);
});

test("blank Auth last name produces a trimmed first-name-only profile name", async () => {
  const migration = await readFile(googleProfileTriggerPath, "utf8");
  const definition = migration.match(
    /create or replace function public\.handle_new_auth_user\(\)[\s\S]*?^\$\$;/m,
  )?.[0];

  assert.ok(definition);
  assert.match(definition, /v_first_name := nullif\(trim\(new\.raw_user_meta_data->>'firstName'\), ''\)/);
  assert.match(definition, /v_last_name\s*:= nullif\(trim\(new\.raw_user_meta_data->>'lastName'\), ''\)/);
  assert.match(definition, /nullif\(trim\(concat_ws\(' ', v_first_name, v_last_name\)\), ''\)/);
});
