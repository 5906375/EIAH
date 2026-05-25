import type { ImobCrmCaseContext } from "./imobCrmAgentContract";
import type {
  ImobCaseBlockerV1,
  ImobCaseContextV1,
  ImobCaseMission,
  ImobOwnerSnapshotV1,
  ImobPropertyGoalV1,
  ImobPropertySnapshotV1,
} from "./imobCaseContextContract";
import { resolveCanonicalCaseStateFromLegacy } from "../orchestrator/imobLegacyCompatibilityResolver";
import { buildImobCrmCaseProjection } from "../orchestrator/imobCrmCaseProjection";
import { resolveImobRecoverySnapshot } from "../orchestrator/imobRecoveryResolver";

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

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
  if (params.flow === "listing.activate") return "commercial_activation";
  if (goal === "venda") return "capture_sale_property";
  if (goal === "locacao") return "capture_rental_property";
  if (params.flow === "owner.create" || params.flow === "property.create") return "capture_rental_property";
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

function countPresent(values: Array<unknown>) {
  return values.filter((value) => {
    if (typeof value === "number") return Number.isFinite(value);
    return Boolean(asString(value));
  }).length;
}

function buildLeadReadiness(params: {
  lead?: Record<string, unknown> | null;
}) {
  const lead = params.lead ?? {};
  const coreSignals = [
    asString(lead.id) ?? asString(lead.name) ?? asString(lead.leadName),
    asString(lead.phone) ?? asString(lead.leadPhone),
    normalizeGoal(lead.goal) ?? normalizeGoal(lead.desiredGoal),
    asString(lead.targetCity) ?? asString(lead.desiredCity),
    typeof lead.budgetMaxCents === "number"
      ? lead.budgetMaxCents
      : typeof lead.budgetMax === "number"
        ? lead.budgetMax
        : null,
  ];
  const corePresent = countPresent(coreSignals);
  const discoverySignals = asObject(lead.discoverySignals);
  const discoveryPresent = countPresent([
    discoverySignals?.urgency,
    discoverySignals?.painPoint,
    discoverySignals?.motivation,
    discoverySignals?.budgetFlexibility,
    discoverySignals?.decisionMaker,
    discoverySignals?.timeline,
  ]);
  const readinessScore = Math.max(0, Math.min(100, corePresent * 12 + Math.min(discoveryPresent, 6) * 5));
  const leadReady = corePresent === 5;
  const readinessBand = !corePresent
    ? "UNKNOWN"
    : readinessScore >= 70
      ? "HOT"
      : readinessScore >= 40
        ? "WARM"
        : "COLD";

  return {
    leadReady,
    readinessScore,
    readinessBand,
  };
}

function buildDocumentsSnapshot(params: {
  documentDraft?: Record<string, unknown> | null;
  contractDraft?: Record<string, unknown> | null;
}): ImobOwnerSnapshotV1 | null {
  const documentDraft = params.documentDraft ?? {};
  const contractDraft = params.contractDraft ?? {};
  const referenceId = asString(documentDraft.referenceId) ?? asString(contractDraft.propertyId);
  const explicitStatus = asString(documentDraft.status);
  const packetStatus = asString(contractDraft.documentPacketStatus);
  const status = explicitStatus ?? (packetStatus === "ready" ? "ready" : packetStatus === "pending" ? "pending" : null);

  if (!referenceId && !status) return null;

  return {
    id: referenceId ? `document-package:${referenceId}` : "document-package:pending",
    name: "Pacote documental",
    status,
  };
}

function buildContractSnapshot(params: {
  contractDraft?: Record<string, unknown> | null;
}): ImobOwnerSnapshotV1 | null {
  const draft = params.contractDraft ?? {};
  const propertyId = asString(draft.propertyId);
  const counterpartyName = asString(draft.counterpartyName);
  const contractType = asString(draft.contractType);
  const documentPacketStatus = asString(draft.documentPacketStatus);
  const handoffTarget = asString(draft.handoffTarget);
  const approvalRequired = typeof draft.approvalRequired === "boolean" ? draft.approvalRequired : true;

  if (!propertyId && !counterpartyName && !contractType && !documentPacketStatus && !handoffTarget) return null;

  let status: string | null = "drafting";
  if (documentPacketStatus !== "ready") {
    status = "document_packet_pending";
  } else if (handoffTarget === "LEGAL" && approvalRequired) {
    status = "legal_handoff_pending";
  } else {
    status = "ready_for_signature";
  }

  return {
    id: propertyId && contractType ? `contract:${propertyId}:${contractType}` : null,
    name: counterpartyName ?? propertyId ?? "Contrato em preparação",
    status,
  };
}

