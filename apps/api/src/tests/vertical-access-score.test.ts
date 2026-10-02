import assert from "node:assert/strict";
import test from "node:test";

import {
  recommendationForScore,
  scoreVerticalAccess,
  VERTICAL_ACCESS_SCORE_RULE_VERSION,
  type VerticalAccessScoreFacts,
} from "../services/products/verticalAccessScore";
import { isPlatformAdminEmail, readPlatformAdminEmails } from "../services/platformAdmin";
import { decisionRequiresNote } from "../services/products/verticalAccessApproval";

// ADR-011 §2.2–2.3: score por regras fixas e versionadas; administradores por lista fixa.

const healthy: VerticalAccessScoreFacts = {
  billingAccountStatus: "active",
  openDisputes: 0,
  succeededPayments90d: 2,
  failedPayments30d: 0,
  priorRevocations: 0,
  hasActivationResponsible: true,
};

test("score v1: tenant saudável soma 100 e é recomendado, com a versão da regra", () => {
  const result = scoreVerticalAccess(healthy);
  assert.equal(result.score, 100);
  assert.equal(result.recommendation, "recomendado");
  assert.equal(result.ruleVersion, VERTICAL_ACCESS_SCORE_RULE_VERSION);
  assert.equal(result.reasons.filter((reason) => reason.maxPoints > 0).every((reason) => reason.ok), true);
});

test("score v1: cada sinal ruim tira os pontos da sua regra e aparece nos motivos", () => {
  const result = scoreVerticalAccess({
    billingAccountStatus: null,
    openDisputes: 1,
    succeededPayments90d: 0,
    failedPayments30d: 3,
    priorRevocations: 1,
    hasActivationResponsible: false,
  });
  assert.equal(result.score, 0);
  assert.equal(result.recommendation, "nao_recomendado");
  assert.deepEqual(
    result.reasons.filter((reason) => reason.maxPoints > 0 && !reason.ok).map((reason) => reason.rule),
    ["conta_billing_ativa", "sem_disputa_aberta", "pagamento_confirmado", "sem_pagamento_falho_recente", "sem_revogacao_anterior", "responsavel_com_permissao"],
  );
});

test("score v1: o que o sistema ainda não mede aparece como 'não avaliado', sem pontos", () => {
  const invoice = scoreVerticalAccess(healthy).reasons.find((reason) => reason.rule === "fatura_vencida_em_aberto");
  assert.ok(invoice);
  assert.equal(invoice.points, 0);
  assert.match(invoice.message, /Não avaliado/);
});

test("faixas de recomendação: 80+ recomendado, 50–79 revisar, abaixo nao_recomendado", () => {
  assert.equal(recommendationForScore(80), "recomendado");
  assert.equal(recommendationForScore(79), "revisar");
  assert.equal(recommendationForScore(50), "revisar");
  assert.equal(recommendationForScore(49), "nao_recomendado");
});

test("observação obrigatória ao recusar e ao aprovar contra a recomendação", () => {
  assert.equal(decisionRequiresNote("recusar", "recomendado"), true);
  assert.equal(decisionRequiresNote("aprovar", "nao_recomendado"), true);
  assert.equal(decisionRequiresNote("aprovar", "revisar"), false);
  assert.equal(decisionRequiresNote("aprovar", null), false);
});

test("administradores EIAH: lista fixa no servidor; sem lista, ninguém (fail-closed)", () => {
  assert.equal(readPlatformAdminEmails("").size, 0);
  assert.equal(isPlatformAdminEmail("carlos@example.com", ""), false);
  assert.equal(isPlatformAdminEmail("Carlos@Example.com", " carlos@example.com ,outra@example.com"), true);
  assert.equal(isPlatformAdminEmail("intruso@example.com", "carlos@example.com"), false);
  assert.equal(isPlatformAdminEmail(null, "carlos@example.com"), false);
});
