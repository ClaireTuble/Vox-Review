import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import { PersistentJsonWorker } from "./persistentJsonWorker.js";

function createFakeSpawn(responses = []) {
  const children = [];
  const requests = [];
  const spawnProcess = () => {
    const child = new EventEmitter();
    const shouldRespond = responses[children.length] ?? true;
    child.killed = false;
    child.exitCode = null;
    child.stdout = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        const request = JSON.parse(chunk.toString());
        requests.push(request);
        if (shouldRespond) {
          setImmediate(() => child.stdout.write(JSON.stringify({
            id: request.id,
            success: true,
            predictions: request.reviews.map(() => 1),
          }) + "\n"));
        }
        callback();
      },
    });
    child.kill = () => {
      child.killed = true;
      child.exitCode = 1;
      setImmediate(() => child.emit("close", 1, "SIGTERM"));
      return true;
    };
    children.push(child);
    setImmediate(() => child.stdout.write('{"type":"ready"}\n'));
    return child;
  };
  return { children, requests, spawnProcess };
}

test("starts one worker and reuses it for sequential batches", async () => {
  const fake = createFakeSpawn();
  const worker = new PersistentJsonWorker({
    command: "python",
    args: ["svm_worker.py"],
    cwd: process.cwd(),
    timeoutMs: 1000,
    spawnProcess: fake.spawnProcess,
  });

  const first = await worker.request({ reviews: ["first"] });
  const second = await worker.request({ reviews: ["second", "third"] });

  assert.equal(fake.children.length, 1);
  assert.equal(fake.requests.length, 2);
  assert.deepEqual(first.predictions, [1]);
  assert.deepEqual(second.predictions, [1, 1]);
});

test("kills a timed-out worker and starts a clean worker for the next batch", async () => {
  const fake = createFakeSpawn([false, true]);
  const worker = new PersistentJsonWorker({
    command: "python",
    args: ["svm_worker.py"],
    cwd: process.cwd(),
    timeoutMs: 15,
    spawnProcess: fake.spawnProcess,
  });

  await assert.rejects(
    worker.request({ reviews: ["slow batch"] }),
    (error) => error.name === "TimeoutError" && error.code === "ETIMEDOUT",
  );
  assert.equal(fake.children[0].killed, true);

  const response = await worker.request({ reviews: ["next batch"] });
  assert.equal(fake.children.length, 2);
  assert.deepEqual(response.predictions, [1]);
});

test("aborting a worker request terminates the process and rejects pending work", async () => {
  const fake = createFakeSpawn([false]);
  const worker = new PersistentJsonWorker({
    command: "python",
    args: ["svm_worker.py"],
    cwd: process.cwd(),
    timeoutMs: 1000,
    spawnProcess: fake.spawnProcess,
  });
  const controller = new AbortController();
  const pending = worker.request({ reviews: ["aborted batch"] }, { signal: controller.signal });
  controller.abort();

  await assert.rejects(pending, /aborted/);
  assert.equal(fake.children[0].killed, true);
});

test("disposes the persistent child during backend shutdown", async () => {
  const fake = createFakeSpawn([false]);
  const worker = new PersistentJsonWorker({
    command: "python",
    args: ["svm_worker.py"],
    cwd: process.cwd(),
    timeoutMs: 1000,
    spawnProcess: fake.spawnProcess,
  });
  const pending = worker.request({ reviews: ["in flight"] });
  await new Promise((resolve) => setImmediate(resolve));

  worker.dispose();

  await assert.rejects(pending, /shutting down/);
  assert.equal(fake.children[0].killed, true);
});