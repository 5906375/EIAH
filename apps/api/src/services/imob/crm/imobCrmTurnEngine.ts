import { resolveImobSemanticIntent, type ImobSemanticIntentResolution } from "../imobSemanticIntentResolver";
import { matchImobConversationalIntents } from "../imobIntentCatalog";
import { resolveImobTurn } from "../imobTurnResolver";
import type {
  ImobCrmCaseContext,
  ImobCrmTurnCopyState,
  ImobCrmTurnEntitlements,
} from "./imobCrmAgentContract";
import type { OperationalResolution, ThreadStateLike } from "./imobCrmOperationalResolverShared";
import { extractImobOperationalBatches, formatImobBatchLineSummary } from "./imobCrmTurnBatch";
import { applyResponsibleLabelToResolvedTurn } from "./imobCrmTurnPresentation";
import { createEmptyImobCrmThreadState, parseImobCrmThreadState } from "./imobCrmTurnState";

export type ImobCrmTurnEngineHelpers = {
  asString: (value: unknown) => string | null;
  hydrateThreadStateWithPersistedLead: (params: any) => Promise<ThreadStateLike>;
  resolveImobOperationalUpdate: (params: any) => Promise<OperationalResolution | null>;
  resolveImobOperationalConsult: (params: any) => Promise<OperationalResolution | null>;
  applyCanonicalJourneyToResolvedData: (data: any, caseContext?: unknown) => any;
  applyExistingRegistrationResolution: (params: any) => Promise<OperationalResolution>;
  injectResolvedPendingSuggestion: (resolved: OperationalResolution) => OperationalResolution;
  upsertImobCaseFromResolvedTurn: (params: any) => Promise<unknown>;
  normalizeImobRouteText: (value: string) => string;
  formatImobCaseFlowLabel: (flow: string) => string;
};

