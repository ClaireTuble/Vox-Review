import supabase from "../config/supabase.js";

export async function requireUserAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({ success: false, error: "Authentication required." });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ success: false, error: "Invalid authentication token." });
  }

  req.authUser = data.user;
  req.accessToken = token;
  return next();
}
