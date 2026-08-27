import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";

import { governedErrorHandler } from "../middlewares/governedErrorHandler";
import {
  PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH,
  createPreDuimpRuntimeShadowRouter,
  type PreDuimpRuntimeShadowRouterDeps,
} from "../routes/preDuimpRuntimeShadow";
import {
  resolvePreDuimpServerAuthoritySnapshot,
  type PreDuimpAction,
  type PreDuimpServerAuthoritySnapshot,
} from "../services/logistica/control/preDuimpActionCatalog";

// Testes de mount/HTTP para o entrypoint real do PRE_DUIMP. Diferente dos
// testes de contrato puro (pre-duimp-*.contract.test.ts), aqui a rota e
// montada de ponta a ponta (express + supertest), incluindo
// governedErrorHandler — o mesmo posicionamento de producao (index.ts) —
// para provar que erros nao classificados chegam como 500 real e nunca sao
// mascarados como 400.

const IDENTITY = {
  tenantId: "tenant-route-test",
  workspaceId: "workspace-route-test",
  userId: "user-route-test",
  tokenId: "token-route-test",
};

const VALID_CONTEXT = {
  tenantId: IDENTITY.tenantId,
  workspaceId: IDENTITY.workspaceId,
  verticalId: "log",
  recordType: "log.comex_duimp_context",
  recordId: "duimp-context-route-test-1",
};

const withAuthContext: PreDuimpRuntimeShadowRouterDeps["authMiddleware"] = (req, _res, next) => {
  (req as unknown as { authContext: typeof IDENTITY }).authContext = IDENTITY;
  next();
};

const withoutAuthContext: PreDuimpRuntimeShadowRouterDeps["authMiddleware"] = (_req, _res, next) => {
  next();
};

function fullAuthority(action: PreDuimpAction): PreDuimpServerAuthoritySnapshot {
  return resolvePreDuimpServerAuthoritySnapshot({
    requester: { tenantId: IDENTITY.tenantId, workspaceId: IDENTITY.workspaceId },
    grantedScopes: [action],
    installation: {
      tenantId: IDENTITY.tenantId,
      workspaceId: IDENTITY.workspaceId,
      product: "LOGISTICA",
      status: "active",
    },
    hitlApproval: null,
  });
}

function noScopeAuthority(): PreDuimpServerAuthoritySnapshot {
  return resolvePreDuimpServerAuthoritySnapshot({
    requester: { tenantId: IDENTITY.tenantId, workspaceId: IDENTITY.workspaceId },
    grantedScopes: [],
    installation: null,
    hitlApproval: null,
  });
}

function buildTestApp(deps: PreDuimpRuntimeShadowRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use(createPreDuimpRuntimeShadowRouter(deps));
  app.use(governedErrorHandler);
  return app;
}

test("route: POST without authContext returns 401 UNAUTHORIZED", async () => {
  const app = buildTestApp({
    authMiddleware: withoutAuthContext,
    resolveServerAuthority: async () => fullAuthority("log.duimp_context.create"),
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.create", context: VALID_CONTEXT });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("route: POST with an unknown action returns 400 PRE_DUIMP_ACTION_UNKNOWN", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => fullAuthority("log.duimp_context.create"),
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.transmit", context: VALID_CONTEXT });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "PRE_DUIMP_ACTION_UNKNOWN");
});

test("route: POST with scope denied returns 403 with reasonCode PRE_DUIMP_SCOPE_DENIED", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => noScopeAuthority(),
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.create", context: VALID_CONTEXT });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "PRE_DUIMP_SCOPE_DENIED");
  assert.equal(res.body.error.reasonCode, "PRE_DUIMP_SCOPE_DENIED");
});

test("route: POST with a malformed context returns 400 VALIDATION_ERROR with details, not PRE_DUIMP_ACTION_UNKNOWN/500", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => fullAuthority("log.duimp_context.create"),
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.create", context: { ...VALID_CONTEXT, recordId: "" } });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
  assert.ok(res.body.error.details);
});

test("route: POST log.duimp_context.review without HITL approval returns 403 PRE_DUIMP_HITL_REQUIRED", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => fullAuthority("log.duimp_context.review"),
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.review", context: VALID_CONTEXT });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "PRE_DUIMP_HITL_REQUIRED");
});

test("route: POST fully authorized log.duimp_context.create returns 200 authorized_shadow", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => fullAuthority("log.duimp_context.create"),
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.create", context: VALID_CONTEXT });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    ok: true,
    decision: "authorized_shadow",
    action: "log.duimp_context.create",
    mode: "shadow",
    externalTransmissionAllowed: false,
  });
});

test("route: POST with an unexpected dependency failure propagates to governedErrorHandler as 500 INTERNAL_ERROR, never a masked 400", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => {
      throw new Error("simulated unexpected dependency failure");
    },
  });

  const res = await supertest(app)
    .post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH)
    .send({ action: "log.duimp_context.create", context: VALID_CONTEXT });

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { ok: false, reasonCode: "INTERNAL_ERROR" });
});

test("route: GET on the actions path is not registered (only POST is exposed)", async () => {
  const app = buildTestApp({
    authMiddleware: withAuthContext,
    resolveServerAuthority: async () => fullAuthority("log.duimp_context.create"),
  });

  const res = await supertest(app).get(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH);
  assert.equal(res.status, 404);
});
