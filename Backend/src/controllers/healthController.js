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

export const VALID_PLATFORMS = Object.keys(PLATFORM_META);
export const VALID_STATUSES  = ["Working", "Warning", "Error", "Unavailable", "Not Implemented"];

// ── In-Memory Health State Store ──────────────────────────────────────────────
// Serves live data immediately and survives database connectivity issues.
export const memoryHealthStore = new Map();

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
      last_checked_at: nowIso,
      last_success_at: newLastSuccessRaw,
      lastChecked: formatRelativeTime(nowIso),
      lastSuccessfulCheck: formatRelativeTime(newLastSuccessRaw),
      errorCount: newErrorCount,
      errorStage: isWorking ? null : (errorStage || null),
      errorMessage: isWorking ? null : (errorMessage || null),
      errorStatus: status === "Error" ? "Error Detected" : status === "Warning" ? "Warning" : null,
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

export function isPlatformActive(platformKey) {
  const code = getPlatformCode({ platform: platformKey });
  const item = memoryHealthStore.get(code);
  if (!item) return true;
  return item.platformStatus !== "Disabled" && item.is_active !== false;
}

export async function togglePlatformStatus(platformKey, desiredStatus = null, databaseClient = null) {
  const code = getPlatformCode({ platform: platformKey });
  if (!VALID_PLATFORMS.includes(code)) {
    throw new Error(`Invalid platform: ${platformKey}. Must be one of: ${VALID_PLATFORMS.join(", ")}`);
  }

  const current = memoryHealthStore.get(code) || {};
  const currentIsActive = current.platformStatus !== "Disabled" && current.is_active !== false;

  let nextIsActive;
  if (typeof desiredStatus === "boolean") {
    nextIsActive = desiredStatus;
  } else if (typeof desiredStatus === "string") {
    nextIsActive = desiredStatus.trim().toLowerCase() === "active";
  } else {
    nextIsActive = !currentIsActive;
  }

  const nextStatusStr = nextIsActive ? "Active" : "Disabled";
  const platformName = PLATFORM_META[code].name;

  const healthSupabase = databaseClient || (process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabase);

  try {
    const { data, error } = await healthSupabase
      .from("platforms")
      .update({ is_active: nextIsActive })
      .eq("platform_name", platformName)
      .select("*");
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`No database platform configuration found for ${code}.`);
    }
  } catch (err) {
    err.statusCode = 503;
    throw err;
  }

  const updatedItem = {
    ...current,
    platform: code,
    name: platformName,
    platformStatus: nextStatusStr,
    is_active: nextIsActive,
  };
  memoryHealthStore.set(code, updatedItem);

  return updatedItem;
}

// ── GET /api/health/status ───────────────────────────────────────────────────
export async function getHealthStatus(_req, res) {
  try {
    const healthSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabase;

    let platformRows = [];
    try {
      const { data, error: platformsError } = await healthSupabase
        .from("platforms")
        .select("*")
        .order("platform_id", { ascending: true });
      if (!platformsError && Array.isArray(data)) {
        platformRows = data;
      }
    } catch {
      // Fall back to memory store if database table is unavailable
    }

    let healthRows = [];
    try {
      const { data, error: healthError } = await healthSupabase
        .from("platform_health")
        .select("*")
        .order("display_name", { ascending: true });
      if (!healthError && Array.isArray(data)) {
        healthRows = data;
      }
    } catch {
      // Fall back to memory store
    }

    const dbPlatformByCode = new Map((platformRows || []).map((row) => [getPlatformCode(row), row]));
    const healthByCode = new Map((healthRows || []).map((row) => [getPlatformCode(row), row]));

    const platforms = VALID_PLATFORMS.map((platformCode) => {
      const metadata = PLATFORM_META[platformCode];
      const mem = memoryHealthStore.get(platformCode) || {};
      const dbPlatform = dbPlatformByCode.get(platformCode);
      const health = healthByCode.get(platformCode);

      const dbIsActive = dbPlatform ? dbPlatform.is_active !== false : true;
      const memIsActive = mem.is_active !== undefined ? mem.is_active : mem.platformStatus !== "Disabled";
      const isActive = dbPlatform ? dbIsActive : memIsActive;

      const platformStatus = isActive ? "Active" : "Disabled";
      const scrapingStatus = mem.scrapingStatus || health?.scraping_status || "Unavailable";

      const lastCheckedRaw = mem.lastCheckedRaw || health?.last_checked_at || null;
      const lastSuccessRaw = mem.lastSuccessRaw || health?.last_success_at || null;

      const style = getStatusStyle(scrapingStatus);

      return {
        platform: platformCode,
        name: metadata.name,
        category: metadata.category,
        domain: metadata.domain,
        supportStatus: "Supported",
        platformStatus: platformStatus,
        is_active: isActive,
        scrapingStatus: scrapingStatus,
        lastCheckedRaw: lastCheckedRaw,
        lastSuccessRaw: lastSuccessRaw,
        lastChecked: formatRelativeTime(lastCheckedRaw),
        lastSuccessfulCheck: formatRelativeTime(lastSuccessRaw),
        errorCount: mem.errorCount || health?.error_count || 0,
        lastError: mem.errorMessage || health?.error_message || null,
        errorStatus: scrapingStatus === "Error" ? "Error Detected" : scrapingStatus === "Warning" ? "Warning" : null,
        errorStage: mem.errorStage || health?.error_stage || null,
        errorMessage: mem.errorMessage || health?.error_message || null,
        status: scrapingStatus,
        ...style,
      };
    });

    return res.status(200).json({ success: true, platforms });
  } catch (err) {
    console.error("Health status error:", err);
    return res.status(500).json({ success: false, error: "Unable to load persistent platform health." });
  }
}
