import assert from "node:assert/strict";
import test from "node:test";
import { restorePersistedExtensionSession } from "./extensionSessionRestore.js";

function createStorage(session) {
  let current = session;
  const removals = [];
  return {
    removals,
    async get() {
      return { voxreview_auth_session: current };
    },
    async remove(key) {
      removals.push(key);
      current = null;
    },
    get current() {
      return current;
    },
  };
}

test("valid persisted session restores only after server validation", async () => {
  const session = { user: { id: "user-1" }, token: "access-1", refresh_token: "refresh-1" };
  const storage = createStorage(session);
  let persisted = null;
  const result = await restorePersistedExtensionSession({
    storage,
    storageKey: "voxreview_auth_session",
    validateSession: async () => ({ status: "valid", user: session.user, session }),
    persistSession: async (value) => {
      persisted = value;
      return value;
    },
    clearSession: async () => storage.remove("voxreview_auth_session"),
  });

  assert.equal(result.user.id, "user-1");
  assert.equal(persisted.user.id, "user-1");
  assert.deepEqual(storage.removals, []);
});

test("temporary verification failure preserves credentials and a later retry can restore", async () => {
  const session = { user: { id: "user-1" }, token: "access-1", refresh_token: "refresh-1" };
  const storage = createStorage(session);
  let attempt = 0;
  const options = {
    storage,
    storageKey: "voxreview_auth_session",
    validateSession: async () => {
      attempt += 1;
      return attempt === 1
        ? { status: "unavailable", reason: "refresh_failed" }
        : { status: "valid", user: session.user, session };
    },
    persistSession: async (value) => value,
    clearSession: async () => storage.remove("voxreview_auth_session"),
  };

  const temporary = await restorePersistedExtensionSession(options);
  assert.deepEqual(temporary, { status: "unavailable", reason: "refresh_failed" });
  assert.equal(storage.current, session);
  assert.deepEqual(storage.removals, []);

  const retried = await restorePersistedExtensionSession(options);
  assert.equal(retried.user.id, "user-1");
  assert.equal(attempt, 2);
});

test("confirmed invalidation clears only the persisted rejected session", async () => {
  const session = { user: { id: "user-1" }, token: "access-1", refresh_token: "revoked" };
  const storage = createStorage(session);
  const result = await restorePersistedExtensionSession({
    storage,
    storageKey: "voxreview_auth_session",
    validateSession: async () => ({ status: "invalid" }),
    persistSession: async () => assert.fail("Invalid sessions must not be persisted."),
    clearSession: async (candidate) => {
      assert.equal(candidate.user.id, "user-1");
      await storage.remove("voxreview_auth_session");
    },
  });

  assert.equal(result, null);
  assert.equal(storage.current, null);
  assert.deepEqual(storage.removals, ["voxreview_auth_session"]);
});
