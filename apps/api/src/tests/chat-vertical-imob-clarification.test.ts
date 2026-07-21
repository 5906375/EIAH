import test from "node:test";
import assert from "node:assert/strict";

import {
  IMOB_CLARIFICATION_ALLOWED_REPLIES,
  buildChatVerticalImobClarification,
  chatVerticalImobClarificationPayloadSchema,
} from "../resolvers/chatVerticalImobClarification";
import {
  resolveChatVerticalImobCandidate,
  type ResolveChatVerticalImobCandidateInput,
} from "../resolvers/chatVerticalImobCandidateResolver";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-clarification-test-1",
  scope: {
    tenantId: "tenant-imob-clarification-test",
    workspaceId: "workspace-imob-clarification-test",
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
    competingIntent: true,
  },
  registry,
  handoffId: "handoff-imob-clarification-test",
  refs: {
    conversationId: "conversation-imob-clarification-test",
    threadId: "thread-imob-clarification-test",
  },
  governance: {
    tenantId: "tenant-imob-clarification-test",
    workspaceId: "workspace-imob-clarification-test",
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

function resolveMedium() {
  return resolveChatVerticalImobCandidate(cloneInput());
}

test("PR4: medium IMOB result produces a strict deterministic clarification payload", () => {
  const result = buildChatVerticalImobClarification(resolveMedium());

  assert.equal(result.status, "clarification_ready");
  assert.equal(result.sideEffects, 0);
  if (result.status !== "clarification_ready") assert.fail("expected clarification payload");
  assert.deepEqual(result.payload, {
    kind: "chat.vertical_clarification.v1",
    verticalId: "imob",
    capabilityId: "inventory.preview",
    reason: "IMOB_INVENTORY_INTENT_AMBIGUOUS",
    questionKey: "imob.inventory.preview.clarify_intent",
    allowedReplies: [
      "confirm_inventory_preview",
      "refine_inventory_intent",
      "cancel_vertical_switch",
    ],
    defaultReply: "refine_inventory_intent",
    sideEffects: 0,
  });
  assert.equal(chatVerticalImobClarificationPayloadSchema.safeParse(result.payload).success, true);
  assert.equal(
    chatVerticalImobClarificationPayloadSchema.safeParse({
      ...result.payload,
      tenantId: "tenant-must-not-cross-public-boundary",
    }).success,
    false,
  );
});

test("PR4: high confidence result produces no clarification", () => {
  const input = cloneInput();
  input.confidenceSignals.competingIntent = false;

  assert.deepEqual(buildChatVerticalImobClarification(resolveChatVerticalImobCandidate(input)), {
    status: "not_applicable",
    payload: null,
    sideEffects: 0,
  });
});

test("PR4: low confidence and non-IMOB results produce no clarification", () => {
  const low = cloneInput();
  low.confidenceSignals = {
    verticalEvidence: "contextual",
    capabilityEvidence: "absent",
    competingIntent: false,
  };
  const nonImob = cloneInput();
  nonImob.intent.verticalId = "core";

  for (const input of [low, nonImob]) {
    const result = buildChatVerticalImobClarification(resolveChatVerticalImobCandidate(input));
    assert.equal(result.status, "not_applicable");
    assert.equal(result.payload, null);
    assert.equal(result.sideEffects, 0);
  }
});

test("PR4: blocked result produces no operational clarification", () => {
  const input = cloneInput();
  input.governance.policy.decision = "denied";

  const resolution = resolveChatVerticalImobCandidate(input);
  assert.equal(resolution.status, "blocked");
  assert.deepEqual(buildChatVerticalImobClarification(resolution), {
    status: "not_applicable",
    payload: null,
    sideEffects: 0,
  });
});

test("PR4: label cannot define clarification identity", () => {
  const imob = cloneInput();
  imob.intent.label = "CORE";
  assert.equal(buildChatVerticalImobClarification(resolveChatVerticalImobCandidate(imob)).status, "clarification_ready");

  const labelOnly = cloneInput();
  labelOnly.intent.verticalId = "core";
  labelOnly.intent.label = "IMOB";
  assert.equal(
    buildChatVerticalImobClarification(resolveChatVerticalImobCandidate(labelOnly)).status,
    "not_applicable",
  );
});

test("PR4: selectedVertical and routeIntent metadata cannot authorize clarification", () => {
  const lowResolution = resolveChatVerticalImobCandidate({
    ...cloneInput(),
    intent: { verticalId: "core", label: "IMOB", capabilityId: "inventory.preview" },
  });
  const result = buildChatVerticalImobClarification({
    ...lowResolution,
    selectedVertical: "imob",
    routeIntent: "imob.inventory.preview",
  });

  assert.equal(result.status, "not_applicable");
  assert.equal(result.sideEffects, 0);
});

test("PR4: public payload excludes governance, refs and sensitive content", () => {
  const result = buildChatVerticalImobClarification(resolveMedium());
  assert.equal(result.status, "clarification_ready");
  if (result.status !== "clarification_ready") assert.fail("expected clarification payload");

  const serialized = JSON.stringify(result.payload);
  for (const forbidden of [
    "tenantId",
    "workspaceId",
    "governance",
    "refs",
    "tenant-imob-clarification-test",
    "workspace-imob-clarification-test",
    "conversation-imob-clarification-test",
    "thread-imob-clarification-test",
    "secret",
    "prompt",
    "response",
    "rawDocument",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("PR4: allowed replies and default are stable", () => {
  const first = buildChatVerticalImobClarification(resolveMedium());
  const second = buildChatVerticalImobClarification(resolveMedium());
  assert.equal(first.status, "clarification_ready");
  assert.equal(second.status, "clarification_ready");
  if (first.status !== "clarification_ready" || second.status !== "clarification_ready") {
    assert.fail("expected clarification payloads");
  }

  assert.deepEqual(first.payload.allowedReplies, IMOB_CLARIFICATION_ALLOWED_REPLIES);
  assert.deepEqual(first.payload.allowedReplies, second.payload.allowedReplies);
  assert.equal(first.payload.defaultReply, "refine_inventory_intent");
  assert.equal(first.payload.allowedReplies.includes(first.payload.defaultReply), true);
});

test("PR4: inconsistent medium result fails closed", () => {
  const medium = resolveMedium();
  assert.equal(medium.status, "clarification_needed");
  if (medium.status !== "clarification_needed") assert.fail("expected medium result");

  for (const inconsistent of [
    { ...medium, clarificationNeeded: false },
    { ...medium, confidence: { ...medium.confidence, level: "high" } },
    { ...medium, confidence: { ...medium.confidence, score: 90 } },
    { ...medium, candidate: { ...medium.candidate, outcome: "allowed" } },
    {
      ...medium,
      snapshot: {
        ...medium.snapshot,
        presentation: { ...medium.snapshot.presentation, source: "fixture" },
      },
    },
    {
      ...medium,
      candidate: {
        ...medium.candidate,
        capability: { ...medium.candidate.capability, id: "inventory.unavailable" },
      },
    },
  ]) {
    const result = buildChatVerticalImobClarification(inconsistent);
    assert.equal(result.status, "not_applicable");
    assert.equal(result.payload, null);
    assert.equal(result.sideEffects, 0);
  }
});

test("PR4: all clarification branches preserve zero side effects", () => {
  const medium = buildChatVerticalImobClarification(resolveMedium());
  const highInput = cloneInput();
  highInput.confidenceSignals.competingIntent = false;
  const high = buildChatVerticalImobClarification(resolveChatVerticalImobCandidate(highInput));
  const malformed = buildChatVerticalImobClarification(null);

  assert.deepEqual([medium.sideEffects, high.sideEffects, malformed.sideEffects], [0, 0, 0]);
});
