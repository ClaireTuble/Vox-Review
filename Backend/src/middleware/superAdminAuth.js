import supabase from "../config/supabase.js";

export async function requireSuperAdmin(req, res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({ success: false, error: "Authentication required." });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ success: false, error: "Invalid authentication token." });
  }

  if (data.user.app_metadata?.role !== "superadmin") {
    return res.status(403).json({ success: false, error: "Super Admin access required." });
  }

  req.authUser = data.user;
  req.accessToken = token;
  return next();
}