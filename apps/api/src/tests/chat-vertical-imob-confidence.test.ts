import test from "node:test";
import assert from "node:assert/strict";

import {
  IMOB_CONFIDENCE_THRESHOLDS,
  classifyImobConfidenceScore,
  scoreChatVerticalImobConfidence,
} from "../resolvers/chatVerticalImobConfidence";
import {
  resolveChatVerticalImobCandidate,
  type ResolveChatVerticalImobCandidateInput,
} from "../resolvers/chatVerticalImobCandidateResolver";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-confidence-test-1",
  scope: {
    tenantId: "tenant-imob-confidence-test",
    workspaceId: "workspace-imob-confidence-test",
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

const baseInput: ResolveChatVerticalImobCandidateInput = {
  intent: {
    verticalId: "imob",
    label: "Untrusted label",
    capabilityId: "inventory.preview",
  },
  confidenceSignals: {
    verticalEvidence: "explicit",
    capabilityEvidence: "explicit",
    competingIntent: false,
  },
  registry,
  handoffId: "handoff-imob-confidence-test",
  refs: {
    conversationId: "conversation-imob-confidence-test",
    threadId: "thread-imob-confidence-test",
  },
  governance: {
    tenantId: "tenant-imob-confidence-test",
    workspaceId: "workspace-imob-confidence-test",
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

test("PR3: explicit IMOB inventory evidence is high confidence", () => {
  const result = resolveChatVerticalImobCandidate(cloneInput());

  assert.equal(result.status, "candidate");
  assert.equal(result.confidence.level, "high");
  assert.equal(result.confidence.score, 90);
  assert.equal(result.clarificationNeeded, false);
  assert.equal(result.sideEffects, 0);
});

test("PR3: ambiguous IMOB evidence signals clarification without asking the user", () => {
  const input = cloneInput();
  input.confidenceSignals = {
    verticalEvidence: "explicit",
    capabilityEvidence: "explicit",
    competingIntent: true,
  };

  const result = resolveChatVerticalImobCandidate(input);
  assert.equal(result.status, "clarification_needed");
  assert.equal(result.confidence.level, "medium");
  assert.equal(result.confidence.score, 50);
  assert.equal(result.clarificationNeeded, true);
  assert.equal(result.sideEffects, 0);
  if (result.status !== "clarification_needed") assert.fail("expected clarification signal");
  assert.equal(result.candidate.outcome, "preview_only");
  assert.equal(result.snapshot.outcome, "preview_only");
});

test("PR3: low confidence IMOB and non-IMOB are not applicable", () => {
  const lowImob = cloneInput();
  lowImob.confidenceSignals = {
    verticalEvidence: "contextual",
    capabilityEvidence: "absent",
    competingIntent: false,
  };
  const nonImob = cloneInput();
  nonImob.intent.verticalId = "core";

  for (const input of [lowImob, nonImob]) {
    const result = resolveChatVerticalImobCandidate(input);
    assert.equal(result.status, "not_applicable");
    assert.equal(result.confidence.level, "low");
    assert.equal(result.clarificationNeeded, false);
    assert.equal(result.sideEffects, 0);
  }
});

test("PR3: confidence never turns a shadow outcome into allowed", () => {
  const input = cloneInput();
  input.outcome = "allowed";

  const result = resolveChatVerticalImobCandidate(input);
  assert.equal(result.status, "blocked");
  assert.equal(result.confidence.level, "high");
  assert.equal(result.clarificationNeeded, false);
  if (result.status !== "blocked") assert.fail("expected blocked result");
  assert.notEqual(result.candidate?.outcome, "allowed");
  assert.notEqual(result.snapshot?.outcome, "allowed");
  assert.equal(result.sideEffects, 0);
});

test("PR3: confidence result exposes no execution surface", () => {
  const assessment = scoreChatVerticalImobConfidence({
    verticalId: "imob",
    capabilityId: "inventory.preview",
    signals: {
      verticalEvidence: "explicit",
      capabilityEvidence: "explicit",
      competingIntent: false,
    },
  });

  assert.deepEqual(Object.keys(assessment).sort(), ["level", "score", "sideEffects"]);
  assert.equal(assessment.sideEffects, 0);
  assert.equal("knowledgeSearch" in assessment, false);
  assert.equal("providerCall" in assessment, false);
  assert.equal("runId" in assessment, false);
  assert.equal("write" in assessment, false);
});

test("PR3: label cannot raise or change confidence identity", () => {
  const imob = cloneInput();
  imob.intent.label = "CORE";
  const imobResult = resolveChatVerticalImobCandidate(imob);
  assert.equal(imobResult.confidence.level, "high");

  const labelOnly = cloneInput();
  labelOnly.intent.verticalId = "core";
  labelOnly.intent.label = "IMOB";
  const labelOnlyResult = resolveChatVerticalImobCandidate(labelOnly);
  assert.equal(labelOnlyResult.status, "not_applicable");
  assert.equal(labelOnlyResult.confidence.level, "low");
});

test("PR3: selectedVertical and routeIntent metadata cannot authorize IMOB", () => {
  const input = {
    ...cloneInput(),
    intent: {
      verticalId: "core",
      label: "IMOB",
      capabilityId: "inventory.preview",
    },
    selectedVertical: "imob",
    routeIntent: "imob.inventory.preview",
  } as ResolveChatVerticalImobCandidateInput & {
    selectedVertical: string;
    routeIntent: string;
  };

  const result = resolveChatVerticalImobCandidate(input);
  assert.equal(result.status, "not_applicable");
  assert.equal(result.confidence.level, "low");
  assert.equal(result.sideEffects, 0);
});

test("PR3: missing or malformed confidence signals fail closed as low", () => {
  for (const signals of [undefined, { verticalEvidence: "unknown" }]) {
    const result = scoreChatVerticalImobConfidence({
      verticalId: "imob",
      capabilityId: "inventory.preview",
      signals: signals as never,
    });

    assert.deepEqual(result, { level: "low", score: 0, sideEffects: 0 });
  }
});

test("PR3: confidence thresholds are explicit and stable at their boundaries", () => {
  assert.deepEqual(IMOB_CONFIDENCE_THRESHOLDS, { high: 80, medium: 50 });
  assert.equal(classifyImobConfidenceScore(80), "high");
  assert.equal(classifyImobConfidenceScore(79), "medium");
  assert.equal(classifyImobConfidenceScore(50), "medium");
  assert.equal(classifyImobConfidenceScore(49), "low");
  assert.equal(classifyImobConfidenceScore(Number.NaN), "low");
});

test("PR3: high, medium and low branches preserve zero side effects", () => {
  const high = scoreChatVerticalImobConfidence({
    verticalId: "imob",
    capabilityId: "inventory.preview",
    signals: baseInput.confidenceSignals,
  });
  const medium = scoreChatVerticalImobConfidence({
    verticalId: "imob",
    capabilityId: "inventory.preview",
    signals: { ...baseInput.confidenceSignals, competingIntent: true },
  });
  const low = scoreChatVerticalImobConfidence({
    verticalId: "core",
    capabilityId: "inventory.preview",
    signals: baseInput.confidenceSignals,
  });

  assert.deepEqual([high.level, medium.level, low.level], ["high", "medium", "low"]);
  assert.deepEqual([high.sideEffects, medium.sideEffects, low.sideEffects], [0, 0, 0]);
});
