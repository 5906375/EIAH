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
import { executeMarketScanPipeline } from "../marketScan/marketScanPipeline";
import { SourceConnectorRegistry } from "../marketScan/sourceConnectorRegistry";
import {
  parsePublicWebAssistedListings,
  PublicWebAssistedMarketScanProvider,
} from "../publicWebScan/PublicWebAssistedMarketScanProvider";
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
import { buildImobCaseContextV1 } from "./imobCaseContextBuilder";
import { planImobCase } from "./imobCrmCasePlanner";
import type { ImobCasePlanActionV1, ImobCasePlanV1 } from "./imobCaseContextContract";
import type { ImobMissionContext } from "../imobConversationContract";
import {
  classifyImobCrmWorkflowTransitionFromMessage,
  deriveImobCrmWorkflowState,
  resolveTransition,
  type ImobCrmWorkflowContext,
  type ImobCrmWorkflowReasonCode,
  type ImobCrmWorkflowState,
  type ImobCrmWorkflowTransition,
} from "./imobCrmWorkflowMachine";
import {
  buildLeadReasonCode,
  extractLeadPropertyId,
  mapLeadNextActionToInputHint,
  mapLeadNextActionToLabel,
  mapLeadNextActionToNextStep,
  normalizeLeadQualifyOperationalState,
} from "./imobLeadQualifyRuntime";
import type {
  ImobMarketScanContext,
  ImobMarketScanResultSnapshot,
  ImobMarketScanRunSnapshot,
  ImobPendingAction,
  ImobOperationalOpportunity,
  ImobProofSurface,
} from "../imobConversationContract";
import {
  buildImobBlockedPendingActionResolution,
  buildImobExecuteResolutionFromPendingAction,
  getImobPendingActionSpec,
  isImobPendingActionConfirmationMessage,
  parseImobPendingAction,
  withImobPendingActionStatus,
} from "./imobPendingActionRuntime";

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

function pendingActionIdentityKey(pendingAction: ImobPendingAction | null) {
  if (!pendingAction) return null;
  return [
    pendingAction.actionId,
    pendingAction.sourceActionId,
    pendingAction.caseId,
    pendingAction.threadId,
    pendingAction.entityType,
    pendingAction.journey,
    pendingAction.status,
  ].join(":");
}

function resolvePendingActionConfirmation(params: {
  message: string;
  caseId?: string | null;
  threadId?: string | null;
  threadState: ThreadStateLike | null | undefined;
  canonicalPendingAction: ImobPendingAction | null;
}) {
  if (!isImobPendingActionConfirmationMessage(params.message)) return null;

  const currentOperational = asObject(asObject(params.threadState)?.operational);
  const clientPendingAction = parseImobPendingAction(currentOperational?.pendingAction);
  const canonicalPendingAction = params.canonicalPendingAction;

  if (
    clientPendingAction &&
    canonicalPendingAction &&
    pendingActionIdentityKey(clientPendingAction) !== pendingActionIdentityKey(canonicalPendingAction)
  ) {
    return buildImobBlockedPendingActionResolution({
      detail: "Encontrei mais de um alvo possível para esta confirmação. Para evitar executar a operação errada, confirme pelo card da ação ou informe explicitamente qual ação deseja executar.",
      reasonCode: "CONFIRMATION_TARGET_AMBIGUOUS",
      pendingAction: canonicalPendingAction,
    });
  }

  if (!canonicalPendingAction) {
    return buildImobBlockedPendingActionResolution({
      detail: "Não encontrei uma ação pendente para confirmar. Para evitar executar a operação errada, confirme pelo card da ação ou informe explicitamente qual ação deseja executar.",
      reasonCode: "PENDING_ACTION_MISSING",
    });
  }
  const pendingAction = canonicalPendingAction;

  if (pendingAction.status === "expired") {
    return buildImobBlockedPendingActionResolution({
      detail: "A ação pendente expirou. Reabra a ação pelo Command Center ou solicite novamente a operação desejada.",
      reasonCode: "PENDING_ACTION_EXPIRED",
      pendingAction,
    });
  }

  if (pendingAction.status !== "awaiting_confirmation") {
    return buildImobBlockedPendingActionResolution({
      detail: "A ação pendente não está mais disponível para confirmação. Reabra a ação original ou informe explicitamente o próximo passo.",
      reasonCode: "PENDING_ACTION_MISMATCH",
      pendingAction,
    });
  }

  if (params.caseId && pendingAction.caseId !== params.caseId) {
    return buildImobBlockedPendingActionResolution({
      detail: "A ação pendente não pertence ao caso atual. Para evitar drift, confirme a ação no caso original.",
      reasonCode: "PENDING_ACTION_MISMATCH",
      pendingAction,
    });
  }

  if (params.threadId && pendingAction.threadId !== params.threadId) {
    return buildImobBlockedPendingActionResolution({
      detail: "Encontrei perda de contexto da ação direcionada. Para evitar executar a operação errada, confirme pelo card da ação original.",
      reasonCode: "DIRECTED_ACTION_CONTEXT_LOST",
      pendingAction,
    });
  }

  const spec = getImobPendingActionSpec(pendingAction.actionId);
  if (!spec) {
    return buildImobBlockedPendingActionResolution({
      detail: "A ação pendente não possui binding canônico válido. Reabra a operação a partir do Command Center.",
      reasonCode: "PENDING_ACTION_MISMATCH",
      pendingAction,
    });
  }

  if (pendingAction.entityType !== spec.entityType) {
    return buildImobBlockedPendingActionResolution({
      detail: "A entidade da ação pendente divergiu do contrato canônico. A execução foi bloqueada por segurança.",
      reasonCode: "DIRECTED_ACTION_ENTITY_MISMATCH",
      pendingAction,
    });
  }

  if (pendingAction.journey !== spec.journey) {
    return buildImobBlockedPendingActionResolution({
      detail: "A jornada da ação pendente divergiu do contrato canônico. A execução foi bloqueada por segurança.",
      reasonCode: "DIRECTED_ACTION_JOURNEY_MISMATCH",
      pendingAction,
    });
  }

  const activeFlow = asString(currentOperational?.flow);
  if (activeFlow && activeFlow !== spec.operation) {
    return buildImobBlockedPendingActionResolution({
      detail: "O contexto operacional ativo não corresponde à ação direcionada pendente. Para evitar drift, a confirmação foi bloqueada.",
      reasonCode: "DIRECTED_ACTION_JOURNEY_MISMATCH",
      pendingAction,
    });
  }

  return buildImobExecuteResolutionFromPendingAction({
    pendingAction: withImobPendingActionStatus(pendingAction, "confirmed"),
    label: pendingAction.sourceActionId,
  });
}

