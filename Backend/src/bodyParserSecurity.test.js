import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import express from "express";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { gzipSync } from "node:zlib";

async function createEchoServer() {
  const app = express();
  app.use(express.json({ limit: "7mb" }));
  app.post("/echo", (req, res) => res.status(200).json(req.body));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function postJson(server, body, contentEncoding) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: address.port,
      method: "POST",
      path: "/echo",
      headers: {
        "Content-Type": "application/json",
        ...(contentEncoding ? { "Content-Encoding": contentEncoding } : {}),
        "Content-Length": body.length,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("ordinary JSON request still parses", async (t) => {
  const server = await createEchoServer();
  t.after(() => server.close());

  const result = await postJson(server, Buffer.from('{"ok":true}'));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true });
});

test("supported gzip JSON request still parses", async (t) => {
  const server = await createEchoServer();
  t.after(() => server.close());

  const result = await postJson(
    server,
    gzipSync(Buffer.from('{"ok":true}')),
    "gzip",
  );
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true });
});

test("trailing bytes after a compressed request do not crash the server", async () => {
  const childScript = `
    import assert from "node:assert/strict";
    import express from "express";
    import { once } from "node:events";
    import http from "node:http";
    import { gzipSync } from "node:zlib";

    const app = express();
    app.use(express.json({ limit: "7mb" }));
    app.post("/echo", (req, res) => res.status(200).json(req.body));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const body = Buffer.concat([
      gzipSync(Buffer.from('{"ok":true}')),
      Buffer.from([0]),
      Buffer.alloc(100 * 1024, 0x58),
    ]);
    const response = await new Promise((resolve, reject) => {
      const request = http.request({
        host: "127.0.0.1",
        port: server.address().port,
        method: "POST",
        path: "/echo",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Content-Length": body.length,
        },
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      request.on("error", reject);
      request.end(body);
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { ok: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(server.listening, true);
    console.log("server-alive");
    server.close();
    await once(server, "close");
  `;

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", childScript], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });

  assert.equal(result.code, 0, result.stderr || `Child exited due to ${result.signal}.`);
  assert.match(result.stdout, /server-alive/);
});
