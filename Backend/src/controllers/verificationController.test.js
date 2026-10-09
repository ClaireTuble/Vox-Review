import assert from "node:assert/strict";
import test from "node:test";
import {
  requestForgotPassword,
  verifyVerificationCode,
} from "./verificationController.js";
import { verificationService } from "../services/verificationService.js";
import { ServiceRoleConfigurationError } from "../utils/serviceRoleSupabase.js";

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("missing verification code returns a client error", async () => {
  const res = createResponse();

  await verifyVerificationCode({ authUser: { id: "user-id" }, body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    error: "Verification code is required.",
  });
});

test("forgot-password reports missing privileged configuration without exposing credentials", async () => {
  const original = verificationService.requestForgotPasswordCode;
  verificationService.requestForgotPasswordCode = async () => {
    throw new ServiceRoleConfigurationError();
  };
  const res = createResponse();

  try {
    await requestForgotPassword({ body: { email: "user@example.invalid" } }, res);
  } finally {
    verificationService.requestForgotPasswordCode = original;
  }

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    success: false,
    error: "Privileged database operations are unavailable because the service-role configuration is missing.",
  });
  assert.equal(JSON.stringify(res.body).includes("service-role-key"), false);
});
