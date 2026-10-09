import assert from "node:assert/strict";
import test from "node:test";
import { revokePendingAuthSessions } from "./authSessionRevocation.js";

function createToken(expirySeconds) {
  const payload = btoa(JSON.stringify({ exp: expirySeconds }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `header.${payload}.signature`;
}

test("refreshes expired sessions before globally revoking them", async () => {
  const calls = [];
  const result = await revokePendingAuthSessions({
    sessions: [{
      userId: "user-1",
      token: createToken(1),
      refresh_token: "refresh-1",
    }],
    supabaseUrl: "https://auth.example",
    anonKey: "public-key",
    now: 10_000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/token?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: createToken(100),
            refresh_token: "refresh-2",
          }),
        };
      }
      return { ok: true, status: 204 };
    },
  });

  assert.deepEqual(result, { remaining: [], revokedUserIds: ["user-1"] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body, JSON.stringify({ refresh_token: "refresh-1" }));
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${createToken(100)}`);
});

test("treats an expired or revoked refresh token as already signed out", async () => {
  const result = await revokePendingAuthSessions({
    sessions: [{
      userId: "user-2",
      token: createToken(1),
      refresh_token: "revoked-refresh",
    }],
    supabaseUrl: "https://auth.example",
    anonKey: "public-key",
    now: 10_000,
    fetchImpl: async () => ({ ok: false, status: 400 }),
  });

  assert.deepEqual(result, { remaining: [], revokedUserIds: ["user-2"] });
});

test("retains pending revocation for retry after a temporary network failure", async () => {
  const queued = {
    userId: "user-3",
    token: createToken(100),
    refresh_token: "refresh-3",
  };
  const result = await revokePendingAuthSessions({
    sessions: [queued],
    supabaseUrl: "https://auth.example",
    anonKey: "public-key",
    now: 10_000,
    fetchImpl: async () => {
      throw new TypeError("network unavailable");
    },
  });

  assert.deepEqual(result, { remaining: [queued], revokedUserIds: [] });
});

test("retains one user's pending revocation without affecting another identity", async () => {
  const tokenA = createToken(100);
  const tokenB = createToken(101);
  const sessions = [
    { userId: "user-a", token: tokenA, refresh_token: "refresh-a" },
    { userId: "user-b", token: tokenB, refresh_token: "refresh-b" },
  ];
  const result = await revokePendingAuthSessions({
    sessions,
    supabaseUrl: "https://auth.example",
    anonKey: "public-key",
    now: 10_000,
    fetchImpl: async (_url, options) => (
      options.headers.Authorization.endsWith(tokenA)
        ? { ok: true, status: 204 }
        : { ok: false, status: 503 }
    ),
  });

  assert.deepEqual(result.revokedUserIds, ["user-a"]);
  assert.deepEqual(result.remaining, [sessions[1]]);
});
