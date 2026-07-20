import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildChatVerticalHandoffSnapshot,
  validateChatVerticalHandoffSnapshotAgainstSchema,
} from "../services/chatVerticalHandoffSnapshot";
import {
  VERTICAL_HANDOFF_REASON_CODES,
  chatVerticalHandoffV2Schema,
  evaluateChatVerticalHandoffV2,
  projectChatVerticalHandoffV2ForSurface,
  verticalRegistryV1Schema,
} from "../types/chatVerticalHandoffV2Contract";
import {
  buildChatVerticalHandoffV2ShadowSnapshot,
  chatVerticalHandoffV2ShadowSnapshotSchema,
} from "../types/chatVerticalHandoffV2ShadowSnapshot";

const baseInput = {
  tenantId: "tenant-imob-arch",
  workspaceId: "workspace-imob-arch",
  scope: "imob:chat:read",
  userId: "user-arch",
  verticalId: "IMOB",
  intentId: "imob.market_scan.status",
  handoffMessage: "Abrir contexto IMOB em modo read-only.",
  riskLevel: "assisted",
  hitlRequired: false,
  reasonCode: "IMOB_HANDOFF_READ_ONLY",
  blueprintId: "blueprint-imob-read-only",
  requiredEntitlement: "REAL_ESTATE_CORE",
  requiredRoles: ["workspace.admin", "workspace.admin", "broker"],
  renderHints: {
    verticalBadgeLabel: "IMOB",
    suggestedSurface: "cockpit",
    ctaLabel: "Abrir cockpit IMOB",
    cockpitDeepLink: "/app/imob/dashboard",
  },
  runId: "run-imob-arch",
  receiptId: "receipt-imob-arch",
  bundleId: "bundle-imob-arch",
} as const;

test("ARCH-IMPL-1: happy path IMOB read-only handoff snapshot", () => {
  const result = buildChatVerticalHandoffSnapshot(baseInput);

  assert.equal(result.ok, true);
  assert.equal(result.sideEffects, 0);
  assert.equal(result.schemaPath, "contracts/chat/chat.vertical_handoff.v1.schema.json");

  if (!result.ok) assert.fail(result.reasonCode);

  assert.equal(result.snapshot.version, "chat.vertical_handoff.v1");
  assert.equal(result.snapshot.tenantId, "tenant-imob-arch");
  assert.equal(result.snapshot.workspaceId, "workspace-imob-arch");
  assert.equal(result.snapshot.scope, "imob:chat:read");
  assert.equal(result.snapshot.userId, "user-arch");
  assert.equal(result.snapshot.verticalId, "IMOB");
  assert.equal(result.snapshot.intentId, "imob.market_scan.status");
  assert.equal(result.snapshot.reasonCode, "IMOB_HANDOFF_READ_ONLY");
  assert.equal(result.snapshot.riskLevel, "assisted");
  assert.equal(result.snapshot.hitlRequired, false);
  assert.deepEqual(result.snapshot.requiredRoles, ["workspace.admin", "broker"]);
  assert.equal(result.snapshot.renderHints?.cockpitDeepLink, "/app/imob/dashboard");
  assert.match(result.snapshot.handoffId, /^handoff_[a-f0-9]{32}$/);
});

test("ARCH-IMPL-1: missing tenantId fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({ ...baseInput, tenantId: "" });
  assert.equal(result.ok, false);
  assert.equal(result.sideEffects, 0);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_TENANT_REQUIRED");
});

test("ARCH-IMPL-1: missing workspaceId fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({ ...baseInput, workspaceId: " " });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_WORKSPACE_REQUIRED");
});

test("ARCH-IMPL-1: missing scope fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({ ...baseInput, scope: null });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_SCOPE_REQUIRED");
});

test("ARCH-IMPL-1: missing userId fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({ ...baseInput, userId: "" });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_USER_REQUIRED");
});

test("ARCH-IMPL-1: missing verticalId fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({ ...baseInput, verticalId: "" });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_VERTICAL_REQUIRED");
});

test("ARCH-IMPL-1: missing intentId fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({ ...baseInput, intentId: "" });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_INTENT_REQUIRED");
});

