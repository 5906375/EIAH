import type {
  ImobCrmCanonicalCase,
  ImobCrmCaseContext,
  ImobCrmHumanJourney,
  ImobCrmHumanWorkflow,
  ImobCrmLeadSummary,
} from "./imobCrmAgentContract";
import type { ImobCommercialFollowUpSnapshotV1 } from "./imobCaseContextContract";
import type { ImobProofSurface } from "../imobConversationContract";

type CaseContextRecord = {
  id: string;
  flow?: string | null;
  stage?: string | null;
  status?: string | null;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
  threadId?: string | null;
  updatedAt?: { toISOString?: () => string } | null;
  lead?: unknown;
  property?: unknown;
  owner?: unknown;
  runId?: string | null;
  txId?: string | null;
  receiptPath?: string | null;
  bundlePath?: string | null;
  verifyUrl?: string | null;
  proof?: ImobProofSurface | null;
  commercialFollowUp?: unknown;
};

export function buildImobCrmCaseContextFromRecord(
  item: CaseContextRecord,
  buildCanonicalCase: (item: any) => ImobCrmCanonicalCase,
): ImobCrmCaseContext {
  const lead = normalizeLeadSummary(item.lead);
  const canonical = buildCanonicalCase(item);
  const updatedAtIso = item.updatedAt?.toISOString?.() ?? null;
  const normalizedPendingItems = normalizeCasePendingItemsAgainstOwner(item.pendingItems, item.owner);
  const humanJourney = buildImobHumanJourney({
    flow: item.flow,
    canonical,
  });
  const humanWorkflow = buildImobHumanWorkflow({
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blockers: item.blockers,
    pendingItems: normalizedPendingItems,
    updatedAtIso,
    canonical,
  });
  const proof = normalizeProofSurface(item);

  return {
    caseId: item.id,
    flow: item.flow,
    stage: item.stage,
    status: item.status,
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blocker: Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null,
    pendingItems: normalizedPendingItems,
    threadId: item.threadId ?? null,
    updatedAt: updatedAtIso,
    lead,
    property: item.property ?? null,
    owner: item.owner ?? null,
    proof,
    commercialFollowUp: normalizeCommercialFollowUp(item.commercialFollowUp),
    canonical,
    humanJourney,
    humanWorkflow,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isOwnerNamePending(item: string) {
  return /nome do propriet[aá]rio/.test(item);
}

function isOwnerPhonePending(item: string) {
  return /telefone do propriet[aá]rio/.test(item);
}

function isOwnerEmailPending(item: string) {
  return /e-?mail do propriet[aá]rio/.test(item);
}

function isOwnerDocumentPending(item: string) {
  return /(?:documento|cpf|cnpj) do propriet[aá]rio/.test(item) || item.includes("ownerdocument");
}

function normalizeCasePendingItemsAgainstOwner(pendingItems: unknown, owner: unknown) {
  const normalizedOwner = asObject(owner);
  const ownerName = asString(normalizedOwner?.name);
  const ownerPhone = asString(normalizedOwner?.phone);
  const ownerEmail = asString(normalizedOwner?.email);
  const ownerDocument = asString(normalizedOwner?.document);

  return asStringList(pendingItems).filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (ownerName && isOwnerNamePending(normalized)) return false;
    if (ownerPhone && isOwnerPhonePending(normalized)) return false;
    if (ownerEmail && isOwnerEmailPending(normalized)) return false;
    if (ownerDocument && isOwnerDocumentPending(normalized)) return false;
    return true;
  });
}

