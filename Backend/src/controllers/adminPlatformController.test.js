import assert from "node:assert/strict";
import test from "node:test";
import {
  togglePlatformStatus,
  isPlatformActive,
  reportHealth,
  getHealthStatus,
  memoryHealthStore,
} from "./healthController.js";
import { createAdminPlatformController } from "./adminPlatformController.js";
import { isPlatformEnabled } from "../middleware/requirePlatformAvailable.js";

test("Super Admin platform management & health status unit tests", async (t) => {
  const platformNames = new Map([
    ["shopee", "Shopee"],
    ["lazada", "Lazada"],
    ["google", "Google Maps"],
    ["googleplay", "Google Play Store"],
    ["steam", "Steam"],
  ]);
  const platformRows = new Map([...platformNames.entries()]
    .map(([code, platform_name], platform_id) => [code, {
      platform_id: platform_id + 1,
      platform_name,
      industry_type: "test",
      base_url: "https://example.test",
      extraction_method: "test",
      is_active: true,
    }]));
  const databaseClient = {
    from: () => ({
      select: async () => ({ data: [...platformRows.values()], error: null }),
      update: (values) => ({
        eq: (column, platform_name) => ({
          select: async () => {
            assert.deepEqual(Object.keys(values), ["is_active"]);
            assert.equal(column, "platform_name");
            const [code, row] = [...platformRows.entries()]
              .find(([, item]) => item.platform_name === platform_name) || [];
            if (!row) return { data: [], error: null };
            Object.assign(row, values);
            return { data: [row], error: null };
          },
        }),
      }),
    }),
  };

  // Setup: reset health store to default active state
  for (const code of ["shopee", "lazada", "google", "googleplay", "steam"]) {
    await togglePlatformStatus(code, true, databaseClient);
  }

  await t.test("1. Super Admin can disable a platform", async () => {
    const updated = await togglePlatformStatus("shopee", false, databaseClient);
    assert.equal(updated.platformStatus, "Disabled");
    assert.equal(updated.is_active, false);
    assert.equal(isPlatformActive("shopee"), false);
  });

  await t.test("2. Super Admin can enable a platform", async () => {
    const updated = await togglePlatformStatus("shopee", true, databaseClient);
    assert.equal(updated.platformStatus, "Active");
    assert.equal(updated.is_active, true);
    assert.equal(isPlatformActive("shopee"), true);
  });

  await t.test("3. Validation rejects invalid platform key", async () => {
    await assert.rejects(
      async () => {
        await togglePlatformStatus("unsupported_platform", false, databaseClient);
      },
      /Invalid platform/
    );
  });

  await t.test("database write failures do not report a successful toggle", async () => {
    const failingClient = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: async () => ({ data: null, error: new Error("database write failed") }),
          }),
        }),
      }),
    };

    await assert.rejects(
      togglePlatformStatus("shopee", false, failingClient),
      (error) => error.statusCode === 503 && /database write failed/.test(error.message),
    );
    assert.equal(isPlatformActive("shopee"), true);
  });

  await t.test("4. Disabled platform cannot be used/analyzed and reports inactive", async () => {
    await togglePlatformStatus("lazada", false, databaseClient);
    assert.equal(isPlatformActive("lazada"), false);
    assert.equal(isPlatformActive("Lazada"), false);
  });

  await t.test("5. Re-enabled platform becomes usable again", async () => {
    await togglePlatformStatus("lazada", true, databaseClient);
    assert.equal(isPlatformActive("lazada"), true);
    assert.equal(isPlatformActive("Lazada"), true);
  });

  await t.test("6. Health status remains independent from Active/Disabled status", async () => {
    assert.equal(Object.hasOwn(memoryHealthStore.get("google"), "nlpStatus"), false);

    // 6a. Active + Warning
    await togglePlatformStatus("google", true, databaseClient);
    const mockReqWarning = {
      body: {
        platform: "google",
        status: "Warning",
        errorStage: "Review Extraction",
        errorMessage: "No reviews found in DOM",
      },
    };
    let responsePayload = null;
    const mockRes = {
      status: (code) => ({
        json: (payload) => {
          responsePayload = payload;
          return payload;
        },
      }),
    };

    await reportHealth(mockReqWarning, mockRes);
    const googleHealth = memoryHealthStore.get("google");
    assert.equal(googleHealth.platformStatus, "Active");
    assert.equal(googleHealth.status, "Warning");
    assert.equal(googleHealth.scrapingStatus, "Warning");
    assert.equal(Object.hasOwn(googleHealth, "nlpStatus"), false);

    // 6b. Disabled + Working (Disable platform while health is Working)
    await reportHealth({
      body: {
        platform: "googleplay",
        status: "Working",
        lastSuccessfulStage: "Data Transfer",
      },
    }, mockRes);

    await togglePlatformStatus("googleplay", false, databaseClient);
    const playHealth = memoryHealthStore.get("googleplay");
    assert.equal(playHealth.platformStatus, "Disabled");
    assert.equal(playHealth.is_active, false);
    assert.equal(playHealth.status, "Working");
    assert.equal(playHealth.scrapingStatus, "Working");
    assert.equal(Object.hasOwn(playHealth, "nlpStatus"), false);
  });

  await t.test("7. Disabling one platform does not affect other platforms", async () => {
    await togglePlatformStatus("steam", false, databaseClient);
    assert.equal(isPlatformActive("steam"), false);
    assert.equal(isPlatformActive("shopee"), true);
    assert.equal(isPlatformActive("google"), true);
    assert.equal(isPlatformActive("lazada"), true);
    // Re-enable steam
    await togglePlatformStatus("steam", true, databaseClient);
    assert.equal(isPlatformActive("steam"), true);
  });

  await t.test("8. last_checked_at is preserved and updated on health reports", async () => {
    const timestampBefore = new Date().toISOString();
    await reportHealth({
      body: {
        platform: "shopee",
        status: "Working",
      },
    }, {
      status: () => ({ json: (p) => p }),
    });

    const item = memoryHealthStore.get("shopee");
    assert.ok(item.last_checked_at);
    assert.ok(new Date(item.last_checked_at) >= new Date(timestampBefore));
  });

  await t.test("9. toggleAdminPlatformStatus controller returns updated state and HTTP 200", async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = {
      params: { platformKey: "steam" },
      body: { is_active: false },
      authUser: { id: "admin-123", email: "superadmin@voxreview.ai" },
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonBody = data;
            return data;
          },
        };
      },
    };

    const auditEvents = [];
    const toggleAdminPlatformStatus = createAdminPlatformController({
      toggleStatus: (platformKey, desiredStatus) => togglePlatformStatus(platformKey, desiredStatus, databaseClient),
      verifyConfirmation: async (admin, password) => {
        assert.equal(admin.id, "admin-123");
        assert.equal(password, "valid-superadmin-password");
        return true;
      },
      writeAuditLog: async (event) => { auditEvents.push(event); return true; },
    });
    req.body.confirmationPassword = "valid-superadmin-password";
    await toggleAdminPlatformStatus(req, res);
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.success, true);
    assert.equal(jsonBody.platform.platformStatus, "Disabled");
    assert.equal(jsonBody.platform.is_active, false);
    assert.equal(jsonBody.auditRecorded, true);
    assert.equal(await isPlatformEnabled("steam", databaseClient), false);
    assert.equal(await isPlatformEnabled("shopee", databaseClient), true);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "platform_disabled");
    assert.equal(auditEvents[0].admin_user_id, "admin-123");
    assert.equal(auditEvents[0].target, "Steam");
    assert.match(auditEvents[0].details, /\d{4}-\d{2}-\d{2}T/);
    assert.equal(JSON.stringify(jsonBody).includes("valid-superadmin-password"), false);

    // Clean up: re-enable steam
    await toggleAdminPlatformStatus({
      ...req,
      body: { is_active: true },
    }, res);
    assert.equal(auditEvents.length, 2);
    assert.equal(auditEvents[1].action, "platform_enabled");
    assert.equal(await isPlatformEnabled("steam", databaseClient), true);
  });

  await t.test("all five database platform rows can be disabled and re-enabled independently", async () => {
    for (const platformKey of platformNames.keys()) {
      await togglePlatformStatus(platformKey, true, databaseClient);
    }
    const auditEvents = [];
    const controller = createAdminPlatformController({
      toggleStatus: (platformKey, desiredStatus) => togglePlatformStatus(platformKey, desiredStatus, databaseClient),
      verifyConfirmation: async () => true,
      writeAuditLog: async (event) => { auditEvents.push(event); return true; },
    });
    const callController = async (platformKey, is_active) => {
      let statusCode;
      let payload;
      await controller({
        params: { platformKey },
        body: { is_active, ...(is_active ? {} : { confirmationPassword: "valid-password" }) },
        authUser: { id: "admin-123", email: "admin@example.com" },
      }, {
        status(code) {
          statusCode = code;
          return { json(body) { payload = body; return body; } };
        },
      });
      assert.equal(statusCode, 200);
      return payload;
    };

    for (const platformKey of platformNames.keys()) {
      await callController(platformKey, false);
      assert.equal(await isPlatformEnabled(platformKey, databaseClient), false);
      for (const otherKey of platformNames.keys()) {
        if (otherKey !== platformKey) assert.equal(await isPlatformEnabled(otherKey, databaseClient), true);
      }
      await callController(platformKey, true);
      assert.equal(await isPlatformEnabled(platformKey, databaseClient), true);
    }
    assert.equal(auditEvents.length, 10);
  });

  await t.test("empty or incorrect security confirmation never updates availability or writes audit", async () => {
    let updateCalls = 0;
    let auditCalls = 0;
    const controller = createAdminPlatformController({
      toggleStatus: async () => { updateCalls += 1; return {}; },
      verifyConfirmation: async (_admin, password) => {
        if (password !== "correct-password") {
          const error = new Error("Super Admin password is incorrect.");
          error.statusCode = password ? 403 : 400;
          throw error;
        }
      },
      writeAuditLog: async () => { auditCalls += 1; },
    });

    for (const password of ["", "wrong-password"]) {
      let statusCode;
      let payload;
      await controller({
        params: { platformKey: "shopee" },
        body: { is_active: false, confirmationPassword: password },
        authUser: { id: "admin-123", email: "admin@example.com" },
      }, {
        status(code) {
          statusCode = code;
          return { json(body) { payload = body; return body; } };
        },
      });
      assert.equal(statusCode, password ? 403 : 400);
      assert.equal(payload.success, false);
      assert.equal(payload.confirmationPassword, undefined);
      assert.equal(JSON.stringify(payload).includes("wrong-password"), false);
    }
    assert.equal(updateCalls, 0);
    assert.equal(auditCalls, 0);
    assert.equal(isPlatformActive("shopee"), true);
  });
});
