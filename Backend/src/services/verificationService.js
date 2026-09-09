import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import supabaseClient from "../config/supabase.js";
import { createAuditLog } from "../utils/auditLogger.js";

function getAdminSupabase() {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!process.env.SUPABASE_URL || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }
  return createClient(process.env.SUPABASE_URL, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function hashVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

const FORGOT_PASSWORD_PURPOSE = "forgot_password";
const RESET_AUTHORIZATION_PURPOSE = "forgot_password_reset";
const GENERIC_FORGOT_PASSWORD_MESSAGE = "If an account exists, a verification code has been sent.";

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "voxreview_secure_fallback_key_32b";
  return crypto.scryptSync(secret, "voxreview_signup_salt", 32);
}

/**
 * AES-256-GCM Encryption for pending registration data
 */
function encryptPayload(dataObj) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(JSON.stringify(dataObj), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM Decryption for pending registration data
 */
function decryptPayload(encryptedStr) {
  const key = getEncryptionKey();
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format.");
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

/**
 * Send transactional email via Brevo API
 */
async function sendBrevoEmail({ toEmail, subject, htmlContent, textContent, errorMessage = "Failed to send verification email. Please try again later." }) {
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.warn("[VerificationService] BREVO_API_KEY is missing. Email delivery is unavailable.");
    throw new Error("Email delivery service is currently unavailable.");
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || "no-reply@voxreview.ai";
  const senderName = process.env.BREVO_SENDER_NAME || "VoxReview Security";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": brevoApiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail }],
      subject: subject,
      htmlContent: htmlContent,
      ...(textContent ? { textContent } : {}),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("[VerificationService] Brevo API Error Status:", response.status, errorData.message || "");
    throw new Error(errorMessage);
  }

  return true;
}

export const verificationService = {
  sendPasswordChangedNotification: async ({ email, userName }) => {
    const greeting = userName ? `Hello ${userName},` : "Hello,";
    const textContent = `${greeting}\n\nYour VoxReview account password was successfully changed.\n\nIf you made this change, no further action is needed.\n\nIf you did not make this change, please secure your account immediately.\n\n— VoxReview`;
    const escapedUserName = userName
      ? userName.replace(/[&<>'"]/g, (character) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        }[character]))
      : "";
    const htmlGreeting = escapedUserName ? `Hello ${escapedUserName},` : "Hello,";

    await sendBrevoEmail({
      toEmail: email,
      subject: "Your VoxReview password was changed",
      textContent,
      htmlContent: `<p>${htmlGreeting}</p><p>Your VoxReview account password was successfully changed.</p><p>If you made this change, no further action is needed.</p><p>If you did not make this change, please secure your account immediately.</p><p>&mdash; VoxReview</p>`,
      errorMessage: "Failed to send password-change notification.",
    });
  },

  /**
   * Request signup email verification code.
   * Securely stores encrypted pending signup details and sends Brevo email code.
   * DOES NOT create an account in auth.users or public.users.
   */
  requestSignupVerification: async ({ email, password, username, firstName, lastName }) => {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const cleanUsername = (username || "").trim();
    const cleanFirstName = (firstName || "").trim();
    const cleanLastName = (lastName || "").trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Please enter a valid email address.");
    }
    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }
    if (!cleanUsername || !cleanFirstName || !cleanLastName) {
      throw new Error("Please fill out all required fields.");
    }

    const adminSupabase = getAdminSupabase();
    const now = new Date();

    // 1. Check if email already exists in public.users
    const { data: existingUser } = await adminSupabase
      .from("users")
      .select("email, user_id, auth_user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser && existingUser.auth_user_id) {
      throw new Error("An account with this email address already exists. Please sign in.");
    }

    // Also check auth.users directly via admin.listUsers
    try {
      const { data: authUsers } = await adminSupabase.auth.admin.listUsers();
      if (authUsers?.users?.some((u) => u.email?.toLowerCase() === normalizedEmail)) {
        throw new Error("An account with this email address already exists. Please sign in.");
      }
    } catch (checkErr) {
      if (checkErr.message?.includes("already exists")) {
        throw checkErr;
      }
    }

    // 2. Rate Limit Check: prevent duplicate requests within 30 seconds per email
    const { data: recentCodes } = await adminSupabase
      .from("verification_codes")
      .select("created_at")
      .eq("email", normalizedEmail)
      .eq("purpose", "signup_email_verification")
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentCodes && recentCodes.length > 0) {
      const lastCreated = new Date(recentCodes[0].created_at).getTime();
      const diffSeconds = Math.floor((now.getTime() - lastCreated) / 1000);
      if (diffSeconds < 30) {
        const waitTime = 30 - diffSeconds;
        throw new Error(`Please wait ${waitTime} seconds before requesting another code.`);
      }
    }

    // 3. Invalidate previous active signup codes for this email
    await adminSupabase
      .from("verification_codes")
      .update({ used_at: now.toISOString() })
      .eq("email", normalizedEmail)
      .eq("purpose", "signup_email_verification")
      .is("used_at", null);

    // 4. Encrypt pending registration data securely
    const encryptedPayload = encryptPayload({
      email: normalizedEmail,
      password: password,
      username: cleanUsername,
      firstName: cleanFirstName,
      lastName: cleanLastName,
    });

    // 5. Generate 6-digit code and SHA-256 hash
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashVerificationCode(rawCode);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // 6. Insert verification record (raw code NEVER stored, password encrypted)
    const { error: insertErr } = await adminSupabase
      .from("verification_codes")
      .insert({
        email: normalizedEmail,
        purpose: "signup_email_verification",
        code_hash: codeHash,
        pending_payload: encryptedPayload,
        expires_at: expiresAt,
        attempts: 0,
        used_at: null,
      });

    if (insertErr) {
      console.error("[VerificationService] Signup code insert error:", insertErr.message);
      throw new Error("Could not process registration verification. Please try again.");
    }

    // 7. Send Brevo Transactional Email
    const subject = "Verify your email for VoxReview";
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #4F46E5; margin-bottom: 16px; text-align: center;">Welcome to VoxReview</h2>
        <p style="color: #333333; font-size: 14px; line-height: 1.5;">
          Thank you for signing up! Please verify your email address to complete your registration:
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827; background: #F3F4F6; padding: 12px 24px; border-radius: 8px; display: inline-block;">
            ${rawCode}
          </span>
        </div>
        <p style="color: #6B7280; font-size: 13px; line-height: 1.4;">
          This verification code is valid for <strong>5 minutes</strong>. If you did not create a VoxReview account, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
        <p style="color: #9CA3AF; font-size: 11px; text-align: center;">
          VoxReview Emotion Intelligence • Do not reply to this email
        </p>
      </div>
    `;

    await sendBrevoEmail({
      toEmail: normalizedEmail,
      subject: subject,
      htmlContent: htmlContent,
    });

    return {
      success: true,
      message: "Verification code sent to your email.",
      expiresAt: expiresAt,
    };
  },

  /**
   * Verify signup code and finalize account creation upon success.
   */
  verifySignupCode: async ({ email, code }) => {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const codeStr = String(code || "").trim();

    if (!normalizedEmail || !codeStr) {
      throw new Error("Email and 6-digit verification code are required.");
    }
    if (!/^\d{6}$/.test(codeStr)) {
      throw new Error("Verification code must be exactly 6 digits.");
    }

    const adminSupabase = getAdminSupabase();
    const now = new Date();

    // 1. Fetch active verification code record for email
    const { data: records, error: fetchErr } = await adminSupabase
      .from("verification_codes")
      .select("id, code_hash, pending_payload, expires_at, attempts")
      .eq("email", normalizedEmail)
      .eq("purpose", "signup_email_verification")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchErr || !records || records.length === 0) {
      throw new Error("Verification code has expired or is invalid. Please request a new code.");
    }

    const activeRecord = records[0];
    const recordId = activeRecord.id;
    const expiresAt = new Date(activeRecord.expires_at).getTime();
    let currentAttempts = activeRecord.attempts || 0;

    // 2. Check Expiry (5 minutes)
    if (now.getTime() > expiresAt) {
      await adminSupabase
        .from("verification_codes")
        .update({ used_at: now.toISOString() })
        .eq("id", recordId);
      throw new Error("Verification code has expired. Please request a new code.");
    }

    // 3. Check Attempt Limit (Max 5 attempts)
    if (currentAttempts >= 5) {
      await adminSupabase
        .from("verification_codes")
        .update({ used_at: now.toISOString() })
        .eq("id", recordId);
      throw new Error("Maximum verification attempts exceeded. Please request a new code.");
    }

    // 4. Compare Hashed Code
    const inputHash = hashVerificationCode(codeStr);
    if (inputHash !== activeRecord.code_hash) {
      currentAttempts += 1;
      const updates = { attempts: currentAttempts };
      if (currentAttempts >= 5) {
        updates.used_at = now.toISOString();
      }

      await adminSupabase
        .from("verification_codes")
        .update(updates)
        .eq("id", recordId);

      if (currentAttempts >= 5) {
        throw new Error("Maximum verification attempts exceeded. Code has been invalidated. Please request a new code.");
      }

      const remaining = 5 - currentAttempts;
      throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    // 5. Code Verified! Decrypt pending registration data
    if (!activeRecord.pending_payload) {
      throw new Error("Pending registration data missing or expired. Please register again.");
    }

    let pendingData = null;
    try {
      pendingData = decryptPayload(activeRecord.pending_payload);
    } catch (decryptErr) {
      console.error("[VerificationService] Decryption error:", decryptErr.message);
      throw new Error("Failed to process registration credentials. Please request a new code.");
    }

    const { email: pendingEmail, password, username, firstName, lastName } = pendingData;
    const fullName = `${firstName} ${lastName}`.trim() || username;

    // 6. Mark verification record as used AND clear pending payload immediately
    await adminSupabase
      .from("verification_codes")
      .update({
        used_at: now.toISOString(),
        pending_payload: null, // Wipe encrypted payload immediately
      })
      .eq("id", recordId);

    // 7. Create Supabase Auth account with email_confirm = true (server admin call)
    const { data: authData, error: createAuthErr } = await adminSupabase.auth.admin.createUser({
      email: pendingEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username,
        firstName: firstName,
        lastName: lastName,
        name: fullName,
      },
    });

    if (createAuthErr || !authData.user) {
      console.error("[VerificationService] Admin createUser error:", createAuthErr?.message);
      throw new Error(createAuthErr?.message || "Failed to create user account.");
    }

    const authUserId = authData.user.id;

    // 8. Atomicity: Link / Create public.users row
    try {
      const { data: existingPublic } = await adminSupabase
        .from("users")
        .select("user_id, email, auth_user_id")
        .eq("email", pendingEmail)
        .maybeSingle();

      if (existingPublic) {
        await adminSupabase
          .from("users")
          .update({
            auth_user_id: authUserId,
            full_name: fullName,
            status: "Active",
          })
          .eq("user_id", existingPublic.user_id);
      } else {
        await adminSupabase
          .from("users")
          .insert({
            auth_user_id: authUserId,
            email: pendingEmail,
            full_name: fullName,
            status: "Active",
          });
      }
    } catch (linkErr) {
      console.warn("[VerificationService] Warning syncing public.users row:", linkErr.message);
    }

    // 8a. Create audit log for successful user registration
    try {
      await createAuditLog({
        action: "user_registration",
        status: "Successful",
        event_type: "Access",
        actor_user_id: authUserId,
        admin_email: pendingEmail,
        resource_type: "Users",
        details: `New user registered: ${fullName} (${pendingEmail})`,
      });
    } catch (auditErr) {
      console.warn("[VerificationService] Warning creating audit log for registration:", auditErr.message);
    }

    // 9. Sign in the new user to get official session tokens
    const { data: signInData, error: signInErr } = await supabaseClient.auth.signInWithPassword({
      email: pendingEmail,
      password: password,
    });

    if (signInErr || !signInData.session) {
      console.warn("[VerificationService] Auto sign-in fallback:", signInErr?.message);
      return {
        success: true,
        message: "Account verified and created successfully! Please sign in.",
        user: authData.user,
        session: null,
      };
    }

    return {
      success: true,
      message: "Account created and verified successfully!",
      session: signInData.session,
      user: signInData.user,
    };
  },

  /**
   * Request a new 6-digit verification code for an authenticated user (Change Password etc.)
   */
  requestVerificationCode: async (authUserId, userEmail, purpose = "change_password", currentPassword = null) => {
    if (!authUserId || !userEmail) {
      throw new Error("Authenticated user details missing.");
    }

    // Step 1: Current Password Check for change_password purpose
    if (purpose === "change_password" && currentPassword) {
      const { error: pwdErr } = await supabaseClient.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (pwdErr) {
        throw new Error("Current password is incorrect. Please check your password and try again.");
      }
    }

    const adminSupabase = getAdminSupabase();
    const now = new Date();

    const { data: recentCodes } = await adminSupabase
      .from("verification_codes")
      .select("created_at")
      .eq("user_id", authUserId)
      .eq("purpose", purpose)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentCodes && recentCodes.length > 0) {
      const lastCreated = new Date(recentCodes[0].created_at).getTime();
      const diffSeconds = Math.floor((now.getTime() - lastCreated) / 1000);
      if (diffSeconds < 30) {
        const waitTime = 30 - diffSeconds;
        throw new Error(`Please wait ${waitTime} seconds before requesting another code.`);
      }
    }

    await adminSupabase
      .from("verification_codes")
      .update({ used_at: now.toISOString() })
      .eq("user_id", authUserId)
      .eq("purpose", purpose)
      .is("used_at", null);

    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashVerificationCode(rawCode);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const { error: insertErr } = await adminSupabase
      .from("verification_codes")
      .insert({
        user_id: authUserId,
        email: userEmail,
        purpose: purpose,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
        used_at: null,
      });

    if (insertErr) {
      console.error("[VerificationService] DB Insert Error:", insertErr.message);
      throw new Error("Could not issue verification code. Please try again.");
    }

    const subject = "Your VoxReview Security Verification Code";
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #4F46E5; margin-bottom: 16px; text-align: center;">VoxReview Security</h2>
        <p style="color: #333333; font-size: 14px; line-height: 1.5;">
          Use the verification code below to complete your security request:
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827; background: #F3F4F6; padding: 12px 24px; border-radius: 8px; display: inline-block;">
            ${rawCode}
          </span>
        </div>
        <p style="color: #6B7280; font-size: 13px; line-height: 1.4;">
          This code is valid for <strong>5 minutes</strong>.
        </p>
      </div>
    `;

    await sendBrevoEmail({
      toEmail: userEmail,
      subject: subject,
      htmlContent: htmlContent,
    });

    return {
      success: true,
      message: "Verification code sent to your email.",
      expiresAt: expiresAt,
    };
  },

  requestForgotPasswordCode: async (email) => {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const genericResult = { success: true, message: GENERIC_FORGOT_PASSWORD_MESSAGE };
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return genericResult;

    const adminSupabase = getAdminSupabase();
    const now = new Date();
    const { data: authUsers } = await adminSupabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
        && ((user.app_metadata?.providers || []).includes("email")
          || (user.identities || []).some((identity) => identity.provider === "email"))
    );
    if (!authUser) return genericResult;

    const { data: recentCodes } = await adminSupabase
      .from("verification_codes")
      .select("created_at")
      .eq("email", normalizedEmail)
      .eq("purpose", FORGOT_PASSWORD_PURPOSE)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recentCodes?.length) {
      const secondsSinceLastRequest = Math.floor(
        (now.getTime() - new Date(recentCodes[0].created_at).getTime()) / 1000
      );
      if (secondsSinceLastRequest < 30) return genericResult;
    }

    await adminSupabase
      .from("verification_codes")
      .update({ used_at: now.toISOString() })
      .eq("email", normalizedEmail)
      .eq("purpose", FORGOT_PASSWORD_PURPOSE)
      .is("used_at", null);

    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const { error: insertError } = await adminSupabase
      .from("verification_codes")
      .insert({
        user_id: authUser.id,
        email: normalizedEmail,
        purpose: FORGOT_PASSWORD_PURPOSE,
        code_hash: hashVerificationCode(rawCode),
        expires_at: expiresAt,
        attempts: 0,
        used_at: null,
      });
    if (insertError) return genericResult;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2>Reset your VoxReview password</h2>
        <p>Your VoxReview password-reset verification code is:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px;">${rawCode}</p>
        <p>This code expires in 5 minutes.</p>
        <p>If you did not request a password reset, you can ignore this email.</p>
      </div>
    `;
    try {
      await sendBrevoEmail({
        toEmail: normalizedEmail,
        subject: "Reset your VoxReview password",
        htmlContent,
      });
    } catch (_emailError) {
      return genericResult;
    }
    return { ...genericResult, expiresAt };
  },

  verifyForgotPasswordCode: async ({ email, code }) => {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const codeStr = String(code || "").trim();
    if (!normalizedEmail || !/^\d{6}$/.test(codeStr)) {
      throw new Error("Verification code must be exactly 6 digits.");
    }

    const adminSupabase = getAdminSupabase();
    const now = new Date();
    const { data: records } = await adminSupabase
      .from("verification_codes")
      .select("id, user_id, code_hash, expires_at, attempts")
      .eq("email", normalizedEmail)
      .eq("purpose", FORGOT_PASSWORD_PURPOSE)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const activeRecord = records?.[0];
    if (!activeRecord) throw new Error("Verification code has expired or is invalid. Please request a new code.");
    if (now.getTime() > new Date(activeRecord.expires_at).getTime()) {
      await adminSupabase.from("verification_codes").update({ used_at: now.toISOString() }).eq("id", activeRecord.id);
      throw new Error("Verification code has expired. Please request a new code.");
    }
    if ((activeRecord.attempts || 0) >= 5) {
      await adminSupabase.from("verification_codes").update({ used_at: now.toISOString() }).eq("id", activeRecord.id);
      throw new Error("Maximum verification attempts exceeded. Please request a new code.");
    }
    if (hashVerificationCode(codeStr) !== activeRecord.code_hash) {
      const attempts = (activeRecord.attempts || 0) + 1;
      const updates = { attempts };
      if (attempts >= 5) updates.used_at = now.toISOString();
      await adminSupabase.from("verification_codes").update(updates).eq("id", activeRecord.id);
      throw new Error(attempts >= 5
        ? "Maximum verification attempts exceeded. Code has been invalidated. Please request a new code."
        : `Invalid verification code. ${5 - attempts} attempt(s) remaining.`);
    }

    await adminSupabase.from("verification_codes").update({ used_at: now.toISOString() }).eq("id", activeRecord.id);
    const resetAuthorization = crypto.randomBytes(32).toString("hex");
    const authorizationExpiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const { error: authorizationError } = await adminSupabase
      .from("verification_codes")
      .insert({
        user_id: activeRecord.user_id,
        email: normalizedEmail,
        purpose: RESET_AUTHORIZATION_PURPOSE,
        code_hash: hashVerificationCode(resetAuthorization),
        expires_at: authorizationExpiresAt,
        attempts: 0,
        used_at: null,
      });
    if (authorizationError) throw new Error("Could not create password reset authorization.");
    return { success: true, message: "Verification successful.", resetAuthorization };
  },

  resetPassword: async ({ resetAuthorization, newPassword, confirmPassword }) => {
    if (!resetAuthorization || typeof resetAuthorization !== "string") {
      throw new Error("Password reset authorization is required.");
    }
    if (!newPassword || newPassword.length < 6) throw new Error("Password must be at least 6 characters long.");
    if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");

    const adminSupabase = getAdminSupabase();
    const { data: records } = await adminSupabase
      .from("verification_codes")
      .select("id, user_id, expires_at")
      .eq("purpose", RESET_AUTHORIZATION_PURPOSE)
      .eq("code_hash", hashVerificationCode(resetAuthorization))
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const authorizationRecord = records?.[0];
    if (!authorizationRecord || Date.now() > new Date(authorizationRecord.expires_at).getTime()) {
      throw new Error("Password reset authorization has expired or is invalid.");
    }

    const { data: claimedAuthorization, error: claimError } = await adminSupabase
      .from("verification_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", authorizationRecord.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimedAuthorization) {
      throw new Error("Password reset authorization has expired or is invalid.");
    }

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
      authorizationRecord.user_id,
      { password: newPassword }
    );
    if (updateError) throw new Error("Failed to update password. Please try again.");
    return { success: true, message: "Password updated successfully." };
  },

  verifyCode: async (authUserId, purpose = "change_password", rawCode) => {
    if (!authUserId || !rawCode) {
      throw new Error("Missing verification parameters.");
    }

    const codeStr = String(rawCode).trim();
    if (!/^\d{6}$/.test(codeStr)) {
      throw new Error("Verification code must be exactly 6 digits.");
    }

    const adminSupabase = getAdminSupabase();
    const now = new Date();

    const { data: records, error: fetchErr } = await adminSupabase
      .from("verification_codes")
      .select("id, code_hash, expires_at, attempts")
      .eq("user_id", authUserId)
      .eq("purpose", purpose)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchErr || !records || records.length === 0) {
      throw new Error("Verification code has expired or is invalid. Please request a new code.");
    }

    const activeRecord = records[0];
    const recordId = activeRecord.id;
    const expiresAt = new Date(activeRecord.expires_at).getTime();
    let currentAttempts = activeRecord.attempts || 0;

    if (now.getTime() > expiresAt) {
      await adminSupabase
        .from("verification_codes")
        .update({ used_at: now.toISOString() })
        .eq("id", recordId);
      throw new Error("Verification code has expired. Please request a new code.");
    }

    if (currentAttempts >= 5) {
      await adminSupabase
        .from("verification_codes")
        .update({ used_at: now.toISOString() })
        .eq("id", recordId);
      throw new Error("Maximum verification attempts exceeded. Please request a new code.");
    }

    const inputHash = hashVerificationCode(codeStr);
    if (inputHash !== activeRecord.code_hash) {
      currentAttempts += 1;
      const updates = { attempts: currentAttempts };
      if (currentAttempts >= 5) {
        updates.used_at = now.toISOString();
      }

      await adminSupabase
        .from("verification_codes")
        .update(updates)
        .eq("id", recordId);

      if (currentAttempts >= 5) {
        throw new Error("Maximum verification attempts exceeded. Code has been invalidated. Please request a new code.");
      }

      const remaining = 5 - currentAttempts;
      throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    await adminSupabase
      .from("verification_codes")
      .update({ used_at: now.toISOString() })
      .eq("id", recordId);

    return {
      success: true,
      message: "Verification successful.",
    };
  },

  hasRecentValidVerification: async (authUserId, purpose = "change_password") => {
    const adminSupabase = getAdminSupabase();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await adminSupabase
      .from("verification_codes")
      .select("id, used_at")
      .eq("user_id", authUserId)
      .eq("purpose", purpose)
      .not("used_at", "is", null)
      .gte("used_at", tenMinutesAgo)
      .order("used_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return false;
    }

    return true;
  },

  consumeVerificationProof: async (authUserId, purpose = "change_password") => {
    const adminSupabase = getAdminSupabase();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await adminSupabase
      .from("verification_codes")
      .update({ used_at: new Date(0).toISOString() })
      .eq("user_id", authUserId)
      .eq("purpose", purpose)
      .gte("used_at", tenMinutesAgo);
  },
};
