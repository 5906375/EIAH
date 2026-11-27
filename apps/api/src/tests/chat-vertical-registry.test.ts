import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAndEvaluateVerticalHandoff,
  composeVerticalRegistry,
  projectVerticalRegistryForSurface,
  type VerticalRegistryFacts,
} from "../services/chat/verticalRegistryComposition";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };
const facts = (imob: Partial<VerticalRegistryFacts["imob"]> = {}): VerticalRegistryFacts => ({
  scope,
  imob: { installationStatus: "active", entitled: true, agentsReady: true, userCanUse: true, ...imob },
});
const crmForms = { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const };

test("registry: core sempre ativo; IMOB ativo só com instalação, direito de uso e agentes provisionados", () => {
  const ready = composeVerticalRegistry(facts());
  assert.deepEqual(ready.registry.verticals.map((vertical) => [vertical.id, vertical.status]), [["core", "enabled"], ["imob", "enabled"]]);
  assert.equal(composeVerticalRegistry(facts({ agentsReady: false })).registry.verticals[1].status, "disabled");
  assert.equal(composeVerticalRegistry(facts({ installationStatus: "inactive" })).registry.verticals[1].status, "disabled");
  assert.deepEqual(composeVerticalRegistry(facts({ installationStatus: "missing" })).registry.verticals.map((vertical) => vertical.id), ["core"]);
});

test("registryVersion muda quando o estado muda e a projeção não expõe tenant/workspace", () => {
  const enabled = composeVerticalRegistry(facts()).registry;
  const disabled = composeVerticalRegistry(facts({ agentsReady: false })).registry;
  assert.notEqual(enabled.registryVersion, disabled.registryVersion);
  assert.equal(enabled.registryVersion, composeVerticalRegistry(facts()).registry.registryVersion, "determinístico");
  const projected = JSON.stringify(projectVerticalRegistryForSurface(enabled));
  assert.equal(projected.includes("tenant-a") || projected.includes("workspace-a"), false);
});

test("handoff para IMOB permitido devolve só a projeção da superfície", () => {
  const result = buildAndEvaluateVerticalHandoff(composeVerticalRegistry(facts()), { ...crmForms, refs: { threadId: "t1" } }, "h1");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.handoff.vertical.id, "imob");
  assert.equal(result.handoff.vertical.label, "IMOB");
  assert.equal(result.handoff.outcome, "allowed");
  assert.equal(result.handoff.presentation.source, "operational");
  assert.equal(JSON.stringify(result).includes("tenant-a"), false, "governança não vai para a superfície");
});

test("handoff fail-closed: sem permissão, sem direito, vertical desativada, ausente, capacidade ou modo errados", () => {
  const cases: Array<[Partial<VerticalRegistryFacts["imob"]>, Partial<typeof crmForms>, string]> = [
    [{ userCanUse: false }, {}, "VERTICAL_SCOPE_DENIED"],
    [{ entitled: false }, {}, "VERTICAL_DISABLED"],
    [{ agentsReady: false }, {}, "VERTICAL_DISABLED"],
    [{ installationStatus: "missing" }, {}, "VERTICAL_NOT_REGISTERED"],
    [{}, { capabilityId: "crm.delete_all" }, "VERTICAL_CAPABILITY_NOT_AVAILABLE"],
    [{}, { mode: "read_only" as never }, "VERTICAL_CAPABILITY_NOT_AVAILABLE"],
    [{}, { verticalId: "legal" }, "VERTICAL_NOT_REGISTERED"],
    [{}, { verticalId: "custom:x" }, "VERTICAL_NOT_REGISTERED"],
  ];
  for (const [imob, request, reasonCode] of cases) {
    const result = buildAndEvaluateVerticalHandoff(composeVerticalRegistry(facts(imob)), { ...crmForms, ...request } as typeof crmForms, "h");
    assert.deepEqual(result, { ok: false, reasonCode }, JSON.stringify({ imob, request }));
  }
});

test("ação crítica exige HITL aprovado: o front door não abre handoff crítico", () => {
  const composed = composeVerticalRegistry(facts());
  composed.registry.verticals[1].capabilities[0].allowedModes.push("critical_action");
  const result = buildAndEvaluateVerticalHandoff(composed, { ...crmForms, mode: "critical_action" }, "h");
  assert.deepEqual(result, { ok: false, reasonCode: "VERTICAL_HITL_REQUIRED" });
});
