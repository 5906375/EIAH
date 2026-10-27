import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  buildAndEvaluateVerticalHandoff,
  composeVerticalRegistry,
  projectVerticalRegistryForSurface,
  type VerticalRegistryFacts,
} from "../services/chat/verticalRegistryComposition";
import { verticalRegistryV1Schema } from "../types/chatVerticalHandoffV2Contract";

// EIAH-FD-ADR010-M2: capacidade real da Logística (consulta de contexto) no registry, sem conceder política nem alterar o
// `registryVersion` de propostas de ativação existentes, exceto quando o contexto da Logística está autorizado.

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };
type Log = NonNullable<VerticalRegistryFacts["logistica"]>;
const imobFacts = (over: Partial<VerticalRegistryFacts["imob"]> = {}): VerticalRegistryFacts["imob"] => ({
  installationStatus: "missing", entitled: false, agentsReady: false, userCanUse: false, ...over,
});
const imobActive = { installationStatus: "active" as const, entitled: true, agentsReady: true, userCanUse: true, usage: "full" as const };
const facts = (imob: VerticalRegistryFacts["imob"], logistica?: Log, tenantId = scope.tenantId, workspaceId = scope.workspaceId): VerticalRegistryFacts => ({
  scope: { tenantId, workspaceId }, imob, ...(logistica ? { logistica } : {}),
});
const readLog = { verticalId: "log", capabilityId: "oraculo.context", mode: "read_only" as const };

// `registryVersion` calculado pela função ANTERIOR a M2 (HEAD 3f359f6) para os mesmos fatos (m0/golden-registry-before.json).
const BEFORE_M2 = {
  imobMissingNoLog: "vr1-224437542be9", imobActiveNoLog: "vr1-19b08db2510d", imobReadOnlyNoLog: "vr1-adf4e4231b5c",
  imobInactiveNoLog: "vr1-49b06ddc4ade", logMissing: "vr1-224437542be9", logInstalledDenied: "vr1-00b9de2e1e7d",
  logInactiveDenied: "vr1-00b9de2e1e7d", imobActiveLogDenied: "vr1-e750ce0f46f3", logEnabled: "vr1-08c947248db7", imobActiveLogEnabled: "vr1-096f62eaa61c",
} as const;
// P11: a capacidade somente leitura `crm.case.consult` passou a integrar o IMOB; por isso mudam SÓ as versões de registries que contêm o IMOB.
// Valores determinísticos; o vínculo com a causa é provado abaixo (sem `crm.case.consult` a versão volta ao valor BEFORE_M2).
const AFTER_P11 = {
  imobActiveNoLog: "vr1-e90cac192e70", imobReadOnlyNoLog: "vr1-d3593f787926",
  imobInactiveNoLog: "vr1-e9773ba06cc5", imobActiveLogDenied: "vr1-417ac3359812",
} as const;
const version = (f: VerticalRegistryFacts) => composeVerticalRegistry(f).registry.registryVersion;
const versionWithoutCaseConsult = (f: VerticalRegistryFacts) => {
  const verticals = composeVerticalRegistry(f).registry.verticals.map((entry) =>
    entry.id === "imob" ? { ...entry, capabilities: entry.capabilities.filter((capability) => capability.id !== "crm.case.consult") } : entry);
  return `vr1-${crypto.createHash("sha256").update(JSON.stringify(verticals)).digest("hex").slice(0, 12)}`;
};

test("compatibilidade: a Logística não autorizada não altera a versão; sem o IMOB no registry a versão segue a mesma de antes do M2", () => {
  assert.equal(version(facts(imobFacts())), BEFORE_M2.imobMissingNoLog);
  assert.equal(version(facts(imobFacts(), { installationStatus: "missing", contextAllowed: false })), BEFORE_M2.logMissing);
  assert.equal(version(facts(imobFacts(), { installationStatus: "active", contextAllowed: false })), BEFORE_M2.logInstalledDenied);
  assert.equal(version(facts(imobFacts(), { installationStatus: "inactive", contextAllowed: false })), BEFORE_M2.logInactiveDenied);
});

