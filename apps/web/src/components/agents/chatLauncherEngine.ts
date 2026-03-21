import {
  apiGetBillingPricingQuote,
  apiQueryEiahHelp,
  type Agent,
  type EiahHelpQueryHit,
} from "@/lib/api";
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
  buildPlatformSelfExplainReply,
  isAgentSignupHelpQuestion,
  isDocumentationExplainQuestion,
  isFlowGuidanceQuestion,
  isHostileInput,
  isInternalTechnicalAccessQuestion,
  isPlatformSelfExplainQuestion,
} from "@/components/agents/platformHelpResolver";
import {
  buildDeterministicImobReply,
  buildImobContextEntryReply,
  buildImobKnowledgeAccessBlockedReply,
  buildImobKnowledgeSearchEntryReply,
  buildImobKnowledgeSearchQuickReplies,
  buildImobQuickRepliesForInput,
  isImobGuideQuestion,
  resolveImobKnowledgeSearchIntent,
  resolveImobFaqSeed,
  resolveImobHelpIntent,
  resolveImobJourneyStage,
  resolveImobShortcutSelection,
  type ImobFaqSeed,
  type ImobJourneyStage,
} from "@/components/agents/imobContextResolver";
import {
  buildLegalContextEntryReply,
  buildLegalDataCollectionReply,
  buildLegalHandoffReply,
  buildLegalQuickRepliesForInput,
  isLegalDataCollectionQuestion,
  resolveLegalJourneyStage,
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
  buildImobQuickRepliesForInput,
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
export type EiahDecisionKind =
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
};

export type LauncherAccessContext = {
  tenantId?: string | null;
  workspaceId?: string | null;
  entitlements?: {
    REAL_ESTATE_CORE?: boolean;
    IMOB_INSTALLED?: boolean;
  } | null;
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
    ? "Colar verify_url"
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
      "Não consegui validar isso com segurança porque faltam evidências obrigatórias, como receipt, verify_url ou trilha de integridade.";
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
  if (resolveImobKnowledgeSearchIntent(input)) {
    return { vertical: "IMOB" };
  }
  const faq = resolveImobFaqSeed(input);
  if (faq) {
    return { vertical: "IMOB", stage: faq.journeyStage ?? undefined, faq };
  }
  const stage = resolveImobJourneyStage(input);
  if (stage) {
    return { vertical: "IMOB", stage: stage.stage };
  }
  const legalStage = resolveLegalJourneyStage(input);
  if (legalStage) {
    return { vertical: "LEGAL", stage: legalStage.stage };
  }
  return null;
}

function resolveVerticalContext(input: string) {
  return resolveConversationVerticalContext(input);
}

function isImobContextEntryQuestion(input: string) {
  return resolveVerticalContext(input)?.vertical === "IMOB" || resolveImobKnowledgeSearchIntent(input) !== null;
}

function hasImobVerticalAccess(accessContext?: LauncherAccessContext | null) {
  if (!accessContext?.tenantId || !accessContext?.workspaceId) return false;
  return accessContext.entitlements?.REAL_ESTATE_CORE === true;
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

type LocalPlan = {
  code: "solo" | "starter" | "growth" | "scale";
  label: string;
  basePriceCents: number;
  includedUsers: number;
  includedRuns: number;
  overageRunCents: number;
  extraUserCents: number;
};

const LOCAL_PLANS: LocalPlan[] = [
  { code: "solo", label: "Solo", basePriceCents: 49000, includedUsers: 3, includedRuns: 1500, overageRunCents: 35, extraUserCents: 3900 },
  { code: "starter", label: "Starter", basePriceCents: 149000, includedUsers: 10, includedRuns: 5000, overageRunCents: 30, extraUserCents: 3900 },
  { code: "growth", label: "Growth", basePriceCents: 399000, includedUsers: 25, includedRuns: 25000, overageRunCents: 22, extraUserCents: 2900 },
  { code: "scale", label: "Scale", basePriceCents: 990000, includedUsers: 100, includedRuns: 100000, overageRunCents: 15, extraUserCents: 1900 },
];

function quoteLocalPlan(plan: LocalPlan, users: number, runs: number) {
  const runOverage = Math.max(0, runs - plan.includedRuns);
  const userOverage = Math.max(0, users - plan.includedUsers);
  const totalCents = plan.basePriceCents + runOverage * plan.overageRunCents + userOverage * plan.extraUserCents;
  return { ...plan, totalCents };
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
  if (isImobGuideQuestion(input) || isImobContextEntryQuestion(input)) return "imob";
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
    if (params.proposalDomain === "imob") {
      return buildImobQuickRepliesForInput(params.sourceInput ?? "");
    }

    return buildProposalQuickReplies({
      proposalDomain: params.proposalDomain ?? "saas",
      conversationStage: params.conversationStage,
    });
  }

  if (params.routeIntent === "orchestrator") {
    return [
      "Qual agente devo usar?",
      "Analise este fluxo e recomende o próximo passo.",
      "Quero auditar esse processo.",
    ];
  }

  if (params.routeIntent === "legal_handoff") {
    return [
      "Quero revisar um contrato.",
      "Quais dados preciso enviar?",
      "Quais riscos contratuais comuns?",
    ];
  }

  if (params.routeIntent === "imob") {
    if (params.sourceInput && resolveImobKnowledgeSearchIntent(params.sourceInput)) {
      return buildImobKnowledgeSearchQuickReplies();
    }
    return [
      "Como funciona IMOB do início ao fim?",
      "Onde acompanho pipeline e etapas no IMOB?",
      "Quero instalar o IMOB no workspace.",
    ];
  }

  return [
    "O que o EIAH pode fazer por mim?",
    "Como criar um run no EIAH?",
    "Como funciona o billing?",
  ];
}

