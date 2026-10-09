import assert from "node:assert/strict";
import test from "node:test";
import {
  createServiceRoleClient,
  respondIfServiceRoleUnavailable,
  ServiceRoleConfigurationError,
} from "./serviceRoleSupabase.js";

test("privileged client requires a service-role key and never falls back to an anon key", () => {
  let clientCreated = false;
  assert.throws(
    () => createServiceRoleClient(() => {
      clientCreated = true;
    }, {
      supabaseUrl: "https://example.invalid",
      serviceRoleKey: "",
      anonKey: "public-anon-key",
    }),
    ServiceRoleConfigurationError,
  );
  assert.equal(clientCreated, false);
});

test("privileged client is created only with the configured service-role key", () => {
  let received;
  const client = {};
  const result = createServiceRoleClient((...args) => {
    received = args;
    return client;
  }, {
    supabaseUrl: "https://example.invalid",
    serviceRoleKey: "service-role-key",
    anonKey: "public-anon-key",
  });

  assert.equal(result, client);
  assert.deepEqual(received, [
    "https://example.invalid",
    "service-role-key",
    { auth: { autoRefreshToken: false, persistSession: false } },
  ]);
});

test("missing service-role configuration responds with a sanitized 503", () => {
  let status;
  let body;
  const response = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
  };

  const handled = respondIfServiceRoleUnavailable(response, new ServiceRoleConfigurationError());

  assert.equal(handled, true);
  assert.equal(status, 503);
  assert.deepEqual(body, {
    success: false,
    error: "Privileged database operations are unavailable because the service-role configuration is missing.",
  });
  assert.equal(JSON.stringify(body).includes("service-role-key"), false);
});
