import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../utils/serviceRoleSupabase.js";
import {
  createAuditLog,
  revokeSuperAdminSession,
} from "../utils/auditLogger.js";
import { sendBrevoEmail } from "./verificationService.js";

export const OTP_TTL_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 3;
export const OTP_REGEX = /^\d{6}$/;

export const JWT_ISSUER = "voxreview-backend";
export const JWT_AUDIENCE = "voxreview-superadmin";

/**
 * Escapes dynamic string values to prevent HTML injection in email templates.
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Computes HMAC-SHA256 of the OTP code using the dedicated OTP HMAC secret.
 * Falls back to ENCRYPTION_SECRET with a dedicated domain-separated prefix if not explicitly set.
 */
export function hashOtp(otpCode, dedicatedSecret = process.env.OTP_HMAC_SECRET) {
  const secret = dedicatedSecret || process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("Server configuration error: OTP_HMAC_SECRET or ENCRYPTION_SECRET must be configured.");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`voxreview:superadmin:otp:${String(otpCode).trim()}`)
    .digest("hex");
}

/**
 * Computes SHA-256 hash for challenge tokens.
 */
export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token).trim()).digest("hex");
}

/**
 * Retrieves the dedicated challenge JWT signing secret.
 * Explicitly rejects Supabase service role key to prevent privilege escalation.
 */
export function getChallengeJwtSecret() {
  const secret = process.env.JWT_CHALLENGE_SECRET;
  if (!secret) {
    throw new Error(
      "Server configuration error: JWT_CHALLENGE_SECRET must be set. Fallback to service role key is prohibited."
    );
  }
  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    secret === process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Security violation: JWT_CHALLENGE_SECRET must not be identical to SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return secret;
}

/**
 * Sends transactional OTP email via the shared Brevo email service used across VoxReview.
 */
export async function sendAdminOtpEmail({ toEmail, otpCode, adminName = "Super Admin" }) {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_MOCK_2FA_EMAIL === "true") {
    console.log("\n=======================================================");
    console.log("🔑 [DEV_MOCK_2FA_EMAIL] Super Admin 2FA Code");
    console.log(`📧 Recipient : ${toEmail}`);
    console.log(`🔢 OTP Code  : ${otpCode}`);
    console.log(`⏱️ Expiration: ${OTP_TTL_MINUTES} minutes`);
    console.log("=======================================================\n");
    return { success: true, mocked: true };
  }

  const safeName = escapeHtml(adminName);
  const safeOtp = escapeHtml(otpCode);

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 32px;">
    <h2 style="color: #38bdf8; margin-top: 0;">VoxReview Super Admin 2FA</h2>
    <p style="color: #cbd5e1; font-size: 14px;">Hello ${safeName},</p>
    <p style="color: #cbd5e1; font-size: 14px;">A Super Admin authentication attempt requires verification. Use the one-time code below to complete your sign-in:</p>
    <div style="margin: 28px 0; text-align: center;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #38bdf8; background: #0f172a; padding: 12px 24px; border-radius: 8px; border: 1px solid #38bdf8; display: inline-block;">
        ${safeOtp}
      </span>
    </div>
    <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
      This code will expire in <strong>${OTP_TTL_MINUTES} minutes</strong> and can only be used once.<br>
      If you did not initiate this login request, review your account security immediately.
    </p>
  </div>
</body>
</html>`;

  await sendBrevoEmail({
    toEmail,
    subject: `[VoxReview Security] Super Admin 2FA Verification: ${safeOtp}`,
    htmlContent,
    textContent: `Your VoxReview Super Admin 2FA verification code is: ${otpCode}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    errorMessage: "Failed to dispatch 2FA verification email.",
  });

  return { success: true };
}

/**
 * Sends transactional OTP email for password change verification via canonical Brevo service.
 */
