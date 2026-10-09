import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import { createGetAdminUsers } from "./adminUsersController.js";
import { createRequireSuperAdmin } from "../middleware/superAdminAuth.js";

function queryResult(result) {
  const query = {
    select() {
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

test("authorized Super Admin can still retrieve user history and activity", async () => {
  const originalEnvironment = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_URL = "https://example.invalid";

  const admin = { id: "admin-auth-id", app_metadata: { role: "superadmin" } };
  const userRecord = {
    user_id: "app-user-id",
    auth_user_id: "user-auth-id",
    email: "user@example.invalid",
    created_at: "2025-01-01T00:00:00.000Z",
  };
  const activity = {
    id: "activity-id",
    user_id: "app-user-id",
    platform: "Steam",
    activity_type: "analysis",
    created_at: new Date().toISOString(),
    product_title: "Test Game",
    product_url: "https://example.invalid/game",
  };

  const handler = createGetAdminUsers({
    createSupabaseClient: () => ({
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [
                admin,
                { id: userRecord.auth_user_id, email: userRecord.email, user_metadata: {} },
              ],
            },
          }),
        },
      },
      from(table) {
        return queryResult({
          data: table === "users" ? [userRecord] : [activity],
          error: null,
        });
      },
    }),
    writeAuditLog: async () => {},
  });
  const app = express();
  app.get(
    "/api/admin/users",
    createRequireSuperAdmin({
      getUser: async () => ({ data: { user: admin }, error: null }),
    }),
    handler,
  );

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/users`, {
      headers: { Authorization: "Bearer test-admin-token" },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.users.length, 1);
    assert.equal(body.users[0].user_id, "app-user-id");
    assert.deepEqual(body.users[0].activities.map(({ id, platform, activity_type }) => ({
      id,
      platform,
      activity_type,
    })), [{
      id: "activity-id",
      platform: "Steam",
      activity_type: "analysis",
    }]);
  } finally {
    server.close();
    await once(server, "close");
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
