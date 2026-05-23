type LeadLikeDraft = {
  leadName?: unknown;
  leadPhone?: unknown;
  desiredGoal?: unknown;
  desiredCity?: unknown;
  budgetMax?: unknown;
};

export type ImobLeadStatus = "draft" | "incomplete" | "qualified" | "blocked";
export type ImobLeadNextAction =
  | "ask_missing_lead_field"
  | "link_lead_to_property"
  | "advance_commercial_step"
  | "consult_case";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function buildCanonicalLeadPendingFields(draft: LeadLikeDraft) {
  const pending: string[] = [];
  if (!asString(draft.leadName)) pending.push("leadName");
  if (!asString(draft.leadPhone)) pending.push("leadPhone");
  if (!asString(draft.desiredGoal)) pending.push("desiredGoal");
  if (!asString(draft.desiredCity)) pending.push("desiredCity");
  if (!Number.isFinite(Number(draft.budgetMax))) pending.push("budgetMax");
  return pending;
}

export function deriveLeadStatus(params: {
  pendingFields: string[];
  leadDraft?: LeadLikeDraft | null;
  blocked?: boolean;
}): ImobLeadStatus {
  if (params.blocked) return "blocked";
  if (params.pendingFields.length === 0) return "qualified";

  const leadDraft = params.leadDraft ?? null;
  const hasAnyDraftSignal = Boolean(
    asString(leadDraft?.leadName)
      || asString(leadDraft?.leadPhone)
      || asString(leadDraft?.desiredGoal)
      || asString(leadDraft?.desiredCity)
      || Number.isFinite(Number(leadDraft?.budgetMax)),
  );
  return hasAnyDraftSignal ? "incomplete" : "draft";
}

export function deriveLeadNextAction(params: {
  leadStatus: ImobLeadStatus;
  propertyId?: string | null;
  preferConsultCase?: boolean;
}): ImobLeadNextAction {
  if (params.preferConsultCase) return "consult_case";
  if (params.leadStatus === "draft" || params.leadStatus === "incomplete" || params.leadStatus === "blocked") {
    return "ask_missing_lead_field";
  }
  if (!asString(params.propertyId)) return "link_lead_to_property";
  return "advance_commercial_step";
}

export function mapLeadNextActionToInputHint(nextAction: ImobLeadNextAction) {
  switch (nextAction) {
    case "ask_missing_lead_field":
      return "completar dados pendentes do lead";
    case "link_lead_to_property":
      return "vincular o lead a um imóvel";
    case "advance_commercial_step":
      return "avançar para visita";
    case "consult_case":
      return "consultar caso";
    default:
      return null;
  }
}

export function mapLeadNextActionToLabel(nextAction: ImobLeadNextAction) {
  switch (nextAction) {
    case "ask_missing_lead_field":
      return "Completar qualificação";
    case "link_lead_to_property":
      return "Vincular imóvel";
    case "advance_commercial_step":
      return "Avançar para visita";
    case "consult_case":
      return "Consultar caso";
    default:
      return null;
  }
}

export function mapLeadNextActionToNextStep(nextAction: ImobLeadNextAction) {
  switch (nextAction) {
    case "ask_missing_lead_field":
      return "Completar as pendências restantes do lead.";
    case "link_lead_to_property":
      return "Vincular o lead a um imóvel antes de avançar a etapa comercial.";
    case "advance_commercial_step":
      return "Avançar para visita.";
    case "consult_case":
      return "Consultar o caso atual e confirmar a próxima ação.";
    default:
      return null;
  }
}

export function buildLeadReasonCode(params: {
  leadStatus: ImobLeadStatus;
  nextAction: ImobLeadNextAction;
  pendingFields: string[];
}) {
  if (params.leadStatus === "blocked") return "lead_blocked";
  if (params.pendingFields.length > 0) return "lead_missing_required_fields";
  if (params.nextAction === "link_lead_to_property") return "lead_property_link_missing";
  if (params.nextAction === "advance_commercial_step") return "lead_ready_for_commercial_advance";
  return "lead_consult_case";
}

export function normalizeLeadQualifyOperationalState(
  operationalState: Record<string, unknown> | null | undefined,
  options?: {
    propertyId?: string | null;
    preferConsultCase?: boolean;
    blocked?: boolean;
  },
) {
  const operational = asObject(operationalState);
  if (!operational || asString(operational.flow) !== "lead.qualify") return operationalState;

  const leadDraft = asObject(operational.leadDraft) ?? {};
  const pendingFields = buildCanonicalLeadPendingFields(leadDraft);
  const leadStatus = deriveLeadStatus({
    pendingFields,
    leadDraft,
    blocked: options?.blocked,
  });
  const nextAction = deriveLeadNextAction({
    leadStatus,
    propertyId: options?.propertyId,
    preferConsultCase: options?.preferConsultCase,
  });

  return {
    ...operational,
    status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
    pendingFields,
    leadStatus,
    nextAction,
  };
}

export function extractLeadPropertyId(value: unknown) {
  const operational = asObject(value);
  if (!operational) return null;
  return asString(asObject(operational.visitDraft)?.propertyId)
    ?? asString(asObject(operational.proposalDraft)?.propertyId)
    ?? null;
}

export function hasLeadQualifiedState(value: unknown) {
  const operational = asObject(value);
  if (!operational || asString(operational.flow) !== "lead.qualify") return false;
  return asString(operational.leadStatus) === "qualified" || asStringList(operational.pendingFields).length === 0;
}
