import test from "node:test";
import assert from "node:assert/strict";

import {
  IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS,
  chatVerticalImobHandoffPreflightPayloadSchema,
  resolveChatVerticalImobHandoffPreflight,
} from "../resolvers/chatVerticalImobHandoff";
import { buildChatVerticalImobClarification } from "../resolvers/chatVerticalImobClarification";
import {
  resolveChatVerticalImobCandidate,
  type ResolveChatVerticalImobCandidateInput,
} from "../resolvers/chatVerticalImobCandidateResolver";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-handoff-test-1",
  scope: {
    tenantId: "tenant-imob-handoff-test",
    workspaceId: "workspace-imob-handoff-test",
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
  handoffId: "handoff-imob-handoff-test",
  refs: {
    conversationId: "conversation-imob-handoff-test",
    threadId: "thread-imob-handoff-test",
  },
  governance: {
    tenantId: "tenant-imob-handoff-test",
    workspaceId: "workspace-imob-handoff-test",
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

function resolveHigh() {
  return resolveChatVerticalImobCandidate(cloneInput());
}

function resolveMedium() {
  const input = cloneInput();
  input.confidenceSignals.competingIntent = true;
  return resolveChatVerticalImobCandidate(input);
}

test("PR5: high confidence candidate produces a strict deterministic handoff preflight", () => {
  const result = resolveChatVerticalImobHandoffPreflight({
    kind: "candidate_resolution",
    resolution: resolveHigh(),
  });

  assert.equal(result.status, "handoff_ready");
  assert.equal(result.sideEffects, 0);
  if (result.status !== "handoff_ready") assert.fail("expected handoff preflight payload");
  assert.deepEqual(result.payload, {
    kind: "chat.vertical_handoff_preflight.v1",
    verticalId: "imob",
    capabilityId: "inventory.preview",
    handoffIntentKey: "imob.inventory.preview.open_context",
    source: "high_confidence",
    allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
    defaultNextAction: "open_context_preview",
    sideEffects: 0,
  });
  assert.equal(chatVerticalImobHandoffPreflightPayloadSchema.safeParse(result.payload).success, true);
  assert.equal(
    chatVerticalImobHandoffPreflightPayloadSchema.safeParse({
      ...result.payload,
      tenantId: "tenant-must-not-cross-public-boundary",
    }).success,
    false,
  );
});

test("PR5: medium confidence candidate without a confirmed reply produces no handoff", () => {
  const medium = resolveMedium();
  assert.equal(medium.status, "clarification_needed");

  const asCandidate = resolveChatVerticalImobHandoffPreflight({
    kind: "candidate_resolution",
    resolution: medium,
  });
  assert.deepEqual(asCandidate, { status: "not_applicable", payload: null, sideEffects: 0 });

  const clarification = buildChatVerticalImobClarification(medium);
  const withoutReply = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification,
    reply: undefined,
  });
  assert.deepEqual(withoutReply, { status: "not_applicable", payload: null, sideEffects: 0 });
});

test("PR5: clarification_ready confirmed with confirm_inventory_preview produces a handoff preflight", () => {
  const clarification = buildChatVerticalImobClarification(resolveMedium());
  assert.equal(clarification.status, "clarification_ready");

  const result = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification,
    reply: "confirm_inventory_preview",
  });

  assert.equal(result.status, "handoff_ready");
  assert.equal(result.sideEffects, 0);
  if (result.status !== "handoff_ready") assert.fail("expected handoff preflight payload");
  assert.equal(result.payload.source, "clarification_confirmed");
  assert.equal(chatVerticalImobHandoffPreflightPayloadSchema.safeParse(result.payload).success, true);
});

test("PR5: refine_inventory_intent reply produces no handoff", () => {
  const clarification = buildChatVerticalImobClarification(resolveMedium());
  const result = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification,
    reply: "refine_inventory_intent",
  });
  assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });
});

test("PR5: cancel_vertical_switch reply produces no handoff", () => {
  const clarification = buildChatVerticalImobClarification(resolveMedium());
  const result = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification,
    reply: "cancel_vertical_switch",
  });
  assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });
});

test("PR5: low confidence, non-IMOB and blocked resolutions produce no handoff", () => {
  const low = cloneInput();
  low.confidenceSignals = {
    verticalEvidence: "contextual",
    capabilityEvidence: "absent",
    competingIntent: false,
  };
  const nonImob = cloneInput();
  nonImob.intent.verticalId = "core";
  const blocked = cloneInput();
  blocked.governance.policy.decision = "denied";

  for (const input of [low, nonImob, blocked]) {
    const resolution = resolveChatVerticalImobCandidate(input);
    const result = resolveChatVerticalImobHandoffPreflight({
      kind: "candidate_resolution",
      resolution,
    });
    assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });
  }
});

test("PR5: selectedVertical, routeIntent and label metadata cannot authorize a handoff", () => {
  const lowLabeledAsImob = resolveChatVerticalImobCandidate({
    ...cloneInput(),
    intent: { verticalId: "core", label: "IMOB", capabilityId: "inventory.preview" },
  });

  const result = resolveChatVerticalImobHandoffPreflight({
    kind: "candidate_resolution",
    resolution: {
      ...lowLabeledAsImob,
      selectedVertical: "imob",
      routeIntent: "imob.inventory.preview",
      label: "IMOB",
    },
  });

  assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });

  const clarification = buildChatVerticalImobClarification(resolveMedium());
  const spoofedReply = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification: { ...clarification, selectedVertical: "imob", routeIntent: "imob.inventory.preview" },
    reply: "confirm_inventory_preview",
  });
  assert.equal(spoofedReply.status, "handoff_ready");
});

