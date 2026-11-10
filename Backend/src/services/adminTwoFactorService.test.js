import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  createAdminTwoFactorService,
  hashOtp,
  escapeHtml,
  sendAdminOtpEmail,
  sendAdminPasswordChangeOtpEmail,
  OTP_TTL_MINUTES,
  MAX_OTP_ATTEMPTS,
  JWT_ISSUER,
  JWT_AUDIENCE,
} from "./adminTwoFactorService.js";

// Ensure environment secrets are configured for unit tests
process.env.JWT_CHALLENGE_SECRET = "test-dedicated-jwt-challenge-secret-min-64-characters-0123456789abc";
process.env.OTP_HMAC_SECRET = "test-dedicated-otp-hmac-secret-min-64-characters-0123456789abc";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key-distinct-secret";

test("escapeHtml sanitizes untrusted input before email rendering", () => {
  const dirty = '<script>alert("pwned")</script> & \'test\'';
  const clean = escapeHtml(dirty);
  assert.equal(clean, "&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt; &amp; &#039;test&#039;");
});

test("hashOtp computes deterministic HMAC-SHA256 with domain separation", () => {
  const hash1 = hashOtp("123456");
  const hash2 = hashOtp("123456");
  const hashDiff = hashOtp("654321");

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashDiff);
  assert.equal(hash1.length, 64);
});

test("development OTP email mocks are disabled in production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMockFlag = process.env.DEV_MOCK_2FA_EMAIL;
  const originalBrevoKey = process.env.BREVO_API_KEY;
  const originalLog = console.log;
  const logged = [];
  process.env.NODE_ENV = "production";
  process.env.DEV_MOCK_2FA_EMAIL = "true";
  delete process.env.BREVO_API_KEY;
  console.log = (...args) => logged.push(args.join(" "));

  try {
    await assert.rejects(
      sendAdminOtpEmail({ toEmail: "admin@example.test", otpCode: "123456" }),
      /Email delivery service is currently unavailable/,
    );
    await assert.rejects(
      sendAdminPasswordChangeOtpEmail({ toEmail: "admin@example.test", otpCode: "123456" }),
      /Email delivery service is currently unavailable/,
    );
    assert.equal(logged.some((line) => line.includes("123456")), false);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalMockFlag === undefined) delete process.env.DEV_MOCK_2FA_EMAIL;
    else process.env.DEV_MOCK_2FA_EMAIL = originalMockFlag;
    if (originalBrevoKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalBrevoKey;
    console.log = originalLog;
  }
});

