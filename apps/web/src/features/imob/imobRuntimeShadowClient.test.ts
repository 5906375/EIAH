import test from "node:test";
import assert from "node:assert/strict";

import { fetchImobRuntimeShadowState, type ImobRuntimeShadowEngineRequest } from "./imobRuntimeShadowClient.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

const baseRequest: ImobRuntimeShadowEngineRequest = {
  intent: { verticalId: "imob", label: "Untrusted label", capabilityId: "inventory.preview" },
  confidenceSignals: { verticalEvidence: "explicit", capabilityEvidence: "explicit", competingIntent: false },
  registry: {
    version: "vertical.registry.v1",
    registryVersion: "registry-imob-runtime-shadow-client-test-1",
    scope: { tenantId: "tenant-imob-shadow-client-test", workspaceId: "workspace-imob-shadow-client-test" },
    verticals: [
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
  },
  handoffId: "handoff-imob-shadow-client-test",
  refs: { conversationId: "conversation-imob-shadow-client-test", threadId: "thread-imob-shadow-client-test" },
  governance: {
    tenantId: "tenant-imob-shadow-client-test",
    workspaceId: "workspace-imob-shadow-client-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
};

test("returns available:true with the shadow state on a valid 200 response", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "handoff",
        source: "runtime_shadow",
        sideEffects: 0,
        handoff: {
          kind: "chat.vertical_handoff_preflight.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          handoffIntentKey: "imob.inventory.preview.open_context",
          source: "high_confidence",
          allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
          defaultNextAction: "open_context_preview",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  const result = await fetchImobRuntimeShadowState(baseRequest);
  assert.equal(result.available, true);
  if (!result.available) return assert.fail("expected available state");
  assert.equal(result.state.stage, "handoff");
  assert.equal(result.state.handoff?.source, "high_confidence");
});

test("degrades to available:false when the route is disabled (404, default OFF)", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const result = await fetchImobRuntimeShadowState(baseRequest);
  assert.deepEqual(result, { available: false });
});

test("degrades to available:false on a network error without throwing", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const result = await fetchImobRuntimeShadowState(baseRequest);
  assert.deepEqual(result, { available: false });
});

test("degrades to available:false when the response payload does not match the expected shape", async () => {
  for (const malformed of [
    { unexpected: true },
    { kind: "chat.vertical_runtime_shadow_state.v1" },
    { kind: "chat.vertical_runtime_shadow_state.v1", verticalId: "core", stage: "handoff", source: "runtime_shadow", sideEffects: 0 },
    { kind: "chat.vertical_runtime_shadow_state.v1", verticalId: "imob", stage: "unknown_stage", source: "runtime_shadow", sideEffects: 0 },
    { kind: "chat.vertical_runtime_shadow_state.v1", verticalId: "imob", stage: "handoff", source: "runtime_shadow", sideEffects: 1 },
    null,
    "not-an-object",
  ]) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(malformed), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    const result = await fetchImobRuntimeShadowState(baseRequest);
    assert.deepEqual(result, { available: false }, JSON.stringify(malformed));
  }
});

test("posts to the runtime-shadow-state contract path with the request body", async () => {
  let calledUrl = "";
  let calledBody = "";
  globalThis.fetch = (async (input, init) => {
    calledUrl = String(input);
    calledBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "not_applicable",
        source: "runtime_shadow",
        sideEffects: 0,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  await fetchImobRuntimeShadowState(baseRequest);
  assert.match(calledUrl, /\/imob\/chat\/runtime-shadow-state$/);
  assert.match(calledBody, /handoff-imob-shadow-client-test/);
});

test("available response never surfaces tenant, workspace, governance or refs", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "clarification",
        source: "runtime_shadow",
        sideEffects: 0,
        clarification: {
          kind: "chat.vertical_clarification.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          reason: "IMOB_INVENTORY_INTENT_AMBIGUOUS",
          questionKey: "imob.inventory.preview.clarify_intent",
          allowedReplies: ["confirm_inventory_preview", "refine_inventory_intent", "cancel_vertical_switch"],
          defaultReply: "refine_inventory_intent",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  const result = await fetchImobRuntimeShadowState(baseRequest);
  assert.equal(result.available, true);
  const serialized = JSON.stringify(result);
  for (const forbidden of ["tenantId", "workspaceId", "governance", "refs", "prompt", "response", "rawDocument", "documentBody"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
