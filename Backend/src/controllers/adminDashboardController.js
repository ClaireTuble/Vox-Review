import { createClient } from "@supabase/supabase-js";

export async function getAdminDashboardStats(req, res) {
  try {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const superAdminAuthIds = new Set();
    const authUserMetaMap = new Map();

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: authUsersData } = await adminSupabase.auth.admin.listUsers();
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
      } catch (authErr) {
        console.warn("Could not list auth users in dashboard controller:", authErr.message);
      }
    }

    let { data: allUsers, error: usersErr } = await adminSupabase
      .from("users")
      .select("user_id, full_name, email, role, status, created_at, auth_user_id")
      .order("created_at", { ascending: false });

    if (usersErr?.message?.toLowerCase().includes("status")) {
      ({ data: allUsers, error: usersErr } = await adminSupabase
        .from("users")
        .select("user_id, full_name, email, role, created_at, auth_user_id")
        .order("created_at", { ascending: false }));
    }

    if (usersErr) {
      return res.status(500).json({ success: false, error: usersErr.message });
    }

    const regularUsers = (allUsers || []).filter((u) => {
      const isSuperAdminAuth = u.auth_user_id && superAdminAuthIds.has(u.auth_user_id);
      const isSuperAdminRole = u.role === "superadmin";
      return !isSuperAdminAuth && !isSuperAdminRole;
    });

    const totalUsers = regularUsers.length;
    const activeUsers = regularUsers.filter((u) => (u.status || "Active") === "Active").length;

    let supportedPlatformsCount = 5;
    try {
      const { data: platformsData } = await adminSupabase
        .from("platforms")
        .select("platform_id, is_active");
      if (platformsData && platformsData.length > 0) {
        const activePlatforms = platformsData.filter(p => p.is_active !== false);
        supportedPlatformsCount = activePlatforms.length || 5;
      }
    } catch {
      supportedPlatformsCount = 5;
    }

    const userMap = new Map();
    const formattedRecentUsers = regularUsers.slice(0, 4).map((u) => {
      const name = u.full_name || authUserMetaMap.get(u.auth_user_id) || u.email?.split("@")[0] || "User";
      userMap.set(u.user_id, name);
      return {
        id: `usr_${u.user_id}`,
        user_id: u.user_id,
        name: name,
        fullName: name,
        username: u.email?.split("@")[0] || name,
        email: u.email || "",
        role: u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : "User",
        status: u.status || "Active",
        joined: u.created_at ? new Date(u.created_at).toLocaleDateString() : "—",
        created_at: u.created_at,
      };
    });

    regularUsers.forEach(u => {
      if (!userMap.has(u.user_id)) {
        userMap.set(u.user_id, u.full_name || authUserMetaMap.get(u.auth_user_id) || u.email?.split("@")[0] || "User");
      }
    });

    let recentActivities = [];
    try {
      const { data: rawActivities } = await adminSupabase
        .from("user_activities")
        .select("id, user_id, platform, activity_type, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (rawActivities) {
        recentActivities = rawActivities.map((act) => ({
          id: act.id,
          user_id: act.user_id,
          user: userMap.get(act.user_id) || "Claire Tuble",
          platform: act.platform,
          activity_type: act.activity_type || "Used",
          action: `${act.activity_type || "Used"} platform`,
          created_at: act.created_at,
        }));
      }
    } catch (actErr) {
      console.warn("Could not query user_activities:", actErr.message);
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        supportedPlatformsCount,
      },
      recentUsers: formattedRecentUsers,
      recentActivities,
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return res.status(500).json({ success: false, error: "Unable to load dashboard stats." });
  }
}