function normalizeProofSurface(item: CaseContextRecord): ImobProofSurface | null {
  const explicitProof = asObject(item.proof);
  const required = asBoolean(explicitProof?.required);
  const ready = asBoolean(explicitProof?.ready);
  const state = asString(explicitProof?.state);
  const runId = asString(explicitProof?.runId) ?? asString(item.runId);
  const txId = asString(explicitProof?.txId) ?? asString(item.txId);
  const receiptPath = asString(explicitProof?.receiptPath) ?? asString(item.receiptPath);
  const bundlePath = asString(explicitProof?.bundlePath) ?? asString(item.bundlePath);
  const verifyUrl = asString(explicitProof?.verifyUrl) ?? asString(item.verifyUrl) ?? receiptPath;
  const hasSignals = Boolean(runId || txId || receiptPath || bundlePath || explicitProof);
  if (!hasSignals) return null;
  const inferredReady = Boolean(txId && receiptPath && bundlePath);
  const resolvedRequired = required ?? Boolean(runId || txId || receiptPath || bundlePath);
  const resolvedReady = ready ?? inferredReady;
  return {
    required: resolvedRequired,
    ready: resolvedReady,
    state:
      state === "not_required" || state === "pending" || state === "ready" || state === "failed"
        ? state
        : (resolvedRequired ? (resolvedReady ? "ready" : "pending") : (resolvedReady ? "ready" : "not_required")),
    runId,
    txId,
    receiptPath,
    bundlePath,
    verifyUrl,
  };
}

function normalizeLeadSummary(value: unknown): ImobCrmLeadSummary | null {
  const lead = asObject(value);
  if (!lead) return null;

  const metadata = asObject(lead.metadata);
  const metadataDiscovery = asObject(metadata?.discoverySignals);
  const directDiscovery = asObject(lead.discoverySignals);
  const discoverySource = directDiscovery ?? metadataDiscovery;
  const urgency = asString(discoverySource?.urgency);
  const budgetFlexibility = asString(discoverySource?.budgetFlexibility);
  const decisionMaker = asString(discoverySource?.decisionMaker);
  const pendingSignals = Array.isArray(discoverySource?.pendingSignals)
    ? discoverySource.pendingSignals.map((item) => asString(item)).filter(Boolean)
    : [];

  return {
    ...lead,
    discoverySignals: discoverySource ? {
      urgency: urgency === "low" || urgency === "medium" || urgency === "high" ? urgency : null,
      painPoint: asString(discoverySource?.painPoint),
      motivation: asString(discoverySource?.motivation),
      budgetFlexibility:
        budgetFlexibility === "strict" || budgetFlexibility === "moderate" || budgetFlexibility === "flexible"
          ? budgetFlexibility
          : null,
      decisionMaker:
        decisionMaker === "solo" || decisionMaker === "shared" || decisionMaker === "third_party"
          ? decisionMaker
          : null,
      timeline: asString(discoverySource?.timeline),
      pendingSignals: pendingSignals.filter((item): item is "urgency" | "painPoint" | "motivation" | "budgetFlexibility" | "decisionMaker" | "timeline" =>
        item === "urgency"
        || item === "painPoint"
        || item === "motivation"
        || item === "budgetFlexibility"
        || item === "decisionMaker"
        || item === "timeline",
      ),
    } : null,
  };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeCommercialFollowUp(value: unknown): ImobCommercialFollowUpSnapshotV1 | null {
  const followUp = asObject(value);
  if (!followUp) return null;

  const source = asString(followUp.source);
  const status = asString(followUp.status);
  const trigger = asString(followUp.trigger);
  const suggestedChannel = asString(followUp.suggestedChannel);
  const reasonCodes = asStringList(followUp.reasonCodes);
  const summary = asString(followUp.summary);
  const recommendedNextMove = asString(followUp.recommendedNextMove);

  if (
    (source !== "visit_outcome" && source !== "lead_lifecycle" && source !== "follow_up_runtime")
    || (status !== "follow_up_required" && status !== "reengagement_required" && status !== "awaiting_response")
    || !trigger
    || (
      suggestedChannel !== "internal"
      && suggestedChannel !== "whatsapp"
      && suggestedChannel !== "phone"
      && suggestedChannel !== "email"
      && suggestedChannel !== "unknown"
    )
    || !summary
    || !recommendedNextMove
  ) {
    return null;
  }

  return {
    source,
    status,
    trigger,
    suggestedChannel,
    reasonCodes,
    summary,
    recommendedNextMove,
  };
}

function diffHoursFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.round(((Date.now() - time) / 36e5) * 10) / 10);
}

