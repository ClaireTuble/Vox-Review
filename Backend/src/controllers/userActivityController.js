import { createClient } from "@supabase/supabase-js";

// In-memory deduplication cache: user_id + platform + product/url identity (10 min TTL)
const recentActivityMap = new Map();

function cleanStaleActivityCache() {
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const now = Date.now();
  for (const [key, timestamp] of recentActivityMap.entries()) {
    if (now - timestamp > TEN_MINUTES_MS) {
      recentActivityMap.delete(key);
    }
  }
}

export async function reportUserActivity(req, res) {
  try {
    const authUserId = req.authUser?.id;
    if (!authUserId) {
      return res.status(401).json({ success: false, error: "Authenticated user identity missing." });
    }

    const { platform, activity_type, product_title, product_url, productTitle, productUrl } = req.body;
    if (!platform) {
      return res.status(400).json({ success: false, error: "Missing required field: platform." });
    }

    const targetProductTitle = (product_title || productTitle || "").trim();
    const targetProductUrl = (product_url || productUrl || "").trim();

    const platformDisplayMap = {
      shopee: "Shopee",
      lazada: "Lazada",
      google: "Google Maps",
      googleplay: "Google Play Store",
      steam: "Steam",
    };
    const platformKey = String(platform).trim().toLowerCase();
    const normalizedPlatform = platformDisplayMap[platformKey] || (
      String(platform).charAt(0).toUpperCase() + String(platform).slice(1)
    );

    const activityType = (activity_type === "Analyzed") ? "Analyzed" : "Used";

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const adminSupabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let { data: userRow } = await adminSupabase
      .from("users")
      .select("user_id, email, auth_user_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (!userRow) {
      const email = req.authUser.email;
      if (email) {
        const { data: byEmail } = await adminSupabase
          .from("users")
          .select("user_id, email, auth_user_id")
          .eq("email", email)
          .maybeSingle();

        if (byEmail) {
          userRow = byEmail;
          if (!byEmail.auth_user_id) {
            await adminSupabase.from("users").update({ auth_user_id: authUserId }).eq("user_id", byEmail.user_id);
          }
        }
      }
    }

    if (!userRow) {
      return res.status(404).json({ success: false, error: "App user account not found for authenticated user." });
    }

    const userId = userRow.user_id;

    // Deduplication Check: Prevent duplicate reports for exact same user + platform + product/place URL within 10 min
    cleanStaleActivityCache();

    const dedupKey = targetProductUrl
      ? `${userId}:${normalizedPlatform}:${activityType}:url:${targetProductUrl}`
      : targetProductTitle
      ? `${userId}:${normalizedPlatform}:${activityType}:title:${targetProductTitle}`
      : `${userId}:${normalizedPlatform}:${activityType}:platform_only`;

    const lastTimestamp = recentActivityMap.get(dedupKey);
    const TEN_MINUTES_MS = 10 * 60 * 1000;

    if (lastTimestamp && (Date.now() - lastTimestamp < TEN_MINUTES_MS)) {
      return res.status(200).json({
        success: true,
        message: "Activity already recorded within 10 minutes (deduplicated).",
      });
    }

    // Also check DB query if columns exist
    if (targetProductUrl) {
      const tenMinutesAgoIso = new Date(Date.now() - TEN_MINUTES_MS).toISOString();
      const { data: exactProductMatch, error: dedupErr } = await adminSupabase
        .from("user_activities")
        .select("id, created_at")
        .eq("user_id", userId)
        .eq("platform", normalizedPlatform)
        .eq("activity_type", activityType)
        .eq("product_url", targetProductUrl)
        .gte("created_at", tenMinutesAgoIso)
        .limit(1);

      if (!dedupErr && exactProductMatch && exactProductMatch.length > 0) {
        recentActivityMap.set(dedupKey, Date.now());
        return res.status(200).json({
          success: true,
          message: "Activity already recorded within 10 minutes (deduplicated).",
          activity: exactProductMatch[0],
        });
      }
    }

    const nowIso = new Date().toISOString();
    const insertPayload = {
      user_id: userId,
      platform: normalizedPlatform,
      activity_type: activityType,
      created_at: nowIso,
    };
    if (targetProductTitle) insertPayload.product_title = targetProductTitle;
    if (targetProductUrl) insertPayload.product_url = targetProductUrl;

    let { data: inserted, error: insertError } = await adminSupabase
      .from("user_activities")
      .insert(insertPayload)
      .select("*")
      .single();

    // Fallback if product_title / product_url columns do not exist yet in DB schema
    if (insertError && (insertError.message?.includes("product_title") || insertError.message?.includes("product_url"))) {
      ({ data: inserted, error: insertError } = await adminSupabase
        .from("user_activities")
        .insert({
          user_id: userId,
          platform: normalizedPlatform,
          activity_type: activityType,
          created_at: nowIso,
        })
        .select("*")
        .single());
    }

    if (insertError) {
      console.error("Error inserting user activity:", insertError);
      return res.status(500).json({ success: false, error: insertError.message });
    }

    // Set in-memory cache to guarantee 10-min dedup for this exact product/place
    recentActivityMap.set(dedupKey, Date.now());

    return res.status(201).json({ success: true, activity: inserted });
  } catch (err) {
    console.error("User activity report error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
