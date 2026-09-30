import assert from "node:assert/strict";
import test from "node:test";

import {
  FRONT_DOOR_AGENTS,
  WORKSPACE_AGENT_PROVISIONING_VERSION,
  getProductProvisionedAgents,
  listProvisionableProducts,
} from "./workspaceAgentProvisioning";

test("catalog version is explicit", () => {
  assert.equal(WORKSPACE_AGENT_PROVISIONING_VERSION, 1);
});

test("front door provisions only the EIAH agent", () => {
  assert.deepEqual(FRONT_DOOR_AGENTS.map((agent) => agent.agentKey), ["EIAH"]);
  assert.equal(FRONT_DOOR_AGENTS[0]?.catalogMetadata, undefined);
});

test("IMOB provisions EIAH and imob-chat-audit, with catalog metadata only for the non-core agent", () => {
  const agents = getProductProvisionedAgents("IMOB");
  assert.deepEqual(agents.map((agent) => agent.agentKey), ["EIAH", "imob-chat-audit"]);
  assert.equal(agents[0]?.catalogMetadata, undefined);
  assert.deepEqual(agents[1]?.catalogMetadata, {
    displayName: "IMOB Chat Audit",
    category: "audit",
    version: "1.0.0",
  });
});

test("product lookup is case-insensitive for approved products", () => {
  assert.equal(getProductProvisionedAgents(" imob "), getProductProvisionedAgents("IMOB"));
});

test("only IMOB has an approved map", () => {
  assert.deepEqual(listProvisionableProducts(), ["IMOB"]);
});

test("products without an approved map are rejected (fail-closed)", () => {
  for (const product of ["LEGAL", "HEALTH", "custom:minha-carteira", "", "constructor", "__proto__"]) {
    assert.throws(
      () => getProductProvisionedAgents(product),
      /product without approved agent map/,
      `expected rejection for ${JSON.stringify(product)}`,
    );
  }
});

test("catalog entries are immutable", () => {
  assert.ok(Object.isFrozen(FRONT_DOOR_AGENTS));
  const imob = getProductProvisionedAgents("IMOB");
  assert.ok(Object.isFrozen(imob));
  assert.ok(Object.isFrozen(imob[1]));
  assert.ok(Object.isFrozen(imob[1]?.catalogMetadata));
});
