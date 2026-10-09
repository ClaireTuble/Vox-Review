import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./authSync.js", import.meta.url), "utf8");
const appOrigin = "https://voxreview.example";

function assertJsonEqual(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function createAuthSyncContext({
  websiteSession = null,
  extensionSession = null,
  loggedOutUserIds = [],
} = {}) {
  const eventHandlers = new Map();
  let messageHandler = null;
  const writes = [];
  const removals = [];
  const sentMessages = [];
  const dispatchedEvents = [];
  const storage = {
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [
        key,
        key === "voxreview_auth_session" ? extensionSession : loggedOutUserIds,
      ]));
    },
    async set(value) {
      writes.push(value);
    },
    async remove(keys) {
      removals.push(keys);
    },
  };
  const window = {
    location: { origin: appOrigin },
    localStorage: {
      getItem(key) {
        assert.equal(key, "user_auth_session");
        return websiteSession ? JSON.stringify(websiteSession) : null;
      },
    },
    addEventListener(type, handler) {
      eventHandlers.set(type, handler);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    },
  };
  class MockCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  const chrome = {
    runtime: {
      id: "extension-id",
      sendMessage: async (message) => {
        sentMessages.push(message);
      },
      onMessage: {
        addListener(handler) {
          messageHandler = handler;
        },
      },
    },
    storage: { local: storage },
  };
  const context = { window, chrome, CustomEvent: MockCustomEvent, console: { warn() {} } };
  vm.createContext(context);
  vm.runInContext(source.replace("__VOXREVIEW_APP_ORIGIN__", JSON.stringify(appOrigin)), context);
  return {
    eventHandlers,
    get messageHandler() { return messageHandler; },
    writes,
    removals,
    sentMessages,
    dispatchedEvents,
    window,
    chrome,
    MockCustomEvent,
  };
}

test("website sign-in sync reads credentials locally instead of putting tokens in messages", async () => {
  const session = {
    user: { id: "user-a", role: "user" },
    token: "access-secret",
    refresh_token: "refresh-secret",
  };
  const context = createAuthSyncContext({ websiteSession: session });
  const event = {
    target: context.window,
    detail: { action: "session_updated", userId: "user-a" },
  };

  await context.eventHandlers.get("voxreview_auth_sync")(event);

  assertJsonEqual(context.writes, [{ voxreview_auth_session: session }]);
  assert.deepEqual(context.sentMessages, []);
  assert.deepEqual(event.detail, { action: "session_updated", userId: "user-a" });
  assert.equal(JSON.stringify(event.detail).includes("access-secret"), false);
  assert.equal(JSON.stringify(event.detail).includes("refresh-secret"), false);
});

test("website logout propagates for the matching extension user without forwarding credentials", async () => {
  const session = {
    user: { id: "user-a", role: "user" },
    token: "access-secret",
    refresh_token: "refresh-secret",
  };
  const context = createAuthSyncContext({
    websiteSession: session,
    extensionSession: session,
  });
  const event = {
    target: context.window,
    detail: { action: "signed_out", userId: "user-a" },
  };

  await context.eventHandlers.get("voxreview_auth_sync")(event);

  assertJsonEqual(context.sentMessages, [{
    type: "websiteLogoutSync",
    userId: "user-a",
  }]);
  assert.equal(JSON.stringify(context.sentMessages).includes("access-secret"), false);
  assert.equal(JSON.stringify(context.sentMessages).includes("refresh-secret"), false);
});

test("website logout leaves a different extension user's session untouched", async () => {
  const extensionSession = {
    user: { id: "user-b", role: "user" },
    token: "access-secret",
    refresh_token: "refresh-secret",
  };
  const context = createAuthSyncContext({
    websiteSession: { user: { id: "user-a", role: "user" } },
    extensionSession,
  });

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "signed_out", userId: "user-a" },
  });

  assertJsonEqual(context.sentMessages, []);
  assertJsonEqual(context.removals, []);
});

test("website login does not silently replace another extension user's session", async () => {
  const context = createAuthSyncContext({
    websiteSession: {
      user: { id: "user-a", role: "user" },
      token: "access-a",
      refresh_token: "refresh-a",
    },
    extensionSession: {
      user: { id: "user-b", role: "user" },
      token: "access-b",
      refresh_token: "refresh-b",
    },
  });

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "session_updated", userId: "user-a" },
  });

  assertJsonEqual(context.writes, []);
});

test("restored website sessions cannot revive an identity with a durable logout marker", async () => {
  const context = createAuthSyncContext({
    websiteSession: {
      user: { id: "user-a", role: "user" },
      token: "access-a",
      refresh_token: "refresh-a",
    },
    loggedOutUserIds: ["user-a"],
  });

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "session_updated", userId: "user-a" },
  });

  assert.equal(context.dispatchedEvents.length, 1);
  assert.equal(context.dispatchedEvents[0].type, "voxreview_extension_logout");
  assertJsonEqual(context.dispatchedEvents[0].detail, { userId: "user-a" });
  assertJsonEqual(context.writes, []);
});

test("a logout marker for one identity does not sign out another website user", async () => {
  const session = {
    user: { id: "user-b", role: "user" },
    token: "access-b",
    refresh_token: "refresh-b",
  };
  const context = createAuthSyncContext({
    websiteSession: session,
    loggedOutUserIds: ["user-a"],
  });

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "session_updated", userId: "user-b" },
  });

  assert.equal(context.dispatchedEvents.length, 0);
  assertJsonEqual(context.writes, [{ voxreview_auth_session: session }]);
});

test("explicit website sign-in clears only the matching logout marker", async () => {
  const context = createAuthSyncContext({
    websiteSession: {
      user: { id: "user-a", role: "user" },
      token: "access-a",
      refresh_token: "refresh-a",
    },
    loggedOutUserIds: ["user-a"],
  });

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "session_updated", userId: "user-a", clearLogoutMarker: true },
  });

  assertJsonEqual(context.writes, [{
    voxreview_auth_session: {
      user: { id: "user-a", role: "user" },
      token: "access-a",
      refresh_token: "refresh-a",
    },
  }]);
  assertJsonEqual(context.sentMessages, [{
    type: "websiteLoginSync",
    userId: "user-a",
  }]);
});

test("extension logout notifies the website with identity only", () => {
  const context = createAuthSyncContext();

  context.messageHandler(
    { type: "extensionLogoutSync", userId: "user-a", token: "must-not-be-sent" },
    { id: "extension-id" },
  );

  assert.equal(context.dispatchedEvents.length, 1);
  assert.equal(context.dispatchedEvents[0].type, "voxreview_extension_logout");
  assertJsonEqual(context.dispatchedEvents[0].detail, { userId: "user-a" });

  context.messageHandler(
    { type: "extensionLogoutSync", userId: "user-a" },
    { id: "untrusted-extension" },
  );
  assert.equal(context.dispatchedEvents.length, 1);
});
