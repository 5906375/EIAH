import { resolveImobSemanticIntent, type ImobSemanticIntentResolution } from "../imobSemanticIntentResolver";
import { matchImobConversationalIntents } from "../imobIntentCatalog";
import { resolveImobTurn } from "../imobTurnResolver";
import { InternalCrmMarketScanProvider } from "../marketScan/InternalCrmMarketScanProvider";
import { TenantInventoryImportProvider } from "../marketScan/TenantInventoryImportProvider";
import {
  attachMarketScanSnapshotToOperationalState,
  loadLatestImobMarketScanSnapshot,
  persistImobMarketScanSnapshot,
} from "../marketScan/imobMarketScanSnapshot";
import type { MarketScanQuery, MarketScanResult } from "../marketScan/MarketScanProvider";
import { ImobMarketScanProviderRouter } from "../marketScan/imobMarketScanProviderRouter";
import type {
  ImobCrmCaseContext,
  ImobCrmTurnCopyState,
  ImobCrmTurnEntitlements,
} from "./imobCrmAgentContract";
import { ImobCrmRepository } from "./imobCrmRepository";
import type { OperationalResolution, ThreadStateLike } from "./imobCrmOperationalResolverShared";
import { extractImobOperationalBatches, formatImobBatchLineSummary } from "./imobCrmTurnBatch";
import { applyResponsibleLabelToResolvedTurn } from "./imobCrmTurnPresentation";
import { createEmptyImobCrmThreadState, parseImobCrmThreadState } from "./imobCrmTurnState";
import {
  classifyImobCrmWorkflowTransitionFromMessage,
  deriveImobCrmWorkflowState,
  resolveTransition,
  type ImobCrmWorkflowContext,
  type ImobCrmWorkflowReasonCode,
  type ImobCrmWorkflowState,
  type ImobCrmWorkflowTransition,
} from "./imobCrmWorkflowMachine";
import type { ImobMarketScanContext, ImobMarketScanResultSnapshot, ImobProofSurface } from "../imobConversationContract";

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

function buildMarketScanQuery(context: ImobMarketScanContext): MarketScanQuery {
  return {
    cities: context.cities,
    uf: context.uf,
    goals: context.goals,
    propertyTypes: context.propertyTypes,
    bedrooms: context.bedrooms,
    priceRange: context.priceRange,
    limitPerGroup: context.limitPerGroup,
  };
}

function toMarketScanSnapshot(result: MarketScanResult): ImobMarketScanResultSnapshot {
  return {
    scanId: `market-scan-${Date.now()}`,
    ...result,
    readOnly: true,
    generatedAt: new Date().toISOString(),
  };
}

function attachSnapshotToResolvedTurn(
  resolved: OperationalResolution,
  snapshot: ImobMarketScanResultSnapshot | null | undefined,
) {
  if (!snapshot) return resolved;
  const operational = attachMarketScanSnapshotToOperationalState(
    (resolved as any).conversationState?.operational ?? null,
    snapshot,
  );
  return {
    ...resolved,
    conversationState: {
      ...(resolved as any).conversationState,
      operational,
    },
    presentation: {
      ...(resolved as any).presentation,
      marketScanResult: snapshot,
    },
  } as OperationalResolution;
}

async function resolveMarketScanResult(params: {
  prisma: unknown;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  marketScanContext: ImobMarketScanContext;
}): Promise<ImobMarketScanResultSnapshot | null> {
  if (!(params.prisma as any)?.imobProperty?.findMany) return null;
  const repository = new ImobCrmRepository(params.prisma as any);
  const source = {
    listProperties(scope: { tenantId: string; workspaceId: string }) {
      return repository.listProperties(scope) as any;
    },
  };
  const router = new ImobMarketScanProviderRouter({
    internal_crm: new InternalCrmMarketScanProvider(source),
    tenant_inventory_import: new TenantInventoryImportProvider(source),
  });

  const result = await router.search(
    buildMarketScanQuery(params.marketScanContext),
    {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      caseId: params.caseId ?? null,
      marketScanContext: params.marketScanContext,
    },
  );

  return toMarketScanSnapshot(result);
}

