import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contentSource = await readFile(new URL("./content.js", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("./background.js", import.meta.url), "utf8");
const googlePlaySource = await readFile(
  new URL("./scraper/platforms/googlePlay.js", import.meta.url),
  "utf8",
);

test("scrape failures report stage and error type without logging review payloads", () => {
  assert.match(contentSource, /const errorMessage = `Scrape failed during \$\{reportedStage\} \(\$\{errorName\}\)\.`;/);
  assert.match(contentSource, /errorStage: reportedStage,\s*errorMessage,/);
  assert.match(contentSource, /errorStage = "Review Payload Preparation";/);
  assert.match(backgroundSource, /"platform:", safePlatform,\s*"errorStage:", safeErrorStage,\s*"errorMessage:", safeErrorMessage/);
  assert.match(backgroundSource, /safeErrorMessage = typeof errorMessage === "string" &&/);
  assert.doesNotMatch(backgroundSource, /console\.error\("VoxReview: Scrape error reported:", \{ platform, errorStage, errorMessage \}\)/);
});

test("Google Play marks card detection, review extraction, and metadata stages", () => {
  assert.match(googlePlaySource, /runAtScrapeStage\("Card Detection", isGooglePlayProductPage\)/);
  assert.match(googlePlaySource, /runAtScrapeStage\("Card Detection", \(\) => Array\.from/);
  assert.match(googlePlaySource, /runAtScrapeStage\("Review Extraction", \(\) => cards\.forEach/);
  assert.match(googlePlaySource, /runAtScrapeStage\("Product Metadata", getGooglePlayProductMetadata\)/);
});
