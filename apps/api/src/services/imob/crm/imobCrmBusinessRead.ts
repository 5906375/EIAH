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
    const statusLine = `${subject}. Momento comercial: ${stageLabel}. Jornada: ${journeyLabel}.`;
    const baseLines = [selectionNote ? "Usei o cadastro mais recente do IMOB para esta leitura." : null, statusLine].filter(Boolean) as string[];
    const textByIntent: Record<BusinessReadIntent, string[]> = {
      pipeline_status: [
        ...baseLines,
        primaryPending ? `Pendência principal: ${primaryPending}.` : "Pendência principal: nada crítico registrado.",
        primaryBlocker ? `Bloqueio atual: ${primaryBlocker}.` : "Bloqueio atual: nenhum bloqueio comercial registrado.",
        `Próximo movimento: ${nextStep}.`,
      ],
      blocked_run_resolution: [
        ...baseLines,
        primaryBlocker ? `Bloqueio principal: ${primaryBlocker}.` : "Não há bloqueio comercial registrado agora.",
        primaryPending ? `Pendência que pode travar o avanço: ${primaryPending}.` : "Não há pendência crítica registrada.",
        `Para destravar: ${nextStep}.`,
      ],
      next_best_action: [
        ...baseLines,
        `Melhor ação agora: ${actionLabel}.`,
        primaryBlocker ? `Motivo: existe bloqueio ativo (${primaryBlocker}).` : primaryPending ? `Motivo: existe pendência aberta (${primaryPending}).` : "Motivo: é o movimento com maior chance de avançar este atendimento.",
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
      pendingFieldLabels: pendingItems,
      suggestedNextAction: nextStep,
      widget: buildImobCaseExperienceWidget(caseContext),
      dedupeKey: `crm.case.${intent}:${caseContext?.caseId ?? "unknown"}`,
      card: {
        title: cardTitleByIntent[intent],
        lines: [
          subject,
          `Momento: ${stageLabel}`,
          `Pendências: ${helpers.formatImobPendingList(pendingItems)}`,
          primaryBlocker ? `Bloqueio: ${primaryBlocker}` : "Bloqueio: nenhum bloqueio comercial",
          `Próximo movimento: ${nextStep}`,
        ],
        ctas,
      },
    };
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
