import supabase from "../config/supabase.js";

export function createRequireUserAuth({
  getUser = (token) => supabase.auth.getUser(token),
  logger = console,
} = {}) {
  return async function requireUserAuthMiddleware(req, res, next) {
    const authorization = req.get("authorization") || "";
    const [scheme, token] = authorization.trim().split(/\s+/, 2);

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    let data;
    let error;
    try {
      ({ data, error } = await getUser(token));
    } catch (authError) {
      logger.error("User authentication provider request failed.", {
        status: authError?.status ?? null,
        code: authError?.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Authentication service unavailable." });
    }

    if (error) {
      const status = Number(error.status);
      if ([400, 401, 403].includes(status)) {
        return res.status(401).json({ success: false, error: "Invalid authentication token." });
      }
      logger.error("User authentication provider request failed.", {
        status: Number.isFinite(status) ? status : null,
        code: error.code ?? null,
      });
      return res.status(503).json({ success: false, error: "Authentication service unavailable." });
    }

    if (!data?.user) {
      return res.status(401).json({ success: false, error: "Invalid authentication token." });
    }

    req.authUser = data.user;
    req.accessToken = token;
    return next();
  };
}

export const requireUserAuth = createRequireUserAuth();
