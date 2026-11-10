import { adminTwoFactorService } from "../services/adminTwoFactorService.js";
import {
  extractClientIp,
  extractDeviceInfo,
  extractUserAgent,
} from "../utils/auditLogger.js";

/**
 * Endpoint 1: POST /api/admin/auth/login-init
 * Validates primary credentials against Supabase Auth, verifies app_metadata.role === 'superadmin',
 * generates a 6-digit numeric OTP, dispatches it via Brevo API, and returns an ephemeral challengeToken.
 */
export async function initiateAdminLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required.",
      });
    }

    const ipAddress = extractClientIp(req);
    const userAgent = extractDeviceInfo(req);

    const result = await adminTwoFactorService.initiateSuperAdminLogin({
      email,
      password,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      mfaRequired: true,
      message: "Credentials verified. Two-factor verification code dispatched to registered email.",
      challengeToken: result.challengeToken,
      expiresInSeconds: result.expiresInSeconds,
      adminEmail: result.adminEmail,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || "Failed to initiate administrative authentication.",
    });
  }
}

/**
 * Endpoint 2: POST /api/admin/auth/verify-otp
 * Validates the OTP and registers the authenticated Supabase session in one database transaction.
 */
export async function verifyAdminOtp(req, res) {
  try {
    const { challengeToken, otp } = req.body || {};

    if (!challengeToken || !otp) {
      return res.status(400).json({
        success: false,
        error: "Challenge token and 6-digit OTP code are required.",
      });
    }

    const ipAddress = extractClientIp(req);
    const userAgent = extractDeviceInfo(req);

    const result = await adminTwoFactorService.verifySuperAdminOtp({
      challengeToken,
      otp,
      adminUser: req.authUser,
      sessionId: req.sessionId,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      verified: true,
      message: "Super Admin two-factor authentication successful.",
      user: result.user,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      reason: err.reason || null,
      error: err.message || "Failed to verify two-factor authentication code.",
    });
  }
}

/**
 * Endpoint 3: POST /api/admin/auth/password-change/request-otp
 * Dispatches a 6-digit verification code to the authenticated Super Admin's registered email
 * for the explicit purpose of password change. Enforces resend cooldown.
 */
export async function requestPasswordChangeOtp(req, res) {
  try {
    const adminUser = req.authUser;
    const ipAddress = extractClientIp(req);
    const userAgent = extractDeviceInfo(req);

    const result = await adminTwoFactorService.initiatePasswordChangeOtp({
      adminUser,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      message: "Verification code dispatched to your registered email.",
      challengeToken: result.challengeToken,
      expiresInSeconds: result.expiresInSeconds,
      adminEmail: result.adminEmail,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      retryAfterSeconds: err.retryAfterSeconds || undefined,
      error: err.message || "Failed to request password change verification code.",
    });
  }
}

/**
 * Endpoint 4: POST /api/admin/auth/password-change/verify-otp
 * Verifies the 6-digit OTP specifically for password_change and issues a single-use authorization token.
 */
export async function verifyPasswordChangeOtp(req, res) {
  try {
    const adminUser = req.authUser;
    const { challengeToken, otp } = req.body || {};

    if (!challengeToken || !otp) {
      return res.status(400).json({
        success: false,
        error: "Challenge token and 6-digit verification code are required.",
      });
    }

    const ipAddress = extractClientIp(req);
    const userAgent = extractDeviceInfo(req);

    const result = await adminTwoFactorService.verifyPasswordChangeOtp({
      adminUser,
      challengeToken,
      otp,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      verified: true,
      passwordChangeToken: result.passwordChangeToken,
      message: result.message,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      reason: err.reason || null,
      error: err.message || "Failed to verify password change code.",
    });
  }
}

/**
 * Endpoint 5: POST /api/admin/auth/password-change/confirm
 * Validates the password change authorization token, verifies password complexity,
 * and updates the administrator's Supabase Auth password.
 */
export async function confirmPasswordChange(req, res) {
  try {
    const adminUser = req.authUser;
    const { passwordChangeToken, newPassword, confirmPassword } = req.body || {};

    const ipAddress = extractClientIp(req);
    const userAgent = extractDeviceInfo(req);

    const result = await adminTwoFactorService.confirmPasswordChange({
      adminUser,
      passwordChangeToken,
      newPassword,
      confirmPassword,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || "Failed to update administrator password.",
    });
  }
}

/**
 * Endpoint 6: POST /api/admin/auth/password-change/session-choice
 * Records the Super Admin's choice regarding other active device sessions (keep_sessions vs logout_all).
 */
export async function recordSessionChoice(req, res) {
  try {
    const adminUser = req.authUser;
    const { choice } = req.body || {};

    const ipAddress = extractClientIp(req);
    const userAgent = extractDeviceInfo(req);
    const rawUserAgent = extractUserAgent(req);

    const result = await adminTwoFactorService.recordSessionChoice({
      adminUser,
      choice,
      accessToken: req.accessToken,
      sessionId: req.sessionId,
      ipAddress,
      userAgent,
      rawUserAgent,
    });

    return res.status(200).json({
      success: true,
      choice: result.choice,
      message: result.message,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || "Failed to record device session selection.",
    });
  }
}
