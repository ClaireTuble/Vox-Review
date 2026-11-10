import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import {
  createRequireAuthenticatedSuperAdmin,
  createRequireSuperAdmin,
} from "./superAdminAuth.js";

const ACTIVE_SESSION_ID = "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7";
const ADMIN = {
  id: "verified-admin-id",
  app_metadata: { role: "superadmin" },
};

function createAccessToken(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: ADMIN.id,
    session_id: ACTIVE_SESSION_ID,
    ...claims,
  })).toString("base64url");
  return `${header}.${payload}.signature`;
}

async function requestProtectedRoute({
  token = createAccessToken(),
  user = ADMIN,
  authError = null,
  authThrows,
  claimsThrows,
  sessionResult = { data: true, error: null },
  sessionThrows,
  trackSessionActivity = async () => {},
} = {}) {
  let sessionLookupCalls = 0;
  let sessionLookupArguments = null;
  let protectedHandlerCalls = 0;
  const sessionActivity = [];
  const middleware = createRequireSuperAdmin({
    getUser: async () => {
      if (authThrows) throw authThrows;
      return { data: { user }, error: authError };
    },
    getTokenClaims: (accessToken) => {
      if (claimsThrows) throw claimsThrows;
      return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    },
    getSessionStatus: async (userId, sessionId) => {
      sessionLookupCalls += 1;
      sessionLookupArguments = { userId, sessionId };
      if (sessionThrows) throw sessionThrows;
      return sessionResult;
    },
    trackSessionActivity: async (activity) => {
      sessionActivity.push(activity);
      await trackSessionActivity(activity);
    },
    logger: { error() {} },
  });
  const app = express();
  app.use((req, _res, next) => {
    req.headers["x-forwarded-for"] = "203.0.113.17";
    req.headers["user-agent"] = "Test Admin Browser/1.0";
    next();
  });
  app.get("/protected", middleware, (_req, res) => {
    protectedHandlerCalls += 1;
    res.status(200).json({ success: true });
  });

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return {
      response,
      sessionLookupCalls,
      sessionLookupArguments,
      protectedHandlerCalls,
      sessionActivity,
    };
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("an active verified Super Admin session is authorized", async () => {
  const result = await requestProtectedRoute();
  assert.equal(result.response.status, 200);
  assert.equal(result.sessionLookupCalls, 1);
  assert.deepEqual(result.sessionLookupArguments, {
    userId: ADMIN.id,
    sessionId: ACTIVE_SESSION_ID,
  });
  assert.equal(result.protectedHandlerCalls, 1);
  assert.equal(result.sessionActivity.length, 1);
  assert.equal(result.sessionActivity[0].admin_id, ADMIN.id);
  assert.equal(result.sessionActivity[0].session_id, ACTIVE_SESSION_ID);
  assert.equal(result.sessionActivity[0].ip_address, "127.0.0.1");
  assert.equal(result.sessionActivity[0].user_agent, "Test Admin Browser/1.0");
});

test("concurrent Super Admin sessions are tracked independently", async () => {
  const sessionIds = [
    ACTIVE_SESSION_ID,
    "e09a2273-8ac7-45e0-8c11-214c49d1ad75",
  ];
  const activityRows = [];
  for (const sessionId of sessionIds) {
    const result = await requestProtectedRoute({
      token: createAccessToken({ session_id: sessionId }),
      trackSessionActivity: async (row) => activityRows.push(row),
    });
    assert.equal(result.response.status, 200);
  }
  assert.deepEqual(activityRows.map((row) => row.session_id), sessionIds);
  assert.ok(activityRows.every((row) => row.admin_id === ADMIN.id));
});

test("a session associated with a different user is rejected", async () => {
  const result = await requestProtectedRoute({
    sessionResult: { data: false, error: null },
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.sessionLookupCalls, 1);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("a password-only Supabase session is rejected before OTP session registration", async () => {
  const result = await requestProtectedRoute({
    sessionResult: { data: false, error: null },
  });
  assert.equal(result.response.status, 401);
  assert.match((await result.response.json()).error, /OTP verification/);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("session-completion authentication verifies role and exact token subject before grant redemption", async () => {
  const middleware = createRequireAuthenticatedSuperAdmin({
    getUser: async () => ({ data: { user: ADMIN }, error: null }),
    getTokenClaims: () => ({ sub: ADMIN.id, session_id: ACTIVE_SESSION_ID }),
    logger: { error() {} },
  });
  const app = express();
  app.post("/complete", middleware, (req, res) => {
    res.status(200).json({
      userId: req.authUser.id,
      sessionId: req.sessionId,
    });
  });

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${createAccessToken()}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      userId: ADMIN.id,
      sessionId: ACTIVE_SESSION_ID,
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("a missing session record after global sign-out is rejected before the route handler", async () => {
  const result = await requestProtectedRoute({
    sessionResult: { data: false, error: null },
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.sessionLookupCalls, 1);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("a token subject that does not match the verified user is rejected", async () => {
  const result = await requestProtectedRoute({
    token: createAccessToken({ sub: "different-user-id" }),
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.sessionLookupCalls, 0);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("missing or invalid session_id claims are rejected without a database lookup", async () => {
  for (const claims of [{ session_id: undefined }, { session_id: "not-a-uuid" }]) {
    const result = await requestProtectedRoute({ token: createAccessToken(claims) });
    assert.equal(result.response.status, 401);
    assert.equal(result.sessionLookupCalls, 0);
    assert.equal(result.protectedHandlerCalls, 0);
  }
});

test("malformed decoded token claims are rejected safely", async () => {
  const result = await requestProtectedRoute({
    claimsThrows: new Error("malformed token payload"),
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.sessionLookupCalls, 0);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("a failed session lookup fails closed with service unavailable", async () => {
  const result = await requestProtectedRoute({
    sessionResult: { data: null, error: { code: "RPC_UNAVAILABLE" } },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.sessionLookupCalls, 1);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("a thrown session lookup failure fails closed with service unavailable", async () => {
  const result = await requestProtectedRoute({
    sessionThrows: new Error("database unavailable"),
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("a non-Super Admin remains forbidden without querying session state", async () => {
  const result = await requestProtectedRoute({
    user: { id: ADMIN.id, app_metadata: { role: "user" } },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.sessionLookupCalls, 0);
  assert.equal(result.protectedHandlerCalls, 0);
});

test("claims are only used for session lookup after Supabase token validation succeeds", async () => {
  const result = await requestProtectedRoute({
    authError: { status: 401 },
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.sessionLookupCalls, 0);
  assert.equal(result.protectedHandlerCalls, 0);
});
