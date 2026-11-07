import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = new URL(".", import.meta.url);
const extensionPath = fileURLToPath(extensionRoot);
const manifest = JSON.parse(await readFile(new URL("./manifest.json", extensionRoot), "utf8"));

test("manifest does not register Google Maps content scripts", () => {
  const contentScripts = manifest.content_scripts || [];
  assert.equal(
    contentScripts.some((entry) => entry.matches.some((match) => /google\.[^/]+\/maps|maps\.google/i.test(match))),
    false,
  );
  assert.equal(
    contentScripts.some((entry) => entry.js.includes("scraper/platforms/google.js")),
    false,
  );
});

test("manifest-referenced content scripts exist", async () => {
  const scripts = new Set((manifest.content_scripts || []).flatMap((entry) => entry.js));
  for (const script of scripts) {
    await access(join(extensionPath, script));
  }
});
