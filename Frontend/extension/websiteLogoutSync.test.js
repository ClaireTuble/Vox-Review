import assert from "node:assert/strict";
import test from "node:test";
import { removeMatchingWebsiteLogoutSession } from "./websiteLogoutSync.js";

function createStorage(session) {
  const values = new Map([["voxreview_auth_session", session]]);
  const removals = [];
  return {
    removals,
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, values.get(key)]));
    },
    async remove(keys) {
      removals.push(keys);
      for (const key of keys) values.delete(key);
    },
    read(key) {
      return values.get(key);
    },
  };
}

test("matching website logout removes the regular extension session before revocation work", async () => {
  const session = {
    user: { id: "user-a", role: "user" },
    token: "access-a",
    refresh_token: "refresh-a",
  };
  const storage = createStorage(session);
  let releaseRevocationWork;
  let revocationWorkStarted;
  const revocationWork = new Promise((resolve) => {
    releaseRevocationWork = resolve;
  });
  const started = new Promise((resolve) => {
    revocationWorkStarted = resolve;
  });
  const pending = removeMatchingWebsiteLogoutSession({
    storage,
    userId: "user-a",
    queueAuthLogout: async () => {
      revocationWorkStarted();
      return revocationWork;
    },
    markAuthUserLoggedOut: async () => {},
  });

  await started;
  assert.equal(storage.read("voxreview_auth_session"), undefined);
  assert.deepEqual(storage.removals, [["voxreview_auth_session"]]);

  releaseRevocationWork();
  assert.equal(await pending, true);
});

test("website logout does not remove a different user's extension session", async () => {
  const storage = createStorage({
    user: { id: "user-b", role: "user" },
    token: "access-b",
    refresh_token: "refresh-b",
  });
  let revocationQueued = false;

  const matched = await removeMatchingWebsiteLogoutSession({
    storage,
    userId: "user-a",
    queueAuthLogout: async () => {
      revocationQueued = true;
    },
    markAuthUserLoggedOut: async () => {},
  });

  assert.equal(matched, false);
  assert.equal(revocationQueued, false);
  assert.deepEqual(storage.removals, []);
  assert.equal(storage.read("voxreview_auth_session").user.id, "user-b");
});
