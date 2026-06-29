import {
  apiGetBillingPricingQuote,
  apiQueryEiahHelp,
  type Agent,
  type EiahHelpQueryHit,
} from "@/lib/api";
import type { RoleProfile } from "@/lib/roles";
import { PRICING_PLANS, quotePlan } from "@/config/pricing";
import {
  PRESENTATION_SNAPSHOT_VERSION,
  type MessagePresentationSnapshot,
} from "@/components/agents/chatPresentationSnapshot";
import {
  buildAgentCapabilitiesReply,
  buildAgentOverviewReply,
  buildDeterministicAgentOverviewReply,
  buildEiahCapabilitiesSummary,
  buildSuggestedAgentReply,
  isAgentPresentationQuestion,
} from "@/components/agents/agentPresentationResolver";
import {
  buildLauncherDecisionTelemetry,
  buildLauncherHelpdeskSessionPayload,
  normalizeLauncherPersistedIntentResult,
  type LauncherPersistedIntent,
} from "@/components/agents/chatDecisionTelemetry";
import {
  buildAgentSignupHelpReply,
  buildContextualFallback,
  buildDeterministicHelpReply,
  buildDeterministicPlaybookReply,
  buildDocumentationExplainReply,
  buildHostileInputReply,
  buildInternalTechnicalAccessReply,
  buildOrchestratorGuidanceReply,
  buildPlatformSwitchOfferReply,
  buildPlatformSelfExplainReply,
  isAgentSignupHelpQuestion,
  isDocumentationExplainQuestion,
  isFlowGuidanceQuestion,
  isHostileInput,
  isInternalTechnicalAccessQuestion,
  isPlatformUiExplainQuestion,
  isPlatformSelfExplainQuestion,
} from "@/components/agents/platformHelpResolver";
import {
  buildImobInputPlaceholderForInput,
  buildImobKnowledgeSearchQuickReplies,
  isImobContextEntryQuestion,
  isImobGuideQuestion,
  resolveImobLauncherSurfaceDecision,
  resolveImobKnowledgeSearchIntent,
  resolveImobFaqSeed,
  resolveImobHelpIntent,
  resolveImobJourneyStage,
  resolveImobVerticalContext,
  resolveImobShortcutSelection,
  shouldDeferGenericPlatformQuestionFromImob,
  shouldRouteToImob,
  type ImobFaqSeed,
  type ImobJourneyStage,
} from "@/components/agents/imobContextResolver";
import {
  buildLegalInputPlaceholderForInput,
  buildLegalContextEntryReply,
  buildLegalDataCollectionReply,
  buildLegalHandoffReply,
  buildLegalQuickRepliesForInput,
  isLegalDataCollectionQuestion,
  isLegalRoutingQuestion,
  resolveLegalJourneyStage,
  resolveLegalVerticalContext,
  type LegalJourneyStage,
} from "@/components/agents/legalContextResolver";
import {
  resolveProposalState,
} from "@/components/agents/proposalDomainResolver";
import {
  buildSpecialistExplainReply,
  resolveSpecialistExplainTarget,
} from "@/components/agents/specialistExplainCatalog";
import {
  resolveAadvDecision,
  resolveFinNexusDecision,
  resolveGuardianDecision,
  resolveJuridicoDecision,
} from "@/components/agents/specialistDecisionResolver";
import {
  buildProposalAssistedTrialReply,
  buildProposalCostReductionReply,
  buildProposalOpenCommercialReply,
  buildProposalPurchaseContextReply,
  buildProposalQuoteReply,
  buildProposalScheduleDemoReply,
  buildProposalUsagePromptReply,
} from "@/components/agents/proposalCopy";
import { buildProposalQuickReplies } from "@/components/agents/proposalQuickReplies";
import { resolveHelpDictionarySnapshot } from "@/components/agents/helpDictionaryResolver";
import {
  hasExactEiahTutorIntentMatch,
  resolveEiahTutorContractResponse,
  resolveEiahTutorInputPlaceholder,
  resolveEiahTutorRouteQuickReplies,
} from "@/components/agents/eiahTutorContracts";
import type {
  ConversationStage,
  ProposalDomain,
} from "@/components/agents/proposalTypes";
export {
  buildAgentOverviewReply,
} from "@/components/agents/agentPresentationResolver";
export {
  buildLauncherDecisionTelemetry,
  buildLauncherHelpdeskSessionPayload,
  normalizeLauncherPersistedIntentResult,
} from "@/components/agents/chatDecisionTelemetry";
export {
  buildDeterministicHelpReply,
} from "@/components/agents/platformHelpResolver";
export {
  buildDeterministicImobReply,
} from "@/components/agents/imobContextResolver";

export type AgentParticipationSnapshot = NonNullable<Agent["participation"]>;

export type AgentParticipationRegistryEntry = {
  agent: Agent;
  participation: AgentParticipationSnapshot;
};

export type SpecialistAvailability = {
  agent: Agent | null;
  participation: AgentParticipationSnapshot | null;
  canBeSuggested: boolean;
  canReceiveHandoff: boolean;
};

export type LauncherRouteIntent = "proposal" | "imob" | "playbook" | "help" | "orchestrator";
export type EiahMode = "help" | "orchestrator" | "proposal";
export type HelpFallbackType = "clarify" | "blocked" | "not_found";
export type HelpResolutionType = "resolved" | HelpFallbackType;

export type ResolvedIntent = {
  intentId: string | null;
  confidence: number;
  scopeHint?:
    | "page"
    | "vertical"
    | "global"
    | "agent"
    | "workflow"
    | "governance"
    | "billing"
    | "productStrategy"
    | "fallback";
  needsClarification?: boolean;
};

export type ConversationState = {
  lastIntentId?: string;
  lastQuickReplies?: string[];
  lastRoute?: LauncherRouteIntent | "self_intro" | "capabilities_summary" | "legal_handoff";
  lastFallbackType?: HelpFallbackType;
};

export type ResolvedHelpSnapshot = {
  intent: ResolvedIntent;
  responseType: HelpResolutionType;
  content: string;
  quickReplies: string[];
};

export type EiahDecisionKind =
  | "initial_journey"
  | "self_intro"
  | "capabilities_summary"
  | "agent_explain"
  | "agent_signup_help"
  | "platform_self_explain"
  | "internal_technical_access"
  | "documentation_explain"
  | "hostile_input"
  | "imob_context_entry"
  | "legal_context_entry"
  | "legal_handoff"
  | "legal_data_collection"
  | "orchestrator_guidance"
  | "help_reply"
  | "imob_reply"
  | "playbook_reply"
  | "contextual_fallback"
  | "needs_run";

export type EiahDecision = {
  kind: EiahDecisionKind;
  shouldCreateRun: boolean;
  content?: string;
  resolvedQuickReplies?: string[];
  conversationState?: ConversationState | null;
  journeyContext?: {
    frontDoorLabel: string;
    firstStepLabel: string;
  } | null;
  launcherRouteIntent: LauncherRouteIntent;
  presentationRouteIntent:
    | LauncherRouteIntent
    | "self_intro"
    | "capabilities_summary"
    | "legal_handoff";
  eiahMode: EiahMode;
  renderVariant: "simple_help" | "self_intro" | "handoff" | "guided_flow" | "proposal";
  persistIntent?: {
    intent: string;
    confidenceFloor?: number;
  };
};

export type SpecialistDecision = {
  kind: "self_intro" | "capabilities_summary" | "specialist_guidance" | "contextual_fallback" | "needs_run";
  shouldCreateRun: boolean;
  content?: string;
  presentationRouteIntent: LauncherRouteIntent | "self_intro" | "capabilities_summary";
  renderVariant: "simple_help" | "self_intro" | "guided_flow";
};

export type LauncherLocalDecision = {
  kind: string;
  shouldCreateRun: boolean;
  content?: string;
  resolvedQuickReplies?: string[];
  journeyContext?: {
    frontDoorLabel: string;
    firstStepLabel: string;
  } | null;
  launcherRouteIntent: LauncherRouteIntent;
  presentationRouteIntent:
    | LauncherRouteIntent
    | "self_intro"
    | "capabilities_summary"
    | "legal_handoff";
  eiahMode?: EiahMode | null;
  renderVariant: "simple_help" | "self_intro" | "handoff" | "guided_flow" | "proposal";
  proposalDomain?: ProposalDomain | null;
  conversationStage?: ConversationStage | null;
  proposalContextRecovered?: boolean;
  proposalContextLost?: boolean;
  proposalDomainMismatch?: boolean;
  persistIntent?: {
    intent: string;
    confidenceFloor?: number;
  };
  agentSwitchRequest?: MessagePresentationSnapshot["agentSwitchRequest"];
  conversationState?: ConversationState | null;
};

export function fallbackHelpMarkdown() {
  return [
    "**Resumo**",
    "Não consegui montar uma resposta útil com clareza para esse pedido.",
    "",
    "Se quiser, você pode me pedir de um destes jeitos:",
    "- `como usar o IMOB`",
    "- `como criar um run`",
    "- `quais agentes posso usar`",
    "- `como funciona o billing`",
  ].join("\n");
}

export function resolveQuickReplyUsed(params: {
  previousAssistantSnapshot?: MessagePresentationSnapshot | null;
  input: string;
}) {
  const normalizedInput = normalizeIntentText(params.input);
  if (!normalizedInput) return false;

  return Boolean(
    params.previousAssistantSnapshot?.quickReplies?.some(
      (reply) => normalizeIntentText(reply) === normalizedInput
    )
  );
}

export type LauncherAccessContext = {
  tenantId?: string | null;
  workspaceId?: string | null;
  roleProfile?: RoleProfile | null;
  activeDomain?: "core" | "imob" | null;
  installedProducts?: string[] | null;
  entitlements?: {
    REAL_ESTATE_CORE?: boolean;
    IMOB_INSTALLED?: boolean;
  } | null;
};

type ResolvedEiahJourneyContract = {
  roleProfile: NonNullable<LauncherAccessContext["roleProfile"]>;
  activeDomain: "core" | "imob";
  frontDoorSurface: string;
  frontDoorLabel: string;
  firstStepLabel: string;
  firstStepDescription: string;
  beginnerExplanation: string;
  prioritySurfaces: string[];
  secondarySurfaces: string[];
  initialQuickReplies: string[];
};

export type AttachmentIntakeResolution = {
  enabled: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  helpText?: string;
  intakeModes?: Array<"upload_file" | "paste_text" | "structured_form">;
  analysisModes?: Array<
    | "full_review"
    | "partial_review"
    | "clause_review"
    | "risk_scan"
    | "missing_fields"
    | "evidence_validation"
    | "financial_check"
  >;
  acceptedKinds?: string[];
  acceptedMimeTypes?: string[];
  requiredMetadata?: string[];
  initialPrompts?: string[];
};