test("initiateSuperAdminLogin rejects invalid credentials with 401", async () => {
  const service = createAdminTwoFactorService({
    createAuthClient: () => ({
      auth: {
        signInWithPassword: async () => ({
          data: null,
          error: { message: "Invalid login credentials" },
        }),
      },
    }),
    createServiceClient: () => {
      throw new Error("Privileged service client should not be invoked on failed auth");
    },
  });

  await assert.rejects(
    async () => {
      await service.initiateSuperAdminLogin({
        email: "admin@example.com",
        password: "WrongPassword123!",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 401);
      assert.equal(err.message, "Invalid email or password.");
      return true;
    }
  );
});

test("initiateSuperAdminLogin rejects non-superadmin accounts with 403", async () => {
  const service = createAdminTwoFactorService({
    createAuthClient: () => ({
      auth: {
        signInWithPassword: async () => ({
          data: {
            user: {
              id: "regular-user-id",
              email: "user@example.com",
              app_metadata: { role: "user" },
            },
          },
          error: null,
        }),
      },
    }),
    createServiceClient: () => {
      throw new Error("Privileged service client should not be invoked for non-superadmin");
    },
  });

  await assert.rejects(
    async () => {
      await service.initiateSuperAdminLogin({
        email: "user@example.com",
        password: "ValidPassword123!",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /Insufficient permissions/);
      return true;
    }
  );
});

test("initiateSuperAdminLogin isolates public auth client and privileged database client", async () => {
  let authClientCalled = false;
  let serviceRoleClientCalled = false;
  let signInWithPasswordOnServiceRole = false;
  let emailDispatched = false;
  let dispatchedCode = "";
  let insertedChallenge = null;

  const mockAuthClient = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        authClientCalled = true;
        assert.equal(email, "superadmin@voxreview.ai");
        assert.equal(password, "CorrectPassword123!");
        return {
          data: {
            user: {
              id: "superadmin-uuid-1",
              email: "superadmin@voxreview.ai",
              app_metadata: { role: "superadmin" },
              user_metadata: { full_name: "Super Administrator" },
            },
            session: { access_token: "mock-access-token" },
          },
          error: null,
        };
      },
    },
  };

  const mockServiceDb = {
    auth: {
      signInWithPassword: async () => {
        signInWithPasswordOnServiceRole = true;
        throw new Error("CRITICAL: signInWithPassword must never be called on service-role client");
      },
    },
    from: (table) => {
      serviceRoleClientCalled = true;
      assert.equal(table, "admin_2fa_challenges");
      return {
        update: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        insert: (record) => ({
          select: () => ({
            single: () => {
              insertedChallenge = { ...record, id: "challenge-uuid-1" };
              return Promise.resolve({ data: insertedChallenge, error: null });
            },
          }),
        }),
      };
    },
  };

  const service = createAdminTwoFactorService({
    createAuthClient: () => mockAuthClient,
    createServiceClient: () => mockServiceDb,
    sendEmail: async ({ toEmail, otpCode }) => {
      emailDispatched = true;
      dispatchedCode = otpCode;
      assert.equal(toEmail, "superadmin@voxreview.ai");
      return { success: true };
    },
    randomIntImpl: () => 482910,
  });

  const res = await service.initiateSuperAdminLogin({
    email: "superadmin@voxreview.ai",
    password: "CorrectPassword123!",
  });

  assert.equal(res.mfaRequired, true);
  assert.ok(res.challengeToken);
  assert.equal(authClientCalled, true, "Public auth client must be used for signInWithPassword");
  assert.equal(serviceRoleClientCalled, true, "Service role client must be used for DB mutations");
  assert.equal(signInWithPasswordOnServiceRole, false, "Service role client must never call signInWithPassword");
  assert.equal(emailDispatched, true);
  assert.equal(dispatchedCode, "482910");
  assert.ok(insertedChallenge);
  assert.equal(insertedChallenge.otp_hash, hashOtp("482910"));
});

test("initiateSuperAdminLogin invalidates challenge if Brevo email delivery fails", async () => {
  let invalidatedId = null;

  const mockAuthClient = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          user: {
            id: "superadmin-uuid-2",
            email: "admin2@voxreview.ai",
            app_metadata: { role: "superadmin" },
          },
        },
        error: null,
      }),
    },
  };

  const mockServiceDb = {
    from: (table) => ({
      update: (updates) => ({
        eq: (col, val) => {
          if (updates.consumed_at && col === "id") invalidatedId = val;
          return {
            is: () => Promise.resolve({ data: null, error: null }),
            then: (resolve) => resolve({ data: null, error: null }),
          };
        },
      }),
      insert: (record) => ({
        select: () => ({
          single: () => Promise.resolve({ data: { ...record, id: "challenge-failed-delivery" }, error: null }),
        }),
      }),
    }),
  };

  const service = createAdminTwoFactorService({
    createAuthClient: () => mockAuthClient,
    createServiceClient: () => mockServiceDb,
    sendEmail: async () => {
      throw new Error("Brevo 500 API Service Unavailable");
    },
  });

  await assert.rejects(
    async () => {
      await service.initiateSuperAdminLogin({
        email: "admin2@voxreview.ai",
        password: "ValidPassword123!",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 502);
      assert.match(err.message, /Failed to send 2FA verification email/);
      return true;
    }
  );

  assert.equal(invalidatedId, "challenge-failed-delivery");
});

