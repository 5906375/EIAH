import test from "node:test";
import assert from "node:assert/strict";
import { mcpEnforcementConfigFromEnv, resolveMcpToolVersion } from "./mcpEnforcement";

test("resolveMcpToolVersion: prefers toolVersion", () => {
  assert.equal(resolveMcpToolVersion({ toolVersion: "2.1.0" }, "1.0.0"), "2.1.0");
});

test("resolveMcpToolVersion: falls back", () => {
  assert.equal(resolveMcpToolVersion(null, "1.0.0"), "1.0.0");
});

test("mcpEnforcementConfigFromEnv: parses enabled", () => {
  process.env.MCP_ENFORCE_CONTRACTS = "false";
  const config = mcpEnforcementConfigFromEnv();
  assert.equal(config.enabled, false);
  assert.equal(typeof config.defaultVersion, "string");
});
