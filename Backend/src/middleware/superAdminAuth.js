import jwt from "jsonwebtoken";
import supabase from "../config/supabase.js";
import { createServiceRoleClient } from "../utils/serviceRoleSupabase.js";

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

export function createRequireSuperAdmin({
  getUser = (token) => supabase.auth.getUser(token),
  getTokenClaims = (token) => jwt.decode(token),
  getSessionStatus = getActiveSession,
  logger = console,
} = {}) {
  return async function requireSuperAdmin(req, res, next) {
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

    let sessionResult;
    try {
      sessionResult = await getSessionStatus(data.user.id, claims.session_id);
    } catch (sessionError) {
      logger.error("Super Admin session status lookup failed.", {
        code: sessionError?.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Session verification unavailable." });
    }

    if (sessionResult?.error) {
      logger.error("Super Admin session status lookup failed.", {
        code: sessionResult.error.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Session verification unavailable." });
    }
    if (sessionResult?.data === false) {
      return res.status(401).json({ success: false, error: "Super Admin session is no longer active." });
    }
    if (sessionResult?.data !== true) {
      logger.error("Super Admin session status lookup returned an invalid result.");
      return res.status(503).json({ success: false, error: "Session verification unavailable." });
    }

    req.authUser = data.user;
    req.accessToken = token;
    return next();
  };
}

export const requireSuperAdmin = createRequireSuperAdmin();