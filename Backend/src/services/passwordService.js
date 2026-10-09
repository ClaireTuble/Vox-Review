import supabaseClient from "../config/supabase.js";
import { verificationService } from "./verificationService.js";
import { createServiceRoleClient } from "../utils/serviceRoleSupabase.js";

export const passwordService = {
  changePassword: async ({ authUser, currentPassword, newPassword }) => {
    const authUserId = authUser?.id;
    const userEmail = authUser?.email;
    if (!authUserId || !userEmail) {
      const error = new Error("Authenticated user identity missing.");
      error.statusCode = 401;
      throw error;
    }
    if (!currentPassword) {
      const error = new Error("Current password is required.");
      error.statusCode = 400;
      throw error;
    }
    if (!newPassword || newPassword.length < 6) {
      const error = new Error("New password must be at least 6 characters long.");
      error.statusCode = 400;
      throw error;
    }

    const { error: currentPasswordError } = await supabaseClient.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });
    if (currentPasswordError) {
      const error = new Error("Current password is incorrect. Please check your password and try again.");
      error.statusCode = 400;
      throw error;
    }

    const { error: passwordUpdateError } = await createServiceRoleClient().auth.admin.updateUserById(
      authUserId,
      { password: newPassword },
    );
    if (passwordUpdateError) {
      throw passwordUpdateError;
    }

    const userName = authUser.user_metadata?.firstName || authUser.user_metadata?.name || authUser.email.split("@")[0];
    try {
      await verificationService.sendPasswordChangedNotification({ email: userEmail, userName });
    } catch (emailError) {
      console.error("[PasswordService] Password-change notification delivery failed:", emailError.message);
    }
  },
};