function resolveDedupeContextualMessage(
  message: string,
  threadState: ThreadStateLike | null | undefined,
  normalizeImobRouteText: (value: string) => string,
) {
  const operational = asObject(asObject(threadState)?.operational);
  const dedupeDecision = asObject(operational?.dedupeDecision);
  if (!operational || !dedupeDecision) return message;
  if (asString(dedupeDecision.status) !== "pending") return message;

  const flow = asString(dedupeDecision.flow);
  const entityLabel = asString(dedupeDecision.entityLabel);
  const entityId = asString(dedupeDecision.entityId);
  const normalized = normalizeImobRouteText(message);

  const wantsUpdateExisting =
    normalized.includes("atualizar existente")
    || normalized.includes("usar existente")
    || normalized.includes("editar existente");
  if (wantsUpdateExisting && flow === "owner.create" && entityId) {
    return `editar proprietário ${entityId}`;
  }

  const wantsListExisting =
    normalized === "cadastros"
    || normalized === "ver cadastros"
    || normalized.includes("listar cadastros");
  if (wantsListExisting && entityLabel) {
    if (flow === "owner.create") return `listar proprietários ${entityLabel}`;
    if (flow === "lead.qualify") return `listar leads ${entityLabel}`;
  }

  const wantsCreateNew =
    normalized.includes("criar novo")
    || normalized.includes("criar um novo")
    || normalized.includes("novo cadastro");
  if (wantsCreateNew && entityLabel) {
    if (flow === "owner.create") return `criar novo proprietário ${entityLabel}`;
    if (flow === "lead.qualify") return `criar novo lead ${entityLabel}`;
  }

  return message;
}

function resolveWorkflowTransition(
  message: string,
  state: ImobCrmWorkflowState,
  normalizeImobRouteText: (value: string) => string,
  isReadOnlyPilotQuery: boolean,
): ImobCrmWorkflowTransition | null {
  const normalized = normalizeImobRouteText(message);
  if (state === "owner.dedupe_review") {
    if (normalized.startsWith("editar proprietario ") || normalized.startsWith("editar proprietário ")) return "choose_update_existing";
    if (normalized.startsWith("listar proprietarios ") || normalized.startsWith("listar proprietários ")) return "show_records";
    if (normalized.startsWith("criar novo proprietario ") || normalized.startsWith("criar novo proprietário ")) return "choose_create_new";
  }
  if (state === "lead.qualify") {
    if (normalized.startsWith("listar leads ")) return "read_only_query";
    if (normalized.startsWith("criar novo lead ")) return "continue";
  }
  const classified = classifyImobCrmWorkflowTransitionFromMessage(message, normalizeImobRouteText);
  if (classified && classified !== "continue") return classified;
  if (state === "pilot.status") {
    if (isReadOnlyPilotQuery) return "read_only_query";
    return "continue";
  }
  if (isReadOnlyPilotQuery) return "read_only_query";
  if (
    normalized.includes("continuar")
    || normalized.includes("retomar")
    || normalized.includes("seguir")
    || normalized.includes("avancar")
    || normalized.includes("avançar")
    || normalized.includes("prosseguir")
    || normalized.includes("agendar")
    || normalized.includes("iniciar visita")
  ) {
    return "continue";
  }
  return "submit_fields";
}

function resolveWorkflowContext(threadState: ThreadStateLike | null | undefined): ImobCrmWorkflowContext {
  const operational = asObject(asObject(threadState)?.operational);
  const dedupeDecision = asObject(operational?.dedupeDecision);
  const marketScanSelection = asObject(operational?.marketScanSelection);
  const pendingFields = asStringList(operational?.pendingFields);
  const propertyLinked = Boolean(asString(asObject(operational?.visitDraft)?.propertyId));
  const leadQualified = asString(operational?.flow) === "visit.schedule"
    ? true
    : Boolean(pendingFields.length === 0);
  return {
    selectedSourceId: asString(marketScanSelection?.sourceId),
    matchedEntityId: asString(dedupeDecision?.matchedEntityId) ?? asString(dedupeDecision?.entityId),
    matchedEntityLabel: asString(dedupeDecision?.matchedEntityLabel) ?? asString(dedupeDecision?.entityLabel),
    matches: (asString(dedupeDecision?.matchedEntityId) ?? asString(dedupeDecision?.entityId))
      ? [{
        id: asString(dedupeDecision?.matchedEntityId) ?? asString(dedupeDecision?.entityId) ?? "",
        label: asString(dedupeDecision?.matchedEntityLabel) ?? asString(dedupeDecision?.entityLabel),
      }]
      : [],
    pendingFields,
    propertyLinked,
    leadQualified,
    ownershipAgentId: "IMOB",
    specialistAgentId: null,
  };
}