test("PR5: inconsistent high-confidence resolution fails closed", () => {
  const high = resolveHigh();
  assert.equal(high.status, "candidate");
  if (high.status !== "candidate") assert.fail("expected high confidence candidate");

  const mutations = [
    { ...high, clarificationNeeded: true },
    { ...high, confidence: { ...high.confidence, level: "medium" } },
    { ...high, confidence: { ...high.confidence, score: 60 } },
    { ...high, candidate: { ...high.candidate, outcome: "allowed" } },
    { ...high, candidate: { ...high.candidate, capability: { ...high.candidate.capability, mode: "critical_action" } } },
    { ...high, candidate: { ...high.candidate, capability: { ...high.candidate.capability, id: "inventory.unavailable" } } },
    { ...high, candidate: { ...high.candidate, presentation: { ...high.candidate.presentation, variant: "cockpit_link" } } },
  ];

  for (const mutated of mutations) {
    const result = resolveChatVerticalImobHandoffPreflight({
      kind: "candidate_resolution",
      resolution: mutated,
    });
    assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });
  }
});

test("PR5: inconsistent clarification confirmation fails closed", () => {
  const clarification = buildChatVerticalImobClarification(resolveMedium());
  assert.equal(clarification.status, "clarification_ready");
  if (clarification.status !== "clarification_ready") assert.fail("expected clarification payload");

  const mutations = [
    { ...clarification, sideEffects: 1 },
    { ...clarification, payload: { ...clarification.payload, reason: "OTHER_REASON" } },
    { ...clarification, payload: { ...clarification.payload, verticalId: "core" } },
    { ...clarification, payload: { ...clarification.payload, allowedReplies: ["refine_inventory_intent", "cancel_vertical_switch"] } },
  ];

  for (const mutated of mutations) {
    const result = resolveChatVerticalImobHandoffPreflight({
      kind: "clarification_confirmation",
      clarification: mutated,
      reply: "confirm_inventory_preview",
    });
    assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });
  }
});

test("PR5: malformed and null inputs produce no handoff without throwing", () => {
  for (const input of [
    null,
    undefined,
    "confirm_inventory_preview",
    {},
    { kind: "unknown_kind" },
    { kind: "candidate_resolution" },
    { kind: "candidate_resolution", resolution: null },
    { kind: "clarification_confirmation" },
    { kind: "clarification_confirmation", clarification: null, reply: "confirm_inventory_preview" },
  ]) {
    const result = resolveChatVerticalImobHandoffPreflight(input);
    assert.deepEqual(result, { status: "not_applicable", payload: null, sideEffects: 0 });
  }
});

test("PR5: public payload excludes tenant, workspace, governance, refs and sensitive content", () => {
  const result = resolveChatVerticalImobHandoffPreflight({
    kind: "candidate_resolution",
    resolution: resolveHigh(),
  });
  assert.equal(result.status, "handoff_ready");
  if (result.status !== "handoff_ready") assert.fail("expected handoff preflight payload");

  const serialized = JSON.stringify(result.payload);
  for (const forbidden of [
    "tenantId",
    "workspaceId",
    "governance",
    "refs",
    "tenant-imob-handoff-test",
    "workspace-imob-handoff-test",
    "conversation-imob-handoff-test",
    "thread-imob-handoff-test",
    "secret",
    "prompt",
    "response",
    "rawDocument",
    "documentBody",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("PR5: allowed next actions and default are stable across both sources", () => {
  const fromCandidate = resolveChatVerticalImobHandoffPreflight({
    kind: "candidate_resolution",
    resolution: resolveHigh(),
  });
  const clarification = buildChatVerticalImobClarification(resolveMedium());
  const fromClarification = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification,
    reply: "confirm_inventory_preview",
  });

  assert.equal(fromCandidate.status, "handoff_ready");
  assert.equal(fromClarification.status, "handoff_ready");
  if (fromCandidate.status !== "handoff_ready" || fromClarification.status !== "handoff_ready") {
    assert.fail("expected handoff preflight payloads");
  }

  assert.deepEqual(fromCandidate.payload.allowedNextActions, IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS);
  assert.deepEqual(fromClarification.payload.allowedNextActions, IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS);
  assert.equal(fromCandidate.payload.defaultNextAction, "open_context_preview");
  assert.equal(fromClarification.payload.defaultNextAction, "open_context_preview");
});

test("PR5: all handoff branches preserve zero side effects", () => {
  const high = resolveChatVerticalImobHandoffPreflight({
    kind: "candidate_resolution",
    resolution: resolveHigh(),
  });
  const clarification = buildChatVerticalImobClarification(resolveMedium());
  const confirmed = resolveChatVerticalImobHandoffPreflight({
    kind: "clarification_confirmation",
    clarification,
    reply: "confirm_inventory_preview",
  });
  const malformed = resolveChatVerticalImobHandoffPreflight(null);

  assert.deepEqual([high.sideEffects, confirmed.sideEffects, malformed.sideEffects], [0, 0, 0]);
});