function mapJourneyTypeToHumanJourney(
  journeyType: string | undefined,
): ImobCrmHumanJourney | null {
  switch ((journeyType ?? "").trim().toLowerCase()) {
    case "property_capture":
      return { phase: "captacao", phaseObjective: "estruturar o imóvel e colocar a operação em movimento" };
    case "lead_qualification":
      return { phase: "qualificacao", phaseObjective: "qualificar o interesse e definir aderência do lead" };
    case "visit_follow_up":
      return { phase: "visita", phaseObjective: "confirmar visita e manter o lead aquecido" };
    case "proposal":
      return { phase: "proposta", phaseObjective: "fechar condições mínimas para proposta viável" };
    case "negotiation":
      return { phase: "negociacao", phaseObjective: "avançar contraproposta e reduzir atrito até decisão" };
    case "documentation":
      return { phase: "documentacao", phaseObjective: "fechar pendências documentais para não travar o negócio" };
    case "contract":
      return { phase: "documentacao", phaseObjective: "organizar o contrato e preparar validação final" };
    case "closing":
      return { phase: "fechamento", phaseObjective: "concluir assinatura, repasse e entrega sem ruptura" };
    case "commission":
      return { phase: "fechamento", phaseObjective: "liquidar comissão, repasse e pendências financeiras" };
    default:
      return null;
  }
}

function buildImobHumanJourney(params: {
  flow?: string | null;
  canonical: ImobCrmCanonicalCase;
}): ImobCrmHumanJourney | null {
  const canonicalJourney = mapJourneyTypeToHumanJourney(params.canonical.journeyType);
  if (canonicalJourney) return canonicalJourney;

  switch ((params.flow ?? "").trim().toLowerCase()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return { phase: "captacao", phaseObjective: "estruturar a base do imóvel para entrar no funil" };
    case "lead.qualify":
      return { phase: "qualificacao", phaseObjective: "entender contexto, urgência e aderência do lead" };
    case "visit.schedule":
      return { phase: "visita", phaseObjective: "agendar visita e confirmar próximos movimentos" };
    case "proposal.create":
      return { phase: "proposta", phaseObjective: "transformar interesse em proposta concreta" };
    case "deal.review":
      return { phase: "negociacao", phaseObjective: "destravar objeções e consolidar a negociação" };
    case "documents.collect":
    case "contract.prepare":
      return { phase: "documentacao", phaseObjective: "garantir documentos e contrato prontos para seguir" };
    case "commission.settle":
      return { phase: "fechamento", phaseObjective: "resolver liquidação e fechamento financeiro do caso" };
    default:
      return null;
  }
}

function inferWaitingOn(params: {
  blockers: string[];
  pendingItems: string[];
  canonical: ImobCrmCanonicalCase;
}): ImobCrmHumanWorkflow["waitingOn"] {
  const normalized = [...params.blockers, ...params.pendingItems, ...(params.canonical.reasonCodes ?? [])]
    .map((item) => String(item).toLowerCase());
  const hasOwnerSignal = normalized.some((item) =>
    item.includes("owner")
    || item.includes("propriet")
    || isOwnerNamePending(item)
    || isOwnerPhonePending(item)
    || isOwnerEmailPending(item)
    || isOwnerDocumentPending(item),
  );
  const hasLegalSignal = normalized.some((item) =>
    (item.includes("contract") || item.includes("document") || item.includes("matricula") || item.includes("jurid"))
    && !isOwnerDocumentPending(item)
    && !item.includes("dados do propriet"),
  );
  if (normalized.some((item) => item.includes("finance") || item.includes("comissao") || item.includes("repasse") || item.includes("sinal"))) {
    return "finance";
  }
  if (hasOwnerSignal) {
    return "owner";
  }
  if (hasLegalSignal) {
    return "legal";
  }
  if (normalized.some((item) => item.includes("lead") || item.includes("comprador") || item.includes("locatario"))) {
    return "lead";
  }
  if (normalized.some((item) => item.includes("review") || item.includes("approval") || item.includes("pending_data"))) {
    return "broker";
  }
  return "internal";
}