export type LegacyEnrichmentIntent = {
  intent: string;
  confidence: number;
  fallbackReason?: string;
};

export type LauncherIntentResultLike = {
  intent: string;
  confidence: number;
  fallbackReason?: string | null;
};

export type ConversationPersistenceTrigger =
  | "approval_required"
  | "critical_execution"
  | "delegation"
  | "provenance_required"
  | "final_summary"
  | "user_confirmed"
  | "manual_save";

export type ConversationPersistencePolicyInput = {
  mode: "ephemeral" | "durable";
  ttlMinutes: number;
  promoteOn: ConversationPersistenceTrigger[];
  persistSummary: boolean;
  persistShortTermMemory: boolean;
};

export function resolveAttachmentIntake(agentProfile: Agent | null): AttachmentIntakeResolution {
  const contract = agentProfile?.attachmentContract;
  if (!contract?.acceptsAttachments) {
    return { enabled: false };
  }

  const displayName = getAgentDisplayName(agentProfile);
  const isLegal = contract.acceptedAttachmentKinds.includes("contract") || displayName.toLowerCase().includes("jur");
  const isEvidence = contract.acceptedAttachmentKinds.includes("evidence") || contract.acceptedAttachmentKinds.includes("receipt");
  const isFinancial =
    contract.acceptedAttachmentKinds.includes("invoice") || contract.acceptedAttachmentKinds.includes("spreadsheet");

  const primaryActionLabel = isLegal
    ? "Anexar contrato"
    : isEvidence
    ? "Anexar evidência"
    : isFinancial
    ? "Anexar documento"
    : "Anexar arquivo";
  const secondaryActionLabel = isLegal
    ? "Colar cláusula"
    : isEvidence
    ? "Colar link de verificação"
    : isFinancial
    ? "Colar trecho"
    : "Colar texto";

  return {
    enabled: true,
    primaryActionLabel,
    secondaryActionLabel,
    helpText: contract.uploadHelpText ?? `Envie um arquivo ou cole um trecho para ${displayName} analisar.`,
    intakeModes: contract.intakeModes,
    analysisModes: contract.analysisModes,
    acceptedKinds: contract.acceptedAttachmentKinds,
    acceptedMimeTypes: contract.acceptedMimeTypes,
    requiredMetadata: contract.requiredMetadata,
    initialPrompts: contract.initialPrompts,
  };
}

