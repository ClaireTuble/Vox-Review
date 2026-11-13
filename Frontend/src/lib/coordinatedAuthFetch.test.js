import assert from "node:assert/strict";
import test from "node:test";
import { createCoordinatedAuthFetch } from "./coordinatedAuthFetch.js";

function createWindow({ bridgeReady = true, sendMessageResult } = {}) {
  const handlers = new Map();
  const windowRef = {
    location: { origin: "https://voxreview.example" },
    document: {
      documentElement: { dataset: { voxreviewExtensionAuthBridge: bridgeReady ? "ready" : "" } },
    },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    removeEventListener(type) {
      handlers.delete(type);
    },
    dispatchEvent(event) {
      event.target = windowRef;
      if (event.type === "voxreview_auth_refresh_request") {
        Promise.resolve(sendMessageResult).then((result) => {
          handlers.get("voxreview_auth_refresh_result")?.({
            target: windowRef,
            detail: {
              requestId: event.detail.requestId,
              result,
            },
          });
        });
      } else {
        handlers.get(event.type)?.(event);
      }
    },
  };
  class MockCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  return { windowRef, MockCustomEvent };
}

test("website refresh uses the extension broker when installed", async () => {
  const brokerResult = {
    status: 200,
    body: { access_token: "new-access", refresh_token: "new-refresh" },
  };
  const { windowRef, MockCustomEvent } = createWindow({ sendMessageResult: brokerResult });
  let directRefreshCalls = 0;
  const coordinatedFetch = createCoordinatedAuthFetch({
    fetchImpl: async () => {
      directRefreshCalls += 1;
      throw new Error("refresh must be coordinated");
    },
    runtime: null,
    windowRef,
    localStorageRef: {
      getItem: () => JSON.stringify({ user: { id: "user-1" } }),
    },
    CustomEventCtor: MockCustomEvent,
    extensionRuntime: false,
    timeoutMs: 20,
  });

  const response = await coordinatedFetch(
    "https://supabase.example/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: JSON.stringify({ refresh_token: "old-refresh" }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), brokerResult.body);
  assert.equal(directRefreshCalls, 0);
});

test("an installed but unavailable refresh broker fails retryably instead of racing it", async () => {
  const { windowRef, MockCustomEvent } = createWindow({ bridgeReady: true });
  const coordinatedFetch = createCoordinatedAuthFetch({
    fetchImpl: async () => {
      throw new Error("must not bypass installed broker");
    },
    runtime: null,
    windowRef,
    localStorageRef: {
      getItem: () => JSON.stringify({ user: { id: "user-1" } }),
    },
    CustomEventCtor: MockCustomEvent,
    extensionRuntime: false,
    timeoutMs: 1,
  });

  const response = await coordinatedFetch(
    "https://supabase.example/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: JSON.stringify({ refresh_token: "refresh" }) },
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "temporarily_unavailable");
});

test("web authentication without the extension keeps the existing direct refresh path", async () => {
  const { windowRef, MockCustomEvent } = createWindow({ bridgeReady: false });
  let directRefreshCalls = 0;
  const coordinatedFetch = createCoordinatedAuthFetch({
    fetchImpl: async () => {
      directRefreshCalls += 1;
      return new Response("{}", { status: 200 });
    },
    runtime: null,
    windowRef,
    localStorageRef: {
      getItem: () => JSON.stringify({ user: { id: "user-1" } }),
    },
    CustomEventCtor: MockCustomEvent,
    extensionRuntime: false,
    timeoutMs: 1,
  });

  const response = await coordinatedFetch(
    "https://supabase.example/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: JSON.stringify({ refresh_token: "refresh" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(directRefreshCalls, 1);
});
