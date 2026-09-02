import { createClient } from "@supabase/supabase-js";
import supabase from "../config/supabase.js";
import { createNotification } from "../utils/auditLogger.js";

// ── Platform display metadata ────────────────────────────────────────────────
const PLATFORM_META = {
  shopee:     { name: "Shopee",            category: "E-Commerce",    domain: "shopee.ph" },
  lazada:     { name: "Lazada",            category: "E-Commerce",    domain: "lazada.com.ph" },
  google:     { name: "Google Maps",       category: "Places & Maps", domain: "google.com/maps" },
  googleplay: { name: "Google Play Store", category: "Mobile Apps",   domain: "play.google.com" },
  steam:      { name: "Steam",             category: "Gaming",        domain: "store.steampowered.com" },
};

const VALID_PLATFORMS = Object.keys(PLATFORM_META);
const VALID_STATUSES  = ["Working", "Warning", "Error", "Unavailable", "Not Implemented"];

// ── In-Memory Health State Store ──────────────────────────────────────────────
// Serves live data immediately and survives database connectivity issues.
const memoryHealthStore = new Map();

function initMemoryStore() {
  VALID_PLATFORMS.forEach((key) => {
    const meta = PLATFORM_META[key];
    memoryHealthStore.set(key, {
      platform: key,
      name: meta.name,
      category: meta.category,
      domain: meta.domain,
      supportStatus: "Supported",
      platformStatus: "Active",
      scrapingStatus: "Unavailable",
      nlpStatus: "Not Implemented",
      lastChecked: "Never",
      lastSuccessfulCheck: "Never",
      errorCount: 0,
      lastError: null,
      errorStatus: null,
      errorStage: null,
      errorMessage: null,
      status: "Unavailable",
      statusBg: "rgba(107,114,128,0.08)",
      statusColor: "#9CA3AF",
      lastCheckedRaw: null,
      lastSuccessRaw: null,
    });
  });
}

initMemoryStore();

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Never";
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "Just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60)  return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function getStatusStyle(status) {
  switch (status) {
    case "Working":
      return { statusBg: "rgba(22,163,74,0.12)", statusColor: "#16A34A" };
    case "Warning":
      return { statusBg: "rgba(245,158,11,0.12)", statusColor: "#F59E0B" };
    case "Error":
      return { statusBg: "rgba(239,68,68,0.12)", statusColor: "#EF4444" };
    case "Not Implemented":
      return { statusBg: "rgba(107,114,128,0.12)", statusColor: "#6B7280" };
    case "Unavailable":
    default:
      return { statusBg: "rgba(107,114,128,0.08)", statusColor: "#9CA3AF" };
  }
}

function normalizePlatformCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, character) => character.toUpperCase());
}

function getPlatformCode(platform) {
  const stableCode = platform.platform || platform.code || platform.platform_code || platform.slug;
  if (stableCode) return normalizePlatformCode(stableCode);

  const displayName = String(platform.display_name || platform.name || platform.platform_name || '').trim().toLowerCase();
  const matchingEntry = Object.entries(PLATFORM_META).find(([, metadata]) => (
    metadata.name.toLowerCase() === displayName
  ));
  return matchingEntry?.[0] || normalizePlatformCode(displayName);
}

