import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controllerPaths = [
  new URL("./adminUsersController.js", import.meta.url),
  new URL("./adminDashboardController.js", import.meta.url),
];

test("both Super Admin views use the shared metadata fallback without changing user separation", async () => {
  const [adminUsersController, adminDashboardController] = await Promise.all(
    controllerPaths.map((path) => readFile(path, "utf8")),
  );

  for (const source of [adminUsersController, adminDashboardController]) {
    assert.match(source, /import \{ resolveAdminUserDisplayName \} from "\.\.\/utils\/adminUserDisplayName\.js"/);
    assert.match(source, /publicFullName:\s*(?:user|u)\.full_name/);
    assert.match(source, /userMetadata:\s*authMeta\.userMetadata/);
    assert.match(source, /return !isSuperAdminAuth && !isSuperAdminRole/);
  }

  assert.match(adminUsersController, /app_metadata\?\.role === "superadmin"/);
  assert.match(adminDashboardController, /app_metadata\?\.role === "superadmin"/);
});
