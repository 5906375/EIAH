import type { ImobCrmCaseContext } from "./imobCrmAgentContract";
import type {
  ImobCaseBlockerV1,
  ImobCaseContextV1,
  ImobDocumentChecklistSnapshotV1,
  ImobDocumentSufficiencySnapshotV1,
  ImobDedupeSnapshotV1,
  ImobLeadLifecycleSnapshotV1,
  ImobLeadMatchingSnapshotV1,
  ImobCaseMission,
  ImobMarketScanRecommendationSnapshotV1,
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
  if (params.flow === "proposal.create") return "schedule_visit";
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

function buildLeadMatching(params: {
  lead?: Record<string, unknown> | null;
  property?: ImobPropertySnapshotV1 | null;
  leadReady: boolean;
  leadReadinessScore: number | null;
}): ImobLeadMatchingSnapshotV1 {
  const lead = params.lead ?? {};
  const property = params.property ?? null;
  const desiredGoal = normalizeGoal(lead.desiredGoal) ?? normalizeGoal(lead.goal);
  const desiredCity = asString(lead.desiredCity) ?? asString(lead.targetCity);
  const propertyGoal = property?.goal ?? null;
  const propertyCity = property?.city ?? null;
  const propertyLabel = property?.address ?? property?.name ?? property?.id ?? null;

  if (!params.leadReady || (params.leadReadinessScore ?? 0) < 70) {
    return {
      status: "insufficient_context",
      matchStrength: "unknown",
      propertyId: property?.id ?? null,
      propertyLabel,
      reasonCodes: ["LEAD_READINESS_NOT_READY_FOR_MATCH"],
      summary: "O lead ainda não está pronto para uma sugestão segura de imóvel.",
      recommendedNextMove: "consolidar readiness comercial antes de sugerir estoque",
    };
  }

  if (!property) {
    return {
      status: "awaiting_candidate",
      matchStrength: "unknown",
      propertyId: null,
      propertyLabel: null,
      reasonCodes: ["MATCHING_PROPERTY_CANDIDATE_MISSING"],
      summary: "O lead já está pronto, mas o caso ainda não tem um imóvel candidato explícito para comparação.",
      recommendedNextMove: "buscar imóvel compatível para este lead",
    };
  }

  const conflictingGoal = Boolean(desiredGoal && propertyGoal && desiredGoal !== propertyGoal);
  const conflictingCity = Boolean(desiredCity && propertyCity && desiredCity !== propertyCity);
  if (conflictingGoal || conflictingCity) {
    return {
      status: "no_match",
      matchStrength: "low",
      propertyId: property.id ?? null,
      propertyLabel,
      reasonCodes: [
        conflictingGoal ? "MATCHING_GOAL_CONFLICT" : null,
        conflictingCity ? "MATCHING_CITY_CONFLICT" : null,
      ].filter((item): item is string => Boolean(item)),
      summary: "O imóvel atual entra em conflito com objetivo ou cidade desejada do lead.",
      recommendedNextMove: "revalidar objetivo ou cidade antes de sugerir este imóvel",
    };
  }

  const matchStrength = property.propertyType && property.address ? "high" : "medium";
  return {
    status: "suggested",
    matchStrength,
    propertyId: property.id ?? null,
    propertyLabel,
    reasonCodes: ["MATCHING_GOAL_ALIGNED", "MATCHING_CITY_ALIGNED", "MATCHING_PROPERTY_CONTEXT_AVAILABLE"],
    summary: propertyLabel
      ? `O imóvel ${propertyLabel} já está alinhado com cidade e objetivo do lead.`
      : "O imóvel atual já está alinhado com cidade e objetivo do lead.",
    recommendedNextMove: "vincular lead ao imóvel compatível",
  };
}

function buildLeadLifecycle(params: {
  lead?: Record<string, unknown> | null;
}): ImobLeadLifecycleSnapshotV1 {
  const lead = params.lead ?? {};
  const rawStatus = normalizeText(asString(lead.status) ?? "active");
  const reason = asString(lead.disqualificationReason) ?? asString(lead.blockReason) ?? null;
  const nextTrigger = asString(lead.reengagementTrigger) ?? asString(lead.nextTrigger);

  if (rawStatus === "disqualified" || rawStatus === "blocked") {
    if (nextTrigger) {
      return {
        status: "reengagement_ready",
        reason,
        nextTrigger,
        summary: reason
          ? `Lead desqualificado por ${reason} e já com gatilho de retomada ${nextTrigger}.`
          : `Lead desqualificado e já com gatilho de retomada ${nextTrigger}.`,
      };
    }

    return {
      status: "disqualified",
      reason,
      nextTrigger: null,
      summary: reason
        ? `Lead desqualificado por ${reason}.`
        : "Lead desqualificado e aguardando revisão comercial.",
    };
  }

  return {
    status: "active",
    reason: null,
    nextTrigger: nextTrigger ?? null,
    summary: "Lead ativo na jornada comercial.",
  };
}

function normalizeMarketAction(value: unknown) {
  const normalized = asString(value)?.toLowerCase();
  if (
    normalized === "captar"
    || normalized === "ajustar_preco"
    || normalized === "campanha"
    || normalized === "nao_seguir"
    || normalized === "pedir_documento"
    || normalized === "pedir_autorizacao"
  ) {
    return normalized;
  }
  return null;
}

function mapLiquiditySignal(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unknown";
  if (score >= 0.65) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function buildMarketScanRecommendation(params: {
  operational?: Record<string, unknown> | null;
}): ImobMarketScanRecommendationSnapshotV1 | null {
  const operational = params.operational ?? {};
  const marketScanSnapshot = asObject(operational.marketScanSnapshot) ?? asObject(operational.marketScanResult);
  const marketScanOpportunity = asObject(operational.marketScanOpportunity);
  const sourceStatus = asString(marketScanSnapshot?.sourceStatus);
  const recommendedAction = normalizeMarketAction(marketScanOpportunity?.recommendedAction);
  const nextStep = asString(marketScanOpportunity?.nextStep);

  if (!sourceStatus || !recommendedAction || !nextStep) return null;

  const intelligence = asObject(marketScanSnapshot?.intelligence);
  const priceRange = asObject(marketScanOpportunity?.priceRange) ?? asObject(intelligence?.priceRange);
  const comparableCount = typeof intelligence?.comparableCount === "number" && Number.isFinite(intelligence.comparableCount)
    ? intelligence.comparableCount
    : 0;
  const comparableSources = Array.isArray(intelligence?.comparableSources)
    ? intelligence.comparableSources
        .map((item) => {
          const sourceObj = asObject(item);
          const providerId = asString(sourceObj?.providerId);
          const source = asString(sourceObj?.source);
          const count = typeof sourceObj?.count === "number" && Number.isFinite(sourceObj.count) ? sourceObj.count : null;
          if (!providerId || !source || count == null) return null;
          return { providerId, source, count };
        })
        .filter((item): item is NonNullable<ImobMarketScanRecommendationSnapshotV1["comparableSources"]>[number] => Boolean(item))
    : null;
  const confidenceScore = typeof marketScanOpportunity?.confidenceScore === "number" && Number.isFinite(marketScanOpportunity.confidenceScore)
    ? marketScanOpportunity.confidenceScore
    : typeof intelligence?.confidenceScore === "number" && Number.isFinite(intelligence.confidenceScore)
      ? intelligence.confidenceScore
      : null;
  const confidenceBandRaw = asString(intelligence?.confidenceBand);
  const liquidityScore = typeof marketScanOpportunity?.liquidityScore === "number" && Number.isFinite(marketScanOpportunity.liquidityScore)
    ? marketScanOpportunity.liquidityScore
    : typeof intelligence?.liquidityScore === "number" && Number.isFinite(intelligence.liquidityScore)
      ? intelligence.liquidityScore
      : null;
  const pricingRisk = asString(marketScanOpportunity?.pricingRisk) ?? asString(intelligence?.pricingRisk);

  const summaryByAction: Record<NonNullable<ReturnType<typeof normalizeMarketAction>>, string> = {
    captar: comparableCount > 0
      ? `O scan encontrou base suficiente para seguir com captação, com ${comparableCount} comparável(is) útil(is).`
      : "O scan recomenda seguir com captação usando apenas os sinais já evidenciados.",
    ajustar_preco: "O scan recomenda revisar a estratégia de preço antes de seguir com a captação.",
    campanha: "O scan recomenda ativação comercial governada antes de avançar com nova captação.",
    nao_seguir: "O scan recomenda não seguir agora porque a base de mercado ainda não sustenta uma ação forte.",
    pedir_documento: "O scan recomenda pedir documentação ou evidência adicional antes de avançar.",
    pedir_autorizacao: "O scan recomenda pedir autorização ou fonte adicional antes de executar ação comercial.",
  };

  const reasonCodes = [
    `MARKET_SCAN_ACTION_${recommendedAction.toUpperCase()}`,
    comparableCount === 0 ? "MARKET_SCAN_NO_COMPARABLES" : null,
    priceRange ? "MARKET_SCAN_PRICE_RANGE_AVAILABLE" : "MARKET_SCAN_PRICE_RANGE_MISSING",
  ].filter((item): item is string => Boolean(item));

  return {
    sourceStatus: sourceStatus as ImobMarketScanRecommendationSnapshotV1["sourceStatus"],
    recommendedAction,
    comparableCount,
    comparableSources,
    confidenceScore,
    confidenceBand: (confidenceBandRaw as ImobMarketScanRecommendationSnapshotV1["confidenceBand"]) ?? "unknown",
    liquiditySignal: mapLiquiditySignal(liquidityScore),
    pricingRisk: (pricingRisk as ImobMarketScanRecommendationSnapshotV1["pricingRisk"]) ?? "unknown",
    priceRange: priceRange
      ? {
          min: typeof priceRange.min === "number" ? priceRange.min : 0,
          max: typeof priceRange.max === "number" ? priceRange.max : 0,
          currency: (asString(priceRange.currency) as "BRL" | null) ?? "BRL",
        }
      : null,
    summary: summaryByAction[recommendedAction],
    reasonCodes,
    recommendedNextMove: nextStep,
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

function buildDocumentChecklist(params: {
  mission: ImobCaseMission;
  defaultGoal?: ImobPropertyGoalV1 | null;
  propertyGoal?: ImobPropertyGoalV1 | null;
  documentDraft?: Record<string, unknown> | null;
}): ImobDocumentChecklistSnapshotV1 | null {
  const resolvedGoal = params.propertyGoal ?? params.defaultGoal ?? null;
  const operation = (
    params.mission === "capture_sale_property" || resolvedGoal === "venda"
      ? "venda"
      : params.mission === "capture_seasonal_property" || resolvedGoal === "aluguel_por_temporada"
        ? "temporada"
        : params.mission === "capture_rental_property" || resolvedGoal === "locacao"
          ? "locacao"
          : null
  );

  if (!operation) return null;

  const documentTypes = asStringList(params.documentDraft?.documentTypes).map((item) => normalizeText(item));
  const requirementsByOperation: Record<ImobDocumentChecklistSnapshotV1["operation"], Array<{ label: string; aliases: string[] }>> = {
    venda: [
      { label: "cpf do proprietário", aliases: ["cpf", "cnpj", "documento"] },
      { label: "matrícula ou escritura do imóvel", aliases: ["matricula", "escritura"] },
      { label: "comprovante de endereço do proprietário", aliases: ["comprovante_endereco", "comprovante endereco", "endereco"] },
    ],
    locacao: [
      { label: "cpf do proprietário", aliases: ["cpf", "cnpj", "documento"] },
      { label: "matrícula ou escritura do imóvel", aliases: ["matricula", "escritura"] },
      { label: "comprovante de endereço do proprietário", aliases: ["comprovante_endereco", "comprovante endereco", "endereco"] },
      { label: "dados bancários do proprietário", aliases: ["dados_bancarios", "dados bancarios", "bancario", "bancários"] },
    ],
    temporada: [
      { label: "cpf do proprietário", aliases: ["cpf", "cnpj", "documento"] },
      { label: "matrícula ou escritura do imóvel", aliases: ["matricula", "escritura"] },
      { label: "comprovante de endereço do proprietário", aliases: ["comprovante_endereco", "comprovante endereco", "endereco"] },
      { label: "regras e condições da temporada", aliases: ["regras", "temporada", "condicoes", "condições"] },
    ],
  };

  const requiredDocuments = requirementsByOperation[operation];
  const collectedDocuments = requiredDocuments
    .filter((requirement) => requirement.aliases.some((alias) => documentTypes.some((item) => item.includes(alias))))
    .map((requirement) => requirement.label);
  const pendingDocuments = requiredDocuments
    .filter((requirement) => !collectedDocuments.includes(requirement.label))
    .map((requirement) => requirement.label);
  const blockingIssues = pendingDocuments.map((item) => `Falta ${item}.`);
  const summary = pendingDocuments.length > 0
    ? `Checklist documental de ${operation} ainda está incompleto.`
    : `Checklist documental de ${operation} está completo para esta etapa.`;

  return {
    operation,
    requiredDocuments: requiredDocuments.map((item) => item.label),
    collectedDocuments,
    pendingDocuments,
    blockingIssues,
    summary,
    recommendedNextMove: pendingDocuments.length > 0
      ? `Completar ${pendingDocuments.join(", ")} antes de avançar.`
      : "Seguir para a próxima validação documental do caso.",
  };
}

function buildDocumentSufficiency(params: {
  mission: ImobCaseMission;
  documents?: ImobOwnerSnapshotV1 | null;
  contractDraft?: Record<string, unknown> | null;
  documentChecklist?: ImobDocumentChecklistSnapshotV1 | null;
}): ImobDocumentSufficiencySnapshotV1 | null {
  if (params.mission !== "prepare_contract" && !params.contractDraft && !params.documents && !params.documentChecklist) {
    return null;
  }

  const packageReady = params.documents?.status === "ready";
  const draft = params.contractDraft ?? {};
  const rawHandoffTarget = asString(draft.handoffTarget);
  const handoffTarget = (
    rawHandoffTarget === "LEGAL" || rawHandoffTarget === "FINANCE" || rawHandoffTarget === "IMOB_OPS"
      ? rawHandoffTarget
      : "unknown"
  ) as ImobDocumentSufficiencySnapshotV1["handoffTarget"];
  const approvalRequired = typeof draft.approvalRequired === "boolean" ? draft.approvalRequired : true;
  const legalHandoffStatus = !packageReady
    ? "not_required"
    : handoffTarget === "LEGAL" && approvalRequired
      ? "pending"
      : "ready_for_signature";

  if (!packageReady && !params.documentChecklist && handoffTarget === "unknown") {
    return null;
  }

  const summary = !packageReady
    ? "Suficiência documental ainda não foi alcançada para o contrato."
    : legalHandoffStatus === "pending"
      ? "Pacote documental suficiente; caso pronto para handoff jurídico."
      : "Pacote documental suficiente; contrato pode seguir para assinatura.";

  const recommendedNextMove = !packageReady
    ? params.documentChecklist?.recommendedNextMove ?? "Completar o pacote documental antes de seguir."
    : legalHandoffStatus === "pending"
      ? "Encaminhar o caso para validação jurídica."
      : "Seguir para preparação final e assinatura.";

  return {
    packageStatus: packageReady ? "ready" : "pending",
    proofStatus: packageReady ? "ready" : "missing",
    handoffTarget,
    legalHandoffStatus,
    summary,
    recommendedNextMove,
  };
}

function buildDedupeSnapshot(params: {
  flow?: string | null;
  operational?: Record<string, unknown> | null;
}): ImobDedupeSnapshotV1 | null {
  const operational = params.operational ?? {};
  const dedupeDecision = asObject(operational.dedupeDecision);
  const dedupeSelection = asObject(operational.dedupeSelection);
  const flow = params.flow ?? null;

  const entity = (
    asString(dedupeDecision?.entityType)
    ?? asString(dedupeSelection?.entity)
    ?? (flow === "owner.dedupe_review" ? "owner" : null)
  ) as ImobDedupeSnapshotV1["entity"] | null;

  if (!entity) return null;

  const pendingStatus = asString(dedupeDecision?.status) === "pending" || flow === "owner.dedupe_review";
  const resolvedStatus = asString(dedupeSelection?.resolution) === "update_existing" || asString(dedupeSelection?.resolution) === "create_new";
  const matchedEntityId = asString(dedupeDecision?.matchedEntityId) ?? asString(dedupeDecision?.entityId) ?? asString(dedupeSelection?.selectedId);
  const matchedEntityLabel = asString(dedupeDecision?.matchedEntityLabel) ?? asString(dedupeDecision?.entityLabel) ?? asString(dedupeSelection?.selectedName);
  const candidateCount = matchedEntityId ? 1 : 0;

  if (!pendingStatus && !resolvedStatus && !matchedEntityId) return null;

  const status: ImobDedupeSnapshotV1["status"] = pendingStatus
    ? "pending_review"
    : resolvedStatus
      ? "resolved"
      : matchedEntityId
        ? "matched"
        : "not_applicable";

  return {
    entity,
    status,
    workflowState: flow,
    matchedEntityId,
    matchedEntityLabel,
    candidateCount,
    reasonCodes: status === "pending_review" ? ["DEDUPE_REVIEW_PENDING"] : status === "resolved" ? ["DEDUPE_RESOLVED"] : ["DEDUPE_MATCHED"],
    summary: status === "pending_review"
      ? `Há uma revisão de dedupe pendente para ${entity}.`
      : status === "resolved"
        ? `A decisão de dedupe de ${entity} já foi resolvida.`
        : `Existe um match de dedupe para ${entity} já identificado no caso.`,
    recommendedNextMove: status === "pending_review"
      ? `Revisar o dedupe de ${entity} antes de seguir.`
      : status === "resolved"
        ? `Seguir com o cadastro governado de ${entity}.`
        : `Confirmar o match de ${entity} antes do side effect.`,
  };
}

function buildVisitSnapshot(params: {
  visitDraft?: Record<string, unknown> | null;
}) {
  const draft = params.visitDraft ?? {};
  const propertyId = asString(draft.propertyId);
  const visitorName = asString(draft.visitorName);
  const visitorPhone = asString(draft.visitorPhone);
  const preferredDate = asString(draft.preferredDate);
  const preferredWindow = asString(draft.preferredWindow);

  if (!propertyId && !visitorName && !visitorPhone && !preferredDate && !preferredWindow) return null;

  const scheduled = Boolean(propertyId && visitorName && visitorPhone && preferredDate);
  return {
    id: scheduled ? `visit:${propertyId}:${preferredDate}` : null,
    name: visitorName ?? propertyId ?? "Visita em preparação",
    status: scheduled ? "scheduled" : "collecting",
  };
}

function buildProposalSnapshot(params: {
  proposalDraft?: Record<string, unknown> | null;
}) {
  const draft = params.proposalDraft ?? {};
  const propertyId = asString(draft.propertyId);
  const buyerName = asString(draft.buyerName);
  const buyerPhone = asString(draft.buyerPhone);
  const offerAmount = Number.isFinite(Number(draft.offerAmount)) ? Number(draft.offerAmount) : null;
  const contractType = asString(draft.contractType);

  if (!propertyId && !buyerName && !buyerPhone && offerAmount == null && !contractType) return null;

  const readyForReview = Boolean(propertyId && buyerName && buyerPhone && offerAmount != null && contractType);
  return {
    id: readyForReview ? `proposal:${propertyId}:${contractType}` : null,
    name: buyerName ?? propertyId ?? "Proposta em preparação",
    status: readyForReview ? "ready_for_review" : "collecting",
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
  flow?: string | null;
  pendingItems: string[];
  ownerReady: boolean;
  propertyReady: boolean;
  leadReady: boolean;
  leadReadinessScore: number | null;
  ownerLinkedToProperty: boolean;
  documentsReady: boolean;
  commissionReady: boolean;
  campaignStatus?: string | null;
  marketScanRecommendation?: ImobMarketScanRecommendationSnapshotV1 | null;
  documentChecklist?: ImobDocumentChecklistSnapshotV1 | null;
  dedupe?: ImobDedupeSnapshotV1 | null;
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
  const marketScanFlow = params.flow === "property.market_scan" || params.flow === "property.market_scan.selection";

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

  if (!marketScanFlow && structuralCaptureMission && !params.ownerReady) {
    blockers.push({ code: "owner_missing_or_incomplete", severity: "blocking", message: "Proprietário ainda não está completo." });
  }
  if (!marketScanFlow && structuralCaptureMission && !params.propertyReady) {
    blockers.push({ code: "property_missing_or_incomplete", severity: "blocking", message: "Imóvel ainda não está completo." });
  }
  if (!marketScanFlow && structuralCaptureMission && params.ownerReady && params.propertyReady && !params.ownerLinkedToProperty) {
    blockers.push({ code: "owner_property_not_linked", severity: "blocking", message: "O imóvel ainda não está vinculado ao proprietário." });
  }
  if (marketScanFlow && params.marketScanRecommendation) {
    const recommendation = params.marketScanRecommendation;
    const warningMessageByAction: Record<typeof recommendation.recommendedAction, string> = {
      captar: `Scan recomenda seguir com captação: ${recommendation.recommendedNextMove}`,
      ajustar_preco: `Scan recomenda ajuste de preço: ${recommendation.recommendedNextMove}`,
      campanha: `Scan recomenda ativação comercial: ${recommendation.recommendedNextMove}`,
      nao_seguir: `Scan recomenda não seguir agora: ${recommendation.recommendedNextMove}`,
      pedir_documento: `Scan recomenda pedir documento: ${recommendation.recommendedNextMove}`,
      pedir_autorizacao: `Scan recomenda pedir autorização: ${recommendation.recommendedNextMove}`,
    };
    blockers.push({
      code: `market_scan_${recommendation.recommendedAction}`,
      severity: "warning",
      message: warningMessageByAction[recommendation.recommendedAction],
    });
  }
  if (params.dedupe?.status === "pending_review") {
    blockers.push({
      code: "dedupe_pending",
      severity: "blocking",
      message: `Revisão de dedupe de ${params.dedupe.entity} pendente.`,
    });
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
  if (params.documentChecklist && params.documentChecklist.pendingDocuments.length > 0) {
    const severity = params.mission === "prepare_contract" ? "blocking" : "warning";
    for (const item of params.documentChecklist.pendingDocuments) {
      blockers.push({
        code: `document_checklist_${normalizeText(item).replace(/[^a-z0-9]+/g, "_")}`,
        severity,
        message: `Checklist documental de ${params.documentChecklist.operation} ainda pede ${item}.`,
      });
    }
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
  const visitDraft = asObject(operational.visitDraft);
  const proposalDraft = asObject(operational.proposalDraft);
  const documentDraft = asObject(operational.documentDraft);
  const contractDraft = asObject(operational.contractDraft);
  const commissionDraft = asObject(operational.commissionDraft);
  const listingDraft = asObject(operational.listingDraft);
  const campaignDraft = asObject(operational.campaignDraft);
  const operationalMissionContext = asObject(operational.missionContext);
  const marketScanRecommendation = buildMarketScanRecommendation({ operational });
  const dedupe = buildDedupeSnapshot({ flow, operational });
  const owner = buildOwnerSnapshot({ owner: params.caseContext?.owner, ownerDraft });
  const property = buildPropertySnapshot({ property: params.caseContext?.property, propertyDraft });
  const visit = buildVisitSnapshot({ visitDraft });
  const proposal = buildProposalSnapshot({ proposalDraft });
  const contract = buildContractSnapshot({ contractDraft });
  const commission = buildCommissionSnapshot({ commissionDraft });
  const campaign = buildCampaignSnapshot({ campaignDraft, listingDraft });
  const lead = {
    ...(asObject(params.caseContext?.lead) ?? {}),
    ...(leadDraft ?? {}),
  };
  const leadReadiness = buildLeadReadiness({ lead });
  const leadLifecycle = buildLeadLifecycle({ lead });
  const leadGoal = normalizeGoal(lead?.desiredGoal);
  const propertyGoal = property?.goal ?? null;
  const leadMatching = buildLeadMatching({
    lead,
    property,
    leadReady: leadReadiness.leadReady,
    leadReadinessScore: leadReadiness.readinessScore,
  });
  const pendingItems = [
    ...asStringList(params.caseContext?.pendingItems),
    ...asStringList(operational.pendingFields),
  ];
  const pendingFields = asStringList(operational.pendingFields);

  const ownerReady = Boolean(owner && (owner.id || owner.name) && (owner.document || owner.phone || owner.email));
  const propertyReady = Boolean(property && (property.id || (property.propertyType && property.goal && property.city && property.address)));
  const ownerLinkedToProperty = Boolean(owner?.id && property?.ownerId && owner.id === property.ownerId) || Boolean(property?.ownerId && property?.id);
  const commissionReady = commission?.status === "ready" || commission?.status === "paid";
  const campaignReady = campaign?.status === "ready_to_publish" || campaign?.status === "published_or_sent";
  const seasonalRulesReady = false;
  const mission = asString(operationalMissionContext?.mission) as ImobCaseMission | null
    ?? inferMission({ message: params.message, flow, propertyGoal, leadGoal })
    ?? "case_review";
  const defaultGoal = normalizeGoal(operationalMissionContext?.defaultGoal)
    ?? (mission === "capture_seasonal_property" ? "aluguel_por_temporada" : propertyGoal);
  const documentChecklist = buildDocumentChecklist({
    mission,
    defaultGoal,
    propertyGoal,
    documentDraft,
  });
  const documents = buildDocumentsSnapshot({ documentDraft, contractDraft }) ?? (documentChecklist
    ? {
        id: "document-package:checklist",
        name: "Pacote documental",
        status: documentChecklist.pendingDocuments.length === 0 ? "ready" : "pending",
      }
    : null);
  const documentSufficiency = buildDocumentSufficiency({
    mission,
    documents,
    contractDraft,
    documentChecklist,
  });

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
      visit,
      proposal,
      documents,
      campaign,
      contract,
      commission,
    },
    leadMatching,
    leadLifecycle,
    marketScanRecommendation,
    documentChecklist,
    documentSufficiency,
    dedupe,
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
      documentsReady: (documents?.status === "ready") || Boolean(documentChecklist && documentChecklist.pendingDocuments.length === 0),
      seasonalRulesReady,
      operationalReady: ownerReady && propertyReady && ownerLinkedToProperty && ((documents?.status === "ready") || Boolean(documentChecklist && documentChecklist.pendingDocuments.length === 0)) && (mission !== "capture_seasonal_property" || seasonalRulesReady),
    },
    blockers: buildBlockers({
      mission,
      caseContext: params.caseContext,
      flow,
      pendingItems,
      ownerReady,
      propertyReady,
      leadReady: leadReadiness.leadReady,
      leadReadinessScore: leadReadiness.readinessScore,
      ownerLinkedToProperty,
      documentsReady: (documents?.status === "ready") || Boolean(documentChecklist && documentChecklist.pendingDocuments.length === 0),
      commissionReady,
      campaignStatus: campaign?.status ?? null,
      marketScanRecommendation,
      documentChecklist,
      dedupe,
    }),
  };

  const operationalReady = (
    mission === "capture_seasonal_property"
    || mission === "capture_rental_property"
    || mission === "capture_sale_property"
  )
    ? ownerReady && propertyReady && ownerLinkedToProperty && (((documents?.status === "ready") || Boolean(documentChecklist && documentChecklist.pendingDocuments.length === 0))) && (mission !== "capture_seasonal_property" || seasonalRulesReady)
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
