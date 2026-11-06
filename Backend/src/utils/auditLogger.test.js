import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import { extractClientIp } from "./auditLogger.js";

test("extractClientIp prefers Express's resolved address over forwarding headers", () => {
  const request = {
    ip: "198.51.100.24",
    socket: { remoteAddress: "192.0.2.10" },
    get: (name) => ({
      "x-forwarded-for": "203.0.113.99, 192.0.2.10",
      "x-client-ip": "203.0.113.100",
    }[name]),
    headers: {
      "x-forwarded-for": "203.0.113.99, 192.0.2.10",
      "x-client-ip": "203.0.113.100",
    },
  };

  assert.equal(extractClientIp(request), "198.51.100.24");
});

test("extractClientIp falls back to the socket peer, never forwarding headers", () => {
  const request = {
    headers: {
      "x-forwarded-for": "203.0.113.99",
      "x-client-ip": "203.0.113.100",
    },
    socket: { remoteAddress: "192.0.2.10" },
  };

  assert.equal(extractClientIp(request), "192.0.2.10");
  assert.equal(extractClientIp({ headers: { "x-forwarded-for": "203.0.113.99" } }), null);
});

test("untrusted forwarding headers cannot spoof the audit address on Express", async (t) => {
  const app = express();
  app.get("/audit-ip", (req, res) => res.json({ ip: extractClientIp(req) }));

  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const response = await fetch(`http://127.0.0.1:${server.address().port}/audit-ip`, {
    headers: {
      "X-Forwarded-For": "203.0.113.99",
      "X-Client-IP": "203.0.113.100",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ip, "127.0.0.1");
});
