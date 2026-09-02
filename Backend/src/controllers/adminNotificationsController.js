import { createClient } from "@supabase/supabase-js";

function formatNotificationTimestamp(value) {
  const date = new Date(value || Date.now());
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${suffix}`;
}

function normalizeNotification(row) {
  const createdAt = row?.created_at || row?.timestamp || new Date().toISOString();

  return {
    id: row?.id || `${Date.now()}`,
    category: row?.category || "Platform",
    type: row?.type || "info",
    title: row?.title || "System notification",
    message: row?.message || "",
    timestamp: formatNotificationTimestamp(createdAt),
    read: Boolean(row?.read),
    created_at: createdAt,
    source_event: row?.source_event || null,
    actor_user_id: row?.actor_user_id || null,
  };
}

export async function getAdminNotifications(req, res) {
  try {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await adminSupabase
      .from("notifications")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      notifications: (data || []).map(normalizeNotification),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Unable to load notifications.",
    });
  }
}

export async function toggleAdminNotificationRead(req, res) {
  try {
    const { id } = req.params;
    const nextRead = Boolean(req.body?.read ?? true);

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await adminSupabase
      .from("notifications")
      .update({ read: nextRead, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      notification: normalizeNotification(data),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Unable to update notification.",
    });
  }
}

export async function markAllAdminNotificationsRead(req, res) {
  try {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await adminSupabase
      .from("notifications")
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .select("*");

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      notifications: (data || []).map(normalizeNotification),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Unable to mark notifications as read.",
    });
  }
}

export async function clearReadAdminNotifications(req, res) {
  try {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await adminSupabase
      .from("notifications")
      .delete()
      .eq("read", true);

    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Unable to clear read notifications.",
    });
  }
}
