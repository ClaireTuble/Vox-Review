import { Router } from "express";
import { reportUserActivity } from "../controllers/userActivityController.js";
import { requireUserAuth } from "../middleware/userAuth.js";

const router = Router();

// POST /api/user/activity — Report platform usage activity for authenticated regular user
router.post("/", requireUserAuth, reportUserActivity);

export default router;