function inferUrgency(params: {
  agingHours: number | null;
  blockers: string[];
  pendingItems: string[];
}): ImobCrmHumanWorkflow["urgency"] {
  const hasBlocker = params.blockers.length > 0;
  const hasPending = params.pendingItems.length > 0;
  const aging = params.agingHours ?? 0;
  if (hasBlocker && aging >= 72) return "critical";
  if (hasBlocker || aging >= 48) return "high";
  if (hasPending || aging >= 24) return "medium";
  return "low";
}

function inferFollowUpRisk(params: {
  agingHours: number | null;
  blockers: string[];
  pendingItems: string[];
}): ImobCrmHumanWorkflow["followUpRisk"] {
  const aging = params.agingHours ?? 0;
  if (params.blockers.length > 0 && aging >= 48) return "high";
  if (params.pendingItems.length > 0 || aging >= 24) return "medium";
  return "low";
}

function buildDoneDefinition(params: {
  humanJourney: ImobCrmHumanJourney | null;
  canonical: ImobCrmCanonicalCase;
}): string | null {
  switch (params.humanJourney?.phase) {
    case "captacao":
      return "cadastro mínimo completo e imóvel pronto para avançar no funil";
    case "qualificacao":
      return "lead qualificado com contexto suficiente para próxima ação comercial";
    case "visita":
      return "visita alinhada ou follow-up registrado com próximo movimento claro";
    case "proposta":
      return "proposta estruturada com condições mínimas definidas";
    case "negociacao":
      return "contraproposta resolvida ou decisão clara para avançar/encerrar";
    case "documentacao":
      return "pendências documentais resolvidas para não travar o caso";
    case "fechamento":
      return "assinatura, repasse e evidências finais encaminhadas";
    default:
      return params.canonical.recommendedActions?.[0]?.label
        ? `próxima ação concluída: ${params.canonical.recommendedActions[0].label.toLowerCase()}`
        : null;
  }
}

function buildImobHumanWorkflow(params: {
  ownerResponsible: string | null;
  nextStep: string | null;
  blockers: unknown;
  pendingItems: unknown;
  updatedAtIso: string | null;
  canonical: ImobCrmCanonicalCase;
}): ImobCrmHumanWorkflow | null {
  const blockers = asStringList(params.blockers);
  const pendingItems = asStringList(params.pendingItems);
  const agingHours = diffHoursFromIso(params.updatedAtIso);
  const humanJourney = mapJourneyTypeToHumanJourney(params.canonical.journeyType);
  const waitingOn = inferWaitingOn({ blockers, pendingItems, canonical: params.canonical });
  const urgency = inferUrgency({ agingHours, blockers, pendingItems });
  const followUpRisk = inferFollowUpRisk({ agingHours, blockers, pendingItems });
  const currentObjective = params.nextStep ?? humanJourney?.phaseObjective ?? null;
  const likelyFailureMode =
    blockers.length > 0
      ? "caso travado por bloqueio explícito"
      : pendingItems.length > 0
        ? "caso estacionado por falta de informação operacional"
        : followUpRisk === "high"
          ? "caso pode esfriar por falta de retomada"
          : null;

  return {
    currentObjective,
    waitingOn,
    urgency,
    agingHours,
    followUpRisk,
    nextActionOwner: params.ownerResponsible ?? (waitingOn === "broker" ? "Corretor" : null),
    lastMeaningfulContactAt: params.updatedAtIso,
    doneDefinition: buildDoneDefinition({ humanJourney, canonical: params.canonical }),
    likelyFailureMode,
  };
}