function normalizeLeadQualifyResolution(data: Record<string, unknown>) {
  const conversationState = asObject(data.conversationState) ?? {};
  const operational = asObject(conversationState.operational);
  if (!operational || asString(operational.flow) !== "lead.qualify") return data;

  const presentation = asObject(data.presentation) ?? {};
  const caseContext = asObject(data.caseContext) ?? {};
  const propertyId = asString(asObject(caseContext.property)?.id) ?? extractLeadPropertyId(operational);
  const normalizedOperational = normalizeLeadQualifyOperationalState(operational, {
    propertyId,
    blocked: data.mode === "blocked",
  }) as Record<string, unknown>;
  const nextAction = asString(normalizedOperational.nextAction);
  const leadStatus = asString(normalizedOperational.leadStatus);
  const nextStep = nextAction ? mapLeadNextActionToNextStep(nextAction as any) : null;
  const reasonCode = nextAction
    ? buildLeadReasonCode({
        leadStatus: (leadStatus as any) ?? "draft",
        nextAction: nextAction as any,
        pendingFields: asStringList(normalizedOperational.pendingFields),
      })
    : null;
  const inputHint = nextAction ? mapLeadNextActionToInputHint(nextAction as any) : null;
  const label = nextAction ? mapLeadNextActionToLabel(nextAction as any) : null;
  const canonical = asObject(caseContext.canonical);
  const recommendedActions = Array.isArray(canonical?.recommendedActions)
    ? canonical.recommendedActions.filter((item) => asString(asObject(item)?.id) !== "qualify_lead")
    : [];
  if (inputHint && label) {
    recommendedActions.unshift({
      id: `lead_next_action_${nextAction}`,
      label,
      actionType: nextAction === "advance_commercial_step" ? "operational" : "consultive",
      inputHint,
      ...(reasonCode ? { reasonCode } : {}),
    });
  }

  return {
    ...data,
    conversationState: {
      ...conversationState,
      operational: normalizedOperational,
    },
    caseContext: Object.keys(caseContext).length === 0 ? data.caseContext : {
      ...caseContext,
      nextStep: nextStep ?? asString(caseContext.nextStep),
      canonical: {
        ...canonical,
        recommendedActions: recommendedActions.slice(0, 3),
        reasonCodes: Array.from(new Set([
          ...asStringList(canonical?.reasonCodes),
          ...(reasonCode ? [reasonCode] : []),
        ])),
      },
    },
    presentation: {
      ...presentation,
      nextStep: nextStep ?? asString(presentation.nextStep) ?? undefined,
      suggestedNextAction: inputHint ?? asString(presentation.suggestedNextAction) ?? undefined,
      metadata: {
        ...(asObject(presentation.metadata) ?? {}),
        ...(reasonCode ? { reasonCode } : {}),
      },
    },
  };
}

function isMarketScanSelectionResolution(data: Record<string, unknown>) {
  const action = asString(data.action);
  const operational = asObject(asObject(data.conversationState)?.operational);
  return (
    action === "crm.market_scan.selection"
    || (
      asString(operational?.flow) === "property.market_scan"
      && Boolean(asObject(operational?.marketScanSelection))
    )
  );
}

function stripMarketScanSelectionLegacyPresentation(presentation: Record<string, unknown>) {
  const {
    blocker: _blocker,
    nextStep: _nextStep,
    pendingFieldLabels: _pendingFieldLabels,
    suggestedNextAction: _suggestedNextAction,
    widget: _widget,
    quickReplies: _quickReplies,
    copyState: _copyState,
    ...rest
  } = presentation;
  return rest;
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
  run?: ImobMarketScanRunSnapshot | null,
  opportunity?: ImobOperationalOpportunity | null,
) {
  if (!snapshot && !run && !opportunity) return resolved;
  const operational = attachMarketScanSnapshotToOperationalState(
    (resolved as any).conversationState?.operational ?? null,
    snapshot ?? null,
  );
  return {
    ...resolved,
    conversationState: {
      ...(resolved as any).conversationState,
      operational: operational
        ? {
            ...operational,
            ...(snapshot ? { marketScanResult: snapshot } : {}),
            ...(run ? { marketScanRun: run } : {}),
            ...(opportunity ? { marketScanOpportunity: opportunity } : {}),
          }
        : operational,
    },
    presentation: {
      ...(resolved as any).presentation,
      ...(snapshot ? { marketScanResult: snapshot } : {}),
    },
  } as OperationalResolution;
}

type ResolvedMarketScan = {
  snapshot: ImobMarketScanResultSnapshot;
  run?: ImobMarketScanRunSnapshot | null;
  opportunity?: ImobOperationalOpportunity | null;
};

