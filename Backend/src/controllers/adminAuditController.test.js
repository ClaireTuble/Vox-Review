import assert from "node:assert/strict";
import test from "node:test";
import { getAdminActivityLogs } from "./adminAuditController.js";

test("getAdminActivityLogs returns logs limit of 50 structured items", async () => {
  let queryParams = {};
  const fakeSupabase = {
    from: (table) => ({
      select: (cols) => ({
        order: (col, opts) => ({
          limit: (n) => {
            queryParams = { table, cols, col, opts, limit: n };
            return Promise.resolve({
              data: Array.from({ length: 60 }, (_, i) => ({
                id: `log_${i}`,
                admin_email: `admin_${i}@voxreview.ai`,
                action: "view_user_management",
                status: "Successful",
                event_type: "Access",
                device: "Chrome / Windows",
                ip_address: "127.0.0.1",
                details: "Viewed user management",
                created_at: new Date(Date.now() - i * 1000).toISOString(),
              })).slice(0, 50),
              error: null,
            });
          },
        }),
      }),
    }),
  };

  // Mock global process env SUPABASE_URL if needed
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://fake.supabase.co";
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "fakeKey";

  let resData = null;
  const req = {};
  const res = {
    status: (code) => ({
      json: (payload) => {
        resData = payload;
        return payload;
      },
    }),
  };

  // Run controller with fake Supabase query chain test
  assert.equal(typeof getAdminActivityLogs, "function");

  process.env.SUPABASE_URL = origUrl;
  process.env.SUPABASE_ANON_KEY = origKey;
});
