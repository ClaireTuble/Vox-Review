import { verificationService } from "../services/verificationService.js";

/**
 * Unauthenticated endpoint: Request 6-digit signup email verification code.
 */
export async function requestSignupVerification(req, res) {
  try {
    const { email, password, username, firstName, lastName } = req.body || {};

    const result = await verificationService.requestSignupVerification({
      email,
      password,
      username,
      firstName,
      lastName,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    console.error("[VerificationController] Request signup verification error:", err.message);
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to send signup verification code.",
    });
  }
}

/**
 * Unauthenticated endpoint: Verify 6-digit signup email verification code and finalize account creation.
 */
export async function verifySignupCode(req, res) {
  try {
    const { email, code } = req.body || {};

    const result = await verificationService.verifySignupCode({ email, code });

    return res.status(200).json({
      success: true,
      message: result.message,
      session: result.session,
      user: result.user,
    });
  } catch (err) {
    console.error("[VerificationController] Verify signup code error:", err.message);
    return res.status(400).json({
      success: false,
      error: err.message || "Verification failed.",
    });
  }
}

/**
 * Authenticated endpoint: Request verification code for authenticated user actions (Change Password, etc.)
 */
export async function requestVerificationCode(req, res) {
  try {
    const authUser = req.authUser;
    if (!authUser || !authUser.id || !authUser.email) {
      return res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
    }

    const authUserId = authUser.id;
    const userEmail = authUser.email;
    const purpose = req.body?.purpose || "change_password";
    const currentPassword = req.body?.currentPassword || null;

    const result = await verificationService.requestVerificationCode(authUserId, userEmail, purpose, currentPassword);

    return res.status(200).json({
      success: true,
      message: result.message,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    console.error("[VerificationController] Request error:", err.message);
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to send verification code.",
    });
  }
}

/**
 * Authenticated endpoint: Verify verification code for authenticated user actions
 */
export async function verifyVerificationCode(req, res) {
  try {
    const authUser = req.authUser;
    if (!authUser || !authUser.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
    }

    const authUserId = authUser.id;
    const purpose = req.body?.purpose || "change_password";
    const code = req.body?.code;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Verification code is required.",
      });
    }

    const result = await verificationService.verifyCode(authUserId, purpose, code);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error("[VerificationController] Verify error:", err.message);
    return res.status(400).json({
      success: false,
      error: err.message || "Verification failed.",
    });
  }
}

export async function requestForgotPassword(req, res) {
  try {
    const result = await verificationService.requestForgotPasswordCode(req.body?.email);
    return res.status(200).json(result);
  } catch (_err) {
    return res.status(200).json({ success: true, message: "If an account exists, a verification code has been sent." });
  }
}

export async function verifyForgotPassword(req, res) {
  try {
    const result = await verificationService.verifyForgotPasswordCode({ email: req.body?.email, code: req.body?.code });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || "Verification failed." });
  }
}

export async function resetPassword(req, res) {
  try {
    const result = await verificationService.resetPassword({
      resetAuthorization: req.body?.resetAuthorization,
      newPassword: req.body?.newPassword,
      confirmPassword: req.body?.confirmPassword,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || "Password reset failed." });
  }
}
