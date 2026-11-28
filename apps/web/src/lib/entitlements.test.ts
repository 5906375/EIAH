import test from "node:test";
import assert from "node:assert/strict";
import { isImobInstalled, isImobSurfaceAvailable } from "./entitlements";
import type { AppSessionState } from "@/state/sessionStore";

test("isImobInstalled: IMOB_INSTALLED entitlement true returns true", () => {
  assert.equal(isImobInstalled({ entitlements: { IMOB_INSTALLED: true } }), true);
});

test("isImobInstalled: IMOB_INSTALLED entitlement false returns false", () => {
  assert.equal(isImobInstalled({ entitlements: { IMOB_INSTALLED: false } }), false);
});

test("isImobInstalled: 'IMOB' in installedProducts returns true", () => {
  assert.equal(isImobInstalled({ installedProducts: ["IMOB"] }), true);
});

test("isImobInstalled: 'imob' lowercase in installedProducts returns true", () => {
  assert.equal(isImobInstalled({ installedProducts: ["imob"] }), true);
});

test("isImobInstalled: 'IMOB' with surrounding spaces in installedProducts returns true", () => {
  assert.equal(isImobInstalled({ installedProducts: ["  imob  "] }), true);
});

test("isImobInstalled: unrelated product in installedProducts returns false", () => {
  assert.equal(isImobInstalled({ installedProducts: ["LEGAL"] }), false);
});

test("isImobInstalled: empty session returns false", () => {
  assert.equal(isImobInstalled({}), false);
});

test("isImobInstalled: null entitlements and no products returns false", () => {
  assert.equal(isImobInstalled({ entitlements: null, installedProducts: null }), false);
});

test("isImobInstalled: entitlement false but product present returns true (fallback)", () => {
  assert.equal(
    isImobInstalled({ entitlements: { IMOB_INSTALLED: false }, installedProducts: ["IMOB"] }),
    true,
  );
});

const surfaceSession: Pick<AppSessionState, "activeDomain" | "availableDomains" | "entitlements" | "verticals" | "accessGate"> = {
  activeDomain: "imob",
  availableDomains: ["core", "imob"],
  entitlements: { IMOB_INSTALLED: true },
  verticals: [{ verticalId: "IMOB", label: "IMOB", activeDomain: "imob", installedProduct: "IMOB", enabled: true,
    rolloutStage: "operationalized", frontDoorSurface: "imob_chat", operationalHubSurface: "imob_dashboard",
    governanceHubSurface: "marketplace", investigationSurfaces: ["runs"], contextSpecRef: "vertical-context-imob.md" }],
  accessGate: null,
};

test("superfície IMOB usa sessão canônica sem depender de mensagens ou REAL_ESTATE_CORE legado", () => {
  assert.equal(isImobSurfaceAvailable(surfaceSession), true);
  assert.equal(isImobSurfaceAvailable({ ...surfaceSession, entitlements: { IMOB_INSTALLED: true, REAL_ESTATE_CORE: false } }), true);
});

const deniedSessions: Array<[string, Parameters<typeof isImobSurfaceAvailable>[0]]> = [
  ["core com instalação ativa", { ...surfaceSession, activeDomain: "core" }],
  ["domínio ausente", { ...surfaceSession, activeDomain: undefined }],
  ["instalação ausente/revogada", { ...surfaceSession, entitlements: { IMOB_INSTALLED: false } }],
  ["somente alias legado de policy/marketplace", { ...surfaceSession, entitlements: { REAL_ESTATE_CORE: true } }],
  ["entitlements ausentes", { ...surfaceSession, entitlements: undefined }],
  ["domínio indisponível", { ...surfaceSession, availableDomains: ["core"] }],
  ["domínios não confirmados", { ...surfaceSession, availableDomains: undefined }],
  ["vertical desabilitada", { ...surfaceSession, verticals: surfaceSession.verticals!.map((vertical) => ({ ...vertical, enabled: false })) }],
  ["vertical não registrada", { ...surfaceSession, verticals: [] }],
  ["vertical não confirmada", { ...surfaceSession, verticals: undefined }],
  ["403 conhecido com flags anteriores positivas", { ...surfaceSession, accessGate: { reasonCode: "IMOB_ENTITLEMENT_MISSING" } }],
];
for (const [label, session] of deniedSessions) {
  test(`superfície fail-closed: ${label}`, () => assert.equal(isImobSurfaceAvailable(session), false));
}

test("lista persistida de produtos não sobrepõe instalação ausente nem cria superfície antes da hidratação", () => {
  const stale = { ...surfaceSession, installedProducts: ["IMOB"], entitlements: { IMOB_INSTALLED: false } };
  assert.equal(isImobInstalled(stale), true, "compatibilidade do helper legado preservada");
  assert.equal(isImobSurfaceAvailable(stale), false);
  assert.equal(isImobSurfaceAvailable({ activeDomain: "imob" }), false);
});
