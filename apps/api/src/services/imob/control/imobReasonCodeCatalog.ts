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
  // governance / fail-closed (DATA-03 / Etapa 8 Trilha A)
  "CASE_RESPONSIBLE_REQUIRED",
  "CASE_OWNER_ASSIGNMENT_FORBIDDEN",
  "MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE",
  "RESPONSIBLE_ACTOR_CONTRACT_INVALID",
  // run integrity (DATA-01 Frente B)
  "INVALID_ACTION_TYPE",
  // transition integrity (DATA-02 Opção B)
  "CASE_TRANSITION_EVENT_REQUIRED",
  // directed action confirmation binding
  "PENDING_ACTION_MISSING",
  "PENDING_ACTION_MISMATCH",
  "PENDING_ACTION_EXPIRED",
  "CONFIRMATION_TARGET_AMBIGUOUS",
  "DIRECTED_ACTION_CONTEXT_LOST",
  "DIRECTED_ACTION_ENTITY_MISMATCH",
  "DIRECTED_ACTION_JOURNEY_MISMATCH",
] as const;

export type ImobReasonCode = (typeof IMOB_REASON_CODE_VALUES)[number];

export type ImobReasonCodeSpec = {
  code: ImobReasonCode;
  label: string;
  category: "commercial" | "operations" | "legal" | "financial" | "audit" | "governance";
  defaultUrgency: "low" | "medium" | "high";
  defaultSpecialist: "I_BC" | "Diarias" | "J_360" | "fin-nexus" | "guardian";
  requiresApproval: boolean;
  requiresEvidence: boolean;
  nextAction?: string;
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
  // governance / fail-closed
  CASE_RESPONSIBLE_REQUIRED: {
    code: "CASE_RESPONSIBLE_REQUIRED",
    label: "Responsável pelo caso não atribuído",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "Diarias",
    requiresApproval: false,
    requiresEvidence: false,
    nextAction: "ASSIGN_RESPONSIBLE_MANUALLY",
  },
  CASE_OWNER_ASSIGNMENT_FORBIDDEN: {
    code: "CASE_OWNER_ASSIGNMENT_FORBIDDEN",
    label: "Atribuição de responsável bloqueada pela policy",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: true,
    requiresEvidence: true,
  },
  MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE: {
    code: "MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE",
    label: "Membro sem elegibilidade para responsável",
    category: "governance",
    defaultUrgency: "medium",
    defaultSpecialist: "guardian",
    requiresApproval: true,
    requiresEvidence: false,
  },
  RESPONSIBLE_ACTOR_CONTRACT_INVALID: {
    code: "RESPONSIBLE_ACTOR_CONTRACT_INVALID",
    label: "Contrato canônico de responsável inválido",
    category: "governance",
    defaultUrgency: "medium",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
  // run integrity
  INVALID_ACTION_TYPE: {
    code: "INVALID_ACTION_TYPE",
    label: "Tipo de ação inválido no run",
    category: "governance",
    defaultUrgency: "medium",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: false,
  },
  // transition integrity
  CASE_TRANSITION_EVENT_REQUIRED: {
    code: "CASE_TRANSITION_EVENT_REQUIRED",
    label: "Transição de estado requer evento explícito",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
  PENDING_ACTION_MISSING: {
    code: "PENDING_ACTION_MISSING",
    label: "Ação pendente ausente para confirmação dirigida",
    category: "governance",
    defaultUrgency: "medium",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: false,
  },
  PENDING_ACTION_MISMATCH: {
    code: "PENDING_ACTION_MISMATCH",
    label: "Ação pendente divergente do contexto atual",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
  PENDING_ACTION_EXPIRED: {
    code: "PENDING_ACTION_EXPIRED",
    label: "Ação pendente expirada",
    category: "governance",
    defaultUrgency: "medium",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: false,
  },
  CONFIRMATION_TARGET_AMBIGUOUS: {
    code: "CONFIRMATION_TARGET_AMBIGUOUS",
    label: "Confirmação com alvo ambíguo",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
  DIRECTED_ACTION_CONTEXT_LOST: {
    code: "DIRECTED_ACTION_CONTEXT_LOST",
    label: "Contexto da ação direcionada perdido",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
  DIRECTED_ACTION_ENTITY_MISMATCH: {
    code: "DIRECTED_ACTION_ENTITY_MISMATCH",
    label: "Entidade da ação direcionada divergiu do contexto",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
  DIRECTED_ACTION_JOURNEY_MISMATCH: {
    code: "DIRECTED_ACTION_JOURNEY_MISMATCH",
    label: "Jornada da ação direcionada divergiu do contexto",
    category: "governance",
    defaultUrgency: "high",
    defaultSpecialist: "guardian",
    requiresApproval: false,
    requiresEvidence: true,
  },
};

export function isImobReasonCode(value: string | null | undefined): value is ImobReasonCode {
  if (!value) return false;
  return value in IMOB_REASON_CODE_CATALOG;
}
