import {
  createServiceRoleClient,
  respondIfServiceRoleUnavailable,
} from "../utils/serviceRoleSupabase.js";

export function getAnalysisActivitySummary(activities, since) {
  const activityByDay = new Map();
  activities.forEach((activity) => {
    const activityDate = new Date(activity.created_at);
    if (activityDate >= since && activity.activity_type === "Analyzed") {
      const dayKey = activityDate.toISOString().slice(0, 10);
      activityByDay.set(dayKey, (activityByDay.get(dayKey) || 0) + 1);
    }
  });

  return {
    totalAnalyses: activities.filter((activity) => activity.activity_type === "Analyzed").length,
    analysisActivity: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(since);
      date.setUTCDate(since.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: activityByDay.get(key) || 0 };
    }),
  };
}
export function calculateDashboardStats({
  canonicalRegularUsers = [],
  activities = [],
  supportedPlatformsCount = 0,
  now = new Date(),
}) {
  const validUserIds = new Set(canonicalRegularUsers.map((u) => u.user_id).filter(Boolean));
  const validActivities = activities.filter((act) => validUserIds.has(act.user_id));

  // Date Boundaries in UTC
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
  const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();

  // 1. Total Users (lifetime)
  const totalUsers = canonicalRegularUsers.length;

  // 2. Active Users (unique user_ids with user_activities in period)
  const activeUsersWeekSet = new Set();
  const activeUsersMonthSet = new Set();

  // 3. Total Analyses (activity_type === "Analyzed")
  let totalAnalysesWeek = 0;
  let totalAnalysesMonth = 0;
  let totalAnalysesAllTime = 0;

  // 4. Platform Usage (activity_type === "Used")
  const platformUsageWeek = new Map();
  const platformUsageMonth = new Map();

  // 5. Analysis Activity maps by date string YYYY-MM-DD
  const analysisByDayWeek = new Map();
  const analysisByDayMonth = new Map();

  validActivities.forEach((act) => {
    const actDate = new Date(act.created_at);
    if (isNaN(actDate.getTime())) return;

    const isWeek = actDate >= weekStart;
    const isMonth = actDate >= monthStart;

    // Active Users calculation (any activity_type in user_activities)
    if (isWeek) activeUsersWeekSet.add(act.user_id);
    if (isMonth) activeUsersMonthSet.add(act.user_id);

    const type = act.activity_type || "Used";
    const platform = act.platform;

    if (type === "Analyzed") {
      totalAnalysesAllTime++;
      if (isMonth) {
        totalAnalysesMonth++;
        const dayKey = actDate.toISOString().slice(0, 10);
        analysisByDayMonth.set(dayKey, (analysisByDayMonth.get(dayKey) || 0) + 1);
      }
      if (isWeek) {
        totalAnalysesWeek++;
        const dayKey = actDate.toISOString().slice(0, 10);
        analysisByDayWeek.set(dayKey, (analysisByDayWeek.get(dayKey) || 0) + 1);
      }
    } else if (type === "Used") {
      if (platform) {
        if (isMonth) {
          platformUsageMonth.set(platform, (platformUsageMonth.get(platform) || 0) + 1);
        }
        if (isWeek) {
          platformUsageWeek.set(platform, (platformUsageWeek.get(platform) || 0) + 1);
        }
      }
    }
  });

  // Build analysisActivity arrays
  const analysisActivityWeek = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + index);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: analysisByDayWeek.get(key) || 0 };
  });

  const analysisActivityMonth = Array.from({ length: daysInMonth }, (_, index) => {
    const d = new Date(Date.UTC(currentYear, currentMonth, index + 1));
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: analysisByDayMonth.get(key) || 0 };
  });

  return {
    totalUsers,
    activeUsers: {
      week: activeUsersWeekSet.size,
      month: activeUsersMonthSet.size,
    },
    supportedPlatformsCount,
    totalAnalyses: {
      week: totalAnalysesWeek,
      month: totalAnalysesMonth,
      allTime: totalAnalysesAllTime,
    },
    platformUsage: {
      week: Object.fromEntries(platformUsageWeek),
      month: Object.fromEntries(platformUsageMonth),
    },
    analysisActivity: {
      week: analysisActivityWeek,
      month: analysisActivityMonth,
    },
  };
}

export async function getAdminDashboardStats(req, res) {
  try {
    const adminSupabase = createServiceRoleClient();

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

    canonicalRegularUsers.forEach((u) => {
      if (!userMap.has(u.user_id)) {
        const authMeta = authUserMetaMap.get(u.auth_user_id) || {};
        userMap.set(u.user_id, u.full_name || authMeta.fullName || u.email?.split("@")[0] || "User");
      }
    });

    let validActivities = [];
    let recentActivities = [];
    try {
      let rawActivities = [];
      const activityPageSize = 1000;

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
        validActivities = rawActivities.filter((act) => userMap.has(act.user_id));

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

    const stats = calculateDashboardStats({
      canonicalRegularUsers,
      activities: validActivities,
      supportedPlatformsCount,
    });

    return res.status(200).json({
      success: true,
      stats,
      recentUsers: formattedRecentUsers,
      recentActivities,
    });
  } catch (error) {
    if (respondIfServiceRoleUnavailable(res, error)) return;
    console.error("Admin dashboard stats error:", error);
    return res.status(500).json({ success: false, error: "Unable to load dashboard stats." });
  }
}
