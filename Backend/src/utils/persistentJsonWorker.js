import { spawn } from "node:child_process";

export class WorkerRequestTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Python worker request timed out after ${timeoutMs} ms`);
    this.name = "TimeoutError";
    this.code = "ETIMEDOUT";
  }
}

export class PersistentJsonWorker {
  constructor({ command, args, cwd, timeoutMs, spawnProcess = spawn }) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.spawnProcess = spawnProcess;
    this.child = null;
    this.ready = false;
    this.stdoutBuffer = "";
    this.nextRequestId = 0;
    this.pending = new Map();
  }

  request(payload, { timeoutMs = this.timeoutMs, signal } = {}) {
    if (signal?.aborted) {
      return Promise.reject(new Error("Python worker request was aborted."));
    }

    const id = ++this.nextRequestId;
    return new Promise((resolve, reject) => {
      const pending = {
        id,
        payload,
        resolve,
        reject,
        signal,
        timeoutId: null,
        abortHandler: null,
        sent: false,
      };
      pending.timeoutId = setTimeout(
        () => this.failWorker(new WorkerRequestTimeoutError(timeoutMs)),
        timeoutMs,
      );
      if (signal) {
        pending.abortHandler = () => this.failWorker(new Error("Python worker request was aborted."));
        signal.addEventListener("abort", pending.abortHandler, { once: true });
      }
      this.pending.set(id, pending);

      try {
        this.ensureStarted();
        if (this.ready) this.sendPending(pending);
      } catch (error) {
        this.failWorker(error);
      }
    });
  }

  dispose() {
    this.failWorker(new Error("Python worker is shutting down."));
  }

  ensureStarted() {
    if (this.child) return;

    const child = this.spawnProcess(this.command, this.args, {
      cwd: this.cwd,
      windowsHide: true,
    });
    this.child = child;
    this.ready = false;
    this.stdoutBuffer = "";

    child.stdout.setEncoding?.("utf8");
    child.stdout.on("data", (chunk) => this.handleStdout(child, chunk));
    child.on("error", (error) => {
      if (this.child === child) this.failWorker(error);
    });
    child.on("close", (code, signal) => {
      if (this.child !== child) return;
      this.failWorker(new Error(`Python worker exited (code ${code}, signal ${signal || "none"}).`));
    });
  }

  handleStdout(child, chunk) {
    if (this.child !== child) return;
    this.stdoutBuffer += chunk.toString();
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) this.handleWorkerMessage(child, line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  handleWorkerMessage(child, line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      this.failWorker(new Error("Python worker returned invalid JSON."));
      return;
    }

    if (response?.type === "ready") {
      this.ready = true;
      for (const pending of this.pending.values()) this.sendPending(pending);
      return;
    }

    const pending = this.pending.get(Number(response?.id));
    if (!pending) return;
    this.removePending(pending);
    if (response.success === false) {
      pending.reject(new Error(response.error || "Python worker request failed."));
    } else {
      pending.resolve(response);
    }
  }

  sendPending(pending) {
    if (pending.sent || !this.ready || !this.child || !this.pending.has(pending.id)) return;
    pending.sent = true;
    try {
      this.child.stdin.write(`${JSON.stringify({ ...pending.payload, id: pending.id })}\n`, (error) => {
        if (error && this.pending.has(pending.id)) this.failWorker(error);
      });
    } catch (error) {
      this.failWorker(error);
    }
  }

  removePending(pending) {
    clearTimeout(pending.timeoutId);
    if (pending.abortHandler) {
      pending.signal?.removeEventListener("abort", pending.abortHandler);
    }
    this.pending.delete(pending.id);
  }

  failWorker(error) {
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.stdoutBuffer = "";

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      if (pending.abortHandler) {
        pending.signal?.removeEventListener("abort", pending.abortHandler);
      }
      pending.reject(error);
    }
    this.pending.clear();

    if (child && !child.killed && child.exitCode == null) {
      try {
        child.kill();
      } catch {
        // The process may already have exited.
      }
    }
  }
}