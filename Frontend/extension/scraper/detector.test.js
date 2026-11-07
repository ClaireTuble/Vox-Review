import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const detectorSource = await readFile(new URL("./detector.js", import.meta.url), "utf8");
const scraperManagerSource = await readFile(new URL("./scraperManager.js", import.meta.url), "utf8");

function detect(url) {
  const parsedUrl = new URL(url);
  const context = {
    window: {
      location: {
        hostname: parsedUrl.hostname,
        pathname: parsedUrl.pathname,
        href: parsedUrl.href,
      },
    },
  };
  vm.createContext(context);
  return vm.runInContext(`${detectorSource}\ndetectPlatform();`, context);
}

test("extension detector recognizes supported platforms", () => {
  assert.equal(detect("https://store.steampowered.com/app/440"), "steam");
  assert.equal(detect("https://shopee.ph/product/1/2"), "shopee");
  assert.equal(detect("https://www.lazada.com.ph/products/item.html"), "lazada");
  assert.equal(detect("https://play.google.com/store/apps/details?id=app"), "googleplay");
});

test("extension detector never recognizes Google Maps", () => {
  assert.equal(detect("https://www.google.com/maps/place/test"), "unknown");
  assert.equal(detect("https://maps.google.com/"), "unknown");
  assert.equal(detect("https://www.google.com/search?q=review"), "unknown");
});

test("scraper router does not dispatch Google Maps reviews", () => {
  const context = {};
  vm.createContext(context);
  assert.equal(vm.runInContext(`${scraperManagerSource}\nscrapeReviews("google");`, context).length, 0);
});
