import { createClient } from "@supabase/supabase-js";
import { passwordService } from "../services/passwordService.js";
import { createAuditLog, extractClientIp, extractDeviceInfo } from "../utils/auditLogger.js";

export async function getUserProfile(req, res) {
  try {
    const authUserId = req.authUser?.id;
    if (!authUserId) {
      return res.status(401).json({ success: false, error: "Authenticated user identity missing." });
    }

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authMetadata = req.authUser.user_metadata || {};
    const currentUsername = authMetadata.username || authMetadata.name || req.authUser.email?.split("@")[0] || "";
    const firstName = authMetadata.firstName || "";
    const lastName = authMetadata.lastName || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || currentUsername;

    let userRow = null;
    try {
      const { data } = await adminSupabase
        .from("users")
        .select("full_name, email, auth_user_id, user_id, status, role")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      userRow = data;
    } catch {
      userRow = null;
    }

    const finalUsername = currentUsername || userRow?.username || req.authUser.email?.split("@")[0] || "";
    const finalFullName = userRow?.full_name || fullName || req.authUser.email?.split("@")[0] || "";

    return res.status(200).json({
      success: true,
      user: {
        id: authUserId,
        email: req.authUser.email,
        username: finalUsername,
        firstName: firstName,
        lastName: lastName,
        fullName: finalFullName,
      },
      dbUser: userRow,
    });
  } catch (err) {
    console.error("Get user profile error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateUserProfile(req, res) {
  try {
    const authUserId = req.authUser?.id;
    if (!authUserId) {
      return res.status(401).json({ success: false, error: "Authenticated user identity missing." });
    }

    const { firstName, lastName, username } = req.body;

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const newFirstName = (firstName || "").trim();
    const newLastName = (lastName || "").trim();
    const newUsername = (username || "").trim();
    const fullName = `${newFirstName} ${newLastName}`.trim() || newUsername || req.authUser.email.split("@")[0];

    // 1. Update auth.users metadata securely via Supabase Auth Admin API
    const { error: authUpdateErr } = await adminSupabase.auth.admin.updateUserById(
      authUserId,
      {
        user_metadata: {
          ...req.authUser.user_metadata,
          firstName: newFirstName,
          lastName: newLastName,
          username: newUsername || req.authUser.user_metadata?.username || req.authUser.email.split("@")[0],
          name: newUsername || req.authUser.user_metadata?.username || req.authUser.email.split("@")[0],
        },
      }
    );

    if (authUpdateErr) {
      console.error("Error updating auth user metadata:", authUpdateErr);
      return res.status(500).json({ success: false, error: authUpdateErr.message });
    }

    // 2. Update public.users.full_name matching auth_user_id (never trust a client user_id)
    let { data: userRow } = await adminSupabase
      .update({ full_name: fullName })
      .eq("auth_user_id", authUserId)
      .select("*")
      .maybeSingle();

    if (!userRow) {
      // Fallback if auth_user_id wasn't linked yet: match by email
      const email = req.authUser.email;
      if (email) {
        const { data: updatedByEmail } = await adminSupabase
          .from("users")
          .update({ full_name: fullName, auth_user_id: authUserId })
          .eq("email", email)
          .select("*")
          .maybeSingle();
        userRow = updatedByEmail;
      }
    }

    // 2a. Create audit log for profile update if it's a Super Admin action
    const isAdminAction = req.authUser?.app_metadata?.role === "superadmin" || req.authUser?.app_metadata?.role === "admin";
    if (isAdminAction) {
      const ip = extractClientIp(req);
      const device = extractDeviceInfo(req);
      createAuditLog({
        action: "update_user_profile",
        status: "Successful",
        event_type: "Configuration",
        admin_user_id: authUserId,
        admin_email: req.authUser.email,
        target: userRow?.user_id || authUserId,
        resource_type: "Users",
        ip_address: ip,
        device: device,
        details: `Updated user profile: ${fullName}`,
      }).catch((err) => console.warn("[UserProfile] Audit log warning:", err.message));
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: authUserId,
        email: req.authUser.email,
        username: newUsername || req.authUser.user_metadata?.username || req.authUser.email.split("@")[0],
        firstName: newFirstName,
        lastName: newLastName,
        fullName: fullName,
      },
      dbUser: userRow,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Change User Password - Authenticated endpoint for regular users
 */
export async function changePassword(req, res) {
  try {
    await passwordService.changePassword({
      authUser: req.authUser,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
    });

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 401) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error("Change password error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to update password." });
  }
}