function buildCommissionSnapshot(params: {
  commissionDraft?: Record<string, unknown> | null;
}): ImobOwnerSnapshotV1 | null {
  const draft = params.commissionDraft ?? {};
  const dealId = asString(draft.dealId);
  const brokerRef = asString(draft.brokerRef);
  const payoutChannel = asString(draft.payoutChannel);
  const settlementStatus = asString(draft.settlementStatus);
  const amountCents = typeof draft.amountCents === "number" ? draft.amountCents : null;

  if (!dealId && !brokerRef && !payoutChannel && !settlementStatus && amountCents == null) return null;

  return {
    id: settlementStatus === "ready" || settlementStatus === "paid"
      ? `commission:${dealId ?? "pending"}:${brokerRef ?? "pending"}`
      : null,
    name: brokerRef ?? dealId ?? "Comissão em liquidação",
    status: settlementStatus,
  };
}

function buildCampaignSnapshot(params: {
  campaignDraft?: Record<string, unknown> | null;
  listingDraft?: Record<string, unknown> | null;
}): ImobOwnerSnapshotV1 | null {
  const campaignDraft = params.campaignDraft ?? {};
  const listingDraft = params.listingDraft ?? {};

  const propertyId = asString(campaignDraft.propertyId) ?? asString(listingDraft.propertyId);
  const campaignRef = asString(campaignDraft.campaignRef);
  const objective = asString(campaignDraft.objective);
  const approvalRequired = typeof campaignDraft.approvalRequired === "boolean" ? campaignDraft.approvalRequired : true;
  const approvalStatus = asString(campaignDraft.approvalStatus);
  const policyStatus = asString(campaignDraft.policyStatus);
  const consentStatus = asString(campaignDraft.consentStatus);
  const evidenceStatus = asString(campaignDraft.evidenceStatus);
  const activationStatus = asString(campaignDraft.activationStatus);
  const publicationChannels = asStringList(campaignDraft.publicationChannels).length > 0
    ? asStringList(campaignDraft.publicationChannels)
    : asStringList(listingDraft.publicationChannels);

  if (
    !propertyId
    && !campaignRef
    && !objective
    && publicationChannels.length === 0
    && !approvalStatus
    && !policyStatus
    && !consentStatus
    && !evidenceStatus
    && !activationStatus
  ) {
    return null;
  }

  let status: string = "drafting_campaign";
  if (activationStatus === "published" || activationStatus === "sent") {
    status = "published_or_sent";
  } else if (policyStatus === "pending" || consentStatus === "pending" || evidenceStatus === "pending") {
    status = "blocked_by_policy";
  } else if (approvalRequired && approvalStatus !== "approved") {
    status = "awaiting_human_approval";
  } else if ((activationStatus === "ready" || publicationChannels.length > 0) && (propertyId || campaignRef || objective)) {
    status = "ready_to_publish";
  }

  return {
    id: status === "ready_to_publish" || status === "published_or_sent"
      ? (campaignRef ?? `campaign:${propertyId ?? objective ?? "pending"}`)
      : null,
    name: objective ?? campaignRef ?? propertyId ?? "Ativação comercial",
    status,
  };
}

