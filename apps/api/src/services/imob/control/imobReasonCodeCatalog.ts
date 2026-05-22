export const IMOB_REASON_CODE_VALUES = [
  "COMMERCIAL_PRIORITY",
  "FOLLOW_UP_DISCIPLINE",
  "DOCUMENT_BLOCKER",
  "FINANCIAL_BLOCKER",
  "AUDIT_BLOCKER",
  "BLOCKERS_PRESENT",
  "PENDING_ITEMS_PRESENT",
  "NEXT_STEP_AVAILABLE",
  "CASE_STATUS_BLOCKED",
] as const;

export type ImobReasonCode = (typeof IMOB_REASON_CODE_VALUES)[number];

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
  BLOCKERS_PRESENT: {
    code: "BLOCKERS_PRESENT",
    label: "Bloqueios presentes",
    category: "operations",
    defaultUrgency: "high",
    defaultSpecialist: "Diarias",
    requiresApproval: false,
    requiresEvidence: false,
  },
  PENDING_ITEMS_PRESENT: {
    code: "PENDING_ITEMS_PRESENT",
    label: "Pendências presentes",
    category: "operations",
    defaultUrgency: "medium",
    defaultSpecialist: "Diarias",
    requiresApproval: false,
    requiresEvidence: false,
  },
  NEXT_STEP_AVAILABLE: {
    code: "NEXT_STEP_AVAILABLE",
    label: "Próximo passo disponível",
    category: "operations",
    defaultUrgency: "low",
    defaultSpecialist: "Diarias",
    requiresApproval: false,
    requiresEvidence: false,
  },
  CASE_STATUS_BLOCKED: {
    code: "CASE_STATUS_BLOCKED",
    label: "Caso bloqueado",
    category: "operations",
    defaultUrgency: "high",
    defaultSpecialist: "Diarias",
    requiresApproval: false,
    requiresEvidence: false,
  },
};

export function isImobReasonCode(value: string | null | undefined): value is ImobReasonCode {
  if (!value) return false;
  return value in IMOB_REASON_CODE_CATALOG;
}
