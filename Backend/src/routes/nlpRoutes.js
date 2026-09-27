import { Router } from "express";
import { predictSvm, predictTopics } from "../controllers/nlpController.js";

const router = Router();

// POST /api/nlp/svm/predict — batch-predict numeric Category codes.
router.post("/svm/predict", predictSvm);
router.post("/topics/predict", predictTopics);

export default router;