export async function sendAdminPasswordChangeOtpEmail({ toEmail, otpCode, adminName = "Super Admin" }) {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_MOCK_2FA_EMAIL === "true") {
    console.log("\n=======================================================");
    console.log("🔐 [DEV_MOCK_2FA_EMAIL] Super Admin Password Change Code");
    console.log(`📧 Recipient : ${toEmail}`);
    console.log(`🔢 OTP Code  : ${otpCode}`);
    console.log(`⏱️ Expiration: ${OTP_TTL_MINUTES} minutes`);
    console.log("=======================================================\n");
    return { success: true, mocked: true };
  }

  const safeName = escapeHtml(adminName);
  const safeOtp = escapeHtml(otpCode);

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 32px;">
    <h2 style="color: #38bdf8; margin-top: 0;">VoxReview Password Change Verification</h2>
    <p style="color: #cbd5e1; font-size: 14px;">Hello ${safeName},</p>
    <p style="color: #cbd5e1; font-size: 14px;">A request was initiated to change the password for your VoxReview Super Admin account. Use the one-time verification code below to authorize this request:</p>
    <div style="margin: 28px 0; text-align: center;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #38bdf8; background: #0f172a; padding: 12px 24px; border-radius: 8px; border: 1px solid #38bdf8; display: inline-block;">
        ${safeOtp}
      </span>
    </div>
    <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
      This code will expire in <strong>${OTP_TTL_MINUTES} minutes</strong> and can only be used once.<br>
      If you did not initiate this password change request, please contact the security team and review your account security immediately.
    </p>
  </div>
</body>
</html>`;

  await sendBrevoEmail({
    toEmail,
    subject: `[VoxReview Security] Super Admin Password Change Verification: ${safeOtp}`,
    htmlContent,
    textContent: `Your VoxReview Super Admin password change verification code is: ${otpCode}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    errorMessage: "Failed to dispatch password change verification email.",
  });

  return { success: true };
}

/**
 * Creates a public Supabase client using publishable/anon key strictly for authentication.
 */
export function createPublicAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error("Super Admin authentication is unavailable because public Supabase configuration is missing.");
    error.statusCode = 503;
    throw error;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Legacy process-local token consumption remains for the lower-priority password-change flow.
 */
export const consumedPasswordChangeTokens = new Set();

/**
 * Creates the Super Admin Two-Factor Authentication service with dependency injection for testing.
 */
