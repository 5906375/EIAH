import type {
  ImobCrmCanonicalCase,
  ImobCrmCaseContext,
  ImobCrmConversationState,
  ImobClosingDocumentsSnapshot,
  ImobLeadProfileReportSnapshot,
  ImobLeadScoringSnapshot,
  ImobViabilityMarketAnalysisSnapshot,
} from "./imobCrmAgentContract";
import { buildImobCrmCaseContextFromRecord } from "./imobCrmCaseContext";
import {
  executeClosingSpecialist,
  executeInventoryWatchSpecialist,
  executeLeadProfileSpecialist,
  executeLeadScoringSpecialist,
  executeMissionOrchestrationSpecialist,
  executeReengagementSpecialist,
  executeRelationshipMemorySpecialist,
  executeViabilitySpecialist,
} from "../specialists/imobCaseSpecialists";
import {
  createImobPilotFlowState,
  runImobAssistedCalendarFlow,
  runImobAssistedListingFlow,
  runImobAssistedReengagementFlow,
  runImobShadowCaptureEnrichmentFlow,
} from "../imobPilotFlowRuntime";
import { buildImobPilotControlSurface } from "../imobPilotControlSurface";
import { buildImobPilotOperationalSurface } from "../imobPilotOperationalSurface";
import { resolveImobMissionRuntime } from "../imobMissionRuntime";
import {
  buildImobCrmWorkflowReasonCodes,
  deriveImobCrmReviewState,
  filterImobCrmWorkflowCtas,
  getAllowedTransitions,
  getBlockerReason,
  isImobCrmWorkflowNextMessageValid,
  type ImobCrmWorkflowContext,
  type ImobCrmWorkflowCta,
  type ImobCrmWorkflowState,
} from "./imobCrmWorkflowMachine";

