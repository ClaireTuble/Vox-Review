import { createServiceRoleClient } from "./serviceRoleSupabase.js";

/**
 * Create a Supabase admin client for audit operations.
 */
function getAuditSupabase() {
  return createServiceRoleClient();
}

/**
 * Insert an audit log record.
 *
 * @param {Object} params
 * @param {string} params.action - e.g., "super_admin_login", "user_registration", "view_user_management"
 * @param {string} params.status - "Successful", "Failed", or "Warning"
 * @param {string} params.event_type - "Authentication", "Access", "Configuration", or "Diagnostic"
 * @param {string} [params.admin_user_id] - UUID of the admin who performed the action
 * @param {string} [params.admin_email] - Email of the admin
 * @param {string} [params.target] - Target identifier (e.g., user_id, platform name)
 * @param {string} [params.resource_type] - Type of resource (e.g., "User", "System", "Authentication")
 * @param {string} [params.device] - Device information
 * @param {string} [params.ip_address] - IP address of the request
 * @param {string} [params.details] - Additional details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createAuditLog({
  action,
  status = "Successful",
  event_type = "Access",
  admin_user_id = null,
  admin_email = null,
  target = null,
  resource_type = null,
  device = null,
  ip_address = null,
  session_id = null,
  user_agent = null,
  details = null,
}) {
  try {
    const auditSupabase = getAuditSupabase();

    const { error } = await auditSupabase.from("audit_logs").insert({
      action,
      status,
      event_type,
      admin_user_id,
      admin_email,
      target,
      resource_type,
      device,
      ip_address,
      session_id,
      user_agent,
      details,
    });

    if (error) {
      console.error(`[AuditLogger] Failed to insert audit log for "${action}":`, error.message);
      return false;
    }

    console.log(`[AuditLogger] Audit log created: action="${action}", status="${status}"`);
    return true;
  } catch (err) {
    if (err?.code === "SERVICE_ROLE_CONFIGURATION_MISSING") {
      console.error("[AuditLogger] Audit log was not persisted because service-role configuration is missing.");
    } else {
      console.error("[AuditLogger] Exception while creating audit log:", err.message);
    }
    return false;
  }
}

export async function touchSuperAdminSession({
  admin_id,
  session_id,
  ip_address = null,
  user_agent = null,
}) {
  const auditSupabase = getAuditSupabase();
  const { error } = await auditSupabase
    .from("superadmin_otp_sessions")
    .update({
      ip_address,
      user_agent,
      last_active_at: new Date().toISOString(),
    })
    .eq("admin_user_id", admin_id)
    .eq("session_id", session_id)
    .is("revoked_at", null);
  if (error) {
    console.error("[AuditLogger] Failed to update Super Admin session activity:", error.message);
    throw new Error("Super Admin session activity could not be recorded.");
  }
}

export async function revokeSuperAdminSession({
  admin_id,
  session_id,
  allSessions = false,
}) {
  const auditSupabase = getAuditSupabase();
  let query = auditSupabase.from("superadmin_otp_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_user_id", admin_id)
    .is("revoked_at", null);
  if (!allSessions) query = query.eq("session_id", session_id);
  const { error } = await query;
  if (error) {
    console.error("[AuditLogger] Failed to record Super Admin session revocation:", error.message);
    throw new Error("Super Admin session revocation could not be recorded.");
  }
}

/**
 * Insert a notification record.
 *
 * @param {Object} params
 * @param {string} params.category - "Security", "Platform", or "Users"
 * @param {string} params.type - "alert", "danger", "warning", "success", or "info"
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} [params.source_event] - Source event identifier
 * @param {string} [params.actor_user_id] - UUID of the actor
 * @param {boolean} [params.is_active] - Whether the notification is active (default: true)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createNotification({
  category,
  type,
  title,
  message,
  source_event = null,
  actor_user_id = null,
  is_active = true,
}) {
  try {
    const auditSupabase = getAuditSupabase();

    const { error } = await auditSupabase.from("notifications").insert({
      category,
      type,
      title,
      message,
      read: false,
      source_event,
      actor_user_id,
      is_active,
    });

    if (error) {
      console.error(`[AuditLogger] Failed to insert notification "${title}":`, error.message);
      return false;
    }

    console.log(`[AuditLogger] Notification created: category="${category}", title="${title}"`);
    return true;
  } catch (err) {
    if (err?.code === "SERVICE_ROLE_CONFIGURATION_MISSING") {
      console.error("[AuditLogger] Notification was not persisted because service-role configuration is missing.");
    } else {
      console.error("[AuditLogger] Exception while creating notification:", err.message);
    }
    return false;
  }
}

/**
 * Use Express's resolved client address; forwarding headers are untrusted unless
 * Express is explicitly configured with verified proxy addresses or ranges.
 * Do not enable broad trust-proxy settings for production ingress.
 */
export function extractClientIp(req) {
  if (!req) return null;
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null
  );
}

/**
 * Extract device/user-agent from a request object.
 */
export function extractDeviceInfo(req) {
  if (!req) return null;
  const userAgent = req.get?.("user-agent") || req.headers?.["user-agent"] || "";
  if (!userAgent) return null;
  
  // Simple device detection
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Edge")) return "Edge";
  return userAgent.substring(0, 50);
}

export function extractUserAgent(req) {
  if (!req) return null;
  const userAgent = req.get?.("user-agent") || req.headers?.["user-agent"] || "";
  return typeof userAgent === "string" && userAgent.trim()
    ? userAgent.trim().slice(0, 512)
    : null;
}
