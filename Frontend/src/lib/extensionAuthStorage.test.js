import assert from "node:assert/strict";
import test from "node:test";
import { createChromeAuthStorage, isNewerAuthSession } from "./extensionAuthStorage.js";

function createJwt(exp) {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `header.${payload}.signature`;
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, values.get(key)]));
    },
    async set(value) {
      writes.push(value);
      for (const [key, session] of Object.entries(value)) values.set(key, session);
    },
    async remove(keys) {
      for (const key of keys) values.delete(key);
    },
    read(key) {
      return values.get(key);
    },
  };
}

test("Chrome storage adapter restores persisted sessions and awaits durable token writes", async () => {
  const session = {
    user: { id: "user-1" },
    access_token: createJwt(200),
    refresh_token: "refresh-new",
    expires_at: 200,
  };
  const storage = createStorage();
  const adapter = createChromeAuthStorage(storage);
  let writeFinished = false;
  const delayedStorage = {
    ...storage,
    async set(value) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.set(value);
      writeFinished = true;
    },
    get: storage.get,
    remove: storage.remove,
  };
  const delayedAdapter = createChromeAuthStorage(delayedStorage);

  await delayedAdapter.setItem("voxreview_auth_session", JSON.stringify(session));
  assert.equal(writeFinished, true);
  assert.equal(storage.read("voxreview_auth_session").token, session.access_token);
  const restored = JSON.parse(await adapter.getItem("voxreview_auth_session"));
  assert.equal(restored.access_token, session.access_token);
  assert.equal(restored.refresh_token, session.refresh_token);
});

test("stale session copies cannot replace a newer persisted rotation", async () => {
  const latest = {
    user: { id: "user-1" },
    access_token: createJwt(300),
    refresh_token: "refresh-new",
    expires_at: 300,
  };
  const stale = {
    user: { id: "user-1" },
    access_token: createJwt(200),
    refresh_token: "refresh-old",
    expires_at: 200,
  };
  const storage = createStorage({ voxreview_auth_session: latest });
  const adapter = createChromeAuthStorage(storage);

  await adapter.setItem("voxreview_auth_session", JSON.stringify(stale));

  assert.equal(storage.read("voxreview_auth_session").refresh_token, "refresh-new");
  assert.equal(storage.writes.length, 0);
  assert.equal(isNewerAuthSession(stale, latest), false);
});

test("equal-expiry tokens with different access credentials are treated as stale", () => {
  assert.equal(isNewerAuthSession({
    user: { id: "user-1" },
    access_token: createJwt(200),
    refresh_token: "refresh-old",
  }, {
    user: { id: "user-1" },
    access_token: createJwt(200) + ".different",
    refresh_token: "refresh-new",
  }), false);
});
