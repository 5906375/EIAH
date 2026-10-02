import test from "node:test";
import assert from "node:assert/strict";
import type { VerticalApprovalAdminItem } from "@/lib/api";
import {
  decidedByLabel,
  itemsForTab,
  noteRequired,
  recommendationLabel,
  revocationActionsFor,
  revocationModeLabel,
  revocationNoteRequired,
} from "./verticalApprovalsView";

const base: VerticalApprovalAdminItem = {
  id: "a1",
  tenantName: "Imobiliária",
  workspaceName: "Principal",
  vertical: "IMOB",
  status: "aguardando_humano",
  source: "request",
  revocationMode: null,
  requestedBy: "Dona",
  requestedAt: null,
  decidedBy: null,
  decidedAt: null,
  note: null,
  score: 55,
  recommendation: "revisar",
  scoreReasons: [],
  scoreRuleVersion: "vertical-access-score.v1",
};

test("abas: aguardando decisão, aprovados na migração, revogados e histórico não se misturam", () => {
  const items: VerticalApprovalAdminItem[] = [
    base,
    { ...base, id: "m1", status: "aprovado", source: "migration", score: null, recommendation: null, decidedBy: "system:migration" },
    { ...base, id: "h1", status: "recusado" },
    { ...base, id: "h2", status: "aprovado" },
    { ...base, id: "r1", status: "revogado", source: "migration", revocationMode: "bloqueio_total" },
  ];
  assert.deepEqual(itemsForTab(items, "aguardando").map((item) => item.id), ["a1"]);
  assert.deepEqual(itemsForTab(items, "migracao").map((item) => item.id), ["m1"]);
  assert.deepEqual(itemsForTab(items, "revogados").map((item) => item.id), ["r1"]);
  assert.deepEqual(itemsForTab(items, "historico").map((item) => item.id), ["h1", "h2"]);
});

test("revogação: ações por estado, modo padrão e observação", () => {
  assert.deepEqual(revocationActionsFor({ status: "aprovado" }), ["revogar"]);
  assert.deepEqual(revocationActionsFor({ status: "revogado" }), ["alterar_modo", "restaurar"]);
  assert.deepEqual(revocationActionsFor({ status: "aguardando_humano" }), []);
  assert.deepEqual(revocationActionsFor({ status: "recusado" }), []);
  assert.equal(revocationModeLabel(null), "Somente leitura");
  assert.equal(revocationModeLabel("bloqueio_total"), "Bloqueio total");
  assert.equal(revocationNoteRequired("revogar"), true);
  assert.equal(revocationNoteRequired("alterar_modo"), true);
  assert.equal(revocationNoteRequired("restaurar"), false);
});

test("observação obrigatória ao recusar e ao aprovar contra a recomendação", () => {
  assert.equal(noteRequired("recusar", base), true);
  assert.equal(noteRequired("aprovar", base), false);
  assert.equal(noteRequired("aprovar", { recommendation: "nao_recomendado" }), true);
  assert.equal(noteRequired("aprovar", { recommendation: null }), false);
});

test("rótulos: sem score e decisor da migração ficam claros", () => {
  assert.equal(recommendationLabel({ ...base, recommendation: null }), "Sem score");
  assert.equal(recommendationLabel(base), "Revisar");
  assert.equal(decidedByLabel("system:migration"), "Migração (já usava antes da liberação)");
  assert.equal(decidedByLabel("admin:carlos@example.com"), "carlos@example.com");
  assert.equal(decidedByLabel(null), null);
});
