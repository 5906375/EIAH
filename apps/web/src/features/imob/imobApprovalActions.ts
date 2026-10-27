import type { ImobApprovalContextItem, ImobReasonCode } from "@/lib/api";

/** Destinos e rótulos das ações de aprovação do IMOB (aprovar/delegar/escalar); compartilhados por toda superfície que as oferece. */
export function buildApprovalDelegateTarget(item: ImobApprovalContextItem) {
  if (item.waitingOn === "legal") return "juridico";
  if (item.waitingOn === "finance") return "financeiro";
  if (item.waitingOn === "broker") return "corretor";
  if (item.waitingOn === "lead") return "comercial";
  if (item.waitingOn === "owner") return "captacao";
  return "imob-ops";
}

export function buildApprovalEscalationTarget(item: ImobApprovalContextItem) {
  if (item.reasonCode === "AUDIT_BLOCKER") return "governanca";
  if (item.reasonCode === "FINANCIAL_BLOCKER") return "diretoria-financeira";
  if (item.reasonCode === "DOCUMENT_BLOCKER") return "coordenacao-juridica";
  if (item.reasonCode === "COMMERCIAL_PRIORITY") return "lider-comercial";
  return "lider-operacional";
}

export function reasonCodeLabel(value: ImobReasonCode) {
  if (value === "COMMERCIAL_PRIORITY") return "prioridade comercial";
  if (value === "FOLLOW_UP_DISCIPLINE") return "disciplina de follow-up";
  if (value === "DOCUMENT_BLOCKER") return "bloqueio documental";
  if (value === "FINANCIAL_BLOCKER") return "bloqueio financeiro";
  return "bloqueio de auditoria/evidência";
}

export type ImobApprovalActionKind = "approve" | "delegate" | "escalate";

/** Corpo do `apiPostImobApprovalAction` — o mesmo que o command center envia; o servidor revalida caso, papel e política. */
export function buildImobApprovalActionInput(item: ImobApprovalContextItem, action: ImobApprovalActionKind, origin: string) {
  const delegatedTo = action === "delegate" ? buildApprovalDelegateTarget(item) : undefined;
  const escalationTarget = action === "escalate" ? buildApprovalEscalationTarget(item) : undefined;
  const note = action === "approve"
    ? `Aprovado via ${origin} para ${reasonCodeLabel(item.reasonCode)}.`
    : action === "delegate"
      ? `Delegado via ${origin} para ${delegatedTo}.`
      : `Escalado via ${origin} para ${escalationTarget}.`;
  return {
    caseId: item.caseId,
    action,
    reasonCode: item.reasonCode,
    specialistId: item.specialistId,
    delegatedTo,
    escalationTarget,
    note,
  };
}
