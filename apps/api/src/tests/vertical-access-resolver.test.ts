import test from "node:test";
import assert from "node:assert/strict";
import { resolveVerticalAccess } from "../services/products/verticalAccessResolver";
import { IMOB_VERTICAL_ACCESS_CONTRACT_V1, composeVerticalRegistry } from "../services/chat/verticalRegistryComposition";
import type { VerticalAccessFactsV1, VerticalAccessRequestV1 } from "../types/verticalEntitlementGateContract";

const scope = { tenantId: "tenant-fixture", workspaceId: "workspace-fixture" };
const contract = IMOB_VERTICAL_ACCESS_CONTRACT_V1;
const request: VerticalAccessRequestV1 = { scope, verticalId: "imob", capabilityId: "knowledge.search", mode: "read_only" };
const facts: VerticalAccessFactsV1 = {
  scope, verticalId: "imob",
  installation: { ...scope, product: "IMOB", status: "active" },
  workspacePermission: { key: "imob.chat.use", allowed: true },
  stagePermission: null,
  usage: "full",
};
const resolve = (state: unknown = facts, input: unknown = request, contracts: unknown = [contract]) =>
  resolveVerticalAccess(contracts, input, state);

test("installed product and valid workspace permission allow capability, never action authorization", () => {
  assert.deepEqual(resolve(), {
    version: "vertical.access.decision.v1", allowed: true,
    reasonCode: "VERTICAL_ACCESS_ALLOWED", actionAuthorization: "not_evaluated",
  });
});
test("missing product denies even read capability", () => {
  assert.equal(resolve({ ...facts, installation: null }).reasonCode, "VERTICAL_ACCESS_INSTALLATION_MISSING");
});
test("absent, denied or unrelated workspace permission fails closed", () => {
  for (const permission of [null, { key: "imob.chat.use", allowed: false }, { key: "products.activate", allowed: true }]) {
    assert.equal(resolve({ ...facts, workspacePermission: permission }).allowed, false);
  }
});
test("unknown vertical denies", () => {
  assert.equal(resolve(facts, { ...request, verticalId: "unknown" }).reasonCode, "VERTICAL_ACCESS_UNKNOWN_VERTICAL");
});
test("revocation total block denies read and write", () => {
  const state = { ...facts, usage: "blocked" };
  assert.equal(resolve(state).reasonCode, "VERTICAL_ACCESS_REVOKED");
  assert.equal(resolve(state, { ...request, capabilityId: "crm.forms", mode: "requires_write" }).reasonCode, "VERTICAL_ACCESS_REVOKED");
});
test("ADR-011 read-only revocation denies writes and preserves read; no-new-activation preserves current use", () => {
  assert.equal(resolve({ ...facts, usage: "read_only" }).allowed, true);
  assert.equal(resolve({ ...facts, usage: "read_only" }, { ...request, capabilityId: "crm.forms", mode: "requires_write" }).reasonCode, "VERTICAL_ACCESS_REVOKED");
  // resolveVerticalUsage maps sem_nova_ativacao to full for existing usage.
  assert.equal(resolve({ ...facts, usage: "full" }).allowed, true);
});
test("required stage rejects missing, incompatible or denied decision and accepts matching permission", () => {
  const stageContracts = [{ ...contract, stagePolicy: "required" }];
  const input = { ...request, stage: "qualified" };
  for (const stagePermission of [null, { stage: "collecting", allowed: true }, { stage: "qualified", allowed: false }]) {
    assert.equal(resolve({ ...facts, stagePermission }, input, stageContracts).reasonCode, "VERTICAL_ACCESS_STAGE_DENIED");
  }
  const state = { ...facts, stagePermission: { stage: "qualified", allowed: true } };
  assert.equal(resolve(state, request, stageContracts).allowed, false);
  assert.equal(resolve(state, input, stageContracts).allowed, true);
});
test("isolated TenantActionPolicy cannot become product entitlement", () => {
  const policy = { ...scope, actionName: "realestate.create_contract", allowed: true };
  assert.equal(resolve({ ...facts, installation: null, tenantActionPolicies: [policy] }).allowed, false);
  assert.equal(resolve({ ...facts, installation: policy }).allowed, false);
  assert.equal(resolve({ ...facts, installation: null }).allowed, false);
});
test("tenant/workspace/product/facts mismatches deny", () => {
  for (const patch of [{ tenantId: "other" }, { workspaceId: "other" }, { product: "LEGAL" }]) {
    assert.equal(resolve({ ...facts, installation: { ...facts.installation, ...patch } }).reasonCode, "VERTICAL_ACCESS_SCOPE_MISMATCH");
  }
  assert.equal(resolve({ ...facts, scope: { ...scope, workspaceId: "other" } }).allowed, false);
  assert.equal(resolve({ ...facts, verticalId: "legal" }).allowed, false);
});
test("inactive, suspended, unknown installation status deny", () => {
  for (const status of ["inactive", "suspended", "revoked", "past_due", "unknown"]) {
    assert.equal(resolve({ ...facts, installation: { ...facts.installation, status } }).reasonCode, "VERTICAL_ACCESS_INSTALLATION_INACTIVE");
  }
});
test("unknown capability, unsupported mode and critical action fail closed", () => {
  for (const patch of [{ capabilityId: "unknown" }, { mode: "requires_write" }, { mode: "critical_action" }]) {
    assert.equal(resolve(facts, { ...request, ...patch }).allowed, false);
  }
});
test("missing or malformed facts/contracts/request and duplicate descriptors fail closed without throwing", () => {
  for (const value of [undefined, null, {}, { ...facts, usage: undefined }, { ...facts, usage: "unknown" }]) {
    assert.equal(resolve(value === undefined ? null : value).allowed, false);
  }
  assert.equal(resolve(facts, { ...request, scope: { ...scope, tenantId: " " } }).allowed, false);
  for (const contracts of [null, [{}], [contract, contract], [{ ...contract, capabilities: [contract.capabilities[0], contract.capabilities[0]] }],
    [{ ...contract, entitlementKey: null }]]) assert.equal(resolve(facts, request, contracts).allowed, false);
});
test("explicit installation exemption has no product entitlement and still needs scoped permission/usage", () => {
  const contracts = [{ ...contract, installationRequired: false, entitlementKey: null }];
  assert.equal(resolve({ ...facts, installation: null }, request, contracts).allowed, true);
  assert.equal(resolve({ ...facts, installation: null, usage: "blocked" }, request, contracts).allowed, false);
});
test("contract supports future vertical/product IDs only through explicit descriptors (synthetic fixtures)", () => {
  for (const [verticalId, productId] of [["log", "PRE_DUIMP"], ["mkt", "MARKETING"], ["legal", "LEGAL"]]) {
    const descriptor = { ...contract, verticalId, productId };
    const state = { ...facts, verticalId, installation: { ...scope, product: productId, status: "active" } };
    assert.equal(resolve(state, { ...request, verticalId }, [descriptor]).allowed, true);
    assert.equal(resolve(state, { ...request, verticalId }).allowed, false);
  }
});
test("resolution is deterministic and does not mutate inputs", () => {
  const before = JSON.stringify({ facts, request, contract });
  assert.deepEqual(resolve(), resolve());
  assert.equal(JSON.stringify({ facts, request, contract }), before);
});
test("legacy registry still accepts its existing policy-derived entitlement fact", () => {
  const composed = composeVerticalRegistry({ scope, imob: {
    installationStatus: "active", entitled: true, agentsReady: true, userCanUse: true,
  } });
  assert.equal(composed.registry.verticals.find((entry) => entry.id === "imob")?.status, "enabled");
  assert.equal(composed.governance.imob.entitlement, "allowed");
});
