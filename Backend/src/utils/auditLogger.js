import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase admin client for audit operations.
 */
function getAuditSupabase() {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!process.env.SUPABASE_URL || !supabaseKey) {
    console.error("Supabase environment variables are missing for audit logging.");
    return null;
  }
  return createClient(process.env.SUPABASE_URL, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
  details = null,
}) {
  try {
    const auditSupabase = getAuditSupabase();
    if (!auditSupabase) return false;

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
      details,
    });

    if (error) {
      console.error(`[AuditLogger] Failed to insert audit log for "${action}":`, error.message);
      return false;
    }

    console.log(`[AuditLogger] Audit log created: action="${action}", status="${status}"`);
    return true;
  } catch (err) {
    console.error(`[AuditLogger] Exception while creating audit log:`, err.message);
    return false;
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
    if (!auditSupabase) return false;

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
    console.error(`[AuditLogger] Exception while creating notification:`, err.message);
    return false;
  }
}

/**
 * Extract IP address from a request object (Express).
 */
export function extractClientIp(req) {
  return (
    req.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.get("x-client-ip") ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}

/**
 * Extract device/user-agent from a request object.
 */
export function extractDeviceInfo(req) {
  const userAgent = req.get("user-agent") || "";
  if (!userAgent) return null;
  
  // Simple device detection
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Edge")) return "Edge";
  return userAgent.substring(0, 50);
}
