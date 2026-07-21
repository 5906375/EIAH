import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveChatVerticalImobCandidate,
  type ResolveChatVerticalImobCandidateInput,
} from "../resolvers/chatVerticalImobCandidateResolver";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-resolver-test-1",
  scope: {
    tenantId: "tenant-imob-resolver-test",
    workspaceId: "workspace-imob-resolver-test",
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
      label: "IMOB Registry Label",
      status: "enabled",
      capabilities: [{ id: "inventory.preview", allowedModes: ["read_only"] }],
      entitlement: { required: true, key: "REAL_ESTATE_CORE" },
      rbac: { requiredRoles: ["workspace.member"] },
      policyGates: ["vertical.read_only"],
      rolloutStage: "context_only",
    },
  ],
};

const baseInput: ResolveChatVerticalImobCandidateInput = {
  intent: {
    verticalId: "imob",
    label: "Untrusted intent label",
    capabilityId: "inventory.preview",
  },
  confidenceSignals: {
    verticalEvidence: "explicit",
    capabilityEvidence: "explicit",
    competingIntent: false,
  },
  registry,
  handoffId: "handoff-imob-resolver-test",
  refs: {
    conversationId: "conversation-imob-resolver-test",
    threadId: "thread-imob-resolver-test",
  },
  governance: {
    tenantId: "tenant-imob-resolver-test",
    workspaceId: "workspace-imob-resolver-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
};

function cloneInput(): ResolveChatVerticalImobCandidateInput {
  return JSON.parse(JSON.stringify(baseInput)) as ResolveChatVerticalImobCandidateInput;
}

test("PR2A: canonical IMOB intent produces a read-only shadow candidate", () => {
  const result = resolveChatVerticalImobCandidate(cloneInput());

  assert.equal(result.status, "candidate");
  assert.equal(result.sideEffects, 0);
  if (result.status !== "candidate") assert.fail("expected candidate");
  assert.equal(result.candidate.vertical.id, "imob");
  assert.equal(result.candidate.vertical.label, "IMOB Registry Label");
  assert.equal(result.candidate.capability.id, "inventory.preview");
  assert.equal(result.candidate.capability.mode, "read_only");
  assert.equal(result.candidate.presentation.source, "shadow");
  assert.equal(result.candidate.outcome, "preview_only");
  assert.equal(result.snapshot.outcome, "preview_only");
  assert.deepEqual(result.confidence, { level: "high", score: 90, sideEffects: 0 });
  assert.equal(result.clarificationNeeded, false);
});

test("PR2A: non-IMOB intent is not applicable", () => {
  const input = cloneInput();
  input.intent.verticalId = "core";

  assert.deepEqual(resolveChatVerticalImobCandidate(input), {
    status: "not_applicable",
    confidence: { level: "low", score: 0, sideEffects: 0 },
    clarificationNeeded: false,
    sideEffects: 0,
  });
});

test("PR2A: label is presentation metadata and never vertical identity", () => {
  const imobInput = cloneInput();
  imobInput.intent.label = "LEGAL";
  const imobResult = resolveChatVerticalImobCandidate(imobInput);
  assert.equal(imobResult.status, "candidate");
  if (imobResult.status !== "candidate") assert.fail("expected candidate");
  assert.equal(imobResult.candidate.vertical.id, "imob");
  assert.equal(imobResult.candidate.vertical.label, "IMOB Registry Label");

  const labelOnlyInput = cloneInput();
  labelOnlyInput.intent.verticalId = "legal";
  labelOnlyInput.intent.label = "IMOB";
  assert.equal(resolveChatVerticalImobCandidate(labelOnlyInput).status, "not_applicable");
});

test("PR2A: unevaluated registry blocks with a canonical reason code", () => {
  const input = cloneInput();
  input.governance.registry.decision = "not_evaluated";

  const result = resolveChatVerticalImobCandidate(input);
  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "VERTICAL_GOVERNANCE_NOT_EVALUATED");
  assert.equal(result.candidate?.outcome, "blocked");
  assert.equal(result.snapshot?.presentation.variant, "blocked");
  assert.equal(result.sideEffects, 0);
});

test("PR2A: unregistered or malformed capability blocks", () => {
  for (const capabilityId of ["knowledge.search", "INVALID CAPABILITY"]) {
    const input = cloneInput();
    input.intent.capabilityId = capabilityId;

    const result = resolveChatVerticalImobCandidate(input);
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
    assert.equal(result.candidate?.outcome, "blocked");
    assert.equal(result.sideEffects, 0);
  }
});

test("PR2A: mutational mode blocks and cannot cross the shadow adapter", () => {
  const input = cloneInput();
  input.mode = "requires_write";

  const result = resolveChatVerticalImobCandidate(input);
  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
  assert.equal(result.candidate?.capability.mode, "read_only");
  assert.equal(result.snapshot?.capability.mode, "read_only");
  assert.equal(result.sideEffects, 0);
});

test("PR2A: operational allowed outcome blocks", () => {
  const input = cloneInput();
  input.outcome = "allowed";

  const result = resolveChatVerticalImobCandidate(input);
  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "VERTICAL_PRESENTATION_INVALID");
  assert.equal(result.candidate?.outcome, "blocked");
  assert.equal(result.sideEffects, 0);
});

test("PR2A: shadow snapshot redacts refs and governance identifiers", () => {
  const result = resolveChatVerticalImobCandidate(cloneInput());
  assert.equal(result.status, "candidate");
  if (result.status !== "candidate") assert.fail("expected candidate");

  const serialized = JSON.stringify(result.snapshot);
  for (const forbidden of [
    "tenantId",
    "workspaceId",
    "governance",
    "refs",
    "tenant-imob-resolver-test",
    "workspace-imob-resolver-test",
    "conversation-imob-resolver-test",
    "thread-imob-resolver-test",
    "prompt",
    "response",
    "rawDocument",
    "documentBody",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("PR2A: every resolver branch reports zero side effects", () => {
  const positive = resolveChatVerticalImobCandidate(cloneInput());
  const negativeInput = cloneInput();
  negativeInput.intent.verticalId = "core";
  const negative = resolveChatVerticalImobCandidate(negativeInput);
  const blockedInput = cloneInput();
  blockedInput.outcome = "allowed";
  const blocked = resolveChatVerticalImobCandidate(blockedInput);

  assert.deepEqual([positive.sideEffects, negative.sideEffects, blocked.sideEffects], [0, 0, 0]);
});