export type ImobCrmTurnEngineParams = {
  prisma: unknown;
  authContext: {
    tenantId: string;
    workspaceId: string;
    userId?: string | null;
  };
  body: Record<string, unknown>;
  workspaceResponsibleLabel: string;
  entitlements: ImobCrmTurnEntitlements;
  helpers: ImobCrmTurnEngineHelpers;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function hasActivePendingOperationalFlow(threadState: ThreadStateLike | null | undefined) {
  const operational = asObject(asObject(threadState)?.operational);
  if (!operational) return false;
  const status = asString(operational.status);
  const pendingFields = asStringList(operational.pendingFields);
  return status === "collecting" && pendingFields.length > 0;
}

function hasStrongBusinessReadIntent(message: string) {
  return matchImobConversationalIntents(message).some((intent) =>
    intent.intentId === "pipeline_status"
    || intent.intentId === "blocked_run_resolution"
    || intent.intentId === "next_best_action"
  );
}

function isExplicitOperationalCommand(message: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasOperationalVerb =
    normalized.includes("cadastrar") ||
    normalized.includes("qualificar") ||
    normalized.includes("revisar documentos") ||
    normalized.includes("coletar documentos") ||
    normalized.includes("validar documento");
  if (!hasOperationalVerb) return false;
  return (
    normalized.includes("propriet") ||
    normalized.includes("imovel") ||
    normalized.includes("lead") ||
    normalized.includes("comprador") ||
    normalized.includes("locatario") ||
    normalized.includes("document")
  );
}

function buildCaptureSwitchActions() {
  return [
    {
      id: "capture-switch-lead",
      label: "Qualificar lead",
      kind: "primary",
      action: "send_suggested_message",
      nextMessage: "qualificar lead deste caso",
    },
    {
      id: "capture-switch-owner",
      label: "Cadastrar proprietário",
      kind: "secondary",
      action: "send_suggested_message",
      nextMessage: "cadastrar proprietário",
    },
    {
      id: "capture-switch-docs",
      label: "Revisar documentos",
      kind: "neutral",
      action: "send_suggested_message",
      nextMessage: "coletar documentos",
    },
    {
      id: "capture-switch-case",
      label: "Consultar caso",
      kind: "neutral",
      action: "send_suggested_message",
      nextMessage: "consultar caso",
    },
  ] as const;
}

function buildLeadPostQualificationActions() {
  return [
    {
      id: "lead-next-property",
      label: "Cadastrar imóvel",
      kind: "primary",
      action: "send_suggested_message",
      nextMessage: "cadastrar imóvel",
    },
    {
      id: "lead-next-owner",
      label: "Cadastrar proprietário",
      kind: "secondary",
      action: "send_suggested_message",
      nextMessage: "cadastrar proprietário",
    },
    {
      id: "lead-next-docs",
      label: "Revisar documentos",
      kind: "neutral",
      action: "send_suggested_message",
      nextMessage: "coletar documentos",
    },
    {
      id: "lead-next-case",
      label: "Consultar caso",
      kind: "neutral",
      action: "send_suggested_message",
      nextMessage: "consultar caso",
    },
  ] as const;
}

function inferImobCrmCopyStateFromResolution(data: Record<string, unknown>): ImobCrmTurnCopyState | null {
  const action = asString(data.action) ?? "";
  const mode = asString(data.mode) ?? "";
  const presentation = asObject(data.presentation) ?? {};
  const conversationState = asObject(data.conversationState) ?? {};
  const operational = asObject(conversationState.operational) ?? {};
  const operationalFlow = asString(operational.flow) ?? "";
  const operationalStatus = asString(operational.status) ?? "";
  const text = asString(presentation.text)?.toLowerCase() ?? "";
  const hasForm = Boolean(asObject(presentation.form));
  const hasCard = Boolean(asObject(presentation.card));
  const hasNextStep = Boolean(asString(presentation.nextStep));
  const pendingFieldLabels = asStringList(presentation.pendingFieldLabels);
  const cardCtas = Array.isArray(asObject(presentation.card)?.ctas) ? (asObject(presentation.card)?.ctas as unknown[]) : [];

  if (action === "crm.batch.intake") return "batch_summary";
  if (action === "crm.registration.dedupe_review") return "dedupe_choice";
  if (mode === "blocked") return pendingFieldLabels.length > 0 ? "blocked_missing_data" : "blocked_scope";

  if (hasForm && pendingFieldLabels.length > 0) return "collecting_fields";
  if (hasForm && operationalStatus === "collecting") return "collecting_fields";
  if (hasForm) return "form_draft";

  if (action.endsWith(".list")) return "entity_list";
  if (action.endsWith(".lookup") || action === "crm.case.recent_registration" || action === "case.status") return "entity_detail";

  if (action.endsWith(".update") || action === "updated") return "updated";
  if (action.endsWith(".delete") || action === "created" || action === "deleted") return "processed";

  if (pendingFieldLabels.length > 0 && (operationalStatus === "collecting" || operationalFlow.length > 0)) return "collecting_fields";
  if (pendingFieldLabels.length > 0) return "blocked_missing_data";

  if (
    cardCtas.length > 0
    && cardCtas.length <= 4
    && (text.includes("posso seguir por uma destas opções agora") || text.includes("próximos passos") || text.includes("proximos passos"))
  ) {
    return "entry_options";
  }

  if (text.includes("continuar de onde paramos") || text.includes("retomei o cadastro em andamento")) return "continuity";
  if (cardCtas.length > 0 && hasCard) return "fallback_options";
  if (hasNextStep || asString(presentation.suggestedNextAction)) return "next_actions";

  return null;
}

function buildImobPresentationBlocks(data: Record<string, unknown>, copyState: ImobCrmTurnCopyState | null) {
  const action = asString(data.action) ?? "";
  const presentation = asObject(data.presentation) ?? {};
  const conversationState = asObject(data.conversationState) ?? {};
  const operational = asObject(conversationState.operational) ?? {};
  const flow = asString(operational.flow) ?? "";
  const operationalStatus = asString(operational.status) ?? "";
  const card = asObject(presentation.card);
  const cardCtas = Array.isArray(card?.ctas) ? (card?.ctas as Array<Record<string, unknown>>) : [];

  if (flow === "property.create" && operationalStatus === "ready_for_review") {
    return [
      {
        kind: "confirmation",
        text: "Cadastro do imóvel processado com sucesso.",
        phase: "post_success",
      },
      {
        kind: "next_actions",
        title: "Posso seguir com uma destas ações agora.",
        ctas: buildCaptureSwitchActions(),
        actionsLayout: "inline",
        persistent: true,
        phase: "post_success",
      },
    ];
  }

  if (flow === "lead.qualify" && operationalStatus === "ready_for_review") {
    return [
      {
        kind: "confirmation",
        text: "Lead cadastrado e qualificado com sucesso.",
        phase: "post_success",
      },
      {
        kind: "next_actions",
        title: "Posso seguir com uma destas ações agora.",
        ctas: buildLeadPostQualificationActions(),
        actionsLayout: "inline",
        persistent: true,
        phase: "post_success",
      },
    ];
  }

  if (action === "crm.capture.entry_options" || copyState === "entry_options") {
    const menuCtas = cardCtas.length > 0
      ? cardCtas
      : buildCaptureSwitchActions();
    return [
      {
        kind: "next_actions",
        title: "Posso seguir por uma destas opções agora.",
        ctas: menuCtas,
        actionsLayout: "inline",
        persistent: true,
        phase: "pre_execution",
      },
    ];
  }

  if (copyState === "next_actions" && flow.includes("create")) {
    return [
      {
        kind: "next_actions",
        title: "Posso seguir com uma destas ações agora.",
        ctas: buildCaptureSwitchActions(),
        actionsLayout: "inline",
        persistent: true,
        phase: "pre_execution",
      },
    ];
  }

  return [];
}

function applyImobCrmCopyStateToResolution(data: Record<string, unknown>): Record<string, unknown> {
  const copyState = inferImobCrmCopyStateFromResolution(data);
  const presentation = asObject(data.presentation) ?? {};
  const blocks = buildImobPresentationBlocks(data, copyState);
  if (!copyState && blocks.length === 0) return data;
  return {
    ...data,
    presentation: {
      ...presentation,
      ...(copyState ? { copyState } : {}),
      ...(blocks.length > 0 ? { blocks } : {}),
    },
  };
}

export async function resolveImobCrmTurnEngine(params: ImobCrmTurnEngineParams) {
  const { asString } = params.helpers;
  const message = asString(params.body.message);
  const requestedCaseId = asString(params.body.caseId);
  const requestedThreadId = asString(params.body.threadId);
  const threadLabel = asString(params.body.threadLabel);
  const parsedThreadState = parseImobCrmThreadState(params.body);

  const processSingleOperationalTurn = async (turn: {
    message: string;
    caseId?: string | null;
    threadState: ThreadStateLike;
    semanticIntent?: ImobSemanticIntentResolution | null;
  }) => {
    const hydratedThreadState = await params.helpers.hydrateThreadStateWithPersistedLead({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      message: turn.message,
      caseId: turn.caseId,
      threadLabel,
      threadState: turn.threadState,
    });

    const updateData = await params.helpers.resolveImobOperationalUpdate({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      userId: params.authContext.userId ?? null,
      message: turn.message,
      caseId: turn.caseId,
      threadState: hydratedThreadState,
    });
    if (updateData) {
      const data = applyResponsibleLabelToResolvedTurn(updateData, params.workspaceResponsibleLabel);
      return {
        data: params.helpers.applyCanonicalJourneyToResolvedData(data, (data.caseContext as ImobCrmCaseContext | null | undefined) ?? null),
        caseContext: data.caseContext ?? null,
      };
    }

    const shouldPrioritizeActiveFlowContinuity = hasActivePendingOperationalFlow(hydratedThreadState);
    const shouldPrioritizeBusinessRead = hasStrongBusinessReadIntent(turn.message);

    if (shouldPrioritizeBusinessRead && !isExplicitOperationalCommand(turn.message)) {
      const consultData = await params.helpers.resolveImobOperationalConsult({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        userId: params.authContext.userId ?? null,
        message: turn.message,
        caseId: turn.caseId,
        threadState: hydratedThreadState,
      });
      if (consultData) {
        const data = applyResponsibleLabelToResolvedTurn(consultData, params.workspaceResponsibleLabel);
        return {
          data: params.helpers.applyCanonicalJourneyToResolvedData(data, (data.caseContext as ImobCrmCaseContext | null | undefined) ?? null),
          caseContext: data.caseContext ?? null,
        };
      }
    }

    if (shouldPrioritizeActiveFlowContinuity) {
      const semanticIntent = turn.semanticIntent ?? await resolveImobSemanticIntent(turn.message);
      const resolvedTurn = resolveImobTurn({
        message: turn.message,
        semanticIntent: semanticIntent.parsedIntent,
        semanticIntentSource: semanticIntent.source,
        threadLabel,
        threadId: requestedThreadId,
        caseId: turn.caseId,
        threadState: hydratedThreadState as any,
        access: {
          tenantId: params.authContext.tenantId,
          entitlements: params.entitlements,
        },
      });
      const registrationAwareTurn = await params.helpers.applyExistingRegistrationResolution({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        resolved: params.helpers.injectResolvedPendingSuggestion(resolvedTurn),
      });
      const data = applyResponsibleLabelToResolvedTurn(registrationAwareTurn, params.workspaceResponsibleLabel);

      const caseContext = await params.helpers.upsertImobCaseFromResolvedTurn({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        caseId: turn.caseId,
        threadId: requestedThreadId,
        threadLabel,
        resolved: data,
      });

      const resolvedCaseContext = caseContext ?? data.caseContext ?? null;
      return {
        data: params.helpers.applyCanonicalJourneyToResolvedData(data, resolvedCaseContext as ImobCrmCaseContext | null),
        caseContext: resolvedCaseContext,
      };
    }

    if (!isExplicitOperationalCommand(turn.message)) {
      const consultData = await params.helpers.resolveImobOperationalConsult({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        userId: params.authContext.userId ?? null,
        message: turn.message,
        caseId: turn.caseId,
        threadState: hydratedThreadState,
      });
      if (consultData) {
        const data = applyResponsibleLabelToResolvedTurn(consultData, params.workspaceResponsibleLabel);
        return {
          data: params.helpers.applyCanonicalJourneyToResolvedData(data, (data.caseContext as ImobCrmCaseContext | null | undefined) ?? null),
          caseContext: data.caseContext ?? null,
        };
      }
    }

    const semanticIntent = turn.semanticIntent ?? await resolveImobSemanticIntent(turn.message);
    const resolvedTurn = resolveImobTurn({
      message: turn.message,
      semanticIntent: semanticIntent.parsedIntent,
      semanticIntentSource: semanticIntent.source,
      threadLabel,
      threadId: requestedThreadId,
      caseId: turn.caseId,
      threadState: hydratedThreadState as any,
      access: {
        tenantId: params.authContext.tenantId,
        entitlements: params.entitlements,
      },
    });
    const registrationAwareTurn = await params.helpers.applyExistingRegistrationResolution({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      resolved: params.helpers.injectResolvedPendingSuggestion(resolvedTurn),
    });
    const data = applyResponsibleLabelToResolvedTurn(registrationAwareTurn, params.workspaceResponsibleLabel);

    const caseContext = await params.helpers.upsertImobCaseFromResolvedTurn({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      caseId: turn.caseId,
      threadId: requestedThreadId,
      threadLabel,
      resolved: data,
    });

    const resolvedCaseContext = caseContext ?? data.caseContext ?? null;
    return {
      data: params.helpers.applyCanonicalJourneyToResolvedData(data, resolvedCaseContext as ImobCrmCaseContext | null),
      caseContext: resolvedCaseContext,
    };
  };

  const rootSemanticIntent = message ? await resolveImobSemanticIntent(message) : null;
  const batches = extractImobOperationalBatches(
    message ?? "",
    params.helpers.normalizeImobRouteText,
    rootSemanticIntent?.composedIntents ?? null,
  );
  const totalBatchOperations = batches.reduce((count, group) => count + group.length, 0);
  if (totalBatchOperations >= 2) {
    const summaries: string[] = [];
    let latestState: ThreadStateLike = parsedThreadState ?? createEmptyImobCrmThreadState();
    let latestCaseContext: ImobCrmCaseContext | null = null;

    for (const group of batches) {
      let groupCaseId = requestedCaseId ?? null;
      for (const line of group) {
        const result = await processSingleOperationalTurn({
          message: line,
          caseId: groupCaseId,
          threadState: latestState,
        });
        latestState = (result.data.conversationState as ThreadStateLike) ?? latestState;
        const caseContext = result.caseContext as Record<string, unknown> | null | undefined;
        groupCaseId = typeof caseContext?.caseId === "string" ? caseContext.caseId : groupCaseId;
        latestCaseContext = (caseContext as ImobCrmCaseContext | null) ?? latestCaseContext;
        summaries.push(formatImobBatchLineSummary(result.data, line, params.helpers.formatImobCaseFlowLabel));
      }
    }

    return applyImobCrmCopyStateToResolution({
      ...{
        mode: "consult",
        action: "crm.batch.intake",
        threadLabel: "Lote",
        conversationState: latestState,
        caseContext: batches.length === 1 ? latestCaseContext : null,
        presentation: {
          text: [
            `Processei ${totalBatchOperations} operação(ões) deste lote no IMOB.`,
            ...summaries.map((summary, index) => `${index + 1}. ${summary}`),
          ].join("\n"),
          owner: params.workspaceResponsibleLabel,
          nextStep: "Revisar os cadastros processados, completar pendências e seguir para os próximos vínculos comerciais.",
          dedupeKey: `crm.batch.intake:${totalBatchOperations}`,
          card: {
            title: "Lote processado",
            lines: summaries,
          },
        },
      },
      entitlements: params.entitlements,
    });
  }

  const singleResult = await processSingleOperationalTurn({
    message: message ?? "",
    caseId: requestedCaseId,
    threadState: parsedThreadState,
    semanticIntent: rootSemanticIntent,
  });

  return applyImobCrmCopyStateToResolution({
    ...params.helpers.applyCanonicalJourneyToResolvedData(singleResult.data, (singleResult.caseContext ?? singleResult.data.caseContext) as ImobCrmCaseContext | null | undefined),
    caseContext: singleResult.caseContext ?? singleResult.data.caseContext,
    entitlements: params.entitlements,
  });
}
