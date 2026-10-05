import assert from "node:assert/strict";
import test from "node:test";

import { buildFullName } from "./profileName.js";

test("combines first and last names into the stored full name", () => {
  assert.equal(buildFullName("Claire", "Tuble"), "Claire Tuble");
});

test("trims name parts and uses the fallback only when both parts are empty", () => {
  assert.equal(buildFullName(" Claire ", " Tuble "), "Claire Tuble");
  assert.equal(buildFullName("", "", "claire"), "claire");
});