import supabase from "../config/supabase.js";

// ── Platform display metadata ────────────────────────────────────────────────
const PLATFORM_META = {
  shopee:     { name: "Shopee",            category: "E-Commerce",    domain: "shopee.ph" },
  lazada:     { name: "Lazada",            category: "E-Commerce",    domain: "lazada.com.ph" },
  google:     { name: "Google Maps",       category: "Places & Maps", domain: "google.com/maps" },
  googleplay: { name: "Google Play Store", category: "Mobile Apps",   domain: "play.google.com" },
  steam:      { name: "Steam",             category: "Gaming",        domain: "store.steampowered.com" },
};

const VALID_PLATFORMS = Object.keys(PLATFORM_META);
const VALID_STATUSES  = ["Working", "Warning", "Error"];

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

    // Asynchronously sync to Supabase if connected
    supabase
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
      .then(({ error }) => {
        if (error) console.warn("Supabase background sync notice:", error.message);
      })
      .catch((err) => console.warn("Supabase connection notice:", err.message));

    return res.status(200).json({ success: true, platform: updatedItem });
  } catch (err) {
    console.error("Health report error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── GET /api/health/status ───────────────────────────────────────────────────
export async function getHealthStatus(_req, res) {
  try {
    // Try querying Supabase first
    const { data, error } = await supabase
      .from("platform_health")
      .select("*")
      .order("display_name", { ascending: true });

    if (!error && data && data.length > 0) {
      data.forEach((row) => {
        const style = getStatusStyle(row.scraping_status);
        memoryHealthStore.set(row.platform, {
          platform: row.platform,
          name: row.display_name,
          category: row.category,
          domain: row.domain,
          supportStatus: "Supported",
          platformStatus: "Active",
          scrapingStatus: row.scraping_status,
          nlpStatus: row.nlp_status || "Not Implemented",
          lastChecked: formatRelativeTime(row.last_checked_at),
          lastSuccessfulCheck: formatRelativeTime(row.last_success_at),
          errorCount: row.error_count || 0,
          lastError: row.error_message || null,
          errorStatus: row.scraping_status === "Error" ? "Error Detected" : null,
          errorStage: row.error_stage || null,
          errorMessage: row.error_message || null,
          status: row.scraping_status,
          statusBg: style.statusBg,
          statusColor: style.statusColor,
          lastCheckedRaw: row.last_checked_at,
          lastSuccessRaw: row.last_success_at,
        });
      });
    }

    // Always return updated list from memory store (guarantees HTTP 200)
    const platforms = Array.from(memoryHealthStore.values()).map((p) => ({
      ...p,
      lastChecked: formatRelativeTime(p.lastCheckedRaw),
      lastSuccessfulCheck: formatRelativeTime(p.lastSuccessRaw),
    }));

    return res.status(200).json({ success: true, platforms });
  } catch (err) {
    console.error("Health status error:", err);
    // Fall back to memory store even if an unhandled exception occurs
    const platforms = Array.from(memoryHealthStore.values());
    return res.status(200).json({ success: true, platforms });
  }
}

