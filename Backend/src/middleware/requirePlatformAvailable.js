import { createClient } from "@supabase/supabase-js";
import supabase from "../config/supabase.js";

const PLATFORM_ALIASES = new Map([
  ["shopee", "shopee"],
  ["lazada", "lazada"],
  ["google", "google"],
  ["googlemaps", "google"],
  ["googlereviews", "google"],
  ["googleplay", "googleplay"],
  ["googleplaystore", "googleplay"],
  ["steam", "steam"],
]);

export function normalizePlatformKey(value) {
  return PLATFORM_ALIASES.get(String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")) || null;
}

function getPlatformDatabaseClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return supabase;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function isPlatformEnabled(platformKey, databaseClient) {
  const { data, error } = await databaseClient
    .from("platforms")
    .select("*");

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Platform availability query returned invalid data.");

  const platformRow = data.find((row) => (
    [row.platform, row.code, row.platform_code, row.slug, row.display_name, row.name, row.platform_name]
      .some((value) => normalizePlatformKey(value) === platformKey)
  ));
  if (!platformRow || typeof platformRow.is_active !== "boolean") {
    throw new Error(`Availability is not configured for ${platformKey}.`);
  }

  return platformRow.is_active;
}

export function createRequirePlatformAvailable({
  checkAvailability = (platformKey) => isPlatformEnabled(platformKey, getPlatformDatabaseClient()),
} = {}) {
  return async function requirePlatformAvailable(req, res, next) {
    const headerValue = req.get?.("x-voxreview-platform") || req.headers?.["x-voxreview-platform"];
    const bodyValue = req.body?.platform;
    const platformFromHeader = headerValue ? normalizePlatformKey(headerValue) : null;
    const platformFromBody = bodyValue ? normalizePlatformKey(bodyValue) : null;

    if ((headerValue && !platformFromHeader) || (bodyValue && !platformFromBody) ||
      (platformFromHeader && platformFromBody && platformFromHeader !== platformFromBody)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PLATFORM",
        message: "A valid supported platform must be specified.",
      });
    }

    const platformKey = platformFromHeader || platformFromBody;
    if (!platformKey) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PLATFORM",
        message: "A valid supported platform must be specified.",
      });
    }

    try {
      if (!await checkAvailability(platformKey)) {
        return res.status(403).json({
          success: false,
          error: "PLATFORM_DISABLED",
          message: "Analysis for this platform is currently disabled.",
        });
      }
    } catch (error) {
      console.error("[PlatformAvailability] Unable to verify analysis availability:", error.message);
      return res.status(503).json({
        success: false,
        error: "PLATFORM_STATUS_UNAVAILABLE",
        message: "Platform availability could not be verified. Please try again.",
      });
    }

    req.platformCode = platformKey;
    return next();
  };
}

export function createGetPlatformAvailability({
  checkAvailability = (platformKey) => isPlatformEnabled(platformKey, getPlatformDatabaseClient()),
} = {}) {
  return async function getPlatformAvailability(req, res) {
    const platformKey = normalizePlatformKey(req.params?.platformKey);
    if (!platformKey) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PLATFORM",
        message: "A valid supported platform must be specified.",
      });
    }

    try {
      const isActive = await checkAvailability(platformKey);
      const names = {
        shopee: "Shopee",
        lazada: "Lazada",
        google: "Google Maps",
        googleplay: "Google Play Store",
        steam: "Steam",
      };
      return res.status(200).json({
        success: true,
        platform: platformKey,
        name: names[platformKey],
        is_active: isActive,
      });
    } catch (error) {
      console.error("[PlatformAvailability] Unable to verify platform availability:", error.message);
      return res.status(503).json({
        success: false,
        error: "PLATFORM_STATUS_UNAVAILABLE",
        message: "Platform availability could not be verified. Please try again.",
      });
    }
  };
}

export const requirePlatformAvailable = createRequirePlatformAvailable();
