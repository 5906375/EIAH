import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReadOnlyHitlGateState,
  buildReadOnlyProofReceiptBundleState,
  validateHitlGateStateAgainstSchema,
  validateProofReceiptBundleStateAgainstSchema,
} from "../services/chatGateProofAdapters";

const baseGateInput = {
  gateId: "gate-imob-arch",
  gateType: "approval",
  tenantId: "tenant-arch",
  workspaceId: "workspace-arch",
  scope: "imob:chat:read",
  approvalState: "pending",
  hitlRequired: true,
  riskLevel: "high",
  reasonCode: "APPROVAL_REQUIRED",
  verticalId: "IMOB",
  message: "Ação requer revisão humana antes de qualquer execução.",
  runId: "run-arch",
  handoffId: "handoff-arch",
  requiredRole: "workspace.admin",
  requiredEntitlement: "REAL_ESTATE_CORE",
  allowedUserActions: ["view_details", "request_review", "view_details", "approve", "reject"],
  accessibilityLabel: "Gate HITL read-only IMOB",
} as const;

const baseProofInput = {
  proofKind: "runtime_state",
  proofStatus: "unavailable",
  runId: "run-arch",
  verticalId: "IMOB",
  tenantId: "tenant-arch",
  workspaceId: "workspace-arch",
  scope: "imob:chat:read",
  source: "runtime",
  reasonCode: "PROOF_UNAVAILABLE_READ_ONLY",
  accessibilityLabel: "Proof read-only indisponível",
} as const;

test("ARCH-IMPL-3: valid pending HITL gate returns read-only state", () => {
  const result = buildReadOnlyHitlGateState(baseGateInput);

  assert.equal(result.ok, true);
  assert.equal(result.sideEffects, 0);
  assert.equal(result.readOnly, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.schemaPath, "contracts/chat/hitl.gate_state.v1.schema.json");
  assert.equal(result.state.approvalState, "pending");
  assert.deepEqual(result.state.allowedUserActions, ["view_details", "request_review"]);
});

test("ARCH-IMPL-3: critical HITL gate is valid when hitlRequired=true", () => {
  const result = buildReadOnlyHitlGateState({
    ...baseGateInput,
    approvalState: "blocked",
    riskLevel: "critical",
    hitlRequired: true,
    reasonCode: "APPROVAL_REQUIRED",
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.sideEffects, 0);
  assert.equal(result.state.riskLevel, "critical");
  assert.equal(result.state.hitlRequired, true);
});

test("ARCH-IMPL-3: critical HITL gate without hitlRequired fails closed", () => {
  const result = buildReadOnlyHitlGateState({
    ...baseGateInput,
    riskLevel: "critical",
    hitlRequired: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.sideEffects, 0);
  if (result.ok) assert.fail("expected failure");
  assert.equal(result.reasonCode, "CHAT_HITL_GATE_HITL_REQUIRED_FOR_CRITICAL_RISK");
});

test("ARCH-IMPL-3: HITL gate without tenant/workspace/scope fails closed", () => {
  const missingTenant = buildReadOnlyHitlGateState({ ...baseGateInput, tenantId: "" });
  const missingWorkspace = buildReadOnlyHitlGateState({ ...baseGateInput, workspaceId: " " });
  const missingScope = buildReadOnlyHitlGateState({ ...baseGateInput, scope: null });

  assert.equal(missingTenant.ok, false);
  assert.equal(missingWorkspace.ok, false);
  assert.equal(missingScope.ok, false);
  if (missingTenant.ok || missingWorkspace.ok || missingScope.ok) assert.fail("expected failures");
  assert.equal(missingTenant.reasonCode, "CHAT_HITL_GATE_TENANT_REQUIRED");
  assert.equal(missingWorkspace.reasonCode, "CHAT_HITL_GATE_WORKSPACE_REQUIRED");
  assert.equal(missingScope.reasonCode, "CHAT_HITL_GATE_SCOPE_REQUIRED");
});

test("ARCH-IMPL-3: HITL gate does not expose approve/reject/delegate/escalate handlers", () => {
  const result = buildReadOnlyHitlGateState(baseGateInput);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /approve|reject|delegate|escalate/i);
  assert.equal("onApprove" in result.state, false);
  assert.equal("onReject" in result.state, false);
  assert.equal("onDelegate" in result.state, false);
  assert.equal("onEscalate" in result.state, false);
});

test("ARCH-IMPL-3: HITL gate validates against hitl.gate_state.v1 schema", () => {
  const result = buildReadOnlyHitlGateState(baseGateInput);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.deepEqual(validateHitlGateStateAgainstSchema(result.state), []);
});

test("ARCH-IMPL-3: proof unavailable maps to read-only contract state", () => {
  const result = buildReadOnlyProofReceiptBundleState(baseProofInput);

  assert.equal(result.ok, true);
  assert.equal(result.sideEffects, 0);
  assert.equal(result.readOnly, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.schemaPath, "contracts/chat/proof_receipt_bundle_state.v1.schema.json");
  assert.equal(result.state.proofStatus, "not_required");
  assert.equal(result.state.reasonCode, "PROOF_UNAVAILABLE_READ_ONLY");
});

test("ARCH-IMPL-3: proof available with run/receipt/bundle/ledger refs is valid", () => {
  const result = buildReadOnlyProofReceiptBundleState({
    ...baseProofInput,
    proofKind: "bundle",
    proofStatus: "available",
    reasonCode: "PROOF_AVAILABLE_READ_ONLY",
    proofId: "proof-arch",
    receiptId: "receipt-arch",
    bundleId: "bundle-arch",
    ledgerRef: "tx-arch-0000000000000001",
    receiptLink: "/app/runs/run-arch",
    bundleLink: "/app/runs/run-arch/bundle",
  });

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.sideEffects, 0);
  assert.equal(result.state.receiptId, "receipt-arch");
  assert.equal(result.state.bundleId, "bundle-arch");
  assert.equal(result.state.ledgerRef, "tx-arch-0000000000000001");
});

