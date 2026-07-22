import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";

import {
  CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY,
  isChatVerticalImobRuntimeShadowRouteEnabled,
} from "../routes/chatVerticalImobRuntimeShadowGate";
import {
  CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH,
  chatVerticalImobRuntimeShadowRouter,
} from "../routes/chatVerticalImobRuntimeShadow";

const RUNTIME_SHADOW_MOUNTED_PATH = `/api${CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_STATE_PATH}`;
import { chatVerticalImobRuntimeShadowStateSchema } from "../resolvers/chatVerticalImobRuntimeShadow";

const registry = {
  version: "vertical.registry.v1",
  registryVersion: "registry-imob-runtime-shadow-mount-test-1",
  scope: {
    tenantId: "tenant-imob-runtime-shadow-mount-test",
    workspaceId: "workspace-imob-runtime-shadow-mount-test",
  },
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
};

const validRequest = {
  intent: { verticalId: "imob", label: "Untrusted label", capabilityId: "inventory.preview" },
  confidenceSignals: { verticalEvidence: "explicit", capabilityEvidence: "explicit", competingIntent: false },
  registry,
  handoffId: "handoff-imob-runtime-shadow-mount-test",
  refs: {
    conversationId: "conversation-imob-runtime-shadow-mount-test",
    threadId: "thread-imob-runtime-shadow-mount-test",
  },
  governance: {
    tenantId: "tenant-imob-runtime-shadow-mount-test",
    workspaceId: "workspace-imob-runtime-shadow-mount-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
};

// Mirrors exactly the conditional-mount logic used in apps/api/src/index.ts,
// so this test proves the same gate + router behavior the real app wires,
// without booting the real app (no Postgres/Redis/worker topology needed).
function buildAppWithGate(env: NodeJS.ProcessEnv) {
  const app = express();
  app.use(express.json());
  if (isChatVerticalImobRuntimeShadowRouteEnabled(env)) {
    app.use("/api", chatVerticalImobRuntimeShadowRouter);
  }
  return app;
}

test("gate: defaults to OFF when the env var is absent", () => {
  assert.equal(isChatVerticalImobRuntimeShadowRouteEnabled({}), false);
});

test("gate: is OFF for any value other than the exact literal \"true\"", () => {
  for (const value of ["false", "1", "TRUE", "True", "on", "yes", ""]) {
    assert.equal(
      isChatVerticalImobRuntimeShadowRouteEnabled({ [CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY]: value }),
      false,
      `value=${JSON.stringify(value)}`,
    );
  }
});

test("gate: is ON only for the exact literal \"true\"", () => {
  assert.equal(
    isChatVerticalImobRuntimeShadowRouteEnabled({
      [CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY]: "true",
    }),
    true,
  );
});

test("mount OFF (default): the shadow route is unavailable in the test app", async () => {
  const app = buildAppWithGate({});
  const res = await supertest(app).post(RUNTIME_SHADOW_MOUNTED_PATH).send(validRequest);
  assert.equal(res.status, 404);
});

test("mount OFF (explicit falsy values): the shadow route stays unavailable", async () => {
  for (const value of ["false", "1", "TRUE"]) {
    const app = buildAppWithGate({ [CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY]: value });
    const res = await supertest(app).post(RUNTIME_SHADOW_MOUNTED_PATH).send(validRequest);
    assert.equal(res.status, 404, `value=${value}`);
  }
});

test("mount ON: the shadow route responds with a schema-valid chat.vertical_runtime_shadow_state.v1", async () => {
  const app = buildAppWithGate({ [CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY]: "true" });
  const res = await supertest(app).post(RUNTIME_SHADOW_MOUNTED_PATH).send(validRequest);

  assert.equal(res.status, 200);
  assert.equal(res.body.kind, "chat.vertical_runtime_shadow_state.v1");
  assert.equal(res.body.stage, "handoff");
  assert.equal(res.body.source, "runtime_shadow");
  assert.equal(res.body.sideEffects, 0);
  assert.equal(chatVerticalImobRuntimeShadowStateSchema.safeParse(res.body).success, true);
});

test("mount ON: malformed body still fails closed (never 500) once mounted", async () => {
  const app = buildAppWithGate({ [CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY]: "true" });
  const res = await supertest(app).post(RUNTIME_SHADOW_MOUNTED_PATH).send({});

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    kind: "chat.vertical_runtime_shadow_state.v1",
    verticalId: "imob",
    stage: "blocked",
    source: "runtime_shadow",
    reasonCode: "IMOB_RUNTIME_SHADOW_REQUEST_INVALID",
    sideEffects: 0,
  });
});