function buildBlockers(params: {
  mission: ImobCaseMission;
  caseContext?: ImobCrmCaseContext | null;
  pendingItems: string[];
  ownerReady: boolean;
  propertyReady: boolean;
  leadReady: boolean;
  leadReadinessScore: number | null;
  ownerLinkedToProperty: boolean;
  documentsReady: boolean;
  commissionReady: boolean;
  campaignStatus?: string | null;
}): ImobCaseBlockerV1[] {
  const blockers: ImobCaseBlockerV1[] = [];
  const rawExistingBlockers = asStringList(
    params.caseContext?.blocker ? [params.caseContext.blocker] : params.caseContext?.["blockers"],
  );
  const structuralCaptureMission = params.mission === "capture_seasonal_property"
    || params.mission === "capture_rental_property"
    || params.mission === "capture_sale_property"
    || (
      params.mission === "case_review"
      && (
        params.caseContext?.flow === "owner.create"
        || params.caseContext?.flow === "property.create"
        || params.caseContext?.flow === "listing.activate"
        || Boolean(params.caseContext?.owner)
        || Boolean(params.caseContext?.property)
      )
    );

  const existingBlockers = rawExistingBlockers.filter((message) => {
    const normalized = normalizeText(message);
    const looksLikeResolvedMarketScanDisambiguation =
      (normalized.includes("multiplas cidades") || normalized.includes("multiplas finalidades"))
      && (
        normalized.includes("cadastro automatico")
        || normalized.includes("varredura de mercado")
        || normalized.includes("imovel")
      )
      && structuralCaptureMission
      && params.propertyReady;

    return !looksLikeResolvedMarketScanDisambiguation;
  });

  for (const [index, message] of existingBlockers.entries()) {
    blockers.push({ code: `legacy_blocker_${index + 1}`, severity: "blocking", message });
  }

  if (structuralCaptureMission && !params.ownerReady) {
    blockers.push({ code: "owner_missing_or_incomplete", severity: "blocking", message: "Proprietário ainda não está completo." });
  }
  if (structuralCaptureMission && !params.propertyReady) {
    blockers.push({ code: "property_missing_or_incomplete", severity: "blocking", message: "Imóvel ainda não está completo." });
  }
  if (structuralCaptureMission && params.ownerReady && params.propertyReady && !params.ownerLinkedToProperty) {
    blockers.push({ code: "owner_property_not_linked", severity: "blocking", message: "O imóvel ainda não está vinculado ao proprietário." });
  }
  if (params.mission === "qualify_lead" && !params.leadReady) {
    blockers.push({ code: "lead_missing_or_incomplete", severity: "blocking", message: "O lead ainda não tem os dados mínimos para avançar com segurança." });
  }
  if (params.mission === "qualify_lead" && params.leadReady && (params.leadReadinessScore ?? 0) < 70) {
    blockers.push({ code: "lead_readiness_below_threshold", severity: "warning", message: "O lead já está completo, mas ainda precisa consolidar readiness comercial antes do próximo handoff." });
  }
  if (params.mission === "prepare_contract" && !params.documentsReady) {
    blockers.push({ code: "document_packet_not_ready", severity: "blocking", message: "O pacote documental ainda não está pronto para seguir com o contrato." });
  }
  if (params.mission === "settle_commission" && !params.commissionReady) {
    blockers.push({ code: "commission_settlement_not_ready", severity: "blocking", message: "A comissão ainda não está pronta para liquidação governada." });
  }
  if (params.mission === "commercial_activation") {
    if (!params.campaignStatus || params.campaignStatus === "drafting_campaign") {
      blockers.push({ code: "campaign_draft_missing_or_incomplete", severity: "blocking", message: "A ativação comercial ainda precisa de objetivo, canal ou contexto mínimo." });
    } else if (params.campaignStatus === "blocked_by_policy") {
      blockers.push({ code: "campaign_policy_or_consent_pending", severity: "blocking", message: "A ativação comercial ainda depende de policy, consentimento ou evidência mínima." });
    } else if (params.campaignStatus === "awaiting_human_approval") {
      blockers.push({ code: "campaign_approval_pending", severity: "blocking", message: "A ativação comercial ainda depende de aprovação humana." });
    }
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
  const documentDraft = asObject(operational.documentDraft);
  const contractDraft = asObject(operational.contractDraft);
  const commissionDraft = asObject(operational.commissionDraft);
  const listingDraft = asObject(operational.listingDraft);
  const campaignDraft = asObject(operational.campaignDraft);
  const operationalMissionContext = asObject(operational.missionContext);
  const owner = buildOwnerSnapshot({ owner: params.caseContext?.owner, ownerDraft });
  const property = buildPropertySnapshot({ property: params.caseContext?.property, propertyDraft });
  const documents = buildDocumentsSnapshot({ documentDraft, contractDraft });
  const contract = buildContractSnapshot({ contractDraft });
  const commission = buildCommissionSnapshot({ commissionDraft });
  const campaign = buildCampaignSnapshot({ campaignDraft, listingDraft });
  const lead = {
    ...(asObject(params.caseContext?.lead) ?? {}),
    ...(leadDraft ?? {}),
  };
  const leadReadiness = buildLeadReadiness({ lead });
  const leadGoal = normalizeGoal(lead?.desiredGoal);
  const propertyGoal = property?.goal ?? null;
  const pendingItems = [
    ...asStringList(params.caseContext?.pendingItems),
    ...asStringList(operational.pendingFields),
  ];
  const pendingFields = asStringList(operational.pendingFields);

  const ownerReady = Boolean(owner && (owner.id || owner.name) && (owner.document || owner.phone || owner.email));
  const propertyReady = Boolean(property && (property.id || (property.propertyType && property.goal && property.city && property.address)));
  const ownerLinkedToProperty = Boolean(owner?.id && property?.ownerId && owner.id === property.ownerId) || Boolean(property?.ownerId && property?.id);
  const documentsReady = documents?.status === "ready";
  const commissionReady = commission?.status === "ready" || commission?.status === "paid";
  const campaignReady = campaign?.status === "ready_to_publish" || campaign?.status === "published_or_sent";
  const seasonalRulesReady = false;
  const mission = asString(operationalMissionContext?.mission) as ImobCaseMission | null
    ?? inferMission({ message: params.message, flow, propertyGoal, leadGoal })
    ?? "case_review";
  const defaultGoal = normalizeGoal(operationalMissionContext?.defaultGoal)
    ?? (mission === "capture_seasonal_property" ? "aluguel_por_temporada" : propertyGoal);

  const baseContext: ImobCaseContextV1 = {
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
        readinessScore: leadReadiness.readinessScore,
        readinessBand: leadReadiness.readinessBand,
        status: asString(lead.status),
      } : null,
      documents,
      campaign,
      contract,
      commission,
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
      leadReady: leadReadiness.leadReady,
      leadReadinessScore: leadReadiness.readinessScore,
      documentsReady,
      seasonalRulesReady,
      operationalReady: ownerReady && propertyReady && ownerLinkedToProperty && documentsReady && (mission !== "capture_seasonal_property" || seasonalRulesReady),
    },
    blockers: buildBlockers({
      mission,
      caseContext: params.caseContext,
      pendingItems,
      ownerReady,
      propertyReady,
      leadReady: leadReadiness.leadReady,
      leadReadinessScore: leadReadiness.readinessScore,
      ownerLinkedToProperty,
      documentsReady,
      commissionReady,
      campaignStatus: campaign?.status ?? null,
    }),
  };

  const operationalReady = (
    mission === "capture_seasonal_property"
    || mission === "capture_rental_property"
    || mission === "capture_sale_property"
  )
    ? ownerReady && propertyReady && ownerLinkedToProperty && documentsReady && (mission !== "capture_seasonal_property" || seasonalRulesReady)
    : mission === "prepare_contract"
      ? contract?.status === "ready_for_signature"
      : mission === "settle_commission"
        ? commission?.status === "paid"
        : mission === "commercial_activation"
          ? campaign?.status === "published_or_sent"
        : false;

  const compatibility = resolveCanonicalCaseStateFromLegacy({
    context: {
      ...baseContext,
      readiness: {
        ...baseContext.readiness,
        operationalReady,
      },
    },
    operational: {
      flow,
      pendingFields,
      nextAction: asString(operational.nextAction),
    },
  });

  const enrichedContext = compatibility.ok
    ? {
        ...baseContext,
        readiness: {
          ...baseContext.readiness,
          operationalReady,
        },
        canonicalCaseState: compatibility.state,
        legacyCompatibility: {
          migratedFromLegacy: compatibility.migrated,
          sourceFlow: compatibility.sourceFlow ?? null,
          sourceMission: compatibility.sourceMission ?? null,
        },
      }
    : baseContext;

  const recoverySnapshot = resolveImobRecoverySnapshot(enrichedContext);
  const projectionContext = {
    ...enrichedContext,
    recoverySnapshot,
  };

  return {
    ...projectionContext,
    crmProjection: buildImobCrmCaseProjection(projectionContext),
  };
}