function extractMarketScanSelectionSourceIdFromMessage(
  message: string,
  normalizeImobRouteText: (value: string) => string,
) {
  const normalized = normalizeImobRouteText(message);
  const match = normalized.match(
    /(?:selecionar|usar|salvar|confirmar)\s+(?:imovel|imóvel|item)?(?:\s+do\s+scan)?\s+([a-z0-9][a-z0-9:_-]+)/i,
  );
  return match?.[1]?.trim() ?? null;
}

function buildWorkflowBlockedResolution(params: {
  message: string;
  state: ImobCrmWorkflowState;
  transition: ImobCrmWorkflowTransition;
  reasonCode: ImobCrmWorkflowReasonCode;
  threadState: ThreadStateLike;
}) {
  const reasonCopy: Record<ImobCrmWorkflowReasonCode, string> = {
    market_scan_selection_missing_item: "Ainda não há um imóvel do scan selecionado com segurança para confirmar a captação.",
    owner_dedupe_missing_match: "Encontrei uma decisao de duplicidade pendente, mas o cadastro correspondente nao esta identificado com seguranca.",
    owner_dedupe_missing_matches: "Nao consegui recuperar os cadastros correspondentes para revisar esta duplicidade com seguranca.",
    visit_missing_property: "Ainda falta vincular o imovel da visita antes de seguir com o agendamento.",
    visit_missing_lead_qualification: "Ainda falta qualificar o lead antes de abrir a visita com seguranca.",
    pilot_read_only: "A consulta de piloto neste contexto e somente leitura e nao pode disparar mutacao operacional.",
    lead_already_qualified: "O lead ja foi qualificado e nao deve reabrir esse fluxo sem pendencias reais.",
    documents_ownership_must_remain_imob: "A revisao documental continua sob ownership do IMOB; especialistas entram apenas como apoio.",
    transition_not_allowed: "Essa acao nao e valida para o estado operacional atual do caso.",
  };

  return {
    mode: "blocked",
    action: "crm.workflow.blocked",
    threadLabel: "IMOB CRM",
    conversationState: params.threadState,
    presentation: {
      text: reasonCopy[params.reasonCode],
      nextStep: params.reasonCode === "visit_missing_property"
        ? "Completar o vinculo do imovel da visita antes de avancar."
        : params.reasonCode === "owner_dedupe_missing_match"
          ? "Revisar os cadastros encontrados antes de atualizar existente."
          : undefined,
      pendingFieldLabels: params.reasonCode === "visit_missing_property" ? ["propertyId"] : [],
      metadata: {
        workflowState: params.state,
        workflowTransition: params.transition,
        workflowReasonCode: params.reasonCode,
        originalMessage: params.message,
      },
    },
  } satisfies OperationalResolution;
}

function resolveWorkflowGuard(params: {
  message: string;
  threadState: ThreadStateLike;
  normalizeImobRouteText: (value: string) => string;
  isReadOnlyPilotQuery: boolean;
}) {
  const operational = asObject(asObject(params.threadState)?.operational);
  const state = deriveImobCrmWorkflowState({
    operationalFlow: asString(operational?.flow),
    operationalStatus: asString(operational?.status),
    readOnlyPilot: params.isReadOnlyPilotQuery,
    marketScanSelectionStatus: asString(asObject(operational?.marketScanSelection)?.status),
  });
  if (!state) return null;

  if (state === "lead.qualify" && asString(operational?.status) !== "ready_for_review") return null;

  const transition = resolveWorkflowTransition(
    params.message,
    state,
    params.normalizeImobRouteText,
    params.isReadOnlyPilotQuery,
  );
  if (!transition) return null;

  const workflowContext = resolveWorkflowContext(params.threadState);
  if (transition === "select_market_scan_item" || transition === "confirm_market_scan_selection") {
    workflowContext.selectedSourceId ??= extractMarketScanSelectionSourceIdFromMessage(
      params.message,
      params.normalizeImobRouteText,
    );
  }
  const decision = resolveTransition(state, transition, workflowContext);
  if (decision.allowed) return null;

  return buildWorkflowBlockedResolution({
    message: params.message,
    state,
    transition,
    reasonCode: decision.reasonCode ?? "transition_not_allowed",
    threadState: params.threadState,
  });
}

