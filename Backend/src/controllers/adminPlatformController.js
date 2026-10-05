import { togglePlatformStatus } from "./healthController.js";
import { createAuditLog, extractClientIp, extractDeviceInfo } from "../utils/auditLogger.js";
import { verifySuperAdminPassword } from "../services/superAdminReauthentication.js";

export function createAdminPlatformController({
  toggleStatus = togglePlatformStatus,
  verifyConfirmation = verifySuperAdminPassword,
  writeAuditLog = createAuditLog,
} = {}) {
  return async function toggleAdminPlatformStatus(req, res) {
    try {
      const { platformKey } = req.params;
      const { status, is_active, confirmationPassword } = req.body || {};

      let desiredStatus;
      if (typeof is_active === "boolean") {
        desiredStatus = is_active;
      } else if (typeof status === "string") {
        const normalizedStatus = status.trim().toLowerCase();
        if (normalizedStatus === "active") desiredStatus = true;
        if (normalizedStatus === "disabled") desiredStatus = false;
      }
      if (typeof desiredStatus !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "A valid platform availability state is required.",
        });
      }

      if (!desiredStatus) {
        await verifyConfirmation(req.authUser, confirmationPassword);
      }

      const updated = await toggleStatus(platformKey, desiredStatus);

      const adminEmail = req.authUser?.email || "admin@voxreview.ai";
      const adminUserId = req.authUser?.id || null;
      const ip = extractClientIp(req);
      const device = extractDeviceInfo(req);
      const action = desiredStatus ? "platform_enabled" : "platform_disabled";
      const actionLabel = desiredStatus ? "Enabled" : "Disabled";
      const timestamp = new Date().toISOString();

      let auditRecorded = false;
      try {
        auditRecorded = await writeAuditLog({
          action,
          status: "Successful",
          event_type: "Configuration",
          admin_user_id: adminUserId,
          admin_email: adminEmail,
          resource_type: "Platforms",
          target: updated.name,
          ip_address: ip,
          device,
          details: `Super Admin ${actionLabel.toLowerCase()} ${updated.name} at ${timestamp}.`,
        }) !== false;
      } catch (auditError) {
        console.error("[AdminPlatform] Platform status updated, but audit logging failed:", auditError.message);
      }
      if (!auditRecorded) {
        console.error(`[AdminPlatform] Platform status updated, but the ${action} audit event was not recorded.`);
      }

      return res.status(200).json({
        success: true,
        platform: updated,
        auditTimestamp: timestamp,
        auditRecorded,
      });
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: error.message || "Unable to update platform status.",
      });
    }
  };
}

export const toggleAdminPlatformStatus = createAdminPlatformController();