// ── POST /api/health/report ──────────────────────────────────────────────────
export async function reportHealth(req, res) {
  try {
    const { platform, status, lastSuccessfulStage, errorStage, errorMessage } = req.body;

    if (!platform || !status) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: platform, status",
      });
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `Invalid platform: ${platform}. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
      });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const nowIso = new Date().toISOString();
    const current = memoryHealthStore.get(platform) || {};
    const style = getStatusStyle(status);

    const isWorking = status === "Working";
    const newErrorCount = isWorking ? 0 : (current.errorCount || 0) + 1;
    const newLastSuccessRaw = isWorking ? nowIso : current.lastSuccessRaw;

    const updatedItem = {
      ...current,
      scrapingStatus: status,
      status: status,
      statusBg: style.statusBg,
      statusColor: style.statusColor,
      lastCheckedRaw: nowIso,
      lastSuccessRaw: newLastSuccessRaw,
      lastChecked: formatRelativeTime(nowIso),
      lastSuccessfulCheck: formatRelativeTime(newLastSuccessRaw),
      errorCount: newErrorCount,
      errorStage: isWorking ? null : (errorStage || null),
      errorMessage: isWorking ? null : (errorMessage || null),
      errorStatus: status === "Error" ? "Error Detected" : status === "Warning" ? "Warning" : null,
      nlpStatus: "Not Implemented", // Hardcoded per requirement
    };

    memoryHealthStore.set(platform, updatedItem);

    const healthSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabase;

    const { error: syncError } = await healthSupabase
      .from("platform_health")
      .upsert({
        platform,
        display_name: updatedItem.name,
        category: updatedItem.category,
        domain: updatedItem.domain,
        scraping_status: status,
        last_successful_stage: lastSuccessfulStage || null,
        error_stage: updatedItem.errorStage,
        error_message: updatedItem.errorMessage,
        last_checked_at: nowIso,
        last_success_at: newLastSuccessRaw,
        error_count: newErrorCount,
        updated_at: nowIso,
      }, { onConflict: "platform" })
    if (syncError) console.warn("Supabase health sync notice:", syncError.message);

    // Create notifications for important health state changes
    const previousStatus = current.status || null;
    const statusChanged = previousStatus !== status;
    const isImportantChange = (
      status === "Error" ||
      status === "Warning" ||
      (previousStatus === "Error" && status === "Working") ||
      (previousStatus === "Warning" && status === "Working")
    );

    if (statusChanged && isImportantChange) {
      // Determine notification type and title based on status change
      let notificationType = "info";
      let notificationTitle = "Platform Status";
      let notificationMessage = `${updatedItem.name} status: ${status}`;

      if (status === "Error") {
        notificationType = "danger";
        notificationTitle = `${updatedItem.name} Error`;
        notificationMessage = `Scraping error detected on ${updatedItem.name}${errorStage ? ` at ${errorStage}` : ""}.${errorMessage ? ` ${errorMessage}` : ""}`;
      } else if (status === "Warning") {
        notificationType = "warning";
        notificationTitle = `${updatedItem.name} Warning`;
        notificationMessage = `Warning on ${updatedItem.name}${errorStage ? ` at ${errorStage}` : ""}.${errorMessage ? ` ${errorMessage}` : ""}`;
      } else if (status === "Working" && (previousStatus === "Error" || previousStatus === "Warning")) {
        notificationType = "success";
        notificationTitle = `${updatedItem.name} Recovered`;
        notificationMessage = `${updatedItem.name} has recovered and is now operational.`;
      }

      try {
        await createNotification({
          category: "Platform",
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          source_event: `health_report_${platform}_${status}`,
          is_active: true,
        });
      } catch (notifErr) {
        console.warn(`[HealthController] Notification creation warning for ${platform}:`, notifErr.message);
      }
    }

    return res.status(200).json({ success: true, platform: updatedItem });
  } catch (err) {
    console.error("Health report error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── GET /api/health/status ───────────────────────────────────────────────────
export async function getHealthStatus(_req, res) {
  try {
    const healthSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabase;

    const { data: platformRows, error: platformsError } = await healthSupabase
      .from("platforms")
      .select("*")
      .eq("is_active", true)
      .order("platform_id", { ascending: true });

    if (platformsError) {
      throw platformsError;
    }

    const { data: healthRows, error: healthError } = await healthSupabase
      .from("platform_health")
      .select("*")
      .order("display_name", { ascending: true });

    if (healthError) {
      throw healthError;
    }

    const healthByCode = new Map((healthRows || []).map((row) => [getPlatformCode(row), row]));
    const healthById = new Map((healthRows || []).map((row) => [String(row.platform_id), row]));
    const platforms = (platformRows || []).map((baseRow) => {
      const platformCode = getPlatformCode(baseRow);
      const metadata = PLATFORM_META[platformCode] || {};
      const health = healthByCode.get(platformCode) || healthById.get(String(baseRow.platform_id));
      const status = health?.scraping_status || "Unavailable";
      const platform = {
        platform: platformCode,
        name: baseRow.display_name || baseRow.name || baseRow.platform_name || metadata.name || platformCode,
        category: baseRow.category || baseRow.industry_type || metadata.category || "General",
        domain: baseRow.domain || baseRow.base_url || metadata.domain || "",
        supportStatus: "Supported",
        platformStatus: "Active",
        scrapingStatus: status,
        nlpStatus: health?.nlp_status || "Not Implemented",
        lastCheckedRaw: health?.last_checked_at || null,
        lastSuccessRaw: health?.last_success_at || null,
        errorCount: health?.error_count || 0,
        lastError: health?.error_message || null,
        errorStatus: status === "Error" ? "Error Detected" : null,
        errorStage: health?.error_stage || null,
        errorMessage: health?.error_message || null,
        status,
        ...getStatusStyle(status),
      };

      return {
        ...platform,
        lastChecked: formatRelativeTime(platform.lastCheckedRaw),
        lastSuccessfulCheck: formatRelativeTime(platform.lastSuccessRaw),
      };
    }).map((p) => ({
      ...p,
      lastChecked: formatRelativeTime(p.lastCheckedRaw),
      lastSuccessfulCheck: formatRelativeTime(p.lastSuccessRaw),
    }));

    return res.status(200).json({ success: true, platforms });
  } catch (err) {
    console.error("Health status error:", err);
    return res.status(500).json({ success: false, error: "Unable to load persistent platform health." });
  }
}