test("ARCH-IMPL-3: proof without tenant/workspace/scope fails closed", () => {
  const missingTenant = buildReadOnlyProofReceiptBundleState({ ...baseProofInput, tenantId: "" });
  const missingWorkspace = buildReadOnlyProofReceiptBundleState({ ...baseProofInput, workspaceId: " " });
  const missingScope = buildReadOnlyProofReceiptBundleState({ ...baseProofInput, scope: null });

  assert.equal(missingTenant.ok, false);
  assert.equal(missingWorkspace.ok, false);
  assert.equal(missingScope.ok, false);
  if (missingTenant.ok || missingWorkspace.ok || missingScope.ok) assert.fail("expected failures");
  assert.equal(missingTenant.reasonCode, "CHAT_PROOF_TENANT_REQUIRED");
  assert.equal(missingWorkspace.reasonCode, "CHAT_PROOF_WORKSPACE_REQUIRED");
  assert.equal(missingScope.reasonCode, "CHAT_PROOF_SCOPE_REQUIRED");
});

test("ARCH-IMPL-3: proof adapter does not generate receipt/bundle/ledger", () => {
  const result = buildReadOnlyProofReceiptBundleState(baseProofInput);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.equal(result.state.receiptId, undefined);
  assert.equal(result.state.bundleId, undefined);
  assert.equal(result.state.ledgerRef, undefined);
});

test("ARCH-IMPL-3: proof state validates against proof_receipt_bundle_state.v1 schema", () => {
  const result = buildReadOnlyProofReceiptBundleState(baseProofInput);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail(result.reasonCode);
  assert.deepEqual(validateProofReceiptBundleStateAgainstSchema(result.state), []);
});

test("ARCH-IMPL-3: happy paths keep sideEffects=0", () => {
  const gate = buildReadOnlyHitlGateState(baseGateInput);
  const proof = buildReadOnlyProofReceiptBundleState(baseProofInput);

  assert.equal(gate.ok, true);
  assert.equal(proof.ok, true);
  assert.equal(gate.sideEffects, 0);
  assert.equal(proof.sideEffects, 0);
});

test("ARCH-IMPL-3: adapters do not call API/provider/DB/ledger/audit", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const gate = buildReadOnlyHitlGateState(baseGateInput);
    const proof = buildReadOnlyProofReceiptBundleState(baseProofInput);
    assert.equal(gate.ok, true);
    assert.equal(proof.ok, true);
    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(JSON.stringify({ gate, proof }), /providerExternalCall|dbWrite|ledgerWrite|auditWrite/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
