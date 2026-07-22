import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";

import {
  CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH,
  chatVerticalImobRuntimeShadowRouter,
} from "../routes/chatVerticalImobRuntimeShadow";
import { chatVerticalImobRuntimeShadowStateSchema } from "../resolvers/chatVerticalImobRuntimeShadow";

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(chatVerticalImobRuntimeShadowRouter);
  return app;
}

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-runtime-shadow-route-test-1",
  scope: {
    tenantId: "tenant-imob-runtime-shadow-route-test",
    workspaceId: "workspace-imob-runtime-shadow-route-test",
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
  handoffId: "handoff-imob-runtime-shadow-route-test",
  refs: {
    conversationId: "conversation-imob-runtime-shadow-route-test",
    threadId: "thread-imob-runtime-shadow-route-test",
  },
  governance: {
    tenantId: "tenant-imob-runtime-shadow-route-test",
    workspaceId: "workspace-imob-runtime-shadow-route-test",
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

test("route: POST high confidence request resolves to stage=handoff, 200, schema-valid", async () => {
  const app = buildTestApp();
  const res = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(cloneRequest());

  assert.equal(res.status, 200);
  assert.equal(res.body.kind, "chat.vertical_runtime_shadow_state.v1");
  assert.equal(res.body.verticalId, "imob");
  assert.equal(res.body.stage, "handoff");
  assert.equal(res.body.source, "runtime_shadow");
  assert.equal(res.body.sideEffects, 0);
  assert.equal(res.body.handoff.source, "high_confidence");
  assert.equal(chatVerticalImobRuntimeShadowStateSchema.safeParse(res.body).success, true);
});

test("route: POST medium confidence request resolves to stage=clarification, 200", async () => {
  const app = buildTestApp();
  const request = cloneRequest();
  request.confidenceSignals.competingIntent = true;

  const res = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(request);

  assert.equal(res.status, 200);
  assert.equal(res.body.stage, "clarification");
  assert.equal(res.body.sideEffects, 0);
});

test("route: POST confirm_inventory_preview reply on a medium request resolves to stage=handoff", async () => {
  const app = buildTestApp();
  const request: Record<string, unknown> = cloneRequest();
  (request.confidenceSignals as { competingIntent: boolean }).competingIntent = true;
  request.reply = "confirm_inventory_preview";

  const res = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(request);

  assert.equal(res.status, 200);
  assert.equal(res.body.stage, "handoff");
  assert.equal(res.body.handoff.source, "clarification_confirmed");
});

test("route: POST refine/cancel/missing reply on a medium request keeps stage=clarification", async () => {
  const app = buildTestApp();
  for (const reply of ["refine_inventory_intent", "cancel_vertical_switch", undefined]) {
    const request: Record<string, unknown> = cloneRequest();
    (request.confidenceSignals as { competingIntent: boolean }).competingIntent = true;
    if (reply !== undefined) request.reply = reply;

    const res = await supertest(app)
      .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
      .send(request);

    assert.equal(res.status, 200);
    assert.equal(res.body.stage, "clarification", `reply=${String(reply)}`);
  }
});

test("route: POST governance denial resolves to stage=blocked with a safe reasonCode, 200", async () => {
  const app = buildTestApp();
  const request: Record<string, unknown> = cloneRequest();
  (request.governance as { policy: { decision: string } }).policy.decision = "denied";

  const res = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(request);

  assert.equal(res.status, 200);
  assert.equal(res.body.stage, "blocked");
  assert.match(res.body.reasonCode, /^[A-Z][A-Z0-9_]*$/);
  assert.equal(res.body.reasonCode, "VERTICAL_POLICY_DENIED");
  assert.equal(res.body.sideEffects, 0);
});

test("route: POST low confidence and non-IMOB requests resolve to stage=not_applicable, 200", async () => {
  const app = buildTestApp();
  const low: Record<string, unknown> = cloneRequest();
  low.confidenceSignals = { verticalEvidence: "contextual", capabilityEvidence: "absent", competingIntent: false };
  const nonImob: Record<string, unknown> = cloneRequest();
  (nonImob.intent as { verticalId: string }).verticalId = "core";

  for (const request of [low, nonImob]) {
    const res = await supertest(app)
      .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
      .send(request);
    assert.equal(res.status, 200);
    assert.equal(res.body.stage, "not_applicable");
    assert.equal(res.body.sideEffects, 0);
  }
});

test("route: POST malformed/foreign bodies fail closed into a 200 blocked shadow state, never 500", async () => {
  const app = buildTestApp();
  const malformedBodies = [
    {},
    { ...cloneRequest(), handoffId: "" },
    { ...cloneRequest(), intent: undefined },
    { ...cloneRequest(), governance: undefined },
    { ...cloneRequest(), extraField: "must-not-be-accepted" },
    { ...cloneRequest(), source: "shadow" },
    { ...cloneRequest(), mode: "critical_action" },
    { ...cloneRequest(), outcome: "allowed" },
  ];

  for (const body of malformedBodies) {
    const res = await supertest(app)
      .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
      .send(body);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      kind: "chat.vertical_runtime_shadow_state.v1",
      verticalId: "imob",
      stage: "blocked",
      source: "runtime_shadow",
      reasonCode: "IMOB_RUNTIME_SHADOW_REQUEST_INVALID",
      sideEffects: 0,
    });
  }
});

test("route: POST metadata (selectedVertical/routeIntent) in the body cannot authorize a handoff", async () => {
  const app = buildTestApp();
  const request: Record<string, unknown> = cloneRequest();
  (request.intent as { verticalId: string; label?: string }).verticalId = "core";
  (request.intent as { verticalId: string; label?: string }).label = "IMOB";
  request.selectedVertical = "imob";
  request.routeIntent = "imob.inventory.preview";

  const res = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(request);

  assert.equal(res.status, 200);
  assert.equal(res.body.stage, "blocked");
  assert.equal(res.body.reasonCode, "IMOB_RUNTIME_SHADOW_REQUEST_INVALID");
});

test("route: GET on the shadow path is not registered (only POST is exposed)", async () => {
  const app = buildTestApp();
  const res = await supertest(app).get(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH);
  assert.equal(res.status, 404);
});

test("route: response body never leaks tenant, workspace, governance, refs or sensitive content", async () => {
  const app = buildTestApp();
  const handoffRes = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(cloneRequest());
  const clarificationRequest = cloneRequest();
  clarificationRequest.confidenceSignals.competingIntent = true;
  const clarificationRes = await supertest(app)
    .post(CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH)
    .send(clarificationRequest);

  for (const res of [handoffRes, clarificationRes]) {
    const serialized = JSON.stringify(res.body);
    for (const forbidden of [
      "tenantId",
      "workspaceId",
      "governance",
      "refs",
      "tenant-imob-runtime-shadow-route-test",
      "workspace-imob-runtime-shadow-route-test",
      "conversation-imob-runtime-shadow-route-test",
      "thread-imob-runtime-shadow-route-test",
      "prompt",
      "response",
      "rawDocument",
      "documentBody",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
});
