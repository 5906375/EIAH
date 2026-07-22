import test from "node:test";
import assert from "node:assert/strict";

import {
  chatVerticalImobRuntimeShadowStateSchema,
  resolveChatVerticalImobRuntimeShadowState,
  type ResolveChatVerticalImobRuntimeShadowStateInput,
} from "../resolvers/chatVerticalImobRuntimeShadow";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-runtime-shadow-test-1",
  scope: {
    tenantId: "tenant-imob-runtime-shadow-test",
    workspaceId: "workspace-imob-runtime-shadow-test",
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

const baseInput: ResolveChatVerticalImobRuntimeShadowStateInput = {
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
  handoffId: "handoff-imob-runtime-shadow-test",
  refs: {
    conversationId: "conversation-imob-runtime-shadow-test",
    threadId: "thread-imob-runtime-shadow-test",
  },
  governance: {
    tenantId: "tenant-imob-runtime-shadow-test",
    workspaceId: "workspace-imob-runtime-shadow-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
};

function cloneInput(): ResolveChatVerticalImobRuntimeShadowStateInput {
  return JSON.parse(JSON.stringify(baseInput)) as ResolveChatVerticalImobRuntimeShadowStateInput;
}

test("PR8A: high confidence produces a handoff runtime shadow state", () => {
  const state = resolveChatVerticalImobRuntimeShadowState(cloneInput());

  assert.equal(state.stage, "handoff");
  assert.equal(state.kind, "chat.vertical_runtime_shadow_state.v1");
  assert.equal(state.verticalId, "imob");
  assert.equal(state.source, "runtime_shadow");
  assert.equal(state.sideEffects, 0);
  if (state.stage !== "handoff") assert.fail("expected handoff stage");
  assert.equal(state.handoff.source, "high_confidence");
  assert.equal(chatVerticalImobRuntimeShadowStateSchema.safeParse(state).success, true);
});

test("PR8A: medium confidence produces a clarification runtime shadow state", () => {
  const input = cloneInput();
  input.confidenceSignals.competingIntent = true;

  const state = resolveChatVerticalImobRuntimeShadowState(input);

  assert.equal(state.stage, "clarification");
  assert.equal(state.sideEffects, 0);
  if (state.stage !== "clarification") assert.fail("expected clarification stage");
  assert.equal(state.clarification.reason, "IMOB_INVENTORY_INTENT_AMBIGUOUS");
  assert.deepEqual(state.clarification.allowedReplies, [
    "confirm_inventory_preview",
    "refine_inventory_intent",
    "cancel_vertical_switch",
  ]);
});

test("PR8A: confirm_inventory_preview reply on a medium turn produces a handoff runtime shadow state", () => {
  const input = cloneInput();
  input.confidenceSignals.competingIntent = true;
  input.reply = "confirm_inventory_preview";

  const state = resolveChatVerticalImobRuntimeShadowState(input);

  assert.equal(state.stage, "handoff");
  if (state.stage !== "handoff") assert.fail("expected handoff stage");
  assert.equal(state.handoff.source, "clarification_confirmed");
});

test("PR8A: refine/cancel/missing reply on a medium turn keeps clarification stage", () => {
  for (const reply of ["refine_inventory_intent", "cancel_vertical_switch", undefined, "garbage"]) {
    const input = cloneInput();
    input.confidenceSignals.competingIntent = true;
    input.reply = reply;

    const state = resolveChatVerticalImobRuntimeShadowState(input);
    assert.equal(state.stage, "clarification", `reply=${String(reply)}`);
  }
});

test("PR8A: blocked governance produces a blocked runtime shadow state with a safe reasonCode", () => {
  const input = cloneInput();
  input.governance.policy.decision = "denied";

  const state = resolveChatVerticalImobRuntimeShadowState(input);

  assert.equal(state.stage, "blocked");
  if (state.stage !== "blocked") assert.fail("expected blocked stage");
  assert.match(state.reasonCode, /^[A-Z][A-Z0-9_]*$/);
  assert.equal(state.reasonCode, "VERTICAL_POLICY_DENIED");
  assert.equal(state.sideEffects, 0);
});

test("PR8A: low confidence and non-IMOB turns produce a not_applicable runtime shadow state", () => {
  const low = cloneInput();
  low.confidenceSignals = {
    verticalEvidence: "contextual",
    capabilityEvidence: "absent",
    competingIntent: false,
  };
  const nonImob = cloneInput();
  nonImob.intent.verticalId = "core";

  for (const input of [low, nonImob]) {
    const state = resolveChatVerticalImobRuntimeShadowState(input);
    assert.deepEqual(state, {
      kind: "chat.vertical_runtime_shadow_state.v1",
      verticalId: "imob",
      stage: "not_applicable",
      source: "runtime_shadow",
      sideEffects: 0,
    });
  }
});

test("PR8A: label and capabilityId metadata alone cannot authorize a non-IMOB turn", () => {
  const input = cloneInput();
  input.intent = { verticalId: "core", label: "IMOB", capabilityId: "inventory.preview" };

  const state = resolveChatVerticalImobRuntimeShadowState(input);
  assert.equal(state.stage, "not_applicable");
});

test("PR8A: reply metadata cannot force a handoff without a real clarification_needed turn", () => {
  const input = cloneInput();
  input.reply = "confirm_inventory_preview";
  // high confidence: candidate path does not read `reply` at all.

  const state = resolveChatVerticalImobRuntimeShadowState(input);
  assert.equal(state.stage, "handoff");
  if (state.stage !== "handoff") assert.fail("expected handoff stage");
  assert.equal(state.handoff.source, "high_confidence");
});

test("PR8A: every reachable state satisfies the strict schema and rejects extra fields", () => {
  const states: unknown[] = [
    resolveChatVerticalImobRuntimeShadowState(cloneInput()),
    (() => {
      const input = cloneInput();
      input.confidenceSignals.competingIntent = true;
      return resolveChatVerticalImobRuntimeShadowState(input);
    })(),
    (() => {
      const input = cloneInput();
      input.governance.policy.decision = "denied";
      return resolveChatVerticalImobRuntimeShadowState(input);
    })(),
    (() => {
      const input = cloneInput();
      input.intent.verticalId = "core";
      return resolveChatVerticalImobRuntimeShadowState(input);
    })(),
  ];

  for (const state of states) {
    assert.equal(chatVerticalImobRuntimeShadowStateSchema.safeParse(state).success, true);
    assert.equal(
      chatVerticalImobRuntimeShadowStateSchema.safeParse({
        ...(state as Record<string, unknown>),
        tenantId: "tenant-must-not-cross-public-boundary",
      }).success,
      false,
    );
  }
});

test("PR8A: runtime shadow state never leaks tenant, workspace, governance, refs or sensitive content", () => {
  const handoffState = resolveChatVerticalImobRuntimeShadowState(cloneInput());
  const clarificationInput = cloneInput();
  clarificationInput.confidenceSignals.competingIntent = true;
  const clarificationState = resolveChatVerticalImobRuntimeShadowState(clarificationInput);

  for (const state of [handoffState, clarificationState]) {
    const serialized = JSON.stringify(state);
    for (const forbidden of [
      "tenantId",
      "workspaceId",
      "governance",
      "refs",
      "tenant-imob-runtime-shadow-test",
      "workspace-imob-runtime-shadow-test",
      "conversation-imob-runtime-shadow-test",
      "thread-imob-runtime-shadow-test",
      "secret",
      "prompt",
      "response",
      "rawDocument",
      "documentBody",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
});

test("PR8A: all runtime shadow states preserve zero side effects", () => {
  const high = resolveChatVerticalImobRuntimeShadowState(cloneInput());
  const mediumInput = cloneInput();
  mediumInput.confidenceSignals.competingIntent = true;
  const medium = resolveChatVerticalImobRuntimeShadowState(mediumInput);
  const blockedInput = cloneInput();
  blockedInput.governance.policy.decision = "denied";
  const blocked = resolveChatVerticalImobRuntimeShadowState(blockedInput);
  const nonImobInput = cloneInput();
  nonImobInput.intent.verticalId = "core";
  const nonImob = resolveChatVerticalImobRuntimeShadowState(nonImobInput);

  assert.deepEqual(
    [high.sideEffects, medium.sideEffects, blocked.sideEffects, nonImob.sideEffects],
    [0, 0, 0, 0],
  );
});
