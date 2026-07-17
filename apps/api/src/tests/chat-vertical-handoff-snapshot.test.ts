import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatVerticalHandoffSnapshot,
  validateChatVerticalHandoffSnapshotAgainstSchema,
} from "../services/chatVerticalHandoffSnapshot";

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
