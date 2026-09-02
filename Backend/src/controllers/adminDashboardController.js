import { createClient } from "@supabase/supabase-js";

export async function getAdminDashboardStats(req, res) {
  try {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const superAdminAuthIds = new Set();
    const authUserIds = new Set();
    const authUserMetaMap = new Map();

    const refreshAuthUserMeta = async (authUserId) => {
      if (!authUserId) return null;
      try {
        const { data: userData, error } = await adminSupabase.auth.admin.getUserById(authUserId);
        if (error || !userData?.user) return null;

        const u = userData.user;
        const meta = u.user_metadata || u.raw_user_meta_data || {};
        const fullName = [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim() || meta.username || "";
        const username = meta.username || u.email?.split("@")[0] || "";
        const nextMeta = { fullName, username };
        authUserMetaMap.set(authUserId, nextMeta);
        return nextMeta;
      } catch {
        return null;
      }
    };

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: authUsersData } = await adminSupabase.auth.admin.listUsers();
        if (authUsersData?.users) {
          for (const u of authUsersData.users) {
            authUserIds.add(u.id);
            if (u.app_metadata?.role === "superadmin" || u.raw_app_meta_data?.role === "superadmin") {
              superAdminAuthIds.add(u.id);
            }
            const meta = u.user_metadata || u.raw_user_meta_data || {};
            const fullName = [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim() || meta.username || "";
            const username = meta.username || u.email?.split("@")[0] || "";
            if (fullName || username) {
              authUserMetaMap.set(u.id, { fullName, username });
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
      if (!u.auth_user_id || !authUserIds.has(u.auth_user_id)) {
        return false;
      }
      const isSuperAdminAuth = u.auth_user_id && superAdminAuthIds.has(u.auth_user_id);
      const isSuperAdminRole = u.role === "superadmin";
      return !isSuperAdminAuth && !isSuperAdminRole;
    });

    const canonicalRegularUsers = [...regularUsers]
      .filter((u) => u?.auth_user_id && authUserIds.has(u.auth_user_id))
      .filter((u) => !(u.auth_user_id && superAdminAuthIds.has(u.auth_user_id)))
      .filter((u) => u.role !== "superadmin")
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    await Promise.all(
      canonicalRegularUsers
        .map((user) => user?.auth_user_id)
        .filter(Boolean)
        .map((authUserId) => refreshAuthUserMeta(authUserId))
    );

    const totalUsers = canonicalRegularUsers.length;
    const activeUsers = canonicalRegularUsers.filter((u) => u.status === "Active").length;
    const validUserIds = canonicalRegularUsers.map((user) => user.user_id).filter(Boolean);

    let supportedPlatformsCount = 0;
    try {
      const { data: platformsData } = await adminSupabase
        .from("platforms")
        .select("id, is_active");
      supportedPlatformsCount = (platformsData || []).filter((platform) => platform.is_active === true).length;
    } catch {
      supportedPlatformsCount = 0;
    }

    let totalAnalyses = 0;
    const platformUsage = new Map();
    const activityByDay = new Map();
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);

    const userMap = new Map();
    const formattedRecentUsers = canonicalRegularUsers.slice(0, 4).map((u) => {
      const authMeta = authUserMetaMap.get(u.auth_user_id) || {};
      const name = u.full_name || authMeta.fullName || u.email?.split("@")[0] || "User";
      userMap.set(u.user_id, name);
      return {
        id: `usr_${u.user_id}`,
        user_id: u.user_id,
        name: name,
        fullName: name,
        username: authMeta.username || u.email?.split("@")[0] || name,
        email: u.email || "",
        role: u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : "User",
        status: u.status,
        joined: u.created_at ? new Date(u.created_at).toLocaleDateString() : "—",
        created_at: u.created_at,
      };
    });

    canonicalRegularUsers.forEach(u => {
      if (!userMap.has(u.user_id)) {
        const authMeta = authUserMetaMap.get(u.auth_user_id) || {};
        userMap.set(u.user_id, u.full_name || authMeta.fullName || u.email?.split("@")[0] || "User");
      }
    });

    let recentActivities = [];
    try {
      let rawActivities = [];
      const activityPageSize = 10;

      for (let offset = 0; validUserIds.length > 0; offset += activityPageSize) {
        const { data: activityPage, error: activityPageError } = await adminSupabase
          .from("user_activities")
          .select("id, user_id, platform, activity_type, created_at")
          .in("user_id", validUserIds)
          .order("created_at", { ascending: false })
          .range(offset, offset + activityPageSize - 1);

        if (activityPageError) throw activityPageError;
        rawActivities.push(...(activityPage || []));
        if (!activityPage || activityPage.length < activityPageSize) break;
      }

      if (rawActivities) {
        const validActivities = rawActivities.filter((act) => userMap.has(act.user_id));

        validActivities.forEach((act) => {
          if (act.activity_type === "Used") {
            platformUsage.set(act.platform, (platformUsage.get(act.platform) || 0) + 1);
          }

          const activityDate = new Date(act.created_at);
          if (activityDate >= since && act.activity_type === "Analyzed") {
            const dayKey = activityDate.toISOString().slice(0, 10);
            activityByDay.set(dayKey, (activityByDay.get(dayKey) || 0) + 1);
          }
        });

        totalAnalyses = validActivities.filter((act) => act.activity_type === "Analyzed").length;

        recentActivities = validActivities.slice(0, 10).map((act) => ({
          id: act.id,
          user_id: act.user_id,
          user: userMap.get(act.user_id),
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
        totalAnalyses,
        platformUsage: Object.fromEntries(platformUsage),
        analysisActivity: Array.from({ length: 7 }, (_, index) => {
          const date = new Date(since);
          date.setDate(since.getDate() + index);
          const key = date.toISOString().slice(0, 10);
          return { date: key, count: activityByDay.get(key) || 0 };
        }),
      },
      recentUsers: formattedRecentUsers,
      recentActivities,
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return res.status(500).json({ success: false, error: "Unable to load dashboard stats." });
  }
}
