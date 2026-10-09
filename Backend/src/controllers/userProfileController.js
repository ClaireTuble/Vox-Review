import { passwordService } from "../services/passwordService.js";
import { createAuditLog, extractClientIp, extractDeviceInfo } from "../utils/auditLogger.js";
import { buildFullName } from "../utils/profileName.js";
import {
  createServiceRoleClient,
  respondIfServiceRoleUnavailable,
} from "../utils/serviceRoleSupabase.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function resolveUserAvatar(userRow, authUser) {
  const metadata = authUser?.user_metadata || {};
  const customAvatar = userRow?.avatar_url || metadata.custom_avatar_url || null;

  // Google OAuth profile picture fallback
  const googleAvatar =
    metadata.google_avatar_url ||
    metadata.avatar_url ||
    metadata.picture ||
    (Array.isArray(authUser?.identities)
      ? authUser.identities.find((id) => id.provider === "google")?.identity_data?.avatar_url
      : null) ||
    null;

  if (customAvatar) {
    return {
      avatarUrl: customAvatar,
      isCustom: true,
      googleAvatarUrl: googleAvatar,
    };
  }

  if (googleAvatar) {
    return {
      avatarUrl: googleAvatar,
      isCustom: false,
      googleAvatarUrl: googleAvatar,
    };
  }

  return {
    avatarUrl: null,
    isCustom: false,
    googleAvatarUrl: null,
  };
}

export function isAllowedAvatarMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

export async function ensureAvatarsBucket(adminSupabase) {
  const { data: buckets, error } = await adminSupabase.storage.listBuckets();
  if (error) {
    throw new Error(`Unable to verify avatar storage configuration: ${error.message}`);
  }

  if (!buckets?.some((bucket) => bucket.name === "avatars")) {
    throw new Error('Avatar storage configuration error: required "avatars" bucket is missing.');
  }
}

