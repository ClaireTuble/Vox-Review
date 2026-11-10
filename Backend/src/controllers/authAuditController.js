import {
  createAuditLog,
  createNotification,
  extractClientIp,
  extractDeviceInfo,
  extractUserAgent,
  revokeSuperAdminSession,
} from "../utils/auditLogger.js";

export async function revokeSuperAdminSessionOrRespond({
  adminId,
  sessionId,
  res,
  revokeSession = revokeSuperAdminSession,
  logger = console,
}) {
  try {
    await revokeSession({ admin_id: adminId, session_id: sessionId });
    return true;
  } catch (error) {
    logger.error("[AuthAuditController] Could not mark Super Admin session revoked.", {
      code: error?.code || null,
    });
    res.status(503).json({
      success: false,
      error: "The Super Admin session could not be revoked. Please retry logout.",
    });
    return false;
  }
}

/**
 * Log a successful Super Admin login.
 * Called after the frontend successfully obtains an auth token.
 * Protected by requireSuperAdmin middleware.
 */
export async function logSuperAdminLoginSuccess(req, res) {
  try {
    const authUser = req.authUser;
    const adminEmail = authUser?.email || "unknown@admin.internal";
    const adminUserId = authUser?.id || null;
    const ip = extractClientIp(req);
    const device = extractDeviceInfo(req);
    const userAgent = extractUserAgent(req);

    await createAuditLog({
      action: "super_admin_login",
      status: "Successful",
      event_type: "Authentication",
      admin_user_id: adminUserId,
      admin_email: adminEmail,
      resource_type: "Authentication",
      ip_address: ip,
      device: device,
      session_id: req.sessionId,
      user_agent: userAgent,
      details: `Super Admin login successful for ${adminEmail}`,
    });

    return res.status(200).json({
      success: true,
      message: "Login recorded.",
    });
  } catch (err) {
    console.error("[AuthAuditController] Log login success error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to record login.",
    });
  }
}

/**
 * Log a Super Admin logout.
 * Called when a Super Admin logs out.
 * Protected by requireSuperAdmin middleware.
 */
export function createSuperAdminLogoutHandler({
  createAuditLogImpl = createAuditLog,
  revokeSessionImpl = revokeSuperAdminSession,
  logger = console,
} = {}) {
  return async function logSuperAdminLogout(req, res) {
    try {
      const authUser = req.authUser;
      const adminEmail = authUser?.email || "unknown@admin.internal";
      const adminUserId = authUser?.id || null;
      const ip = extractClientIp(req);
      const device = extractDeviceInfo(req);
      const userAgent = extractUserAgent(req);

      await createAuditLogImpl({
        action: "super_admin_logout",
        status: "Warning",
        event_type: "Authentication",
        admin_user_id: adminUserId,
        admin_email: adminEmail,
        resource_type: "Authentication",
        ip_address: ip,
        device,
        session_id: req.sessionId,
        user_agent: userAgent,
        details: `Super Admin logout requested for ${adminEmail}; durable revocation is pending.`,
      });

      const revocationSucceeded = await revokeSuperAdminSessionOrRespond({
        adminId: authUser.id,
        sessionId: req.sessionId,
        res,
        revokeSession: revokeSessionImpl,
        logger,
      });
      if (!revocationSucceeded) return;

      await createAuditLogImpl({
        action: "super_admin_logout",
        status: "Successful",
        event_type: "Authentication",
        admin_user_id: adminUserId,
        admin_email: adminEmail,
        resource_type: "Authentication",
        ip_address: ip,
        device,
        session_id: req.sessionId,
        user_agent: userAgent,
        details: `Super Admin logout for ${adminEmail}`,
      });
      return res.status(200).json({
        success: true,
        message: "Logout recorded.",
      });
    } catch (err) {
      logger.error("[AuthAuditController] Log logout error:", err.message);
      return res.status(500).json({
        success: false,
        error: "Failed to record logout.",
      });
    }
  };
}

export const logSuperAdminLogout = createSuperAdminLogoutHandler();

/**
 * Log a failed Super Admin login attempt.
 * Unauthenticated endpoint called after a failed login attempt.
 * Rate-limited per email to prevent abuse.
 * Does NOT reveal whether an email exists.
 */
export async function logSuperAdminLoginFailure(req, res) {
  try {
    const { email } = req.body || {};
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({
        success: false,
        error: "Email is required.",
      });
    }

    const ip = extractClientIp(req);
    const device = extractDeviceInfo(req);

    // Log the failed login attempt using a generic, non-revealing email
    // We use "admin" as a placeholder instead of the provided email to avoid
    // revealing whether an account exists.
    await createAuditLog({
      action: "super_admin_login",
      status: "Failed",
      event_type: "Authentication",
      admin_user_id: null,
      admin_email: "admin@internal", // Generic, non-revealing
      resource_type: "Authentication",
      ip_address: ip,
      device: device,
      details: "Super Admin login attempt failed.",
    });

    // Create a Security notification for failed Super Admin login
    await createNotification({
      category: "Security",
      type: "alert",
      title: "Failed Login Attempt",
      message: "A Super Admin login attempt failed.",
      source_event: "super_admin_login_failed",
      is_active: true,
    });

    // Return generic message to avoid revealing whether email exists
    return res.status(200).json({
      success: true,
      message: "Login attempt recorded.",
    });
  } catch (err) {
    console.error("[AuthAuditController] Log login failure error:", err.message);
    return res.status(200).json({
      success: true,
      message: "Login attempt recorded.",
    });
  }
}
