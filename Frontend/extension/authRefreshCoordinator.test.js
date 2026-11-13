import assert from "node:assert/strict";
import test from "node:test";
import { createAuthRefreshCoordinator } from "./authRefreshCoordinator.js";

function createJwt(exp) {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `header.${payload}.signature`;
}

function createHarness({
  session = {
    user: { id: "user-1" },
    token: createJwt(100),
    access_token: createJwt(100),
    refresh_token: "refresh-old",
    expires_at: 100,
  },
  fetchImpl,
} = {}) {
  let current = session;
  const writes = [];
  const coordinator = createAuthRefreshCoordinator({
    getSession: async () => current,
    setSession: async (value) => {
      writes.push(value);
      current = value;
    },
    removeSession: async () => {
      current = null;
    },
    fetchImpl: fetchImpl || (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: createJwt(300),
        refresh_token: "refresh-new",
        expires_at: 300,
        expires_in: 200,
      }),
    })),
    supabaseUrl: "https://supabase.example",
    anonKey: "public-anon-key",
  });
  return {
    coordinator,
    writes,
    get session() { return current; },
  };
}

test("refresh persists rotated credentials before returning success", async () => {
  const harness = createHarness();
  const result = await harness.coordinator.refresh({
    userId: "user-1",
    refreshToken: "refresh-old",
  });

  assert.equal(result.status, 200);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.session.refresh_token, "refresh-new");
  assert.equal(result.body.refresh_token, "refresh-new");
});

test("refresh requests from separate contexts serialize and reuse the winning rotation", async () => {
  let refreshRequests = 0;
  let releaseRefresh;
  const pendingResponse = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  const harness = createHarness({
    fetchImpl: async () => {
      refreshRequests += 1;
      await pendingResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: createJwt(300),
          refresh_token: "refresh-new",
          expires_at: 300,
          expires_in: 200,
        }),
      };
    },
  });

  const firstContext = harness.coordinator.refresh({
    userId: "user-1",
    refreshToken: "refresh-old",
  });
  const secondContext = harness.coordinator.refresh({
    userId: "user-1",
    refreshToken: "refresh-old",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  releaseRefresh();
  const [first, second] = await Promise.all([firstContext, secondContext]);

  assert.equal(refreshRequests, 1);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.refresh_token, "refresh-new");
  assert.equal(second.body.refresh_token, "refresh-new");
});

test("a stale token copy receives the current rotation without consuming the old token", async () => {
  const harness = createHarness({
    session: {
      user: { id: "user-1" },
      token: createJwt(300),
      access_token: createJwt(300),
      refresh_token: "refresh-new",
      expires_at: 300,
    },
    fetchImpl: async () => {
      assert.fail("A stale token must not be sent to Supabase.");
    },
  });

  const result = await harness.coordinator.refresh({
    userId: "user-1",
    refreshToken: "refresh-old",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.refresh_token, "refresh-new");
  assert.equal(harness.writes.length, 0);
});

test("temporary provider failures preserve persisted credentials for retry", async () => {
  const harness = createHarness({
    fetchImpl: async () => {
      throw new TypeError("network unavailable");
    },
  });

  const result = await harness.coordinator.refresh({
    userId: "user-1",
    refreshToken: "refresh-old",
  });

  assert.equal(result.status, 503);
  assert.equal(harness.session.refresh_token, "refresh-old");
  assert.equal(harness.writes.length, 0);
});

test("a stale session copy queued after a newer rotation cannot replace it", async () => {
  const harness = createHarness();
  await harness.coordinator.refresh({ userId: "user-1", refreshToken: "refresh-old" });
  const persisted = await harness.coordinator.persistSession({
    user: { id: "user-1" },
    token: createJwt(100),
    refresh_token: "refresh-old",
    expires_at: 100,
  });

  assert.equal(persisted, false);
  assert.equal(harness.session.refresh_token, "refresh-new");
});

test("matching-session cleanup is serialized with refresh and prevents resurrection", async () => {
  const harness = createHarness();
  const refreshPromise = harness.coordinator.refresh({
    userId: "user-1",
    refreshToken: "refresh-old",
  });
  const clearPromise = harness.coordinator.clearSession({
    userId: "user-1",
  });

  await refreshPromise;
  assert.equal(await clearPromise, true);
  assert.equal(harness.session, null);
});