test("ARCH-IMPL-1: critical riskLevel with hitlRequired=false fails closed", () => {
  const result = buildChatVerticalHandoffSnapshot({
    ...baseInput,
    riskLevel: "critical",
    hitlRequired: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_HITL_REQUIRED_FOR_CRITICAL_RISK");
  assert.equal(result.sideEffects, 0);
});

test("ARCH-IMPL-1: snapshot validates against the physical chat.vertical_handoff.v1 schema", () => {
  const result = buildChatVerticalHandoffSnapshot(baseInput);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);

  assert.deepEqual(validateChatVerticalHandoffSnapshotAgainstSchema(result.snapshot), []);
});

test("ARCH-IMPL-1: invalid enum value is blocked by physical schema validation", () => {
  const result = buildChatVerticalHandoffSnapshot({
    ...baseInput,
    riskLevel: "unsafe-risk",
  });

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_VERTICAL_HANDOFF_SCHEMA_INVALID");
  assert.equal(result.violations?.some((violation) => violation.path === "$.riskLevel"), true);
});

test("ARCH-IMPL-1: producer is read-only and exposes zero side effects without external/mutational calls", () => {
  const first = buildChatVerticalHandoffSnapshot(baseInput);
  const second = buildChatVerticalHandoffSnapshot(baseInput);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) assert.fail("expected success");

  assert.equal(first.sideEffects, 0);
  assert.equal(second.sideEffects, 0);
  assert.equal(first.snapshot.handoffId, second.snapshot.handoffId);
  assert.equal(JSON.stringify(first).includes("providerExternalCall"), false);
  assert.equal(JSON.stringify(first).includes("mutationExternalSideEffect"), false);
});

const registryV1 = {
  version: "vertical.registry.v1",
  registryVersion: "registry-test-1",
  scope: {
    tenantId: "tenant-contract-test",
    workspaceId: "workspace-contract-test",
  },
  verticals: [
    {
      id: "core",
      label: "EIAH",
      status: "enabled",
      capabilities: [{ id: "chat.general", allowedModes: ["read_only"] }],
      entitlement: { required: false, key: null },
      rbac: { requiredRoles: [] },
      policyGates: [],
      rolloutStage: "operationalized",
    },
    {
      id: "imob",
      label: "IMOB",
      status: "enabled",
      capabilities: [{ id: "inventory.preview", allowedModes: ["read_only"] }],
      entitlement: { required: true, key: "REAL_ESTATE_CORE" },
      rbac: { requiredRoles: ["workspace.member"] },
      policyGates: ["vertical.read_only"],
      rolloutStage: "context_only",
    },
  ],
};

const handoffV2 = {
  version: "chat.vertical_handoff.v2",
  handoffId: "handoff-contract-test",
  vertical: {
    id: "imob",
    label: "Untrusted label",
    registryVersion: "registry-test-1",
  },
  capability: {
    id: "inventory.preview",
    mode: "read_only",
  },
  refs: {
    conversationId: "conversation-contract-test",
    threadId: "thread-contract-test",
  },
  governance: {
    tenantId: "tenant-contract-test",
    workspaceId: "workspace-contract-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
  presentation: {
    source: "fixture",
    variant: "result_list",
  },
  outcome: "preview_only",
  reasonCode: "VERTICAL_PREVIEW_ONLY",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("PR1A: known vertical registered in the active scope is valid", () => {
  const result = evaluateChatVerticalHandoffV2(registryV1, handoffV2);

  assert.equal(result.ok, true);
  assert.equal(result.sideEffects, 0);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.handoff.vertical.id, "imob");
  assert.equal(result.handoff.vertical.label, "IMOB");
});

test("PR1A: registered custom vertical is valid", () => {
  const registry = clone(registryV1);
  registry.verticals.push({
    id: "custom:agro",
    label: "Agro",
    status: "enabled",
    capabilities: [{ id: "inventory.preview", allowedModes: ["read_only"] }],
    entitlement: { required: false, key: null },
    rbac: { requiredRoles: [] },
    policyGates: [],
    rolloutStage: "context_only",
  });
  const handoff = clone(handoffV2);
  handoff.vertical.id = "custom:agro";

  const result = evaluateChatVerticalHandoffV2(registry, handoff);
  assert.equal(result.ok, true);
});

test("PR1A: malformed custom slug fails closed", () => {
  const handoff = clone(handoffV2);
  handoff.vertical.id = "custom:Customer Email";

  const result = evaluateChatVerticalHandoffV2(registryV1, handoff);
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "VERTICAL_NOT_REGISTERED");
});

test("PR1A: unregistered vertical fails closed", () => {
  const handoff = clone(handoffV2);
  handoff.vertical.id = "legal";

  const result = evaluateChatVerticalHandoffV2(registryV1, handoff);
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "VERTICAL_NOT_REGISTERED");
});

