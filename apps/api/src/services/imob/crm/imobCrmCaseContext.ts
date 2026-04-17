import type {
  ImobCrmCanonicalCase,
  ImobCrmCaseContext,
  ImobCrmHumanJourney,
  ImobCrmHumanWorkflow,
} from "./imobCrmAgentContract";

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
};

export function buildImobCrmCaseContextFromRecord(
  item: CaseContextRecord,
  buildCanonicalCase: (item: any) => ImobCrmCanonicalCase,
): ImobCrmCaseContext {
  const canonical = buildCanonicalCase(item);
  const updatedAtIso = item.updatedAt?.toISOString?.() ?? null;
  const humanJourney = buildImobHumanJourney({
    flow: item.flow,
    canonical,
  });
  const humanWorkflow = buildImobHumanWorkflow({
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blockers: item.blockers,
    pendingItems: item.pendingItems,
    updatedAtIso,
    canonical,
  });

  return {
    caseId: item.id,
    flow: item.flow,
    stage: item.stage,
    status: item.status,
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blocker: Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null,
    pendingItems: Array.isArray(item.pendingItems) ? item.pendingItems : [],
    threadId: item.threadId ?? null,
    updatedAt: updatedAtIso,
    lead: item.lead ?? null,
    property: item.property ?? null,
    owner: item.owner ?? null,
    canonical,
    humanJourney,
    humanWorkflow,
  };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
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
  if (normalized.some((item) => item.includes("finance") || item.includes("comissao") || item.includes("repasse") || item.includes("sinal"))) {
    return "finance";
  }
  if (normalized.some((item) => item.includes("contract") || item.includes("document") || item.includes("matricula") || item.includes("jurid"))) {
    return "legal";
  }
  if (normalized.some((item) => item.includes("lead") || item.includes("comprador") || item.includes("locatario"))) {
    return "lead";
  }
  if (normalized.some((item) => item.includes("owner") || item.includes("propriet"))) {
    return "owner";
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
