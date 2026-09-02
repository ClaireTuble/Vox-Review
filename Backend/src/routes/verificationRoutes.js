import express from "express";
import { requireUserAuth } from "../middleware/userAuth.js";
import {
  requestSignupVerification,
  verifySignupCode,
  requestVerificationCode,
  verifyVerificationCode,
  requestForgotPassword,
  verifyForgotPassword,
  resetPassword,
} from "../controllers/verificationController.js";

const router = express.Router();

// Unauthenticated signup verification routes
router.post("/verification/request-signup", requestSignupVerification);
router.post("/verification/verify-signup", verifySignupCode);
router.post("/verification/request-forgot-password", requestForgotPassword);
router.post("/verification/verify-forgot-password", verifyForgotPassword);
router.put("/password/reset", resetPassword);

// Authenticated verification routes
router.post("/verification/request", requireUserAuth, requestVerificationCode);
router.post("/verification/verify", requireUserAuth, verifyVerificationCode);

export default router;