test("PR1A: disabled vertical fails closed", () => {
  const registry = clone(registryV1);
  registry.verticals[1].status = "disabled";

  const result = evaluateChatVerticalHandoffV2(registry, handoffV2);
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "VERTICAL_DISABLED");
});

test("PR1A: missing entitlement fails closed", () => {
  const handoff = clone(handoffV2);
  handoff.governance.entitlement.decision = "denied";

  const result = evaluateChatVerticalHandoffV2(registryV1, handoff);
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "VERTICAL_ENTITLEMENT_REQUIRED");
});

test("PR1A: unavailable capability or invalid mode fails closed", () => {
  const unavailableCapability = clone(handoffV2);
  unavailableCapability.capability.id = "knowledge.search";
  const invalidMode = clone(handoffV2);
  invalidMode.capability.mode = "unsafe";

  for (const handoff of [unavailableCapability, invalidMode]) {
    const result = evaluateChatVerticalHandoffV2(registryV1, handoff);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected failure");
    assert.equal(result.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
  }
});

test("PR1A: unevaluated registry, RBAC, entitlement or policy fails closed", () => {
  for (const gate of ["registry", "rbac", "entitlement", "policy"] as const) {
    const handoff = clone(handoffV2);
    handoff.governance[gate].decision = "not_evaluated";

    const result = evaluateChatVerticalHandoffV2(registryV1, handoff);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected failure");
    assert.equal(result.reasonCode, "VERTICAL_GOVERNANCE_NOT_EVALUATED");
  }
});

test("PR1A: fixture without preview_only fails closed", () => {
  const wrongOutcome = clone(handoffV2);
  wrongOutcome.outcome = "allowed";

  const registryWithWrite = clone(registryV1);
  registryWithWrite.verticals[1].capabilities[0].allowedModes.push("requires_write");
  const wrongMode = clone(handoffV2);
  wrongMode.capability.mode = "requires_write";

  for (const [registry, handoff] of [
    [registryV1, wrongOutcome],
    [registryWithWrite, wrongMode],
  ] as const) {
    const result = evaluateChatVerticalHandoffV2(registry, handoff);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected failure");
    assert.equal(result.reasonCode, "VERTICAL_PRESENTATION_INVALID");
  }
});

test("PR1A: core also requires an active scoped registry entry", () => {
  const registry = clone(registryV1);
  registry.verticals = registry.verticals.filter((vertical) => vertical.id !== "core");
  const handoff = clone(handoffV2);
  handoff.vertical.id = "core";
  handoff.capability.id = "chat.general";

  const result = evaluateChatVerticalHandoffV2(registry, handoff);
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "VERTICAL_NOT_REGISTERED");
});

test("PR1A: critical_action without approved HITL fails closed", () => {
  const registry = clone(registryV1);
  registry.verticals[1].capabilities[0].allowedModes.push("critical_action");
  const handoff = clone(handoffV2);
  handoff.capability.mode = "critical_action";
  handoff.presentation.source = "operational";
  handoff.outcome = "allowed";
  handoff.reasonCode = "VERTICAL_HANDOFF_ALLOWED";
  handoff.governance.hitl.status = "required";

  const result = evaluateChatVerticalHandoffV2(registry, handoff);
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "VERTICAL_HITL_REQUIRED");
});

test("PR1A: surface projection redacts governance identifiers", () => {
  const result = evaluateChatVerticalHandoffV2(registryV1, handoffV2);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);

  const projection = projectChatVerticalHandoffV2ForSurface(result.handoff);
  const serialized = JSON.stringify(projection);
  assert.equal("governance" in projection, false);
  assert.equal(serialized.includes("tenant-contract-test"), false);
  assert.equal(serialized.includes("workspace-contract-test"), false);
  assert.equal(serialized.includes("tenantId"), false);
  assert.equal(serialized.includes("workspaceId"), false);
});

test("PR1A: schemas are strict and reason codes match the canonical contract catalog", () => {
  assert.equal(verticalRegistryV1Schema.safeParse({ ...registryV1, prompt: "not allowed" }).success, false);
  assert.equal(chatVerticalHandoffV2Schema.safeParse({ ...handoffV2, response: "not allowed" }).success, false);

  const catalog = JSON.parse(
    fs.readFileSync("contracts/chat/vertical.reason_codes.v1.json", "utf8"),
  ) as { codes: string[] };
  assert.deepEqual(catalog.codes, [...VERTICAL_HANDOFF_REASON_CODES]);
});