function hasStrongBusinessReadIntent(message: string) {
  if (matchImobConversationalIntents(message).some((intent) =>
    intent.intentId === "pipeline_status"
    || intent.intentId === "blocked_run_resolution"
    || intent.intentId === "next_best_action"
  )) return true;
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (
    normalized.includes("piloto")
    && (
      normalized.includes("status")
      || normalized.includes("situacao")
      || normalized.includes("estado")
      || normalized.includes("approval")
      || normalized.includes("aprovacao")
      || normalized.includes("rollout")
      || normalized.includes("shadow")
    )
  ) {
    return true;
  }
  return (
    (normalized.includes("resuma esse caso") || normalized.includes("resumir esse caso") || normalized.includes("resumo do caso"))
    && (normalized.includes("caso") || normalized.includes("atendimento"))
  );
}

function inferExplicitStageChangeFlow(message: string): "visit.schedule" | "documents.collect" | "proposal.create" | null {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (
    normalized.includes("revisar documentos")
    || normalized.includes("coletar documentos")
    || normalized.includes("validar documento")
    || normalized.includes("documentacao")
    || normalized.includes("documentação")
  ) {
    return "documents.collect";
  }
  if (
    normalized.includes("visita")
    || normalized.includes("agendar")
    || normalized.includes("agenda")
    || normalized.includes("tour")
  ) {
    return "visit.schedule";
  }
  if (normalized.includes("proposta") || normalized.includes("oferta")) {
    return "proposal.create";
  }
  return null;
}

function isExplicitLeadPropertyLinkRequest(message: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasLeadContext =
    normalized.includes("lead")
    || normalized.includes("cliente")
    || normalized.includes("comprador")
    || normalized.includes("locatario");
  const hasLinkVerb =
    normalized.includes("vincular")
    || normalized.includes("associar")
    || normalized.includes("conectar");
  const hasPropertyContext =
    normalized.includes("imovel")
    || normalized.includes("imóvel")
    || normalized.includes("apartamento")
    || normalized.includes("casa");
  return hasLeadContext && hasLinkVerb && hasPropertyContext;
}

