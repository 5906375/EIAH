import type {
  ImobCrmCanonicalCase,
  ImobCrmCaseContext,
  ImobCrmConversationState,
} from "./imobCrmAgentContract";
import { buildImobCrmCaseContextFromRecord } from "./imobCrmCaseContext";

type BusinessReadIntent = "pipeline_status" | "blocked_run_resolution" | "next_best_action";
type BusinessReadCaseRecord = {
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
  lead?: ImobCrmCaseContext["lead"];
  property?: ImobCrmCaseContext["property"];
  owner?: ImobCrmCaseContext["owner"];
};

type BusinessReadHelpers = {
  asObject: (value: unknown) => Record<string, unknown> | null;
  asString: (value: unknown) => string | null;
  asStringList: (value: unknown) => string[];
  normalizeImobRouteText: (value: string) => string;
  formatBudgetCentsForImob: (value: number | null | undefined) => string | null;
  formatImobStatusLabel: (status: string | null | undefined) => string;
  formatImobPendingList: (items: string[] | null | undefined) => string;
  formatImobCaseFlowLabel: (flow: string) => string;
  titleCaseRouteWords: (value: string) => string;
  createEmptyThreadState: () => ImobCrmConversationState;
  resolveImobBackingSpecialists: (caseContext?: any) => unknown;
  buildImobCanonicalCase: (params: {
    flow: string | null | undefined;
    stage: string | null | undefined;
    status: string | null | undefined;
    ownerResponsible?: string | null;
    nextStep?: string | null;
    blockers?: unknown;
    pendingItems?: unknown;
  }) => any;
  resolveBusinessReadIntent: (message: string) => BusinessReadIntent | null;
};

