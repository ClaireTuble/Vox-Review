import { Router } from "express";
import { getAdminUsers } from "../controllers/adminUsersController.js";
import { getAdminDashboardStats } from "../controllers/adminDashboardController.js";
import { requireSuperAdmin } from "../middleware/superAdminAuth.js";

const router = Router();

router.get("/users", requireSuperAdmin, getAdminUsers);
router.get("/overview", requireSuperAdmin, getAdminDashboardStats);

export default router;