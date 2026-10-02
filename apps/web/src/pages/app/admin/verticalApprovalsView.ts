import type { VerticalApprovalAdminItem } from "@/lib/api";

/**
 * ADR-011 §2.3/§2.6: o que a tela de aprovações mostra. Só apresenta o que o servidor decidiu;
 * a regra de observação obrigatória espelha a do servidor, que continua sendo quem valida.
 */

export type ApprovalTab = "aguardando" | "migracao" | "historico";

export const APPROVAL_TABS: Array<{ key: ApprovalTab; label: string }> = [
  { key: "aguardando", label: "Aguardando decisão" },
  { key: "migracao", label: "Aprovados na migração" },
  { key: "historico", label: "Histórico" },
];

const OPEN_STATUSES = new Set(["pendente", "em_analise", "aguardando_humano"]);

export function isAwaitingDecision(item: VerticalApprovalAdminItem) {
  return OPEN_STATUSES.has(item.status);
}

export function itemsForTab(items: VerticalApprovalAdminItem[], tab: ApprovalTab) {
  if (tab === "aguardando") return items.filter(isAwaitingDecision);
  if (tab === "migracao") return items.filter((item) => item.source === "migration" && item.status === "aprovado");
  return items.filter((item) => !isAwaitingDecision(item) && !(item.source === "migration" && item.status === "aprovado"));
}

export const RECOMMENDATION_LABEL: Record<NonNullable<VerticalApprovalAdminItem["recommendation"]>, string> = {
  recomendado: "Recomendado",
  revisar: "Revisar",
  nao_recomendado: "Não recomendado",
};

export function recommendationLabel(item: VerticalApprovalAdminItem) {
  return item.recommendation ? RECOMMENDATION_LABEL[item.recommendation] : "Sem score";
}

export const STATUS_LABEL: Record<VerticalApprovalAdminItem["status"], string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aguardando_humano: "Aguardando decisão",
  aprovado: "Aprovado",
  recusado: "Recusado",
  revogado: "Revogado",
};

/** Observação obrigatória ao recusar e ao aprovar contra a recomendação do agente. */
export function noteRequired(decision: "aprovar" | "recusar", item: Pick<VerticalApprovalAdminItem, "recommendation">) {
  if (decision === "recusar") return true;
  return item.recommendation === "nao_recomendado";
}

export function decidedByLabel(decidedBy: string | null) {
  if (!decidedBy) return null;
  if (decidedBy === "system:migration") return "Migração (já usava antes da liberação)";
  return decidedBy.replace(/^admin:/, "");
}
