import { Router } from "express";
import { reportHealth, getHealthStatus } from "../controllers/healthController.js";
import { createGetPlatformAvailability } from "../middleware/requirePlatformAvailable.js";

const router = Router();
const getPlatformAvailability = createGetPlatformAvailability();

// POST /api/health/report — Extension reports scraping health events
router.post("/report", reportHealth);

// GET /api/health/status — Super Admin dashboard fetches all platform statuses
router.get("/status", getHealthStatus);
router.get("/platforms/:platformKey/availability", getPlatformAvailability);

export default router;
