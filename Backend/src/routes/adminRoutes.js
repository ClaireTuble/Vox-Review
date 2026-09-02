import { Router } from "express";
import { getAdminUsers } from "../controllers/adminUsersController.js";
import { getAdminDashboardStats } from "../controllers/adminDashboardController.js";
import { getAdminNotifications, toggleAdminNotificationRead, markAllAdminNotificationsRead, clearReadAdminNotifications } from "../controllers/adminNotificationsController.js";
import { getAdminActivityLogs } from "../controllers/adminAuditController.js";
import { logSuperAdminLoginSuccess, logSuperAdminLogout, logSuperAdminLoginFailure } from "../controllers/authAuditController.js";
import { requireSuperAdmin } from "../middleware/superAdminAuth.js";

const router = Router();

// Authentication audit logging
router.post("/log-login-success", requireSuperAdmin, logSuperAdminLoginSuccess);
router.post("/log-logout", requireSuperAdmin, logSuperAdminLogout);
router.post("/log-login-failed", logSuperAdminLoginFailure);

// Admin endpoints
router.get("/users", requireSuperAdmin, getAdminUsers);
router.get("/overview", requireSuperAdmin, getAdminDashboardStats);
router.get("/notifications", requireSuperAdmin, getAdminNotifications);
router.patch("/notifications/:id/read", requireSuperAdmin, toggleAdminNotificationRead);
router.patch("/notifications/read-all", requireSuperAdmin, markAllAdminNotificationsRead);
router.delete("/notifications/read", requireSuperAdmin, clearReadAdminNotifications);
router.get("/audit-logs", requireSuperAdmin, getAdminActivityLogs);

export default router;