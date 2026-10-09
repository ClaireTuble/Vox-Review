import assert from "node:assert/strict";
import test from "node:test";
import { createSuperAdminReauthenticator } from "./superAdminReauthentication.js";

const authUser = {
  id: "admin-123",
  email: "admin@example.com",
  app_metadata: { role: "superadmin" },
};

test("validates current Super Admin password through Supabase Auth without exposing credentials", async () => {
  let receivedCredentials;
  const verifyPassword = createSuperAdminReauthenticator({
    createAuthClient: () => ({
      auth: {
        signInWithPassword: async (credentials) => {
          receivedCredentials = credentials;
          return { data: { user: authUser }, error: null };
        },
      },
    }),
  });

  assert.equal(await verifyPassword(authUser, "entered-password"), true);
  assert.deepEqual(receivedCredentials, {
    email: authUser.email,
    password: "entered-password",
  });
});

test("rejects empty and incorrect confirmation passwords", async () => {
  let attempts = 0;
  const verifyPassword = createSuperAdminReauthenticator({
    createAuthClient: () => ({
      auth: {
        signInWithPassword: async () => {
          attempts += 1;
          return { data: { user: null }, error: new Error("Invalid login credentials") };
        },
      },
    }),
  });

  await assert.rejects(verifyPassword(authUser, ""), (error) => error.statusCode === 400);
  await assert.rejects(verifyPassword(authUser, "wrong-password"), (error) => error.statusCode === 403);
  assert.equal(attempts, 1);
});

test("rejects re-authentication for a different or non-admin identity", async () => {
  for (const returnedUser of [
    { ...authUser, id: "another-user" },
    { ...authUser, app_metadata: { role: "user" } },
  ]) {
    const verifyPassword = createSuperAdminReauthenticator({
      createAuthClient: () => ({
        auth: {
          signInWithPassword: async () => ({ data: { user: returnedUser }, error: null }),
        },
      }),
    });
    await assert.rejects(verifyPassword(authUser, "entered-password"), (error) => error.statusCode === 403);
  }
});
