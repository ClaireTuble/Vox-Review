import express from "express";
import { requireUserAuth } from "../middleware/userAuth.js";
import { getUserProfile, updateUserProfile, changePassword } from "../controllers/userProfileController.js";

const router = express.Router();

router.get("/profile", requireUserAuth, getUserProfile);
router.put("/profile", requireUserAuth, updateUserProfile);
router.post("/profile", requireUserAuth, updateUserProfile);
router.put("/password", requireUserAuth, changePassword);

export default router;