test("PR1B: fixture preview_only handoff projects to a read-only shadow snapshot", () => {
  const result = buildChatVerticalHandoffV2ShadowSnapshot(handoffV2);

  assert.equal(result.ok, true);
  assert.equal(result.sideEffects, 0);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.deepEqual(result.snapshot, {
    version: "chat.vertical_handoff_shadow_snapshot.v1",
    vertical: { id: "imob" },
    capability: { id: "inventory.preview", mode: "read_only" },
    presentation: { source: "fixture", variant: "result_list" },
    outcome: "preview_only",
    reasonCode: "VERTICAL_PREVIEW_ONLY",
  });
});

test("PR1B: shadow preview_only handoff remains contract-only and read-only", () => {
  const handoff = clone(handoffV2);
  handoff.presentation.source = "shadow";

  const contractResult = evaluateChatVerticalHandoffV2(registryV1, handoff);
  const snapshotResult = buildChatVerticalHandoffV2ShadowSnapshot(handoff);

  assert.equal(contractResult.ok, true);
  assert.equal(snapshotResult.ok, true);
  if (!snapshotResult.ok) assert.fail(snapshotResult.reasonCode);
  assert.equal(snapshotResult.snapshot.presentation.source, "shadow");
  assert.equal(snapshotResult.snapshot.capability.mode, "read_only");
  assert.equal(snapshotResult.snapshot.outcome, "preview_only");
});

test("PR1B: blocked shadow handoff projects to a blocked snapshot", () => {
  const handoff = clone(handoffV2);
  handoff.presentation.source = "shadow";
  handoff.presentation.variant = "blocked";
  handoff.outcome = "blocked";
  handoff.reasonCode = "VERTICAL_POLICY_DENIED";
  handoff.governance.policy.decision = "denied";

  const result = buildChatVerticalHandoffV2ShadowSnapshot(handoff);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.snapshot.presentation.variant, "blocked");
  assert.equal(result.snapshot.outcome, "blocked");
  assert.equal(result.snapshot.reasonCode, "VERTICAL_POLICY_DENIED");
});

test("PR1B: snapshot redacts governance, refs and sensitive content fields", () => {
  const result = buildChatVerticalHandoffV2ShadowSnapshot(handoffV2);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);

  const serialized = JSON.stringify(result.snapshot);
  for (const forbidden of [
    "tenantId",
    "workspaceId",
    "governance",
    "refs",
    "tenant-contract-test",
    "workspace-contract-test",
    "conversation-contract-test",
    "thread-contract-test",
    "prompt",
    "response",
    "rawDocument",
    "documentBody",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("PR1B: input carrying prompt, response or raw document fields is rejected", () => {
  for (const field of ["prompt", "response", "rawDocument", "documentBody"] as const) {
    const result = buildChatVerticalHandoffV2ShadowSnapshot({
      ...handoffV2,
      [field]: "synthetic content must not cross the adapter",
    });

    assert.equal(result.ok, false, field);
    if (result.ok) assert.fail(`expected ${field} rejection`);
    assert.equal(result.reasonCode, "VERTICAL_PRESENTATION_INVALID");
  }
});

test("PR1B: operational, allowed and mutational handoffs cannot enter the shadow snapshot", () => {
  const operational = clone(handoffV2);
  operational.presentation.source = "operational";
  const allowed = clone(handoffV2);
  allowed.presentation.source = "shadow";
  allowed.outcome = "allowed";
  const mutational = clone(handoffV2);
  mutational.presentation.source = "shadow";
  mutational.capability.mode = "requires_write";
  const blockedFixture = clone(handoffV2);
  blockedFixture.presentation.variant = "blocked";
  blockedFixture.outcome = "blocked";

  for (const handoff of [operational, allowed, mutational, blockedFixture]) {
    const result = buildChatVerticalHandoffV2ShadowSnapshot(handoff);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected failure");
    assert.equal(result.reasonCode, "VERTICAL_PRESENTATION_INVALID");
    assert.equal(result.sideEffects, 0);
  }
});

test("PR1B: shadow snapshot schema is strict and rejects governance identifiers", () => {
  const result = buildChatVerticalHandoffV2ShadowSnapshot(handoffV2);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);

  assert.equal(
    chatVerticalHandoffV2ShadowSnapshotSchema.safeParse({
      ...result.snapshot,
      tenantId: "tenant-must-not-render",
    }).success,
    false,
  );
  assert.equal(
    chatVerticalHandoffV2ShadowSnapshotSchema.safeParse({
      ...result.snapshot,
      workspaceId: "workspace-must-not-render",
    }).success,
    false,
  );
});