test("P11: com o IMOB no registry a versão inclui `crm.case.consult` (valores fixados) e só essa capacidade a distingue da anterior", () => {
  const cases: Array<[keyof typeof AFTER_P11, VerticalRegistryFacts]> = [
    ["imobActiveNoLog", facts(imobActive)],
    ["imobReadOnlyNoLog", facts({ ...imobActive, usage: "read_only" })],
    ["imobInactiveNoLog", facts(imobFacts({ installationStatus: "inactive" }))],
    ["imobActiveLogDenied", facts(imobActive, { installationStatus: "active", contextAllowed: false })],
  ];
  for (const [name, f] of cases) {
    assert.equal(version(f), AFTER_P11[name], name);
    assert.equal(version(f), version(f), `${name}: determinística`);
    assert.notEqual(version(f), BEFORE_M2[name], `${name}: difere da versão anterior ao P11`);
    assert.equal(versionWithoutCaseConsult(f), BEFORE_M2[name], `${name}: sem crm.case.consult volta exatamente à versão anterior`);
  }
});

test("com o contexto da Logística autorizado a versão muda (rejeição fail-closed já existente na confirmação), e o estado é a causa", () => {
  const enabled = version(facts(imobFacts(), { installationStatus: "active", contextAllowed: true }));
  assert.notEqual(enabled, BEFORE_M2.logEnabled);
  assert.notEqual(version(facts(imobActive, { installationStatus: "active", contextAllowed: true })), BEFORE_M2.imobActiveLogEnabled);
  assert.notEqual(enabled, version(facts(imobFacts(), { installationStatus: "active", contextAllowed: false })), "autorizar altera a versão (estado mudou)");
  assert.equal(enabled, version(facts(imobFacts(), { installationStatus: "active", contextAllowed: true })), "determinística");
});

test("a entrada log declara só a leitura de contexto e só com o contexto autorizado; nunca promove o estágio", () => {
  const entry = (log: Log) => composeVerticalRegistry(facts(imobFacts(), log)).registry.verticals.find((vertical) => vertical.id === "log")!;
  const enabled = entry({ installationStatus: "active", contextAllowed: true });
  assert.equal(enabled.status, "enabled");
  assert.deepEqual(enabled.capabilities, [{ id: "oraculo.context", allowedModes: ["read_only"] }]);
  assert.equal(enabled.rolloutStage, "context_only");
  assert.deepEqual(enabled.policyGates, ["log.context.read"]);
  assert.deepEqual(enabled.entitlement, { required: true, key: "LOGISTICA_ACTIVE_INSTALLATION" });
  const denied = entry({ installationStatus: "active", contextAllowed: false });
  assert.equal(denied.status, "disabled");
  assert.deepEqual(denied.capabilities, [], "sem autorização não se anuncia capacidade");
  assert.equal(composeVerticalRegistry(facts(imobFacts(), { installationStatus: "missing", contextAllowed: false })).registry.verticals.some((vertical) => vertical.id === "log"), false);
  // capacidades futuras (preparação/evidência/conferência) não são anunciadas
  assert.equal(enabled.capabilities.some((capability) => capability.allowedModes.some((mode) => mode !== "read_only")), false);
  assert.equal(verticalRegistryV1Schema.safeParse(composeVerticalRegistry(facts(imobFacts(), { installationStatus: "active", contextAllowed: true })).registry).success, true);
  const surface = JSON.stringify(projectVerticalRegistryForSurface(composeVerticalRegistry(facts(imobFacts(), { installationStatus: "active", contextAllowed: true })).registry));
  assert.equal(surface.includes("tenant-a") || surface.includes("workspace-a"), false, "a projeção não expõe tenant/workspace");
});

test("handoff para Logística: permitido só com contexto autorizado; todos os demais casos bloqueiam (fail-closed)", () => {
  const allowed = buildAndEvaluateVerticalHandoff(composeVerticalRegistry(facts(imobFacts(), { installationStatus: "active", contextAllowed: true })), readLog, "h1");
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.handoff.vertical.id, "log");
    assert.equal(allowed.handoff.capability.id, "oraculo.context");
    assert.equal(allowed.handoff.outcome, "allowed");
    assert.equal(JSON.stringify(allowed).includes("tenant-a"), false);
  }
  const blocked = (logistica: Log | undefined, request: typeof readLog | Record<string, unknown> = readLog) =>
    buildAndEvaluateVerticalHandoff(composeVerticalRegistry(facts(imobFacts(), logistica)), request as typeof readLog, "h");
  assert.deepEqual(blocked(undefined), { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }, "Logística não instalada");
  assert.deepEqual(blocked({ installationStatus: "missing", contextAllowed: false }), { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
  assert.deepEqual(blocked({ installationStatus: "active", contextAllowed: false }), { ok: false, reasonCode: "VERTICAL_DISABLED" }, "instalada mas sem liberação/vínculo/política");
  assert.deepEqual(blocked({ installationStatus: "inactive", contextAllowed: false }), { ok: false, reasonCode: "VERTICAL_DISABLED" });
  const enabled: Log = { installationStatus: "active", contextAllowed: true };
  assert.deepEqual(blocked(enabled, { ...readLog, capabilityId: "oraculo.preparation" }), { ok: false, reasonCode: "VERTICAL_CAPABILITY_NOT_AVAILABLE" }, "capacidade não declarada");
  assert.deepEqual(blocked(enabled, { ...readLog, mode: "requires_write" }), { ok: false, reasonCode: "VERTICAL_CAPABILITY_NOT_AVAILABLE" }, "escrita não é anunciada");
  assert.deepEqual(blocked(enabled, { ...readLog, mode: "critical_action" }), { ok: false, reasonCode: "VERTICAL_CAPABILITY_NOT_AVAILABLE" });
  assert.deepEqual(blocked(enabled, { ...readLog, verticalId: "logistica" }), { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }, "identidade canônica é `log`");
});

