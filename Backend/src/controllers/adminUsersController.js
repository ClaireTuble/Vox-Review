import { createClient } from "@supabase/supabase-js";

export async function getAdminUsers(req, res) {
  try {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const requestHeaders = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? undefined
      : { Authorization: `Bearer ${req.accessToken}` };

    const userScopedSupabase = createClient(
      process.env.SUPABASE_URL,
      supabaseKey,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        ...(requestHeaders ? { global: { headers: requestHeaders } } : {}),
      }
    );

    const superAdminAuthIds = new Set();
    const authUserMetaMap = new Map();

    if (req.authUser?.id) {
      superAdminAuthIds.add(req.authUser.id);
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: authUsersData } = await userScopedSupabase.auth.admin.listUsers();
        if (authUsersData?.users) {
          for (const u of authUsersData.users) {
            if (u.app_metadata?.role === "superadmin" || u.raw_app_meta_data?.role === "superadmin") {
              superAdminAuthIds.add(u.id);
            }
            const meta = u.user_metadata || u.raw_user_meta_data || {};
            const fullName = [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim() || meta.username || "";
            if (fullName) {
              authUserMetaMap.set(u.id, fullName);
            }
          }
        }
      } catch (authListErr) {
        console.warn("Could not list auth users for superadmin filter:", authListErr.message);
      }
    }

    let { data, error } = await userScopedSupabase
      .from("users")
      .select("user_id, full_name, email, role, created_at, status, auth_user_id")
      .order("created_at", { ascending: false });

    // Account status is optional in the existing schema.
    if (error?.message?.toLowerCase().includes("status")) {
      ({ data, error } = await userScopedSupabase
        .from("users")
        .select("user_id, full_name, email, role, created_at, auth_user_id")
        .order("created_at", { ascending: false }));
    }

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const filteredData = (data || []).filter((user) => {
      const isSuperAdminAuth = user.auth_user_id && superAdminAuthIds.has(user.auth_user_id);
      const isSuperAdminRole = user.role === "superadmin";
      return !isSuperAdminAuth && !isSuperAdminRole;
    });

    // Fetch user activities if user_activities table exists
    const userIds = filteredData.map((u) => u.user_id).filter(Boolean);
    let activitiesMap = new Map();
    if (userIds.length > 0) {
      try {
        const { data: actData } = await userScopedSupabase
          .from("user_activities")
          .select("*")
          .in("user_id", userIds)
          .order("created_at", { ascending: false });

        if (actData) {
          for (const act of actData) {
            if (!activitiesMap.has(act.user_id)) {
              activitiesMap.set(act.user_id, []);
            }
            activitiesMap.get(act.user_id).push({
              id: act.id,
              platform: act.platform,
              activity_type: act.activity_type,
              created_at: act.created_at,
              product_title: act.product_title || null,
              product_url: act.product_url || null,
            });
          }
        }
      } catch (actErr) {
        // user_activities table does not exist yet or error
      }
    }

    const users = filteredData.map((user) => ({
      user_id: user.user_id,
      full_name: user.full_name || authUserMetaMap.get(user.auth_user_id) || user.email?.split("@")[0] || "",
      email: user.email || "",
      role: user.role || "user",
      status: user.status || "Active",
      created_at: user.created_at || null,
      activities: activitiesMap.get(user.user_id) || [],
    }));

    return res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({ success: false, error: "Unable to load users." });
  }
}