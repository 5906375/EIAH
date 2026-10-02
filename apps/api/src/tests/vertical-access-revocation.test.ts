import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAndEvaluateVerticalHandoff,
  composeVerticalRegistry,
  type VerticalRegistryFacts,
} from "../services/chat/verticalRegistryComposition";
import { decideImobRevocationGate } from "../services/imob/imobRevocationGate";
import { resolveVerticalUsage, revocationRequiresNote } from "../services/products/verticalAccessApproval";

// ADR-011 §2.5: revogação em três modos, sem apagar nada.

test("uso pela liberação: aprovado ou sem registro não restringe; revogado segue o modo", () => {
  assert.equal(resolveVerticalUsage(null), "full");
  assert.equal(resolveVerticalUsage({ status: "aprovado", revocationMode: null }), "full");
  assert.equal(resolveVerticalUsage({ status: "aguardando_humano", revocationMode: null }), "full");
  assert.equal(resolveVerticalUsage({ status: "revogado", revocationMode: "somente_leitura" }), "read_only");
  assert.equal(resolveVerticalUsage({ status: "revogado", revocationMode: null }), "read_only", "padrão: somente leitura");
  assert.equal(resolveVerticalUsage({ status: "revogado", revocationMode: "bloqueio_total" }), "blocked");
  assert.equal(resolveVerticalUsage({ status: "revogado", revocationMode: "sem_nova_ativacao" }), "full");
  assert.equal(resolveVerticalUsage({ status: "revogado", revocationMode: "modo-inventado" }), "blocked", "fail-closed");
});

test("novo pedido ou recusa depois da revogação mantém o modo até a EIAH aprovar de novo", () => {
  assert.equal(resolveVerticalUsage({ status: "aguardando_humano", revocationMode: "bloqueio_total" }), "blocked");
  assert.equal(resolveVerticalUsage({ status: "recusado", revocationMode: "somente_leitura" }), "read_only");
  assert.equal(resolveVerticalUsage({ status: "aprovado", revocationMode: "bloqueio_total" }), "full");
});

test("rotas do IMOB: somente leitura só consulta; bloqueio total nega tudo", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal(decideImobRevocationGate("read_only", method), "allow");
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(decideImobRevocationGate("read_only", method), "IMOB_VERTICAL_READ_ONLY");
    assert.equal(decideImobRevocationGate("full", method), "allow");
  }
  assert.equal(decideImobRevocationGate("blocked", "GET"), "IMOB_VERTICAL_REVOKED");
  assert.equal(decideImobRevocationGate("blocked", "POST"), "IMOB_VERTICAL_REVOKED");
});

test("observação obrigatória ao revogar e ao trocar o modo; restaurar não exige", () => {
  assert.equal(revocationRequiresNote("revogar"), true);
  assert.equal(revocationRequiresNote("alterar_modo"), true);
  assert.equal(revocationRequiresNote("restaurar"), false);
});

const facts = (usage?: "full" | "read_only" | "blocked"): VerticalRegistryFacts => ({
  scope: { tenantId: "tenant-a", workspaceId: "workspace-a" },
  imob: { installationStatus: "active", entitled: true, agentsReady: true, userCanUse: true, usage },
});

test("front door: bloqueio total desliga o IMOB; somente leitura só oferece consulta", () => {
  assert.equal(composeVerticalRegistry(facts()).registry.verticals[1]?.status, "enabled");
  assert.equal(composeVerticalRegistry(facts("blocked")).registry.verticals[1]?.status, "disabled");

  const readOnly = composeVerticalRegistry(facts("read_only"));
  const imob = readOnly.registry.verticals[1];
  assert.equal(imob?.status, "enabled");
  assert.ok(imob && imob.capabilities.length > 0);
  for (const capability of imob?.capabilities ?? []) assert.deepEqual(capability.allowedModes, ["read_only"]);

  const write = buildAndEvaluateVerticalHandoff(readOnly, { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" }, "h1");
  assert.equal(write.ok, false, "escrita negada pela conversa");
  const read = buildAndEvaluateVerticalHandoff(readOnly, { verticalId: "imob", capabilityId: "knowledge.search", mode: "read_only" }, "h2");
  assert.equal(read.ok, true, "consulta continua");
  assert.notEqual(
    composeVerticalRegistry(facts("read_only")).registry.registryVersion,
    composeVerticalRegistry(facts()).registry.registryVersion,
  );
});
