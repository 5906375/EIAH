import test from "node:test";
import assert from "node:assert/strict";
import { isImobInstalled } from "./entitlements";

test("isImobInstalled: IMOB_INSTALLED entitlement true returns true", () => {
  assert.equal(isImobInstalled({ entitlements: { IMOB_INSTALLED: true } }), true);
});

test("isImobInstalled: IMOB_INSTALLED entitlement false returns false", () => {
  assert.equal(isImobInstalled({ entitlements: { IMOB_INSTALLED: false } }), false);
});

test("isImobInstalled: 'IMOB' in installedProducts returns true", () => {
  assert.equal(isImobInstalled({ installedProducts: ["IMOB"] }), true);
});

test("isImobInstalled: 'imob' lowercase in installedProducts returns true", () => {
  assert.equal(isImobInstalled({ installedProducts: ["imob"] }), true);
});

test("isImobInstalled: 'IMOB' with surrounding spaces in installedProducts returns true", () => {
  assert.equal(isImobInstalled({ installedProducts: ["  imob  "] }), true);
});

test("isImobInstalled: unrelated product in installedProducts returns false", () => {
  assert.equal(isImobInstalled({ installedProducts: ["LEGAL"] }), false);
});

test("isImobInstalled: empty session returns false", () => {
  assert.equal(isImobInstalled({}), false);
});

test("isImobInstalled: null entitlements and no products returns false", () => {
  assert.equal(isImobInstalled({ entitlements: null, installedProducts: null }), false);
});

test("isImobInstalled: entitlement false but product present returns true (fallback)", () => {
  assert.equal(
    isImobInstalled({ entitlements: { IMOB_INSTALLED: false }, installedProducts: ["IMOB"] }),
    true,
  );
});