export function buildInputPlaceholderForContext(params: {
  routeIntent: LauncherRouteIntent | "legal_handoff";
  input?: string | null;
}) {
  const resolvedVerticalContext = params.input ? resolveConversationVerticalContext(params.input) : null;

  if (resolvedVerticalContext?.vertical === "LEGAL") {
    switch (resolvedVerticalContext.stage) {
      case "contract_review":
        return "Ex.: quero revisar contrato de locação com foco em multa e rescisão";
      case "clause_review":
        return "Ex.: quero analisar a cláusula de responsabilidade deste contrato";
      case "legal_risk":
        return "Ex.: quero entender os principais riscos jurídicos deste documento";
      case "document_intake":
        return "Ex.: tenho só uma cláusula e quero saber o que falta para analisar";
      case "real_estate_legal":
        return "Ex.: quero revisar matrícula, posse e cláusulas de contrato imobiliário";
      default:
        return "Ex.: quero revisar um contrato e entender o ponto de risco principal";
    }
  }

  if (params.routeIntent === "imob") {
    const stage = params.input ? resolveImobJourneyStage(params.input) : null;
    switch (stage?.stage) {
      case "compra":
        return "Ex.: estou na etapa de proposta para compra de apartamento";
      case "venda":
        return "Ex.: recebi proposta para venda de casa e quero organizar os próximos passos";
      case "locacao":
        return "Ex.: quero anunciar locação de apartamento e entender a garantia";
      case "captacao":
        return "Ex.: estou em captação para venda de imóvel residencial";
      case "leilao":
        return "Ex.: quero analisar edital de imóvel em leilão";
      default:
        return "Ex.: estou na etapa de proposta para venda de apartamento";
    }
  }

  if (params.routeIntent === "legal_handoff") {
    const stage = params.input ? resolveLegalJourneyStage(params.input) : null;
    switch (stage?.stage) {
      case "contract_review":
        return "Ex.: quero revisar contrato de locação com foco em multa e rescisão";
      case "clause_review":
        return "Ex.: quero analisar a cláusula de responsabilidade deste contrato";
      case "legal_risk":
        return "Ex.: quero entender os principais riscos jurídicos deste documento";
      case "document_intake":
        return "Ex.: tenho só uma cláusula e quero saber o que falta para analisar";
      case "real_estate_legal":
        return "Ex.: quero revisar matrícula, posse e cláusulas de contrato imobiliário";
      default:
        return "Ex.: quero revisar contrato de locação com foco em multa e rescisão";
    }
  }

  return "Descreva o objetivo, contexto e restricoes...";
}

