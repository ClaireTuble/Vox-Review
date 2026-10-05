import express from "express";
import { requireUserAuth } from "../middleware/userAuth.js";
import {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  removeAvatar,
  changePassword,
} from "../controllers/userProfileController.js";

const router = express.Router();

router.get("/profile", requireUserAuth, getUserProfile);
router.put("/profile", requireUserAuth, updateUserProfile);
router.post("/profile", requireUserAuth, updateUserProfile);
router.post("/profile/avatar", requireUserAuth, uploadAvatar);
router.delete("/profile/avatar", requireUserAuth, removeAvatar);
router.put("/password", requireUserAuth, changePassword);

export default router;
