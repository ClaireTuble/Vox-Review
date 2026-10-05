import { Router } from "express";
import { predictSvm, predictTopics } from "../controllers/nlpController.js";
import { requirePlatformAvailable } from "../middleware/requirePlatformAvailable.js";

const router = Router();

// POST /api/nlp/svm/predict — batch-predict numeric Category codes.
router.post("/svm/predict", requirePlatformAvailable, predictSvm);
router.post("/topics/predict", requirePlatformAvailable, predictTopics);

export default router;