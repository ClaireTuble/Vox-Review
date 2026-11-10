import { Router } from "express";
import {
  initiateAdminLogin,
  verifyAdminOtp,
  requestPasswordChangeOtp,
  verifyPasswordChangeOtp,
  confirmPasswordChange,
  recordSessionChoice,
} from "../controllers/adminAuthController.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import {
  requireAuthenticatedSuperAdmin,
  requireSuperAdmin,
} from "../middleware/superAdminAuth.js";

const router = Router();
const isProduction = process.env.NODE_ENV === "production";

// Rate limiter for login initialization: max 5 requests per 15 minutes per IP
const loginInitLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Please wait 15 minutes before trying again.",
});

// OTP verification is relaxed locally while retaining the production threshold.
const otpVerifyLimiter = createRateLimiter({
  windowMs: isProduction ? 10 * 60 * 1000 : 5 * 60 * 1000,
  max: isProduction ? 10 : 30,
  message: "Too many verification attempts. Please wait 10 minutes before trying again.",
});

// Rate limiter for password change OTP requests: max 5 requests per 15 minutes per IP
const passwordChangeRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 5 : 15,
  message: "Too many password change requests. Please wait 15 minutes before trying again.",
});

// Rate limiter for password change OTP verification: max 10 requests per 10 minutes per IP
const passwordChangeVerifyLimiter = createRateLimiter({
  windowMs: isProduction ? 10 * 60 * 1000 : 5 * 60 * 1000,
  max: isProduction ? 10 : 30,
  message: "Too many verification attempts. Please wait 10 minutes before trying again.",
});

// Password changes are strongly limited in production and less restrictive in development.
const passwordChangeConfirmLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 30,
  message: "Too many attempts. Please wait a few minutes before trying again.",
});

router.post("/login-init", loginInitLimiter, initiateAdminLogin);
router.post(
  "/verify-otp",
  requireAuthenticatedSuperAdmin,
  otpVerifyLimiter,
  verifyAdminOtp,
);
router.get("/session", requireSuperAdmin, (req, res) => res.status(200).json({
  success: true,
  user: { id: req.authUser.id, role: "superadmin" },
}));

// Super Admin Password Change with mandatory email OTP verification
router.post("/password-change/request-otp", requireSuperAdmin, passwordChangeRequestLimiter, requestPasswordChangeOtp);
router.post("/password-change/verify-otp", requireSuperAdmin, passwordChangeVerifyLimiter, verifyPasswordChangeOtp);
router.post("/password-change/confirm", requireSuperAdmin, passwordChangeConfirmLimiter, confirmPasswordChange);
router.post("/password-change/session-choice", requireSuperAdmin, recordSessionChoice);

export default router;
