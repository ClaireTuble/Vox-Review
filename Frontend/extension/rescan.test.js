import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const extensionRoot = new URL(".", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("./manifest.json", extensionRoot), "utf8"));
const backgroundSource = await readFile(new URL("./background.js", extensionRoot), "utf8");
const viteConfigSource = await readFile(new URL("../vite.config.js", extensionRoot), "utf8");
const rescanStart = backgroundSource.indexOf('if (message?.type === "rescanPage")');
const rescanEnd = backgroundSource.indexOf("\n  return true;\n});", rescanStart);
assert.notEqual(rescanStart, -1);
assert.ok(rescanEnd > rescanStart);
const rescanHandler = backgroundSource.slice(rescanStart, rescanEnd);

function runRescanHandler({
  message = { type: "rescanPage", tabId: 17, platform: "googleplay", url: "https://play.google.com/store/apps/details?id=app.example" },
  contentState = {},
  sendMessageResponses = [{ response: { ok: true, queued: false } }],
} = {}) {
  const calls = { tabs: [], scripts: [], messages: [] };
  let lastError = null;
  const state = {
    initialized: false,
    detectorReady: false,
    helpfulnessReady: false,
    platformScraperReady: false,
    scraperManagerReady: false,
    privacyRedactionReady: false,
    ...contentState,
  };
  const chrome = {
    runtime: {},
    tabs: {
      sendMessage(tabId, payload, callback) {
        calls.messages.push({ tabId, payload });
        const next = sendMessageResponses.shift() || { response: undefined };
        lastError = next.error ? { message: next.error } : null;
        callback(next.response);
        lastError = null;
      },
      query(query, callback) {
        calls.tabs.push(query);
        callback([{ id: 21 }]);
      },
    },
    scripting: {
      async executeScript(details) {
        calls.scripts.push(details);
        if (details.func) return [{ result: state }];
        for (const file of details.files || []) {
          if (file === "scraper/detector.js") state.detectorReady = true;
          if (file === "scraper/helpfulness.js") state.helpfulnessReady = true;
          if (file === "scraper/platforms/googlePlay.js") state.platformScraperReady = true;
          if (file === "scraper/scraperManager.js") state.scraperManagerReady = true;
          if (file === "privacyRedaction.js") state.privacyRedactionReady = true;
          if (file === "content.js") state.initialized = true;
        }
        return [];
      },
    },
  };
  Object.defineProperty(chrome.runtime, "lastError", {
    get: () => lastError,
  });

  const context = {
    chrome,
    console: { log() {}, warn() {} },
    message,
    Number,
    sendResponse(value) {
      calls.response = value;
    },
  };
  vm.createContext(context);
  vm.runInContext(`(async () => { ${rescanHandler} })()`, context);
  return new Promise((resolve) => {
    const wait = () => {
      if (calls.response) resolve(calls);
      else setTimeout(wait, 0);
    };
    wait();
  });
}

test("Manifest V3 grants only the Google Play host and registers the matching scraper", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("scripting"));
  assert.deepEqual(
    manifest.host_permissions.filter((permission) => permission.includes("play.google.com")),
    ["https://play.google.com/*"],
  );
  const googlePlayScript = manifest.content_scripts.find((script) => (
    script.matches.includes("https://play.google.com/*")
  ));
  assert.ok(googlePlayScript);
  assert.ok(googlePlayScript.js.includes("scraper/platforms/googlePlay.js"));
  assert.match(viteConfigSource, /googlePlayHostPermission\s*=\s*"https:\/\/play\.google\.com\/\*"/);
  assert.match(viteConfigSource, /googlePlayHostPermission,/);
});

test("RESCAN recovers a missing content script without reporting success until acknowledged", async () => {
  const calls = await runRescanHandler({
    sendMessageResponses: [
      { error: "Could not establish connection. Receiving end does not exist." },
      { response: { ok: true, queued: false } },
    ],
  });

  assert.equal(calls.messages.length, 2);
  assert.ok(calls.messages.every(({ tabId }) => tabId === 17));
  assert.deepEqual(
    Array.from(calls.scripts.find((script) => script.files)?.files || []),
    [
      "scraper/detector.js",
      "scraper/helpfulness.js",
      "scraper/platforms/googlePlay.js",
      "scraper/scraperManager.js",
      "privacyRedaction.js",
      "content.js",
    ],
  );
  assert.deepEqual(calls.response, { ok: true, queued: false });
});

test("RESCAN does not reinject an initialized content listener or return success without an ACK", async () => {
  const calls = await runRescanHandler({
    contentState: {
      initialized: true,
      detectorReady: true,
      helpfulnessReady: true,
      platformScraperReady: true,
      scraperManagerReady: true,
      privacyRedactionReady: true,
    },
    sendMessageResponses: [
      { error: "Could not establish connection. Receiving end does not exist." },
    ],
  });

  assert.equal(calls.scripts.some((script) => script.files), false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.response)), {
    ok: false,
    reason: "The content script is initialized but did not acknowledge RESCAN. Reload the page and retry.",
  });
});

test("RESCAN injects only missing platform code when the listener is already initialized", async () => {
  const calls = await runRescanHandler({
    contentState: {
      initialized: true,
      detectorReady: true,
      helpfulnessReady: true,
      platformScraperReady: false,
      scraperManagerReady: true,
      privacyRedactionReady: true,
    },
    sendMessageResponses: [
      { error: "Could not establish connection. Receiving end does not exist." },
      { response: { ok: true } },
    ],
  });

  assert.deepEqual(
    Array.from(calls.scripts.find((script) => script.files)?.files || []),
    ["scraper/platforms/googlePlay.js"],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(calls.response)), { ok: true });
});
