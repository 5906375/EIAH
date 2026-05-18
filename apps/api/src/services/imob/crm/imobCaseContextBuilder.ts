import type { ImobCrmCaseContext } from "./imobCrmAgentContract";
import type {
  ImobCaseBlockerV1,
  ImobCaseContextV1,
  ImobCaseMission,
  ImobOwnerSnapshotV1,
  ImobPropertyGoalV1,
  ImobPropertySnapshotV1,
} from "./imobCaseContextContract";

type BuildImobCaseContextV1Params = {
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  message?: string | null;
  caseContext?: ImobCrmCaseContext | null;
  operational?: Record<string, unknown> | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
}

function normalizeGoal(value: unknown): ImobPropertyGoalV1 | null {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "aluguel_por_temporada" || normalized === "locacao" || normalized === "venda") return normalized;
  return null;
}

function inferMission(params: {
  message?: string | null;
  flow?: string | null;
  propertyGoal?: ImobPropertyGoalV1 | null;
  leadGoal?: ImobPropertyGoalV1 | null;
}): ImobCaseMission | null {
  const normalizedMessage = (params.message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const goal = params.propertyGoal ?? params.leadGoal;
  if (goal === "aluguel_por_temporada" || normalizedMessage.includes("temporada")) return "capture_seasonal_property";
  if (params.flow === "lead.qualify") return "qualify_lead";
  if (params.flow === "visit.schedule") return "schedule_visit";
  if (params.flow === "documents.collect") return "collect_documents";
  if (params.flow === "contract.prepare") return "prepare_contract";
  if (params.flow === "commission.settle") return "settle_commission";
  if (goal === "venda") return "capture_sale_property";
  if (goal === "locacao") return "capture_rental_property";
  if (params.flow === "owner.create" || params.flow === "property.create" || params.flow === "listing.activate") return "capture_rental_property";
  return null;
}

function buildOwnerSnapshot(params: {
  owner?: unknown;
  ownerDraft?: Record<string, unknown> | null;
}): ImobOwnerSnapshotV1 | null {
  const owner = asObject(params.owner) ?? {};
  const draft = params.ownerDraft ?? {};
  const id = asString(owner.id);
  const name = asString(owner.name) ?? asString(draft.ownerName);
  const email = asString(owner.email) ?? asString(draft.ownerEmail);
  const phone = asString(owner.phone) ?? asString(draft.ownerPhone);
  const document = asString(owner.document) ?? asString(draft.ownerDocument);
  if (!id && !name && !email && !phone && !document) return null;
  return {
    id,
    name,
    email,
    phone,
    document,
    status: asString(owner.status),
  };
}

function buildPropertySnapshot(params: {
  property?: unknown;
  propertyDraft?: Record<string, unknown> | null;
}): ImobPropertySnapshotV1 | null {
  const property = asObject(params.property) ?? {};
  const draft = params.propertyDraft ?? {};
  const linkedOwner = asObject(property.owner);
  const id = asString(property.id) ?? asString(draft.propertyId);
  const propertyType = asString(property.propertyType) ?? asString(draft.propertyType);
  const goal = normalizeGoal(property.goal) ?? normalizeGoal(draft.goal);
  const cep = asString(property.cep) ?? asString(draft.cep);
  const city = asString(property.city) ?? asString(draft.city);
  const address = asString(property.address) ?? asString(draft.address);
  const ownerId = asString(property.ownerId) ?? asString(linkedOwner?.id);
  const ownerName = asString(linkedOwner?.name);
  if (!id && !propertyType && !goal && !cep && !city && !address && !ownerId && !ownerName) return null;
  return {
    id,
    name: address ?? id,
    status: asString(property.status),
    propertyType,
    goal,
    cep,
    city,
    address,
    ownerId,
    ownerName,
  };
}

function buildBlockers(params: {
  caseContext?: ImobCrmCaseContext | null;
  pendingItems: string[];
  ownerReady: boolean;
  propertyReady: boolean;
  ownerLinkedToProperty: boolean;
}): ImobCaseBlockerV1[] {
  const blockers: ImobCaseBlockerV1[] = [];
  const existingBlockers = asStringList(params.caseContext?.blocker ? [params.caseContext.blocker] : params.caseContext?.["blockers"]);
  for (const [index, message] of existingBlockers.entries()) {
    blockers.push({ code: `legacy_blocker_${index + 1}`, severity: "blocking", message });
  }
  if (!params.ownerReady) {
    blockers.push({ code: "owner_missing_or_incomplete", severity: "blocking", message: "Proprietário ainda não está completo." });
  }
  if (!params.propertyReady) {
    blockers.push({ code: "property_missing_or_incomplete", severity: "blocking", message: "Imóvel ainda não está completo." });
  }
  if (params.ownerReady && params.propertyReady && !params.ownerLinkedToProperty) {
    blockers.push({ code: "owner_property_not_linked", severity: "blocking", message: "O imóvel ainda não está vinculado ao proprietário." });
  }
  for (const item of params.pendingItems) {
    blockers.push({ code: `pending_${item.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, severity: "warning", message: `Pendência: ${item}.` });
  }
  return blockers;
}

export function buildImobCaseContextV1(params: BuildImobCaseContextV1Params): ImobCaseContextV1 {
  const operational = params.operational ?? {};
  const flow = asString(operational.flow) ?? asString(params.caseContext?.flow);
  const ownerDraft = asObject(operational.ownerDraft);
  const propertyDraft = asObject(operational.propertyDraft);
  const leadDraft = asObject(operational.leadDraft);
  const operationalMissionContext = asObject(operational.missionContext);
  const owner = buildOwnerSnapshot({ owner: params.caseContext?.owner, ownerDraft });
  const property = buildPropertySnapshot({ property: params.caseContext?.property, propertyDraft });
  const lead = asObject(params.caseContext?.lead) ?? leadDraft;
  const leadGoal = normalizeGoal(lead?.desiredGoal);
  const propertyGoal = property?.goal ?? null;
  const pendingItems = [
    ...asStringList(params.caseContext?.pendingItems),
    ...asStringList(operational.pendingFields),
  ];

  const ownerReady = Boolean(owner && (owner.id || owner.name) && (owner.document || owner.phone || owner.email));
  const propertyReady = Boolean(property && (property.id || (property.propertyType && property.goal && property.city && property.address)));
  const ownerLinkedToProperty = Boolean(owner?.id && property?.ownerId && owner.id === property.ownerId) || Boolean(property?.ownerId && property?.id);
  const documentsReady = false;
  const seasonalRulesReady = false;
  const mission = asString(operationalMissionContext?.mission) as ImobCaseMission | null
    ?? inferMission({ message: params.message, flow, propertyGoal, leadGoal })
    ?? "case_review";
  const defaultGoal = normalizeGoal(operationalMissionContext?.defaultGoal)
    ?? (mission === "capture_seasonal_property" ? "aluguel_por_temporada" : propertyGoal);

  return {
    version: "1.0",
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    caseId: params.caseId ?? params.caseContext?.caseId ?? "case-pending",
    missionContext: mission === "case_review" ? undefined : {
      mission,
      defaultGoal,
      startedFromMessage: asString(operationalMissionContext?.startedFromMessage) ?? params.message ?? null,
      recipeId: asString(operationalMissionContext?.recipeId),
      lockedUntilExplicitChange: typeof operationalMissionContext?.lockedUntilExplicitChange === "boolean"
        ? operationalMissionContext.lockedUntilExplicitChange
        : mission === "capture_seasonal_property",
    },
    entities: {
      owner,
      property,
      lead: lead ? {
        id: asString(lead.id),
        name: asString(lead.name) ?? asString(lead.leadName),
        email: asString(lead.email) ?? asString(lead.leadEmail),
        phone: asString(lead.phone) ?? asString(lead.leadPhone),
        desiredGoal: leadGoal,
        desiredCity: asString(lead.desiredCity),
        status: asString(lead.status),
      } : null,
    },
    links: {
      ownerProperty: {
        ownerId: owner?.id ?? null,
        propertyId: property?.id ?? null,
        status: ownerLinkedToProperty ? "linked" : ownerReady && propertyReady ? "missing" : "pending_confirmation",
      },
    },
    readiness: {
      ownerReady,
      propertyReady,
      documentsReady,
      seasonalRulesReady,
      operationalReady: ownerReady && propertyReady && ownerLinkedToProperty && documentsReady && (mission !== "capture_seasonal_property" || seasonalRulesReady),
    },
    blockers: buildBlockers({
      caseContext: params.caseContext,
      pendingItems,
      ownerReady,
      propertyReady,
      ownerLinkedToProperty,
    }),
  };
}
