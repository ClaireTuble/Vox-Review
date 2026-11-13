import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentSuperAdminAccessToken } from "./superAdminAccessToken.js";

test("uses only the current Supabase Super Admin session token", async () => {
  const token = await getCurrentSuperAdminAccessToken({
    async getSession() {
      return {
        data: {
          session: {
            access_token: "current-access-token",
            user: { app_metadata: { role: "superadmin" } },
          },
        },
        error: null,
      };
    },
  });

  assert.equal(token, "current-access-token");
});

test("refresh failure does not fall back to a persisted stale access token", async () => {
  const errors = [];
  const token = await getCurrentSuperAdminAccessToken({
    async getSession() {
      return {
        data: {
          session: {
            access_token: "stale-access-token",
            user: { app_metadata: { role: "superadmin" } },
          },
        },
        error: { code: "refresh_token_not_found" },
      };
    },
  }, (error) => errors.push(error.code));

  assert.equal(token, null);
  assert.deepEqual(errors, ["refresh_token_not_found"]);
});

test("waits for pending Supabase session restoration before returning a token", async () => {
  let releaseSession;
  let settled = false;
  const pendingSession = new Promise((resolve) => {
    releaseSession = resolve;
  });
  const tokenPromise = getCurrentSuperAdminAccessToken({
    getSession: () => pendingSession,
  }).then((token) => {
    settled = true;
    return token;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  releaseSession({
    data: {
      session: {
        access_token: "restored-access-token",
        user: { app_metadata: { role: "superadmin" } },
      },
    },
    error: null,
  });
  assert.equal(await tokenPromise, "restored-access-token");
});

test("does not return a token from a non-Super Admin session", async () => {
  const token = await getCurrentSuperAdminAccessToken({
    async getSession() {
      return {
        data: {
          session: {
            access_token: "regular-access-token",
            user: { app_metadata: { role: "user" } },
          },
        },
        error: null,
      };
    },
  });

  assert.equal(token, null);
});