test("verifySuperAdminOtp enforces strict 6-digit numeric pattern", async () => {
  const service = createAdminTwoFactorService();

  for (const badOtp of ["12345", "1234567", "abcdef", "12a456", "", null]) {
    await assert.rejects(
      async () => {
        await service.verifySuperAdminOtp({
          challengeToken: "dummy-token",
          otp: badOtp,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /exactly 6 digits/);
        return true;
      }
    );
  }
});

test("verifySuperAdminOtp validates correct OTP and confirms Super Admin user", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-uuid-verified",
      email: "verified@voxreview.ai",
      type: "2fa_pending",
      jti: "jti-123",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockDb = {
    rpc: async (funcName, params) => {
      assert.equal(funcName, "verify_and_register_superadmin_otp_session");
      assert.equal(params.p_admin_user_id, "admin-uuid-verified");
      assert.equal(params.p_session_id, "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7");
      assert.equal(params.p_submitted_otp_hash, hashOtp("654321"));
      assert.equal(params.p_purpose, "login");
      return {
        data: {
          success: true,
          reason: "VERIFIED",
          admin_user_id: "admin-uuid-verified",
          admin_email: "verified@voxreview.ai",
          session_id: params.p_session_id,
        },
        error: null,
      };
    },
    auth: {
      admin: {
        getUserById: async (id) => ({
          data: {
            user: {
              id,
              email: "verified@voxreview.ai",
              app_metadata: { role: "superadmin" },
              user_metadata: { full_name: "Verified Super Admin" },
            },
          },
          error: null,
        }),
      },
    },
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  const res = await service.verifySuperAdminOtp({
    challengeToken,
    otp: "654321",
    adminUser: { id: "admin-uuid-verified", app_metadata: { role: "superadmin" } },
    sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
  });

  assert.equal(res.success, true);
  assert.equal(res.verified, true);
  assert.equal(res.user.role, "superadmin");
  assert.equal(res.user.email, "verified@voxreview.ai");
  assert.equal(res.loginGrant, undefined);
});

test("verifySuperAdminOtp fails closed when the atomic RPC is unavailable", async () => {
  const challengeToken = jwt.sign(
    {
      sub: "admin-uuid-verified",
      email: "verified@voxreview.ai",
      type: "2fa_pending",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    process.env.JWT_CHALLENGE_SECRET,
    { algorithm: "HS256", expiresIn: "10m" },
  );
  let fallbackDatabaseRead = false;
  const service = createAdminTwoFactorService({
    createServiceClient: () => ({
      rpc: async () => ({
        data: null,
        error: { code: "RPC_UNAVAILABLE", message: "RPC unavailable" },
      }),
      from: () => {
        fallbackDatabaseRead = true;
        throw new Error("Non-atomic fallback must not execute.");
      },
    }),
  });

  await assert.rejects(
    service.verifySuperAdminOtp({
      challengeToken,
      otp: "654321",
      adminUser: { id: "admin-uuid-verified", app_metadata: { role: "superadmin" } },
      sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
    }),
    (error) => error.statusCode === 503,
  );
  assert.equal(fallbackDatabaseRead, false);
});

test("OTP verification sends the exact authenticated Supabase session to the atomic RPC", async () => {
  const challengeToken = jwt.sign(
    {
      sub: "admin-user-id",
      email: "admin@voxreview.ai",
      type: "2fa_pending",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    process.env.JWT_CHALLENGE_SECRET,
    { algorithm: "HS256", expiresIn: "10m" },
  );
  let rpcArgs = null;
  const wrongSessionId = "e09a2273-8ac7-45e0-8c11-214c49d1ad75";
  const service = createAdminTwoFactorService({
    createServiceClient: () => ({
      rpc: async (name, args) => {
        assert.equal(name, "verify_and_register_superadmin_otp_session");
        rpcArgs = args;
        return {
          data: {
            success: false,
            reason: "SESSION_NOT_FOUND",
            message: "The authenticated Supabase session is not active.",
          },
          error: null,
        };
      },
    }),
  });

  await assert.rejects(service.verifySuperAdminOtp({
    challengeToken,
    otp: "654321",
    adminUser: { id: "admin-user-id", app_metadata: { role: "superadmin" } },
    sessionId: wrongSessionId,
    ipAddress: "203.0.113.17",
    userAgent: "Test Browser",
  }), (error) => error.statusCode === 400 && error.reason === "SESSION_NOT_FOUND");

  assert.equal(rpcArgs.p_admin_user_id, "admin-user-id");
  assert.equal(rpcArgs.p_session_id, wrongSessionId);
  assert.equal(rpcArgs.p_purpose, "login");
  assert.equal(rpcArgs.p_ip_address, "203.0.113.17");
  assert.equal(rpcArgs.p_user_agent, "Test Browser");
});

test("concurrent OTP redemption accepts only the first atomic RPC success", async () => {
  const challengeToken = jwt.sign(
    {
      sub: "admin-concurrent",
      email: "admin@voxreview.ai",
      type: "2fa_pending",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    process.env.JWT_CHALLENGE_SECRET,
    { algorithm: "HS256", expiresIn: "10m" },
  );
  let consumed = false;
  const service = createAdminTwoFactorService({
    createServiceClient: () => ({
      rpc: async () => {
        if (consumed) {
          return {
            data: { success: false, reason: "NOT_FOUND", message: "Challenge already consumed." },
            error: null,
          };
        }
        consumed = true;
        return {
          data: {
            success: true,
            reason: "VERIFIED",
            admin_user_id: "admin-concurrent",
            session_id: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
            admin_email: "admin@voxreview.ai",
          },
          error: null,
        };
      },
      auth: {
        admin: {
          getUserById: async (id) => ({
            data: { user: { id, email: "admin@voxreview.ai", app_metadata: { role: "superadmin" } } },
            error: null,
          }),
        },
      },
    }),
    writeAuditLog: async () => true,
  });
  const request = () => service.verifySuperAdminOtp({
    challengeToken,
    otp: "654321",
    adminUser: { id: "admin-concurrent", app_metadata: { role: "superadmin" } },
    sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
  });

  const results = await Promise.allSettled([request(), request()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("verifySuperAdminOtp rejects incorrect OTP and reports attempt failure", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-uuid-attempt",
      email: "attempt@voxreview.ai",
      type: "2fa_pending",
      jti: "jti-attempt",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockDb = {
    rpc: async () => ({
      data: {
        success: false,
        reason: "INVALID_OTP",
        attempts: 1,
        max_attempts: 3,
        message: "Incorrect verification code. Please try again.",
      },
      error: null,
    }),
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  await assert.rejects(
    async () => {
      await service.verifySuperAdminOtp({
        challengeToken,
        otp: "000000",
        adminUser: { id: "admin-uuid-attempt", app_metadata: { role: "superadmin" } },
        sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.reason, "INVALID_OTP");
      return true;
    }
  );
});

test("verifySuperAdminOtp enforces 3-attempt limit with 429 lock-out", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-uuid-locked",
      email: "locked@voxreview.ai",
      type: "2fa_pending",
      jti: "jti-locked",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockDb = {
    rpc: async () => ({
      data: {
        success: false,
        reason: "MAX_ATTEMPTS_EXCEEDED",
        attempts: 3,
        max_attempts: 3,
        message: "Maximum verification attempts exceeded. Challenge invalidated.",
      },
      error: null,
    }),
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  await assert.rejects(
    async () => {
      await service.verifySuperAdminOtp({
        challengeToken,
        otp: "999999",
        adminUser: { id: "admin-uuid-locked", app_metadata: { role: "superadmin" } },
        sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 429);
      assert.equal(err.reason, "MAX_ATTEMPTS_EXCEEDED");
      return true;
    }
  );
});

test("verifySuperAdminOtp rejects replaying an already consumed challenge", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-uuid-replayed",
      email: "replayed@voxreview.ai",
      type: "2fa_pending",
      jti: "jti-replayed",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockDb = {
    rpc: async () => ({
      data: {
        success: false,
        reason: "NOT_FOUND",
        message: "No active 2FA challenge found or challenge has already been consumed.",
      },
      error: null,
    }),
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  await assert.rejects(
    async () => {
      await service.verifySuperAdminOtp({
        challengeToken,
        otp: "123456",
        adminUser: { id: "admin-uuid-replayed", app_metadata: { role: "superadmin" } },
        sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.reason, "NOT_FOUND");
      return true;
    }
  );
});

test("verifySuperAdminOtp rejects expired challenge", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-uuid-expired",
      email: "expired@voxreview.ai",
      type: "2fa_pending",
      jti: "jti-expired",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockDb = {
    rpc: async () => ({
      data: {
        success: false,
        reason: "EXPIRED",
        message: "The verification code has expired. Please log in again.",
      },
      error: null,
    }),
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  await assert.rejects(
    async () => {
      await service.verifySuperAdminOtp({
        challengeToken,
        otp: "123456",
        adminUser: { id: "admin-uuid-expired", app_metadata: { role: "superadmin" } },
        sessionId: "8c6eb37c-32d1-4f2a-9d65-44bc3a0509c7",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.reason, "EXPIRED");
      return true;
    }
  );
});

// ============================================================================
// Super Admin Password Change Flow Unit & Security Tests
// ============================================================================

test("initiatePasswordChangeOtp dispatches 6-digit OTP with purpose=password_change and enforces cooldown", async () => {
  let emailSent = false;
  let sentOtp = null;
  let storedChallenge = null;

  const mockDb = {
    from: (table) => {
      assert.equal(table, "admin_2fa_challenges");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [] }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        insert: (record) => {
          storedChallenge = record;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "pw-challenge-uuid" }, error: null }),
            }),
          };
        },
      };
    },
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
    sendPasswordChangeEmail: async ({ toEmail, otpCode }) => {
      emailSent = true;
      sentOtp = otpCode;
      assert.equal(toEmail, "admin@voxreview.test");
      return { success: true };
    },
    randomIntImpl: () => 842195,
  });

  const res = await service.initiatePasswordChangeOtp({
    adminUser: {
      id: "admin-1",
      email: "admin@voxreview.test",
      app_metadata: { role: "superadmin" },
    },
  });

  assert.equal(res.success, true);
  assert.equal(emailSent, true);
  assert.equal(sentOtp, "842195");
  assert.equal(storedChallenge.purpose, "password_change");
  assert.equal(storedChallenge.admin_user_id, "admin-1");

  // Verify challenge JWT structure
  const decoded = jwt.decode(res.challengeToken);
  assert.equal(decoded.type, "password_change_pending");
  assert.equal(decoded.purpose, "password_change");
  assert.equal(decoded.sub, "admin-1");
});

test("verifyPasswordChangeOtp strictly rejects login challenge tokens (purpose segregation)", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  // A login challenge token has type: "2fa_pending" and NOT "password_change_pending"
  const loginChallengeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "2fa_pending",
      jti: "jti-login",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const service = createAdminTwoFactorService({});

  await assert.rejects(
    async () => {
      await service.verifyPasswordChangeOtp({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        challengeToken: loginChallengeToken,
        otp: "123456",
      });
    },
    /Invalid challenge purpose/
  );
});

test("verifyPasswordChangeOtp rejects incorrect OTP and enforces 3-attempt lockout", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "password_change_pending",
      purpose: "password_change",
      jti: "jti-pw",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  let attemptCount = 0;
  const mockDb = {
    rpc: async (fn, params) => {
      assert.equal(fn, "verify_and_consume_admin_otp");
      assert.equal(params.p_purpose, "password_change");
      attemptCount++;
      if (attemptCount >= 3) {
        return {
          data: {
            success: false,
            reason: "MAX_ATTEMPTS_EXCEEDED",
            attempts: 3,
            message: "Maximum verification attempts exceeded.",
          },
          error: null,
        };
      }
      return {
        data: {
          success: false,
          reason: "INVALID_OTP",
          attempts: attemptCount,
          message: "Incorrect verification code.",
        },
        error: null,
      };
    },
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  // Attempt 1: 400 invalid code
  await assert.rejects(
    async () => {
      await service.verifyPasswordChangeOtp({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        challengeToken,
        otp: "111111",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.reason, "INVALID_OTP");
      return true;
    }
  );

  // Attempt 2: 400 invalid code
  await assert.rejects(
    async () => {
      await service.verifyPasswordChangeOtp({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        challengeToken,
        otp: "222222",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Attempt 3: 429 lockout
  await assert.rejects(
    async () => {
      await service.verifyPasswordChangeOtp({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        challengeToken,
        otp: "333333",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 429);
      assert.equal(err.reason, "MAX_ATTEMPTS_EXCEEDED");
      return true;
    }
  );
});

test("verifyPasswordChangeOtp accepts correct OTP and returns passwordChangeToken", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const challengeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "password_change_pending",
      purpose: "password_change",
      jti: "jti-valid-pw",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockDb = {
    rpc: async () => ({
      data: {
        success: true,
        reason: "VERIFIED",
        admin_user_id: "admin-1",
        admin_email: "admin@voxreview.test",
        purpose: "password_change",
      },
      error: null,
    }),
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  const res = await service.verifyPasswordChangeOtp({
    adminUser: { id: "admin-1", email: "admin@voxreview.test" },
    challengeToken,
    otp: "654321",
  });

  assert.equal(res.success, true);
  assert.equal(res.verified, true);
  assert.ok(res.passwordChangeToken);

  const decodedAuth = jwt.decode(res.passwordChangeToken);
  assert.equal(decodedAuth.type, "password_change_authorized");
  assert.equal(decodedAuth.purpose, "password_change");
  assert.equal(decodedAuth.sub, "admin-1");
});

test("confirmPasswordChange enforces password rules and updates Supabase password for admin", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const passwordChangeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "password_change_authorized",
      purpose: "password_change",
      jti: "jti-auth-1",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  let updatedTargetUserId = null;
  let updatedPassword = null;

  const mockDb = {
    auth: {
      admin: {
        updateUserById: async (userId, updates) => {
          updatedTargetUserId = userId;
          updatedPassword = updates.password;
          return { data: { user: { id: userId } }, error: null };
        },
      },
    },
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
  });

  // 1. Password mismatch rejection
  await assert.rejects(
    async () => {
      await service.confirmPasswordChange({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        passwordChangeToken,
        newPassword: "ValidPassword123!",
        confirmPassword: "MismatchPassword123!",
      });
    },
    /New passwords do not match/
  );

  // 2. Weak password rejection (< 8 chars)
  await assert.rejects(
    async () => {
      await service.confirmPasswordChange({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        passwordChangeToken,
        newPassword: "Short1!",
        confirmPassword: "Short1!",
      });
    },
    /at least 8 characters/
  );

  // 3. Successful update
  const res = await service.confirmPasswordChange({
    adminUser: { id: "admin-1", email: "admin@voxreview.test" },
    passwordChangeToken,
    newPassword: "NewSuperAdminPass123!",
    confirmPassword: "NewSuperAdminPass123!",
  });

  assert.equal(res.success, true);
  assert.equal(updatedTargetUserId, "admin-1");
  assert.equal(updatedPassword, "NewSuperAdminPass123!");
});

test("confirmPasswordChange rejects current-password reuse with HTTP 422 and exact message", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const passwordChangeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "password_change_authorized",
      purpose: "password_change",
      jti: "jti-reuse-test",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  let publicAuthCheckAttempted = false;
  let serviceRoleUpdateAttempted = false;

  // Mock public auth client that recognizes 'ExistingPass123!' as the current valid password
  const mockPublicAuthClient = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        publicAuthCheckAttempted = true;
        if (email === "admin@voxreview.test" && password === "ExistingPass123!") {
          return { data: { user: { id: "admin-1" } }, error: null };
        }
        return { data: null, error: new Error("Invalid login credentials") };
      },
      signOut: async () => ({ error: null }),
    },
  };

  const mockServiceDb = {
    auth: {
      admin: {
        updateUserById: async () => {
          serviceRoleUpdateAttempted = true;
          return { data: { user: { id: "admin-1" } }, error: null };
        },
      },
    },
  };

  const service = createAdminTwoFactorService({
    createAuthClient: () => mockPublicAuthClient,
    createServiceClient: () => mockServiceDb,
  });

  // Attempting to reuse the current password
  await assert.rejects(
    async () => {
      await service.confirmPasswordChange({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        passwordChangeToken,
        newPassword: "ExistingPass123!",
        confirmPassword: "ExistingPass123!",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(
        err.message,
        "You cannot reuse your current password. Please choose a different password."
      );
      return true;
    }
  );

  assert.equal(publicAuthCheckAttempted, true);
  assert.equal(serviceRoleUpdateAttempted, false, "Supabase password must remain unchanged when reuse is rejected");

  // Verify that a different new password succeeds
  const res = await service.confirmPasswordChange({
    adminUser: { id: "admin-1", email: "admin@voxreview.test" },
    passwordChangeToken,
    newPassword: "BrandNewSecurePass123!",
    confirmPassword: "BrandNewSecurePass123!",
  });
  assert.equal(res.success, true);
  assert.equal(serviceRoleUpdateAttempted, true);
});

test("confirmPasswordChange rejects consumed or expired passwordChangeToken with 401", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const passwordChangeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "password_change_authorized",
      purpose: "password_change",
      jti: "jti-single-use",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockServiceDb = {
    auth: {
      admin: {
        updateUserById: async () => ({ data: { user: { id: "admin-1" } }, error: null }),
      },
    },
  };

  const consumedSet = new Set();
  const service = createAdminTwoFactorService({
    createServiceClient: () => mockServiceDb,
    consumedTokens: consumedSet,
  });

  // 1. First change succeeds and consumes the token
  const firstRes = await service.confirmPasswordChange({
    adminUser: { id: "admin-1", email: "admin@voxreview.test" },
    passwordChangeToken,
    newPassword: "NewValidPassword123!",
    confirmPassword: "NewValidPassword123!",
  });
  assert.equal(firstRes.success, true);
  assert.equal(consumedSet.has("jti-single-use"), true);

  // 2. Reusing the same token fails with 401
  await assert.rejects(
    async () => {
      await service.confirmPasswordChange({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        passwordChangeToken,
        newPassword: "AnotherNewPassword123!",
        confirmPassword: "AnotherNewPassword123!",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /expired or invalid/);
      return true;
    }
  );
});

test("confirmPasswordChange surfaces Supabase update failure with 500 error", async () => {
  const challengeSecret = process.env.JWT_CHALLENGE_SECRET;
  const passwordChangeToken = jwt.sign(
    {
      sub: "admin-1",
      email: "admin@voxreview.test",
      type: "password_change_authorized",
      purpose: "password_change",
      jti: "jti-failure-test",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    challengeSecret,
    { algorithm: "HS256", expiresIn: "10m" }
  );

  const mockServiceDb = {
    auth: {
      admin: {
        updateUserById: async () => ({
          data: null,
          error: new Error("Database connection refused by provider"),
        }),
      },
    },
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockServiceDb,
  });

  await assert.rejects(
    async () => {
      await service.confirmPasswordChange({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        passwordChangeToken,
        newPassword: "NewSuperPass123!",
        confirmPassword: "NewSuperPass123!",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 500);
      assert.match(err.message, /Database connection refused/);
      return true;
    }
  );
});

test("recordSessionChoice handles keep_sessions and logout_all choices", async () => {
  let globalSignOutCalled = false;
  const revokedSessionSets = [];
  let signOutToken = null;
  let signOutScope = null;

  const mockDb = {
    auth: {
      admin: {
        signOut: async (token, scope) => {
          globalSignOutCalled = true;
          signOutToken = token;
          signOutScope = scope;
          return { error: null };
        },
      },
    },
  };

  const service = createAdminTwoFactorService({
    createServiceClient: () => mockDb,
    markSessionsRevoked: async (params) => revokedSessionSets.push(params),
  });

  // 1. keep_sessions choice
  const keepRes = await service.recordSessionChoice({
    adminUser: { id: "admin-1", email: "admin@voxreview.test" },
    choice: "keep_sessions",
  });
  assert.equal(keepRes.success, true);
  assert.equal(keepRes.choice, "keep_sessions");
  assert.equal(globalSignOutCalled, false);
  assert.equal(revokedSessionSets.length, 0);

  // 2. logout_all choice with accessToken
  const logoutRes = await service.recordSessionChoice({
    adminUser: { id: "admin-1", email: "admin@voxreview.test" },
    choice: "logout_all",
    accessToken: "jwt-admin-token-xyz",
  });
  assert.equal(logoutRes.success, true);
  assert.equal(logoutRes.choice, "logout_all");
  assert.equal(globalSignOutCalled, true);
  assert.equal(signOutToken, "jwt-admin-token-xyz");
  assert.equal(signOutScope, "global");
  assert.deepEqual(revokedSessionSets, [{ admin_id: "admin-1", allSessions: true }]);

  // 3. invalid choice rejection
  await assert.rejects(
    async () => {
      await service.recordSessionChoice({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        choice: "invalid_choice",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Invalid session choice/);
      return true;
    }
  );

  // 4. missing admin user rejection
  await assert.rejects(
    async () => {
      await service.recordSessionChoice({
        adminUser: null,
        choice: "keep_sessions",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /Authenticated Super Admin user is required/);
      return true;
    }
  );

  // 5. Supabase global revocation failure throws 502 and does NOT report success
  const failingDb = {
    auth: {
      admin: {
        signOut: async () => ({ error: new Error("Revocation rejected by Supabase Auth") }),
      },
    },
  };
  const failingService = createAdminTwoFactorService({
    createServiceClient: () => failingDb,
  });

  await assert.rejects(
    async () => {
      await failingService.recordSessionChoice({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        choice: "logout_all",
        accessToken: "jwt-admin-token-xyz",
      });
    },
    (err) => {
      assert.equal(err.statusCode, 502);
      assert.match(err.message, /Revocation rejected by Supabase Auth/);
      return true;
    }
  );

  // 6. Missing accessToken for logout_all throws 502
  await assert.rejects(
    async () => {
      await service.recordSessionChoice({
        adminUser: { id: "admin-1", email: "admin@voxreview.test" },
        choice: "logout_all",
        accessToken: null,
      });
    },
    (err) => {
      assert.equal(err.statusCode, 502);
      assert.match(err.message, /session token is required/);
      return true;
    }
  );
});
