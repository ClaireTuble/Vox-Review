import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./authSync.js", import.meta.url), "utf8");
const manifestSource = await readFile(new URL("./manifest.json", import.meta.url), "utf8");
const viteConfigSource = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
const appOrigin = "https://voxreview.example";

function assertJsonEqual(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

test("refresh bridge is injected before website scripts can refresh independently", () => {
  const manifest = JSON.parse(manifestSource);
  const bridgeScript = manifest.content_scripts.find((script) =>
    script.js.includes("assets/authSync.js"));

  assert.equal(bridgeScript?.run_at, "document_start");
  assert.match(viteConfigSource, /js: \["assets\/authSync\.js"\],[\s\S]*?run_at: "document_start"/);
  assert.match(source, /new window\.MutationObserver/);
});

function createAuthSyncContext({
  websiteSession = null,
  extensionSession = null,
  loggedOutUserIds = [],
  messageResult = { status: 200, body: { access_token: "rotated-access", refresh_token: "rotated-refresh" } },
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
        if (message.type === "persistAuthSession") return { ok: true, persisted: true };
        return messageResult;
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

test("website sign-in sync persists credentials through the trusted extension worker", async () => {
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

  assert.deepEqual(context.writes, []);
  assertJsonEqual(context.sentMessages, [{
    type: "persistAuthSession",
    session,
    allowUserReplacement: false,
  }]);
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

test("website logout forwards the event directly for background identity validation", async () => {
  const context = createAuthSyncContext();

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "signed_out", userId: "user-a" },
  });

  assertJsonEqual(context.sentMessages, [{
    type: "websiteLogoutSync",
    userId: "user-a",
  }]);
});

test("website logout forwards identity for background validation when extension has another user", async () => {
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

  assertJsonEqual(context.sentMessages, [{
    type: "websiteLogoutSync",
    userId: "user-a",
  }]);
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
  assert.deepEqual(context.writes, []);
  assertJsonEqual(context.sentMessages, [{
    type: "persistAuthSession",
    session,
    allowUserReplacement: false,
  }]);
});

test("explicit website sign-in clears only the matching logout marker", async () => {
  const session = {
    user: { id: "user-a", role: "user" },
    token: "access-a",
    refresh_token: "refresh-a",
  };
  const context = createAuthSyncContext({
    websiteSession: session,
    loggedOutUserIds: ["user-a"],
  });

  test("explicit website sign-in replaces a stale extension session for another user", async () => {
    const session = {
      user: { id: "user-a", role: "user" },
      token: "new-access-a",
      refresh_token: "new-refresh-a",
    };
    const context = createAuthSyncContext({
      websiteSession: session,
      extensionSession: {
        user: { id: "user-b", role: "user" },
        token: "old-access-b",
        refresh_token: "old-refresh-b",
      },
    });

    await context.eventHandlers.get("voxreview_auth_sync")({
      target: context.window,
      detail: { action: "session_updated", userId: "user-a", clearLogoutMarker: true },
    });

    assert.deepEqual(context.writes, []);
    assertJsonEqual(context.sentMessages, [{
      type: "persistAuthSession",
      session,
      allowUserReplacement: true,
    }, {
      type: "websiteLoginSync",
      userId: "user-a",
    }]);
  });

  await context.eventHandlers.get("voxreview_auth_sync")({
    target: context.window,
    detail: { action: "session_updated", userId: "user-a", clearLogoutMarker: true },
  });

  assert.deepEqual(context.writes, []);
  assertJsonEqual(context.sentMessages, [{
    type: "persistAuthSession",
    session,
    allowUserReplacement: true,
  }, {
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

test("website refresh requests are brokered through the extension background without token logging", async () => {
  const context = createAuthSyncContext();
  const refreshToken = "private-refresh-token";
  const request = new context.MockCustomEvent("voxreview_auth_refresh_request", {
    detail: {
      requestId: "request-1",
      userId: "user-a",
      refreshToken,
    },
  });
  request.target = context.window;

  await context.eventHandlers.get("voxreview_auth_refresh_request")(request);

  assertJsonEqual(context.sentMessages, [{
    type: "refreshAuthSession",
    userId: "user-a",
    refreshToken,
  }]);
  assert.equal(context.dispatchedEvents[0].type, "voxreview_auth_refresh_result");
  assertJsonEqual(context.dispatchedEvents[0].detail, {
    requestId: "request-1",
    result: {
      status: 200,
      body: { access_token: "rotated-access", refresh_token: "rotated-refresh" },
    },
  });
});

test("website auth synchronization cannot overwrite a newer stored token copy", async () => {
  const newer = {
    user: { id: "user-a", role: "user" },
    token: `header.${btoa(JSON.stringify({ exp: 300 })).replace(/=/g, "")}.sig`,
    refresh_token: "refresh-new",
    expires_at: 300,
  };
  const older = {
    user: { id: "user-a", role: "user" },
    token: `header.${btoa(JSON.stringify({ exp: 200 })).replace(/=/g, "")}.sig`,
    refresh_token: "refresh-old",
    expires_at: 200,
  };
  const context = createAuthSyncContext({
    websiteSession: older,
    extensionSession: newer,
  });
  const event = new context.MockCustomEvent("voxreview_auth_sync", {
    detail: { action: "session_updated", userId: "user-a" },
  });
  event.target = context.window;

  await context.eventHandlers.get("voxreview_auth_sync")(event);

  assert.deepEqual(context.writes, []);
});