function isExplicitOperationalCommand(message: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (isExplicitLeadPropertyLinkRequest(message)) return true;
  const hasOperationalVerb =
    normalized.includes("cadastrar") ||
    normalized.includes("qualificar") ||
    normalized.includes("agendar") ||
    normalized.includes("visita") ||
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

function isExplicitOperationalConsultCommand(message: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (
    normalized.startsWith("listar proprietarios") ||
    normalized.startsWith("listar imoveis") ||
    normalized.startsWith("listar leads") ||
    normalized.startsWith("consultar proprietario") ||
    normalized.startsWith("consultar imovel") ||
    normalized.startsWith("consultar lead")
  );
}

function rewriteRegistrationDedupeChoiceMessage(
  message: string,
  threadState: ThreadStateLike | null | undefined,
  normalizeImobRouteText: (value: string) => string,
) {
  const normalized = normalizeImobRouteText(message);
  const operational = asObject(asObject(threadState)?.operational);
  const dedupeSelection = asObject(operational?.dedupeSelection);
  const entity = asString(dedupeSelection?.entity);
  const selectedRef = asString(dedupeSelection?.selectedRef);
  const selectedName = asString(dedupeSelection?.selectedName);
  const flow = asString(operational?.flow);
  if (!entity || !selectedRef || !flow) return message;

  if (
    normalized === "atualizar existente" ||
    normalized === "editar existente"
  ) {
    if (entity === "owner" && flow === "owner.create") return `atualizar proprietário ${selectedRef}`;
    if (entity === "lead" && flow === "lead.qualify") return `atualizar lead ${selectedRef}`;
    if (entity === "property" && flow === "property.create") return `atualizar imóvel ${selectedRef}`;
  }

  if (
    normalized === "criar novo" ||
    normalized === "criar um novo" ||
    normalized === "novo" ||
    normalized === "novo cadastro"
  ) {
    if (entity === "owner" && flow === "owner.create") return `criar novo proprietário ${selectedName ?? selectedRef}`;
    if (entity === "lead" && flow === "lead.qualify") return `criar novo lead ${selectedName ?? selectedRef}`;
    if (entity === "property" && flow === "property.create") return `criar novo imóvel ${selectedName ?? selectedRef}`;
  }

  if (
    normalized === "cadastros" ||
    normalized === "ver cadastros" ||
    normalized === "listar cadastros"
  ) {
    if (entity === "owner" && flow === "owner.create") return `listar proprietários ${selectedName ?? selectedRef}`;
    if (entity === "lead" && flow === "lead.qualify") return `listar leads ${selectedName ?? selectedRef}`;
    if (entity === "property" && flow === "property.create") return `listar imóveis ${selectedName ?? selectedRef}`;
  }

  if (
    entity === "owner" &&
    flow === "owner.create" &&
    asString(dedupeSelection?.resolution) === "update_existing" &&
    !normalized.includes("cancelar") &&
    !normalized.includes("criar novo") &&
    !normalized.includes("cadastros") &&
    !normalized.includes("listar")
  ) {
    if (/@/.test(message)) return `atualizar proprietário ${selectedRef} e-mail do proprietário ${message}`;
    if (/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/.test(message)) return `atualizar proprietário ${selectedRef} telefone do proprietário ${message}`;
    if (/\b\d{11}\b|\b\d{14}\b/.test(message)) return `atualizar proprietário ${selectedRef} documento do proprietário ${message}`;
    return `atualizar proprietário ${selectedRef} nome do proprietário ${message}`;
  }

  return message;
}

function applyDedupeSelectionToConversationState(
  threadState: ThreadStateLike | null | undefined,
  rewrittenMessage: string,
  resolved: Record<string, unknown>,
) {
  const normalized = rewrittenMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const baseState = asObject(resolved.conversationState) ?? asObject(threadState) ?? null;
  const operational = asObject(baseState?.operational);
  if (!operational) return resolved;
  const currentSelection = asObject(asObject(threadState)?.operational)?.dedupeSelection;
  if (!currentSelection) return resolved;

  const nextSelection =
    normalized.startsWith("atualizar proprietario ") || normalized.startsWith("atualizar proprietário ")
      ? { ...currentSelection, resolution: "update_existing" }
      : normalized.startsWith("criar novo proprietario ") || normalized.startsWith("criar novo proprietário ")
        ? { ...currentSelection, resolution: "create_new" }
        : normalized.startsWith("listar proprietarios ") || normalized.startsWith("listar proprietários ")
          ? { ...currentSelection, resolution: "list_existing" }
          : currentSelection;

  const hasForm = Boolean(asObject(asObject(resolved.presentation)?.form));
  const shouldClearSelection = !hasForm && asString(resolved.action) === "crm.owner.update";
  return {
    ...resolved,
    conversationState: {
      ...baseState,
      operational: {
        ...operational,
        ...(shouldClearSelection ? { dedupeSelection: undefined } : { dedupeSelection: nextSelection }),
      },
    },
  };
}
function buildCaptureSwitchActions(caseContext?: ImobCrmCaseContext | null) {
  const hasLead = Boolean(caseContext?.lead && (caseContext.lead.id || caseContext.lead.name));
  const hasOwner = Boolean(caseContext?.owner && (caseContext.owner.id || caseContext.owner.name));

  const actions = [];
  if (hasLead) {
    actions.push({
      id: "capture-switch-visit",
      label: "Avançar para visita",
      kind: "primary",
      action: "send_suggested_message",
      nextMessage: "vamos avançar para visita",
    });
  } else {
    actions.push({
      id: "capture-switch-lead",
      label: "Qualificar lead",
      kind: "primary",
      action: "send_suggested_message",
      nextMessage: "qualificar lead deste caso",
    });
  }

  if (!hasOwner) {
    actions.push({
      id: "capture-switch-owner",
      label: "Cadastrar proprietário",
      kind: "secondary",
      action: "send_suggested_message",
      nextMessage: "cadastrar proprietário",
    });
  }

  actions.push(
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
  );

  return actions as const;
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
  const caseContext = asObject(data.caseContext) as ImobCrmCaseContext | null;
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
        ctas: buildCaptureSwitchActions(caseContext),
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
      : buildCaptureSwitchActions(caseContext);
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
        ctas: buildCaptureSwitchActions(caseContext),
        actionsLayout: "inline",
        persistent: true,
        phase: "pre_execution",
      },
    ];
  }

  return [];
}

function buildImobPresentationQuickReplies(data: Record<string, unknown>) {
  const presentation = asObject(data.presentation) ?? {};
  const caseContext = asObject(data.caseContext) as ImobCrmCaseContext | null;
  const blocks = Array.isArray(presentation.blocks) ? (presentation.blocks as Array<Record<string, unknown>>) : [];
  const card = asObject(presentation.card);
  const cardCtas = Array.isArray(card?.ctas) ? (card?.ctas as Array<Record<string, unknown>>) : [];
  const recommendedActions = Array.isArray(caseContext?.canonical?.recommendedActions)
    ? caseContext?.canonical?.recommendedActions
    : [];
  const suggestedNextAction = asString(presentation.suggestedNextAction);

  const candidates = [
    ...blocks.flatMap((block) => {
      const ctas = Array.isArray(block.ctas) ? (block.ctas as Array<Record<string, unknown>>) : [];
      return ctas.map((cta) => asString(cta.nextMessage) ?? asString(cta.label));
    }),
    ...cardCtas.map((cta) => asString(cta.nextMessage) ?? asString(cta.label)),
    ...recommendedActions.map((action) => asString((action as Record<string, unknown>).inputHint) ?? asString((action as Record<string, unknown>).label)),
    suggestedNextAction,
  ];

  return candidates
    .filter((value): value is string => Boolean(value && value.trim()))
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 3);
}

