import jwt from "jsonwebtoken";
import supabase from "../config/supabase.js";
import { createServiceRoleClient } from "../utils/serviceRoleSupabase.js";
import {
  extractClientIp,
  extractUserAgent,
  touchSuperAdminSession,
} from "../utils/auditLogger.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let sessionLookupClient;

async function getActiveSession(userId, sessionId) {
  if (!sessionLookupClient) {
    sessionLookupClient = createServiceRoleClient();
  }
  return sessionLookupClient.rpc("is_superadmin_session_active", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
}

function createSuperAdminAuthenticator({
  getUser = (token) => supabase.auth.getUser(token),
  getTokenClaims = (token) => jwt.decode(token),
  getSessionStatus = getActiveSession,
  trackSessionActivity = touchSuperAdminSession,
  logger = console,
  requireOtpSession,
}) {
  return async function authenticateSuperAdmin(req, res, next) {
    const authorization = req.get("authorization") || "";
    const [scheme, token, extra] = authorization.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    let data;
    let error;
    try {
      ({ data, error } = await getUser(token));
    } catch (authError) {
      logger.error("Super Admin authentication provider request failed.", {
        code: authError?.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Authentication service unavailable." });
    }

    if (error || !data?.user) {
      return res.status(401).json({ success: false, error: "Invalid authentication token." });
    }
    if (data.user.app_metadata?.role !== "superadmin") {
      return res.status(403).json({ success: false, error: "Super Admin access required." });
    }

    let claims;
    try {
      claims = getTokenClaims(token);
    } catch {
      return res.status(401).json({ success: false, error: "Invalid authentication session." });
    }
    if (
      !claims ||
      typeof claims !== "object" ||
      typeof data.user.id !== "string" ||
      !data.user.id ||
      claims.sub !== data.user.id ||
      typeof claims.session_id !== "string" ||
      !UUID_PATTERN.test(claims.session_id)
    ) {
      return res.status(401).json({ success: false, error: "Invalid authentication session." });
    }

    req.authUser = data.user;
    req.accessToken = token;
    req.sessionId = claims.session_id;

    if (!requireOtpSession) return next();

    let sessionResult;
    try {
      sessionResult = await getSessionStatus(data.user.id, claims.session_id);
    } catch (sessionError) {
      logger.error("Super Admin OTP session status lookup failed.", {
        code: sessionError?.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Session verification unavailable." });
    }

    if (sessionResult?.error) {
      logger.error("Super Admin OTP session status lookup failed.", {
        code: sessionResult.error.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Session verification unavailable." });
    }
    if (sessionResult?.data === false) {
      return res.status(401).json({ success: false, error: "Super Admin session has not completed OTP verification or is no longer active." });
    }
    if (sessionResult?.data !== true) {
      logger.error("Super Admin OTP session status lookup returned an invalid result.");
      return res.status(503).json({ success: false, error: "Session verification unavailable." });
    }

    try {
      await trackSessionActivity({
        admin_id: data.user.id,
        session_id: claims.session_id,
        ip_address: extractClientIp(req),
        user_agent: extractUserAgent(req),
      });
    } catch (activityError) {
      logger.error("Super Admin session activity could not be recorded.", {
        code: activityError?.code ?? null,
      });
    }
    return next();
  };
}

export function createRequireAuthenticatedSuperAdmin(options = {}) {
  return createSuperAdminAuthenticator({
    ...options,
    requireOtpSession: false,
  });
}

export function createRequireSuperAdmin(options = {}) {
  return createSuperAdminAuthenticator({
    ...options,
    requireOtpSession: true,
  });
}

export const requireAuthenticatedSuperAdmin = createRequireAuthenticatedSuperAdmin();
export const requireSuperAdmin = createRequireSuperAdmin();
