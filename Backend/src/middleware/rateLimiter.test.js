import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import { createRateLimiter } from "./rateLimiter.js";

test("rate limit responses include the standard message and retry interval", async () => {
  const app = express();
  app.use(createRateLimiter({
    windowMs: 60_000,
    max: 1,
    message: "Too many attempts. Please wait a few minutes before trying again.",
    keyGenerator: () => "rate-limiter-test-key",
  }));
  app.post("/limited", (_req, res) => res.status(200).json({ success: true }));

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/limited`;
    const firstResponse = await fetch(url, { method: "POST" });
    const limitedResponse = await fetch(url, { method: "POST" });
    const payload = await limitedResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(limitedResponse.status, 429);
    assert.equal(payload.success, false);
    assert.equal(payload.message, "Too many attempts. Please wait a few minutes before trying again.");
    assert.equal(payload.error, payload.message);
    assert.ok(payload.retryAfter > 0);
    assert.equal(limitedResponse.headers.get("retry-after"), String(payload.retryAfter));
  } finally {
    server.close();
    await once(server, "close");
  }
});