export function createAdminTwoFactorService({
  createAuthClient = createPublicAuthClient,
  createServiceClient = createServiceRoleClient,
  writeAuditLog = createAuditLog,
  markSessionsRevoked = revokeSuperAdminSession,
  sendEmail = sendAdminOtpEmail,
  sendPasswordChangeEmail = sendAdminPasswordChangeOtpEmail,
  randomIntImpl = crypto.randomInt,
  jwtSignImpl = jwt.sign,
  jwtVerifyImpl = jwt.verify,
  consumedTokens = consumedPasswordChangeTokens,
} = {}) {
  return {
    /**
     * Step 1 & 2: Primary authentication verification and 2FA challenge initiation.
     */
    async initiateSuperAdminLogin({ email, password, ipAddress, userAgent }) {
      if (!email || typeof email !== "string" || !password || typeof password !== "string") {
        const err = new Error("Email and password are required.");
        err.statusCode = 400;
        throw err;
      }

      const normalizedEmail = email.trim().toLowerCase();
      // Separate client isolation: use public client exclusively for credential validation
      const authClient = createAuthClient();

      // 1. Verify credentials against Supabase Auth using client credentials
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError || !authData?.user) {
        await writeAuditLog({
          action: "super_admin_login",
          status: "Failed",
          event_type: "Authentication",
          admin_email: normalizedEmail,
          ip_address: ipAddress,
          device: userAgent,
          details: `Invalid Super Admin credentials: ${authError?.message || "User not found"}`,
        }).catch(() => {});

        const err = new Error("Invalid email or password.");
        err.statusCode = 401;
        throw err;
      }

      const user = authData.user;
      const role = user.app_metadata?.role;

      // 2. Enforce strict app_metadata.role === 'superadmin'
      if (role !== "superadmin") {
        await writeAuditLog({
          action: "super_admin_login",
          status: "Warning",
          event_type: "Access",
          admin_user_id: user.id,
          admin_email: user.email,
          ip_address: ipAddress,
          device: userAgent,
          details: `Unauthorized access attempt to Super Admin portal. Account role: ${role || "none"}`,
        }).catch(() => {});

        const err = new Error("Access denied. Insufficient permissions for Super Admin portal.");
        err.statusCode = 403;
        throw err;
      }

      // Use service-role client exclusively for privileged database mutations and admin checks
      const serviceSupabase = createServiceClient();

      // 3. Generate strict 6-digit numeric OTP
      const rawOtpNum = randomIntImpl(100000, 1000000);
      const rawOtp = String(rawOtpNum);
      if (!OTP_REGEX.test(rawOtp)) {
        throw new Error("Cryptographic generation produced an invalid OTP format.");
      }
      const otpHash = hashOtp(rawOtp);

      // 4. Issue dedicated challenge JWT
      const challengeSecret = getChallengeJwtSecret();
      const challengeJti = crypto.randomUUID();
      const challengePayload = {
        sub: user.id,
        email: user.email,
        type: "2fa_pending",
        jti: challengeJti,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
      };

      const challengeToken = jwtSignImpl(challengePayload, challengeSecret, {
        algorithm: "HS256",
        expiresIn: `${OTP_TTL_MINUTES}m`,
      });
      const challengeTokenHash = hashToken(challengeToken);

      // Invalidate any previously unconsumed challenges for this admin using service-role client
      const nowIso = new Date().toISOString();
      await serviceSupabase
        .from("admin_2fa_challenges")
        .update({ consumed_at: nowIso })
        .eq("admin_user_id", user.id)
        .is("consumed_at", null);

      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

      // 5. Store challenge in database using service-role client
      const { data: insertedChallenge, error: insertError } = await serviceSupabase
        .from("admin_2fa_challenges")
        .insert({
          admin_user_id: user.id,
          admin_email: user.email,
          purpose: "login",
          challenge_token_hash: challengeTokenHash,
          otp_hash: otpHash,
          attempts_count: 0,
          max_attempts: MAX_OTP_ATTEMPTS,
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[Admin2FA] Failed to store challenge in database:", insertError.message);
        const err = new Error("Unable to create two-factor authentication challenge.");
        err.statusCode = 500;
        throw err;
      }

      // 6. Dispatch OTP via Brevo API
      const adminName = user.user_metadata?.full_name || "Super Admin";
      try {
        await sendEmail({
          toEmail: user.email,
          otpCode: rawOtp,
          adminName,
        });
      } catch (emailError) {
        // Atomic cleanup: If Brevo email delivery fails, immediately invalidate the challenge
        await serviceSupabase
          .from("admin_2fa_challenges")
          .update({ consumed_at: nowIso })
          .eq("id", insertedChallenge.id);

        await writeAuditLog({
          action: "super_admin_2fa_email_delivery_failed",
          status: "Failed",
          event_type: "Diagnostic",
          admin_user_id: user.id,
          admin_email: user.email,
          ip_address: ipAddress,
          device: userAgent,
          details: `Brevo email dispatch failed: ${emailError.message}. Challenge was immediately invalidated.`,
        }).catch(() => {});

        const err = new Error("Failed to send 2FA verification email. Please try again later.");
        err.statusCode = 502;
        throw err;
      }

      await writeAuditLog({
        action: "super_admin_2fa_challenge_issued",
        status: "Successful",
        event_type: "Authentication",
        admin_user_id: user.id,
        admin_email: user.email,
        ip_address: ipAddress,
        device: userAgent,
        details: "Password verified; 6-digit OTP code dispatched to registered administrator email.",
      }).catch(() => {});

      return {
        mfaRequired: true,
        challengeToken,
        expiresInSeconds: OTP_TTL_MINUTES * 60,
        adminEmail: user.email,
      };
    },

    /**
     * Step 3: Validate submitted OTP with atomic database locking, enforce limits, and finalize session.
     */
    async verifySuperAdminOtp({
      challengeToken,
      otp,
      adminUser,
      sessionId,
      ipAddress,
      userAgent,
    }) {
      if (!challengeToken || typeof challengeToken !== "string") {
        const err = new Error("Missing challenge token.");
        err.statusCode = 400;
        throw err;
      }

      if (!otp || !OTP_REGEX.test(String(otp).trim())) {
        const err = new Error("Verification code must be exactly 6 digits.");
        err.statusCode = 400;
        throw err;
      }

      const cleanOtp = String(otp).trim();

      if (
        !adminUser?.id ||
        adminUser.app_metadata?.role !== "superadmin" ||
        !sessionId
      ) {
        const err = new Error("An authenticated Super Admin session is required to verify OTP.");
        err.statusCode = 401;
        throw err;
      }

      // 1. Verify challenge JWT with explicit algorithm, issuer, and audience
      const challengeSecret = getChallengeJwtSecret();
      let decoded;
      try {
        decoded = jwtVerifyImpl(challengeToken, challengeSecret, {
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });
        if (decoded.type !== "2fa_pending" || decoded.sub !== adminUser.id) {
          throw new Error("Invalid challenge token type.");
        }
      } catch (jwtErr) {
        const err = new Error("The 2FA challenge token is invalid or has expired. Please restart login.");
        err.statusCode = 401;
        throw err;
      }

      const supabase = createServiceClient();
      const challengeTokenHash = hashToken(challengeToken);
      const submittedOtpHmac = hashOtp(cleanOtp);

      // 2. Verify OTP and register this exact authenticated session atomically.
      let rpcResult;
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "verify_and_register_superadmin_otp_session",
        {
          p_admin_user_id: adminUser.id,
          p_session_id: sessionId,
          p_challenge_token_hash: challengeTokenHash,
          p_submitted_otp_hash: submittedOtpHmac,
          p_now: new Date().toISOString(),
          p_purpose: "login",
          p_ip_address: ipAddress || null,
          p_user_agent: userAgent || null,
        }
      );

      if (rpcError) {
        console.error("[Admin2FA] verify_and_register_superadmin_otp_session RPC failed:", rpcError.message);
        const err = new Error("Two-factor verification is temporarily unavailable.");
        err.statusCode = 503;
        throw err;
      } else {
        rpcResult = rpcData;
      }

      if (!rpcResult || typeof rpcResult.success !== "boolean") {
        const err = new Error("Two-factor verification returned an invalid result.");
        err.statusCode = 503;
        throw err;
      }

      if (
        rpcResult.success &&
        (rpcResult.admin_user_id !== adminUser.id || rpcResult.session_id !== sessionId)
      ) {
        console.error("[Admin2FA] OTP session RPC returned a mismatched user/session binding.");
        const err = new Error("Two-factor verification returned an invalid session binding.");
        err.statusCode = 503;
        throw err;
      }

      if (!rpcResult.success) {
        await writeAuditLog({
          action: "super_admin_2fa_verification_failed",
          status: "Failed",
          event_type: "Authentication",
          admin_user_id: adminUser.id,
          admin_email: decoded.email,
          ip_address: ipAddress,
          device: userAgent,
          details: `2FA verification rejected: reason=${rpcResult.reason}, attempts=${rpcResult.attempts ?? "N/A"}`,
        }).catch(() => {});

        const statusCode = rpcResult.reason === "MAX_ATTEMPTS_EXCEEDED" ? 429 : 400;
        const err = new Error(rpcResult.message || "Invalid or expired verification code.");
        err.statusCode = statusCode;
        err.reason = rpcResult.reason;
        throw err;
      }

      // Recheck the role after OTP completion before returning authenticated identity.
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(adminUser.id);
      if (userError || !userData?.user) {
        const err = new Error("Authenticated administrator profile could not be verified.");
        err.statusCode = 403;
        throw err;
      }

      const verifiedAdminUser = userData.user;
      if (verifiedAdminUser.app_metadata?.role !== "superadmin") {
        await writeAuditLog({
          action: "super_admin_2fa_revoked_role",
          status: "Warning",
          event_type: "Access",
          admin_user_id: verifiedAdminUser.id,
          admin_email: verifiedAdminUser.email,
          ip_address: ipAddress,
          device: userAgent,
          details: "Super Admin role was removed between challenge initiation and OTP verification.",
        }).catch(() => {});

        const err = new Error("Access denied. Super Admin role is no longer assigned to this account.");
        err.statusCode = 403;
        throw err;
      }

      await writeAuditLog({
        action: "super_admin_login",
        status: "Successful",
        event_type: "Authentication",
        admin_user_id: verifiedAdminUser.id,
        admin_email: verifiedAdminUser.email,
        ip_address: ipAddress,
        device: userAgent,
        details: "Super Admin successfully authenticated with Password + Brevo Email 2FA.",
      }).catch(() => {});

      return {
        success: true,
        verified: true,
        user: {
          id: verifiedAdminUser.id,
          email: verifiedAdminUser.email,
          role: "superadmin",
          fullName: verifiedAdminUser.user_metadata?.full_name || "Super Admin",
        },
      };
    },

    /**
     * Password Change Flow - Step 1: Dispatch OTP to registered administrator email.
     * Enforces strict Super Admin role, resend cooldown (60s), and separate 'password_change' purpose.
     */
    async initiatePasswordChangeOtp({ adminUser, ipAddress, userAgent }) {
      if (!adminUser?.id || !adminUser?.email) {
        const err = new Error("Authenticated Super Admin user is required.");
        err.statusCode = 401;
        throw err;
      }

      if (adminUser.app_metadata?.role !== "superadmin") {
        const err = new Error("Access denied. Super Admin role required.");
        err.statusCode = 403;
        throw err;
      }

      const serviceSupabase = createServiceClient();

      // Check resend cooldown: 60 seconds
      const { data: recentChallenges } = await serviceSupabase
        .from("admin_2fa_challenges")
        .select("created_at")
        .eq("admin_user_id", adminUser.id)
        .eq("purpose", "password_change")
        .order("created_at", { ascending: false })
        .limit(1);

      if (recentChallenges && recentChallenges.length > 0) {
        const elapsedMs = Date.now() - new Date(recentChallenges[0].created_at).getTime();
        const COOLDOWN_MS = 60 * 1000;
        if (elapsedMs < COOLDOWN_MS) {
          const waitSeconds = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
          const err = new Error(`Please wait ${waitSeconds} seconds before requesting a new verification code.`);
          err.statusCode = 429;
          err.retryAfterSeconds = waitSeconds;
          throw err;
        }
      }

      // Generate strict 6-digit numeric OTP
      const rawOtpNum = randomIntImpl(100000, 1000000);
      const rawOtp = String(rawOtpNum);
      if (!OTP_REGEX.test(rawOtp)) {
        throw new Error("Cryptographic generation produced an invalid OTP format.");
      }
      const otpHash = hashOtp(rawOtp);

      // Issue challenge JWT specifically for password_change
      const challengeSecret = getChallengeJwtSecret();
      const challengeJti = crypto.randomUUID();
      const challengePayload = {
        sub: adminUser.id,
        email: adminUser.email,
        type: "password_change_pending",
        purpose: "password_change",
        jti: challengeJti,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
      };

      const challengeToken = jwtSignImpl(challengePayload, challengeSecret, {
        algorithm: "HS256",
        expiresIn: `${OTP_TTL_MINUTES}m`,
      });
      const challengeTokenHash = hashToken(challengeToken);

      // Invalidate any previously unconsumed challenges
      const nowIso = new Date().toISOString();
      await serviceSupabase
        .from("admin_2fa_challenges")
        .update({ consumed_at: nowIso })
        .eq("admin_user_id", adminUser.id)
        .is("consumed_at", null);

      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

      // Store challenge in database
      const { data: insertedChallenge, error: insertError } = await serviceSupabase
        .from("admin_2fa_challenges")
        .insert({
          admin_user_id: adminUser.id,
          admin_email: adminUser.email,
          purpose: "password_change",
          challenge_token_hash: challengeTokenHash,
          otp_hash: otpHash,
          attempts_count: 0,
          max_attempts: MAX_OTP_ATTEMPTS,
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[Admin2FA] Failed to store password change challenge:", insertError.message);
        const err = new Error("Unable to create password change challenge.");
        err.statusCode = 500;
        throw err;
      }

      // Dispatch OTP email via canonical Brevo service
      const adminName = adminUser.user_metadata?.full_name || "Super Admin";
      try {
        await sendPasswordChangeEmail({
          toEmail: adminUser.email,
          otpCode: rawOtp,
          adminName,
        });
      } catch (emailError) {
        // Atomic cleanup on dispatch failure
        await serviceSupabase
          .from("admin_2fa_challenges")
          .update({ consumed_at: nowIso })
          .eq("id", insertedChallenge.id);

        await writeAuditLog({
          action: "super_admin_password_change_email_delivery_failed",
          status: "Failed",
          event_type: "Diagnostic",
          admin_user_id: adminUser.id,
          admin_email: adminUser.email,
          ip_address: ipAddress,
          device: userAgent,
          details: `Brevo email dispatch failed: ${emailError.message}. Challenge invalidated.`,
        }).catch(() => {});

        const err = new Error("Failed to send verification email. Please try again later.");
        err.statusCode = 502;
        throw err;
      }

      await writeAuditLog({
        action: "super_admin_password_change_otp_requested",
        status: "Successful",
        event_type: "Authentication",
        admin_user_id: adminUser.id,
        admin_email: adminUser.email,
        ip_address: ipAddress,
        device: userAgent,
        details: "Password change OTP code dispatched to registered administrator email.",
      }).catch(() => {});

      return {
        success: true,
        challengeToken,
        expiresInSeconds: OTP_TTL_MINUTES * 60,
        adminEmail: adminUser.email,
      };
    },

    /**
     * Password Change Flow - Step 2: Verify OTP and issue single-use authorization token.
     * Enforces purpose segregation (refuses login OTP challenges).
     */
    async verifyPasswordChangeOtp({ adminUser, challengeToken, otp, ipAddress, userAgent }) {
      if (!adminUser?.id) {
        const err = new Error("Authenticated Super Admin user is required.");
        err.statusCode = 401;
        throw err;
      }

      if (!challengeToken || typeof challengeToken !== "string") {
        const err = new Error("Missing challenge token.");
        err.statusCode = 400;
        throw err;
      }

      if (!otp || !OTP_REGEX.test(String(otp).trim())) {
        const err = new Error("Verification code must be exactly 6 digits.");
        err.statusCode = 400;
        throw err;
      }

      const cleanOtp = String(otp).trim();

      // Verify challenge JWT
      const challengeSecret = getChallengeJwtSecret();
      let decoded;
      try {
        decoded = jwtVerifyImpl(challengeToken, challengeSecret, {
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });
        if (decoded.type !== "password_change_pending" || decoded.purpose !== "password_change") {
          throw new Error("Invalid challenge purpose. Login OTP challenges cannot be used for password change.");
        }
        if (decoded.sub !== adminUser.id) {
          throw new Error("Challenge token is not bound to the authenticated administrator.");
        }
      } catch (jwtErr) {
        const err = new Error(jwtErr.message || "Invalid or expired challenge token.");
        err.statusCode = 401;
        throw err;
      }

      const supabase = createServiceClient();
      const challengeTokenHash = hashToken(challengeToken);
      const submittedOtpHmac = hashOtp(cleanOtp);

      // Perform atomic verification with purpose = 'password_change'
      let rpcResult;
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "verify_and_consume_admin_otp",
        {
          p_admin_user_id: adminUser.id,
          p_challenge_token_hash: challengeTokenHash,
          p_submitted_otp_hash: submittedOtpHmac,
          p_now: new Date().toISOString(),
          p_purpose: "password_change",
        }
      );

      if (rpcError) {
        console.error("[Admin2FA] Password-change OTP RPC failed:", rpcError.message);
        const err = new Error("Password-change verification is temporarily unavailable.");
        err.statusCode = 503;
        throw err;
      } else {
        rpcResult = rpcData;
      }

      if (!rpcResult || typeof rpcResult.success !== "boolean") {
        const err = new Error("Password-change verification returned an invalid result.");
        err.statusCode = 503;
        throw err;
      }

      if (!rpcResult.success) {
        await writeAuditLog({
          action: "super_admin_password_change_otp_verification_failed",
          status: "Failed",
          event_type: "Authentication",
          admin_user_id: adminUser.id,
          admin_email: adminUser.email,
          ip_address: ipAddress,
          device: userAgent,
          details: `Password change 2FA verification rejected: reason=${rpcResult.reason}, attempts=${rpcResult.attempts ?? "N/A"}`,
        }).catch(() => {});

        const statusCode = rpcResult.reason === "MAX_ATTEMPTS_EXCEEDED" ? 429 : 400;
        const err = new Error(rpcResult.message || "Invalid or expired verification code.");
        err.statusCode = statusCode;
        err.reason = rpcResult.reason;
        throw err;
      }

      // Generate single-use authorization token for password update
      const authorizationPayload = {
        sub: adminUser.id,
        email: adminUser.email,
        type: "password_change_authorized",
        purpose: "password_change",
        jti: crypto.randomUUID(),
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
      };

      const passwordChangeToken = jwtSignImpl(authorizationPayload, challengeSecret, {
        algorithm: "HS256",
        expiresIn: "10m",
      });

      await writeAuditLog({
        action: "super_admin_password_change_otp_verified",
        status: "Successful",
        event_type: "Authentication",
        admin_user_id: adminUser.id,
        admin_email: adminUser.email,
        ip_address: ipAddress,
        device: userAgent,
        details: "Password change 2FA code verified successfully; password modification authorized.",
      }).catch(() => {});

      return {
        success: true,
        verified: true,
        passwordChangeToken,
        message: "Email OTP verified. You may now enter your new password.",
      };
    },

    /**
     * Password Change Flow - Step 3: Update administrator password in Supabase Auth.
     * Enforces verified authorization token, password policy, and strictly binds update to adminUser.id.
     */
    async confirmPasswordChange({
      adminUser,
      passwordChangeToken,
      newPassword,
      confirmPassword,
      ipAddress,
      userAgent,
    }) {
      if (!adminUser?.id) {
        const err = new Error("Authenticated Super Admin user is required.");
        err.statusCode = 401;
        throw err;
      }

      if (!passwordChangeToken || typeof passwordChangeToken !== "string") {
        const err = new Error("Missing password change authorization token.");
        err.statusCode = 400;
        throw err;
      }

      // Verify authorization token
      const challengeSecret = getChallengeJwtSecret();
      let decoded;
      try {
        decoded = jwtVerifyImpl(passwordChangeToken, challengeSecret, {
          algorithms: ["HS256"],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });
        if (
          decoded.type !== "password_change_authorized" ||
          decoded.purpose !== "password_change"
        ) {
          throw new Error("Invalid authorization token for password change.");
        }
        if (decoded.sub !== adminUser.id) {
          throw new Error("Authorization token does not match the authenticated administrator.");
        }
      } catch (jwtErr) {
        const err = new Error("Password change authorization expired or invalid. Please verify OTP again.");
        err.statusCode = 401;
        throw err;
      }

      // Enforce single-use authorization token
      if (decoded.jti && consumedTokens.has(decoded.jti)) {
        const err = new Error("Password change authorization expired or invalid. Please verify OTP again.");
        err.statusCode = 401;
        throw err;
      }

      // Validate new password rules
      if (!newPassword || !confirmPassword) {
        const err = new Error("Complete all password fields.");
        err.statusCode = 400;
        throw err;
      }

      if (newPassword !== confirmPassword) {
        const err = new Error("New passwords do not match.");
        err.statusCode = 400;
        throw err;
      }

      if (newPassword.length < 8) {
        const err = new Error("New password must be at least 8 characters long.");
        err.statusCode = 400;
        throw err;
      }

      if (!/[a-z]/i.test(newPassword) || !/\d/.test(newPassword)) {
        const err = new Error("New password must contain at least one letter and one number.");
        err.statusCode = 400;
        throw err;
      }

      // Prevent current-password reuse:
      // Verify whether the proposed password authenticates against the existing credential
      // Uses an isolated public client with persistence disabled (never service-role)
      const verifyClient = createAuthClient();
      let isSamePassword = false;
      try {
        const { data: authCheckData, error: authCheckError } = await verifyClient.auth.signInWithPassword({
          email: adminUser.email,
          password: newPassword,
        });
        if (!authCheckError && authCheckData?.user?.id === adminUser.id) {
          isSamePassword = true;
          if (typeof verifyClient.auth.signOut === "function") {
            await verifyClient.auth.signOut({ scope: "local" }).catch(() => {});
          }
        }
      } catch {
        // If signIn fails (e.g. invalid credentials), the proposed password does not match current password
        isSamePassword = false;
      }

      if (isSamePassword) {
        await writeAuditLog({
          action: "super_admin_password_change_failed",
          status: "Failed",
          event_type: "Authentication",
          admin_user_id: adminUser.id,
          admin_email: adminUser.email,
          ip_address: ipAddress,
          device: userAgent,
          details: "Password update rejected: proposed password matches current password.",
        }).catch(() => {});

        const err = new Error("You cannot reuse your current password. Please choose a different password.");
        err.statusCode = 422;
        throw err;
      }

      // Update password in Supabase Auth via service-role client
      // Strictly updates adminUser.id (never accepts client-supplied IDs)
      const serviceSupabase = createServiceClient();
      const { data: updatedData, error: updateError } = await serviceSupabase.auth.admin.updateUserById(
        adminUser.id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("[Admin2FA] Failed to update user password in Supabase:", updateError.message);
        await writeAuditLog({
          action: "super_admin_password_change_failed",
          status: "Failed",
          event_type: "Authentication",
          admin_user_id: adminUser.id,
          admin_email: adminUser.email,
          ip_address: ipAddress,
          device: userAgent,
          details: `Password update rejected by authentication provider: ${escapeHtml(updateError.message || "Unknown provider error")}`,
        }).catch(() => {});

        const err = new Error(updateError.message || "Failed to update password.");
        err.statusCode = 500;
        throw err;
      }

      // Mark authorization token as consumed so it cannot be used again
      if (decoded.jti) {
        consumedTokens.add(decoded.jti);
      }

      await writeAuditLog({
        action: "super_admin_password_changed",
        status: "Successful",
        event_type: "Authentication",
        admin_user_id: adminUser.id,
        admin_email: adminUser.email,
        ip_address: ipAddress,
        device: userAgent,
        details: "Super Admin password updated successfully after verified OTP flow.",
      }).catch(() => {});

      return {
        success: true,
        message: "Password updated successfully.",
      };
    },

    /**
     * Password Change Flow - Step 4: Handle post-change device session choice.
     * Records explicit choice and executes global session revocation if requested.
     */
    async recordSessionChoice({
      adminUser,
      choice,
      accessToken,
      sessionId,
      ipAddress,
      userAgent,
      rawUserAgent,
    }) {
      if (!adminUser?.id) {
        const err = new Error("Authenticated Super Admin user is required.");
        err.statusCode = 401;
        throw err;
      }

      if (choice !== "keep_sessions" && choice !== "logout_all") {
        const err = new Error("Invalid session choice. Expected 'keep_sessions' or 'logout_all'.");
        err.statusCode = 400;
        throw err;
      }

      if (choice === "keep_sessions") {
        await writeAuditLog({
          action: "super_admin_device_session_selection",
          status: "Successful",
          event_type: "Access",
          admin_user_id: adminUser.id,
          admin_email: adminUser.email,
          ip_address: ipAddress,
          device: userAgent,
          session_id: sessionId,
          user_agent: rawUserAgent,
          details: "Super Admin selected: Keep Devices Signed In (where supported by auth provider).",
        }).catch(() => {});

        return {
          success: true,
          choice: "keep_sessions",
          message: "Current device session preserved where supported. Other devices may require re-authentication depending on auth provider session policies.",
        };
      }

      // Option B: Log out all devices
      await writeAuditLog({
        action: "super_admin_device_session_selection",
        status: "Successful",
        event_type: "Access",
        admin_user_id: adminUser.id,
        admin_email: adminUser.email,
        ip_address: ipAddress,
        device: userAgent,
        session_id: sessionId,
        user_agent: rawUserAgent,
        details: "Super Admin selected: Log Out All Devices.",
      }).catch(() => {});

      let globalLogoutSuccess = false;
      let revocationError = null;

      if (!accessToken) {
        revocationError = "An authenticated session token is required to revoke administrator sessions.";
      } else {
        try {
          const serviceSupabase = createServiceClient();
          if (typeof serviceSupabase?.auth?.admin?.signOut !== "function") {
            revocationError = "Global session revocation is not supported by the authentication provider.";
          } else {
            const { error: adminSignOutErr } = await serviceSupabase.auth.admin.signOut(accessToken, "global");
            if (adminSignOutErr) {
              console.error("[Admin2FA] Supabase admin global sign-out failed:", adminSignOutErr.message);
              revocationError = adminSignOutErr.message || "Provider rejected session revocation.";
            } else {
              globalLogoutSuccess = true;
            }
          }
        } catch (err) {
          console.error("[Admin2FA] Server-side global sign-out exception:", err.message);
          revocationError = err.message || "Failed to communicate with authentication provider.";
        }
      }

      await writeAuditLog({
        action: "super_admin_global_logout",
        status: globalLogoutSuccess ? "Successful" : "Failed",
        event_type: "Access",
        admin_user_id: adminUser.id,
        admin_email: adminUser.email,
        ip_address: ipAddress,
        device: userAgent,
        session_id: sessionId,
        user_agent: rawUserAgent,
        details: globalLogoutSuccess
          ? "Global session revocation executed successfully across all devices."
          : `Global session revocation failed: ${escapeHtml(revocationError || "Unknown provider error")}`,
      }).catch(() => {});

      if (!globalLogoutSuccess) {
        const err = new Error(revocationError || "Failed to revoke administrator sessions with authentication provider.");
        err.statusCode = 502;
        throw err;
      }
      try {
        await markSessionsRevoked({
          admin_id: adminUser.id,
          allSessions: true,
        });
      } catch (error) {
        console.error("[Admin2FA] Global logout succeeded but session activity records could not be marked revoked.", {
          code: error?.code || null,
        });
      }

      return {
        success: true,
        choice: "logout_all",
        message: "All active sessions have been revoked.",
      };
    },
  };
}

export const adminTwoFactorService = createAdminTwoFactorService();