test("isolamento: tenant e workspace incorretos não herdam a autorização de outro escopo", () => {
  const authorized = composeVerticalRegistry(facts(imobFacts(), { installationStatus: "active", contextAllowed: true }, "tenant-a", "workspace-a"));
  const otherWorkspace = composeVerticalRegistry(facts(imobFacts(), { installationStatus: "missing", contextAllowed: false }, "tenant-a", "workspace-b"));
  const otherTenant = composeVerticalRegistry(facts(imobFacts(), { installationStatus: "active", contextAllowed: false }, "tenant-b", "workspace-a"));
  assert.equal(buildAndEvaluateVerticalHandoff(authorized, readLog, "a").ok, true);
  assert.deepEqual(buildAndEvaluateVerticalHandoff(otherWorkspace, readLog, "b"), { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
  assert.deepEqual(buildAndEvaluateVerticalHandoff(otherTenant, readLog, "c"), { ok: false, reasonCode: "VERTICAL_DISABLED" });
  assert.deepEqual(authorized.registry.scope, { tenantId: "tenant-a", workspaceId: "workspace-a" });
  assert.deepEqual(otherTenant.registry.scope, { tenantId: "tenant-b", workspaceId: "workspace-a" });
});

test("governança da Logística é derivada do acesso calculado no servidor; IMOB e core inalterados", () => {
  const composed = composeVerticalRegistry(facts(imobActive, { installationStatus: "active", contextAllowed: true }));
  assert.deepEqual(composed.governance.log, { rbac: "not_required", entitlement: "allowed", policy: "allowed" });
  assert.deepEqual(composeVerticalRegistry(facts(imobActive, { installationStatus: "active", contextAllowed: false })).governance.log, { rbac: "not_required", entitlement: "denied", policy: "denied" });
  assert.equal("log" in composeVerticalRegistry(facts(imobActive)).governance, false);
  assert.deepEqual(composed.governance.imob, { rbac: "allowed", entitlement: "allowed" });
  assert.deepEqual(composed.governance.core, { rbac: "not_required", entitlement: "not_required" });
  // o handoff do IMOB continua permitido e idêntico com ou sem Logística no workspace
  const crmForms = { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const };
  const withLog = buildAndEvaluateVerticalHandoff(composed, crmForms, "h");
  const withoutLog = buildAndEvaluateVerticalHandoff(composeVerticalRegistry(facts(imobActive)), crmForms, "h");
  assert.equal(withLog.ok, true);
  assert.equal(withoutLog.ok, true);
  assert.deepEqual(withLog.ok && withLog.handoff.capability, withoutLog.ok && withoutLog.handoff.capability);
  // sem usuário com permissão do IMOB, o IMOB continua bloqueado mesmo com Logística autorizada
  const noPermission = composeVerticalRegistry(facts({ ...imobActive, userCanUse: false }, { installationStatus: "active", contextAllowed: true }));
  assert.deepEqual(buildAndEvaluateVerticalHandoff(noPermission, crmForms, "h"), { ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" });
});

test("o registry não concede políticas nem ações: a entrada log é só contexto", () => {
  const entry = composeVerticalRegistry(facts(imobFacts(), { installationStatus: "active", contextAllowed: true })).registry.verticals.find((vertical) => vertical.id === "log")!;
  assert.equal(entry.rolloutStage, "context_only");
  assert.deepEqual(entry.rbac, { requiredRoles: [] });
  assert.equal(entry.capabilities.every((capability) => capability.allowedModes.length === 1 && capability.allowedModes[0] === "read_only"), true);
});
