import { createClient } from "@supabase/supabase-js";
import { createAuditLog, extractClientIp, extractDeviceInfo } from "../utils/auditLogger.js";

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

    // Log that the Super Admin accessed user management
    const adminEmail = req.authUser?.email || "admin@voxreview.ai";
    const adminUserId = req.authUser?.id || null;
    const ip = extractClientIp(req);
    const device = extractDeviceInfo(req);

    createAuditLog({
      action: "view_user_management",
      status: "Successful",
      event_type: "Access",
      admin_user_id: adminUserId,
      admin_email: adminEmail,
      resource_type: "Users",
      ip_address: ip,
      device: device,
      details: "Super Admin accessed user management list.",
    }).catch((err) => console.warn("[AdminUsers] Audit log warning:", err.message));

    const superAdminAuthIds = new Set();
    const authUserIds = new Set();
    const authUserMetaMap = new Map();   // auth_user_id → { fullName, username }

    if (req.authUser?.id) {
      superAdminAuthIds.add(req.authUser.id);
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: authUsersData } = await userScopedSupabase.auth.admin.listUsers();
        if (authUsersData?.users) {
          for (const u of authUsersData.users) {
            authUserIds.add(u.id);
            if (u.app_metadata?.role === "superadmin" || u.raw_app_meta_data?.role === "superadmin") {
              superAdminAuthIds.add(u.id);
            }
            const meta = u.user_metadata || u.raw_user_meta_data || {};
            const fullName = [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim() || meta.username || "";
            const username = meta.username || u.email?.split("@")[0] || "";
            authUserMetaMap.set(u.id, { fullName, username });
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
      if (!user.auth_user_id || !authUserIds.has(user.auth_user_id)) {
        return false;
      }
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

    const users = filteredData.map((user) => {
      const authMeta = authUserMetaMap.get(user.auth_user_id) || {};
      const activities = activitiesMap.get(user.user_id) || [];
      const sortedActivities = [...activities].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const lastSeenAt = sortedActivities[0]?.created_at ? new Date(sortedActivities[0].created_at) : null;
      const accountStatus = user.status === "Inactive" ? "Inactive" : "Active";
      const now = Date.now();
      const isOnline = lastSeenAt && now - lastSeenAt.getTime() <= 5 * 60 * 1000;

      return {
        user_id: user.user_id,
        full_name: user.full_name || authMeta.fullName || user.email?.split("@")[0] || "",
        username: authMeta.username || user.email?.split("@")[0] || "",
        email: user.email || "",
        role: user.role || "user",
        status: accountStatus,
        account_status: accountStatus,
        current_status: isOnline ? "Online" : "Offline",
        last_seen_at: lastSeenAt ? lastSeenAt.toISOString() : null,
        last_seen: lastSeenAt ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
          Math.round((lastSeenAt.getTime() - now) / 60000),
          "minute"
        ) : "Never",
        created_at: user.created_at || null,
        activities: sortedActivities,
      };
    });

    return res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Admin users error:", error);
    return res.status(500).json({ success: false, error: "Unable to load users." });
  }
}