type BusinessReadIntent = "pipeline_status" | "blocked_run_resolution" | "next_best_action" | "workspace_case_list";
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
    lead?: ImobCrmCaseContext["lead"];
    property?: ImobCrmCaseContext["property"];
    owner?: ImobCrmCaseContext["owner"];
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
    if (caseContext?.commercialFollowUp?.status === "awaiting_response") {
      return caseContext.commercialFollowUp.source === "proposal_negotiation"
        ? "Aguardando resposta da proposta"
        : "Aguardando resposta do lead";
    }
    if (caseContext?.commercialFollowUp?.status === "follow_up_required") return "Follow-up comercial pendente";
    if (caseContext?.commercialFollowUp?.status === "reengagement_required") {
      return caseContext.commercialFollowUp.source === "proposal_negotiation"
        ? "Retomada comercial da proposta pendente"
        : "Reengajamento comercial pendente";
    }
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
    const commercialFollowUpMove = helpers.asString(caseContext?.commercialFollowUp?.recommendedNextMove);
    if (commercialFollowUpMove) return commercialFollowUpMove;
    const normalized = helpers.normalizeImobRouteText(nextStep ?? "");
    if (!normalized) return "definir o próximo movimento comercial";
    if (normalized.includes("mostrar pendencias do caso") || normalized.includes("mostrar pendências do caso")) {
      return "revisar as pendências atuais do caso";
    }
    if (normalized.includes("mostrar bloqueios do caso")) {
      return "revisar os bloqueios atuais do caso";
    }
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

  function buildProofSummaryLine(
    proof: ImobCrmCaseContext["proof"],
    evidence?: ImobCrmCaseContext["evidence"] | null,
  ) {
    if (evidence) {
      if (evidence.status === "satisfied") {
        if (evidence.evidenceBundleId && evidence.receiptId) {
          return "Proof mínima satisfeita: receipt e bundle já estão disponíveis.";
        }
        if (evidence.receiptId) return "Proof mínima satisfeita: receipt já disponível para verificação.";
        return evidence.summary;
      }
      return evidence.summary;
    }
    if (!proof) return null;
    if (proof.state === "ready") {
      if (proof.bundlePath && proof.receiptPath) return "Prova auditável pronta: receipt e bundle disponíveis.";
      if (proof.receiptPath) return "Prova auditável pronta: receipt disponível para verificação.";
      return "Prova auditável pronta para este movimento.";
    }
    if (proof.state === "pending") {
      return "Prova auditável pendente: execução feita, aguardando receipt e bundle finais.";
    }
    if (proof.state === "not_required") {
      return "Este movimento não exige prova crítica para ser considerado concluído.";
    }
    if (proof.state === "failed") {
      return "A prova auditável deste movimento falhou e precisa de revisão antes do fechamento.";
    }
    return null;
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
    commercialFollowUp?: ImobCrmCaseContext["commercialFollowUp"] | null;
    discoverySignals?: ImobCrmCaseContext["lead"] extends infer T
      ? T extends { discoverySignals?: infer D }
        ? D
        : never
      : never;
  }) {
    const recipientRole = params.commercialFollowUp?.suggestedChannel === "internal"
      ? "internal"
      : params.commercialFollowUp?.suggestedChannel === "phone"
        ? "owner"
        : params.commercialFollowUp?.suggestedChannel === "whatsapp" || params.commercialFollowUp?.suggestedChannel === "email"
          ? "lead"
          : normalizePreparedRecipientRole(params.waitingOn);
    const subjectLabel = params.subject || "este caso";
    const phaseLabel = params.humanPhaseLabel ? `na fase de ${params.humanPhaseLabel.toLowerCase()}` : "neste caso";
    const trigger = params.commercialFollowUp?.trigger ?? params.primaryBlocker ?? params.primaryPending ?? "preciso de uma confirmação para avançar";
    const discoverySignals = params.discoverySignals ?? null;
    const objectiveMove = params.commercialFollowUp?.recommendedNextMove ?? params.nextStep;
    const cadenceSummary = params.commercialFollowUp?.summary ?? null;
    const directText = `Olá. Estou retomando ${subjectLabel} ${phaseLabel}. O ponto que ainda trava é ${trigger}.${cadenceSummary ? ` ${cadenceSummary}` : ""}${discoverySignals?.timeline ? ` Minha leitura é ${discoverySignals.timeline}.` : ""} Para avançar, preciso ${objectiveMove}. Consegue me responder ainda hoje?`;
    const consultiveText = `Oi. Voltei a olhar ${subjectLabel} para não deixar o atendimento esfriar. Hoje estamos aguardando ${formatWaitingOnLabel(params.waitingOn) ?? recipientRole}.${cadenceSummary ? ` ${cadenceSummary}` : ` O ponto principal é ${trigger}.`}${discoverySignals?.motivation ? ` Já registrei ${discoverySignals.motivation}.` : ""}${discoverySignals?.painPoint ? ` A dor central segue sendo ${discoverySignals.painPoint}.` : ""} Se você confirmar ${objectiveMove}, eu sigo sem te fazer repetir o processo.`;

    return {
      objective: cadenceSummary
        ? cadenceSummary
        : discoverySignals?.motivation
        ? `Retomar o caso com uma única ação clara sem perder a motivação registrada: ${discoverySignals.motivation}.`
        : "Retomar o caso com uma única ação clara e destravar o próximo movimento.",
      recipientRole,
      trigger,
      expectedReply: objectiveMove,
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
	          criticality: index === 0 ? "critical" as const : "supporting" as const,
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
      waitingOn: params.caseContext?.humanWorkflow?.waitingOn ?? null,
      recommendedAction: params.recommendedAction,
      reasonCodes,
      pendingItems: params.pendingItems,
    });

    const missingEvidence = buildMissingEvidence({
      primaryBlocker: params.primaryBlocker,
      waitingOn: params.caseContext?.humanWorkflow?.waitingOn ?? null,
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

  function buildLeadDiscoverySnapshot(caseContext: ImobCrmCaseContext) {
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    const signalEntries = [
      discoverySignals?.urgency ? `urgência ${discoverySignals.urgency}` : null,
      discoverySignals?.painPoint ? `dor principal: ${discoverySignals.painPoint}` : null,
      discoverySignals?.motivation ? `motivação: ${discoverySignals.motivation}` : null,
      discoverySignals?.budgetFlexibility ? `flexibilidade de orçamento: ${discoverySignals.budgetFlexibility}` : null,
      discoverySignals?.decisionMaker ? `decisor: ${discoverySignals.decisionMaker}` : null,
      discoverySignals?.timeline ? `janela: ${discoverySignals.timeline}` : null,
    ].filter(Boolean) as string[];
    const missingSignals = [
      !discoverySignals?.urgency ? "urgency" : null,
      !discoverySignals?.painPoint ? "painPoint" : null,
      !discoverySignals?.motivation ? "motivation" : null,
      !discoverySignals?.budgetFlexibility ? "budgetFlexibility" : null,
      !discoverySignals?.decisionMaker ? "decisionMaker" : null,
      !discoverySignals?.timeline ? "timeline" : null,
    ].filter(Boolean) as Array<"urgency" | "painPoint" | "motivation" | "budgetFlexibility" | "decisionMaker" | "timeline">;
    const capturedCount = signalEntries.length;
    const coverage = capturedCount >= 6 ? "complete" : capturedCount >= 3 ? "partial" : "insufficient";
    const recommendedNextMoveByCoverage = {
      complete: "validar aderência comercial e vincular imóvel com base no discovery já coletado",
      partial: "coletar os sinais de discovery restantes antes de avançar com abordagem comercial forte",
      insufficient: "retomar a qualificação básica do lead antes de sugerir próximo movimento comercial",
    } as const;

    return {
      coverage,
      discoveryVersion: "imob.lead_discovery.v1" as const,
      summary:
        coverage === "complete"
          ? "Discovery comercial completo para esta fase de qualificação."
          : coverage === "partial"
            ? `Discovery comercial parcial com ${capturedCount} sinais úteis já capturados.`
            : "Discovery comercial ainda insuficiente para sustentar uma qualificação forte.",
      capturedSignals: signalEntries,
      missingSignals,
      recommendedNextMove: recommendedNextMoveByCoverage[coverage],
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
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

  function buildLeadScoreMissingEvidence(caseContext: ImobCrmCaseContext, evidence: ReturnType<typeof getLeadScoringEvidence>) {
    return [
      !evidence.discoverySignals?.urgency ? "urgência real ainda não confirmada" : null,
      !evidence.discoverySignals?.decisionMaker ? "quem decide ainda não está claro" : null,
      !evidence.discoverySignals?.timeline ? "janela de decisão ainda não foi explicitada" : null,
      !evidence.discoverySignals?.painPoint ? "dor principal ainda não está explícita" : null,
      !evidence.discoverySignals?.motivation ? "motivação comercial ainda não está explícita" : null,
      !helpers.asString(caseContext?.lead?.targetCity) ? "cidade-alvo ainda não está explícita" : null,
      typeof caseContext?.lead?.budgetMaxCents !== "number" ? "orçamento máximo ainda não está explícito" : null,
      !(helpers.asString(caseContext?.lead?.phone) || helpers.asString(caseContext?.lead?.email))
        ? "canal de contato do lead ainda não está claro"
        : null,
      !helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label) ? "ação recomendada do caso não está explícita" : null,
    ].filter(Boolean) as string[];
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

  function buildLeadScoreReasonCodes(params: {
    caseContext: ImobCrmCaseContext;
    scoreBand: "HOT" | "WARM" | "COLD" | "UNKNOWN";
    factors: Array<{ key: string; contribution: number }>;
    evidence: ReturnType<typeof getLeadScoringEvidence>;
  }) {
    const codes = [
      params.scoreBand === "HOT" ? "lead_ready_hot" : null,
      params.scoreBand === "WARM" ? "lead_requires_confirmation" : null,
      params.scoreBand === "COLD" ? "lead_low_readiness" : null,
      params.scoreBand === "UNKNOWN" ? "lead_evidence_insufficient" : null,
      params.evidence.discoverySignals?.urgency === "high" ? "urgency_high" : null,
      params.evidence.discoverySignals?.timeline ? "timeline_declared" : null,
      params.evidence.discoverySignals?.decisionMaker === "solo" ? "decision_solo" : null,
      params.evidence.discoverySignals?.decisionMaker === "shared" ? "decision_shared" : null,
      params.evidence.discoverySignals?.decisionMaker === "third_party" ? "decision_third_party" : null,
      params.evidence.discoverySignals?.budgetFlexibility === "strict" ? "budget_strict" : null,
      params.evidence.discoverySignals?.budgetFlexibility === "moderate" ? "budget_moderate" : null,
      params.evidence.discoverySignals?.budgetFlexibility === "flexible" ? "budget_flexible" : null,
      params.caseContext?.humanWorkflow?.followUpRisk === "high" ? "follow_up_risk_high" : null,
      (params.caseContext?.humanWorkflow?.agingHours ?? 0) >= 72 ? "case_aging_high" : null,
      helpers.asString(params.caseContext?.blocker) ? "blocker_active" : null,
      (Array.isArray(params.caseContext?.pendingItems) ? params.caseContext.pendingItems.length : 0) >= 3 ? "pending_items_many" : null,
      params.factors.some((item) => item.key === "budget_fit" && item.contribution > 0) ? "budget_fit_present" : null,
      params.factors.some((item) => item.key === "commercial_readiness" && item.contribution > 0) ? "commercial_readiness_present" : null,
    ].filter(Boolean) as string[];
    return Array.from(new Set(codes)).slice(0, 8);
  }

  function buildLeadScoreConfidence(params: {
    evidence: ReturnType<typeof getLeadScoringEvidence>;
    missingEvidence: string[];
    scoreBand: "HOT" | "WARM" | "COLD" | "UNKNOWN";
  }) {
    if (params.scoreBand === "UNKNOWN") return "low" as const;
    if (params.evidence.discoveryCount >= 5 && params.missingEvidence.length <= 2) return "high" as const;
    if (params.evidence.discoveryCount >= 3 && params.missingEvidence.length <= 5) return "medium" as const;
    return "low" as const;
  }

	  function buildLeadScoreSnapshot(caseContext: ImobCrmCaseContext): ImobLeadScoringSnapshot {
    const evidence = getLeadScoringEvidence(caseContext);
    const missingEvidence = buildLeadScoreMissingEvidence(caseContext, evidence);
    if (!evidence.hasMinimumEvidence) {
      return {
        scoreBand: "UNKNOWN" as const,
        scoreValue: 0,
        scoreVersion: "imob.lead_scoring.v1.1" as const,
        summary: "Ainda não há evidência suficiente para classificar este lead com segurança.",
        confidence: "low" as const,
        reasonCodes: ["lead_evidence_insufficient", "missing_core_discovery"],
        factors: [],
        missingEvidence,
        shadowMode: true as const,
        generatedAt: new Date().toISOString(),
      };
    }

    const factors = buildLeadScoreFactors(caseContext);
    const scoreValue = Math.max(0, Math.min(100, 30 + factors.reduce((sum, factor) => sum + factor.contribution, 0)));
    const scoreBand = scoreValue >= 70 ? "HOT" : scoreValue >= 40 ? "WARM" : "COLD";
    const reasonCodes = buildLeadScoreReasonCodes({ caseContext, scoreBand, factors, evidence });
    const confidence = buildLeadScoreConfidence({ evidence, missingEvidence, scoreBand });
    const strongestPositive = factors
      .filter((factor) => factor.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)[0];
    const strongestNegative = factors
      .filter((factor) => factor.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution)[0];
    const summary =
      scoreBand === "HOT"
        ? `Lead com priorização comercial forte. Principal alavanca: ${strongestPositive?.label?.toLowerCase() ?? "contexto comercial consistente"}.`
        : scoreBand === "WARM"
          ? `Lead com sinais promissores, mas ainda depende de confirmação adicional. Principal alavanca: ${strongestPositive?.label?.toLowerCase() ?? "contexto parcial"}.`
          : `Lead com baixo readiness comercial no momento. Principal freio: ${strongestNegative?.label?.toLowerCase() ?? "pendências relevantes"}.`;

    return {
      scoreBand,
      scoreValue,
      scoreVersion: "imob.lead_scoring.v1.1" as const,
      summary,
      confidence,
      reasonCodes,
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
    const ownerDocumentPending = normalizedPending.some((item) => item.includes("documento do proprietario") || item.includes("ownerdocument"));
    const legalDocumentationPending = normalizedPending.some((item) => /document|matricula|contrato/.test(item) && !item.includes("documento do proprietario") && !item.includes("ownerdocument"));
    const objections = [
      (blocker && /document|matricula|contrato|jurid/i.test(blocker) && !/dados do propriet[aá]rio/i.test(blocker))
        || legalDocumentationPending
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
      ownerDocumentPending
        ? {
            key: "readiness" as const,
            label: "Cadastro do proprietário incompleto",
            summary: "Ainda falta concluir o documento do proprietário antes de avançar a captação.",
            status: "active" as const,
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

  function buildCommercialMemoryMissingEvidence(caseContext: ImobCrmCaseContext) {
    const discoverySignals = caseContext?.lead?.discoverySignals ?? null;
    return [
      helpers.asString(caseContext?.lead?.goal) ? null : "objetivo comercial do lead ainda não está explícito",
      helpers.asString(caseContext?.lead?.targetCity) ? null : "cidade-alvo ainda não está explícita",
      typeof caseContext?.lead?.budgetMaxCents === "number" ? null : "orçamento do lead ainda não está explícito",
      discoverySignals?.painPoint ? null : "dor principal ainda não está explícita",
      discoverySignals?.motivation ? null : "motivação comercial ainda não está explícita",
      discoverySignals?.timeline ? null : "janela de decisão ainda não está explícita",
      discoverySignals?.decisionMaker ? null : "decisor comercial ainda não está claro",
      helpers.asString(caseContext?.nextStep) || helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label)
        ? null
        : "próxima ação útil do caso ainda não está explícita",
    ].filter(Boolean) as string[];
  }

  function buildCommercialMemoryReasonCodes(params: {
    caseContext: ImobCrmCaseContext;
    objections: Array<{ key: string }>;
    urgencySignals: string[];
    nextTrigger?: { kind?: string | null } | null;
  }) {
    const discoverySignals = params.caseContext?.lead?.discoverySignals ?? null;
    const codes = [
      helpers.asString(params.caseContext?.lead?.goal) ? "goal_declared" : null,
      helpers.asString(params.caseContext?.lead?.targetCity) ? "target_city_declared" : null,
      typeof params.caseContext?.lead?.budgetMaxCents === "number" ? "budget_declared" : null,
      discoverySignals?.painPoint ? "pain_point_declared" : null,
      discoverySignals?.motivation ? "motivation_declared" : null,
      discoverySignals?.timeline ? "timeline_declared" : null,
      discoverySignals?.decisionMaker === "solo" ? "decision_solo" : null,
      discoverySignals?.decisionMaker === "shared" ? "decision_shared" : null,
      discoverySignals?.decisionMaker === "third_party" ? "decision_third_party" : null,
      params.objections.some((item) => item.key === "documentation") ? "objection_documentation" : null,
      params.objections.some((item) => item.key === "budget") ? "objection_budget" : null,
      params.objections.some((item) => item.key === "decision_maker") ? "objection_decision_maker" : null,
      params.objections.some((item) => item.key === "follow_up_risk") ? "objection_follow_up_risk" : null,
      params.nextTrigger?.kind ? `trigger_${params.nextTrigger.kind}` : null,
      params.urgencySignals.length > 0 ? "urgency_signal_present" : null,
    ].filter(Boolean) as string[];
    return Array.from(new Set(codes)).slice(0, 10);
  }

  function buildCommercialMemoryConfidence(params: {
    preferences: Array<{ key: string }>;
    objections: Array<{ key: string }>;
    urgencySignals: string[];
    missingEvidence: string[];
  }) {
    if (params.preferences.length >= 4 && params.urgencySignals.length >= 2 && params.missingEvidence.length <= 2) return "high" as const;
    if (params.preferences.length >= 2 && params.missingEvidence.length <= 5) return "medium" as const;
    return "low" as const;
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
    const missingEvidence = buildCommercialMemoryMissingEvidence(caseContext);
    const reasonCodes = buildCommercialMemoryReasonCodes({
      caseContext,
      objections: effectiveObjections,
      urgencySignals,
      nextTrigger,
    });
    const confidence = buildCommercialMemoryConfidence({
      preferences: effectivePreferences,
      objections: effectiveObjections,
      urgencySignals,
      missingEvidence,
    });

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
      memoryVersion: "imob.commercial_memory.v1.1" as const,
      summary: summary || "Memória comercial consultiva consolidada a partir do caso atual.",
      confidence,
      reasonCodes,
      preferences: effectivePreferences,
      objections: effectiveObjections,
      urgencySignals,
      lastUsefulAction,
      nextTrigger,
      ...(missingEvidence.length > 0 ? { missingEvidence } : {}),
      generatedAt: new Date().toISOString(),
    };
  }

	  function buildLeadProfileReportSnapshot(params: {
    caseContext: ImobCrmCaseContext;
    leadDiscovery?: { coverage?: string | null; missingSignals?: string[] | null } | null;
    leadScore?: { scoreBand?: string | null; scoreValue?: number | null; missingEvidence?: string[] | null } | null;
    commercialMemory?: {
      preferences?: Array<{ key?: string | null; value?: string | null }> | null;
      objections?: Array<{ key?: string | null; summary?: string | null }> | null;
      missingEvidence?: string[] | null;
    } | null;
	  }): ImobLeadProfileReportSnapshot {
    const lead = params.caseContext?.lead;
    const discoveryCoverage = helpers.asString(params.leadDiscovery?.coverage);
    const scoreBand = helpers.asString(params.leadScore?.scoreBand);
    const scoreValue = typeof params.leadScore?.scoreValue === "number" ? params.leadScore.scoreValue : 0;
    const budgetDefined = typeof lead?.budgetMaxCents === "number";
    const targetCityDefined = Boolean(helpers.asString(lead?.targetCity));
    const contactDefined = Boolean(helpers.asString(lead?.phone) || helpers.asString(lead?.email));
    const decisionMaker = helpers.asString(lead?.discoverySignals?.decisionMaker);
    const budgetFlexibility = helpers.asString(lead?.discoverySignals?.budgetFlexibility);
    const objections = params.commercialMemory?.objections ?? [];

	    const commercialReadiness: ImobLeadProfileReportSnapshot["commercialReadiness"] =
      scoreBand === "HOT" ? "high"
      : scoreBand === "WARM" ? "medium"
      : scoreBand === "COLD" ? "low"
      : "unknown";

	    const financialReadiness: ImobLeadProfileReportSnapshot["financialReadiness"] =
      budgetDefined && (budgetFlexibility === "moderate" || budgetFlexibility === "flexible") ? "high"
      : budgetDefined ? "medium"
      : budgetFlexibility === "strict" ? "low"
      : "unknown";

    const strengths = [
      targetCityDefined ? `cidade-alvo definida: ${helpers.asString(lead?.targetCity)}` : null,
      budgetDefined ? `orçamento explícito: ${helpers.formatBudgetCentsForImob(lead?.budgetMaxCents ?? null)}` : null,
      contactDefined ? "canal de contato disponível para retomada" : null,
      helpers.asString(lead?.discoverySignals?.painPoint) ? `dor principal clara: ${helpers.asString(lead?.discoverySignals?.painPoint)}` : null,
      helpers.asString(lead?.discoverySignals?.motivation) ? `motivação explícita: ${helpers.asString(lead?.discoverySignals?.motivation)}` : null,
      scoreBand === "HOT" || scoreBand === "WARM" ? `score consultivo ${scoreBand}${scoreValue ? ` (${scoreValue})` : ""}` : null,
      decisionMaker === "solo" ? "decisor principal já identificado" : null,
    ].filter(Boolean) as string[];

    const risks = [
      objections[0]?.summary ? String(objections[0].summary) : null,
      decisionMaker === "third_party" ? "a decisão depende de terceiro e pode alongar o ciclo" : null,
      budgetFlexibility === "strict" ? "orçamento rígido limita margem comercial" : null,
      !targetCityDefined ? "cidade-alvo ainda não está explícita" : null,
      !budgetDefined ? "orçamento ainda não está explícito" : null,
      !contactDefined ? "canal de contato ainda não está claro" : null,
    ].filter(Boolean) as string[];

    const missingEvidence = Array.from(new Set([
      ...(params.leadDiscovery?.missingSignals?.map((item) => `discovery:${item}`) ?? []),
      ...(params.leadScore?.missingEvidence ?? []),
      ...(params.commercialMemory?.missingEvidence ?? []),
    ])).slice(0, 8);

	    const profileStatus: ImobLeadProfileReportSnapshot["profileStatus"] =
      discoveryCoverage === "complete" && scoreBand && scoreBand !== "UNKNOWN" && budgetDefined && targetCityDefined
        ? "ready"
        : discoveryCoverage === "insufficient" && !budgetDefined && !targetCityDefined
          ? "insufficient"
          : "partial";

    const recommendedNextMoveByStatus = {
      ready: "usar este perfil para priorizar a retomada comercial com abordagem aderente",
      partial: "completar as lacunas do perfil antes de escalar abordagem comercial ou financeira",
      insufficient: "retomar a qualificação básica e coletar dados mínimos de perfil antes de prosseguir",
    } as const;

    const summaryByStatus = {
      ready: "Perfil consultivo suficientemente estruturado para orientar a próxima abordagem humana.",
      partial: "Perfil consultivo útil, mas ainda com lacunas que limitam uma abordagem mais forte.",
      insufficient: "Perfil consultivo ainda insuficiente para orientar a próxima ação com segurança.",
    } as const;

    return {
      profileVersion: "imob.lead_profile_report.v1" as const,
      profileStatus,
      commercialReadiness,
      financialReadiness,
      consentScope: "internal_only" as const,
      summary: summaryByStatus[profileStatus],
      strengths,
      risks,
      missingEvidence,
      recommendedNextMove: recommendedNextMoveByStatus[profileStatus],
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
  }

	  function buildViabilityMarketAnalysisSnapshot(params: {
    caseContext: ImobCrmCaseContext;
    leadProfileReport?: {
      profileStatus?: string | null;
      commercialReadiness?: string | null;
      financialReadiness?: string | null;
      missingEvidence?: string[] | null;
    } | null;
    commercialMemory?: {
      preferences?: Array<{ key?: string | null; value?: string | null }> | null;
      objections?: Array<{ key?: string | null }> | null;
      nextTrigger?: { kind?: string | null } | null;
    } | null;
    leadScore?: {
      scoreBand?: string | null;
      scoreValue?: number | null;
    } | null;
	  }): ImobViabilityMarketAnalysisSnapshot {
    const lead = params.caseContext?.lead;
    const property = params.caseContext?.property;
    const profileStatus = helpers.asString(params.leadProfileReport?.profileStatus);
    const scoreBand = helpers.asString(params.leadScore?.scoreBand);
    const scoreValue = typeof params.leadScore?.scoreValue === "number" ? params.leadScore.scoreValue : 0;
    const hasGoal = Boolean(helpers.asString(lead?.goal) ?? helpers.asString(property?.goal));
    const hasCity = Boolean(helpers.asString(lead?.targetCity) ?? helpers.asString(property?.city));
    const hasBudget = typeof lead?.budgetMaxCents === "number" || typeof property?.askingPriceCents === "number";
    const hasPropertyContext = Boolean(
      helpers.asString(property?.propertyType)
      || helpers.asString(property?.neighborhood)
      || helpers.asString(property?.address),
    );
    const budgetFlexibility = helpers.asString(lead?.discoverySignals?.budgetFlexibility);
    const triggerKind = helpers.asString(params.commercialMemory?.nextTrigger?.kind);
    const documentationObjection = params.commercialMemory?.objections?.some((item) => helpers.asString(item?.key) === "documentation");
    const budgetObjection = params.commercialMemory?.objections?.some((item) => helpers.asString(item?.key) === "budget");

    const viabilityBase = 25
      + (profileStatus === "ready" ? 20 : profileStatus === "partial" ? 10 : 0)
      + (scoreBand === "HOT" ? 20 : scoreBand === "WARM" ? 10 : scoreBand === "COLD" ? -10 : 0)
      + (hasGoal ? 8 : 0)
      + (hasCity ? 8 : 0)
      + (hasBudget ? 8 : 0)
      + (hasPropertyContext ? 8 : 0)
      + (budgetFlexibility === "flexible" ? 6 : budgetFlexibility === "moderate" ? 3 : budgetFlexibility === "strict" ? -5 : 0)
      + (triggerKind === "decision_window" ? 4 : triggerKind === "follow_up" ? -2 : 0)
      + (documentationObjection ? -8 : 0)
      + (budgetObjection ? -8 : 0);
    const viabilityScore = Math.max(0, Math.min(100, viabilityBase));

	    const liquiditySignal: ImobViabilityMarketAnalysisSnapshot["liquiditySignal"] =
      hasGoal && hasCity && hasBudget && hasPropertyContext && (scoreBand === "HOT" || scoreBand === "WARM")
        ? "high"
        : hasGoal && hasCity && (hasBudget || hasPropertyContext)
          ? "medium"
          : hasGoal || hasCity
            ? "low"
            : "unknown";

	    const priceConfidence: ImobViabilityMarketAnalysisSnapshot["priceConfidence"] =
      hasBudget && budgetFlexibility === "moderate"
        ? "high"
        : hasBudget
          ? "medium"
          : budgetFlexibility === "strict"
            ? "low"
            : "unknown";

    const missingEvidence = Array.from(new Set([
      !hasGoal ? "objetivo de negócio ainda não está explícito" : null,
      !hasCity ? "região ou cidade-alvo ainda não está explícita" : null,
      !hasBudget ? "sinal mínimo de preço ou orçamento ainda não está explícito" : null,
      !hasPropertyContext ? "contexto do imóvel ainda está incompleto para leitura de liquidez" : null,
      ...(params.leadProfileReport?.missingEvidence ?? []),
    ].filter(Boolean) as string[])).slice(0, 8);

    const anchorSignals = [
      hasGoal ? `objetivo: ${helpers.asString(lead?.goal) ?? helpers.asString(property?.goal)}` : null,
      hasCity ? `cidade: ${helpers.asString(lead?.targetCity) ?? helpers.asString(property?.city)}` : null,
      hasBudget
        ? `referência de preço: ${helpers.formatBudgetCentsForImob(
            typeof lead?.budgetMaxCents === "number" ? lead.budgetMaxCents : property?.askingPriceCents ?? null,
          )}`
        : null,
      hasPropertyContext ? `tipo/contexto do imóvel disponível` : null,
      scoreBand && scoreBand !== "UNKNOWN" ? `lead score ${scoreBand}${scoreValue ? ` (${scoreValue})` : ""}` : null,
      triggerKind ? `gatilho comercial ${triggerKind}` : null,
    ].filter(Boolean) as string[];

	    const marketStatus: ImobViabilityMarketAnalysisSnapshot["marketStatus"] =
      profileStatus === "insufficient" && (!hasBudget || !hasPropertyContext || !hasCity)
        ? "insufficient_context"
        : viabilityScore >= 70
          ? "viable"
          : viabilityScore >= 45
            ? "watch"
            : "fragile";

    const recommendedNextMoveByStatus = {
      viable: "usar a leitura para priorizar abordagem comercial e confirmar aderência de preço com contexto atual",
      watch: "refinar preço, liquidez ou contexto do imóvel antes de elevar confiança comercial",
      fragile: "revisar premissas de orçamento, timing e aderência antes de sugerir avanço de mercado",
      insufficient_context: "coletar contexto mínimo de preço, região e imóvel antes de inferir viabilidade de mercado",
    } as const;

    const summaryByStatus = {
      viable: "Há sinais internos suficientes para uma leitura consultiva de viabilidade favorável.",
      watch: "A leitura de viabilidade é promissora, mas ainda pede confirmação de premissas-chave.",
      fragile: "A leitura interna aponta fragilidade de viabilidade no estado atual do caso.",
      insufficient_context: "Ainda faltam sinais internos mínimos para uma leitura consultiva de viabilidade.",
    } as const;

    return {
      analysisVersion: "imob.viability_market_analysis.v1" as const,
      marketStatus,
      viabilityScore,
      liquiditySignal,
      priceConfidence,
      summary: summaryByStatus[marketStatus],
      anchorSignals,
      missingEvidence,
      recommendedNextMove: recommendedNextMoveByStatus[marketStatus],
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
  }

  function buildClosingDocumentsSnapshot(params: {
    caseContext: ImobCrmCaseContext;
    leadProfileReport?: { profileStatus?: string | null } | null;
	  }): ImobClosingDocumentsSnapshot {
    const caseContext = params.caseContext;
    const profileStatus = helpers.asString(params.leadProfileReport?.profileStatus);
    const pendingItems = Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems.map(String) : [];
    const blocker = helpers.asString(caseContext?.blocker);
    const normalizedPending = pendingItems.map((item) => helpers.normalizeImobRouteText(item));
    const ownerDocumentMissing = normalizedPending.some((item) => item.includes("documento do proprietario") || item.includes("ownerdocument"));
    const contractPending = normalizedPending.some((item) => item.includes("contrato"));
    const registryPending = normalizedPending.some((item) => item.includes("matricula") || item.includes("escritura"));
    const documentationPending = normalizedPending.some((item) => item.includes("document") && !item.includes("documento do proprietario") && !item.includes("ownerdocument"));
    const legalBlocker = Boolean(blocker && /jurid|contrato|matricula|escritura/i.test(blocker));
    const ownerOnlyDocumentGap = ownerDocumentMissing && !documentationPending && !contractPending && !registryPending && !legalBlocker;
    const blockingIssues = [
      blocker ? blocker : null,
      ownerOnlyDocumentGap ? null : (ownerDocumentMissing ? "documento do proprietário ainda pendente" : null),
      registryPending ? "matrícula ou escritura ainda pendente" : null,
      contractPending ? "contrato ainda pede preparação ou revisão" : null,
    ].filter(Boolean) as string[];
    const pendingDocuments = Array.from(new Set(
      pendingItems.filter((item) => /document|matricula|escritura|contrato|cpf|cnpj|rg/i.test(item)),
    )).slice(0, 8);
    const legalHandoffRecommended = Boolean(
      contractPending
      || registryPending
      || legalBlocker,
      );

    const hasDocumentationSignal = documentationPending || contractPending || registryPending || Boolean(legalBlocker);

	    const packetReadiness: ImobClosingDocumentsSnapshot["packetReadiness"] =
      blockingIssues.length > 0 ? "blocked"
      : pendingDocuments.length > 0 || ownerOnlyDocumentGap ? "partial"
      : (caseContext?.flow === "contract.prepare" || caseContext?.flow === "documents.collect") ? "ready"
      : profileStatus === "ready" ? "ready"
      : profileStatus === "partial" ? "partial"
      : "unknown";

	    const readinessStatus: ImobClosingDocumentsSnapshot["readinessStatus"] =
      blockingIssues.length > 0
        ? "blocked"
        : pendingDocuments.length > 0 || ownerOnlyDocumentGap
          ? "partial"
          : hasDocumentationSignal
            ? "ready"
            : profileStatus === "ready"
              ? "ready"
              : profileStatus === "partial"
                ? "partial"
                : "insufficient_context";

	    const nextValidationOwner: ImobClosingDocumentsSnapshot["nextValidationOwner"] =
      legalHandoffRecommended ? "juridico"
      : ownerDocumentMissing ? "proprietario"
      : caseContext?.humanWorkflow?.waitingOn === "lead" ? "lead"
      : caseContext?.humanWorkflow?.waitingOn === "owner" ? "proprietario"
      : "corretor";

    const summaryByStatus = {
      ready: "Pacote documental consultivo está pronto para seguir com validação humana.",
      partial: "Pacote documental consultivo está parcialmente estruturado, mas ainda há pendências objetivas.",
      blocked: "Existe bloqueio documental explícito que impede avanço seguro do caso.",
      insufficient_context: "Ainda falta contexto mínimo para afirmar prontidão documental com segurança.",
    } as const;

    const recommendedNextMoveByStatus = {
      ready: "encaminhar validação final e preparar o próximo passo contratual",
      partial: "cobrar os documentos pendentes antes de abrir nova frente contratual",
      blocked: "destravar o bloqueio documental principal antes de seguir com contrato ou fechamento",
      insufficient_context: "levantar checklist documental mínima do caso antes de sugerir avanço",
    } as const;

    return {
      documentStateVersion: "imob.closing_documents_real.v1" as const,
      readinessStatus,
      packetReadiness,
      legalHandoffRecommended,
      summary: summaryByStatus[readinessStatus],
      pendingDocuments,
      blockingIssues,
      nextValidationOwner,
      recommendedNextMove: recommendedNextMoveByStatus[readinessStatus],
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
  }

  function shouldBuildReengagementSuggestion(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: { nextTrigger?: { kind?: string | null } | null } | null;
    leadScore?: { scoreBand?: string | null } | null;
  }) {
    return Boolean(
      params.commercialMemory?.nextTrigger?.kind
      || params.caseContext?.humanWorkflow?.followUpRisk
      || (
        helpers.asString(params.leadScore?.scoreBand)
        && helpers.asString(params.leadScore?.scoreBand) !== "UNKNOWN"
      ),
    );
  }

  function buildReengagementReason(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: { nextTrigger?: { kind?: string | null } | null } | null;
    leadScore?: { scoreBand?: string | null } | null;
  }) {
    if (params.caseContext?.commercialFollowUp?.status === "reengagement_required") {
      const followUpTrigger = helpers.asString(params.caseContext.commercialFollowUp.trigger);
      if (followUpTrigger === "post_visit_objection" || followUpTrigger === "decision_window") return "decision_window" as const;
      if (followUpTrigger === "no_response") return "follow_up_risk" as const;
    }
    const triggerKind = helpers.asString(params.commercialMemory?.nextTrigger?.kind);
    if (triggerKind === "follow_up") return "follow_up_risk" as const;
    if (triggerKind === "decision_window") return "decision_window" as const;
    if (triggerKind === "document_pending") return "document_pending" as const;
    if (triggerKind === "budget_revalidation") return "budget_revalidation" as const;
    if (triggerKind === "readiness_check") return "readiness_check" as const;
    if (params.caseContext?.humanWorkflow?.followUpRisk === "high") return "follow_up_risk" as const;
    if (helpers.asString(params.leadScore?.scoreBand) === "HOT") return "decision_window" as const;
    return "readiness_check" as const;
  }

  function buildReengagementTiming(params: {
    caseContext: ImobCrmCaseContext;
    reason: "follow_up_risk" | "decision_window" | "document_pending" | "budget_revalidation" | "readiness_check";
    leadScore?: { scoreBand?: string | null } | null;
  }) {
    if (params.reason === "document_pending" || params.reason === "budget_revalidation") return "this_week" as const;
    if (params.caseContext?.humanWorkflow?.followUpRisk === "high") return "now" as const;
    if (params.reason === "decision_window") return "today" as const;
    if (helpers.asString(params.leadScore?.scoreBand) === "HOT") return "now" as const;
    return "today" as const;
  }

  function buildReengagementChannel(params: {
    caseContext: ImobCrmCaseContext;
    preparedFollowUp?: { recipientRole?: string | null } | null;
  }) {
    if (params.caseContext?.commercialFollowUp?.suggestedChannel === "internal") return "internal" as const;
    if (params.caseContext?.commercialFollowUp?.suggestedChannel === "phone") return "phone" as const;
    if (params.caseContext?.commercialFollowUp?.suggestedChannel === "whatsapp") return "whatsapp" as const;
    if (params.caseContext?.commercialFollowUp?.suggestedChannel === "email") return "email" as const;
    const recipientRole = helpers.asString(params.preparedFollowUp?.recipientRole);
    if (recipientRole === "lead") return "whatsapp" as const;
    if (recipientRole === "owner") return "phone" as const;
    if (recipientRole === "broker" || recipientRole === "legal" || recipientRole === "finance" || recipientRole === "internal") {
      return "internal" as const;
    }
    if (params.caseContext?.humanWorkflow?.waitingOn === "owner") return "phone" as const;
    if (params.caseContext?.humanWorkflow?.waitingOn === "lead") return "whatsapp" as const;
    return "email" as const;
  }

  function buildReengagementMessageBase(preparedFollowUp?: {
    variants?: Array<{ text?: string | null }> | null;
  } | null) {
    return helpers.asString(preparedFollowUp?.variants?.[0]?.text)
      ?? helpers.asString(preparedFollowUp?.variants?.[1]?.text)
      ?? null;
  }

  function hasStrongReengagementEvidence(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: {
      nextTrigger?: { kind?: string | null } | null;
    } | null;
    leadScore?: { scoreBand?: string | null } | null;
  }) {
    const triggerKind = helpers.asString(params.commercialMemory?.nextTrigger?.kind);
    const scoreBand = helpers.asString(params.leadScore?.scoreBand);
    return Boolean(
      (triggerKind && triggerKind !== "readiness_check")
      || params.caseContext?.humanWorkflow?.followUpRisk === "high"
      || scoreBand === "HOT"
      || scoreBand === "WARM"
    );
  }

  function buildReengagementAnchorSignals(params: {
    commercialMemory?: {
      urgencySignals?: string[] | null;
      objections?: Array<{ key?: string | null; label?: string | null }> | null;
      nextTrigger?: { kind?: string | null } | null;
    } | null;
    leadScore?: { scoreBand?: string | null } | null;
    decisionRationale?: { reasonCodes?: string[] | null } | null;
    caseContext: ImobCrmCaseContext;
  }) {
    const signals = [
      helpers.asString(params.leadScore?.scoreBand) && helpers.asString(params.leadScore?.scoreBand) !== "UNKNOWN"
        ? `lead score ${helpers.asString(params.leadScore?.scoreBand)}`
        : null,
      params.caseContext?.humanWorkflow?.followUpRisk === "high" ? "follow-up risk alto" : null,
      params.caseContext?.humanWorkflow?.urgency === "high" || params.caseContext?.humanWorkflow?.urgency === "critical"
        ? "urgência comercial alta"
        : null,
      params.commercialMemory?.urgencySignals?.some((item) => item.includes("janela explícita"))
        ? "janela de decisão presente"
        : null,
      params.commercialMemory?.nextTrigger?.kind ? `next trigger ${params.commercialMemory.nextTrigger.kind}` : null,
      params.commercialMemory?.objections?.[0]?.key === "documentation" ? "pendência documental" : null,
      params.commercialMemory?.objections?.[0]?.key === "budget" ? "objeção de orçamento" : null,
      helpers.asString(params.decisionRationale?.reasonCodes?.[0]) ? "reason code principal presente" : null,
    ].filter(Boolean);
    return Array.from(new Set(signals as string[])).slice(0, 5);
  }

  function buildReengagementMissingEvidence(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: {
      objections?: Array<{ key?: string | null }> | null;
      nextTrigger?: { kind?: string | null } | null;
    } | null;
    preparedFollowUp?: { recipientRole?: string | null; variants?: Array<{ text?: string | null }> | null } | null;
  }) {
    const missing = [
      buildReengagementMessageBase(params.preparedFollowUp) ? null : "mensagem-base de retomada ainda não está pronta",
      helpers.asString(params.preparedFollowUp?.recipientRole) ? null : "canal preferencial ainda não está claro",
      helpers.asString(params.commercialMemory?.nextTrigger?.kind) && params.commercialMemory?.nextTrigger?.kind !== "readiness_check"
        ? null
        : "gatilho principal de retomada ainda precisa de confirmação",
      params.commercialMemory?.objections?.length ? null : "objeção principal ainda não está explícita",
      helpers.asString(params.caseContext?.humanWorkflow?.nextActionOwner) ?? helpers.asString(params.caseContext?.ownerResponsible)
        ? null
        : "owner da retomada ainda não está claro",
    ].filter(Boolean);
    return missing.length ? (missing as string[]).slice(0, 5) : undefined;
  }

  function buildReengagementSuggestion(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: {
      summary?: string | null;
      nextTrigger?: { kind?: string | null; summary?: string | null } | null;
      urgencySignals?: string[] | null;
      objections?: Array<{ key?: string | null; label?: string | null }> | null;
    } | null;
    leadScore?: { scoreBand?: string | null } | null;
    decisionRationale?: { reasonCodes?: string[] | null; summary?: string | null } | null;
    preparedFollowUp?: {
      recipientRole?: string | null;
      variants?: Array<{ text?: string | null }> | null;
    } | null;
  }) {
    if (params.caseContext?.commercialFollowUp?.status === "awaiting_response") return undefined;
    if (!shouldBuildReengagementSuggestion(params)) return undefined;

    const reason = buildReengagementReason(params);
    const recommendedTiming = buildReengagementTiming({
      caseContext: params.caseContext,
      reason,
      leadScore: params.leadScore ?? null,
    });
    const suggestedChannel = buildReengagementChannel({
      caseContext: params.caseContext,
      preparedFollowUp: params.preparedFollowUp ?? null,
    });
    const messageBase = buildReengagementMessageBase(params.preparedFollowUp ?? null);
    const anchorSignals = buildReengagementAnchorSignals(params);
    const missingEvidence = buildReengagementMissingEvidence({
      caseContext: params.caseContext,
      commercialMemory: params.commercialMemory ?? null,
      preparedFollowUp: params.preparedFollowUp ?? null,
    });
    const strongEvidence = hasStrongReengagementEvidence(params);
    const triggerSummary = helpers.asString(params.commercialMemory?.nextTrigger?.summary);
    const summaryByReason = {
      follow_up_risk: triggerSummary ?? "Retomar rapidamente para evitar que o caso esfrie.",
      decision_window: triggerSummary ?? "Aproveitar a janela declarada para retomar com contexto comercial.",
      document_pending: triggerSummary ?? "Usar a pendência documental como eixo de retomada coordenada.",
      budget_revalidation: triggerSummary ?? "Voltar com foco em revalidar orçamento e aderência.",
      readiness_check: triggerSummary ?? "Reabrir o caso com uma checagem curta de readiness comercial.",
    } satisfies Record<string, string>;

    return {
      reason,
      summary: strongEvidence
        ? summaryByReason[reason]
        : `Retomada sugerida com base parcial: ${summaryByReason[reason]}`,
      recommendedTiming,
      suggestedChannel,
      messageBase,
      anchorSignals,
      ...(missingEvidence ? { missingEvidence } : {}),
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
  }

  function hasInventoryWatchMinimumContext(caseContext: ImobCrmCaseContext, preferenceMap: Map<string, string>) {
    const lead = caseContext?.lead;
    const property = caseContext?.property;
    const hasGoal = Boolean(helpers.asString(preferenceMap.get("goal")) ?? helpers.asString(lead?.goal) ?? helpers.asString(property?.goal));
    const hasCity = Boolean(
      helpers.asString(preferenceMap.get("target_city"))
      ?? helpers.asString(lead?.targetCity)
      ?? helpers.asString(property?.city),
    );
    const hasAdditionalSignal = Boolean(
      helpers.asString(preferenceMap.get("budget"))
      || typeof lead?.budgetMaxCents === "number"
      || typeof property?.askingPriceCents === "number"
      || helpers.asString(property?.propertyType)
      || helpers.asString(property?.neighborhood)
      || helpers.asString(lead?.discoverySignals?.painPoint)
      || helpers.asString(lead?.discoverySignals?.motivation),
    );
    return hasGoal && hasCity && hasAdditionalSignal;
  }

  function buildInventoryWatchAnchorSignals(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: {
      preferences?: Array<{ key?: string | null; value?: string | null }> | null;
      nextTrigger?: { kind?: string | null } | null;
    } | null;
    leadScore?: { scoreBand?: string | null } | null;
    reengagementSuggestion?: {
      anchorSignals?: string[] | null;
      missingEvidence?: string[] | null;
    } | null;
  }) {
    const lead = params.caseContext?.lead;
    const property = params.caseContext?.property;
    const preferenceMap = new Map(
      (params.commercialMemory?.preferences ?? [])
        .map((item) => [helpers.asString(item?.key), helpers.asString(item?.value)] as const)
        .filter((item): item is [string, string] => Boolean(item[0] && item[1])),
    );
    const scoreBand = helpers.asString(params.leadScore?.scoreBand);
    const signals = [
      preferenceMap.get("target_city") ?? helpers.asString(lead?.targetCity) ?? helpers.asString(property?.city)
        ? `cidade-alvo definida: ${preferenceMap.get("target_city") ?? helpers.asString(lead?.targetCity) ?? helpers.asString(property?.city)}`
        : null,
      preferenceMap.get("goal") ?? helpers.asString(lead?.goal) ?? helpers.asString(property?.goal)
        ? `objetivo claro: ${preferenceMap.get("goal") ?? helpers.asString(lead?.goal) ?? helpers.asString(property?.goal)}`
        : null,
      preferenceMap.get("budget") ?? (typeof lead?.budgetMaxCents === "number" ? helpers.formatBudgetCentsForImob(lead.budgetMaxCents) : null)
        ? `orçamento declarado: ${preferenceMap.get("budget") ?? helpers.formatBudgetCentsForImob(lead?.budgetMaxCents ?? null)}`
        : null,
      helpers.asString(property?.propertyType) ? `tipo de imóvel conhecido: ${helpers.asString(property?.propertyType)}` : null,
      helpers.asString(property?.neighborhood) ? `bairro conhecido: ${helpers.asString(property?.neighborhood)}` : null,
      scoreBand === "HOT" || scoreBand === "WARM" ? `lead score ${scoreBand}` : null,
      params.commercialMemory?.nextTrigger?.kind && params.commercialMemory.nextTrigger.kind !== "readiness_check"
        ? `gatilho comercial ${params.commercialMemory.nextTrigger.kind}`
        : null,
      params.reengagementSuggestion?.anchorSignals?.length ? params.reengagementSuggestion.anchorSignals[0] ?? null : null,
    ].filter(Boolean);
    return Array.from(new Set(signals as string[])).slice(0, 5);
  }

  function buildInventoryWatchMissingCriteria(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: {
      preferences?: Array<{ key?: string | null }> | null;
    } | null;
  }) {
    const lead = params.caseContext?.lead;
    const property = params.caseContext?.property;
    const preferenceKeys = new Set(
      (params.commercialMemory?.preferences ?? [])
        .map((item) => helpers.asString(item?.key))
        .filter(Boolean) as string[],
    );
    const missing = [
      preferenceKeys.has("target_city") || helpers.asString(lead?.targetCity) || helpers.asString(property?.city)
        ? null
        : "cidade",
      preferenceKeys.has("budget") || typeof lead?.budgetMaxCents === "number" || typeof property?.askingPriceCents === "number"
        ? null
        : "orçamento",
      helpers.asString(property?.propertyType) ? null : "tipo de imóvel",
      helpers.asString(property?.neighborhood) ? null : "bairro",
      helpers.asString(lead?.discoverySignals?.timeline) ? null : "janela de decisão",
      helpers.asString(lead?.discoverySignals?.budgetFlexibility) ? null : "flexibilidade comercial",
    ].filter(Boolean);
    return Array.from(new Set(missing as string[])).slice(0, 5);
  }

  function buildInventoryWatchSnapshot(params: {
    caseContext: ImobCrmCaseContext;
    commercialMemory?: {
      preferences?: Array<{ key?: string | null; value?: string | null }> | null;
      objections?: Array<{ key?: string | null }> | null;
      nextTrigger?: { kind?: string | null } | null;
    } | null;
    leadScore?: { scoreBand?: string | null } | null;
    reengagementSuggestion?: {
      anchorSignals?: string[] | null;
      missingEvidence?: string[] | null;
    } | null;
  }) {
    const lead = params.caseContext?.lead;
    const property = params.caseContext?.property;
    const preferenceMap = new Map(
      (params.commercialMemory?.preferences ?? [])
        .map((item) => [helpers.asString(item?.key), helpers.asString(item?.value)] as const)
        .filter((item): item is [string, string] => Boolean(item[0] && item[1])),
    );
    const goal = helpers.asString(preferenceMap.get("goal")) ?? helpers.asString(lead?.goal) ?? helpers.asString(property?.goal);
    const city = helpers.asString(preferenceMap.get("target_city")) ?? helpers.asString(lead?.targetCity) ?? helpers.asString(property?.city);
    const scoreBand = helpers.asString(params.leadScore?.scoreBand);
    const hasBudget = Boolean(
      helpers.asString(preferenceMap.get("budget"))
      || typeof lead?.budgetMaxCents === "number"
      || typeof property?.askingPriceCents === "number",
    );
    const hasPropertyContext = Boolean(
      helpers.asString(property?.propertyType)
      || helpers.asString(property?.neighborhood),
    );
    const strongReengagement = Boolean(
      params.commercialMemory?.nextTrigger?.kind
      && params.commercialMemory?.nextTrigger?.kind !== "readiness_check"
      && !(params.reengagementSuggestion?.missingEvidence?.length),
    );
    const budgetObjection = params.commercialMemory?.objections?.some((item) => helpers.asString(item?.key) === "budget");
    const conflictingGoal = Boolean(
      goal
      && helpers.asString(property?.goal)
      && goal !== helpers.asString(property?.goal),
    );
    const conflictingCity = Boolean(
      city
      && helpers.asString(property?.city)
      && city !== helpers.asString(property?.city),
    );
    const missingCriteria = buildInventoryWatchMissingCriteria({
      caseContext: params.caseContext,
      commercialMemory: params.commercialMemory ?? null,
    });
    const anchorSignals = buildInventoryWatchAnchorSignals({
      caseContext: params.caseContext,
      commercialMemory: params.commercialMemory ?? null,
      leadScore: params.leadScore ?? null,
      reengagementSuggestion: params.reengagementSuggestion ?? null,
    });

    let watchStatus: "matching" | "weak_match" | "no_match" | "insufficient_context";
    let matchStrength: "high" | "medium" | "low" | "unknown";

    if (!hasInventoryWatchMinimumContext(params.caseContext, preferenceMap)) {
      watchStatus = "insufficient_context";
      matchStrength = "unknown";
    } else if (conflictingGoal || conflictingCity) {
      watchStatus = "no_match";
      matchStrength = "low";
    } else if (
      city
      && goal
      && hasBudget
      && hasPropertyContext
      && (scoreBand === "HOT" || scoreBand === "WARM")
      && strongReengagement
      && !budgetObjection
    ) {
      watchStatus = "matching";
      matchStrength = "high";
    } else {
      watchStatus = "weak_match";
      matchStrength = scoreBand === "HOT" || scoreBand === "WARM" ? "medium" : "low";
    }

    const recommendedNextMoveByStatus = {
      matching: "retomar lead com imóveis aderentes",
      weak_match: "refinar cidade ou orçamento antes de retomar",
      no_match: "revalidar objetivo e flexibilidade comercial",
      insufficient_context: "coletar preferências mínimas antes de sugerir estoque",
    } satisfies Record<typeof watchStatus, string>;

    const summaryByStatus = {
      matching: `Há aderência consultiva suficiente para shadow inventory watch em ${city}.`,
      weak_match: "Existe sinal parcial de aderência, mas a retomada ainda pede refinamento comercial.",
      no_match: "Os sinais atuais entram em conflito e não sustentam aderência de estoque segura.",
      insufficient_context: "Ainda faltam critérios mínimos para avaliar aderência de estoque com segurança.",
    } satisfies Record<typeof watchStatus, string>;

    return {
      watchStatus,
      matchStrength,
      watchVersion: "imob.inventory_watch.v1" as const,
      summary: summaryByStatus[watchStatus],
      anchorSignals,
      missingCriteria,
      recommendedNextMove: recommendedNextMoveByStatus[watchStatus],
      shadowMode: true as const,
      generatedAt: new Date().toISOString(),
    };
  }

  function buildMissionOwnerCapability(params: {
    caseContext: ImobCrmCaseContext;
    closingDocuments?: { readinessStatus?: string | null } | null;
    inventoryWatch?: { watchStatus?: string | null } | null;
    viabilityMarketAnalysis?: { marketStatus?: string | null } | null;
  }) {
    const journey = helpers.asString(params.caseContext?.canonical?.journeyType);
    const flow = helpers.asString(params.caseContext?.flow);
    const documentStatus = helpers.asString(params.closingDocuments?.readinessStatus);
    const inventoryStatus = helpers.asString(params.inventoryWatch?.watchStatus);
    const marketStatus = helpers.asString(params.viabilityMarketAnalysis?.marketStatus);

    if (
      documentStatus === "blocked"
      || journey === "documentation"
      || journey === "contract"
      || journey === "closing"
      || flow === "documents.collect"
      || flow === "contract.prepare"
    ) {
      return "closing.documents_real";
    }
    if (inventoryStatus && inventoryStatus !== "insufficient_context") {
      return "inventory.active_watch";
    }
    if (journey === "lead_qualification" || flow === "lead.qualify") {
      return "lead.qualify.discovery";
    }
    if (
      marketStatus
      && marketStatus !== "insufficient_context"
      && (
        journey === "property_capture"
        || journey === "proposal"
        || journey === "negotiation"
        || flow === "property.create"
        || flow === "listing.activate"
        || flow === "proposal.create"
        || flow === "deal.review"
      )
    ) {
      return "viability.market_analysis";
    }
    return "relationship.commercial_memory";
  }

  function buildMissionOrchestrationSnapshot(params: {
    caseContext: ImobCrmCaseContext;
    decisionRationale?: { reasonCodes?: string[] | null; sourceRefs?: any[] | null } | null;
    closingDocuments?: {
      readinessStatus?: string | null;
      recommendedNextMove?: string | null;
      blockingIssues?: string[] | null;
    } | null;
    viabilityMarketAnalysis?: {
      marketStatus?: string | null;
      recommendedNextMove?: string | null;
    } | null;
    inventoryWatch?: {
      watchStatus?: string | null;
      recommendedNextMove?: string | null;
    } | null;
  }) {
    const specialists = (helpers.resolveImobBackingSpecialists(params.caseContext) as any[] | null | undefined) ?? [];
    const specialistAgents = specialists
      .map((item) => helpers.asString(item?.primaryAgentId))
      .filter(Boolean) as string[];
    const inferredSupportingAgents = [
      params.closingDocuments?.readinessStatus === "blocked" ? "J_360" : null,
      helpers.asString(params.caseContext?.blocker)?.match(/finance|pag|comissao|repasse|sinal/i) ? "fin-nexus" : null,
    ].filter(Boolean) as string[];
    const supportingAgents = Array.from(new Set([
      ...specialistAgents,
      ...inferredSupportingAgents,
    ])).slice(0, 3);
    const pendingHandoffs = [
      ...specialists
      .map((item) => {
        const agentId = helpers.asString(item?.primaryAgentId);
        const suggestedAction = helpers.asString(item?.suggestedAction);
        return agentId && suggestedAction ? `${agentId}: ${suggestedAction}` : null;
      })
      .filter(Boolean) as string[],
      params.closingDocuments?.readinessStatus === "blocked"
        ? "J_360: validar pendências documentais e contratuais antes de avançar o caso."
        : null,
    ].filter(Boolean) as string[];
    const blockingIssues = Array.from(new Set([
      helpers.asString(params.caseContext?.blocker),
      ...((params.closingDocuments?.blockingIssues ?? []).map((item) => helpers.asString(item))),
    ].filter(Boolean) as string[])).slice(0, 5);
    const ownerCapability = buildMissionOwnerCapability({
      caseContext: params.caseContext,
      closingDocuments: params.closingDocuments ?? null,
      inventoryWatch: params.inventoryWatch ?? null,
      viabilityMarketAnalysis: params.viabilityMarketAnalysis ?? null,
    });
    const missionReasonCodes = Array.from(new Set([
      ...(params.decisionRationale?.reasonCodes ?? []),
      ...specialists
        .map((item) => helpers.asString(item?.reasonCode))
        .filter(Boolean) as string[],
    ])).slice(0, 6);
    const nextStep = helpers.asString(params.caseContext?.nextStep);
    const hasMinimumContext = Boolean(
      helpers.asString(params.caseContext?.flow)
      || helpers.asString(params.caseContext?.canonical?.journeyType)
      || nextStep
      || missionReasonCodes.length > 0,
    );

    let missionStatus: "ready" | "watch" | "blocked" | "insufficient_context";
    if (!hasMinimumContext) {
      missionStatus = "insufficient_context";
    } else if (blockingIssues.length > 0 || helpers.asString(params.closingDocuments?.readinessStatus) === "blocked") {
      missionStatus = "blocked";
    } else if (
      helpers.asString(params.inventoryWatch?.watchStatus) === "matching"
      || helpers.asString(params.viabilityMarketAnalysis?.marketStatus) === "viable"
      || helpers.asString(params.closingDocuments?.readinessStatus) === "ready"
    ) {
      missionStatus = "ready";
    } else {
      missionStatus = "watch";
    }

    const recommendedNextMove =
      missionStatus === "blocked"
        ? helpers.asString(params.closingDocuments?.recommendedNextMove) ?? "destravar o bloqueio principal antes de qualquer nova coordenação"
        : missionStatus === "ready"
          ? helpers.asString(params.inventoryWatch?.recommendedNextMove)
            ?? helpers.asString(params.viabilityMarketAnalysis?.recommendedNextMove)
            ?? helpers.asString(params.closingDocuments?.recommendedNextMove)
            ?? nextStep
            ?? "executar o próximo movimento humano com evidência já consolidada"
          : missionStatus === "watch"
            ? helpers.asString(params.inventoryWatch?.recommendedNextMove)
              ?? helpers.asString(params.viabilityMarketAnalysis?.recommendedNextMove)
              ?? nextStep
              ?? "refinar contexto antes de coordenar uma missão mais forte"
            : "coletar contexto mínimo antes de sugerir coordenação multiagente";

    const summaryByStatus = {
      ready: `Missão consultiva pronta para coordenação leve pelo IMOB, com owner capability em ${ownerCapability}.`,
      watch: `Missão consultiva identificada, mas ainda pede refinamento antes de coordenação mais forte em ${ownerCapability}.`,
      blocked: `Missão consultiva bloqueada por pendências objetivas antes de qualquer coordenação em ${ownerCapability}.`,
      insufficient_context: "Ainda faltam sinais mínimos para definir uma missão consultiva com segurança.",
    } as const;
    return resolveImobMissionRuntime({
      caseContext: params.caseContext,
      ownerCapability,
      missionStatus,
      supportingAgents,
      missionReasonCodes,
      summary: summaryByStatus[missionStatus],
      pendingHandoffs,
      blockingIssues,
      recommendedNextMove,
      decisionRationale: params.decisionRationale?.sourceRefs ? { sourceRefs: params.decisionRationale.sourceRefs } : null,
    }).snapshot;
  }

  function inferPilotGovernance(params: {
    caseContext: ImobCrmCaseContext;
    decisionRationale?: { sourceRefs?: any[] | null } | null;
    missionOrchestration?: { evidenceRefs?: any[] | null } | null;
  }) {
    const status = helpers.asString(params.caseContext?.status);
    const stage = helpers.asString(params.caseContext?.stage);
    const blocker = helpers.asString(params.caseContext?.blocker) ?? "";
    const lead = helpers.asObject(params.caseContext?.lead);
    const owner = helpers.asObject(params.caseContext?.owner);
    const readyForReview = status === "ready_for_review" || stage === "ready_for_review";
    const hasContactChannel = Boolean(
      helpers.asString(lead?.phone)
      || helpers.asString(lead?.email)
      || helpers.asString(owner?.phone)
      || helpers.asString(owner?.email),
    );
    const governanceBlocked = /consent|lgpd|policy|aprov/i.test(blocker);
    const evidenceRefsCount = Math.max(
      Array.isArray(params.decisionRationale?.sourceRefs) ? params.decisionRationale?.sourceRefs?.length ?? 0 : 0,
      Array.isArray(params.missionOrchestration?.evidenceRefs) ? params.missionOrchestration?.evidenceRefs?.length ?? 0 : 0,
      1,
    );

    return {
      consentProvided: hasContactChannel && !governanceBlocked,
      humanApprovalGranted: readyForReview,
      evidenceRefsCount,
      policyAccepted: readyForReview && !governanceBlocked,
    };
  }

  function buildPilotFlowSnapshot(params: {
    caseContext: ImobCrmCaseContext;
    decisionRationale?: { sourceRefs?: any[] | null } | null;
    missionOrchestration?: { evidenceRefs?: any[] | null } | null;
    reengagementSuggestion?: {
      messageBase?: string | null;
      suggestedChannel?: string | null;
    } | null;
  }) {
    const flow = helpers.asString(params.caseContext?.flow);
    const journey = helpers.asString(params.caseContext?.canonical?.journeyType);
    const lead = helpers.asObject(params.caseContext?.lead);
    const property = helpers.asObject(params.caseContext?.property);
    const owner = helpers.asObject(params.caseContext?.owner);
    const generatedAt = new Date().toISOString();
    const governance = inferPilotGovernance({
      caseContext: params.caseContext,
      decisionRationale: params.decisionRationale ?? null,
      missionOrchestration: params.missionOrchestration ?? null,
    });
    const state = createImobPilotFlowState();
    const caseId = params.caseContext?.caseId ?? null;
    const leadId = helpers.asString(lead?.id) ?? null;

    if (flow === "visit.schedule" || journey === "visit_follow_up") {
      return runImobAssistedCalendarFlow({
        state,
        caseId,
        leadId,
        generatedAt,
        humanApprovalGranted: governance.humanApprovalGranted,
        evidenceRefsCount: governance.evidenceRefsCount,
        policyAccepted: governance.policyAccepted,
        payload: {
          caseId,
          leadId,
          nextStep: helpers.asString(params.caseContext?.nextStep),
        },
      });
    }

    if (flow === "listing.activate") {
      return runImobAssistedListingFlow({
        state,
        caseId,
        leadId,
        generatedAt,
        humanApprovalGranted: governance.humanApprovalGranted,
        evidenceRefsCount: governance.evidenceRefsCount,
        policyAccepted: governance.policyAccepted,
        payload: {
          caseId,
          propertyId: helpers.asString(property?.id),
          publicationGoal: helpers.asString(property?.goal),
        },
      });
    }

    if (flow === "property.create" || flow === "owner.create" || journey === "property_capture") {
      return runImobShadowCaptureEnrichmentFlow({
        state,
        caseId,
        leadId,
        generatedAt,
        sourceUrl: `crm://case/${caseId ?? "unknown"}`,
        sourceId: helpers.asString(property?.id) ?? helpers.asString(owner?.id) ?? caseId ?? "unknown",
        source: "crm_internal_shadow",
        sourceTimestamp: generatedAt,
        confidence: 0.82,
        consentBasis: "crm_case_contact_context",
        piiMasking: "masked",
        reconciliationStatus: "matched",
        address: helpers.asString(property?.address),
        ownerName: helpers.asString(owner?.name) ?? helpers.asString(helpers.asObject(property?.owner)?.name),
        ownerPhone: helpers.asString(owner?.phone),
        propertyType: helpers.asString(property?.propertyType),
        askingPriceCents: typeof property?.askingPriceCents === "number" ? property.askingPriceCents : null,
        payload: {
          caseId,
          propertyId: helpers.asString(property?.id),
        },
        consentProvided: governance.consentProvided,
        humanApprovalGranted: governance.humanApprovalGranted,
        evidenceRefsCount: governance.evidenceRefsCount,
        policyAccepted: governance.policyAccepted,
      });
    }

    if (params.reengagementSuggestion && leadId) {
      return runImobAssistedReengagementFlow({
        state,
        caseId,
        leadId,
        generatedAt,
        consentProvided: governance.consentProvided,
        humanApprovalGranted: governance.humanApprovalGranted,
        evidenceRefsCount: governance.evidenceRefsCount,
        policyAccepted: governance.policyAccepted,
        payload: {
          caseId,
          leadId,
          messageBase: helpers.asString(params.reengagementSuggestion?.messageBase),
          suggestedChannel: helpers.asString(params.reengagementSuggestion?.suggestedChannel),
        },
      });
    }

    return undefined;
  }

  function getImobBusinessRecommendedAction(caseContext: ImobCrmCaseContext) {
    const actions = Array.isArray(caseContext?.canonical?.recommendedActions)
      ? caseContext.canonical.recommendedActions
      : [];
    return actions[0] ?? null;
  }

  function normalizeBusinessPendingItems(caseContext: ImobCrmCaseContext, items: string[]) {
    const owner = helpers.asObject(caseContext?.owner);
    const ownerName = helpers.asString(owner?.name);
    const ownerPhone = helpers.asString(owner?.phone);
    const ownerEmail = helpers.asString(owner?.email);
    const ownerDocument = helpers.asString(owner?.document);

    return items.filter((item) => {
      const normalized = helpers.normalizeImobRouteText(String(item));
      if (ownerName && normalized.includes("nome do proprietario")) return false;
      if (ownerPhone && normalized.includes("telefone do proprietario")) return false;
      if (ownerEmail && normalized.includes("e-mail do proprietario")) return false;
      if (ownerDocument && (normalized.includes("documento do proprietario") || normalized.includes("ownerdocument"))) return false;
      return true;
    });
  }

  function getImobBusinessPendingItems(caseContext: ImobCrmCaseContext): string[] {
    const pendingItems = Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems : [];
    const missingContext = Array.isArray(caseContext?.canonical?.missingContext) ? caseContext.canonical.missingContext : [];
    const missingProof = caseContext?.evidence?.status === "missing"
      ? [
          caseContext.evidence.missingProof.length > 0
            ? `proof mínima pendente (${caseContext.evidence.missingProof.join(", ")})`
            : "proof mínima pendente",
        ]
      : [];
    const missingFollowUp = caseContext?.commercialFollowUp
      ? [
          caseContext.commercialFollowUp.status === "awaiting_response"
            ? caseContext.commercialFollowUp.source === "proposal_negotiation"
              ? "resposta da proposta pendente"
              : "resposta comercial pendente"
            : caseContext.commercialFollowUp.status === "reengagement_required"
              ? caseContext.commercialFollowUp.source === "proposal_negotiation"
                ? "retomada comercial da proposta pendente"
                : "reengajamento comercial pendente"
              : "follow-up comercial pendente",
        ]
      : [];
    const combined = [...pendingItems, ...missingContext, ...missingProof, ...missingFollowUp]
      .map((item) => String(item))
      .filter(Boolean);
    return Array.from(new Set(normalizeBusinessPendingItems(caseContext, combined)));
  }

  function getImobBusinessBlockers(caseContext: ImobCrmCaseContext): string[] {
    const blockers = [
      ...(helpers.asString(caseContext?.blocker) ? [String(caseContext.blocker)] : []),
      ...(Array.isArray(caseContext?.canonical?.blockedActions) ? caseContext.canonical.blockedActions : []),
    ];
    return Array.from(new Set(blockers.map((item) => String(item)).filter(Boolean)));
  }

  function inferNarrativeWaitingOn(params: {
    caseContext: ImobCrmCaseContext;
    primaryBlocker: string | null;
    primaryPending: string | null;
    pendingItems: string[];
  }) {
    const signals = [
      params.primaryBlocker,
      params.primaryPending,
      ...params.pendingItems,
      helpers.asString(params.caseContext?.nextStep),
    ]
      .map((item) => helpers.normalizeImobRouteText(String(item ?? "")))
      .filter(Boolean);

    const hasOwnerSignal = signals.some((item) =>
      item.includes("proprietario")
      || item.includes("ownerdocument")
      || item.includes("nome do proprietario")
      || item.includes("telefone do proprietario")
      || item.includes("e-mail do proprietario"),
    );
    if (hasOwnerSignal) return "owner" as const;

    const hasFinanceSignal = signals.some((item) =>
      item.includes("finance")
      || item.includes("comissao")
      || item.includes("repasse")
      || item.includes("sinal"),
    );
    if (hasFinanceSignal) return "finance" as const;

    const hasLegalSignal = signals.some((item) =>
      item.includes("contrato")
      || item.includes("matricula")
      || item.includes("escritura")
      || item.includes("jurid"),
    );
    if (hasLegalSignal) return "legal" as const;

    const hasProposalSignal = signals.some((item) =>
      item.includes("proposta")
      || item.includes("contraproposta")
      || item.includes("aprovacao")
      || item.includes("negoci"),
    );
    if (hasProposalSignal) return "broker" as const;

    const hasLeadSignal = signals.some((item) =>
      item.includes("lead")
      || item.includes("comprador")
      || item.includes("locatario")
      || item.includes("cliente")
      || item.includes("visita"),
    );
    if (hasLeadSignal) return "lead" as const;

    const hasPropertySignal = signals.some((item) =>
      item.includes("imovel")
      || item.includes("endereco")
      || item.includes("preco do imovel")
      || item.includes("valor do imovel"),
    );
    if (hasPropertySignal) return "broker" as const;

    return params.caseContext?.humanWorkflow?.waitingOn ?? null;
  }

  function inferNarrativeNextActionOwner(params: {
    caseContext: ImobCrmCaseContext;
    waitingOn: ReturnType<typeof inferNarrativeWaitingOn>;
  }) {
    const explicitOwner = helpers.asString(params.caseContext?.humanWorkflow?.nextActionOwner)
      ?? helpers.asString(params.caseContext?.ownerResponsible);
    if (explicitOwner) return explicitOwner;
    switch (params.waitingOn) {
      case "legal":
        return "Jurídico";
      case "finance":
        return "Financeiro";
      case "owner":
      case "lead":
      case "broker":
        return "Corretor";
      case "internal":
        return "Operação";
      default:
        return null;
    }
  }

  function buildImobBusinessWorkflowContext(params: {
    caseContext: ImobCrmCaseContext;
    pendingItems: string[];
    primarySpecialistAgentId?: string | null;
  }): ImobCrmWorkflowContext {
    const propertyLinked = Boolean(helpers.asString(helpers.asObject(params.caseContext?.property)?.id));
    const normalizedPending = params.pendingItems.map((item) => helpers.normalizeImobRouteText(String(item)));
    const hasLeadQualificationPending = normalizedPending.some((item) =>
      item.includes("lead")
      || item.includes("comprador")
      || item.includes("locatario")
      || item.includes("locatário")
      || item.includes("cliente")
    );
    const leadRecord = helpers.asObject(params.caseContext?.lead);
    const leadStatus = helpers.asString(leadRecord?.stage) ?? helpers.asString(leadRecord?.status);
    const leadExists = Boolean(helpers.asString(leadRecord?.id) || params.caseContext?.lead);
    const leadQualified = params.caseContext?.flow === "visit.schedule"
      ? (leadExists && !hasLeadQualificationPending) || leadStatus === "qualified"
      : params.caseContext?.flow === "lead.qualify"
        ? params.pendingItems.length === 0
        : leadExists;
    return {
      pendingFields: params.pendingItems,
      propertyLinked,
      leadQualified,
      ownershipAgentId: "IMOB",
      specialistAgentId: params.primarySpecialistAgentId ?? null,
    };
  }

  function getWorkflowFallbackNextMessage(state: ImobCrmWorkflowState, caseContext: ImobCrmCaseContext) {
    if (state === "documents.review") return "revisar documentos";
    return buildCaseAwareStatusNextMessage(caseContext);
  }

  function buildCaseAwareStatusNextMessage(caseContext: ImobCrmCaseContext) {
    return helpers.asString(caseContext?.caseId)
      ? `consultar caso ${String(caseContext.caseId)}`
      : "consultar caso";
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

  function buildCompactBlockedRunResolutionBlocks(params: {
    caseBrief: ReturnType<typeof buildCaseBrief>;
    actionableChecklist: ReturnType<typeof buildActionableChecklist>;
    primaryNextStep: string;
    primaryBlocker: string | null;
    primaryPending: string | null;
  }) {
    const compactChecklistItems = params.actionableChecklist.items.slice(0, 3).filter((item) => item !== null);
    return [
      {
        kind: "summary" as const,
        title: "Como destravar agora",
        lines: [
          params.caseBrief.summary,
          params.primaryBlocker ? `Bloqueio principal: ${params.primaryBlocker}` : null,
          params.primaryPending ? `Pendência dominante: ${params.primaryPending}` : null,
          params.caseBrief.waitingOn ? `WaitingOn: ${params.caseBrief.waitingOn}` : null,
          params.caseBrief.nextActionOwner ? `Owner da ação: ${params.caseBrief.nextActionOwner}` : null,
          `Próximo passo principal: ${params.primaryNextStep}`,
        ].filter(Boolean),
      },
      compactChecklistItems.length > 0
        ? {
            kind: "details" as const,
            title: "Checklist crítico",
            lines: compactChecklistItems.map((item) =>
              `${item.title} · owner ${item.owner} · destrava ${item.unlocks} · urgência ${item.urgency}`,
            ),
          }
        : null,
    ].filter(Boolean);
  }

  function buildImobBusinessPresentationBlocks(params: {
    intent: BusinessReadIntent;
    caseBrief: ReturnType<typeof buildCaseBrief>;
    preparedFollowUp: ReturnType<typeof buildPreparedFollowUp>;
    actionableChecklist: ReturnType<typeof buildActionableChecklist>;
    handoffPack: ReturnType<typeof buildHandoffPack>;
    primaryNextStep: string;
    primaryBlocker: string | null;
    primaryPending: string | null;
  }) {
    if (params.intent === "blocked_run_resolution") {
      return [] as ReturnType<typeof buildCompactBlockedRunResolutionBlocks>;
    }
    return [
      {
        kind: "summary" as const,
        title: "Resumo do caso",
        lines: [
          params.caseBrief.summary,
          params.caseBrief.phaseObjective ? `Objetivo da fase: ${params.caseBrief.phaseObjective}` : null,
          params.caseBrief.primaryRisk ? `Risco principal: ${params.caseBrief.primaryRisk}` : null,
          params.caseBrief.waitingOn ? `WaitingOn: ${params.caseBrief.waitingOn}` : null,
          params.caseBrief.nextActionOwner ? `Owner da ação: ${params.caseBrief.nextActionOwner}` : null,
          params.caseBrief.nextSafeStep ? `Próximo passo seguro: ${params.caseBrief.nextSafeStep}` : null,
        ].filter(Boolean),
      },
      {
        kind: "details" as const,
        title: "Follow-up preparado",
        text: params.preparedFollowUp.objective,
        lines: [
          `Destinatário: ${params.preparedFollowUp.recipientRole}`,
          `Gatilho: ${params.preparedFollowUp.trigger}`,
          params.preparedFollowUp.expectedReply ? `Resposta esperada: ${params.preparedFollowUp.expectedReply}` : null,
          params.preparedFollowUp.escalationHint ? `Escalada: ${params.preparedFollowUp.escalationHint}` : null,
        ].filter(Boolean),
        ctas: params.preparedFollowUp.variants.map((variant) => ({
          id: `prepared-follow-up-${variant.id}`,
          label: variant.label,
          kind: variant.tone === "direct" ? "primary" : "neutral",
          action: "send_suggested_message" as const,
          nextMessage: variant.text,
        })),
        actionsLayout: "inline" as const,
      },
      {
        kind: "details" as const,
        title: params.actionableChecklist.title,
        lines: params.actionableChecklist.items
          .map((item) => {
            if (!item) return null;
            return `${item.title} · owner ${item.owner} · destrava ${item.unlocks} · urgência ${item.urgency}`;
          })
          .filter((line) => line !== null) as string[],
      },
      ...(params.handoffPack
        ? [
            {
              kind: "details" as const,
              title: "Pacote de handoff",
              lines: [
                `Destino: ${params.handoffPack.targetArea}`,
                `Motivo: ${params.handoffPack.reason}`,
                params.handoffPack.summary,
                params.handoffPack.blocker ? `Blocker: ${params.handoffPack.blocker}` : null,
                params.handoffPack.urgency ? `Urgência: ${params.handoffPack.urgency}` : null,
                params.handoffPack.ownershipBoundary ? `Boundary: ${params.handoffPack.ownershipBoundary}` : null,
                params.handoffPack.needsValidation.length > 0
                  ? `Validar: ${params.handoffPack.needsValidation.join(", ")}`
                  : null,
                params.handoffPack.remainsWithBroker.length > 0
                  ? `Permanece com corretor: ${params.handoffPack.remainsWithBroker.join(" | ")}`
                  : null,
              ].filter(Boolean),
            },
          ]
        : []),
    ].filter((block) => {
      if (block.kind === "details" && !block.text && (!Array.isArray(block.lines) || block.lines.length === 0) && (!Array.isArray((block as any).ctas) || (block as any).ctas.length === 0)) {
        return false;
      }
      return Array.isArray(block.lines) ? block.lines.length > 0 || Boolean(block.text) : true;
    });
  }

  function dedupeWorkflowCtas(ctas: ImobCrmWorkflowCta[], state: ImobCrmWorkflowState) {
    const seen = new Set<string>();
    return ctas.filter((cta) => {
      const key = helpers.normalizeImobRouteText(cta.nextMessage);
      if (!key) return false;
      if (seen.has(key)) return false;
      if (state === "case.review" && key.includes("mostrar bloqueios do caso")) return false;
      seen.add(key);
      return true;
    });
  }

  function buildBlockedRunResolutionCtas(caseContext: ImobCrmCaseContext, pendingItems: string[]) {
    const normalizedPending = pendingItems.map((item) => helpers.normalizeImobRouteText(String(item)));
    const hasOwnerPending = normalizedPending.some((item) => item.includes("proprietario") || item.includes("proprietária"));
    const hasPropertyPending = normalizedPending.some((item) => item.includes("imovel") || item.includes("imóvel"));
    const hasLeadPending = normalizedPending.some((item) => item.includes("lead") || item.includes("comprador") || item.includes("locatario"));
    const hasDocumentPending =
      (caseContext?.flow === "documents.collect" || caseContext?.flow === "contract.prepare")
      || normalizedPending.some((item) => item.includes("document") || item.includes("matricula") || item.includes("matrícula") || item.includes("contrato"));

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
    if (hasDocumentPending) {
      ctas.push({
        id: `case-unblock-documents-${caseContext?.caseId ?? "current"}`,
        label: "Revisar documentos",
        kind: hasOwnerPending ? "secondary" : "primary",
        action: "send_suggested_message",
        nextMessage: "revisar documentos",
      });
    }
    if (hasPropertyPending) {
      const isVisitScheduleFlow = helpers.asString(caseContext?.flow) === "visit.schedule";
      const propertyLabel = isVisitScheduleFlow
        ? "Vincular imóvel da visita"
        : hasDocumentPending ? "Consultar caso" : "Cadastrar imóvel";
      const propertyMessage = isVisitScheduleFlow
        ? "vincular imóvel da visita"
        : hasDocumentPending ? "consultar caso" : "cadastrar imóvel";
      ctas.push({
        id: `case-unblock-property-${caseContext?.caseId ?? "current"}`,
        label: propertyLabel,
        kind: hasDocumentPending || hasOwnerPending ? "secondary" : "primary",
        action: "send_suggested_message",
        nextMessage: propertyMessage,
      });
    }
    if (hasLeadPending) {
      ctas.push({
        id: `case-unblock-lead-${caseContext?.caseId ?? "current"}`,
        label: "Qualificar lead",
        kind: hasDocumentPending || hasOwnerPending || hasPropertyPending ? "secondary" : "primary",
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

  function buildFallbackPrimaryCaseAction(caseContext: ImobCrmCaseContext, nextMessage: string) {
    const normalized = helpers.normalizeImobRouteText(nextMessage);
    let label = "Próximo passo";
    if (normalized.includes("revisar documentos")) label = "Revisar documentos";
    else if (normalized.includes("cadastrar proprietario")) label = "Cadastrar proprietário";
    else if (normalized.includes("cadastrar imovel")) label = "Cadastrar imóvel";
    else if (normalized.includes("qualificar lead")) label = "Qualificar lead";
    else if (normalized.includes("consultar caso")) label = "Consultar caso";
    else if (helpers.asString(caseContext?.canonical?.recommendedActions?.[0]?.label)) label = String(caseContext.canonical?.recommendedActions?.[0]?.label);
    return {
      id: `case-primary-${caseContext?.caseId ?? "current"}`,
      label,
      kind: "primary" as const,
      action: "send_suggested_message" as const,
      nextMessage,
    };
  }

  function alignPrimaryCaseAction(params: {
    caseContext: ImobCrmCaseContext;
    ctas: ImobCrmWorkflowCta[];
    effectiveNextStep: string;
    fallbackKind?: "primary" | "secondary";
  }) {
    const normalizedEffective = helpers.normalizeImobRouteText(params.effectiveNextStep);
    const matchingPrimary = params.ctas.find((cta) => helpers.normalizeImobRouteText(cta.nextMessage) === normalizedEffective);
    const rest = params.ctas.filter((cta) => helpers.normalizeImobRouteText(cta.nextMessage) !== normalizedEffective);
    const primary = matchingPrimary
      ? { ...matchingPrimary, kind: "primary" as const }
      : buildFallbackPrimaryCaseAction(params.caseContext, params.effectiveNextStep);
    return [primary, ...rest.map((cta, index) => ({ ...cta, kind: index === 0 ? "secondary" as const : cta.kind }))].slice(0, 3);
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
      return helpers.asString(caseContext?.flow) === "visit.schedule"
        ? "vincular imóvel da visita"
        : "cadastrar imóvel";
    }
    if (normalizedPending.some((item) => item.includes("lead") || item.includes("comprador") || item.includes("locatario"))) {
      return "qualificar lead";
    }
    if (
      caseContext?.flow === "documents.collect"
      || caseContext?.flow === "contract.prepare"
      || normalizedPending.some((item) => item.includes("document") || item.includes("matricula") || item.includes("matrícula") || item.includes("contrato"))
    ) {
      return "revisar documentos";
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
    const rawNextStep = (caseContext?.evidence?.status === "missing" ? helpers.asString(caseContext.evidence.recommendedNextMove) : null)
      ?? helpers.asString(recommendedAction?.inputHint)
      ?? helpers.asString(caseContext?.nextStep);
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
    const normalizedWaitingOn = inferNarrativeWaitingOn({
      caseContext,
      primaryBlocker,
      primaryPending,
      pendingItems,
    });
    const waitingOn = formatWaitingOnLabel(normalizedWaitingOn);
    const nextActionOwner = inferNarrativeNextActionOwner({
      caseContext,
      waitingOn: normalizedWaitingOn,
    });
    const specialists = (helpers.resolveImobBackingSpecialists(caseContext) as any[] | null | undefined) ?? [];
    const primarySpecialist = specialists[0] ? buildSpecialistSupportLine(specialists[0]) : null;
    const shouldExposeSpecialistSupport = intent === "pipeline_status";
    const proof = caseContext?.proof ?? null;
    const proofSummaryLine = buildProofSummaryLine(proof, caseContext?.evidence ?? null);
    const workflowContext = buildImobBusinessWorkflowContext({
      caseContext,
      pendingItems,
      primarySpecialistAgentId: primarySpecialist?.consultive.agentId ?? null,
    });
    const caseBrief = buildCaseBrief({
      subject,
      humanPhaseLabel,
      phaseObjective: helpers.asString(caseContext?.humanJourney?.phaseObjective),
      primaryBlocker,
      primaryPending,
      waitingOn: normalizedWaitingOn as any,
      nextActionOwner,
      nextStep,
      primarySpecialistAgentId: primarySpecialist?.consultive.agentId ?? null,
      discoverySignals: caseContext?.lead?.discoverySignals ?? null,
    });
    const preparedFollowUp = buildPreparedFollowUp({
      subject,
      humanPhaseLabel,
      waitingOn: normalizedWaitingOn as any,
      primaryBlocker,
      primaryPending,
      nextStep,
      commercialFollowUp: caseContext?.commercialFollowUp ?? null,
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
    const leadDiscovery = isLeadCommercialMemoryCase(caseContext) ? buildLeadDiscoverySnapshot(caseContext) : undefined;
    const leadScoreExecution = isLeadScoringCase(caseContext)
      ? executeLeadScoringSpecialist({
          input: { caseContext },
          buildSnapshot: buildLeadScoreSnapshot,
        })
      : undefined;
    const leadScore = leadScoreExecution?.output;
    const commercialMemoryExecution = executeRelationshipMemorySpecialist({
      input: {
        caseContext,
        decisionRationale,
        leadScore,
      },
      buildSnapshot: buildCommercialMemorySnapshot,
    });
    const commercialMemory = commercialMemoryExecution.output;
    const leadProfileExecution = isLeadCommercialMemoryCase(caseContext)
      ? executeLeadProfileSpecialist({
          input: {
            caseContext,
            leadDiscovery,
            leadScore,
            commercialMemory,
          },
          buildSnapshot: buildLeadProfileReportSnapshot,
        })
      : undefined;
    const leadProfileReport = leadProfileExecution?.output;
    const viabilityExecution = isLeadCommercialMemoryCase(caseContext)
      ? executeViabilitySpecialist({
          input: {
            caseContext,
            leadProfileReport,
            commercialMemory,
            leadScore,
          },
          buildSnapshot: buildViabilityMarketAnalysisSnapshot,
        })
      : undefined;
    const viabilityMarketAnalysis = viabilityExecution?.output;
    const closingExecution = executeClosingSpecialist({
      input: {
        caseContext,
        leadProfileReport,
      },
      buildSnapshot: buildClosingDocumentsSnapshot,
    });
    const closingDocuments = closingExecution.output;
    const reengagementExecution = executeReengagementSpecialist({
      input: {
        caseContext,
        commercialMemory,
        leadScore,
        decisionRationale,
        preparedFollowUp,
      },
      buildSnapshot: buildReengagementSuggestion,
    });
    const reengagementSuggestion = reengagementExecution?.output;
    const inventoryWatchExecution = executeInventoryWatchSpecialist({
      input: {
        caseContext,
        commercialMemory,
        leadScore,
        reengagementSuggestion,
      },
      buildSnapshot: buildInventoryWatchSnapshot,
    });
    const inventoryWatch = inventoryWatchExecution.output;
    const missionExecution = executeMissionOrchestrationSpecialist({
      input: {
        caseContext,
        decisionRationale,
        closingDocuments,
        viabilityMarketAnalysis,
        inventoryWatch,
      },
      buildSnapshot: buildMissionOrchestrationSnapshot,
    });
    const missionOrchestration = missionExecution.output;
    const pilotFlow = buildPilotFlowSnapshot({
      caseContext,
      decisionRationale,
      missionOrchestration,
      reengagementSuggestion,
    });
    const pilotOperationalState = buildImobPilotOperationalSurface({
      caseContext,
      generatedAt: new Date().toISOString(),
    });
    const pilotControlState = buildImobPilotControlSurface({
      caseContext,
      generatedAt: new Date().toISOString(),
    });
    const primaryWorkflowState = deriveImobCrmReviewState({
      flow: caseContext?.flow,
      readOnlyPilot: false,
    });
    const shouldExposePilotReadOnly = intent === "pipeline_status";
    const pilotWorkflowState = shouldExposePilotReadOnly && (pilotOperationalState || pilotControlState)
      ? deriveImobCrmReviewState({ flow: caseContext?.flow, readOnlyPilot: true })
      : null;
    const workflowReasonCodes = buildImobCrmWorkflowReasonCodes({
      state: primaryWorkflowState,
      context: workflowContext,
      includePilotReadOnly: Boolean(pilotWorkflowState),
      includeDocumentsOwnership: primaryWorkflowState === "documents.review",
      includeVisitGuard: caseContext?.flow === "visit.schedule",
    });
    const statusLine = `${subject}. Momento comercial: ${stageLabel}. Jornada: ${journeyLabel}.`;
    const baseLines = [selectionNote ? "Usei o cadastro mais recente do IMOB para esta leitura." : null, statusLine].filter(Boolean) as string[];
	    const textByIntent: Record<BusinessReadIntent, Array<string | null>> = {
      pipeline_status: [
        ...baseLines,
        humanPhaseLabel ? `Fase: ${humanPhaseLabel}.` : null,
        primaryPending ? `Pendência principal: ${primaryPending}.` : "Pendência principal: nada crítico registrado.",
        primaryBlocker ? `Bloqueio atual: ${primaryBlocker}.` : "Bloqueio atual: nenhum bloqueio comercial registrado.",
        waitingOn ? `Waiting on: ${waitingOn}.` : null,
        nextActionOwner ? `Owner da ação: ${nextActionOwner}.` : null,
        proofSummaryLine,
        shouldExposeSpecialistSupport ? (primarySpecialist?.text ?? null) : null,
        `Próximo movimento: ${nextStep}.`,
      ],
      blocked_run_resolution: [
        primaryBlocker
          ? `Bloqueio ativo: ${primaryBlocker.replace(/\.$/, "").toLowerCase()}.`
          : "Nenhum bloqueio comercial registrado.",
        primaryPending ? `Pendência crítica: ${primaryPending}.` : null,
        pendingItems.slice(1, 3).length > 0
          ? `Também faltam: ${pendingItems.slice(1, 3).join(", ")}${pendingItems.length > 3 ? " e outros" : ""}.`
          : null,
        nextActionOwner ? `Owner: ${nextActionOwner}.` : null,
        `Próximo passo: ${nextStep}.`,
      ],
      next_best_action: [
        ...baseLines,
        humanPhaseLabel ? `Fase: ${humanPhaseLabel}.` : null,
        `Melhor ação agora: ${actionLabel}.`,
        primaryBlocker ? `Motivo: existe bloqueio ativo (${primaryBlocker}).` : primaryPending ? `Motivo: existe pendência aberta (${primaryPending}).` : "Motivo: é o movimento com maior chance de avançar este atendimento.",
        waitingOn ? `Waiting on: ${waitingOn}.` : null,
        nextActionOwner ? `Owner da ação: ${nextActionOwner}.` : null,
        proofSummaryLine,
        `Como seguir: ${nextStep}.`,
      ],
    };
    const cardTitleByIntent: Record<BusinessReadIntent, string> = {
      pipeline_status: "Leitura comercial",
      blocked_run_resolution: "Bloqueio do atendimento",
      next_best_action: "Melhor próximo movimento",
    };
    const fallbackCtas = [{
      id: `case-open-${caseContext?.caseId ?? "current"}`,
      label: "Ver leitura comercial",
      kind: "secondary" as const,
      action: "send_suggested_message" as const,
      nextMessage: buildCaseAwareStatusNextMessage(caseContext),
    }];
    const defaultCtas = dedupeWorkflowCtas(filterImobCrmWorkflowCtas({
      state: primaryWorkflowState,
      context: workflowContext,
      normalize: helpers.normalizeImobRouteText,
      ctas: [...buildImobBusinessActionCtas(caseContext), ...fallbackCtas]
        .filter((item) => !(intent === "blocked_run_resolution" && helpers.normalizeImobRouteText(item.nextMessage).includes("mostrar bloqueios do caso"))),
    }), primaryWorkflowState)
      .slice(0, 3);
    const ctas = intent === "blocked_run_resolution"
      ? dedupeWorkflowCtas(filterImobCrmWorkflowCtas({
          state: primaryWorkflowState,
          context: workflowContext,
          normalize: helpers.normalizeImobRouteText,
          ctas: buildBlockedRunResolutionCtas(caseContext, pendingItems),
        }), primaryWorkflowState)
      : defaultCtas;
    const effectiveNextStep = ctas.find((cta) => isImobCrmWorkflowNextMessageValid({
      state: primaryWorkflowState,
      context: workflowContext,
      message: cta.nextMessage,
      normalize: helpers.normalizeImobRouteText,
    }))?.nextMessage
      ?? (getAllowedTransitions(primaryWorkflowState, workflowContext).includes("continue")
        ? nextStep
        : getWorkflowFallbackNextMessage(primaryWorkflowState, caseContext));
    const primaryNextStep = caseContext?.evidence?.status === "missing"
      ? helpers.asString(caseContext.evidence.recommendedNextMove) ?? effectiveNextStep
      : effectiveNextStep;
    const alignedCtas = alignPrimaryCaseAction({
      caseContext,
      ctas,
      effectiveNextStep: primaryNextStep,
    });
    const renderedText = textByIntent[intent]
      .filter(Boolean)
      .join("\n")
      .replace(`Para destravar: ${nextStep}.`, `Para destravar: ${primaryNextStep}.`)
      .replace(`Como seguir: ${nextStep}.`, `Como seguir: ${primaryNextStep}.`);
    return {
      text: renderedText,
      owner: caseContext?.ownerResponsible ?? "Corretor",
      nextStep: primaryNextStep,
      blocker: primaryBlocker ?? undefined,
      consultiveRead: {
        phase: humanPhaseLabel,
        blocker: primaryBlocker ?? null,
        waitingOn: normalizedWaitingOn ?? null,
        nextActionOwner: nextActionOwner ?? null,
        nextSafeStep: nextStep,
        specialists: shouldExposeSpecialistSupport
          ? specialists.slice(0, 2).map((item) => buildSpecialistSupportLine(item).consultive)
          : [],
        workflow: {
          primaryState: primaryWorkflowState,
          allowedTransitions: getAllowedTransitions(primaryWorkflowState, workflowContext),
          reasonCodes: workflowReasonCodes,
          ownershipAgentId: workflowContext.ownershipAgentId,
          specialistSupportAgentId: workflowContext.specialistAgentId,
          pilotState: pilotWorkflowState,
          pilotReadOnly: Boolean(pilotWorkflowState),
        },
      },
      ...(intent !== "blocked_run_resolution" ? { caseBrief, preparedFollowUp, actionableChecklist } : {}),
      decisionRationale,
      ...(leadDiscovery ? { leadDiscovery } : {}),
      ...(leadProfileReport ? { leadProfileReport } : {}),
      ...(viabilityMarketAnalysis ? { viabilityMarketAnalysis } : {}),
      closingDocuments,
      missionOrchestration,
      ...(pilotFlow ? { pilotFlow } : {}),
      ...(pilotOperationalState ? { pilotOperationalState } : {}),
      ...(pilotControlState ? { pilotControlState } : {}),
      ...(leadScore ? { leadScore } : {}),
      commercialMemory,
      ...(reengagementSuggestion ? { reengagementSuggestion } : {}),
      inventoryWatch,
      ...(intent !== "blocked_run_resolution" ? { handoffPack } : {}),
      ...(proof ? { proof } : {}),
      blocks: buildImobBusinessPresentationBlocks({
        intent,
        caseBrief,
        preparedFollowUp,
        actionableChecklist,
        handoffPack,
        primaryNextStep,
        primaryBlocker,
        primaryPending,
      }),
      pendingFieldLabels: pendingItems,
      suggestedNextAction: primaryNextStep,
      widget: intent !== "blocked_run_resolution" ? buildImobCaseExperienceWidget(caseContext) : null,
      dedupeKey: `crm.case.${intent}:${caseContext?.caseId ?? "unknown"}`,
      workflow: {
        primaryState: primaryWorkflowState,
        allowedTransitions: getAllowedTransitions(primaryWorkflowState, workflowContext),
        reasonCodes: workflowReasonCodes,
        ownershipAgentId: workflowContext.ownershipAgentId,
        specialistSupportAgentId: workflowContext.specialistAgentId,
        pilotState: pilotWorkflowState,
        pilotReadOnly: Boolean(pilotWorkflowState),
      },
      card: {
        title: cardTitleByIntent[intent],
        lines: (intent === "blocked_run_resolution"
          ? [
              subject,
              `Fase: ${humanPhaseLabel}`,
              primaryBlocker ? `Bloqueio: ${primaryBlocker}` : "Bloqueio: nenhum bloqueio comercial",
              primaryPending ? `Pendência dominante: ${primaryPending}` : null,
              nextActionOwner ? `Owner da ação: ${nextActionOwner}` : null,
              proofSummaryLine,
              `Próximo movimento: ${primaryNextStep}`,
            ]
          : [
              subject,
              `Fase: ${humanPhaseLabel}`,
              `Momento: ${stageLabel}`,
              `Pendências: ${helpers.formatImobPendingList(pendingItems)}`,
              primaryBlocker ? `Bloqueio: ${primaryBlocker}` : "Bloqueio: nenhum bloqueio comercial",
              waitingOn ? `Waiting on: ${waitingOn}` : "Waiting on: não identificado",
              nextActionOwner ? `Owner da ação: ${nextActionOwner}` : "Owner da ação: não identificado",
              `Workflow: ${primaryWorkflowState}.`,
              workflowReasonCodes.length > 0 ? `Reason codes: ${workflowReasonCodes.join(", ")}` : null,
              shouldExposePilotReadOnly && pilotControlState ? `Piloto operacional: ${pilotControlState.summary}` : null,
              shouldExposePilotReadOnly && pilotControlState ? `Próxima ação governada: ${pilotControlState.nextHumanAction}` : null,
              proofSummaryLine,
              shouldExposeSpecialistSupport ? (primarySpecialist?.cardLine ?? null) : null,
              `Próximo movimento: ${primaryNextStep}`,
            ]).filter(Boolean) as string[],
        ctas: alignedCtas,
        ...(proof ? { proof } : {}),
      },
    };
  }

  function buildWorkspaceCaseListConsult(params: {
    items: BusinessReadCaseRecord[];
    threadState: ImobCrmConversationState | null | undefined;
    caseId?: string | null;
  }) {
    const items = params.items.slice(0, 5);
    if (items.length === 0) {
      return {
        mode: "consult",
        action: "crm.case.workspace_case_list",
        threadLabel: "Casos",
        conversationState: params.threadState ?? helpers.createEmptyThreadState(),
        presentation: {
          text: "Não encontrei casos IMOB neste workspace para listar.",
          suggestedNextAction: "Crie ou atualize um caso antes de pedir a lista de códigos do workspace.",
          dedupeKey: "crm.case.workspace_case_list:empty",
          card: {
            title: "Workspace sem casos",
            lines: [
              "Nenhum caso IMOB foi encontrado neste workspace.",
              "Quando houver casos ativos, eu consigo listar os códigos mais recentes por aqui.",
            ],
          },
        },
      };
    }

    const firstItem = items[0];
    const firstCaseContext = buildCaseContextFromRecord(firstItem);
    const firstSubject = formatImobBusinessSubject(firstCaseContext);
    const firstNextStep = formatImobBusinessNextStep(firstItem.nextStep, firstCaseContext);
    const lines = items.map((item) => {
      const caseContext = buildCaseContextFromRecord(item);
      const subject = formatImobBusinessSubject(caseContext);
      const stageLabel = formatImobCommercialStageLabel(caseContext);
      return `${item.id} · ${stageLabel} · ${subject}`;
    });

    return {
      mode: "consult",
      action: "crm.case.workspace_case_list",
      threadLabel: "Casos",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      caseContext: params.caseId ? firstCaseContext : undefined,
      presentation: {
        text: [
          `Encontrei ${items.length} ${items.length === 1 ? "caso" : "casos"} recentes no workspace atual.`,
          `Primeiro da fila: ${firstItem.id} em ${formatImobCommercialStageLabel(firstCaseContext)}.`,
          `Próximo movimento mais seguro no caso mais recente: ${firstNextStep}.`,
        ].join("\n"),
        owner: firstItem.ownerResponsible ?? "Corretor",
        suggestedNextAction: firstNextStep,
        dedupeKey: `crm.case.workspace_case_list:${firstItem.id}`,
        card: {
          title: "Casos do workspace",
          lines,
          ctas: [
            {
              id: `case-status-${firstItem.id}`,
              label: "Abrir caso mais recente",
              kind: "primary" as const,
              action: "send_suggested_message" as const,
              nextMessage: `qual status do caso ${firstItem.id}?`,
            },
            {
              id: `case-blockers-${firstItem.id}`,
              label: "Ver bloqueios",
              kind: "secondary" as const,
              action: "send_suggested_message" as const,
              nextMessage: `mostrar bloqueios do caso ${firstItem.id}`,
            },
          ],
        },
        widget: null,
        blocks: [
          {
            kind: "summary",
            title: "Lista de casos",
            lines,
          },
        ],
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
    const safeNextStep = formatImobBusinessNextStep(latestCase.nextStep, caseContext);
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
      latestCase.nextStep ? `Próximo passo: ${safeNextStep}` : null,
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
          latestCase.nextStep ? `Próximo passo: ${safeNextStep}` : null,
        ].filter(Boolean).join("\n"),
        owner: latestCase.ownerResponsible ?? "Corretor",
        nextStep: latestCase.nextStep ?? undefined,
        pendingFieldLabels: pendingItems,
        suggestedNextAction: safeNextStep ?? "Vincular este cadastro ao próximo passo comercial.",
        widget: undefined,
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
    const operationalFlow = helpers.asString((data as { conversationState?: { operational?: { flow?: unknown } | null } | null })?.conversationState?.operational?.flow);
    const hasOperationalForm = Boolean(data.presentation?.form) && Boolean(operationalFlow);
    const suggestedNextAction = helpers.asString(data.presentation?.suggestedNextAction)
      ?? (hasOperationalForm ? helpers.asString(data.presentation?.nextStep) : null)
      ?? helpers.asString(firstRecommended?.inputHint)
      ?? helpers.asString(firstRecommended?.label);
    const shouldInjectWidget = !hasOperationalForm
      && (
        !data.presentation?.card
        || (Array.isArray(effectiveCaseContext.pendingItems) && effectiveCaseContext.pendingItems.length > 0)
        || Boolean(helpers.asString(effectiveCaseContext.blocker))
      );
    return {
      ...data,
      caseContext: effectiveCaseContext,
      presentation: data.presentation ? { ...data.presentation, suggestedNextAction, widget: data.presentation.widget !== undefined ? data.presentation.widget : (shouldInjectWidget ? buildImobCaseExperienceWidget(effectiveCaseContext) : undefined) } : data.presentation,
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
          lead: data.caseContext.lead,
          property: data.caseContext.property,
          owner: data.caseContext.owner,
        }),
      },
    };
  }

  return {
    buildCaseContextFromRecord,
    resolveImobBusinessReadIntent: helpers.resolveBusinessReadIntent,
    buildImobBusinessReadPresentation,
    buildWorkspaceCaseListConsult,
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
