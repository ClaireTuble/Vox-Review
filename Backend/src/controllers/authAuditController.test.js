import assert from "node:assert/strict";
import test from "node:test";
import {
  createSuperAdminLogoutHandler,
  revokeSuperAdminSessionOrRespond,
} from "./authAuditController.js";

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("Super Admin logout proceeds only after durable session revocation succeeds", async () => {
  const response = createResponse();
  let revoked = null;
  const succeeded = await revokeSuperAdminSessionOrRespond({
    adminId: "admin-uuid",
    sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
    res: response,
    revokeSession: async (scope) => { revoked = scope; },
    logger: { error() { assert.fail("Successful revocation must not log an error."); } },
  });

  assert.equal(succeeded, true);
  assert.deepEqual(revoked, {
    admin_id: "admin-uuid",
    session_id: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
  });
  assert.equal(response.statusCode, null);
});

test("Super Admin logout returns 503 and does not report success when revocation fails", async () => {
  const response = createResponse();
  let logged = false;
  const succeeded = await revokeSuperAdminSessionOrRespond({
    adminId: "admin-uuid",
    sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
    res: response,
    revokeSession: async () => { throw new Error("database unavailable"); },
    logger: { error: () => { logged = true; } },
  });

  assert.equal(succeeded, false);
  assert.equal(logged, true);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /could not be revoked/i);
});

test("Super Admin logout handler returns success only after durable revocation", async () => {
  const response = createResponse();
  const events = [];
  const handler = createSuperAdminLogoutHandler({
    revokeSessionImpl: async (scope) => events.push(["revoke", scope]),
    createAuditLogImpl: async (entry) => events.push(["audit", entry.status]),
    logger: { error() { assert.fail("Successful logout must not log an error."); } },
  });

  await handler({
    authUser: { id: "admin-uuid", email: "admin@voxreview.ai" },
    sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
    headers: {},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(events[0][0], "audit");
  assert.equal(events[0][1], "Warning");
  assert.equal(events[1][0], "revoke");
  assert.deepEqual(events[1][1], {
    admin_id: "admin-uuid",
    session_id: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
  });
  assert.deepEqual(events[2], ["audit", "Successful"]);
});

test("Super Admin logout handler does not return success or write success audit on revocation failure", async () => {
  const response = createResponse();
  const auditStatuses = [];
  const handler = createSuperAdminLogoutHandler({
    revokeSessionImpl: async () => { throw new Error("database unavailable"); },
    createAuditLogImpl: async (entry) => auditStatuses.push(entry.status),
    logger: { error() {} },
  });

  await handler({
    authUser: { id: "admin-uuid", email: "admin@voxreview.ai" },
    sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
    headers: {},
  }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.deepEqual(auditStatuses, ["Warning"]);
});