function applyImobCrmCopyStateToResolution(data: Record<string, unknown>): Record<string, unknown> {
  const copyState = inferImobCrmCopyStateFromResolution(data);
  const presentation = asObject(data.presentation) ?? {};
  const proof = resolveImobProofSurfaceFromResolution(data);
  const blocks = buildImobPresentationBlocks(data, copyState);
  const quickReplies = buildImobPresentationQuickReplies({
    ...data,
    presentation: {
      ...presentation,
      ...(proof ? { proof } : {}),
      ...(blocks.length > 0 ? { blocks } : {}),
    },
  });
  if (!copyState && !proof && blocks.length === 0 && quickReplies.length === 0) return data;
  return {
    ...data,
    presentation: {
      ...presentation,
      ...(copyState ? { copyState } : {}),
      ...(proof ? {
        proof,
        ...(asObject(presentation.card) ? {
          card: {
            ...(asObject(presentation.card) ?? {}),
            proof,
          },
        } : {}),
      } : {}),
      ...(blocks.length > 0 ? { blocks } : {}),
      ...(quickReplies.length > 0 ? { quickReplies } : {}),
    },
  };
}

function resolveImobProofSurfaceFromResolution(data: Record<string, unknown>): ImobProofSurface | null {
  const presentation = asObject(data.presentation);
  const card = asObject(presentation?.card);
  const directProof = asObject(presentation?.proof);
  const cardProof = asObject(card?.proof);
  const caseContext = asObject(data.caseContext);
  const caseProof = asObject(caseContext?.proof);
  const source = directProof ?? cardProof ?? caseProof;
  const runId =
    asString(source?.runId)
    ?? asString(card?.runId)
    ?? asString(data.runId);
  const txId =
    asString(source?.txId)
    ?? asString(data.txId);
  const receiptPath =
    asString(source?.receiptPath)
    ?? asString(data.receiptPath)
    ?? (txId ? `/api/ledger/${encodeURIComponent(txId)}` : null);
  const bundlePath =
    asString(source?.bundlePath)
    ?? asString(data.bundlePath);
  const verifyUrl =
    asString(source?.verifyUrl)
    ?? receiptPath;
  const requiredRaw = source?.required;
  const readyRaw = source?.ready;
  const stateRaw = asString(source?.state);
  const hasSignals = Boolean(source || runId || txId || receiptPath || bundlePath);
  if (!hasSignals) return null;
  const inferredReady = Boolean(txId && receiptPath && bundlePath);
  const required = typeof requiredRaw === "boolean" ? requiredRaw : Boolean(runId || txId || receiptPath || bundlePath);
  const ready = typeof readyRaw === "boolean" ? readyRaw : inferredReady;
  return {
    required,
    ready,
    state:
      stateRaw === "not_required" || stateRaw === "pending" || stateRaw === "ready" || stateRaw === "failed"
        ? stateRaw
        : (required ? (ready ? "ready" : "pending") : (ready ? "ready" : "not_required")),
    runId,
    txId,
    receiptPath,
    bundlePath,
    verifyUrl,
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
    let hydratedThreadState = await params.helpers.hydrateThreadStateWithPersistedLead({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      message: turn.message,
      caseId: turn.caseId,
      threadLabel,
      threadState: turn.threadState,
    });
    const hydratedOperational = asObject(asObject(hydratedThreadState)?.operational);
    if (
      turn.caseId &&
      asString(hydratedOperational?.flow) === "property.market_scan"
      && !asObject(hydratedOperational?.marketScanSnapshot)
    ) {
      const latestSnapshot = await loadLatestImobMarketScanSnapshot({
        prisma: params.prisma as any,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        caseId: turn.caseId,
      });
      if (latestSnapshot) {
        hydratedThreadState = {
          ...(hydratedThreadState as any),
          operational: {
            ...hydratedOperational,
            marketScanSnapshot: latestSnapshot,
          },
        };
      }
    }
    const rewrittenMessage = rewriteRegistrationDedupeChoiceMessage(
      turn.message,
      hydratedThreadState,
      params.helpers.normalizeImobRouteText,
    );
    const dedupeAwareMessage = resolveDedupeContextualMessage(
      rewrittenMessage,
      hydratedThreadState,
      params.helpers.normalizeImobRouteText,
    );
    const effectiveMessage = isExplicitLeadPropertyLinkRequest(dedupeAwareMessage)
      ? "cadastrar imóvel"
      : dedupeAwareMessage;
    const explicitStageChangeFlow = inferExplicitStageChangeFlow(effectiveMessage);
    const currentOperationalFlow = asString(asObject(hydratedThreadState)?.operational?.flow);
    const isCrossStageTransitionRequest =
      explicitStageChangeFlow !== null
      && explicitStageChangeFlow !== currentOperationalFlow;
    const normalizedEffectiveMessage = params.helpers.normalizeImobRouteText(effectiveMessage);
    const isMarketScanSelectionFlowMessage =
      asString(asObject(hydratedThreadState)?.operational?.flow) === "property.market_scan"
      && (
        normalizedEffectiveMessage.includes("selecionar imovel")
        || normalizedEffectiveMessage.includes("selecionar imóvel")
        || normalizedEffectiveMessage.includes("usar imovel do scan")
        || normalizedEffectiveMessage.includes("usar imóvel do scan")
        || normalizedEffectiveMessage.includes("salvar imovel do scan")
        || normalizedEffectiveMessage.includes("salvar imóvel do scan")
        || normalizedEffectiveMessage.includes("confirmar selecao do scan")
        || normalizedEffectiveMessage.includes("confirmar seleção do scan")
        || normalizedEffectiveMessage.includes("confirmar imovel do scan")
        || normalizedEffectiveMessage.includes("confirmar imóvel do scan")
        || normalizedEffectiveMessage.includes("confirmar captacao do scan")
        || normalizedEffectiveMessage.includes("confirmar captação do scan")
      );
    const readOnlyPilotQuery =
      /(piloto|pilot_active|approval_required|shadow)/i.test(effectiveMessage)
      && hasStrongBusinessReadIntent(effectiveMessage);
    const shouldPrioritizeBusinessRead =
      hasStrongBusinessReadIntent(effectiveMessage)
      && !isExplicitOperationalCommand(effectiveMessage)
      && !isMarketScanSelectionFlowMessage
      && !isCrossStageTransitionRequest;
    const workflowGuard = isCrossStageTransitionRequest
      || shouldPrioritizeBusinessRead
      ? null
      : resolveWorkflowGuard({
          message: effectiveMessage,
          threadState: hydratedThreadState,
          normalizeImobRouteText: params.helpers.normalizeImobRouteText,
          isReadOnlyPilotQuery: readOnlyPilotQuery,
        });
    if (workflowGuard) {
      const data = applyResponsibleLabelToResolvedTurn(workflowGuard, params.workspaceResponsibleLabel);
      return {
        data: params.helpers.applyCanonicalJourneyToResolvedData(data, null),
        caseContext: null,
      };
    }

    const updateData = await params.helpers.resolveImobOperationalUpdate({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      userId: params.authContext.userId ?? null,
      message: effectiveMessage,
      caseId: turn.caseId,
      threadState: hydratedThreadState,
    });
    if (updateData) {
      const data = applyResponsibleLabelToResolvedTurn(
        applyDedupeSelectionToConversationState(hydratedThreadState, rewrittenMessage, updateData as Record<string, unknown>) as any,
        params.workspaceResponsibleLabel,
      );
      return {
        data: params.helpers.applyCanonicalJourneyToResolvedData(data, (data.caseContext as ImobCrmCaseContext | null | undefined) ?? null),
        caseContext: data.caseContext ?? null,
      };
    }

    const shouldPrioritizeActiveFlowContinuity =
      hasActivePendingOperationalFlow(hydratedThreadState)
      && !isCrossStageTransitionRequest;
    if (shouldPrioritizeBusinessRead) {
      const consultData = await params.helpers.resolveImobOperationalConsult({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        userId: params.authContext.userId ?? null,
        message: effectiveMessage,
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
      const semanticIntent = turn.semanticIntent ?? await resolveImobSemanticIntent(effectiveMessage);
      const baseResolveRequest = {
        message: effectiveMessage,
        semanticIntent: semanticIntent.parsedIntent,
        semanticIntentSource: semanticIntent.source,
        threadLabel,
        threadId: requestedThreadId,
        caseId: turn.caseId,
        threadState: hydratedThreadState as any,
        access: {
          tenantId: params.authContext.tenantId,
          workspaceId: params.authContext.workspaceId,
          entitlements: params.entitlements,
        },
      } as const;
      const preliminaryResolvedTurn = resolveImobTurn(baseResolveRequest);
      const resumedMarketScanSnapshot = (hydratedThreadState as any)?.operational?.marketScanSnapshot ?? null;
      const marketScanResult =
        preliminaryResolvedTurn.action === "realestate.market_scan"
        && preliminaryResolvedTurn.conversationState.operational?.flow === "property.market_scan"
        && preliminaryResolvedTurn.conversationState.operational.marketScanContext
          ? await resolveMarketScanResult({
              prisma: params.prisma,
              tenantId: params.authContext.tenantId,
              workspaceId: params.authContext.workspaceId,
              caseId: turn.caseId,
              marketScanContext: preliminaryResolvedTurn.conversationState.operational.marketScanContext,
            })
          : null;
      const resolvedTurn = attachSnapshotToResolvedTurn(
        marketScanResult
          ? resolveImobTurn({ ...baseResolveRequest, marketScanResult })
          : resumedMarketScanSnapshot
            ? resolveImobTurn({ ...baseResolveRequest, marketScanResult: resumedMarketScanSnapshot })
            : preliminaryResolvedTurn,
        marketScanResult ?? resumedMarketScanSnapshot,
      );
      if (marketScanResult) {
        await persistImobMarketScanSnapshot({
          prisma: params.prisma as any,
          tenantId: params.authContext.tenantId,
          workspaceId: params.authContext.workspaceId,
          caseId: turn.caseId,
          marketScanContext: preliminaryResolvedTurn.conversationState.operational?.marketScanContext!,
          snapshot: marketScanResult,
        });
      }
      const registrationAwareTurn = await params.helpers.applyExistingRegistrationResolution({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        message: effectiveMessage,
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

    if (
      !isExplicitOperationalCommand(effectiveMessage)
      && !isMarketScanSelectionFlowMessage
      && !isCrossStageTransitionRequest
    ) {
      const consultData = await params.helpers.resolveImobOperationalConsult({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        userId: params.authContext.userId ?? null,
        message: effectiveMessage,
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

    const semanticIntent = turn.semanticIntent ?? await resolveImobSemanticIntent(effectiveMessage);
    const baseResolveRequest = {
      message: effectiveMessage,
      semanticIntent: semanticIntent.parsedIntent,
      semanticIntentSource: semanticIntent.source,
      threadLabel,
      threadId: requestedThreadId,
      caseId: turn.caseId,
      threadState: hydratedThreadState as any,
      access: {
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        entitlements: params.entitlements,
      },
    } as const;
    const preliminaryResolvedTurn = resolveImobTurn(baseResolveRequest);
    const resumedMarketScanSnapshot = (hydratedThreadState as any)?.operational?.marketScanSnapshot ?? null;
    const marketScanResult =
      preliminaryResolvedTurn.action === "realestate.market_scan"
      && preliminaryResolvedTurn.conversationState.operational?.flow === "property.market_scan"
      && preliminaryResolvedTurn.conversationState.operational.marketScanContext
        ? await resolveMarketScanResult({
            prisma: params.prisma,
            tenantId: params.authContext.tenantId,
            workspaceId: params.authContext.workspaceId,
            caseId: turn.caseId,
            marketScanContext: preliminaryResolvedTurn.conversationState.operational.marketScanContext,
          })
        : null;
    const resolvedTurn = attachSnapshotToResolvedTurn(
      marketScanResult
        ? resolveImobTurn({ ...baseResolveRequest, marketScanResult })
        : resumedMarketScanSnapshot
          ? resolveImobTurn({ ...baseResolveRequest, marketScanResult: resumedMarketScanSnapshot })
          : preliminaryResolvedTurn,
      marketScanResult ?? resumedMarketScanSnapshot,
    );
    if (marketScanResult) {
      await persistImobMarketScanSnapshot({
        prisma: params.prisma as any,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        caseId: turn.caseId,
        marketScanContext: preliminaryResolvedTurn.conversationState.operational?.marketScanContext!,
        snapshot: marketScanResult,
      });
    }
    const registrationAwareTurn = await params.helpers.applyExistingRegistrationResolution({
      prisma: params.prisma,
      tenantId: params.authContext.tenantId,
      workspaceId: params.authContext.workspaceId,
      message: effectiveMessage,
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