async function resolveLegacyMarketScanResult(params: {
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

async function resolveMarketScanResult(params: {
  prisma: unknown;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  marketScanContext: ImobMarketScanContext;
}): Promise<ResolvedMarketScan | null> {
  if (!(params.prisma as any)?.imobProperty?.findMany) return null;
  const repository = new ImobCrmRepository(params.prisma as any);
  const source = {
    listProperties(scope: { tenantId: string; workspaceId: string }) {
      return repository.listProperties(scope) as any;
    },
  };

  if ((params.prisma as any)?.imobMarketScanRun?.create && (params.prisma as any)?.imobMarketScanRun?.update) {
    try {
      const pipeline = await executeMarketScanPipeline({
        prisma: params.prisma as any,
        connectorRegistry: new SourceConnectorRegistry({
          internal_crm: new InternalCrmMarketScanProvider(source),
          tenant_inventory_import: new TenantInventoryImportProvider(source),
          public_web_assisted: new PublicWebAssistedMarketScanProvider({
            listPublicListings(scope) {
              return parsePublicWebAssistedListings(process.env.IMOB_PUBLIC_WEB_ASSISTED_LISTINGS)
                .filter((listing) => listing.city === scope.city || !scope.city);
            },
          }),
        }),
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        caseId: params.caseId ?? null,
        query: buildMarketScanQuery(params.marketScanContext),
        sourceIds: ["tenant_inventory_import", "internal_crm", "public_web_assisted"],
        context: {
          marketScanContext: params.marketScanContext,
        },
      });
      if (pipeline.resultSnapshot) {
        return {
          snapshot: pipeline.resultSnapshot,
          run: pipeline.run,
          opportunity: pipeline.opportunity,
        };
      }
    } catch {
      // Compatibility path: if the new run store is not ready, preserve the legacy read-only scan.
    }
  }

  const legacy = await resolveLegacyMarketScanResult(params);
  return legacy ? { snapshot: legacy, run: null } : null;
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

function extractMarketScanSelectionOrdinalFromMessage(
  message: string,
  normalizeImobRouteText: (value: string) => string,
) {
  const normalized = normalizeImobRouteText(message);
  const match = normalized.match(
    /(?:selecionar|usar|salvar)\s+(?:imovel|imóvel|item)\s+(\d+)(?:\s+do\s+scan)?/i,
  );
  const ordinal = Number(match?.[1]);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

function resolveMarketScanSourceIdByOrdinal(threadState: ThreadStateLike, ordinal: number | null) {
  if (!ordinal) return null;
  const operational = asObject(asObject(threadState)?.operational);
  const snapshot = asObject(operational?.marketScanSnapshot) ?? asObject(operational?.marketScanResult);
  const groups = Array.isArray(snapshot?.groups) ? snapshot.groups : [];
  const items = groups.flatMap((group) => {
    const objectGroup = asObject(group);
    return Array.isArray(objectGroup?.items) ? objectGroup.items : [];
  });
  const item = asObject(items[ordinal - 1]);
  return asString(item?.sourceId);
}

function buildWorkflowBlockedResolution(params: {
  message: string;
  state: ImobCrmWorkflowState;
  transition: ImobCrmWorkflowTransition;
  reasonCode: ImobCrmWorkflowReasonCode;
  threadState: ThreadStateLike;
}) {
  const operational = asObject(asObject(params.threadState)?.operational);
  const visitDraft = asObject(operational?.visitDraft);
  const propertyCandidates = Array.isArray(operational?.propertyCandidates)
    ? (operational.propertyCandidates as Array<{ id: string; label: string }>)
    : [];

  const isVisitMissingProperty = params.reasonCode === "visit_missing_property";

  // Texto principal: orientador quando há candidatos, instrucional quando não há
  const visitMissingPropertyText = propertyCandidates.length > 0
    ? `Encontrei ${propertyCandidates.length} imóvel(is) com esse perfil. Confirme qual vincular à visita e preencha os dados restantes.`
    : "Posso preparar o agendamento da visita. Preencha os dados abaixo para continuar.";

  const reasonCopy: Record<ImobCrmWorkflowReasonCode, string> = {
    property_multiple_candidates_offer_market_scan: "Encontrei múltiplas cidades ou finalidades; posso seguir com uma varredura de mercado governada antes de cadastrar um imóvel específico.",
    market_scan_selection_missing_item: "Ainda não há um imóvel do scan selecionado com segurança para confirmar a captação.",
    owner_dedupe_missing_match: "Encontrei uma decisao de duplicidade pendente, mas o cadastro correspondente nao esta identificado com seguranca.",
    owner_dedupe_missing_matches: "Nao consegui recuperar os cadastros correspondentes para revisar esta duplicidade com seguranca.",
    visit_missing_property: visitMissingPropertyText,
    visit_missing_lead_qualification: "Ainda falta qualificar o lead antes de abrir a visita com seguranca.",
    pilot_read_only: "A consulta de piloto neste contexto e somente leitura e nao pode disparar mutacao operacional.",
    lead_already_qualified: "O lead ja foi qualificado e nao deve reabrir esse fluxo sem pendencias reais.",
    documents_ownership_must_remain_imob: "A revisao documental continua sob ownership do IMOB; especialistas entram apenas como apoio.",
    transition_not_allowed: "Essa acao nao e valida para o estado operacional atual do caso.",
  };

  // Valores já conhecidos para pré-preencher o card (render-only, sem decisão no frontend)
  const visitPrefilled: Record<string, string> = {};
  if (isVisitMissingProperty) {
    const vn = asString(visitDraft?.visitorName);
    const vp = asString(visitDraft?.visitorPhone);
    const vd = asString(visitDraft?.preferredDate);
    const ptc = asString(visitDraft?.propertyTextCandidate);
    if (vn) visitPrefilled.visitorName = vn;
    if (vp) visitPrefilled.visitorPhone = vp;
    if (vd) visitPrefilled.preferredDate = vd;
    if (ptc) visitPrefilled.propertyId = ptc; // texto candidato pré-preenche o campo, mas NÃO é propertyId resolvido
  }

  // Payload estruturado de slot collection para a visita (schema-driven, render-only no frontend)
  const visitSlotCollection = isVisitMissingProperty
    ? {
        mission: "visit.schedule",
        title: "Agendar visita",
        description: "Preencha os dados abaixo para preparar o agendamento.",
        fields: ["propertyId", "visitorName", "visitorPhone", "preferredDate"] as const,
        prefilled: visitPrefilled,
        ...(propertyCandidates.length > 0 ? { propertyCandidates } : {}),
      }
    : undefined;

  return {
    mode: "blocked",
    action: "crm.workflow.blocked",
    threadLabel: "IMOB CRM",
    conversationState: params.threadState,
    presentation: {
      text: reasonCopy[params.reasonCode],
      nextStep: isVisitMissingProperty
        ? (propertyCandidates.length === 0
            ? "Informe o imovel pelo endereco, codigo ou apelido para continuar."
            : undefined)
        : params.reasonCode === "owner_dedupe_missing_match"
          ? "Revisar os cadastros encontrados antes de atualizar existente."
          : undefined,
      pendingFieldLabels: isVisitMissingProperty
        ? ["propertyId", "visitorName", "visitorPhone", "preferredDate"]
        : [],
      ...(visitSlotCollection ? { slotCollection: visitSlotCollection } : {}),
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
    const selectedOrdinal = extractMarketScanSelectionOrdinalFromMessage(
      params.message,
      params.normalizeImobRouteText,
    );
    workflowContext.selectedSourceId ??= resolveMarketScanSourceIdByOrdinal(params.threadState, selectedOrdinal);
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
    normalized.includes("o que falta")
    || normalized.includes("pendencia")
    || normalized.includes("pendencias")
    || normalized.includes("proximo passo")
    || normalized.includes("qual proximo passo")
    || normalized.includes("retomar esse caso")
    || normalized.includes("retomar o caso")
  ) {
    return true;
  }
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
    normalized.includes("consultar caso")
    || normalized.includes("qual status desse caso")
    || normalized.includes("status desse caso")
    || ((normalized.includes("resuma esse caso") || normalized.includes("resumir esse caso") || normalized.includes("resumo do caso"))
    && (normalized.includes("caso") || normalized.includes("atendimento"))
    )
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

function rewritePropertyOwnerActionMessage(
  message: string,
  threadState: ThreadStateLike | null | undefined,
  normalizeImobRouteText: (value: string) => string,
) {
  const normalized = normalizeImobRouteText(message);
  const operational = asObject(asObject(threadState)?.operational);
  const flow = asString(operational?.flow);
  const status = asString(operational?.status);

  if (flow !== "property.create" || status !== "ready_for_review") return message;

  if (
    normalized === "vincular proprietario"
    || normalized === "vincular proprietário"
    || normalized === "vincular proprietario ao imovel"
    || normalized === "vincular proprietário ao imóvel"
  ) {
    return "cadastrar proprietário";
  }

  return message;
}

function buildCaptureSwitchActions(caseContext?: ImobCrmCaseContext | null) {
  const hasLead = Boolean(caseContext?.lead && (caseContext.lead.id || caseContext.lead.name));
  const linkedPropertyOwner = asObject(caseContext?.property?.owner as Record<string, unknown> | null);
  const hasOwner = Boolean(
    (caseContext?.owner && (caseContext.owner.id || caseContext.owner.name))
    || (linkedPropertyOwner && (asString(linkedPropertyOwner.id) || asString(linkedPropertyOwner.name))),
  );
  const ownerPropertyLinkStatus = (caseContext?.links as Record<string, any> | null | undefined)?.ownerProperty?.status ?? null;
  const ownerLinkPending = hasOwner && ownerPropertyLinkStatus !== "linked";

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
  } else if (ownerLinkPending) {
    actions.push({
      id: "capture-switch-owner-link",
      label: "Concluir vínculo",
      kind: "secondary",
      action: "send_suggested_message",
      nextMessage: "concluir vínculo proprietário-imóvel",
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
      nextMessage: caseContext?.caseId ? `consultar caso ${caseContext.caseId}` : "consultar caso",
    },
  );

	  return actions;
}

function mapCasePlanActionToCta(action: ImobCasePlanActionV1) {
  return {
    id: `case-plan-${action.id}`,
    label: action.label,
    kind: action.kind,
    action: "send_suggested_message",
    nextMessage: action.nextMessage,
    reasonCode: action.reasonCode,
  };
}

function buildCasePlanActions(casePlan?: ImobCasePlanV1 | null) {
  if (!casePlan) return [];
  if (
    casePlan.mission !== "capture_seasonal_property"
    && casePlan.mission !== "capture_rental_property"
    && casePlan.mission !== "capture_sale_property"
  ) return [];
  const actions = [
    ...(casePlan.primaryAction ? [casePlan.primaryAction] : []),
    ...casePlan.secondaryActions,
  ];
  const seen = new Set<string>();
  return actions
    .filter((item) => {
      if (seen.has(item.operation)) return false;
      seen.add(item.operation);
      return !casePlan.suppressedActions.includes(item.operation);
    })
    .map(mapCasePlanActionToCta);
}

function buildPropertyPostSuccessActions(params: {
  casePlan?: ImobCasePlanV1 | null;
  caseContext?: ImobCrmCaseContext | null;
}) {
  const linkedPropertyOwner = asObject(params.caseContext?.property?.owner as Record<string, unknown> | null);
  const hasOwnerEntity = Boolean(
    (params.caseContext?.owner && ((params.caseContext.owner as any).id || (params.caseContext.owner as any).name))
    || (linkedPropertyOwner && (asString(linkedPropertyOwner.id) || asString(linkedPropertyOwner.name))),
  );
  const planActions = buildCasePlanActions(params.casePlan).filter((action) => {
    if (!hasOwnerEntity) return true;
    return String((action as any).nextMessage ?? "") !== "cadastrar proprietário";
  });
  const fallbackActions = buildCaptureSwitchActions(params.caseContext);
  if (planActions.length === 0) return fallbackActions;

  const merged = [...planActions];
  const seen = new Set(
    merged.map((item) => `${String((item as any).label ?? "")}::${String((item as any).nextMessage ?? "")}`),
  );

  for (const action of fallbackActions) {
    if (
      String((action as any).label ?? "") === "Consultar caso"
      && merged.some((item) => String((item as any).label ?? "") === "Consultar caso")
    ) {
      continue;
    }
    const key = `${String((action as any).label ?? "")}::${String((action as any).nextMessage ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(action as typeof merged[number]);
  }

  return merged;
}

function formatPropertyGoalLabel(goal: unknown) {
  const normalized = asString(goal)?.trim().toLowerCase();
  if (normalized === "locacao") return "Locação";
  if (normalized === "venda") return "Venda";
  if (normalized === "aluguel_por_temporada") return "Aluguel por temporada";
  return asString(goal);
}

function formatPropertyTypeLabel(propertyType: unknown) {
  const value = asString(propertyType);
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildPropertyPostSuccessSummary(params: {
  caseContext?: ImobCrmCaseContext | null;
  operational?: Record<string, unknown> | null;
}) {
  const property = asObject(params.caseContext?.property) ?? {};
  const propertyDraft = asObject(params.operational?.propertyDraft) ?? {};
  const propertyOwner = asObject(property.owner as Record<string, unknown> | null);
  const caseOwner = asObject(params.caseContext?.owner as Record<string, unknown> | null);
  const ownerName = asString(propertyOwner?.name) ?? asString(caseOwner?.name);

  const lines = [
    formatPropertyTypeLabel(property.propertyType ?? propertyDraft.propertyType)
      ? `Tipo: ${formatPropertyTypeLabel(property.propertyType ?? propertyDraft.propertyType)}`
      : null,
    formatPropertyGoalLabel(property.goal ?? propertyDraft.goal)
      ? `Finalidade: ${formatPropertyGoalLabel(property.goal ?? propertyDraft.goal)}`
      : null,
    asString(property.city) ?? asString(propertyDraft.city)
      ? `Cidade: ${asString(property.city) ?? asString(propertyDraft.city)}`
      : null,
    asString(property.neighborhood) ?? asString(propertyDraft.neighborhood)
      ? `Bairro: ${asString(property.neighborhood) ?? asString(propertyDraft.neighborhood)}`
      : null,
    asString(property.address) ?? asString(propertyDraft.address)
      ? `Endereço: ${asString(property.address) ?? asString(propertyDraft.address)}`
      : null,
    ownerName ? `Proprietário vinculado: ${ownerName}` : null,
  ].filter((line): line is string => Boolean(line && line.trim()));

  if (lines.length === 0) return null;
  return {
    kind: "details",
    title: "Resumo do imóvel cadastrado",
    lines,
    phase: "post_success",
  };
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

function inferCanonicalSnapshotVariant(params: {
  mode: string;
  copyState: ImobCrmTurnCopyState | null;
  hasForm: boolean;
  hasBlocks: boolean;
  outcome: "created" | "updated" | "deduped_update" | "blocked" | "waiting_input" | null;
}) {
  if (params.mode === "blocked") {
    return params.copyState === "blocked_scope" ? "blocked_scope" as const : "blocked_missing_data" as const;
  }
  if (params.outcome === "deduped_update") return "success_deduped_update" as const;
  if (params.outcome === "updated") return "success_updated" as const;
  if (params.outcome === "created") return "success_created" as const;
  if (params.outcome === "waiting_input" && params.hasForm) return "collecting_fields" as const;
  if (params.copyState === "collecting_fields") return "collecting_fields" as const;
  if (params.copyState === "form_draft" || params.hasForm) return "form_draft" as const;
  if (params.hasBlocks) return "consult" as const;
  return "fallback" as const;
}

function inferOperationalOutcomeFromResolution(data: Record<string, unknown>, copyState: ImobCrmTurnCopyState | null) {
  const mode = asString(data.mode) ?? "";
  const action = asString(data.action) ?? "";
  const presentation = asObject(data.presentation) ?? {};
  const conversationState = asObject(data.conversationState) ?? {};
  const operational = asObject(conversationState.operational) ?? {};
  const flow = asString(operational.flow) ?? "";
  const operationalStatus = asString(operational.status) ?? "";
  const text = asString(presentation.text)?.toLowerCase() ?? "";
  const pendingFieldLabels = asStringList(presentation.pendingFieldLabels);
  const hasForm = Boolean(asObject(presentation.form));

  if (mode === "blocked") return "blocked" as const;
  if (pendingFieldLabels.length > 0 || hasForm || copyState === "collecting_fields" || operationalStatus === "collecting") return "waiting_input" as const;
  if (text.includes("cadastro existente")) return "deduped_update" as const;
  if (action.endsWith(".update") || copyState === "updated") return "updated" as const;
  if (
    (flow === "owner.create" || flow === "property.create" || flow === "lead.qualify")
    && operationalStatus === "ready_for_review"
  ) {
    return "created" as const;
  }
  return null;
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
  const casePlan = asObject(data.imobCasePlan) as ImobCasePlanV1 | null;
  const flow = asString(operational.flow) ?? "";
  const operationalStatus = asString(operational.status) ?? "";
  const card = asObject(presentation.card);
  const cardCtas = Array.isArray(card?.ctas) ? (card?.ctas as Array<Record<string, unknown>>) : [];

  if (flow === "property.create" && operationalStatus === "ready_for_review") {
    const propertySummaryBlock = buildPropertyPostSuccessSummary({
      caseContext,
      operational,
    });
    const postSuccessActions = buildPropertyPostSuccessActions({
      casePlan,
      caseContext,
    });
    return [
      {
        kind: "confirmation",
        text: "Cadastro do imóvel processado com sucesso.",
        phase: "post_success",
      },
      ...(propertySummaryBlock ? [propertySummaryBlock] : []),
      {
        kind: "next_actions",
        title: "Posso seguir com uma destas ações agora.",
        ctas: postSuccessActions,
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
  if (isMarketScanSelectionResolution(data)) return [];

  const presentation = asObject(data.presentation) ?? {};
  const caseContext = asObject(data.caseContext) as ImobCrmCaseContext | null;
  const conversationState = asObject(data.conversationState) ?? {};
  const operational = asObject(conversationState.operational) ?? {};
  const operationalFlow = asString(operational.flow) ?? "";
  const hasForm = Boolean(asObject(presentation.form));
  if (hasForm && ["owner.create", "property.create", "lead.qualify"].includes(operationalFlow)) {
    return [];
  }
  const suggestedNextAction = asString(presentation.suggestedNextAction);
  if (operationalFlow === "lead.qualify" && suggestedNextAction) {
    return [suggestedNextAction];
  }
  if (Array.isArray(presentation.blocks) && presentation.blocks.length > 0) {
    return [];
  }
  if (
    caseContext?.flow === "owner.create"
    && (caseContext.pendingItems?.length ?? 0) === 0
    && typeof caseContext.nextStep === "string"
    && caseContext.nextStep.toLowerCase().includes("vincular o proprietário".toLowerCase())
  ) {
    return [];
  }
  const blocks = Array.isArray(presentation.blocks) ? (presentation.blocks as Array<Record<string, unknown>>) : [];
  const card = asObject(presentation.card);
  const cardCtas = Array.isArray(card?.ctas) ? (card?.ctas as Array<Record<string, unknown>>) : [];
  const recommendedActions = Array.isArray(caseContext?.canonical?.recommendedActions)
    ? caseContext?.canonical?.recommendedActions
    : [];
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

function preserveCanonicalOperationalSurface(
  resolvedTurn: Record<string, unknown>,
  registrationAwareTurn: Record<string, unknown>,
) {
  const basePresentation = asObject(resolvedTurn.presentation) ?? {};
  const nextPresentation = asObject(registrationAwareTurn.presentation) ?? {};
  const baseOperational = asObject(asObject(resolvedTurn.conversationState)?.operational) ?? {};
  const nextOperational = asObject(asObject(registrationAwareTurn.conversationState)?.operational) ?? {};
  const hasBaseForm = Boolean(asObject(basePresentation.form));
  const hasBaseCard = Boolean(asObject(basePresentation.card));
  const hasNextForm = Boolean(asObject(nextPresentation.form));
  const hasNextCard = Boolean(asObject(nextPresentation.card));
  const hasNextBlocks = Array.isArray(nextPresentation.blocks) && nextPresentation.blocks.length > 0;
  const sameFlow = (asString(baseOperational.flow) ?? "") === (asString(nextOperational.flow) ?? "");
  const sameStatus = (asString(baseOperational.status) ?? "") === (asString(nextOperational.status) ?? "");

  if ((!hasBaseForm && !hasBaseCard) || hasNextBlocks || !sameFlow || !sameStatus) {
    return registrationAwareTurn;
  }

  return {
    ...registrationAwareTurn,
    presentation: {
      ...nextPresentation,
      ...(hasBaseForm && !hasNextForm ? { form: basePresentation.form } : {}),
      ...(hasBaseCard && !hasNextCard ? {
        card: basePresentation.card,
        __canonicalCardFallback: basePresentation.card,
      } : {}),
      pendingFieldLabels: nextPresentation.pendingFieldLabels ?? basePresentation.pendingFieldLabels,
      metadata: {
        ...(asObject(basePresentation.metadata) ?? {}),
        ...(asObject(nextPresentation.metadata) ?? {}),
      },
    },
  };
}

function stripLegacyCardProof(card: Record<string, unknown> | null) {
  if (!card) return card;
  const { proof: _legacyProof, ...cardWithoutProof } = card;
  return cardWithoutProof;
}

function applyImobCrmCopyStateToResolution(data: Record<string, unknown>): Record<string, unknown> {
  const isMarketScanSelection = isMarketScanSelectionResolution(data);
  const originalPresentation = asObject(data.presentation) ?? {};
  const presentation = isMarketScanSelection
    ? stripMarketScanSelectionLegacyPresentation(originalPresentation)
    : originalPresentation;
  const normalizedData = presentation === originalPresentation
    ? data
    : { ...data, presentation };
  const canonicalCardFallback = asObject((presentation as Record<string, unknown>).__canonicalCardFallback);
  const inferredCopyState = inferImobCrmCopyStateFromResolution(normalizedData);
  const copyState = isMarketScanSelection ? null : inferredCopyState;
  const proof = isMarketScanSelection ? null : resolveImobProofSurfaceFromResolution(normalizedData);
  const blocks = isMarketScanSelection ? [] : buildImobPresentationBlocks(normalizedData, copyState);
  const outcome = inferOperationalOutcomeFromResolution(normalizedData, copyState);
  const hasForm = Boolean(asObject(presentation.form));
  const snapshotVariant = inferCanonicalSnapshotVariant({
    mode: asString(normalizedData.mode) ?? "",
    copyState,
    hasForm,
    hasBlocks: blocks.length > 0,
    outcome,
  });
  const metadata = asObject(presentation.metadata) ?? {};
  const quickReplies = buildImobPresentationQuickReplies({
    ...data,
    presentation: {
      ...presentation,
      ...(proof ? { proof } : {}),
      ...(blocks.length > 0 ? { blocks } : {}),
    },
  });
  const shouldClearLegacyCard =
    (snapshotVariant === "collecting_fields" && hasForm)
    || snapshotVariant === "form_draft"
    || snapshotVariant === "success_created"
    || snapshotVariant === "success_updated"
    || snapshotVariant === "success_deduped_update";
  const nextOperational = asObject(asObject(data.conversationState)?.operational);
  const sanitizedCard = stripLegacyCardProof(asObject(presentation.card) ?? canonicalCardFallback);
  if (
    presentation === originalPresentation
    && !copyState
    && !proof
    && blocks.length === 0
    && quickReplies.length === 0
    && !outcome
  ) return data;
  return {
    ...normalizedData,
    conversationState: {
      ...(asObject(data.conversationState) ?? {}),
      ...(nextOperational ? {
        operational: {
          ...nextOperational,
          outcome,
        },
      } : {}),
    },
    presentation: {
      ...presentation,
      metadata: {
        ...metadata,
        canonicalSnapshot: {
          authoritative: true as const,
          source: "imob_crm_turn_engine" as const,
          variant: snapshotVariant,
        },
      },
      __canonicalCardFallback: undefined,
      ...(copyState ? { copyState } : {}),
      ...(proof ? { proof } : {}),
      ...(!shouldClearLegacyCard && sanitizedCard ? { card: sanitizedCard } : {}),
      ...(shouldClearLegacyCard ? { card: undefined, form: snapshotVariant.startsWith("success_") ? undefined : presentation.form } : {}),
      ...(blocks.length > 0 ? { blocks } : {}),
      ...(quickReplies.length > 0 ? { quickReplies } : {}),
    },
  };
}

function attachImobCasePlanToResolution(params: {
  data: Record<string, unknown>;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  message?: string | null;
  recipeMissionContext?: ImobMissionContext | null;
}) {
  const conversationState = asObject(params.data.conversationState);
  const operationalRaw = asObject(conversationState?.operational);
  const existingMissionContext = asObject(operationalRaw?.missionContext);
  const operational = operationalRaw && params.recipeMissionContext
    ? {
      ...operationalRaw,
      missionContext: {
        ...existingMissionContext,
        ...params.recipeMissionContext,
        startedFromMessage: asString(existingMissionContext?.startedFromMessage)
          ?? params.recipeMissionContext.startedFromMessage
          ?? null,
        recipeId: params.recipeMissionContext.recipeId ?? asString(existingMissionContext?.recipeId) ?? null,
      },
    }
    : operationalRaw;
  const caseContext = asObject(params.data.caseContext) as ImobCrmCaseContext | null;
  const imobCaseContext = buildImobCaseContextV1({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    caseId: params.caseId ?? caseContext?.caseId ?? null,
    message: params.message,
    caseContext,
    operational,
  });
  const imobCasePlan = planImobCase(imobCaseContext);
  return {
    ...params.data,
    conversationState: {
      ...(conversationState ?? {}),
      ...(operational ? { operational } : {}),
    },
    imobCaseContext,
    imobCasePlan,
    presentation: {
      ...(asObject(params.data.presentation) ?? {}),
      metadata: {
        ...(asObject(asObject(params.data.presentation)?.metadata) ?? {}),
        imobCaseContextVersion: imobCaseContext.version,
        imobCasePlanVersion: imobCasePlan.version,
      },
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
  const canonicalPendingAction = parseImobPendingAction(params.body.canonicalPendingAction);
  const recipeMissionContext = asObject(params.body.recipeMissionContext) as ImobMissionContext | null;
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
    const ownerActionAwareMessage = rewritePropertyOwnerActionMessage(
      rewrittenMessage,
      hydratedThreadState,
      params.helpers.normalizeImobRouteText,
    );
    const dedupeAwareMessage = resolveDedupeContextualMessage(
      ownerActionAwareMessage,
      hydratedThreadState,
      params.helpers.normalizeImobRouteText,
    );
    const effectiveMessage = isExplicitLeadPropertyLinkRequest(dedupeAwareMessage)
      ? "cadastrar imóvel"
      : dedupeAwareMessage;
    const explicitStageChangeFlow = inferExplicitStageChangeFlow(effectiveMessage);
	    const hydratedOperationalForFlow = asObject(asObject(hydratedThreadState)?.operational);
	    const currentOperationalFlow = asString(hydratedOperationalForFlow?.flow);
    const isCrossStageTransitionRequest =
      explicitStageChangeFlow !== null
      && explicitStageChangeFlow !== currentOperationalFlow;
    const normalizedEffectiveMessage = params.helpers.normalizeImobRouteText(effectiveMessage);
    const isMarketScanSelectionFlowMessage =
	      asString(hydratedOperationalForFlow?.flow) === "property.market_scan"
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
    const pendingActionConfirmation = resolvePendingActionConfirmation({
      message: effectiveMessage,
      caseId: turn.caseId,
      threadId: requestedThreadId,
      threadState: hydratedThreadState,
      canonicalPendingAction,
    });
    if (pendingActionConfirmation) {
      const data = normalizeLeadQualifyResolution(
        applyResponsibleLabelToResolvedTurn(pendingActionConfirmation as any, params.workspaceResponsibleLabel) as Record<string, unknown>,
      );
      const caseContext = turn.caseId
        ? await params.helpers.upsertImobCaseFromResolvedTurn({
            prisma: params.prisma,
            tenantId: params.authContext.tenantId,
            workspaceId: params.authContext.workspaceId,
            caseId: turn.caseId,
            threadId: requestedThreadId,
            threadLabel,
            resolved: data,
          })
        : null;
      const resolvedCaseContext = caseContext ?? data.caseContext ?? null;
      return {
        data: params.helpers.applyCanonicalJourneyToResolvedData(data, resolvedCaseContext as ImobCrmCaseContext | null),
        caseContext: resolvedCaseContext,
      };
    }
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
      const data = normalizeLeadQualifyResolution(
        applyResponsibleLabelToResolvedTurn(workflowGuard, params.workspaceResponsibleLabel) as Record<string, unknown>,
      );
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
      const data = normalizeLeadQualifyResolution(
        applyResponsibleLabelToResolvedTurn(
          applyDedupeSelectionToConversationState(hydratedThreadState, rewrittenMessage, updateData as Record<string, unknown>) as any,
          params.workspaceResponsibleLabel,
        ) as Record<string, unknown>,
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
        const data = normalizeLeadQualifyResolution(
          applyResponsibleLabelToResolvedTurn(consultData, params.workspaceResponsibleLabel) as Record<string, unknown>,
        );
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
      const marketScanResolution =
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
      const marketScanResult = marketScanResolution?.snapshot ?? null;
      const resolvedTurn = attachSnapshotToResolvedTurn(
        marketScanResult
          ? resolveImobTurn({ ...baseResolveRequest, marketScanResult, marketScanOpportunity: marketScanResolution?.opportunity ?? null })
          : resumedMarketScanSnapshot
            ? resolveImobTurn({ ...baseResolveRequest, marketScanResult: resumedMarketScanSnapshot })
            : preliminaryResolvedTurn,
        marketScanResult ?? resumedMarketScanSnapshot,
        marketScanResolution?.run ?? null,
        marketScanResolution?.opportunity ?? null,
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
      const registrationAwareTurn = preserveCanonicalOperationalSurface(
        resolvedTurn,
        await params.helpers.applyExistingRegistrationResolution({
          prisma: params.prisma,
          tenantId: params.authContext.tenantId,
          workspaceId: params.authContext.workspaceId,
          message: effectiveMessage,
          resolved: params.helpers.injectResolvedPendingSuggestion(resolvedTurn),
        }) as Record<string, unknown>,
      );
      const data = preserveCanonicalOperationalSurface(
        resolvedTurn,
        normalizeLeadQualifyResolution(
          applyResponsibleLabelToResolvedTurn(registrationAwareTurn, params.workspaceResponsibleLabel) as Record<string, unknown>,
        ),
      );

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
        const data = normalizeLeadQualifyResolution(
          applyResponsibleLabelToResolvedTurn(consultData, params.workspaceResponsibleLabel) as Record<string, unknown>,
        );
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
    const marketScanResolution =
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
    const marketScanResult = marketScanResolution?.snapshot ?? null;
    const resolvedTurn = attachSnapshotToResolvedTurn(
      marketScanResult
        ? resolveImobTurn({ ...baseResolveRequest, marketScanResult, marketScanOpportunity: marketScanResolution?.opportunity ?? null })
        : resumedMarketScanSnapshot
          ? resolveImobTurn({ ...baseResolveRequest, marketScanResult: resumedMarketScanSnapshot })
          : preliminaryResolvedTurn,
      marketScanResult ?? resumedMarketScanSnapshot,
      marketScanResolution?.run ?? null,
      marketScanResolution?.opportunity ?? null,
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
    const registrationAwareTurn = preserveCanonicalOperationalSurface(
      resolvedTurn,
      await params.helpers.applyExistingRegistrationResolution({
        prisma: params.prisma,
        tenantId: params.authContext.tenantId,
        workspaceId: params.authContext.workspaceId,
        message: effectiveMessage,
        resolved: params.helpers.injectResolvedPendingSuggestion(resolvedTurn),
      }) as Record<string, unknown>,
    );
      const data = preserveCanonicalOperationalSurface(
        resolvedTurn,
        normalizeLeadQualifyResolution(
          applyResponsibleLabelToResolvedTurn(registrationAwareTurn, params.workspaceResponsibleLabel) as Record<string, unknown>,
        ),
      );

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

  const canonicalSingleData = {
    ...params.helpers.applyCanonicalJourneyToResolvedData(singleResult.data, (singleResult.caseContext ?? singleResult.data.caseContext) as ImobCrmCaseContext | null | undefined),
    caseContext: singleResult.caseContext ?? singleResult.data.caseContext,
    entitlements: params.entitlements,
  };

  return applyImobCrmCopyStateToResolution(attachImobCasePlanToResolution({
    data: canonicalSingleData,
    tenantId: params.authContext.tenantId,
    workspaceId: params.authContext.workspaceId,
    caseId: requestedCaseId,
    message: message ?? "",
    recipeMissionContext,
  }));
}
