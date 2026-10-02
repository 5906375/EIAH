/**
 * ADR-011 §2.2: score do agente verificador para liberar uma vertical.
 *
 * Regras fixas e versionadas sobre sinais objetivos de billing e do workspace. Só lê; nunca
 * aprova (a decisão é sempre de um humano administrador da EIAH). Mudar peso ou regra exige
 * nova versão (`VERTICAL_ACCESS_SCORE_RULE_VERSION`), gravada junto com cada score.
 */

export const VERTICAL_ACCESS_SCORE_RULE_VERSION = "vertical-access-score.v1";

export type VerticalAccessScoreFacts = {
  /** Status da conta de billing do tenant; `null` quando não existe conta. */
  billingAccountStatus: string | null;
  /** Disputas de cobrança ainda abertas no tenant. */
  openDisputes: number;
  /** Pagamentos confirmados (`succeeded`) do tenant nos últimos 90 dias. */
  succeededPayments90d: number;
  /** Pagamentos que falharam (`failed`) do tenant nos últimos 30 dias. */
  failedPayments30d: number;
  /** Liberações deste tenant já revogadas pela EIAH. */
  priorRevocations: number;
  /** O workspace tem alguém que pode ativar (Founder ou `products.activate`). */
  hasActivationResponsible: boolean;
};

export type VerticalAccessRecommendation = "recomendado" | "revisar" | "nao_recomendado";

export type VerticalAccessScoreReason = {
  rule: string;
  ok: boolean;
  points: number;
  maxPoints: number;
  message: string;
};

export type VerticalAccessScore = {
  score: number;
  recommendation: VerticalAccessRecommendation;
  reasons: VerticalAccessScoreReason[];
  ruleVersion: typeof VERTICAL_ACCESS_SCORE_RULE_VERSION;
};

type Rule = {
  rule: string;
  maxPoints: number;
  check: (facts: VerticalAccessScoreFacts) => boolean;
  okMessage: string;
  failMessage: string;
};

const RULES: Rule[] = [
  {
    rule: "conta_billing_ativa",
    maxPoints: 25,
    check: (facts) => facts.billingAccountStatus === "active",
    okMessage: "Conta de billing ativa.",
    failMessage: "Sem conta de billing ativa.",
  },
  {
    rule: "sem_disputa_aberta",
    maxPoints: 20,
    check: (facts) => facts.openDisputes === 0,
    okMessage: "Nenhuma disputa de cobrança aberta.",
    failMessage: "Há disputa de cobrança aberta.",
  },
  {
    rule: "pagamento_confirmado",
    maxPoints: 20,
    check: (facts) => facts.succeededPayments90d > 0,
    okMessage: "Pagamento confirmado nos últimos 90 dias.",
    failMessage: "Nenhum pagamento confirmado nos últimos 90 dias.",
  },
  {
    rule: "sem_pagamento_falho_recente",
    maxPoints: 10,
    check: (facts) => facts.failedPayments30d === 0,
    okMessage: "Nenhum pagamento falhou nos últimos 30 dias.",
    failMessage: "Houve pagamento que falhou nos últimos 30 dias.",
  },
  {
    rule: "sem_revogacao_anterior",
    maxPoints: 10,
    check: (facts) => facts.priorRevocations === 0,
    okMessage: "Nenhuma liberação revogada antes.",
    failMessage: "Já houve liberação revogada neste tenant.",
  },
  {
    rule: "responsavel_com_permissao",
    maxPoints: 15,
    check: (facts) => facts.hasActivationResponsible,
    okMessage: "O workspace tem um responsável que pode ativar verticais.",
    failMessage: "O workspace não tem ninguém que possa ativar verticais.",
  },
];

/**
 * Sinal previsto na ADR-011 que ainda não existe no sistema: as faturas só têm o status
 * `generated` (não há "paga" nem "vencida"). Aparece nos motivos, sem pontos, para o humano
 * saber que não foi avaliado.
 */
const UNAVAILABLE_SIGNALS: VerticalAccessScoreReason[] = [
  {
    rule: "fatura_vencida_em_aberto",
    ok: false,
    points: 0,
    maxPoints: 0,
    message: "Não avaliado: o sistema ainda não registra fatura paga ou vencida.",
  },
];

export function recommendationForScore(score: number): VerticalAccessRecommendation {
  if (score >= 80) return "recomendado";
  if (score >= 50) return "revisar";
  return "nao_recomendado";
}

export function scoreVerticalAccess(facts: VerticalAccessScoreFacts): VerticalAccessScore {
  const reasons = RULES.map((rule) => {
    const ok = rule.check(facts);
    return {
      rule: rule.rule,
      ok,
      points: ok ? rule.maxPoints : 0,
      maxPoints: rule.maxPoints,
      message: ok ? rule.okMessage : rule.failMessage,
    };
  });
  const score = reasons.reduce((total, reason) => total + reason.points, 0);
  return {
    score,
    recommendation: recommendationForScore(score),
    reasons: [...reasons, ...UNAVAILABLE_SIGNALS],
    ruleVersion: VERTICAL_ACCESS_SCORE_RULE_VERSION,
  };
}
