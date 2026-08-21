import { Router } from "express";
import { reportHealth, getHealthStatus } from "../controllers/healthController.js";

const router = Router();

// POST /api/health/report — Extension reports scraping health events
router.post("/report", reportHealth);

// GET /api/health/status — Super Admin dashboard fetches all platform statuses
router.get("/status", getHealthStatus);

export default router;
