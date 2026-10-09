import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import app from "./app.js";

async function startServer() {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("public database diagnostic endpoint is unavailable and root health remains public", async () => {
  const { server, url } = await startServer();
  try {
    const [databaseResponse, healthResponse] = await Promise.all([
      fetch(`${url}/test-db`),
      fetch(`${url}/`),
    ]);
    const databaseBody = await databaseResponse.text();
    const healthBody = await healthResponse.json();

    assert.equal(databaseResponse.status, 404);
    assert.equal(databaseBody.includes("user_id"), false);
    assert.equal(databaseBody.includes("email"), false);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthBody.success, true);
    assert.equal(healthBody.data, undefined);
  } finally {
    server.close();
    await once(server, "close");
  }
});