function formatLegacyContractValue(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function buildLegacyConfidenceBlock(params: {
  agentProfile: Agent | null;
  intentResult: LegacyEnrichmentIntent;
  runId?: string | null;
}) {
  const confidenceBehavior = params.agentProfile?.cognitiveProfile?.confidenceBehavior ?? "implicit";
  if (confidenceBehavior === "implicit") return "";
  const trustSignals = params.agentProfile?.uxContract?.trustSignals ?? [];
  const provenancePolicy = params.agentProfile?.knowledgePolicy?.provenancePolicy ?? "none";
  const confidencePct = Math.round((params.intentResult.confidence ?? 0) * 100);
  const lines: string[] = [];
  if (confidenceBehavior === "explicit" || confidenceBehavior === "gated") {
    lines.push(`Confiança de interpretação: ${confidencePct}%`);
  }
  if (provenancePolicy !== "none") {
    lines.push(`Proveniência: ${formatLegacyContractValue(provenancePolicy)}`);
  }
  if (params.runId) {
    lines.push(`Run: ${params.runId}`);
  }
  if (trustSignals.length > 0) {
    lines.push(`Sinais: ${trustSignals.slice(0, 3).join(", ")}`);
  }
  if (lines.length === 0) return "";
  return `\n\n**Confiança e sinais**\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function shouldAppendLegacyMetaBlock(params: {
  content: string;
  routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator";
  runId?: string | null;
  kind: "cta" | "confidence";
}) {
  const content = params.content.trim();
  const isSimpleHelpReply =
    (params.routeIntent === "help" || params.routeIntent === "playbook" || params.routeIntent === "imob") &&
    !params.runId;

  if (params.kind === "confidence" && isSimpleHelpReply) {
    return false;
  }

  if (params.kind === "cta" && isSimpleHelpReply) {
    if (/(se quiser|me diga|eu posso|posso te ajudar|eu te mostro)/i.test(content)) {
      return false;
    }
  }

  return true;
}

function buildLegacyCtaBlock(agentProfile: Agent | null, routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator") {
  const defaultCta = agentProfile?.uxContract?.defaultCTA?.trim();
  if (!defaultCta) return "";
  const title =
    routeIntent === "proposal"
      ? "Próximo passo recomendado"
      : routeIntent === "help"
      ? "Próximo passo"
      : routeIntent === "orchestrator"
      ? "Próxima decisão"
      : "Ação recomendada";
  return `\n\n**${title}**\n${defaultCta}`;
}

export function enrichLegacyAssistantContent(params: {
  content: string;
  agentProfile: Agent | null;
  routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator" | null;
  intentResult: LegacyEnrichmentIntent;
  runId?: string | null;
  presentationSnapshot?: {
    maxCognitiveLoad?: string;
    responseShape?: string;
  } | null;
}) {
  const routeIntent = params.routeIntent ?? "help";
  const base = params.content.trim();
  if (!base) return base;
  const maxLoad = params.presentationSnapshot?.maxCognitiveLoad ?? params.agentProfile?.uxContract?.maxCognitiveLoad ?? "medium";
  const responseShape = params.presentationSnapshot?.responseShape ?? params.agentProfile?.uxContract?.responseShape ?? "brief_answer";
  let next = base;

  const isGuardianAgent =
    normalizeAgentKey(params.agentProfile?.id ?? "") === "guardian" ||
    normalizeIntentText(params.agentProfile?.name ?? "").includes("guardian");
  if (isGuardianAgent && /knowledge_policy\.blocked:\s*knowledge_required_source_missing/i.test(next)) {
    next =
      params.agentProfile?.chatCopy?.blockedMessages?.missingRequiredSource?.trim() ||
      "Não consegui validar isso com segurança porque faltam evidências obrigatórias, como comprovante, link de verificação ou trilha de integridade.";
  }

  if (maxLoad === "low" && responseShape === "alert_card") {
    const compact = base
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n\n");
    next = compact || base;
  }

  if (params.presentationSnapshot) {
    return next.trim();
  }

  if (
    shouldAppendLegacyMetaBlock({
      content: next,
      routeIntent,
      runId: params.runId,
      kind: "cta",
    }) &&
    !/^\*\*Pr[oó]ximo passo/i.test(next) &&
    !/\n\*\*Pr[oó]ximo passo/i.test(next)
  ) {
    next += buildLegacyCtaBlock(params.agentProfile, routeIntent);
  }
  if (
    shouldAppendLegacyMetaBlock({
      content: next,
      routeIntent,
      runId: params.runId,
      kind: "confidence",
    }) &&
    !/\*\*Confiança e sinais\*\*/i.test(next)
  ) {
    next += buildLegacyConfidenceBlock({
      agentProfile: params.agentProfile,
      intentResult: params.intentResult,
      runId: params.runId,
    });
  }
  return next.trim();
}

function isPlaybookQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "central de ajuda",
    "roteiros principais",
    "diretrizes criticas",
    "diretrizes",
    "checklist",
    "playbook",
    "modo help",
    "modo proposal",
    "solicitar proposta",
    "pagina runs",
    "pagina agentes",
    "pagina billing",
    "pagina marketplace",
    "pagina imob",
    "pagina self-service",
    "pagina perfil",
    "comandos do chat",
  ];
  return patterns.some((pattern) => normalized.includes(pattern));
}

function isAppShortcutInput(input: string) {
  const normalized = normalizeIntentText(input);
  return normalized.includes("/app/") || normalized.includes("/api/");
}

export function resolveConversationVerticalContext(
  input: string
): { vertical: "IMOB"; stage?: ImobJourneyStage; faq?: ImobFaqSeed } | { vertical: "LEGAL"; stage?: LegalJourneyStage } | null {
  return resolveImobVerticalContext(input) ?? resolveLegalVerticalContext(input);
}

function resolveVerticalContext(input: string) {
  return resolveConversationVerticalContext(input);
}

function hasImobVerticalAccess(accessContext?: LauncherAccessContext | null) {
  if (!accessContext?.tenantId || !accessContext?.workspaceId) return false;
  return accessContext.entitlements?.REAL_ESTATE_CORE === true;
}

function classifyTutorHelpResponseType(intentId: string): HelpResolutionType {
  if (intentId === "platform_overview_fallback") return "not_found";
  if (intentId === "policy_clarify") return "clarify";
  if (intentId.startsWith("policy_blocked_")) return "blocked";
  return "resolved";
}

function buildResolvedHelpSnapshot(params: {
  tutorReply: {
    intentId: string;
    content: string;
    quickReplies: string[];
  };
  hasExactIntentPriority: boolean;
  accessContext?: LauncherAccessContext | null;
  scopeHint?:
    | "page"
    | "vertical"
    | "global"
    | "agent"
    | "workflow"
    | "governance"
    | "billing"
    | "productStrategy"
    | "fallback";
}): ResolvedHelpSnapshot {
  const responseType = classifyTutorHelpResponseType(params.tutorReply.intentId);
  return {
    intent: {
      intentId: params.tutorReply.intentId === "platform_overview_fallback" ? null : params.tutorReply.intentId,
      confidence: params.hasExactIntentPriority ? 1 : responseType === "resolved" ? 0.82 : 0.7,
      scopeHint: params.scopeHint ?? "global",
      needsClarification: responseType === "clarify",
    },
    responseType,
    content: params.tutorReply.content,
    quickReplies: filterResolvedEiahQuickReplies(params.tutorReply.quickReplies, params.accessContext),
  };
}

function buildHelpConversationState(snapshot: ResolvedHelpSnapshot): ConversationState {
  return {
    lastIntentId: snapshot.intent.intentId ?? undefined,
    lastQuickReplies: snapshot.quickReplies,
    lastRoute: "help",
    lastFallbackType: snapshot.responseType === "resolved" ? undefined : snapshot.responseType,
  };
}

function canResolveEiahQuickReplyLabel(label: string, accessContext?: LauncherAccessContext | null) {
  const normalized = label.trim();
  if (!normalized) return false;

  const registrySnapshot = resolveHelpDictionarySnapshot({
    input: normalized,
    accessContext,
    routeIntent: "help",
    includeFallback: false,
  });
  if (registrySnapshot && registrySnapshot.responseType !== "not_found") {
    return true;
  }

  const tutorReply = resolveEiahTutorContractResponse({
    input: normalized,
    accessContext,
  });
  if (tutorReply && tutorReply.intentId !== "platform_overview_fallback") {
    return true;
  }

  return buildDeterministicHelpReply(normalized) != null;
}

function filterResolvedEiahQuickReplies(quickReplies: string[], accessContext?: LauncherAccessContext | null) {
  return quickReplies
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, array) => array.indexOf(label) === index)
    .filter((label) => canResolveEiahQuickReplyLabel(label, accessContext))
    .slice(0, 3);
}

function buildResolvedHelpDecision(params: {
  snapshot: ResolvedHelpSnapshot;
  confidenceFloor?: number;
}): EiahDecision {
  return {
    kind: "help_reply",
    shouldCreateRun: false,
    content: params.snapshot.content,
    resolvedQuickReplies: params.snapshot.quickReplies,
    conversationState: buildHelpConversationState(params.snapshot),
    launcherRouteIntent: "help",
    presentationRouteIntent: "help",
    eiahMode: "help",
    renderVariant: "simple_help",
    persistIntent: {
      intent: params.snapshot.intent.intentId ?? "product_explain",
      confidenceFloor: params.confidenceFloor ?? params.snapshot.intent.confidence,
    },
  };
}

function resolveEiahPriorityHelpDecision(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
  accessContext?: LauncherAccessContext | null;
}): EiahDecision | null {
  if (isPlatformSelfExplainQuestion(params.input)) {
    return null;
  }

  const tutorReply = resolveEiahTutorContractResponse({
    input: params.input,
    accessContext: params.accessContext,
  });
  const hasExplicitTutorIntentPriority = Boolean(
    tutorReply &&
      tutorReply.intentId !== "platform_overview_fallback" &&
      !tutorReply.intentId.startsWith("policy_") &&
      hasExactEiahTutorIntentMatch(params.input)
  );
  if (hasExplicitTutorIntentPriority && tutorReply) {
    return buildResolvedHelpDecision({
      snapshot: buildResolvedHelpSnapshot({
        tutorReply,
        hasExactIntentPriority: true,
        accessContext: params.accessContext,
        scopeHint: "global",
      }),
    });
  }

  const registrySnapshot = resolveHelpDictionarySnapshot({
    input: params.input,
    routeIntent: params.routeIntent,
    accessContext: params.accessContext,
    includeFallback: false,
  });
  if (registrySnapshot && !(params.routeIntent === "imob" && registrySnapshot.intent.scopeHint === "vertical")) {
    return buildResolvedHelpDecision({
      snapshot: {
        ...registrySnapshot,
        quickReplies: filterResolvedEiahQuickReplies(registrySnapshot.quickReplies, params.accessContext),
      },
      confidenceFloor: registrySnapshot.intent.confidence,
    });
  }

  const directHelp = params.routeIntent === "help" ? buildDeterministicHelpReply(params.input) : null;
  if (directHelp) {
    return buildResolvedHelpDecision({
      snapshot: buildResolvedHelpSnapshot({
        tutorReply: {
          intentId: "deterministic_help",
          content: directHelp,
          quickReplies: [],
        },
        hasExactIntentPriority: false,
        accessContext: params.accessContext,
        scopeHint: "page",
      }),
      confidenceFloor: 0.78,
    });
  }

  const imobKnowledgeSearchIntent = resolveImobKnowledgeSearchIntent(params.input);
  const imobSurfaceDecision =
    params.routeIntent === "imob"
      ? resolveImobLauncherSurfaceDecision({
          input: params.input,
          hasAccess: hasImobVerticalAccess(params.accessContext),
          hasKnowledgeSearchIntent: Boolean(imobKnowledgeSearchIntent),
          isContextEntryQuestion: isImobContextEntryQuestion(params.input),
        })
      : imobKnowledgeSearchIntent
        ? resolveImobLauncherSurfaceDecision({
            input: params.input,
            hasAccess: hasImobVerticalAccess(params.accessContext),
            hasKnowledgeSearchIntent: true,
            isContextEntryQuestion: false,
          })
        : isImobContextEntryQuestion(params.input)
          ? resolveImobLauncherSurfaceDecision({
              input: params.input,
              hasAccess: hasImobVerticalAccess(params.accessContext),
              hasKnowledgeSearchIntent: false,
              isContextEntryQuestion: true,
            })
          : null;

  if (imobSurfaceDecision) {
    return imobSurfaceDecision;
  }

  const shouldUseGlobalTutor =
    params.routeIntent === "help" ||
    (params.routeIntent === "imob" && shouldDeferGenericPlatformQuestionFromImob(params.input)) ||
    hasExplicitTutorIntentPriority;

  if (shouldUseGlobalTutor && tutorReply && tutorReply.intentId !== "platform_overview_fallback") {
    return buildResolvedHelpDecision({
      snapshot: buildResolvedHelpSnapshot({
        tutorReply,
        hasExactIntentPriority: hasExplicitTutorIntentPriority,
        accessContext: params.accessContext,
        scopeHint: "global",
      }),
    });
  }

  const fallbackRegistrySnapshot = resolveHelpDictionarySnapshot({
    input: params.input,
    routeIntent: params.routeIntent,
    accessContext: params.accessContext,
    includeFallback: params.routeIntent === "help",
  });
  if (fallbackRegistrySnapshot && fallbackRegistrySnapshot.responseType !== "not_found") {
    return buildResolvedHelpDecision({
      snapshot: {
        ...fallbackRegistrySnapshot,
        quickReplies: filterResolvedEiahQuickReplies(fallbackRegistrySnapshot.quickReplies, params.accessContext),
      },
      confidenceFloor: fallbackRegistrySnapshot.intent.confidence,
    });
  }

  return null;
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parsePtBrNumber(raw: string): number | null {
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  const multiplier = compact.endsWith("k")
    ? 1_000
    : compact.endsWith("m")
    ? 1_000_000
    : compact.endsWith("mil")
    ? 1_000
    : 1;
  const normalized = compact.replace(/[km]|mil$/g, "").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value * multiplier : null;
}

function extractProposalInputs(input: string): { users: number | null; runs: number | null } {
  const normalized = normalizeIntentText(input);
  let users: number | null = null;
  let runs: number | null = null;

  const userMatch = normalized.match(/(\d[\d\.,k]*|\d+\s*mil)\s*(usuarios|usuario|users|user|pessoas|equipe)\b/);
  if (userMatch?.[1]) users = parsePtBrNumber(userMatch[1]);

  const runsMatch = normalized.match(/(\d[\d\.,k]*|\d+\s*mil)\s*(runs|run|execucoes|execucoes\/mes|runs\/mes|runs\/m[eê]s)\b/);
  if (runsMatch?.[1]) runs = parsePtBrNumber(runsMatch[1]);

  return {
    users: users !== null ? Math.max(0, Math.round(users)) : null,
    runs: runs !== null ? Math.max(0, Math.round(runs)) : null,
  };
}

function isLegalSpecialistAgent(agentProfile: Agent | null) {
  const normalizedId = normalizeAgentKey(agentProfile?.id ?? "");
  const normalizedName = normalizeAgentKey(agentProfile?.name ?? "");
  return normalizedId === "j360" || normalizedName.includes("juridico");
}

function centsToBrl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}


function getAgentDisplayName(agent: Agent | null | undefined) {
  if (!agent) return "Agente";
  const normalizedId = normalizeAgentKey(agent.id ?? "");
  const normalizedName = normalizeAgentKey(agent.name ?? "");
  if (normalizedId === "eiah" || normalizedName === "eiahcore") return "EIAH";
  return agent.name?.trim() || agent.id?.trim() || "Agente";
}

function isPresentationQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "explique voce",
    "o que voce faz",
    "o que vc faz",
    "quem e voce",
    "se apresente",
    "explique suas capacidades",
    "explique suas funcoes",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function buildDefaultParticipation(agent: Agent): AgentParticipationSnapshot {
  return {
    agentId: agent.id,
    status: "active",
    visibility: "visible",
    canBeSuggested: true,
    canReceiveHandoff: true,
    requiresEntitlement: false,
    requiredModules: [],
    requiredWorkspaceCapabilities: [],
  };
}

export function getAgentParticipation(agent: Agent | null | undefined): AgentParticipationSnapshot | null {
  if (!agent) return null;
  return agent.participation ?? buildDefaultParticipation(agent);
}

export function resolveAgentParticipation(
  agents: Agent[],
  hints: string[] | string,
): AgentParticipationSnapshot | null {
  const registry = buildAgentParticipationRegistry(agents);
  const normalizedHints = Array.isArray(hints) ? hints : [hints];

  for (const hint of normalizedHints) {
    const entry = registry.get(normalizeAgentKey(hint));
    if (!entry) continue;
    return entry.participation;
  }

  return null;
}

export function canSuggestAgent(agent: Agent | null | undefined) {
  const participation = getAgentParticipation(agent);
  if (!participation) return false;
  return participation.visibility === "visible" && participation.canBeSuggested && participation.status === "active";
}

export function canHandoffToAgent(agent: Agent | null | undefined) {
  const participation = getAgentParticipation(agent);
  if (!participation) return false;
  return participation.visibility === "visible" && participation.canReceiveHandoff && participation.status === "active";
}

export function buildAgentParticipationRegistry(agents: Agent[]) {
  const registry = new Map<string, AgentParticipationRegistryEntry>();

  for (const agent of agents) {
    const participation = getAgentParticipation(agent);
    if (!participation) continue;
    const keys = new Set<string>([
      normalizeAgentKey(agent.id ?? ""),
      normalizeAgentKey(agent.name ?? ""),
      normalizeAgentKey(participation.agentId ?? ""),
    ]);
    for (const key of keys) {
      if (!key) continue;
      registry.set(key, { agent, participation });
    }
  }

  return registry;
}

export function resolveSpecialistAvailability(agents: Agent[], hints: string[]): SpecialistAvailability {
  const registry = buildAgentParticipationRegistry(agents);
  for (const hint of hints) {
    const entry = registry.get(normalizeAgentKey(hint));
    if (!entry) continue;
    return {
      agent: entry.agent,
      participation: entry.participation,
      canBeSuggested: canSuggestAgent(entry.agent),
      canReceiveHandoff: canHandoffToAgent(entry.agent),
    };
  }

  return {
    agent: null,
    participation: null,
    canBeSuggested: false,
    canReceiveHandoff: false,
  };
}

export function isEiahCapabilitiesQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "o que o eiah pode fazer por mim",
    "o que o eiah oferece",
    "como o eiah pode me ajudar",
    "como voce pode me ajudar",
    "como vc pode me ajudar",
    "qual agente devo usar",
    "qual especialista devo usar",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

function isDirectAnswerFriendlyQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const starters = ["como ", "o que ", "quais ", "qual ", "mostre ", "me mostre ", "explique "];
  const topicalSignals = ["exemplo", "exemplo pratico", "riscos comuns", "riscos", "proximos passos", "como comecar"];
  return (
    starters.some((starter) => normalized.startsWith(starter)) ||
    topicalSignals.some((signal) => normalized.includes(signal))
  );
}

export function detectLauncherRouteIntent(input: string, proposalMode: boolean): LauncherRouteIntent {
  if (proposalMode) return "proposal";
  const normalized = normalizeIntentText(input);
  if (isAppShortcutInput(input)) return "help";
  if (resolveImobKnowledgeSearchIntent(input)) return "imob";
  const strongProposalSignals = [
    "proposta",
    "plano",
    "preco",
    "preço",
    "valor",
    "custo",
    "quanto vou pagar",
    "quanto custa",
    "mensalidade",
    "orcamento",
    "orçamento",
    "comercial",
  ];
  const secondaryProposalSignals = [
    "usuarios",
    "usuario",
    "pessoas",
    "equipe",
    "runs",
    "run",
    "implantacao",
    "implantar",
    "trial",
    "demonstracao",
    "demonstração",
  ];
  const helpOperationalSignals = [
    "status",
    "tempo real",
    "simular",
    "rodar agora",
    "como criar run",
    "como criar um run",
    "pagina",
    "página",
    "endpoints",
    "api",
    "como funciona imob",
  ];
  const hasStrongProposal = strongProposalSignals.some((signal) => normalized.includes(signal));
  const hasSecondaryProposal = secondaryProposalSignals.some((signal) => normalized.includes(signal));
  const hasOperationalHelp = helpOperationalSignals.some((signal) => normalized.includes(signal));
  if (hasStrongProposal || (hasSecondaryProposal && !hasOperationalHelp)) return "proposal";
  if (shouldRouteToImob(input)) return "imob";
  if (isPlaybookQuestion(input)) return "playbook";
  if (isLegalRoutingQuestion(input)) return "orchestrator";
  if (
    normalized.includes("analisar") ||
    normalized.includes("analise") ||
    normalized.includes("orquestrar") ||
    normalized.includes("delegar") ||
    normalized.includes("executar") ||
    normalized.includes("auditar")
  ) {
    return "orchestrator";
  }
  return "help";
}

export function buildEiahQuickReplies(params: {
  routeIntent: LauncherRouteIntent | "legal_handoff";
  proposalMode: boolean;
  sourceInput?: string | null;
  proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
  conversationStage?: MessagePresentationSnapshot["conversationStage"];
}) {
  if (params.proposalMode || params.routeIntent === "proposal") {
    return buildProposalQuickReplies({
      proposalDomain: params.proposalDomain ?? "saas",
      conversationStage: params.conversationStage,
    });
  }

  if (params.routeIntent === "orchestrator") {
    return resolveEiahTutorRouteQuickReplies("orchestrator", params.sourceInput);
  }

  if (params.routeIntent === "legal_handoff") {
    return buildLegalQuickRepliesForInput(params.sourceInput ?? "");
  }

  if (params.routeIntent === "imob") {
    if (params.sourceInput && resolveImobKnowledgeSearchIntent(params.sourceInput)) {
      return buildImobKnowledgeSearchQuickReplies();
    }
    return [];
  }

  return resolveEiahTutorRouteQuickReplies("help", params.sourceInput);
}

export function buildInputPlaceholderForContext(params: {
  routeIntent: LauncherRouteIntent | "legal_handoff";
  input?: string | null;
}) {
  const resolvedVerticalContext = params.input ? resolveConversationVerticalContext(params.input) : null;

  if (resolvedVerticalContext?.vertical === "LEGAL") {
    return buildLegalInputPlaceholderForInput(params.input);
  }

  if (params.routeIntent === "imob") {
    return buildImobInputPlaceholderForInput(params.input);
  }

  if (params.routeIntent === "legal_handoff") {
    return buildLegalInputPlaceholderForInput(params.input);
  }

  return resolveEiahTutorInputPlaceholder(
    params.routeIntent === "orchestrator" ? "orchestrator" : "help",
    params.input
  );
}

export function buildQuickRepliesForContext(params: {
  agentProfile: Agent | null;
  routeIntent: LauncherRouteIntent | "legal_handoff";
  isHelpCenterMode: boolean;
  proposalMode: boolean;
  sourceInput?: string | null;
  proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
  conversationStage?: MessagePresentationSnapshot["conversationStage"];
  resolvedQuickReplies?: string[] | null;
}) {
  const normalizeReplies = (values: Array<string | null | undefined>) =>
    values
      .filter((value): value is string => Boolean(value && value.trim()))
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 3);

  if (params.resolvedQuickReplies?.length) {
    return normalizeReplies(params.resolvedQuickReplies);
  }
  const copyReplies =
    params.agentProfile?.chatCopy?.quickReplies?.filter((value): value is string => Boolean(value && value.trim())) ?? [];
  const resolvedVerticalContext =
    params.proposalDomain === "saas" ? null : params.sourceInput ? resolveConversationVerticalContext(params.sourceInput) : null;
  const legalReplies =
    resolvedVerticalContext?.vertical === "LEGAL" && params.sourceInput
      ? buildLegalQuickRepliesForInput(params.sourceInput)
      : [];

  const verticalReplies = resolvedVerticalContext?.vertical === "LEGAL"
      ? legalReplies
      : [];

  if (verticalReplies.length) {
    return normalizeReplies(verticalReplies);
  }

  if (params.isHelpCenterMode) {
    const engineReplies = buildEiahQuickReplies({
      routeIntent: params.routeIntent,
      proposalMode: params.proposalMode,
      sourceInput: params.sourceInput,
      proposalDomain: params.proposalDomain,
      conversationStage: params.conversationStage,
    });
    if (engineReplies.length) {
      return normalizeReplies(engineReplies);
    }
    return normalizeReplies(copyReplies);
  }

  const specialistReplies = isLegalSpecialistAgent(params.agentProfile) ? legalReplies : [];
  if (specialistReplies.length) {
    return normalizeReplies(specialistReplies);
  }

  return normalizeReplies(copyReplies);
}

export function buildLauncherContextualFallback(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
}) {
  if (params.routeIntent === "proposal") {
    const parsed = extractProposalInputs(params.input);
    if (parsed.users && !parsed.runs) {
      return "Entendi seu contexto comercial. Para calcular com precisão, me diga apenas os **runs/mês** estimados.";
    }
    if (!parsed.users && parsed.runs) {
      return "Entendi seu contexto comercial. Para calcular com precisão, me diga apenas a quantidade de **usuários**.";
    }
    return "Entendi que você quer proposta comercial. Me passe `usuários` e `runs/mês` para eu calcular agora.";
  }
  if (params.routeIntent === "help") {
    return "Me diga o que você quer resolver e eu te explico o melhor caminho dentro da plataforma.";
  }
  if (params.routeIntent === "orchestrator") {
    return "Entendi que você quer coordenação operacional. Diga se o próximo passo é analisar, simular, executar ou auditar.";
  }
  return "Não consegui consolidar a resposta neste momento. Tente reformular em uma frase objetiva.";
}

export function createPresentationSnapshotV1(params: {
  agentProfile: Agent | null;
  routeIntent: MessagePresentationSnapshot["routeIntent"];
  eiahMode?: EiahMode | null;
  confidence?: number;
  runId?: string | null;
  renderVariant?: MessagePresentationSnapshot["renderVariant"];
  sourceInput?: string;
  isHelpCenterMode: boolean;
  proposalMode: boolean;
  attachmentIntake: AttachmentIntakeResolution;
  usedReplyInputs?: string[];
  excludeReplyInputs?: string[];
  proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
  conversationStage?: MessagePresentationSnapshot["conversationStage"];
  resolvedQuickReplies?: string[];
  journeyContext?: MessagePresentationSnapshot["journeyContext"];
  agentSwitchRequest?: MessagePresentationSnapshot["agentSwitchRequest"];
}): MessagePresentationSnapshot {
  const normalizedRouteIntent =
    params.routeIntent === "self_intro" || params.routeIntent === "capabilities_summary"
      ? "help"
      : params.routeIntent;
  const provenanceMode = params.agentProfile?.knowledgePolicy?.provenancePolicy ?? "none";
  const signals = params.agentProfile?.uxContract?.trustSignals?.slice(0, 3) ?? [];
  const showConfidence =
    Boolean(params.runId) ||
    !(
      params.routeIntent === "help" ||
      params.routeIntent === "playbook" ||
      params.routeIntent === "imob" ||
      params.routeIntent === "legal_handoff" ||
      params.routeIntent === "self_intro" ||
      params.routeIntent === "capabilities_summary"
    );
  const quickReplies = buildQuickRepliesForContext({
    agentProfile: params.agentProfile,
    routeIntent: normalizedRouteIntent,
    isHelpCenterMode: params.isHelpCenterMode,
    proposalMode: params.proposalMode,
    sourceInput: params.sourceInput,
    proposalDomain: params.proposalDomain,
    conversationStage: params.conversationStage,
    resolvedQuickReplies: params.resolvedQuickReplies,
  });
  const excludedReplyKeys = new Set(
    (params.excludeReplyInputs ?? []).map((value) => normalizeIntentText(value)).filter(Boolean)
  );
  const usedReplyKeys = new Set(
    (params.usedReplyInputs ?? []).map((value) => normalizeIntentText(value)).filter(Boolean)
  );
  const filteredQuickReplies = quickReplies.filter((reply) => {
    const normalizedReply = normalizeIntentText(reply);
    return !usedReplyKeys.has(normalizedReply) && !excludedReplyKeys.has(normalizedReply);
  });
  const quickReplySource: MessagePresentationSnapshot["quickReplySource"] =
    params.resolvedQuickReplies && params.resolvedQuickReplies.length > 0
      ? "backend_payload"
      : filteredQuickReplies.length > 0
        ? (params.agentProfile?.chatCopy?.quickReplies?.length ? "agent_contract" : "frontend_copy")
        : "none";
  const nextDecision =
    params.routeIntent === "orchestrator"
      ? params.agentProfile?.uxContract?.defaultCTA?.trim()
      : undefined;
  const verticalContext =
    params.proposalDomain === "saas" ? null : params.sourceInput ? resolveConversationVerticalContext(params.sourceInput)?.vertical ?? null : null;
  const nextSignals = verticalContext
    ? [...signals, `vertical:${verticalContext.toLowerCase()}`].filter((value, index, array) => array.indexOf(value) === index)
    : signals;

  return {
    snapshotVersion: PRESENTATION_SNAPSHOT_VERSION,
    compatibilityMode: "snapshot",
    quickReplySource,
    verticalContext,
    proposalDomain: params.proposalDomain ?? null,
    conversationStage: params.conversationStage ?? null,
    routeIntent: params.routeIntent,
    eiahMode: params.eiahMode ?? null,
    showConfidence,
    confidencePercent: typeof params.confidence === "number" ? Math.round(params.confidence * 100) : undefined,
    provenanceMode,
    signals: nextSignals,
    nextDecision,
    quickReplies: filteredQuickReplies,
    journeyContext: params.journeyContext ?? null,
    renderVariant: params.renderVariant ?? "guided_flow",
    responseShape: params.agentProfile?.uxContract?.responseShape,
    maxCognitiveLoad: params.agentProfile?.uxContract?.maxCognitiveLoad,
    inputPlaceholder: buildInputPlaceholderForContext({
      routeIntent: normalizedRouteIntent,
      input: params.sourceInput,
    }),
    attachmentEnabled: params.attachmentIntake.enabled,
    attachmentKinds: params.attachmentIntake.acceptedKinds,
    attachmentIntakeModes: params.attachmentIntake.intakeModes,
    attachmentAnalysisModes: params.attachmentIntake.analysisModes,
    attachmentPrimaryActionLabel: params.attachmentIntake.primaryActionLabel,
    attachmentSecondaryActionLabel: params.attachmentIntake.secondaryActionLabel,
    attachmentHelpText: params.attachmentIntake.helpText,
    governedRuntime:
      normalizedRouteIntent === "imob" && quickReplySource === "backend_payload"
        ? {
            domain: "IMOB",
            contractVersion: "imob.crm.governed.v1",
            launcherPolicy: "render_only",
            quickRepliesSource: "backend_payload",
            recommendedActionsSource: "backend_payload",
            agentActivitiesSource: "backend_payload",
          }
        : null,
    agentSwitchRequest: params.agentSwitchRequest ?? null,
  };
}

function isAffirmativeInput(input: string) {
  const normalized = normalizeIntentText(input);
  return ["sim", "s", "quero", "ok", "pode ser", "claro", "pode", "afirmativo"].includes(normalized);
}

function resolveAgentSwitchDecision(params: {
  input: string;
  previousAssistantSnapshot?: MessagePresentationSnapshot | null;
}): LauncherLocalDecision | null {
  const request = params.previousAssistantSnapshot?.agentSwitchRequest;
  if (!request || request.trigger !== "affirmative") return null;
  if (!isAffirmativeInput(params.input)) return null;
  return {
    kind: "agent_switch",
    shouldCreateRun: false,
    content: "Perfeito. Vou mudar para o agente EIAH para te ajudar com a plataforma.",
    launcherRouteIntent: "help",
    presentationRouteIntent: "help",
    eiahMode: "help",
    renderVariant: "simple_help",
    agentSwitchRequest: {
      ...request,
      switchImmediately: true,
    },
  };
}

function hasInstalledProduct(installedProducts: string[] | null | undefined, product: string) {
  return (installedProducts ?? []).some((item) => item.trim().toUpperCase() === product);
}

function isJourneyEntryQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "por onde comeco",
    "por onde eu comeco",
    "como comecar",
    "como eu comeco",
    "o que posso fazer aqui",
    "o que eu posso fazer aqui",
    "meu caminho ideal",
    "qual meu caminho",
    "qual e meu caminho",
    "como navegar",
    "como usar a plataforma",
    "como usar o eiah",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function resolveEiahJourneyContract(params: {
  agentProfile: Agent | null;
  accessContext?: LauncherAccessContext | null;
}): ResolvedEiahJourneyContract | null {
  const contract = params.agentProfile?.journeyContract;
  const roleProfile = params.accessContext?.roleProfile;
  if (!contract || !roleProfile) return null;

  const base = contract.roleJourneys.find((entry) => entry.roleProfile === roleProfile);
  if (!base) return null;

  const activeDomain = params.accessContext?.activeDomain ?? "core";
  const installedProducts = params.accessContext?.installedProducts ?? [];
  const override = contract.domainOverrides?.find((entry) => {
    if (entry.domain !== activeDomain) return false;
    if (entry.appliesToRoles?.length && !entry.appliesToRoles.includes(roleProfile)) return false;
    if (entry.installedProduct && !hasInstalledProduct(installedProducts, entry.installedProduct)) return false;
    return true;
  });

  return {
    roleProfile,
    activeDomain,
    frontDoorSurface: override?.overrideFrontDoorSurface ?? base.frontDoorSurface,
    frontDoorLabel: override?.overrideFrontDoorLabel ?? base.frontDoorLabel,
    firstStepLabel: override?.overrideFirstStepLabel ?? base.firstStepLabel,
    firstStepDescription: override?.overrideFirstStepDescription ?? base.firstStepDescription,
    beginnerExplanation: override?.overrideBeginnerExplanation ?? base.beginnerExplanation,
    prioritySurfaces: override?.overridePrioritySurfaces ?? base.prioritySurfaces,
    secondarySurfaces: override?.overrideSecondarySurfaces ?? base.secondarySurfaces,
    initialQuickReplies: override?.overrideQuickReplies ?? base.initialQuickReplies,
  };
}

function buildEiahJourneyReply(journey: ResolvedEiahJourneyContract) {
  const priority = journey.prioritySurfaces.slice(0, 3).join(", ");
  const secondary = journey.secondarySurfaces.slice(0, 3).join(", ");
  return [
    `Seu ponto de partida é ${journey.frontDoorLabel}.`,
    journey.beginnerExplanation,
    "",
    `Primeiro passo: ${journey.firstStepLabel}.`,
    journey.firstStepDescription,
    "",
    `Prioridade agora: ${priority || "—"}.`,
    `Depois você pode aprofundar em: ${secondary || "—"}.`,
  ].join("\n");
}

export function resolveLauncherExecutionRenderVariant(params: {
  routeIntent: LauncherRouteIntent;
  phase: "run_created" | "run_error";
}): MessagePresentationSnapshot["renderVariant"] {
  if (params.routeIntent === "proposal") {
    return "proposal";
  }
  if (params.phase === "run_created" && params.routeIntent === "orchestrator") {
    return "handoff";
  }
  return "guided_flow";
}

export function createLauncherExecutionSnapshot(params: {
  agentProfile: Agent | null;
  routeIntent: LauncherRouteIntent;
  eiahMode?: EiahMode | null;
  confidence?: number;
  runId?: string | null;
  sourceInput?: string;
  phase: "run_created" | "run_error";
  isHelpCenterMode: boolean;
  proposalMode: boolean;
  attachmentIntake: AttachmentIntakeResolution;
  usedReplyInputs?: string[];
}): MessagePresentationSnapshot {
  return createPresentationSnapshotV1({
    agentProfile: params.agentProfile,
    routeIntent: params.routeIntent,
    eiahMode: params.eiahMode,
    confidence: params.confidence,
    runId: params.runId,
    renderVariant: resolveLauncherExecutionRenderVariant({
      routeIntent: params.routeIntent,
      phase: params.phase,
    }),
    sourceInput: params.sourceInput,
    isHelpCenterMode: params.isHelpCenterMode,
    proposalMode: params.proposalMode,
    attachmentIntake: params.attachmentIntake,
    usedReplyInputs: params.usedReplyInputs,
  });
}

export function resolveLauncherEiahUnifiedMode(params: {
  isUnifiedEiah: boolean;
  launcherTopic?: string | null;
  routeIntent?: LauncherRouteIntent | null;
}): EiahMode | null {
  if (!params.isUnifiedEiah) return null;
  if ((params.launcherTopic ?? "").trim().toLowerCase() === "proposal" || params.routeIntent === "proposal") {
    return "proposal";
  }
  if (params.routeIntent === "orchestrator") {
    return "orchestrator";
  }
  if (params.routeIntent === "help" || params.routeIntent === "imob" || params.routeIntent === "playbook") {
    return "help";
  }
  return "orchestrator";
}

export function selectLauncherAgentContract(agent: Agent | null, mode: EiahMode | null) {
  if (!agent) return null;
  if (!mode || !Array.isArray(agent.modeContracts) || agent.modeContracts.length === 0) {
    return agent;
  }
  const modeContract = agent.modeContracts.find((entry) => entry.mode === mode);
  if (!modeContract) return agent;
  return {
    ...agent,
    knowledgePolicy: modeContract.knowledgePolicy ?? agent.knowledgePolicy,
    cognitiveProfile: modeContract.cognitiveProfile ?? agent.cognitiveProfile,
    uxContract: modeContract.uxContract ?? agent.uxContract,
    chatCopy: modeContract.chatCopy ?? agent.chatCopy,
  };
}

export function resolveLauncherRunSummarySnapshot(params: {
  existingSnapshot?: MessagePresentationSnapshot | null;
  selectedAgent: Agent | null;
  isUnifiedEiah: boolean;
  launcherTopic?: string | null;
  lastRouteIntent?: LauncherRouteIntent | null;
  activeEiahMode?: EiahMode | null;
  intentResult: LauncherIntentResultLike;
  runId: string;
  isHelpCenterMode: boolean;
  proposalMode: boolean;
  attachmentIntake: AttachmentIntakeResolution;
  usedReplyInputs?: string[];
}): MessagePresentationSnapshot {
  if (params.existingSnapshot) {
    return params.existingSnapshot;
  }

  const routeIntent: LauncherRouteIntent =
    params.intentResult.intent === "proposal" ? "proposal" : (params.lastRouteIntent ?? "help");
  const eiahMode =
    params.activeEiahMode ??
    resolveLauncherEiahUnifiedMode({
      isUnifiedEiah: params.isUnifiedEiah,
      launcherTopic: params.launcherTopic,
      routeIntent,
    });
  const agentProfile = selectLauncherAgentContract(params.selectedAgent, eiahMode);

  return createPresentationSnapshotV1({
    agentProfile,
    routeIntent,
    eiahMode,
    confidence: params.intentResult.confidence,
    runId: params.runId,
    isHelpCenterMode: params.isHelpCenterMode,
    proposalMode: params.proposalMode,
    attachmentIntake: params.attachmentIntake,
    usedReplyInputs: params.usedReplyInputs,
  });
}

export async function resolveLauncherProposalDecision(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
  proposalMode: boolean;
  eiahMode: EiahMode | null;
  agentProfile: Agent | null;
  previousUserMessage?: string | null;
  previousAssistantMessage?: string | null;
  previousAssistantSnapshot?: MessagePresentationSnapshot | null;
}): Promise<LauncherLocalDecision | null> {
  if (params.routeIntent !== "proposal") return null;

  const normalized = normalizeIntentText(params.input);
  const proposalState = resolveProposalState({
    input: params.input,
    routeIntent: params.routeIntent,
    proposalMode: params.proposalMode,
    previousUserMessage: params.previousUserMessage,
    previousAssistantMessage: params.previousAssistantMessage,
    previousAssistantSnapshot: params.previousAssistantSnapshot,
  });
  const parsed = proposalState?.usage ?? extractProposalInputs(params.input);

  if (proposalState?.domain === "imob") {
    return null;
  }

  if ((normalized.includes("reduzir custo") || normalized.includes("reduzir gastos")) && !parsed.users && !parsed.runs) {
    return {
      kind: "proposal_reply",
      shouldCreateRun: false,
      content: buildProposalCostReductionReply(),
      launcherRouteIntent: "proposal",
      presentationRouteIntent: "proposal",
      eiahMode: params.eiahMode ?? "proposal",
      renderVariant: "proposal",
      proposalDomain: "saas",
      conversationStage: "proposal_collecting_usage",
      proposalContextRecovered: proposalState?.contextRecovered ?? false,
      proposalContextLost: proposalState?.contextLost ?? false,
      proposalDomainMismatch: proposalState?.domainMismatch ?? false,
    };
  }

  if (
    proposalState?.requestedAction === "open_commercial_proposal" ||
    proposalState?.requestedAction === "send_to_sales"
  ) {
    if (parsed.users && parsed.runs) {
      return {
        kind: "proposal_reply",
        shouldCreateRun: false,
        content: buildProposalOpenCommercialReply({ users: parsed.users, runs: parsed.runs }),
        launcherRouteIntent: "proposal",
        presentationRouteIntent: "proposal",
        eiahMode: params.eiahMode ?? "proposal",
        renderVariant: "proposal",
        proposalDomain: "saas",
        conversationStage: "proposal_ready_to_open",
        proposalContextRecovered: proposalState?.contextRecovered ?? false,
        proposalContextLost: proposalState?.contextLost ?? false,
        proposalDomainMismatch: proposalState?.domainMismatch ?? false,
      };
    }
  }

  if (proposalState?.requestedAction === "schedule_demo") {
    return {
      kind: "proposal_reply",
      shouldCreateRun: false,
      content: buildProposalScheduleDemoReply({ users: parsed.users, runs: parsed.runs }),
      launcherRouteIntent: "proposal",
      presentationRouteIntent: "proposal",
      eiahMode: params.eiahMode ?? "proposal",
      renderVariant: "proposal",
      proposalDomain: "saas",
      conversationStage: parsed.users && parsed.runs ? "proposal_demo_ready" : "proposal_demo_requested",
      proposalContextRecovered: proposalState?.contextRecovered ?? false,
      proposalContextLost: proposalState?.contextLost ?? false,
      proposalDomainMismatch: proposalState?.domainMismatch ?? false,
    };
  }

  if (proposalState?.requestedAction === "create_assisted_trial") {
    return {
      kind: "proposal_reply",
      shouldCreateRun: false,
      content: buildProposalAssistedTrialReply({ users: parsed.users, runs: parsed.runs }),
      launcherRouteIntent: "proposal",
      presentationRouteIntent: "proposal",
      eiahMode: params.eiahMode ?? "proposal",
      renderVariant: "proposal",
      proposalDomain: "saas",
      conversationStage: parsed.users && parsed.runs ? "proposal_demo_ready" : "proposal_demo_requested",
      proposalContextRecovered: proposalState?.contextRecovered ?? false,
      proposalContextLost: proposalState?.contextLost ?? false,
      proposalDomainMismatch: proposalState?.domainMismatch ?? false,
    };
  }

  if (
    proposalState?.requestedAction === "new_purchase" ||
    proposalState?.requestedAction === "workspace_expansion"
  ) {
    if (parsed.users && parsed.runs) {
      const purchaseLabel =
        proposalState.requestedAction === "workspace_expansion" ? "expansão do workspace" : "compra nova";
      return {
        kind: "proposal_reply",
        shouldCreateRun: false,
        content: buildProposalPurchaseContextReply({
          purchaseLabel,
          users: parsed.users,
          runs: parsed.runs,
        }),
        launcherRouteIntent: "proposal",
        presentationRouteIntent: "proposal",
        eiahMode: params.eiahMode ?? "proposal",
        renderVariant: "proposal",
        proposalDomain: "saas",
        conversationStage: "proposal_opening",
        proposalContextRecovered: proposalState?.contextRecovered ?? false,
        proposalContextLost: proposalState?.contextLost ?? false,
        proposalDomainMismatch: proposalState?.domainMismatch ?? false,
      };
    }
  }

  if (!parsed.users || !parsed.runs) {
    const missingUsers = !parsed.users;
    const missingRuns = !parsed.runs;

    return {
      kind: "proposal_reply",
      shouldCreateRun: false,
      content: buildProposalUsagePromptReply({ missingUsers, missingRuns }),
      launcherRouteIntent: "proposal",
      presentationRouteIntent: "proposal",
      eiahMode: params.eiahMode ?? "proposal",
      renderVariant: "proposal",
      proposalDomain: "saas",
      conversationStage: "proposal_collecting_usage",
      proposalContextRecovered: proposalState?.contextRecovered ?? false,
      proposalContextLost: proposalState?.contextLost ?? false,
      proposalDomainMismatch: proposalState?.domainMismatch ?? false,
    };
  }

  try {
    const quote = await apiGetBillingPricingQuote({ users: parsed.users, runs: parsed.runs });
    const eco = quote.data.options.economica.recommended;
    const eq = quote.data.options.equilibrio.recommended;
    const scale = quote.data.options.escala.recommended;
    const best = eq ?? eco ?? scale;
    if (!best) throw new Error("no-recommendation");

    return {
      kind: "proposal_reply",
      shouldCreateRun: false,
      content: buildProposalQuoteReply({
        users: parsed.users,
        runs: parsed.runs,
        recommendedLabel: best.label,
        recommendedCode: best.code,
        estimateTitle: "Estimativa de custo mensal",
        estimateLabel: `${centsToBrl(best.totalCents)} (formula oficial: ${quote.data.formula})`,
        economicOption: eco ? `${eco.label} — ${centsToBrl(eco.totalCents)}` : "sob consulta",
        balanceOption: eq ? `${eq.label} — ${centsToBrl(eq.totalCents)}` : "sob consulta",
        scaleOption: scale ? `${scale.label} — ${centsToBrl(scale.totalCents)}` : "Enterprise / sob consulta",
      }),
      launcherRouteIntent: "proposal",
      presentationRouteIntent: "proposal",
      eiahMode: params.eiahMode ?? "proposal",
      renderVariant: "proposal",
      proposalDomain: "saas",
      conversationStage: "proposal_recommended",
      proposalContextRecovered: proposalState?.contextRecovered ?? false,
      proposalContextLost: proposalState?.contextLost ?? false,
      proposalDomainMismatch: proposalState?.domainMismatch ?? false,
    };
  } catch {
    const users = parsed.users as number;
    const runs = parsed.runs as number;
    const localQuotes = PRICING_PLANS.map((plan) => quotePlan(plan, users, runs)).sort(
      (a, b) => a.totalCents - b.totalCents
    );
    const eco = localQuotes.find((item) => item.id === "solo" || item.id === "starter") ?? localQuotes[0];
    const eq = localQuotes.find((item) => item.id === "starter" || item.id === "growth") ?? localQuotes[1] ?? localQuotes[0];
    const scale = localQuotes.find((item) => item.id === "growth" || item.id === "scale") ?? localQuotes[2] ?? localQuotes[0];
    const best = eq ?? eco ?? scale;

    return {
      kind: "proposal_fallback_reply",
      shouldCreateRun: false,
      content: buildProposalQuoteReply({
        users: parsed.users,
        runs: parsed.runs,
        recommendedLabel: best.label,
        recommendedCode: best.id,
        estimateTitle: "Estimativa de custo mensal (fallback local)",
        estimateLabel: `${centsToBrl(best.totalCents)}`,
        economicOption: eco ? `${eco.label} — ${centsToBrl(eco.totalCents)}` : "sob consulta",
        balanceOption: eq ? `${eq.label} — ${centsToBrl(eq.totalCents)}` : "sob consulta",
        scaleOption: scale ? `${scale.label} — ${centsToBrl(scale.totalCents)}` : "Enterprise / sob consulta",
      }),
      launcherRouteIntent: "proposal",
      presentationRouteIntent: "proposal",
      eiahMode: params.eiahMode ?? "proposal",
      renderVariant: "proposal",
      proposalDomain: "saas",
      conversationStage: "proposal_recommended",
      proposalContextRecovered: proposalState?.contextRecovered ?? false,
      proposalContextLost: proposalState?.contextLost ?? false,
      proposalDomainMismatch: proposalState?.domainMismatch ?? false,
    };
  }
}

export async function resolveLauncherTurnDecision(params: {
  input: string;
  trimmedInput: string;
  routeIntent: LauncherRouteIntent;
  proposalMode: boolean;
  isUnifiedEiah: boolean;
  eiahMode: EiahMode | null;
  agentProfile: Agent | null;
  catalogAgents: Agent[];
  intentUnknown: boolean;
  confidence: number;
  previousUserMessage?: string | null;
  previousAssistantMessage?: string | null;
  previousAssistantSnapshot?: MessagePresentationSnapshot | null;
  accessContext?: LauncherAccessContext | null;
}): Promise<LauncherLocalDecision | null> {
  const agentSwitchDecision = resolveAgentSwitchDecision({
    input: params.input,
    previousAssistantSnapshot: params.previousAssistantSnapshot,
  });
  if (agentSwitchDecision) {
    return agentSwitchDecision;
  }
  const localDecision = resolveLauncherLocalDecision({
    input: params.input,
    routeIntent: params.routeIntent,
    proposalMode: params.proposalMode,
    isUnifiedEiah: params.isUnifiedEiah,
    eiahMode: params.eiahMode,
    agentProfile: params.agentProfile,
    catalogAgents: params.catalogAgents,
    intentUnknown: params.intentUnknown,
    accessContext: params.accessContext,
  });
  if (localDecision && !localDecision.shouldCreateRun && localDecision.content) {
    return localDecision;
  }

  const clarificationPrompt = buildLauncherClarificationPrompt({
    agentProfile: params.agentProfile,
    routeIntent: params.routeIntent,
    trimmedInput: params.trimmedInput,
    confidence: params.confidence,
  });
  if (clarificationPrompt) {
    return {
      kind: "clarification",
      shouldCreateRun: false,
      content: clarificationPrompt,
      launcherRouteIntent: params.routeIntent,
      presentationRouteIntent: params.routeIntent === "help" ? "help" : params.routeIntent,
      eiahMode:
        params.eiahMode ?? (params.routeIntent === "proposal" ? "proposal" : params.routeIntent === "orchestrator" ? "orchestrator" : "help"),
      renderVariant: "guided_flow",
    };
  }

  const proposalDecision = await resolveLauncherProposalDecision({
    input: params.input,
    routeIntent: params.routeIntent,
    proposalMode: params.proposalMode,
    eiahMode: params.eiahMode,
    agentProfile: params.agentProfile,
    previousUserMessage: params.previousUserMessage,
    previousAssistantMessage: params.previousAssistantMessage,
    previousAssistantSnapshot: params.previousAssistantSnapshot,
  });
  if (proposalDecision?.content) {
    return proposalDecision;
  }

  return null;
}

function buildOptimizedPrompt(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  return [
    "Contexto: usuário precisa de uma resposta clara e acionável.",
    "Instruções: responda com estrutura, destaque próximos passos e evite jargão.",
    `Pedido: ${cleaned}`,
  ].join("\n");
}

function buildProposalAssistantPrompt(input: string, planHint?: string | null) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  const normalizedPlanHint = planHint?.trim() ? planHint.trim() : "não informado";
  return [
    "Contexto: atendimento comercial do agente EIAH para solicitação de proposta.",
    "Objetivo: recomendar plano e responder perguntas de forma consultiva.",
    "Regras:",
    "- Responder em portugues claro, sem jargao desnecessario.",
    "- Sempre entregar: Resumo do cenario, Plano recomendado, 3 opcoes (economica, equilibrio, escala), Formula de preco, Proximos passos.",
    "- Se faltarem dados (usuarios/runs), perguntar no maximo 2 perguntas objetivas.",
    "- Quando houver dados, calcular usando: total = base + max(0,runs-includedRuns)*overageRun + max(0,users-includedUsers)*extraUser.",
    `Plano sugerido no fluxo de entrada: ${normalizedPlanHint}.`,
    `Pergunta do cliente: ${cleaned}`,
  ].join("\n");
}

function buildHelpAssistantPrompt(input: string, hits: EiahHelpQueryHit[]) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  const knowledge =
    hits.length > 0
      ? hits
          .map(
            (hit, index) =>
              `[${index + 1}] ${hit.title} (${hit.sourcePath})\nTrecho: ${hit.snippet}`
          )
          .join("\n\n")
      : "Nenhum trecho relevante foi encontrado na base interna do EIAH.";

  return [
    "Contexto: voce e o EIAH em modo help.",
    "Objetivo: responder com base na documentacao oficial interna da plataforma EIAH.",
    "Regras:",
    "- Use os trechos documentais abaixo como fonte primaria.",
    "- Nao invente endpoints ou funcionalidades nao documentadas.",
    "- Se faltar informacao, diga explicitamente o que nao esta documentado.",
    "- Estruture em: Resumo, Como fazer, Limites/observacoes, Proximo passo.",
    "- So cite a base usada quando isso realmente ajudar o usuario.",
    `Pergunta do solicitante: ${cleaned}`,
    "Base interna consultada:",
    knowledge,
  ].join("\n");
}

export function buildConversationPersistencePolicy(params: {
  agentProfile: Agent | null;
  routeIntent: LauncherRouteIntent;
  requiresConfirmation: boolean;
  proposalMode: boolean;
}): ConversationPersistencePolicyInput {
  const triggers = new Set<ConversationPersistenceTrigger>([
    "delegation",
    "final_summary",
    "provenance_required",
  ]);

  if (params.requiresConfirmation) {
    triggers.add("approval_required");
    triggers.add("user_confirmed");
  }

  if (
    params.proposalMode ||
    params.routeIntent === "orchestrator" ||
    params.agentProfile?.knowledgePolicy?.llmUsageMode === "disallowed_for_critical_execution"
  ) {
    triggers.add("critical_execution");
  }

  return {
    mode: "ephemeral",
    ttlMinutes: params.routeIntent === "help" || params.routeIntent === "playbook" ? 60 : 180,
    promoteOn: [...triggers],
    persistSummary: true,
    persistShortTermMemory: false,
  };
}

export async function prepareLauncherRunExecution(params: {
  turnInput: string;
  effectiveInput: string;
  routeIntent: LauncherRouteIntent;
  eiahMode: EiahMode | null;
  isEiahHelpCenter: boolean;
  agentProfile: Agent | null;
  requiresConfirmation: boolean;
  planHint?: string | null;
  agentFallback: boolean;
}) {
  let helpHits: EiahHelpQueryHit[] = [];
  if (params.isEiahHelpCenter) {
    try {
      const knowledge = await apiQueryEiahHelp({ query: params.effectiveInput, topK: 6 });
      helpHits = knowledge.data.hits ?? [];
    } catch {
      helpHits = [];
    }
  }

  const prompt =
    params.eiahMode === "proposal"
      ? buildProposalAssistantPrompt(params.turnInput, params.planHint)
      : params.isEiahHelpCenter
      ? buildHelpAssistantPrompt(params.turnInput, helpHits)
      : buildOptimizedPrompt(params.turnInput);

  const conversationPersistence = buildConversationPersistencePolicy({
    agentProfile: params.agentProfile,
    routeIntent: params.routeIntent,
    requiresConfirmation: params.requiresConfirmation,
    proposalMode: params.eiahMode === "proposal",
  });

  return {
    helpHits,
    prompt,
    metadata: {
      source: "chat-agent-launcher",
      promptOptimized: params.eiahMode === "orchestrator",
      proposalMode: params.eiahMode === "proposal",
      eiahMode: params.eiahMode,
      conversationPersistence,
      requiresConfirmation: params.requiresConfirmation,
      provenancePolicy: params.agentProfile?.knowledgePolicy?.provenancePolicy ?? "none",
      proposalPlanHint: params.planHint ?? null,
      helpKnowledgeHits: helpHits.map((hit) => ({
        title: hit.title,
        sourcePath: hit.sourcePath,
        score: hit.score,
      })),
      originalPrompt: params.turnInput,
      agentFallback: params.agentFallback,
    },
    conversationPersistence,
  };
}

export function buildLauncherClarificationPrompt(params: {
  agentProfile: Agent | null;
  routeIntent: LauncherRouteIntent;
  trimmedInput: string;
  confidence: number;
}) {
  if (isAgentPresentationQuestion(params.trimmedInput)) return null;
  if (isEiahCapabilitiesQuestion(params.trimmedInput)) return null;
  if (isLegalRoutingQuestion(params.trimmedInput)) return null;
  if (
    (params.routeIntent === "help" || params.routeIntent === "playbook" || params.routeIntent === "imob") &&
    isDirectAnswerFriendlyQuestion(params.trimmedInput)
  ) {
    return null;
  }
  const clarificationPolicy = params.agentProfile?.uxContract?.clarificationPolicy ?? "minimal";
  const ambiguityStrategy = params.agentProfile?.cognitiveProfile?.ambiguityStrategy ?? "infer_conservatively";
  if (params.confidence >= 0.6 && ambiguityStrategy !== "ask_first") return null;
  if ((params.routeIntent === "help" || params.routeIntent === "playbook" || params.routeIntent === "imob") && params.confidence >= 0.45) return null;
  if (clarificationPolicy === "minimal" && ambiguityStrategy !== "ask_first") return null;

  const defaultCta = params.agentProfile?.uxContract?.defaultCTA?.trim();
  const ctaLine = defaultCta ? `\n\n**Próximo passo**\n${defaultCta}` : "";
  if (params.routeIntent === "proposal") {
    return [
      "**Preciso de uma clarificação rápida**",
      "Para evitar estimativa errada, confirme apenas o mínimo necessário:",
      "",
      "- Quantos usuários terão acesso?",
      "- Quantos runs/mês você estima?",
      ctaLine,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (clarificationPolicy === "strict") {
    return [
      "**Preciso de uma clarificação antes de avançar**",
      `Seu pedido foi: "${params.trimmedInput}".`,
      "",
      "Responda em uma frase dizendo:",
      "- objetivo principal",
      "- contexto ou página envolvida",
      "- resultado esperado",
      ctaLine,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "**Quero confirmar o foco da resposta**",
    "Escolha uma direção para eu responder com mais precisão:",
    "",
    "- explicar rapidamente",
    "- montar próximos passos",
    "- avaliar risco ou decisão",
    ctaLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function isRelatedToEiahTopic(input: string) {
  const normalized = normalizeIntentText(input);
  const productTerms = [
    "runs",
    "run",
    "agentes",
    "agente",
    "billing",
    "invoice",
    "imob",
    "marketplace",
    "perfil",
    "self-service",
    "site",
    "plataforma",
    "eiah",
  ];
  const proposalTerms = [
    "plano",
    "preco",
    "preço",
    "usuarios",
    "usuários",
    "runs/mes",
    "runs/mês",
    "trial",
    "demonstracao",
    "demonstração",
    "proposta",
  ];
  const usageTerms = ["como", "onde", "status", "simular", "rodar", "exemplo", "riscos", "proximos passos"];
  return [...productTerms, ...proposalTerms, ...usageTerms].some((term) => normalized.includes(term));
}

function buildChatRuntimeBlockedReply(agentProfile: Agent | null) {
  const blockedMessage = agentProfile?.chatCopy?.blockedMessages?.genericBlocked?.trim();
  if (blockedMessage) {
    return blockedMessage;
  }

  const displayName = getAgentDisplayName(agentProfile);
  const missingFields = agentProfile?.chatRuntime?.missingFields ?? [];
  const missingBlock =
    missingFields.length > 0 ? `\n\nCampos pendentes: ${missingFields.slice(0, 4).join(", ")}.` : "";

  return `O agente ${displayName} ainda nao esta habilitado para conversa neste workspace.${missingBlock}\n\nUse um agente com contrato de chat completo ou conclua o onboarding antes de habilitar este fluxo.`;
}

export function resolveEiahDecision(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
  eiahMode: EiahMode;
  agentProfile: Agent | null;
  catalogAgents: Agent[];
  intentUnknown: boolean;
  accessContext?: LauncherAccessContext | null;
  conversationState?: ConversationState | null;
}): EiahDecision {
  const input = params.input.trim();
  const journey = resolveEiahJourneyContract({
    agentProfile: params.agentProfile,
    accessContext: params.accessContext,
  });
  if (params.eiahMode === "proposal" || params.routeIntent === "proposal") {
    return {
      kind: "needs_run",
      shouldCreateRun: true,
      launcherRouteIntent: params.routeIntent,
      presentationRouteIntent: params.routeIntent,
      eiahMode: params.eiahMode,
      renderVariant: "proposal",
    };
  }

  const priorityHelpDecision = resolveEiahPriorityHelpDecision({
    input,
    routeIntent: params.routeIntent,
    accessContext: params.accessContext,
  });
  if (priorityHelpDecision) {
    return priorityHelpDecision;
  }

  if (journey && (isJourneyEntryQuestion(input) || isPlatformSelfExplainQuestion(input))) {
    return {
      kind: "initial_journey",
      shouldCreateRun: false,
      content: buildEiahJourneyReply(journey),
      resolvedQuickReplies: filterResolvedEiahQuickReplies(journey.initialQuickReplies, params.accessContext),
      journeyContext: {
        frontDoorLabel: journey.frontDoorLabel,
        firstStepLabel: journey.firstStepLabel,
      },
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "guided_flow",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.84 },
    };
  }

  if (isPlatformSelfExplainQuestion(input)) {
    return {
      kind: "platform_self_explain",
      shouldCreateRun: false,
      content: buildPlatformSelfExplainReply(params.agentProfile),
      launcherRouteIntent: "help",
      presentationRouteIntent: "self_intro",
      eiahMode: "help",
      renderVariant: "self_intro",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.82 },
    };
  }

  if (isAgentSignupHelpQuestion(input)) {
    return {
      kind: "agent_signup_help",
      shouldCreateRun: false,
      content: buildAgentSignupHelpReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isDocumentationExplainQuestion(input)) {
    return {
      kind: "documentation_explain",
      shouldCreateRun: false,
      content: buildDocumentationExplainReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isInternalTechnicalAccessQuestion(input)) {
    return {
      kind: "internal_technical_access",
      shouldCreateRun: false,
      content: buildInternalTechnicalAccessReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.84 },
    };
  }

  if (isHostileInput(input)) {
    return {
      kind: "hostile_input",
      shouldCreateRun: false,
      content: buildHostileInputReply(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "unknown", confidenceFloor: 0.78 },
    };
  }

  const specialistExplainTarget = resolveSpecialistExplainTarget(input);
  if (specialistExplainTarget) {
    const specialistAvailability = resolveSpecialistAvailability(params.catalogAgents, specialistExplainTarget.hints);
    return {
      kind: "agent_explain",
      shouldCreateRun: false,
      content: buildSpecialistExplainReply({
        definition: specialistExplainTarget,
        agent: specialistAvailability.agent,
        canReceiveHandoff: specialistAvailability.canReceiveHandoff,
      }),
      launcherRouteIntent: "help",
      presentationRouteIntent: "capabilities_summary",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isLegalDataCollectionQuestion(input)) {
    return {
      kind: "legal_data_collection",
      shouldCreateRun: false,
      content: buildLegalDataCollectionReply(input),
      launcherRouteIntent: "help",
      presentationRouteIntent: "legal_handoff",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "agent_execute", confidenceFloor: 0.74 },
    };
  }

  if (isLegalRoutingQuestion(input)) {
    const legal = resolveSpecialistAvailability(params.catalogAgents, ["j360", "j_360", "juridico", "jurídico"]);
    return {
      kind: "legal_context_entry",
      shouldCreateRun: false,
      content: buildLegalContextEntryReply({ legalAgent: legal.agent, isAvailable: legal.canReceiveHandoff, input }),
      launcherRouteIntent: "help",
      presentationRouteIntent: "legal_handoff",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.74 },
    };
  }

  if (isEiahCapabilitiesQuestion(input)) {
    const content = input.includes("qual agente") || input.includes("especialista")
      ? buildSuggestedAgentReply(params.catalogAgents, {
          canSuggestAgent,
          normalizeAgentKey,
        })
      : buildEiahCapabilitiesSummary(params.agentProfile);
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content,
      launcherRouteIntent: "help",
      presentationRouteIntent: "capabilities_summary",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
    };
  }

  if (isFlowGuidanceQuestion(input)) {
    return {
      kind: "orchestrator_guidance",
      shouldCreateRun: false,
      content: buildOrchestratorGuidanceReply(),
      launcherRouteIntent: "orchestrator",
      presentationRouteIntent: "orchestrator",
      eiahMode: "orchestrator",
      renderVariant: "guided_flow",
      persistIntent: { intent: "agent_execute", confidenceFloor: 0.76 },
    };
  }

  if (isAgentPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: buildDeterministicAgentOverviewReply(params.agentProfile) ?? buildContextualFallback(),
      launcherRouteIntent: "help",
      presentationRouteIntent: "self_intro",
      eiahMode: "help",
      renderVariant: "self_intro",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.78 },
    };
  }

  if (params.routeIntent === "playbook") {
    return {
      kind: "playbook_reply",
      shouldCreateRun: false,
      content: buildDeterministicPlaybookReply(),
      launcherRouteIntent: "playbook",
      presentationRouteIntent: "playbook",
      eiahMode: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.routeIntent === "help") {
    const directHelp = buildDeterministicHelpReply(input);
    if (directHelp) {
      return {
        kind: "help_reply",
        shouldCreateRun: false,
        content: directHelp,
        conversationState: buildHelpConversationState({
          intent: {
            intentId: "deterministic_help",
            confidence: 0.78,
            scopeHint: "global",
          },
          responseType: "resolved",
          content: directHelp,
          quickReplies: [],
        }),
        launcherRouteIntent: "help",
        presentationRouteIntent: "help",
        eiahMode: "help",
        renderVariant: "simple_help",
      };
    }

    if (params.intentUnknown || !isRelatedToEiahTopic(input)) {
      return {
        kind: "contextual_fallback",
        shouldCreateRun: false,
        content: buildContextualFallback(),
        conversationState: buildHelpConversationState({
          intent: {
            intentId: null,
            confidence: 0.6,
            scopeHint: "global",
          },
          responseType: "not_found",
          content: buildContextualFallback(),
          quickReplies: [],
        }),
        launcherRouteIntent: "help",
        presentationRouteIntent: "help",
        eiahMode: "help",
        renderVariant: "simple_help",
        persistIntent: { intent: "unknown" },
      };
    }
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content: buildContextualFallback(),
      conversationState: buildHelpConversationState({
        intent: {
          intentId: null,
          confidence: 0.6,
          scopeHint: "global",
        },
        responseType: "not_found",
        content: buildContextualFallback(),
        quickReplies: [],
      }),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "unknown" },
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    launcherRouteIntent: params.routeIntent,
    presentationRouteIntent: params.routeIntent,
    eiahMode: params.eiahMode,
    renderVariant: params.routeIntent === "orchestrator" ? "guided_flow" : "simple_help",
  };
}

export function resolveLauncherLocalDecision(params: {
  input: string;
  routeIntent: LauncherRouteIntent;
  proposalMode: boolean;
  isUnifiedEiah: boolean;
  eiahMode: EiahMode | null;
  agentProfile: Agent | null;
  catalogAgents: Agent[];
  intentUnknown: boolean;
  accessContext?: LauncherAccessContext | null;
}): LauncherLocalDecision | null {
  if (params.agentProfile?.chatRuntime?.chatEnabled === false) {
    return {
      kind: "chat_runtime_blocked",
      shouldCreateRun: false,
      content: buildChatRuntimeBlockedReply(params.agentProfile),
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "unknown", confidenceFloor: 1 },
    };
  }

  if (params.isUnifiedEiah) {
    return resolveEiahDecision({
      input: params.input,
      routeIntent: params.routeIntent,
      eiahMode: params.eiahMode ?? "help",
      agentProfile: params.agentProfile,
      catalogAgents: params.catalogAgents,
      intentUnknown: params.intentUnknown,
      accessContext: params.accessContext,
    });
  }

  if (isPlatformUiExplainQuestion(params.input)) {
    return {
      kind: "platform_ui_redirect",
      shouldCreateRun: false,
      content: buildPlatformSwitchOfferReply(),
      resolvedQuickReplies: ["Sim", "Não"],
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.84 },
      agentSwitchRequest: {
        targetAgentId: "EIAH",
        replayInput: params.input.trim(),
        trigger: "affirmative",
      },
    };
  }

  const normalizedId = normalizeAgentKey(params.agentProfile?.id ?? "");
  const normalizedName = normalizeIntentText(params.agentProfile?.name ?? "");

  if (normalizedId === "j360" || normalizedName.includes("juridico")) {
    return {
      ...resolveJuridicoDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }, {
        isPresentationQuestion,
        buildDeterministicAgentOverviewReply,
        buildAgentCapabilitiesReply,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (normalizedId.replace(/-/g, "") === "finnexus" || normalizedName.includes("finnexus")) {
    return {
      ...resolveFinNexusDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }, {
        isPresentationQuestion,
        buildDeterministicAgentOverviewReply,
        buildAgentCapabilitiesReply,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (normalizedId === "guardian" || normalizedName.includes("guardian")) {
    return {
      ...resolveGuardianDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }, {
        isPresentationQuestion,
        buildDeterministicAgentOverviewReply,
        buildAgentCapabilitiesReply,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (normalizedId === "aadv" || normalizedName.includes("aadv")) {
    return {
      ...resolveAadvDecision({
        input: params.input,
        agentProfile: params.agentProfile,
        intentUnknown: params.intentUnknown,
      }, {
        isPresentationQuestion,
        buildDeterministicAgentOverviewReply,
        buildAgentCapabilitiesReply,
      }),
      launcherRouteIntent: "help",
    };
  }

  if (isAgentPresentationQuestion(params.input)) {
    const overviewReply = buildAgentOverviewReply(params.agentProfile);
    if (overviewReply) {
      return {
        kind: "self_intro",
        shouldCreateRun: false,
        content: overviewReply,
        launcherRouteIntent: "help",
        presentationRouteIntent: "self_intro",
        renderVariant: "self_intro",
      };
    }
  }

  return null;
}
