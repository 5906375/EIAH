import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMcpEnforceContractsEnv,
  parseMcpProxyAllActionsEnv,
  parseMcpDefaultVersionEnv,
} from "./mcpGovernanceEnv";

test("parseMcpEnforceContractsEnv: defaults to true when unset", () => {
  assert.equal(parseMcpEnforceContractsEnv({}), true);
});

test("parseMcpProxyAllActionsEnv: defaults to false when unset", () => {
  assert.equal(parseMcpProxyAllActionsEnv({}), false);
});

test("parseMcpDefaultVersionEnv: defaults to 1.0.0 when unset", () => {
  assert.equal(parseMcpDefaultVersionEnv({}), "1.0.0");
});

test("parseMcpDefaultVersionEnv: defaults to 1.0.0 when set to empty/whitespace", () => {
  assert.equal(parseMcpDefaultVersionEnv({ MCP_DEFAULT_VERSION: "" }), "1.0.0");
  assert.equal(parseMcpDefaultVersionEnv({ MCP_DEFAULT_VERSION: "   " }), "1.0.0");
});

for (const value of ["1", "true", "on"]) {
  test(`parseMcpEnforceContractsEnv: accepts "${value}" as truthy`, () => {
    assert.equal(parseMcpEnforceContractsEnv({ MCP_ENFORCE_CONTRACTS: value }), true);
  });
  test(`parseMcpProxyAllActionsEnv: accepts "${value}" as truthy`, () => {
    assert.equal(parseMcpProxyAllActionsEnv({ MCP_PROXY_ALL_ACTIONS: value }), true);
  });
}

for (const value of ["TRUE", "On", "1", "tRuE"]) {
  test(`parseMcpEnforceContractsEnv: accepts uppercase/mixed-case "${value}"`, () => {
    assert.equal(parseMcpEnforceContractsEnv({ MCP_ENFORCE_CONTRACTS: value }), true);
  });
}

test("parseMcpEnforceContractsEnv: trims surrounding whitespace", () => {
  assert.equal(parseMcpEnforceContractsEnv({ MCP_ENFORCE_CONTRACTS: "  true  " }), true);
  assert.equal(parseMcpProxyAllActionsEnv({ MCP_PROXY_ALL_ACTIONS: "  true  " }), true);
});

for (const value of ["false", "0", "off", "yes", "", "lixo-invalido"]) {
  test(`parseMcpEnforceContractsEnv: rejects "${value}" as falsy`, () => {
    assert.equal(parseMcpEnforceContractsEnv({ MCP_ENFORCE_CONTRACTS: value }), false);
  });
  test(`parseMcpProxyAllActionsEnv: rejects "${value}" as falsy`, () => {
    assert.equal(parseMcpProxyAllActionsEnv({ MCP_PROXY_ALL_ACTIONS: value }), false);
  });
}
