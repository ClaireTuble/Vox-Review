import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import { createRequireUserAuth } from "./userAuth.js";

async function startServer(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

test("associates concurrent requests with their own users and isolates auth failures", async () => {
  const authFailures = [];
  const app = express();
  app.get(
    "/whoami",
    createRequireUserAuth({
      logger: { error: (...args) => authFailures.push(args) },
      getUser: async (token) => {
        const userNumber = Number(token.replace("test-token-", ""));
        await new Promise((resolve) => setTimeout(resolve, (16 - userNumber) % 7));

        if (userNumber === 5) {
          return { data: { user: null }, error: { status: 401, code: "invalid_token" } };
        }
        if (userNumber === 11) {
          const timeout = new Error("auth provider timeout");
          timeout.code = "ETIMEDOUT";
          throw timeout;
        }
        return { data: { user: { id: `user-${userNumber}` } }, error: null };
      },
    }),
    (req, res) => res.json({ userId: req.authUser.id }),
  );

  const { server, url } = await startServer(app);
  try {
    const responses = await Promise.all(
      Array.from({ length: 15 }, async (_, index) => {
        const userNumber = index + 1;
        const response = await fetch(`${url}/whoami`, {
          headers: { Authorization: `Bearer test-token-${userNumber}` },
        });
        return {
          userNumber,
          status: response.status,
          body: await response.json(),
        };
      }),
    );

    assert.equal(responses.length, 15);
    for (const response of responses) {
      if (response.userNumber === 5) {
        assert.equal(response.status, 401);
        assert.equal(response.body.userId, undefined);
      } else if (response.userNumber === 11) {
        assert.equal(response.status, 503);
        assert.equal(response.body.userId, undefined);
      } else {
        assert.equal(response.status, 200);
        assert.equal(response.body.userId, `user-${response.userNumber}`);
      }
    }
    assert.equal(authFailures.length, 1);
    assert.equal(JSON.stringify(authFailures).includes("test-token"), false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("rejects missing bearer credentials before resolving a user", async () => {
  let verificationCount = 0;
  const app = express();
  app.get(
    "/whoami",
    createRequireUserAuth({
      getUser: async () => {
        verificationCount += 1;
        return { data: { user: { id: "unexpected" } }, error: null };
      },
    }),
    (req, res) => res.json({ userId: req.authUser.id }),
  );

  const { server, url } = await startServer(app);
  try {
    const response = await fetch(`${url}/whoami`);
    assert.equal(response.status, 401);
    assert.equal(verificationCount, 0);
  } finally {
    server.close();
    await once(server, "close");
  }
});
