import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdminUserDisplayName } from "./adminUserDisplayName.js";

test("public profile full name takes precedence over Auth metadata", () => {
  assert.equal(resolveAdminUserDisplayName({
    publicFullName: " Public Name ",
    userMetadata: { firstName: "Auth", lastName: "Name", name: "Metadata Name" },
    email: "person@example.com",
  }), "Public Name");
});

test("first and last name metadata is joined without blank parts or duplicate spaces", () => {
  assert.equal(resolveAdminUserDisplayName({
    userMetadata: { firstName: " Google ", lastName: " User " },
    email: "person@example.com",
  }), "Google User");
  assert.equal(resolveAdminUserDisplayName({
    userMetadata: { firstName: "Google", lastName: " " },
  }), "Google");
});

test("Google metadata full_name and name are display-name fallbacks", () => {
  assert.equal(resolveAdminUserDisplayName({
    userMetadata: { full_name: "Google Full Name", name: "Provider Name" },
    email: "person@example.com",
  }), "Google Full Name");
  assert.equal(resolveAdminUserDisplayName({
    userMetadata: { name: "Provider Name" },
    email: "person@example.com",
  }), "Provider Name");
});

test("metadata username and email prefix remain final display-name fallbacks", () => {
  assert.equal(resolveAdminUserDisplayName({
    userMetadata: { username: "vox_user" },
    email: "person@example.com",
  }), "vox_user");
  assert.equal(resolveAdminUserDisplayName({
    userMetadata: {},
    email: "person@example.com",
  }), "person");
});