export function buildQuickRepliesForContext(params: {
  agentProfile: Agent | null;
  routeIntent: LauncherRouteIntent | "legal_handoff";
  isHelpCenterMode: boolean;
  proposalMode: boolean;
  sourceInput?: string | null;
  proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
  conversationStage?: MessagePresentationSnapshot["conversationStage"];
}) {
  const copyReplies =
    params.agentProfile?.chatCopy?.quickReplies?.filter((value): value is string => Boolean(value && value.trim())) ?? [];
  const resolvedVerticalContext =
    params.proposalDomain === "saas" ? null : params.sourceInput ? resolveConversationVerticalContext(params.sourceInput) : null;
  const imobReplies =
    resolvedVerticalContext?.vertical === "IMOB" && params.sourceInput
      ? buildImobQuickRepliesForInput(params.sourceInput)
      : [];
  const legalReplies =
    resolvedVerticalContext?.vertical === "LEGAL" && params.sourceInput
      ? buildLegalQuickRepliesForInput(params.sourceInput)
      : [];

  if (params.isHelpCenterMode) {
    const engineReplies = buildEiahQuickReplies({
      routeIntent: params.routeIntent,
      proposalMode: params.proposalMode,
      sourceInput: params.sourceInput,
      proposalDomain: params.proposalDomain,
      conversationStage: params.conversationStage,
    });
    return [...copyReplies, ...imobReplies, ...legalReplies, ...engineReplies]
      .filter((value): value is string => Boolean(value && value.trim()))
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 3);
  }

  const specialistReplies = isLegalSpecialistAgent(params.agentProfile) ? legalReplies : [];
  return [...specialistReplies, ...copyReplies]
    .filter((value): value is string => Boolean(value && value.trim()))
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 3);
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
  };
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
    const localQuotes = LOCAL_PLANS.map((plan) => quoteLocalPlan(plan, users, runs)).sort(
      (a, b) => a.totalCents - b.totalCents
    );
    const eco = localQuotes.find((item) => item.code === "solo" || item.code === "starter") ?? localQuotes[0];
    const eq = localQuotes.find((item) => item.code === "starter" || item.code === "growth") ?? localQuotes[1] ?? localQuotes[0];
    const scale = localQuotes.find((item) => item.code === "growth" || item.code === "scale") ?? localQuotes[2] ?? localQuotes[0];
    const best = eq ?? eco ?? scale;

    return {
      kind: "proposal_fallback_reply",
      shouldCreateRun: false,
      content: buildProposalQuoteReply({
        users: parsed.users,
        runs: parsed.runs,
        recommendedLabel: best.label,
        recommendedCode: best.code,
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

export function isLegalRoutingQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "contrato",
    "clausula",
    "parecer",
    "juridico",
    "termo aditivo",
    "minuta",
    "aluguel",
    "aluguem",
    "locacao",
    "locaçao",
    "locacacao",
    "venda",
    "imovel",
    "imoveis",
    "imobiliario",
    "sala comercial",
  ];
  const tokenHits = patterns.filter((pattern) => normalized.includes(pattern)).length;
  if (tokenHits > 0) return true;
  const hasContractLike = normalized.includes("contrat");
  const hasRentOrSaleLike =
    normalized.includes("alugu") ||
    normalized.includes("loca") ||
    normalized.includes("vend") ||
    normalized.includes("imov") ||
    normalized.includes("sala comerc");
  return hasContractLike && hasRentOrSaleLike;
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
}): EiahDecision {
  const input = params.input.trim();
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

  const imobKnowledgeSearchIntent = resolveImobKnowledgeSearchIntent(input);
  if (imobKnowledgeSearchIntent) {
    if (!hasImobVerticalAccess(params.accessContext)) {
      return {
        kind: "help_reply",
        shouldCreateRun: false,
        content: buildImobKnowledgeAccessBlockedReply(),
        launcherRouteIntent: "help",
        presentationRouteIntent: "help",
        eiahMode: "help",
        renderVariant: "simple_help",
        persistIntent: { intent: "product_explain", confidenceFloor: 0.86 },
      };
    }

    return {
      kind: "imob_context_entry",
      shouldCreateRun: false,
      content: buildImobKnowledgeSearchEntryReply(input),
      launcherRouteIntent: "imob",
      presentationRouteIntent: "imob",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.84 },
    };
  }

  if (isImobContextEntryQuestion(input)) {
    return {
      kind: "imob_context_entry",
      shouldCreateRun: false,
      content: buildImobContextEntryReply(input),
      launcherRouteIntent: "imob",
      presentationRouteIntent: "imob",
      eiahMode: "help",
      renderVariant: "simple_help",
      persistIntent: { intent: "product_explain", confidenceFloor: 0.8 },
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

  if (params.routeIntent === "imob") {
    return {
      kind: "imob_reply",
      shouldCreateRun: false,
      content: buildDeterministicImobReply(input),
      launcherRouteIntent: "imob",
      presentationRouteIntent: "imob",
      eiahMode: "help",
      renderVariant: "simple_help",
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
