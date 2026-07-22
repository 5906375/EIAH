import test from "node:test";
import assert from "node:assert/strict";

import {
  chatVerticalImobRuntimeShadowEngineRequestSchema,
  resolveChatVerticalImobRuntimeShadowEngineState,
} from "../resolvers/chatVerticalImobRuntimeShadowEngine";
import { chatVerticalImobRuntimeShadowStateSchema } from "../resolvers/chatVerticalImobRuntimeShadow";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-runtime-shadow-engine-test-1",
  scope: {
    tenantId: "tenant-imob-runtime-shadow-engine-test",
    workspaceId: "workspace-imob-runtime-shadow-engine-test",
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

const baseRequest = {
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
  handoffId: "handoff-imob-runtime-shadow-engine-test",
  refs: {
    conversationId: "conversation-imob-runtime-shadow-engine-test",
    threadId: "thread-imob-runtime-shadow-engine-test",
  },
  governance: {
    tenantId: "tenant-imob-runtime-shadow-engine-test",
    workspaceId: "workspace-imob-runtime-shadow-engine-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
};

function cloneRequest(): typeof baseRequest {
  return JSON.parse(JSON.stringify(baseRequest));
}

test("engine contract: valid request schema round-trips the base fixture", () => {
  const result = chatVerticalImobRuntimeShadowEngineRequestSchema.safeParse(cloneRequest());
  assert.equal(result.success, true);
});

test("engine contract: request schema rejects source/mode/outcome overrides at the boundary", () => {
  for (const extra of [{ source: "shadow" }, { mode: "critical_action" }, { outcome: "allowed" }]) {
    const result = chatVerticalImobRuntimeShadowEngineRequestSchema.safeParse({
      ...cloneRequest(),
      ...extra,
    });
    assert.equal(result.success, false);
  }
});

test("engine: high confidence request resolves to stage=handoff", () => {
  const state = resolveChatVerticalImobRuntimeShadowEngineState(cloneRequest());

  assert.equal(state.stage, "handoff");
  assert.equal(state.kind, "chat.vertical_runtime_shadow_state.v1");
  assert.equal(state.verticalId, "imob");
  assert.equal(state.source, "runtime_shadow");
  assert.equal(state.sideEffects, 0);
  if (state.stage !== "handoff") assert.fail("expected handoff stage");
  assert.equal(state.handoff.source, "high_confidence");
  assert.equal(chatVerticalImobRuntimeShadowStateSchema.safeParse(state).success, true);
});

test("engine: medium confidence request resolves to stage=clarification", () => {
  const request = cloneRequest();
  request.confidenceSignals.competingIntent = true;

  const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
  assert.equal(state.stage, "clarification");
});

test("engine: confirm_inventory_preview reply on a medium request resolves to stage=handoff", () => {
  const request: Record<string, unknown> = cloneRequest();
  (request.confidenceSignals as { competingIntent: boolean }).competingIntent = true;
  request.reply = "confirm_inventory_preview";

  const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
  assert.equal(state.stage, "handoff");
  if (state.stage !== "handoff") assert.fail("expected handoff stage");
  assert.equal(state.handoff.source, "clarification_confirmed");
});

test("engine: refine/cancel/missing reply on a medium request keeps stage=clarification", () => {
  for (const reply of ["refine_inventory_intent", "cancel_vertical_switch", undefined]) {
    const request: Record<string, unknown> = cloneRequest();
    (request.confidenceSignals as { competingIntent: boolean }).competingIntent = true;
    if (reply !== undefined) request.reply = reply;

    const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
    assert.equal(state.stage, "clarification", `reply=${String(reply)}`);
  }
});

test("engine: governance denial resolves to stage=blocked with a safe reasonCode", () => {
  const request: Record<string, unknown> = cloneRequest();
  (request.governance as { policy: { decision: string } }).policy.decision = "denied";

  const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
  assert.equal(state.stage, "blocked");
  if (state.stage !== "blocked") assert.fail("expected blocked stage");
  assert.match(state.reasonCode, /^[A-Z][A-Z0-9_]*$/);
  assert.equal(state.reasonCode, "VERTICAL_POLICY_DENIED");
});

test("engine: low confidence and non-IMOB requests resolve to stage=not_applicable", () => {
  const low: Record<string, unknown> = cloneRequest();
  low.confidenceSignals = { verticalEvidence: "contextual", capabilityEvidence: "absent", competingIntent: false };
  const nonImob: Record<string, unknown> = cloneRequest();
  (nonImob.intent as { verticalId: string }).verticalId = "core";

  for (const request of [low, nonImob]) {
    const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
    assert.equal(state.stage, "not_applicable");
    assert.equal(state.sideEffects, 0);
  }
});

test("engine: malformed/foreign request payloads fail closed into a blocked shadow state without throwing", () => {
  for (const request of [
    null,
    undefined,
    "confirm_inventory_preview",
    42,
    [],
    {},
    { ...cloneRequest(), handoffId: "" },
    { ...cloneRequest(), intent: undefined },
    { ...cloneRequest(), governance: undefined },
    { ...cloneRequest(), extraField: "must-not-be-accepted" },
    { ...cloneRequest(), source: "shadow" },
    { ...cloneRequest(), mode: "critical_action" },
    { ...cloneRequest(), outcome: "allowed" },
  ]) {
    const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
    assert.deepEqual(state, {
      kind: "chat.vertical_runtime_shadow_state.v1",
      verticalId: "imob",
      stage: "blocked",
      source: "runtime_shadow",
      reasonCode: "IMOB_RUNTIME_SHADOW_REQUEST_INVALID",
      sideEffects: 0,
    });
  }
});

test("engine: metadata (selectedVertical/routeIntent/label) embedded in the request cannot authorize a handoff", () => {
  const request: Record<string, unknown> = cloneRequest();
  (request.intent as { verticalId: string; label?: string }).verticalId = "core";
  (request.intent as { verticalId: string; label?: string }).label = "IMOB";
  request.selectedVertical = "imob";
  request.routeIntent = "imob.inventory.preview";

  const state = resolveChatVerticalImobRuntimeShadowEngineState(request);
  // The extra top-level fields are rejected by the strict request schema,
  // so this must fail closed rather than silently ignore the unknown keys.
  assert.equal(state.stage, "blocked");
  if (state.stage !== "blocked") assert.fail("expected blocked stage");
  assert.equal(state.reasonCode, "IMOB_RUNTIME_SHADOW_REQUEST_INVALID");
});

test("engine: every reachable state is public, redigido and schema-valid", () => {
  const handoff = resolveChatVerticalImobRuntimeShadowEngineState(cloneRequest());
  const mediumRequest = cloneRequest();
  mediumRequest.confidenceSignals.competingIntent = true;
  const clarification = resolveChatVerticalImobRuntimeShadowEngineState(mediumRequest);
  const blockedRequest = cloneRequest();
  blockedRequest.governance.policy.decision = "denied";
  const blocked = resolveChatVerticalImobRuntimeShadowEngineState(blockedRequest);

  for (const state of [handoff, clarification, blocked]) {
    assert.equal(chatVerticalImobRuntimeShadowStateSchema.safeParse(state).success, true);
    const serialized = JSON.stringify(state);
    for (const forbidden of [
      "tenantId",
      "workspaceId",
      "governance",
      "refs",
      "tenant-imob-runtime-shadow-engine-test",
      "workspace-imob-runtime-shadow-engine-test",
      "conversation-imob-runtime-shadow-engine-test",
      "thread-imob-runtime-shadow-engine-test",
      "prompt",
      "response",
      "rawDocument",
      "documentBody",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
});
