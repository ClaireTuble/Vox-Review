import assert from "node:assert/strict";
import test from "node:test";
import {
  createRequirePlatformAvailable,
  createGetPlatformAvailability,
  isPlatformEnabled,
  normalizePlatformKey,
} from "./requirePlatformAvailable.js";

function makeDatabase(rows) {
  return {
    from(table) {
      assert.equal(table, "platforms");
      return {
        select: async (columns) => {
          assert.equal(columns, "*");
          return { data: [...rows.values()], error: null };
        },
      };
    },
  };
}

async function callAvailabilityMiddleware(middleware, platform) {
  let statusCode = null;
  let payload = null;
  let nextCalled = false;
  const req = { body: { platform }, headers: {} };
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(body) {
          payload = body;
          return body;
        },
      };
    },
  };

  await middleware(req, res, () => { nextCalled = true; });
  return { statusCode, payload, nextCalled, req };
}

test("normalizes every supported platform name and API key", () => {
  assert.deepEqual([
    normalizePlatformKey("Shopee"),
    normalizePlatformKey("Lazada"),
    normalizePlatformKey("Google Maps"),
    normalizePlatformKey("Google Play Store"),
    normalizePlatformKey("Steam"),
  ], ["shopee", "lazada", "google", "googleplay", "steam"]);
});

test("database availability blocks disabled platforms and keeps the other four usable", async () => {
  const rows = new Map([
    ["shopee", { platform: "shopee", is_active: true }],
    ["lazada", { platform: "lazada", is_active: true }],
    ["google", { platform: "google", is_active: true }],
    ["googleplay", { platform: "googleplay", is_active: true }],
    ["steam", { platform: "steam", is_active: true }],
  ]);
  const checkAvailability = (platformKey) => isPlatformEnabled(platformKey, makeDatabase(rows));
  const middleware = createRequirePlatformAvailable({ checkAvailability });
  const platforms = [
    ["shopee", "Shopee"],
    ["lazada", "Lazada"],
    ["google", "Google Maps"],
    ["googleplay", "Google Play Store"],
    ["steam", "Steam"],
  ];

  for (const [disabledKey, disabledName] of platforms) {
    rows.get(disabledKey).is_active = false;
    const disabled = await callAvailabilityMiddleware(middleware, disabledName);
    assert.equal(disabled.statusCode, 403, `${disabledName} should be rejected`);
    assert.equal(disabled.payload.error, "PLATFORM_DISABLED");
    assert.equal(disabled.payload.message, "Analysis for this platform is currently disabled.");
    assert.equal(disabled.nextCalled, false);

    for (const [otherKey, otherName] of platforms.filter(([key]) => key !== disabledKey)) {
      const allowed = await callAvailabilityMiddleware(middleware, otherName);
      assert.equal(allowed.nextCalled, true, `${otherName} should remain available while ${disabledName} is disabled`);
      assert.equal(allowed.req.platformCode, otherKey);
    }

    rows.get(disabledKey).is_active = true;
    const reenabled = await callAvailabilityMiddleware(middleware, disabledName);
    assert.equal(reenabled.nextCalled, true, `${disabledName} should work after re-enabling`);
  }
});

test("database health fields do not override Super Admin availability", async () => {
  const rows = new Map([["steam", {
    platform: "steam",
    is_active: false,
    scraping_status: "Working",
  }]]);
  const database = makeDatabase(rows);

  assert.equal(await isPlatformEnabled("steam", database), false);
  rows.get("steam").scraping_status = "Error";
  assert.equal(await isPlatformEnabled("steam", database), false);
  rows.get("steam").is_active = true;
  assert.equal(await isPlatformEnabled("steam", database), true);
});

test("rejects missing or conflicting platform identities and fails closed on database errors", async () => {
  const middleware = createRequirePlatformAvailable({
    checkAvailability: async () => { throw new Error("database unavailable"); },
  });

  const missing = await callAvailabilityMiddleware(middleware, null);
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.payload.error, "INVALID_PLATFORM");

  const conflicting = await callAvailabilityMiddleware(
    async (req, res, next) => createRequirePlatformAvailable({
      checkAvailability: async () => true,
    })({
      ...req,
      headers: { "x-voxreview-platform": "steam" },
    }, res, next),
    "shopee",
  );
  assert.equal(conflicting.statusCode, 400);
  assert.equal(conflicting.payload.error, "INVALID_PLATFORM");

  const unavailable = await callAvailabilityMiddleware(middleware, "steam");
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.payload.error, "PLATFORM_STATUS_UNAVAILABLE");
  assert.equal(unavailable.nextCalled, false);
});

test("availability endpoint reports canonical platform names and the database-controlled state", async () => {
  const platforms = [
    ["shopee", "Shopee"],
    ["lazada", "Lazada"],
    ["google", "Google Maps"],
    ["googleplay", "Google Play Store"],
    ["steam", "Steam"],
  ];

  for (const [disabledKey] of platforms) {
    for (const [platformKey, name] of platforms) {
      let statusCode = null;
      let payload = null;
      const handler = createGetPlatformAvailability({
        checkAvailability: async (requestedKey) => {
          assert.equal(requestedKey, platformKey);
          return platformKey !== disabledKey;
        },
      });
      await handler({ params: { platformKey } }, {
        status(code) {
          statusCode = code;
          return { json(body) { payload = body; return body; } };
        },
      });

      assert.equal(statusCode, 200);
      assert.equal(payload.name, name);
      assert.equal(payload.is_active, platformKey !== disabledKey);
    }
  }
});

test("availability endpoint fails closed when the database check fails", async () => {
  let statusCode = null;
  let payload = null;
  const handler = createGetPlatformAvailability({
    checkAvailability: async () => { throw new Error("database unavailable"); },
  });
  await handler({ params: { platformKey: "shopee" } }, {
    status(code) {
      statusCode = code;
      return { json(body) { payload = body; return body; } };
    },
  });

  assert.equal(statusCode, 503);
  assert.equal(payload.error, "PLATFORM_STATUS_UNAVAILABLE");
});
