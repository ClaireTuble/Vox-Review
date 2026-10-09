import { createClient } from "@supabase/supabase-js";

export class ServiceRoleConfigurationError extends Error {
  constructor() {
    super("Privileged database operations are unavailable because the service-role configuration is missing.");
    this.name = "ServiceRoleConfigurationError";
    this.code = "SERVICE_ROLE_CONFIGURATION_MISSING";
    this.statusCode = 503;
  }
}

export function createServiceRoleClient(createClientImpl = createClient, config = {}) {
  const supabaseUrl = Object.hasOwn(config, "supabaseUrl")
    ? config.supabaseUrl
    : process.env.SUPABASE_URL;
  const serviceRoleKey = Object.hasOwn(config, "serviceRoleKey")
    ? config.serviceRoleKey
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ServiceRoleConfigurationError();
  }

  return createClientImpl(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function respondIfServiceRoleUnavailable(res, error) {
  if (error?.code !== "SERVICE_ROLE_CONFIGURATION_MISSING") {
    return false;
  }

  res.status(503).json({ success: false, error: error.message });
  return true;
}