export async function getUserProfile(req, res) {
  try {
    const authUserId = req.authUser?.id;
    if (!authUserId) {
      return res.status(401).json({ success: false, error: "Authenticated user identity missing." });
    }

    const adminSupabase = createServiceRoleClient();

    const authMetadata = req.authUser.user_metadata || {};
    const currentUsername = authMetadata.username || authMetadata.name || req.authUser.email?.split("@")[0] || "";
    const firstName = authMetadata.firstName || "";
    const lastName = authMetadata.lastName || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || currentUsername;

    let userRow = null;
    try {
      const { data } = await adminSupabase
        .from("users")
        .select("full_name, email, auth_user_id, user_id, status, role, avatar_url")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      userRow = data;
    } catch {
      userRow = null;
    }

    const finalUsername = currentUsername || userRow?.username || req.authUser.email?.split("@")[0] || "";
    const finalFullName = userRow?.full_name || fullName || req.authUser.email?.split("@")[0] || "";
    const avatarInfo = resolveUserAvatar(userRow, req.authUser);

    return res.status(200).json({
      success: true,
      user: {
        id: authUserId,
        email: req.authUser.email,
        username: finalUsername,
        firstName: firstName,
        lastName: lastName,
        fullName: finalFullName,
        avatarUrl: avatarInfo.avatarUrl,
        isCustomAvatar: avatarInfo.isCustom,
        googleAvatarUrl: avatarInfo.googleAvatarUrl,
      },
      dbUser: userRow,
    });
  } catch (err) {
    if (respondIfServiceRoleUnavailable(res, err)) return;
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

    const { firstName, lastName, username, avatarUrl, avatar_url } = req.body;
    const targetAvatarUrl = avatarUrl !== undefined ? avatarUrl : avatar_url;

    const adminSupabase = createServiceRoleClient();

    const newFirstName = (firstName !== undefined ? firstName : req.authUser.user_metadata?.firstName || "").trim();
    const newLastName = (lastName !== undefined ? lastName : req.authUser.user_metadata?.lastName || "").trim();
    const newUsername = (username !== undefined ? username : req.authUser.user_metadata?.username || req.authUser.email.split("@")[0]).trim();
    const fullName = buildFullName(
      newFirstName,
      newLastName,
      newUsername || req.authUser.email.split("@")[0],
    );

    const nextUserMetadata = {
      ...req.authUser.user_metadata,
      firstName: newFirstName,
      lastName: newLastName,
      username: newUsername || req.authUser.user_metadata?.username || req.authUser.email.split("@")[0],
      name: newUsername || req.authUser.user_metadata?.username || req.authUser.email.split("@")[0],
    };

    if (targetAvatarUrl !== undefined) {
      if (targetAvatarUrl === null || targetAvatarUrl === "") {
        nextUserMetadata.custom_avatar_url = null;
      } else {
        nextUserMetadata.custom_avatar_url = targetAvatarUrl;
      }
    }

    // 1. Update auth.users metadata securely via Supabase Auth Admin API
    const { error: authUpdateErr } = await adminSupabase.auth.admin.updateUserById(
      authUserId,
      { user_metadata: nextUserMetadata }
    );

    if (authUpdateErr) {
      console.error("Error updating auth user metadata:", authUpdateErr);
      return res.status(500).json({ success: false, error: authUpdateErr.message });
    }

    // 2. Update public.users matching auth_user_id
    const dbUpdatePayload = { full_name: fullName };
    if (targetAvatarUrl !== undefined) {
      dbUpdatePayload.avatar_url = targetAvatarUrl === "" ? null : targetAvatarUrl;
    }

    let { data: userRow, error: profileUpdateErr } = await adminSupabase
      .from("users")
      .update(dbUpdatePayload)
      .eq("auth_user_id", authUserId)
      .select("*")
      .maybeSingle();

    if (profileUpdateErr) {
      console.error("Error updating public user profile:", profileUpdateErr);
      return res.status(500).json({ success: false, error: "Unable to synchronize profile." });
    }

    if (!userRow) {
      // Fallback if auth_user_id wasn't linked yet: match by email
      const email = req.authUser.email;
      if (email) {
        const { data: updatedByEmail, error: emailUpdateErr } = await adminSupabase
          .from("users")
          .update({ ...dbUpdatePayload, auth_user_id: authUserId })
          .eq("email", email)
          .select("*")
          .maybeSingle();
        if (emailUpdateErr) {
          console.error("Error linking and updating public user profile:", emailUpdateErr);
          return res.status(500).json({ success: false, error: "Unable to synchronize profile." });
        }
        userRow = updatedByEmail;
      }
    }

    if (!userRow) {
      return res.status(404).json({ success: false, error: "User profile record was not found." });
    }

    // Create audit log if it's a Super Admin action
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

    const updatedAuthUser = {
      ...req.authUser,
      user_metadata: nextUserMetadata,
    };
    const avatarInfo = resolveUserAvatar(userRow, updatedAuthUser);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: authUserId,
        email: req.authUser.email,
        username: newUsername,
        firstName: newFirstName,
        lastName: newLastName,
        fullName: fullName,
        avatarUrl: avatarInfo.avatarUrl,
        isCustomAvatar: avatarInfo.isCustom,
        googleAvatarUrl: avatarInfo.googleAvatarUrl,
      },
      dbUser: userRow,
    });
  } catch (err) {
    if (respondIfServiceRoleUnavailable(res, err)) return;
    console.error("Update profile error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function uploadAvatar(req, res) {
  try {
    const authUserId = req.authUser?.id;
    if (!authUserId) {
      return res.status(401).json({ success: false, error: "Authenticated user identity missing." });
    }

    const { imageBase64, dataUrl, mimeType: providedMimeType, fileName } = req.body || {};
    const rawImage = imageBase64 || dataUrl;

    if (!rawImage || typeof rawImage !== "string") {
      return res.status(400).json({ success: false, error: "No image data provided for upload." });
    }

    let mimeType = providedMimeType || "image/jpeg";
    let base64Data = rawImage;

    if (rawImage.startsWith("data:")) {
      const parts = rawImage.split(",");
      const mimeMatch = parts[0].match(/data:(.*?);/);
      if (mimeMatch) mimeType = mimeMatch[1].toLowerCase();
      base64Data = parts[1] || "";
    }
    if (!isAllowedAvatarMimeType(mimeType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type "${mimeType}". Allowed types: JPEG, PNG, WebP, GIF.`,
      });
    }

    const imageBuffer = Buffer.from(base64Data, "base64");
    if (imageBuffer.length === 0) {
      return res.status(400).json({ success: false, error: "Empty image data." });
    }

    if (imageBuffer.length > MAX_AVATAR_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: "File size exceeds the 5MB maximum limit. Please choose a smaller image.",
      });
    }

    const adminSupabase = createServiceRoleClient();

    await ensureAvatarsBucket(adminSupabase);

    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const filePath = `avatars/${authUserId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("avatars")
      .upload(filePath, imageBuffer, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return res.status(500).json({ success: false, error: uploadError.message || "Failed to upload image to storage." });
    }

    const { data: publicData } = adminSupabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const publicUrl = publicData?.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ success: false, error: "Unable to generate public URL for avatar." });
    }

    // 1. Update auth metadata
    const nextUserMetadata = {
      ...req.authUser.user_metadata,
      custom_avatar_url: publicUrl,
    };
    await adminSupabase.auth.admin.updateUserById(authUserId, {
      user_metadata: nextUserMetadata,
    });

    // 2. Update public.users.avatar_url
    await adminSupabase
      .from("users")
      .update({ avatar_url: publicUrl })
      .eq("auth_user_id", authUserId);

    return res.status(200).json({
      success: true,
      message: "Profile picture uploaded successfully.",
      avatarUrl: publicUrl,
      isCustomAvatar: true,
    });
  } catch (err) {
    if (respondIfServiceRoleUnavailable(res, err)) return;
    console.error("Avatar upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function removeAvatar(req, res) {
  try {
    const authUserId = req.authUser?.id;
    if (!authUserId) {
      return res.status(401).json({ success: false, error: "Authenticated user identity missing." });
    }

    const adminSupabase = createServiceRoleClient();

    // 1. Clear custom avatar from user metadata
    const nextUserMetadata = {
      ...req.authUser.user_metadata,
      custom_avatar_url: null,
    };
    await adminSupabase.auth.admin.updateUserById(authUserId, {
      user_metadata: nextUserMetadata,
    });

    // 2. Clear public.users.avatar_url
    await adminSupabase
      .from("users")
      .update({ avatar_url: null })
      .eq("auth_user_id", authUserId);

    const updatedAuthUser = {
      ...req.authUser,
      user_metadata: nextUserMetadata,
    };
    const avatarInfo = resolveUserAvatar({ avatar_url: null }, updatedAuthUser);

    return res.status(200).json({
      success: true,
      message: "Custom profile picture removed.",
      avatarUrl: avatarInfo.avatarUrl,
      isCustomAvatar: false,
    });
  } catch (err) {
    if (respondIfServiceRoleUnavailable(res, err)) return;
    console.error("Remove avatar error:", err);
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
    if (respondIfServiceRoleUnavailable(res, err)) return;
    console.error("Change password error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to update password." });
  }
}
