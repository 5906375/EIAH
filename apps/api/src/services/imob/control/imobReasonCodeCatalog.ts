export type ImobReasonCode =
  | "COMMERCIAL_PRIORITY"
  | "FOLLOW_UP_DISCIPLINE"
  | "DOCUMENT_BLOCKER"
  | "FINANCIAL_BLOCKER"
  | "AUDIT_BLOCKER";

export type ImobReasonCodeSpec = {
  code: ImobReasonCode;
  label: string;
  category: "commercial" | "operations" | "legal" | "financial" | "audit";
  defaultUrgency: "low" | "medium" | "high";
  defaultSpecialist: "I_BC" | "Diarias" | "J_360" | "fin-nexus" | "guardian";
  requiresApproval: boolean;
  requiresEvidence: boolean;
};

export const IMOB_REASON_CODE_CATALOG: Record<ImobReasonCode, ImobReasonCodeSpec> = {
  COMMERCIAL_PRIORITY: {
    code: "COMMERCIAL_PRIORITY",
    label: "Prioridade comercial",
    category: "commercial",
    defaultUrgency: "medium",
    defaultSpecialist: "I_BC",
    requiresApproval: false,
    requiresEvidence: false,
  },
  FOLLOW_UP_DISCIPLINE: {
    code: "FOLLOW_UP_DISCIPLINE",
    label: "Disciplina de follow-up",
    category: "operations",
    defaultUrgency: "medium",
    defaultSpecialist: "Diarias",
    requiresApproval: false,
    requiresEvidence: false,
  },
  DOCUMENT_BLOCKER: {
    code: "DOCUMENT_BLOCKER",
    label: "Bloqueio documental",
    category: "legal",
    defaultUrgency: "high",
    defaultSpecialist: "J_360",
    requiresApproval: false,
    requiresEvidence: false,
  },
  FINANCIAL_BLOCKER: {
    code: "FINANCIAL_BLOCKER",
    label: "Bloqueio financeiro",
    category: "financial",
    defaultUrgency: "high",
    defaultSpecialist: "fin-nexus",
    requiresApproval: true,
    requiresEvidence: false,
  },
  AUDIT_BLOCKER: {
    code: "AUDIT_BLOCKER",
    label: "Bloqueio de auditoria/evidência",
    category: "audit",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: true,
    requiresEvidence: true,
  },
};

export function isImobReasonCode(value: string | null | undefined): value is ImobReasonCode {
  if (!value) return false;
  return value in IMOB_REASON_CODE_CATALOG;
}
