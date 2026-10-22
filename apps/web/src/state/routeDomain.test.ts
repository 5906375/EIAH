import test from "node:test";
import assert from "node:assert/strict";
import { resolveRouteTargetDomain } from "./routeDomain";

const base = { explicitDomain: null, pathname: "/app/chat", sessionDomain: "core" as const, routeChanged: true };

test("a rota decide o domínio quando muda (comportamento anterior preservado)", () => {
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "logistica" }), "logistica");
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "imob" }), "imob");
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "core", sessionDomain: "logistica" as never }), "core", "navegar para ?domain=core volta ao core");
  assert.equal(resolveRouteTargetDomain({ ...base, pathname: "/app/logistica" }), "logistica");
  assert.equal(resolveRouteTargetDomain({ ...base, pathname: "/app/imob/chat" }), "imob");
  assert.equal(resolveRouteTargetDomain({ ...base, sessionDomain: "imob" }), "imob", "sem domínio na URL vale o da sessão");
  assert.equal(resolveRouteTargetDomain({ ...base, sessionDomain: undefined }), undefined);
});

test("handoff autorizado na conversa não é rebaixado ao core pela mesma URL `?domain=core`", () => {
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "core", sessionDomain: "logistica", routeChanged: false }), "logistica");
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "core", sessionDomain: "imob", routeChanged: false }), "imob");
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "core", sessionDomain: "core", routeChanged: false }), "core");
});

test("rotas explícitas de outra vertical continuam mandando mesmo sem mudança de rota", () => {
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "imob", sessionDomain: "logistica", routeChanged: false }), "imob");
  assert.equal(resolveRouteTargetDomain({ ...base, explicitDomain: "logistica", sessionDomain: "imob", routeChanged: false }), "logistica");
});
