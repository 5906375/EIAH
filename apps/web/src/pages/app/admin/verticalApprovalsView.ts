import type { VerticalApprovalAdminItem, VerticalRevocationMode } from "@/lib/api";

/**
 * ADR-011 §2.3/§2.6: o que a tela de aprovações mostra. Só apresenta o que o servidor decidiu;
 * a regra de observação obrigatória espelha a do servidor, que continua sendo quem valida.
 */

export type ApprovalTab = "aguardando" | "migracao" | "revogados" | "historico";

export const APPROVAL_TABS: Array<{ key: ApprovalTab; label: string }> = [
  { key: "aguardando", label: "Aguardando decisão" },
  { key: "migracao", label: "Aprovados na migração" },
  { key: "revogados", label: "Revogados" },
  { key: "historico", label: "Histórico" },
];

const OPEN_STATUSES = new Set(["pendente", "em_analise", "aguardando_humano"]);

export function isAwaitingDecision(item: VerticalApprovalAdminItem) {
  return OPEN_STATUSES.has(item.status);
}

const isMigratedApproved = (item: VerticalApprovalAdminItem) => item.source === "migration" && item.status === "aprovado";

export function itemsForTab(items: VerticalApprovalAdminItem[], tab: ApprovalTab) {
  if (tab === "aguardando") return items.filter(isAwaitingDecision);
  if (tab === "migracao") return items.filter(isMigratedApproved);
  if (tab === "revogados") return items.filter((item) => item.status === "revogado");
  return items.filter((item) => !isAwaitingDecision(item) && !isMigratedApproved(item) && item.status !== "revogado");
}

/** ADR-011 §2.5: o administrador escolhe o modo; somente leitura é o padrão. */
export const REVOCATION_MODES: Array<{ key: VerticalRevocationMode; label: string; help: string }> = [
  { key: "somente_leitura", label: "Somente leitura", help: "O cliente consulta os dados, mas não registra nada novo." },
  { key: "bloqueio_total", label: "Bloqueio total", help: "O cliente não acessa a vertical. Os dados ficam preservados." },
  { key: "sem_nova_ativacao", label: "Sem nova ativação", help: "O uso atual continua; só uma nova ativação fica bloqueada." },
];

export function revocationModeLabel(mode: VerticalRevocationMode | null) {
  return REVOCATION_MODES.find((entry) => entry.key === (mode ?? "somente_leitura"))?.label ?? "Somente leitura";
}

/** Revogar só o que está aprovado; trocar o modo ou restaurar só o que está revogado. */
export function revocationActionsFor(item: Pick<VerticalApprovalAdminItem, "status">) {
  if (item.status === "aprovado") return ["revogar"] as const;
  if (item.status === "revogado") return ["alterar_modo", "restaurar"] as const;
  return [] as const;
}

/** Observação obrigatória ao revogar e ao trocar o modo; restaurar não exige. */
export function revocationNoteRequired(action: "revogar" | "alterar_modo" | "restaurar") {
  return action !== "restaurar";
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
