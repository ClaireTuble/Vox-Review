import {
  createServiceRoleClient,
  respondIfServiceRoleUnavailable,
} from "../utils/serviceRoleSupabase.js";

function formatAuditTimestamp(value) {
  const date = new Date(value || Date.now());
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${suffix}`;
}

function normalizeAuditLog(row) {
  const createdAt = row?.created_at || new Date().toISOString();

  return {
    id: row?.id || `${Date.now()}`,
    timestamp: formatAuditTimestamp(createdAt),
    email: row?.admin_email || "admin@voxreview.ai",
    action: row?.action || "System event",
    status: row?.status || "Successful",
    eventType: row?.event_type || "Access",
    device: row?.device || "Unknown device",
    ip: row?.ip_address || "Unavailable",
    details: row?.details || row?.target || "Administrative action logged.",
  };
}

function normalizeSecurityAlert(row) {
  const createdAt = row?.created_at || new Date().toISOString();
  const title = row?.action?.toLowerCase().includes("login") ? "Super Admin Login" : "Security Alert";
  const type = row?.status === "Failed" ? "alert" : "info";

  return {
    id: row?.id || `${Date.now()}`,
    type,
    title,
    message: row?.details || row?.action || "Security event detected.",
    timestamp: formatAuditTimestamp(createdAt),
    ip: row?.ip_address || "Unavailable",
  };
}

export async function getAdminActivityLogs(req, res) {
  try {
    const adminSupabase = createServiceRoleClient();

    const { data, error } = await adminSupabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const logs = (data || []).map(normalizeAuditLog);
    const securityAlerts = (data || [])
      .filter((row) => {
        const action = String(row?.action || "").toLowerCase();
        return row?.status === "Failed" || action.includes("login") || action.includes("security");
      })
      .slice(0, 2)
      .map(normalizeSecurityAlert);

    return res.status(200).json({
      success: true,
      logs,
      securityAlerts,
    });
  } catch (error) {
    if (respondIfServiceRoleUnavailable(res, error)) return;
    return res.status(500).json({
      success: false,
      error: error.message || "Unable to load admin activity logs.",
    });
  }
}