export function buildImobCrmBusinessReadHelpers(helpers: BusinessReadHelpers) {
  function formatWaitingOnLabel(value: ImobCrmCaseContext["humanWorkflow"] extends infer T
    ? T extends { waitingOn?: infer W }
      ? W
      : never
    : never) {
    switch (value) {
      case "lead":
        return "lead";
      case "owner":
        return "proprietário";
      case "broker":
        return "corretor";
      case "legal":
        return "jurídico/documentação";
      case "finance":
        return "financeiro";
      case "internal":
        return "operação interna";
      default:
        return null;
    }
  }

  function normalizePreparedRecipientRole(
    waitingOn: ImobCrmCaseContext["humanWorkflow"] extends infer T
      ? T extends { waitingOn?: infer W }
        ? W
        : never
      : never,
  ) {
    if (waitingOn === "lead" || waitingOn === "owner" || waitingOn === "broker" || waitingOn === "legal" || waitingOn === "finance" || waitingOn === "internal") {
      return waitingOn;
    }
    return "broker";
  }

  function buildCaseContextFromRecord(item: any): ImobCrmCaseContext {
    return buildImobCrmCaseContextFromRecord(item, helpers.buildImobCanonicalCase);
  }

  function formatImobJourneyLabel(journeyType: string | null | undefined) {
    const normalized = (journeyType ?? "").trim().toLowerCase();
    if (normalized === "property_capture") return "Captação";
    if (normalized === "lead_qualification") return "Qualificação";
    if (normalized === "proposal") return "Proposta";
    if (normalized === "visit_follow_up") return "Visita";
    if (normalized === "negotiation") return "Negociação";
    if (normalized === "documentation") return "Documentação";
    if (normalized === "contract") return "Contrato";
    if (normalized === "closing") return "Fechamento";
    if (normalized === "commission") return "Comissão";
    if (normalized === "temporada_rules") return "Regras de temporada";
    return "Operação";
  }

  function formatImobCommercialStageLabel(caseContext?: ImobCrmCaseContext | null) {
    const flow = helpers.asString(caseContext?.flow);
    const status = helpers.asString(caseContext?.status);
    const stage = helpers.asString(caseContext?.stage);
    if (flow === "lead.qualify") {
      if (status === "ready_for_review" || stage === "ready_for_review") return "Lead pronto para avançar";
      if (status === "pending_data" || stage === "pending_data") return "Lead com dados pendentes";
      if (stage === "qualified" || status === "qualified") return "Lead qualificado";
      return "Qualificação do lead";
    }
    if (flow === "property.create" || flow === "owner.create" || flow === "listing.activate") {
      if (status === "ready_for_review" || stage === "ready_for_review") return "Captação pronta para revisão";
      if (status === "pending_data" || stage === "pending_data") return "Captação com dados pendentes";
      return "Captação em andamento";
    }
    if (flow === "rules.configure") return "Regras de temporada";
    if (status === "ready_for_review" || stage === "ready_for_review") return "Pronto para revisão";
    return helpers.formatImobStatusLabel(status ?? stage);
  }

  function formatImobBusinessSubject(caseContext?: ImobCrmCaseContext | null) {
    const lead = helpers.asObject(caseContext?.lead);
    const property = helpers.asObject(caseContext?.property);
    const owner = helpers.asObject(caseContext?.owner);
    const leadName = helpers.asString(lead?.name);
    const goal = helpers.asString(lead?.goal);
    const city = helpers.asString(lead?.targetCity) ?? helpers.asString(property?.city);
    const budgetCents = typeof lead?.budgetMaxCents === "number" ? lead.budgetMaxCents : null;
    const propertyType = helpers.asString(property?.propertyType);
    const propertyAddress = helpers.asString(property?.address);
    const ownerName = helpers.asString(owner?.name);

    if (leadName) {
      return [
        `Lead ${leadName}`,
        goal ? `para ${goal}` : null,
        city ? `em ${city}` : null,
        budgetCents ? `com orçamento de ${helpers.formatBudgetCentsForImob(budgetCents)}` : null,
      ].filter(Boolean).join(" ");
    }
    if (propertyAddress || propertyType) {
      return [
        propertyType ? `Imóvel ${propertyType}` : "Imóvel",
        propertyAddress ? `em ${propertyAddress}` : null,
        city ? `em ${city}` : null,
      ].filter(Boolean).join(" ");
    }
    if (ownerName) return `Proprietário ${ownerName}`;
    return "Negócio imobiliário";
  }

  function formatImobBusinessNextStep(nextStep: string | null | undefined, caseContext?: ImobCrmCaseContext | null) {
    const normalized = helpers.normalizeImobRouteText(nextStep ?? "");
    if (!normalized) return "definir o próximo movimento comercial";
    if (normalized.includes("qualificar lead deste caso")) {
      const leadName = helpers.asString(helpers.asObject(caseContext?.lead)?.name);
      return leadName
        ? `qualificar o interesse do lead ${leadName} e vincular um imóvel aderente`
        : "qualificar o interesse do lead e vincular um imóvel aderente";
    }
    if (normalized.includes("vincular o lead")) return "vincular o lead a um imóvel ou à próxima etapa comercial";
    if (normalized.includes("cadastrar imovel") || normalized.includes("cadastrar imóvel")) return "completar o cadastro do imóvel";
    return nextStep ?? "definir o próximo movimento comercial";
  }

  function buildImobCaseExperienceWidget(caseContext?: ImobCrmCaseContext | null) {
    if (!caseContext?.canonical?.journeyType) return undefined;
    const specialists = helpers.resolveImobBackingSpecialists(caseContext);
    const recommendedActions = Array.isArray(caseContext.canonical.recommendedActions)
      ? caseContext.canonical.recommendedActions
          .map((item: any) => ({
            id: String(item?.id ?? ""),
            label: String(item?.label ?? "Próxima ação"),
            autoprompt: helpers.asString(item?.inputHint) ?? helpers.asString(item?.label),
          }))
          .filter((item: any) => item.id && item.label)
          .slice(0, 3)
      : [];

    const pendingItems = Array.isArray(caseContext.pendingItems)
      ? caseContext.pendingItems.map((item: any) => String(item)).filter(Boolean)
      : [];

    if (pendingItems.length > 0 || helpers.asString(caseContext.blocker)) {
      return {
        kind: "document_checklist",
        title: "Pendências do negócio",
        checklist: pendingItems.slice(0, 6),
        blocker: helpers.asString(caseContext.blocker) ?? null,
        nextStep: helpers.asString(caseContext.nextStep) ?? null,
        specialists,
      };
    }

    return {
      kind: "case_summary",
      title: "Resumo do negócio",
      journeyLabel: formatImobJourneyLabel(caseContext.canonical.journeyType),
      stageLabel: formatImobCommercialStageLabel(caseContext),
      nextStep: formatImobBusinessNextStep(helpers.asString(caseContext.nextStep), caseContext),
      blocker: helpers.asString(caseContext.blocker) ?? null,
      recommendedActions,
      specialists,
    };
  }

  function buildSpecialistSupportLine(specialist: any) {
    const agentId = helpers.asString(specialist?.primaryAgentId) ?? "specialist";
    const reasonCode = helpers.asString(specialist?.reasonCode);
    const rationale = helpers.asString(specialist?.rationale);
    const suggestedAction = helpers.asString(specialist?.suggestedAction);
    const ownershipBoundary = helpers.asString(specialist?.ownershipBoundary) ?? "Apoia o IMOB_CRM e não assume ownership do caso.";
    const why = rationale
      ? `${agentId} entra aqui porque ${rationale.charAt(0).toLowerCase()}${rationale.slice(1)}`
      : `${agentId} entra como apoio contextual deste caso`;

    return {
      text: [
        `Specialist de apoio: ${agentId}${reasonCode ? ` por ${reasonCode}` : ""}.`,
        `${why}.`,
        suggestedAction ? `Apoio sugerido: ${suggestedAction}.` : null,
        ownershipBoundary,
      ].filter(Boolean).join(" "),
      cardLine: `Specialist: ${agentId}${reasonCode ? ` (${reasonCode})` : ""} | ${ownershipBoundary}`,
      consultive: {
        agentId,
        reasonCode: reasonCode ?? undefined,
        why: rationale ?? null,
        suggestedAction: suggestedAction ?? null,
        ownershipBoundary,
      },
    };
  }

  function buildCaseBrief(params: {
    subject: string;
    humanPhaseLabel: string | null;
    phaseObjective: string | null;
    primaryBlocker: string | null;
    primaryPending: string | null;
    waitingOn: ImobCrmCaseContext["humanWorkflow"] extends infer T
      ? T extends { waitingOn?: infer W }
        ? W
        : never
      : never;
    nextActionOwner: string | null;
    nextStep: string;
    primarySpecialistAgentId: string | null;
    discoverySignals?: ImobCrmCaseContext["lead"] extends infer T
      ? T extends { discoverySignals?: infer D }
        ? D
        : never
      : never;
  }) {
    const primaryRisk = params.primaryBlocker ?? params.primaryPending ?? "nenhum risco crítico registrado";
    const phasePrefix = params.humanPhaseLabel ? `na fase de ${params.humanPhaseLabel.toLowerCase()}` : "no momento atual";
    const discoverySignals = params.discoverySignals ?? null;
    const discoverySummary = [
      discoverySignals?.painPoint ? `dor principal: ${discoverySignals.painPoint}` : null,
      discoverySignals?.motivation ? `motivação: ${discoverySignals.motivation}` : null,
      discoverySignals?.timeline ? `janela: ${discoverySignals.timeline}` : null,
    ].filter(Boolean).join(", ");
    return {
      summary: `${params.subject} está ${phasePrefix}. O principal risco agora é ${primaryRisk}, e o próximo movimento seguro é ${params.nextStep}.${discoverySummary ? ` Discovery atual: ${discoverySummary}.` : ""}`,
      phaseObjective: params.phaseObjective,
      primaryRisk,
      waitingOn: params.waitingOn ?? null,
      nextActionOwner: params.nextActionOwner ?? null,
      nextSafeStep: params.nextStep,
      specialistAgentId: params.primarySpecialistAgentId,
    };
  }

  function buildPreparedFollowUp(params: {
    subject: string;
    humanPhaseLabel: string | null;
    waitingOn: ImobCrmCaseContext["humanWorkflow"] extends infer T
      ? T extends { waitingOn?: infer W }
        ? W
        : never
      : never;
    primaryBlocker: string | null;
    primaryPending: string | null;
    nextStep: string;
    discoverySignals?: ImobCrmCaseContext["lead"] extends infer T
      ? T extends { discoverySignals?: infer D }
        ? D
        : never
      : never;
  }) {
    const recipientRole = normalizePreparedRecipientRole(params.waitingOn);
    const subjectLabel = params.subject || "este caso";
    const phaseLabel = params.humanPhaseLabel ? `na fase de ${params.humanPhaseLabel.toLowerCase()}` : "neste caso";
    const trigger = params.primaryBlocker ?? params.primaryPending ?? "preciso de uma confirmação para avançar";
    const discoverySignals = params.discoverySignals ?? null;
    const directText = `Olá. Estou retomando ${subjectLabel} ${phaseLabel}. O ponto que ainda trava é ${trigger}.${discoverySignals?.timeline ? ` Minha leitura é ${discoverySignals.timeline}.` : ""} Para avançar, preciso ${params.nextStep}. Consegue me responder ainda hoje?`;
    const consultiveText = `Oi. Voltei a olhar ${subjectLabel} para não deixar o atendimento esfriar. Hoje estamos aguardando ${formatWaitingOnLabel(params.waitingOn) ?? recipientRole}. O ponto principal é ${trigger}.${discoverySignals?.motivation ? ` Já registrei ${discoverySignals.motivation}.` : ""}${discoverySignals?.painPoint ? ` A dor central segue sendo ${discoverySignals.painPoint}.` : ""} Se você confirmar ${params.nextStep}, eu sigo sem te fazer repetir o processo.`;

    return {
      objective: discoverySignals?.motivation
        ? `Retomar o caso com uma única ação clara sem perder a motivação registrada: ${discoverySignals.motivation}.`
        : "Retomar o caso com uma única ação clara e destravar o próximo movimento.",
      recipientRole,
      trigger,
      expectedReply: params.nextStep,
      escalationHint: "Se não houver retorno, reclassificar waitingOn e decidir se o caso pede specialist ou nova cadência de follow-up.",
      variants: [
        {
          id: "follow-up-direct",
          label: "Mensagem curta",
          tone: "direct" as const,
          text: directText,
        },
        {
          id: "follow-up-consultive",
          label: "Mensagem consultiva",
          tone: "consultive" as const,
          text: consultiveText,
        },
      ],
    };
  }

  function buildActionableChecklist(params: {
    pendingItems: string[];
    primaryBlocker: string | null;
    waitingOnLabel: string | null;
    nextStep: string;
    urgency: "low" | "medium" | "high" | "critical" | null | undefined;
    discoverySignals?: ImobCrmCaseContext["lead"] extends infer T
      ? T extends { discoverySignals?: infer D }
        ? D
        : never
      : never;
  }) {
    const owner = params.waitingOnLabel ?? "corretor";
    const urgency = params.urgency ?? "medium";
    const discoverySignals = params.discoverySignals ?? null;
    const discoveryAction = discoverySignals?.painPoint
      ? `Usar a dor principal na abordagem: ${discoverySignals.painPoint}`
      : discoverySignals?.decisionMaker
        ? "Registrar o decisor correto antes do próximo contato"
        : discoverySignals?.timeline
          ? `Trabalhar o follow-up dentro da janela: ${discoverySignals.timeline}`
          : null;
    return {
      title: "Checklist acionável do caso",
      items: [
        params.primaryBlocker
          ? {
              id: "blocker",
              title: params.primaryBlocker,
              criticality: "critical" as const,
              owner,
              unlocks: params.nextStep,
              urgency,
            }
          : null,
        discoveryAction
          ? {
              id: "lead-discovery-action",
              title: discoveryAction,
              criticality: "supporting" as const,
              owner,
              unlocks: params.nextStep,
              urgency: "medium" as const,
            }
          : null,
        ...params.pendingItems.slice(0, 2).map((item, index) => ({
          id: `pending-${index}`,
          title: item,
          criticality: (index === 0 ? "critical" : "supporting") as const,
          owner,
          unlocks: params.nextStep,
          urgency: index === 0 ? urgency : "medium" as const,
        })),
      ].filter(Boolean),
    };
  }

  function buildHandoffPack(params: {
    specialist: ReturnType<typeof buildSpecialistSupportLine> | null;
    caseBrief: ReturnType<typeof buildCaseBrief>;
    primaryBlocker: string | null;
    pendingItems: string[];
    urgency: "low" | "medium" | "high" | "critical" | null | undefined;
  }) {
    if (!params.specialist) return undefined;
    return {
      targetArea: params.specialist.consultive.agentId,
      reason: params.specialist.consultive.why ?? "apoio contextual por blocker ou risco do caso",
      summary: params.caseBrief.summary,
      blocker: params.primaryBlocker ?? null,
      needsValidation: [params.primaryBlocker, ...params.pendingItems.slice(0, 2)].filter(Boolean) as string[],
      remainsWithBroker: [
        "Manter o ownership do caso no IMOB_CRM.",
        "Atualizar a contraparte assim que o specialist devolver a leitura.",
      ],
      urgency: params.urgency ?? "medium",
      ownershipBoundary: params.specialist.consultive.ownershipBoundary ?? null,
    };
  }

  function buildEvidenceRef(
    kind: "case_field" | "workflow_signal" | "recommended_action" | "specialist_hint",
    ref: string,
    label: string,
    value?: string | number | boolean | null,
  ) {
    return value === undefined
      ? { kind, ref, label }
      : { kind, ref, label, value };
  }

  function buildDecisionReasonCodes(params: {
    intent: BusinessReadIntent;
    caseContext: ImobCrmCaseContext;
    primaryBlocker: string | null;
    pendingItems: string[];
    recommendedAction: ReturnType<typeof getImobBusinessRecommendedAction>;
    specialists: any[];
  }) {
    const reasonCodes = new Set<string>();

    for (const code of params.caseContext?.canonical?.reasonCodes ?? []) {
      if (helpers.asString(code)) reasonCodes.add(String(code));
    }
    if (helpers.asString(params.recommendedAction?.reasonCode)) {
      reasonCodes.add(String(params.recommendedAction?.reasonCode));
    }
    for (const specialist of params.specialists.slice(0, 2)) {
      if (helpers.asString(specialist?.reasonCode)) {
        reasonCodes.add(String(specialist.reasonCode));
      }
    }
    if (params.intent === "blocked_run_resolution" && params.primaryBlocker && reasonCodes.size === 0) {
      reasonCodes.add("DOCUMENT_BLOCKER");
    }
    if (params.intent === "next_best_action" && params.recommendedAction && reasonCodes.size === 0) {
      reasonCodes.add("COMMERCIAL_PRIORITY");
    }
    if (params.pendingItems.length > 0 && reasonCodes.size === 0) {
      reasonCodes.add("FOLLOW_UP_DISCIPLINE");
    }

    return [...reasonCodes];
  }

  function buildDecisionConfidence(params: {
    primaryBlocker: string | null;
    waitingOn: ImobCrmCaseContext["humanWorkflow"] extends infer T
      ? T extends { waitingOn?: infer W }
        ? W
        : never
      : never;
    recommendedAction: ReturnType<typeof getImobBusinessRecommendedAction>;
    reasonCodes: string[];
    pendingItems: string[];
  }): "low" | "medium" | "high" {
    const signalScore = [
      params.primaryBlocker ? 1 : 0,
      params.waitingOn ? 1 : 0,
      params.recommendedAction ? 1 : 0,
      params.reasonCodes.length > 0 ? 1 : 0,
      params.pendingItems.length > 0 ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);

    if (signalScore >= 4) return "high";
    if (signalScore >= 2) return "medium";
    return "low";
  }

  function buildMissingEvidence(params: {
    primaryBlocker: string | null;
    waitingOn: ImobCrmCaseContext["humanWorkflow"] extends infer T
      ? T extends { waitingOn?: infer W }
        ? W
        : never
      : never;
    nextActionOwner: string | null;
    recommendedAction: ReturnType<typeof getImobBusinessRecommendedAction>;
    pendingItems: string[];
  }) {
    return [
      !params.nextActionOwner ? "owner da próxima ação não está explícito" : null,
      !params.recommendedAction ? "ação recomendada do caso não está explícita" : null,
      !params.waitingOn ? "waitingOn ainda não está classificado" : null,
      !params.primaryBlocker && params.pendingItems.length === 0 ? "não há blocker ou pendência dominante para priorização forte" : null,
    ].filter(Boolean) as string[];
  }

  function buildDecisionRationale(params: {
    intent: BusinessReadIntent;
    caseContext: ImobCrmCaseContext;
    subject: string;
    nextStep: string;
    primaryBlocker: string | null;
    pendingItems: string[];
    waitingOn: string | null;
    nextActionOwner: string | null;
    recommendedAction: ReturnType<typeof getImobBusinessRecommendedAction>;
    specialists: any[];
  }) {
    const sourceRefs = [
      params.primaryBlocker
        ? buildEvidenceRef("case_field", "case.blocker", "Bloqueio principal", params.primaryBlocker)
        : null,
      params.pendingItems[0]
        ? buildEvidenceRef("case_field", "case.pendingItems[0]", "Pendência principal", params.pendingItems[0])
        : null,
      params.waitingOn
        ? buildEvidenceRef("workflow_signal", "humanWorkflow.waitingOn", "Waiting on", params.waitingOn)
        : null,
      params.caseContext?.humanWorkflow?.urgency
        ? buildEvidenceRef("workflow_signal", "humanWorkflow.urgency", "Urgência", params.caseContext.humanWorkflow.urgency)
        : null,
      helpers.asString(params.recommendedAction?.label)
        ? buildEvidenceRef(
            "recommended_action",
            "canonical.recommendedActions[0]",
            "Ação recomendada",
            helpers.asString(params.recommendedAction?.label),
          )
        : null,
      params.specialists[0]?.primaryAgentId
        ? buildEvidenceRef(
            "specialist_hint",
            "specialists[0]",
            "Specialist sugerido",
            helpers.asString(params.specialists[0]?.primaryAgentId),
          )
        : null,
    ].filter(Boolean) as Array<ReturnType<typeof buildEvidenceRef>>;

    const reasonCodes = buildDecisionReasonCodes({
      intent: params.intent,
      caseContext: params.caseContext,
      primaryBlocker: params.primaryBlocker,
      pendingItems: params.pendingItems,
      recommendedAction: params.recommendedAction,
      specialists: params.specialists,
    });

    const confidence = buildDecisionConfidence({
      primaryBlocker: params.primaryBlocker,
      waitingOn: params.caseContext?.humanWorkflow?.waitingOn,
      recommendedAction: params.recommendedAction,
      reasonCodes,
      pendingItems: params.pendingItems,
    });

    const missingEvidence = buildMissingEvidence({
      primaryBlocker: params.primaryBlocker,
      waitingOn: params.caseContext?.humanWorkflow?.waitingOn,
      nextActionOwner: params.nextActionOwner,
      recommendedAction: params.recommendedAction,
      pendingItems: params.pendingItems,
    });

    const summaryByIntent: Record<BusinessReadIntent, string> = {
      pipeline_status: params.primaryBlocker
        ? `${params.subject} pede atenção porque há blocker ativo e o próximo movimento seguro é ${params.nextStep}.`
        : `${params.subject} pede acompanhamento porque a próxima ação mais consistente agora é ${params.nextStep}.`,
      blocked_run_resolution: params.primaryBlocker
        ? `A recomendação prioriza destravar o blocker "${params.primaryBlocker}" antes de abrir nova frente no caso.`
        : `A recomendação prioriza eliminar a pendência dominante antes de avançar o caso.`,
      next_best_action: helpers.asString(params.recommendedAction?.label)
        ? `A melhor ação agora é ${helpers.asString(params.recommendedAction?.label)?.toLowerCase()} porque ela reduz atrito e aumenta chance de avanço imediato.`
        : `A melhor ação agora é ${params.nextStep} porque ela concentra o próximo movimento com menor risco operacional.`,
    };

    return {
      summary: summaryByIntent[params.intent],
      confidence,
      reasonCodes,
      sourceRefs,
      ...(missingEvidence.length > 0 ? { missingEvidence } : {}),
      generatedAt: new Date().toISOString(),
    };
  }

  function isLeadScoringCase(caseContext?: ImobCrmCaseContext | null) {
    const flow = helpers.asString(caseContext?.flow);
    const journeyType = helpers.asString(caseContext?.canonical?.journeyType);
    return flow === "lead.qualify" || journeyType === "lead_qualification";
  }

  function getLeadScoringEvidence(caseContext?: ImobCrmCaseContext | null) {
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    const discoveryCount = [
      discoverySignals?.urgency,
      discoverySignals?.painPoint,
      discoverySignals?.motivation,
      discoverySignals?.timeline,
      discoverySignals?.decisionMaker,
    ].filter(Boolean).length;
    const substantiveOperationalCount = [
      caseContext?.humanWorkflow?.waitingOn && caseContext.humanWorkflow.waitingOn !== "internal"
        ? caseContext.humanWorkflow.waitingOn
        : null,
      caseContext?.humanWorkflow?.followUpRisk && caseContext.humanWorkflow.followUpRisk !== "low"
        ? caseContext.humanWorkflow.followUpRisk
        : null,
      Array.isArray(caseContext?.pendingItems) && caseContext.pendingItems.length > 0 ? caseContext.pendingItems[0] : null,
      helpers.asString(caseContext?.blocker),
    ].filter(Boolean).length;

    return {
      discoverySignals,
      discoveryCount,
      substantiveOperationalCount,
      hasMinimumEvidence: discoveryCount >= 1 || substantiveOperationalCount >= 2,
    };
  }

  function buildLeadScoreFactors(caseContext: ImobCrmCaseContext) {
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    const factors: Array<{
      key:
        | "budget_fit"
        | "urgency"
        | "engagement_readiness"
        | "decision_clarity"
        | "commercial_readiness"
        | "timeline_pressure";
      label: string;
      contribution: number;
      rationale: string;
    }> = [];

    if (discoverySignals?.urgency === "high") {
      factors.push({ key: "urgency", label: "Urgência", contribution: 20, rationale: "Lead declarou urgência alta para avançar." });
    } else if (discoverySignals?.urgency === "medium") {
      factors.push({ key: "urgency", label: "Urgência", contribution: 10, rationale: "Lead tem urgência moderada e janela comercial ativa." });
    } else if (discoverySignals?.urgency === "low") {
      factors.push({ key: "urgency", label: "Urgência", contribution: -4, rationale: "Lead não demonstrou urgência forte neste momento." });
    }

    if (discoverySignals?.timeline) {
      factors.push({ key: "timeline_pressure", label: "Janela de decisão", contribution: 10, rationale: `Existe janela explícita: ${discoverySignals.timeline}.` });
    }

    if (discoverySignals?.decisionMaker === "solo") {
      factors.push({ key: "decision_clarity", label: "Clareza de decisão", contribution: 10, rationale: "O próprio lead concentra a decisão." });
    } else if (discoverySignals?.decisionMaker === "shared") {
      factors.push({ key: "decision_clarity", label: "Clareza de decisão", contribution: 5, rationale: "A decisão é compartilhada, mas já está mapeada." });
    } else if (discoverySignals?.decisionMaker === "third_party") {
      factors.push({ key: "decision_clarity", label: "Clareza de decisão", contribution: -3, rationale: "A decisão depende de terceiro e tende a alongar o ciclo." });
    }

    if (discoverySignals?.budgetFlexibility === "moderate") {
      factors.push({ key: "budget_fit", label: "Flexibilidade de orçamento", contribution: 8, rationale: "Há alguma margem para ajustar orçamento sem travar a conversa." });
    } else if (discoverySignals?.budgetFlexibility === "flexible") {
      factors.push({ key: "budget_fit", label: "Flexibilidade de orçamento", contribution: 12, rationale: "O orçamento declarado admite ajuste e amplia aderência comercial." });
    } else if (discoverySignals?.budgetFlexibility === "strict") {
      factors.push({ key: "budget_fit", label: "Flexibilidade de orçamento", contribution: -4, rationale: "Orçamento está rígido e reduz margem para encaixe." });
    }

    if (discoverySignals?.painPoint) {
      factors.push({ key: "commercial_readiness", label: "Dor principal", contribution: 10, rationale: `A dor principal está clara: ${discoverySignals.painPoint}.` });
    }
    if (discoverySignals?.motivation) {
      factors.push({ key: "engagement_readiness", label: "Motivação", contribution: 8, rationale: `A motivação do lead já foi explicitada: ${discoverySignals.motivation}.` });
    }

    if (helpers.asString(caseContext?.lead?.phone) || helpers.asString(caseContext?.lead?.email)) {
      factors.push({
        key: "engagement_readiness",
        label: "Contato válido",
        contribution: 6,
        rationale: "Já existe ao menos um canal claro para retomada do lead.",
      });
    }

    if (helpers.asString(caseContext?.lead?.targetCity) && typeof caseContext?.lead?.budgetMaxCents === "number") {
      factors.push({
        key: "budget_fit",
        label: "Recorte comercial mínimo",
        contribution: 6,
        rationale: "Cidade alvo e orçamento já estão explícitos no caso.",
      });
    }

    if (helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label)) {
      factors.push({
        key: "commercial_readiness",
        label: "Próxima ação comercial",
        contribution: 6,
        rationale: `O caso já tem ação recomendada explícita: ${helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label)}.`,
      });
    }

    if (caseContext?.humanWorkflow?.followUpRisk === "high") {
      factors.push({ key: "engagement_readiness", label: "Risco de follow-up", contribution: -10, rationale: "O caso corre risco alto de esfriar sem retomada." });
    }
    if ((caseContext?.humanWorkflow?.agingHours ?? 0) >= 72) {
      factors.push({ key: "engagement_readiness", label: "Aging do caso", contribution: -10, rationale: "O caso está envelhecido e perdeu calor comercial." });
    }
    if (helpers.asString(caseContext?.blocker)) {
      factors.push({ key: "commercial_readiness", label: "Blocker ativo", contribution: -8, rationale: `Existe blocker ativo: ${helpers.asString(caseContext?.blocker)}.` });
    }
    if ((Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems.length : 0) >= 3) {
      factors.push({ key: "commercial_readiness", label: "Pendências abertas", contribution: -8, rationale: "Há muitas pendências abertas para uma priorização comercial forte." });
    }
    if (caseContext?.humanWorkflow?.waitingOn === "internal") {
      factors.push({ key: "decision_clarity", label: "Waiting on interno", contribution: -5, rationale: "O caso ainda depende de coordenação interna e isso reduz clareza de avanço imediato." });
    }

    return factors;
  }

  function buildLeadScoreSnapshot(caseContext: ImobCrmCaseContext) {
    const evidence = getLeadScoringEvidence(caseContext);
    if (!evidence.hasMinimumEvidence) {
      return {
        scoreBand: "UNKNOWN" as const,
        scoreValue: 0,
        scoreVersion: "imob.lead_scoring.v1" as const,
        summary: "Ainda não há evidência suficiente para classificar este lead com segurança.",
        factors: [],
        missingEvidence: [
          !evidence.discoverySignals?.urgency ? "urgência real ainda não confirmada" : null,
          !evidence.discoverySignals?.decisionMaker ? "quem decide ainda não está claro" : null,
          !evidence.discoverySignals?.timeline ? "janela de decisão ainda não foi explicitada" : null,
          !helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label) ? "ação recomendada do caso não está explícita" : null,
        ].filter(Boolean) as string[],
        shadowMode: true as const,
        generatedAt: new Date().toISOString(),
      };
    }

    const factors = buildLeadScoreFactors(caseContext);
    const scoreValue = Math.max(0, Math.min(100, 30 + factors.reduce((sum, factor) => sum + factor.contribution, 0)));
    const scoreBand = scoreValue >= 70 ? "HOT" : scoreValue >= 40 ? "WARM" : "COLD";
    const missingEvidence = [
      !evidence.discoverySignals?.urgency ? "urgência real ainda não confirmada" : null,
      !evidence.discoverySignals?.decisionMaker ? "quem decide ainda não está claro" : null,
      !evidence.discoverySignals?.timeline ? "janela de decisão ainda não foi explicitada" : null,
    ].filter(Boolean) as string[];
    const summary =
      scoreBand === "HOT"
        ? "Lead com urgência e contexto comercial suficientes para priorização humana imediata."
        : scoreBand === "WARM"
          ? "Lead com sinais promissores, mas ainda depende de confirmação adicional para avanço."
          : "Lead com baixo readiness comercial no momento e pendências relevantes.";

    return {
      scoreBand,
      scoreValue,
      scoreVersion: "imob.lead_scoring.v1" as const,
      summary,
      factors,
      ...(missingEvidence.length > 0 ? { missingEvidence } : {}),
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
  }

  function isLeadCommercialMemoryCase(caseContext?: ImobCrmCaseContext | null) {
    const flow = helpers.asString(caseContext?.flow);
    const journeyType = helpers.asString(caseContext?.canonical?.journeyType);
    return flow === "lead.qualify" || journeyType === "lead_qualification";
  }

  function buildCommercialPreferences(caseContext: ImobCrmCaseContext) {
    const lead = caseContext?.lead;
    const discoverySignals = lead?.discoverySignals ?? null;
    const preferences = [
      helpers.asString(lead?.goal)
        ? { key: "goal", label: "Objetivo", value: helpers.asString(lead?.goal)!, source: "crm_case" as const }
        : null,
      helpers.asString(lead?.targetCity)
        ? { key: "target_city", label: "Cidade-alvo", value: helpers.asString(lead?.targetCity)!, source: "crm_case" as const }
        : null,
      typeof lead?.budgetMaxCents === "number" && helpers.formatBudgetCentsForImob(lead.budgetMaxCents)
        ? { key: "budget", label: "Orçamento", value: helpers.formatBudgetCentsForImob(lead.budgetMaxCents)!, source: "crm_case" as const }
        : null,
      discoverySignals?.budgetFlexibility
        ? {
            key: "budget_flexibility",
            label: "Flexibilidade de orçamento",
            value: discoverySignals.budgetFlexibility,
            source: "conversation" as const,
          }
        : null,
      discoverySignals?.painPoint
        ? { key: "pain_point", label: "Dor principal", value: discoverySignals.painPoint, source: "conversation" as const }
        : null,
      discoverySignals?.motivation
        ? { key: "motivation", label: "Motivação", value: discoverySignals.motivation, source: "conversation" as const }
        : null,
    ].filter(Boolean);

    return preferences as Array<{
      key: "goal" | "target_city" | "budget" | "budget_flexibility" | "pain_point" | "motivation";
      label: string;
      value: string;
      source: "declared" | "conversation" | "crm_case";
    }>;
  }

  function buildCommercialObjections(caseContext: ImobCrmCaseContext) {
    const blocker = helpers.asString(caseContext?.blocker);
    const pendingItems = Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems.map(String) : [];
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    const normalizedPending = pendingItems.map((item) => helpers.normalizeImobRouteText(item));
    const objections = [
      (blocker && /document|matricula|contrato|ownerdocument|jurid/i.test(blocker))
        || normalizedPending.some((item) => /document|matricula|contrato|ownerdocument/.test(item))
        ? {
            key: "documentation" as const,
            label: "Objeção documental",
            summary: blocker ?? pendingItems[0] ?? "Existe pendência documental travando o avanço.",
            status: "active" as const,
          }
        : null,
      discoverySignals?.budgetFlexibility === "strict" || normalizedPending.some((item) => item.includes("orcamento") || item.includes("orçamento"))
        ? {
            key: "budget" as const,
            label: "Objeção de orçamento",
            summary: discoverySignals?.budgetFlexibility === "strict"
              ? "O orçamento está rígido e pode limitar aderência comercial."
              : "Ainda há revalidação de orçamento pendente.",
            status: "active" as const,
          }
        : null,
      discoverySignals?.decisionMaker === "shared" || discoverySignals?.decisionMaker === "third_party"
        ? {
            key: "decision_maker" as const,
            label: "Objeção de decisor",
            summary: discoverySignals.decisionMaker === "shared"
              ? "A decisão é compartilhada e exige alinhamento adicional."
              : "A decisão depende de terceiro e tende a alongar o ciclo.",
            status: "active" as const,
          }
        : null,
      caseContext?.humanWorkflow?.followUpRisk === "high"
        ? {
            key: "follow_up_risk" as const,
            label: "Risco de follow-up",
            summary: "O caso pode esfriar sem retomada rápida.",
            status: "active" as const,
          }
        : null,
      (!blocker && pendingItems.length === 0 && !discoverySignals?.painPoint && !discoverySignals?.motivation)
        ? {
            key: "readiness" as const,
            label: "Readiness comercial",
            summary: "Ainda falta contexto comercial suficiente para leitura forte.",
            status: "unknown" as const,
          }
        : null,
      discoverySignals?.timeline && caseContext?.humanWorkflow?.urgency !== "high"
        ? {
            key: "timing" as const,
            label: "Objeção de timing",
            summary: `Existe janela declarada (${discoverySignals.timeline}) que ainda precisa ser confirmada com mais clareza.`,
            status: "active" as const,
          }
        : null,
    ].filter(Boolean);

    return objections as Array<{
      key: "budget" | "timing" | "decision_maker" | "documentation" | "follow_up_risk" | "readiness";
      label: string;
      summary: string;
      status: "active" | "mitigated" | "unknown";
    }>;
  }

  function buildCommercialUrgencySignals(caseContext: ImobCrmCaseContext, leadScore?: { scoreBand?: string } | null) {
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    const urgencySignals = [
      discoverySignals?.urgency === "high" ? "urgência declarada alta" : null,
      discoverySignals?.timeline ? `janela explícita: ${discoverySignals.timeline}` : null,
      caseContext?.humanWorkflow?.followUpRisk === "high" ? "follow-up risk alto" : null,
      (caseContext?.humanWorkflow?.agingHours ?? 0) >= 72 ? "caso envelhecido" : null,
      leadScore?.scoreBand === "HOT" ? "lead score em faixa HOT" : null,
    ].filter(Boolean);
    return urgencySignals as string[];
  }

  function buildCommercialLastUsefulAction(caseContext: ImobCrmCaseContext) {
    return helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label)
      ?? helpers.asString(caseContext?.nextStep)
      ?? null;
  }

  function buildCommercialNextTrigger(caseContext: ImobCrmCaseContext, objections: Array<{ key: string }>) {
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    const blocker = helpers.asString(caseContext?.blocker);
    const pendingItems = Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems.map(String) : [];
    const normalizedPending = pendingItems.map((item) => helpers.normalizeImobRouteText(item));

    if (
      (blocker && /document|matricula|contrato|jurid/i.test(blocker))
      || normalizedPending.some((item) => /document|matricula|contrato|ownerdocument/.test(item))
    ) {
      return {
        kind: "document_pending" as const,
        summary: "Cobrar a pendência documental que libera a próxima validação.",
      };
    }
    if (caseContext?.humanWorkflow?.followUpRisk === "high") {
      return {
        kind: "follow_up" as const,
        summary: "Retomar o lead antes que o caso esfrie.",
      };
    }
    if (discoverySignals?.timeline) {
      return {
        kind: "decision_window" as const,
        summary: `Usar a janela declarada (${discoverySignals.timeline}) como gatilho de retomada.`,
      };
    }
    if (objections.some((item) => item.key === "budget")) {
      return {
        kind: "budget_revalidation" as const,
        summary: "Revalidar orçamento e margem de flexibilidade antes do próximo movimento.",
      };
    }
    return {
      kind: "readiness_check" as const,
      summary: "Revisar readiness comercial antes de insistir em visita, proposta ou novo handoff.",
    };
  }

  function buildCommercialMemorySnapshot(params: {
    caseContext: ImobCrmCaseContext;
    decisionRationale?: { summary?: string | null } | null;
    leadScore?: { scoreBand?: string; summary?: string | null } | null;
  }) {
    const { caseContext } = params;
    const fullLeadMode = isLeadCommercialMemoryCase(caseContext);
    const preferences = buildCommercialPreferences(caseContext);
    const objections = buildCommercialObjections(caseContext);
    const urgencySignals = buildCommercialUrgencySignals(caseContext, params.leadScore ?? null);
    const lastUsefulAction = buildCommercialLastUsefulAction(caseContext);
    const nextTrigger = buildCommercialNextTrigger(caseContext, objections);
    const effectivePreferences = fullLeadMode ? preferences : preferences.filter((item) =>
      item.key === "goal" || item.key === "target_city" || item.key === "budget",
    );
    const effectiveObjections = fullLeadMode ? objections : objections.slice(0, 2);

    const summary = fullLeadMode
      ? [
          params.leadScore?.summary ?? null,
          params.decisionRationale?.summary ?? null,
          urgencySignals[0] ? `Sinal dominante: ${urgencySignals[0]}.` : null,
        ].filter(Boolean).join(" ")
      : [
          params.decisionRationale?.summary ?? null,
          urgencySignals[0] ? `Sinal dominante: ${urgencySignals[0]}.` : null,
          lastUsefulAction ? `Última ação útil: ${lastUsefulAction}.` : null,
        ].filter(Boolean).join(" ");

    return {
      summary: summary || "Memória comercial consultiva consolidada a partir do caso atual.",
      preferences: effectivePreferences,
      objections: effectiveObjections,
      urgencySignals,
      lastUsefulAction,
      nextTrigger,
      generatedAt: new Date().toISOString(),
    };
  }

  function getImobBusinessRecommendedAction(caseContext: ImobCrmCaseContext) {
    const actions = Array.isArray(caseContext?.canonical?.recommendedActions)
      ? caseContext.canonical.recommendedActions
      : [];
    return actions[0] ?? null;
  }

  function getImobBusinessPendingItems(caseContext: ImobCrmCaseContext): string[] {
    const pendingItems = Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems : [];
    const missingContext = Array.isArray(caseContext?.canonical?.missingContext) ? caseContext.canonical.missingContext : [];
    return Array.from(new Set([...pendingItems, ...missingContext].map((item) => String(item)).filter(Boolean)));
  }

  function getImobBusinessBlockers(caseContext: ImobCrmCaseContext): string[] {
    const blockers = [
      ...(helpers.asString(caseContext?.blocker) ? [String(caseContext.blocker)] : []),
      ...(Array.isArray(caseContext?.canonical?.blockedActions) ? caseContext.canonical.blockedActions : []),
    ];
    return Array.from(new Set(blockers.map((item) => String(item)).filter(Boolean)));
  }

  function buildImobBusinessActionCtas(caseContext: ImobCrmCaseContext) {
    const actions = Array.isArray(caseContext?.canonical?.recommendedActions)
      ? caseContext.canonical.recommendedActions
      : [];
    return actions
      .map((item: any) => ({
        id: `case-action-${String(item?.id ?? "next")}`,
        label: String(item?.label ?? "Próximo passo"),
        kind: "primary" as const,
        action: "send_suggested_message" as const,
        nextMessage: helpers.asString(item?.inputHint) ?? helpers.asString(item?.label) ?? "mostrar próximo passo do caso",
      }))
      .filter((item: any) => item.label && item.nextMessage)
      .slice(0, 3);
  }

  function buildBlockedRunResolutionCtas(caseContext: ImobCrmCaseContext, pendingItems: string[]) {
    const normalizedPending = pendingItems.map((item) => helpers.normalizeImobRouteText(String(item)));
    const hasOwnerPending = normalizedPending.some((item) => item.includes("proprietario") || item.includes("proprietária"));
    const hasPropertyPending = normalizedPending.some((item) => item.includes("imovel") || item.includes("imóvel"));
    const hasLeadPending = normalizedPending.some((item) => item.includes("lead") || item.includes("comprador") || item.includes("locatario"));

    const ctas = [] as Array<{
      id: string;
      label: string;
      kind: "primary" | "secondary" | "neutral";
      action: "send_suggested_message";
      nextMessage: string;
    }>;

    if (hasOwnerPending) {
      ctas.push({
        id: `case-unblock-owner-${caseContext?.caseId ?? "current"}`,
        label: "Cadastrar proprietário",
        kind: "primary",
        action: "send_suggested_message",
        nextMessage: "cadastrar proprietário",
      });
    }
    if (hasPropertyPending) {
      ctas.push({
        id: `case-unblock-property-${caseContext?.caseId ?? "current"}`,
        label: "Cadastrar imóvel",
        kind: hasOwnerPending ? "secondary" : "primary",
        action: "send_suggested_message",
        nextMessage: "cadastrar imóvel",
      });
    }
    if (hasLeadPending) {
      ctas.push({
        id: `case-unblock-lead-${caseContext?.caseId ?? "current"}`,
        label: "Qualificar lead",
        kind: hasOwnerPending || hasPropertyPending ? "secondary" : "primary",
        action: "send_suggested_message",
        nextMessage: "qualificar lead",
      });
    }

    ctas.push({
      id: `case-unblock-status-${caseContext?.caseId ?? "current"}`,
      label: "Consultar caso",
      kind: "neutral",
      action: "send_suggested_message",
      nextMessage: "consultar caso",
    });
    return ctas.slice(0, 3);
  }

  function buildBlockedRunResolutionNextStep(
    caseContext: ImobCrmCaseContext,
    pendingItems: string[],
    rawNextStep: string | null | undefined,
  ) {
    const normalizedCurrentNextStep = helpers.normalizeImobRouteText(rawNextStep ?? helpers.asString(caseContext?.nextStep) ?? "");
    if (normalizedCurrentNextStep.includes("mostrar bloqueios do caso") && pendingItems.length === 0) {
      return "consultar caso";
    }
    if (!normalizedCurrentNextStep.includes("mostrar bloqueios do caso")) {
      return formatImobBusinessNextStep(helpers.asString(caseContext?.nextStep), caseContext);
    }

    const normalizedPending = pendingItems.map((item) => helpers.normalizeImobRouteText(String(item)));
    if (normalizedPending.some((item) => item.includes("proprietario") || item.includes("proprietária"))) {
      return "cadastrar proprietário";
    }
    if (normalizedPending.some((item) => item.includes("imovel") || item.includes("imóvel"))) {
      return "cadastrar imóvel";
    }
    if (normalizedPending.some((item) => item.includes("lead") || item.includes("comprador") || item.includes("locatario"))) {
      return "qualificar lead";
    }
    return "consultar caso";
  }

  function buildImobBusinessReadPresentation(params: {
    intent: BusinessReadIntent;
    caseContext: ImobCrmCaseContext;
    caseSelectionNote?: string | null;
  }) {
    const { intent, caseContext } = params;
    const journeyLabel = formatImobJourneyLabel(caseContext?.canonical?.journeyType);
    const stageLabel = formatImobCommercialStageLabel(caseContext);
    const pendingItems = getImobBusinessPendingItems(caseContext);
    const blockers = getImobBusinessBlockers(caseContext);
    const recommendedAction = getImobBusinessRecommendedAction(caseContext);
    const rawNextStep = helpers.asString(recommendedAction?.inputHint) ?? helpers.asString(caseContext?.nextStep);
    const nextStep = intent === "blocked_run_resolution"
      ? buildBlockedRunResolutionNextStep(caseContext, pendingItems, rawNextStep)
      : formatImobBusinessNextStep(rawNextStep, caseContext);
    const primaryPending = pendingItems[0] ?? null;
    const primaryBlocker = blockers[0] ?? null;
    const actionLabel = helpers.asString(recommendedAction?.label) ?? "Revisar caso";
    const selectionNote = helpers.asString(params.caseSelectionNote);
    const subject = formatImobBusinessSubject(caseContext);
    const humanPhase = helpers.asString(caseContext?.humanJourney?.phase);
    const humanPhaseLabel = humanPhase ? titleCaseJourneyPhase(humanPhase) : journeyLabel;
    const waitingOn = formatWaitingOnLabel(caseContext?.humanWorkflow?.waitingOn);
    const nextActionOwner = helpers.asString(caseContext?.humanWorkflow?.nextActionOwner) ?? helpers.asString(caseContext?.ownerResponsible);
    const specialists = (helpers.resolveImobBackingSpecialists(caseContext) as any[] | null | undefined) ?? [];
    const primarySpecialist = specialists[0] ? buildSpecialistSupportLine(specialists[0]) : null;
    const caseBrief = buildCaseBrief({
      subject,
      humanPhaseLabel,
      phaseObjective: helpers.asString(caseContext?.humanJourney?.phaseObjective),
      primaryBlocker,
      primaryPending,
      waitingOn: caseContext?.humanWorkflow?.waitingOn,
      nextActionOwner,
      nextStep,
      primarySpecialistAgentId: primarySpecialist?.consultive.agentId ?? null,
      discoverySignals: caseContext?.lead?.discoverySignals ?? null,
    });
    const preparedFollowUp = buildPreparedFollowUp({
      subject,
      humanPhaseLabel,
      waitingOn: caseContext?.humanWorkflow?.waitingOn,
      primaryBlocker,
      primaryPending,
      nextStep,
      discoverySignals: caseContext?.lead?.discoverySignals ?? null,
    });
    const actionableChecklist = buildActionableChecklist({
      pendingItems,
      primaryBlocker,
      waitingOnLabel: waitingOn,
      nextStep,
      urgency: caseContext?.humanWorkflow?.urgency,
      discoverySignals: caseContext?.lead?.discoverySignals ?? null,
    });
    const decisionRationale = buildDecisionRationale({
      intent,
      caseContext,
      subject,
      nextStep,
      primaryBlocker,
      pendingItems,
      waitingOn,
      nextActionOwner,
      recommendedAction,
      specialists,
    });
    const handoffPack = buildHandoffPack({
      specialist: primarySpecialist,
      caseBrief,
      primaryBlocker,
      pendingItems,
      urgency: caseContext?.humanWorkflow?.urgency,
    });
    const leadScore = isLeadScoringCase(caseContext) ? buildLeadScoreSnapshot(caseContext) : undefined;
    const commercialMemory = buildCommercialMemorySnapshot({
      caseContext,
      decisionRationale,
      leadScore,
    });
    const statusLine = `${subject}. Momento comercial: ${stageLabel}. Jornada: ${journeyLabel}.`;
    const baseLines = [selectionNote ? "Usei o cadastro mais recente do IMOB para esta leitura." : null, statusLine].filter(Boolean) as string[];
    const textByIntent: Record<BusinessReadIntent, string[]> = {
      pipeline_status: [
        ...baseLines,
        humanPhaseLabel ? `Fase: ${humanPhaseLabel}.` : null,
        primaryPending ? `Pendência principal: ${primaryPending}.` : "Pendência principal: nada crítico registrado.",
        primaryBlocker ? `Bloqueio atual: ${primaryBlocker}.` : "Bloqueio atual: nenhum bloqueio comercial registrado.",
        waitingOn ? `Waiting on: ${waitingOn}.` : null,
        nextActionOwner ? `Owner da ação: ${nextActionOwner}.` : null,
        primarySpecialist?.text ?? null,
        `Próximo movimento: ${nextStep}.`,
      ],
      blocked_run_resolution: [
        ...baseLines,
        humanPhaseLabel ? `Fase: ${humanPhaseLabel}.` : null,
        primaryBlocker ? `Bloqueio principal: ${primaryBlocker}.` : "Não há bloqueio comercial registrado agora.",
        primaryPending ? `Pendência que pode travar o avanço: ${primaryPending}.` : "Não há pendência crítica registrada.",
        waitingOn ? `Waiting on: ${waitingOn}.` : null,
        nextActionOwner ? `Owner da ação: ${nextActionOwner}.` : null,
        primarySpecialist?.text ?? null,
        `Para destravar: ${nextStep}.`,
      ],
      next_best_action: [
        ...baseLines,
        humanPhaseLabel ? `Fase: ${humanPhaseLabel}.` : null,
        `Melhor ação agora: ${actionLabel}.`,
        primaryBlocker ? `Motivo: existe bloqueio ativo (${primaryBlocker}).` : primaryPending ? `Motivo: existe pendência aberta (${primaryPending}).` : "Motivo: é o movimento com maior chance de avançar este atendimento.",
        waitingOn ? `Waiting on: ${waitingOn}.` : null,
        nextActionOwner ? `Owner da ação: ${nextActionOwner}.` : null,
        primarySpecialist?.text ?? null,
        `Como seguir: ${nextStep}.`,
      ],
    };
    const cardTitleByIntent: Record<BusinessReadIntent, string> = {
      pipeline_status: "Leitura comercial",
      blocked_run_resolution: "Como destravar o atendimento",
      next_best_action: "Melhor próximo movimento",
    };
    const fallbackCtas = [{
      id: `case-open-${caseContext?.caseId ?? "current"}`,
      label: "Ver leitura comercial",
      kind: "secondary" as const,
      action: "send_suggested_message" as const,
      nextMessage: "qual status desse caso?",
    }];
    const defaultCtas = [...buildImobBusinessActionCtas(caseContext), ...fallbackCtas]
      .filter((item) => !(intent === "blocked_run_resolution" && helpers.normalizeImobRouteText(item.nextMessage).includes("mostrar bloqueios do caso")))
      .slice(0, 3);
    const ctas = intent === "blocked_run_resolution"
      ? buildBlockedRunResolutionCtas(caseContext, pendingItems)
      : defaultCtas;
    return {
      text: textByIntent[intent].filter(Boolean).join("\n"),
      owner: caseContext?.ownerResponsible ?? "Corretor",
      nextStep,
      blocker: primaryBlocker ?? undefined,
      consultiveRead: {
        phase: humanPhaseLabel,
        blocker: primaryBlocker ?? null,
        waitingOn: caseContext?.humanWorkflow?.waitingOn ?? null,
        nextActionOwner: nextActionOwner ?? null,
        nextSafeStep: nextStep,
        specialists: specialists.slice(0, 2).map((item) => buildSpecialistSupportLine(item).consultive),
      },
      caseBrief,
      preparedFollowUp,
      actionableChecklist,
      decisionRationale,
      ...(leadScore ? { leadScore } : {}),
      commercialMemory,
      handoffPack,
      pendingFieldLabels: pendingItems,
      suggestedNextAction: nextStep,
      widget: buildImobCaseExperienceWidget(caseContext),
      dedupeKey: `crm.case.${intent}:${caseContext?.caseId ?? "unknown"}`,
      card: {
        title: cardTitleByIntent[intent],
        lines: [
          subject,
          `Fase: ${humanPhaseLabel}`,
          `Momento: ${stageLabel}`,
          `Pendências: ${helpers.formatImobPendingList(pendingItems)}`,
          primaryBlocker ? `Bloqueio: ${primaryBlocker}` : "Bloqueio: nenhum bloqueio comercial",
          waitingOn ? `Waiting on: ${waitingOn}` : "Waiting on: não identificado",
          nextActionOwner ? `Owner da ação: ${nextActionOwner}` : "Owner da ação: não identificado",
          primarySpecialist?.cardLine ?? null,
          `Próximo movimento: ${nextStep}`,
        ].filter(Boolean) as string[],
        ctas,
      },
    };
  }

  function titleCaseJourneyPhase(value: string) {
    switch (value) {
      case "captacao":
        return "Captação";
      case "qualificacao":
        return "Qualificação";
      case "atendimento_ativo":
        return "Atendimento";
      case "visita":
        return "Visita";
      case "proposta":
        return "Proposta";
      case "negociacao":
        return "Negociação";
      case "documentacao":
        return "Documentação";
      case "fechamento":
        return "Fechamento";
      case "pos_venda":
        return "Pós-venda";
      default:
        return helpers.titleCaseRouteWords(value.replace(/_/g, " "));
    }
  }

  function isImobRecentRegistrationReadRequest(normalized: string) {
    return (
      normalized.includes("liste o que cadastrou") ||
      normalized.includes("listar o que cadastrou") ||
      normalized.includes("mostre o que cadastrou") ||
      normalized.includes("mostrar o que cadastrou") ||
      normalized.includes("o que cadastrou") ||
      normalized.includes("o que cadastrei") ||
      normalized.includes("listar cadastro") ||
      normalized.includes("mostrar cadastro")
    );
  }

  function isBulkPropertyOnboardingQuestion(normalized: string) {
    const hasPropertyPlural = normalized.includes("imoveis") || normalized.includes("imóveis") || normalized.includes("propriedades");
    const hasCreateIntent = normalized.includes("cadastrar") || normalized.includes("captar") || normalized.includes("incluir");
    const asksHow = normalized.includes("mostrar modelo") || normalized.includes("ver modelo") || normalized.includes("como faco") || normalized.includes("como faço") || normalized.includes("como proceder") || normalized.includes("como cadastrar") || normalized.includes("como continuar") || normalized.includes("como contuar");
    const hasQuantity = /\b\d+\b/.test(normalized) || normalized.includes("varios") || normalized.includes("vários") || normalized.includes("lote");
    return hasPropertyPlural && hasCreateIntent && (asksHow || hasQuantity);
  }

  function buildBulkPropertyOnboardingConsult(params: { threadState: ImobCrmConversationState | null | undefined }) {
    return {
      mode: "consult",
      action: "crm.property.bulk_onboarding_guidance",
      threadLabel: "Captação",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: [
          "Para cadastrar vários imóveis, o melhor caminho é fazer a captação em lote com dados mínimos por imóvel.",
          "Separe cada imóvel com: tipo, finalidade, cidade, endereço e, se já tiver, proprietário e valor.",
          "Pode me mandar em lista, um por linha, que eu preparo a captação de cada imóvel sem misturar com cadastro de proprietário.",
        ].join("\n"),
        owner: "Corretor",
        nextStep: "Enviar a lista dos imóveis com tipo, finalidade, cidade e endereço.",
        suggestedNextAction: "Enviar lista de imóveis para captação em lote.",
        card: {
          title: "Captação em lote",
          lines: [
            "Formato sugerido:",
            "1. apartamento | locação | Balneário Camboriú | Rua 1000, 123",
            "2. casa | venda | Itajaí | Rua 200, 45",
            "Se tiver proprietário e valor, inclua no final da linha.",
          ],
          ctas: [
            { id: "property-bulk-example", label: "Ver modelo", kind: "primary" as const, action: "send_suggested_message" as const, nextMessage: "mostrar modelo para cadastrar imóveis em lote" },
            { id: "property-single-create", label: "Cadastrar um imóvel", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: "cadastrar imóvel" },
          ],
        },
        dedupeKey: "crm.property.bulk_onboarding_guidance",
      },
    };
  }

  async function buildImobRecentRegistrationConsult(params: {
    prisma: any;
    tenantId: string;
    workspaceId: string;
    caseId?: string | null;
    threadState: ImobCrmConversationState | null | undefined;
  }) {
    const latestCase = params.caseId
      ? await params.prisma.imobCase.findFirst({
          where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: { owner: true, property: true, lead: true, _count: { select: { events: true } } },
        })
      : await params.prisma.imobCase.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: { owner: true, property: true, lead: true, _count: { select: { events: true } } },
        });
    if (!latestCase) {
      return {
        mode: "consult",
        action: "crm.case.recent_registration",
        threadLabel: "Caso",
        conversationState: params.threadState ?? helpers.createEmptyThreadState(),
        presentation: {
          text: "Não encontrei cadastro recente no IMOB para listar.",
          suggestedNextAction: "Cadastre um lead, proprietário ou imóvel antes de pedir o resumo do cadastro.",
          card: { title: "Cadastro não encontrado", lines: ["Nenhum caso IMOB recente foi encontrado neste workspace."] },
        },
      };
    }
    const lead = latestCase.lead as any;
    const property = latestCase.property as any;
    const owner = latestCase.owner as any;
    const pendingItems = helpers.asStringList(latestCase.pendingItems);
    const caseContext = buildCaseContextFromRecord(latestCase);
    const lines = [
      `Jornada: ${formatImobJourneyLabel(caseContext.canonical?.journeyType)}.`,
      lead?.name ? `Lead: ${lead.name}` : null,
      lead?.phone ? `Telefone: ${lead.phone}` : null,
      lead?.email ? `E-mail: ${lead.email}` : null,
      lead?.goal ? `Objetivo: ${lead.goal}` : null,
      lead?.targetCity ? `Cidade de interesse: ${lead.targetCity}` : null,
      lead?.budgetMaxCents ? `Orçamento: ${helpers.formatBudgetCentsForImob(lead.budgetMaxCents)}` : null,
      property?.address ? `Imóvel: ${property.address}` : property?.id ? `Imóvel: ${property.id}` : null,
      owner?.name ? `Proprietário: ${owner.name}` : null,
      `Status: ${helpers.formatImobStatusLabel(latestCase.status)}.`,
      `Pendências: ${helpers.formatImobPendingList(pendingItems)}.`,
      latestCase.nextStep ? `Próximo passo: ${latestCase.nextStep}` : null,
    ].filter(Boolean) as string[];
    return {
      mode: "consult",
      action: "crm.case.recent_registration",
      threadLabel: helpers.formatImobCaseFlowLabel(latestCase.flow),
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      caseContext,
      presentation: {
        text: [
          lead?.name ? `Cadastro do lead ${lead.name} localizado.` : `Cadastro ${helpers.formatImobCaseFlowLabel(latestCase.flow)} localizado.`,
          `Pendências atuais: ${helpers.formatImobPendingList(pendingItems)}.`,
          latestCase.nextStep ? `Próximo passo: ${latestCase.nextStep}` : null,
        ].filter(Boolean).join("\n"),
        owner: latestCase.ownerResponsible ?? "Corretor",
        nextStep: latestCase.nextStep ?? undefined,
        pendingFieldLabels: pendingItems,
        suggestedNextAction: latestCase.nextStep ?? "Vincular este cadastro ao próximo passo comercial.",
        widget: buildImobCaseExperienceWidget(caseContext),
        dedupeKey: `crm.case.recent_registration:${latestCase.id}`,
        card: {
          title: lead?.name ? `Cadastro do lead ${lead.name}` : `Cadastro ${helpers.formatImobCaseFlowLabel(latestCase.flow)}`,
          lines,
          ctas: [
            { id: `case-next-${latestCase.id}`, label: "Próximo passo", kind: "primary" as const, action: "send_suggested_message" as const, nextMessage: latestCase.nextStep ?? "qual próximo passo deste caso?" },
            { id: `case-status-${latestCase.id}`, label: "Status do caso", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: "qual status desse caso?" },
          ],
        },
      },
    };
  }

  function applyCanonicalJourneyToResolvedData<T extends { presentation?: Record<string, unknown> | null; caseContext?: ImobCrmCaseContext }>(data: T, caseContext?: ImobCrmCaseContext | null): T & { caseContext?: ImobCrmCaseContext } {
    const effectiveCaseContext = caseContext ?? data.caseContext ?? null;
    if (!effectiveCaseContext?.canonical) return { ...data, ...(effectiveCaseContext ? { caseContext: effectiveCaseContext } : {}) };
    const firstRecommended = effectiveCaseContext.canonical.recommendedActions?.[0];
    const suggestedNextAction = helpers.asString(data.presentation?.suggestedNextAction) ?? helpers.asString(firstRecommended?.inputHint) ?? helpers.asString(firstRecommended?.label);
    const shouldInjectWidget = !data.presentation?.card || (Array.isArray(effectiveCaseContext.pendingItems) && effectiveCaseContext.pendingItems.length > 0) || Boolean(helpers.asString(effectiveCaseContext.blocker));
    return {
      ...data,
      caseContext: effectiveCaseContext,
      presentation: data.presentation ? { ...data.presentation, suggestedNextAction, widget: data.presentation.widget ?? (shouldInjectWidget ? buildImobCaseExperienceWidget(effectiveCaseContext) : undefined) } : data.presentation,
    };
  }

  function withRouteCanonicalCaseContext<T extends { caseContext?: ImobCrmCaseContext }>(data: T): T {
    if (!data.caseContext) return data;
    return {
      ...data,
      caseContext: {
        ...data.caseContext,
        canonical: helpers.buildImobCanonicalCase({
          flow: data.caseContext.flow,
          stage: data.caseContext.stage,
          status: data.caseContext.status,
          ownerResponsible: data.caseContext.ownerResponsible,
          nextStep: data.caseContext.nextStep,
          blockers: data.caseContext.blocker ? [data.caseContext.blocker] : [],
          pendingItems: data.caseContext.pendingItems,
        }),
      },
    };
  }

  return {
    buildCaseContextFromRecord,
    resolveImobBusinessReadIntent: helpers.resolveBusinessReadIntent,
    buildImobBusinessReadPresentation,
    isImobRecentRegistrationReadRequest,
    isBulkPropertyOnboardingQuestion,
    buildBulkPropertyOnboardingConsult,
    buildImobRecentRegistrationConsult,
    applyCanonicalJourneyToResolvedData,
    withRouteCanonicalCaseContext,
    extractListCityFilter(message: string) {
      const normalized = helpers.normalizeImobRouteText(message);
      const match = normalized.match(/\bem\s+([a-z]+(?:\s+[a-z]+){0,2})/);
      return match?.[1] ?? null;
    },
  };
}
