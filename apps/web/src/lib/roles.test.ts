import test from "node:test";
import assert from "node:assert/strict";
import { isAdminProfile, isFounderAccess } from "./roles";

// isAdminProfile

test("isAdminProfile: workspace_admin returns true", () => {
  assert.equal(isAdminProfile("workspace_admin"), true);
});

test("isAdminProfile: tenant_admin returns true", () => {
  assert.equal(isAdminProfile("tenant_admin"), true);
});

test("isAdminProfile: founder_global returns true", () => {
  assert.equal(isAdminProfile("founder_global"), true);
});

test("isAdminProfile: service_operator returns true", () => {
  assert.equal(isAdminProfile("service_operator"), true);
});

test("isAdminProfile: workspace_member returns false", () => {
  assert.equal(isAdminProfile("workspace_member"), false);
});

test("isAdminProfile: null returns false", () => {
  assert.equal(isAdminProfile(null), false);
});

test("isAdminProfile: undefined returns false", () => {
  assert.equal(isAdminProfile(undefined), false);
});

// isFounderAccess

test("isFounderAccess: founder_global roleProfile returns true without roles", () => {
  assert.equal(isFounderAccess("founder_global"), true);
});

test("isFounderAccess: workspace_member with 'founder' in roles returns true", () => {
  assert.equal(isFounderAccess("workspace_member", ["founder"]), true);
});

test("isFounderAccess: workspace_member with 'global_admin' in roles returns true", () => {
  assert.equal(isFounderAccess("workspace_member", ["global_admin"]), true);
});

test("isFounderAccess: workspace_member with mixed-case 'FOUNDER' in roles returns true", () => {
  assert.equal(isFounderAccess("workspace_member", ["FOUNDER"]), true);
});

test("isFounderAccess: workspace_member with unrelated roles returns false", () => {
  assert.equal(isFounderAccess("workspace_member", ["editor", "viewer"]), false);
});

test("isFounderAccess: workspace_member with no roles returns false", () => {
  assert.equal(isFounderAccess("workspace_member", []), false);
});

test("isFounderAccess: null roleProfile with no roles returns false", () => {
  assert.equal(isFounderAccess(null), false);
});

test("isFounderAccess: undefined roleProfile with founder role returns true", () => {
  assert.equal(isFounderAccess(undefined, ["founder"]), true);
});
