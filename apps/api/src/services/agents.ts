import { Prisma, PrismaClient, prismaGlobal } from "@repo/db";
import { listRegisteredActions } from "@eiah/core";
import {
  aadvProfile,
  defiOneProfile,
  diariasProfile,
  eiahProfile,
  finNexusProfile,
  flowOrchestratorProfile,
  guardianProfile,
  iBcProfile,
  imageNftDiariasProfile,
  j360Profile,
  marketingProfile,
  nftPyProfile,
  onchainMonitorProfile,
  pitchProfileThinking,
  riskAnalyzerProfile,
} from "@eiah/core";

/**
 * Estrutura de listagem de agentes com pricing e perfil.
 */
export type AgentListing = {
  id: string;
  name: string;
  description: string | null;
  pricing?: {
    perRunCents: number;
    perMBcents: number;
  };
  profile?: {
    model: string;
    systemPrompt: string;
    tools: unknown;
  };
  knowledgePolicy?: {
    deterministicSources: Array<{
      sourceId: string;
      kind: "db" | "ledger" | "event_store" | "document_index" | "api" | "snapshot";
      authorityLevel: "primary" | "secondary" | "advisory";
      required: boolean;
      version: string;
    }>;
    sourcePrecedence: string[];
    conflictResolution: "fail_closed" | "use_primary" | "human_review";
    llmUsageMode:
      | "none"
      | "format_only"
      | "grounded_reasoning"
      | "open_reasoning_restricted"
      | "disallowed_for_critical_execution";
    fallbackPolicy: "block" | "approved_snapshot" | "human_review";
    provenancePolicy: "required" | "recommended" | "none";
    maskingPolicy: "required" | "conditional" | "none";
  };
  governance?: {
    modelPolicy: string;
    toolCapabilities: string[];
    criticality: "low" | "medium" | "high" | "critical";
    approval: string;
    receiptPolicy: string;
    requiredScopes: string[];
  };
  cognitiveProfile?: {
    reasoningMode:
      | "synthesis"
      | "diagnostic"
      | "orchestration"
      | "simulation"
      | "monitoring"
      | "critique"
      | "compliance";
    initiativeLevel: "low" | "medium" | "high";
    ambiguityStrategy: "ask_first" | "infer_conservatively" | "route_to_core";
    confidenceBehavior: "explicit" | "implicit" | "gated";
    memoryStyle: "session_only" | "contextual" | "evidence_anchored";
    decisionPosture: "advisory" | "constrained_action" | "execution_guarded";
    delegationPolicy: "never" | "optional" | "preferred" | "mandatory_for_sensitive";
  };
  uxContract?: {
    primaryUserValue: string;
    responseShape:
      | "brief_answer"
      | "executive_summary"
      | "step_plan"
      | "options_matrix"
      | "risk_brief"
      | "alert_card"
      | "evidence_pack";
    toneProfile: "executive" | "operational" | "analytical" | "commercial" | "supportive";
    interactionPattern: "single_turn" | "guided_flow" | "review_loop" | "monitoring_loop";
    defaultCTA: string;
    maxCognitiveLoad: "low" | "medium" | "high";
    clarificationPolicy: "minimal" | "targeted" | "strict";
    progressExposure: "none" | "light" | "structured";
    trustSignals: string[];
  };
  chatCopy?: {
    whoIAm: string;
    whatIDo: string[];
    whenToUseMe: string[];
    whatINotDo?: string[];
    exampleRequests: string[];
    quickReplies?: string[];
    defaultNextStep?: string;
    blockedMessages?: {
      genericBlocked?: string;
      missingContext?: string;
      missingRequiredSource?: string;
    };
  };
  attachmentContract?: {
    acceptsAttachments: boolean;
    acceptedAttachmentKinds: string[];
    acceptedMimeTypes?: string[];
    intakeModes: Array<"upload_file" | "paste_text" | "structured_form">;
    analysisModes: Array<
      | "full_review"
      | "partial_review"
      | "clause_review"
      | "risk_scan"
      | "missing_fields"
      | "evidence_validation"
      | "financial_check"
    >;
    defaultAnalysisMode?:
      | "full_review"
      | "partial_review"
      | "clause_review"
      | "risk_scan"
      | "missing_fields"
      | "evidence_validation"
      | "financial_check";
    requiredMetadata?: string[];
    initialPrompts?: string[];
    uploadHelpText?: string;
  };
  participation?: {
    agentId: string;
    status: "active" | "restricted" | "experimental" | "future" | "deprecated";
    visibility: "visible" | "hidden" | "internal_only";
    canBeSuggested: boolean;
    canReceiveHandoff: boolean;
    requiresEntitlement: boolean;
    requiredModules?: string[];
    requiredWorkspaceCapabilities?: string[];
  };
  modeContracts?: Array<{
    mode: "help" | "orchestrator" | "proposal";
    label: string;
    description: string;
    knowledgePolicy?: {
      deterministicSources: Array<{
        sourceId: string;
        kind: "db" | "ledger" | "event_store" | "document_index" | "api" | "snapshot";
        authorityLevel: "primary" | "secondary" | "advisory";
        required: boolean;
        version: string;
      }>;
      sourcePrecedence: string[];
      conflictResolution: "fail_closed" | "use_primary" | "human_review";
      llmUsageMode:
        | "none"
        | "format_only"
        | "grounded_reasoning"
        | "open_reasoning_restricted"
        | "disallowed_for_critical_execution";
      fallbackPolicy: "block" | "approved_snapshot" | "human_review";
      provenancePolicy: "required" | "recommended" | "none";
      maskingPolicy: "required" | "conditional" | "none";
    };
    cognitiveProfile?: AgentCognitiveSnapshot;
    uxContract?: AgentUXSnapshot;
    chatCopy?: AgentListing["chatCopy"];
  }>;
};

type AgentGovernanceSnapshot = NonNullable<AgentListing["governance"]>;
type AgentKnowledgeSnapshot = NonNullable<AgentListing["knowledgePolicy"]>;
type AgentCognitiveSnapshot = NonNullable<AgentListing["cognitiveProfile"]>;
type AgentUXSnapshot = NonNullable<AgentListing["uxContract"]>;
type AgentChatCopySnapshot = NonNullable<AgentListing["chatCopy"]>;
type AgentAttachmentContractSnapshot = NonNullable<AgentListing["attachmentContract"]>;
type AgentParticipationSnapshot = NonNullable<AgentListing["participation"]>;

type CoreAgentProfile = {
  agent: string;
  name: string;
  description?: string;
  model: string;
  models?: Record<string, unknown>;
  systemPrompt: string;
  tools?: unknown;
  knowledgePolicy?: AgentKnowledgeSnapshot;
  participation?: AgentParticipationSnapshot;
  modeContracts?: AgentListing["modeContracts"];
  chatCopy?: AgentChatCopySnapshot;
  attachmentContract?: AgentAttachmentContractSnapshot;
};

const CORE_AGENT_PROFILES: CoreAgentProfile[] = [
  aadvProfile,
  defiOneProfile,
  diariasProfile,
  eiahProfile,
  finNexusProfile,
  flowOrchestratorProfile,
  guardianProfile,
  iBcProfile,
  imageNftDiariasProfile,
  { ...j360Profile, agent: "J_360" },
  marketingProfile,
  nftPyProfile,
  onchainMonitorProfile,
  pitchProfileThinking,
  riskAnalyzerProfile,
];

export function listCoreAgentCatalog(): AgentListing[] {
  return CORE_AGENT_PROFILES.map((profile) => ({
    id: profile.agent,
    name: profile.name,
    description: profile.description ?? null,
    pricing: undefined,
    profile: {
      model: profile.model,
      systemPrompt: profile.systemPrompt,
      tools: profile.tools ?? null,
    },
    knowledgePolicy: buildKnowledgeSnapshot(profile.agent, profile),
    governance: buildGovernanceSnapshot(profile.agent, profile),
    cognitiveProfile: buildCognitiveSnapshot(profile.agent),
    uxContract: buildUXSnapshot(profile.agent),
    chatCopy: buildChatCopySnapshot(profile.agent, profile),
    attachmentContract: buildAttachmentContractSnapshot(profile.agent, profile),
    participation: buildParticipationSnapshot(profile.agent, true, profile),
    modeContracts: profile.modeContracts,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CANONICAL_AGENT_BY_KEY = (() => {
  const map = new Map<string, string>();
  for (const profile of CORE_AGENT_PROFILES) {
    const key = normalizeAgentKey(profile.agent);
    if (key) {
      map.set(key, profile.agent);
    }
  }
  return map;
})();

export function resolveAgentId(input: string) {
  const key = normalizeAgentKey(input);
  return CANONICAL_AGENT_BY_KEY.get(key) ?? input.trim();
}

function coreProfileForAgent(agent: string) {
  const canonical = resolveAgentId(agent);
  return (
    CORE_AGENT_PROFILES.find((profile) => profile.agent === canonical) ??
    CORE_AGENT_PROFILES.find((profile) => normalizeAgentKey(profile.agent) === normalizeAgentKey(agent)) ??
    null
  );
}

function coreSeedAsRecord(agent: string) {
  const coreProfile = coreProfileForAgent(agent);
  if (!coreProfile) return null;
  const now = new Date();
  return {
    id: `core:${coreProfile.agent}`,
    agent: coreProfile.agent,
    name: coreProfile.name,
    description: coreProfile.description ?? null,
    model: coreProfile.model,
    systemPrompt: coreProfile.systemPrompt,
    tools: (coreProfile.tools as Prisma.JsonValue | undefined) ?? Prisma.JsonNull,
    knowledgePolicy: buildKnowledgeSnapshot(coreProfile.agent, coreProfile),
    chatCopy: buildChatCopySnapshot(coreProfile.agent, coreProfile),
    participation: buildParticipationSnapshot(coreProfile.agent, true, coreProfile),
    modeContracts: (coreProfile.modeContracts as Prisma.JsonValue | undefined) ?? Prisma.JsonNull,
    createdAt: now,
    updatedAt: now,
  };
}

type AgentGovernanceOverride = {
  criticality?: AgentGovernanceSnapshot["criticality"];
  approval?: string;
  receiptPolicy?: string;
  requiredScopes?: string[];
};

type AgentExperienceOverride = {
  cognitiveProfile: AgentCognitiveSnapshot;
  uxContract: AgentUXSnapshot;
};

const AGENT_KNOWLEDGE_OVERRIDES: Record<string, AgentKnowledgeSnapshot> = {
  aadv: {
    deterministicSources: [
      { sourceId: "finops.run-events", kind: "event_store", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "billing.ledger", kind: "ledger", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "security.rbac-audit", kind: "api", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["finops.run-events", "billing.ledger", "security.rbac-audit"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
  defi1: {
    deterministicSources: [
      { sourceId: "defi.protocol-simulation", kind: "api", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "defi.state-snapshot", kind: "snapshot", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["defi.protocol-simulation", "defi.state-snapshot"],
    conflictResolution: "use_primary",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "approved_snapshot",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
  diarias: {
    deterministicSources: [
      { sourceId: "ops.daily-snapshot", kind: "snapshot", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["ops.daily-snapshot"],
    conflictResolution: "use_primary",
    llmUsageMode: "format_only",
    fallbackPolicy: "approved_snapshot",
    provenancePolicy: "recommended",
    maskingPolicy: "none",
  },
  eiah: {
    deterministicSources: [
      { sourceId: "agent.registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "specialist.source-map", kind: "snapshot", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["agent.registry", "specialist.source-map"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
  finnexus: {
    deterministicSources: [
      { sourceId: "finance.payables-registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "finance.bank-reconciliation-ledger", kind: "ledger", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "finance.payment-documents", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["finance.payables-registry", "finance.bank-reconciliation-ledger", "finance.payment-documents"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
  floworchestrator: {
    deterministicSources: [
      { sourceId: "runs.state-machine", kind: "event_store", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "workflow.policy-registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["runs.state-machine", "workflow.policy-registry"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "conditional",
  },
  guardian: {
    deterministicSources: [
      { sourceId: "audit.receipt-bundles", kind: "ledger", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "audit.guardrail-logs", kind: "event_store", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "security.rbac-audit", kind: "api", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["audit.receipt-bundles", "audit.guardrail-logs", "security.rbac-audit"],
    conflictResolution: "fail_closed",
    llmUsageMode: "disallowed_for_critical_execution",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
  ibc: {
    deterministicSources: [
      { sourceId: "crm.account-history", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "sales.playbooks", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["crm.account-history", "sales.playbooks"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
  imagenftdiarias: {
    deterministicSources: [
      { sourceId: "creative.style-guides", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["creative.style-guides"],
    conflictResolution: "use_primary",
    llmUsageMode: "format_only",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "none",
  },
  j360: {
    deterministicSources: [
      { sourceId: "legal.contract-library", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "legal.approved-opinions", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
      { sourceId: "legal.policy-registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["legal.contract-library", "legal.policy-registry", "legal.approved-opinions"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
  mkt: {
    deterministicSources: [
      { sourceId: "marketing.campaign-history", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "marketing.playbooks", kind: "document_index", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["marketing.campaign-history", "marketing.playbooks"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
  nftpy: {
    deterministicSources: [
      { sourceId: "web3.collection-briefs", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "web3.launch-history", kind: "db", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["web3.collection-briefs", "web3.launch-history"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
  onchainmonitor: {
    deterministicSources: [
      { sourceId: "chain.event-stream", kind: "event_store", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "chain.alert-registry", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["chain.event-stream", "chain.alert-registry"],
    conflictResolution: "fail_closed",
    llmUsageMode: "format_only",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "conditional",
  },
  pitch: {
    deterministicSources: [
      { sourceId: "sales.positioning-briefs", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "sales.icp-library", kind: "db", authorityLevel: "secondary", required: false, version: "v1" },
    ],
    sourcePrecedence: ["sales.positioning-briefs", "sales.icp-library"],
    conflictResolution: "human_review",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "human_review",
    provenancePolicy: "recommended",
    maskingPolicy: "conditional",
  },
  riskanalyzer: {
    deterministicSources: [
      { sourceId: "risk.policy-rules", kind: "db", authorityLevel: "primary", required: true, version: "v1" },
      { sourceId: "risk.incident-history", kind: "event_store", authorityLevel: "secondary", required: false, version: "v1" },
      { sourceId: "risk.control-matrix", kind: "document_index", authorityLevel: "primary", required: true, version: "v1" },
    ],
    sourcePrecedence: ["risk.policy-rules", "risk.control-matrix", "risk.incident-history"],
    conflictResolution: "fail_closed",
    llmUsageMode: "grounded_reasoning",
    fallbackPolicy: "block",
    provenancePolicy: "required",
    maskingPolicy: "required",
  },
};

const AGENT_GOVERNANCE_OVERRIDES: Record<string, AgentGovernanceOverride> = {
  aadv: {
    criticality: "high",
    approval: "conditional_human_review",
    receiptPolicy: "run_bundle_recommended",
  },
  eiah: {
    criticality: "medium",
    approval: "policy_driven",
    receiptPolicy: "standard_run_bundle",
    requiredScopes: ["tenant:context", "workspace:context"],
  },
  finnexus: {
    criticality: "high",
    approval: "conditional_for_financial_ops",
    receiptPolicy: "receipt_canon_for_financial_actions",
  },
  floworchestrator: {
    criticality: "high",
    approval: "conditional_for_execution",
    receiptPolicy: "run_bundle_plus_ledger_when_tx",
  },
  guardian: {
    criticality: "critical",
    approval: "mandatory_for_sensitive_artifacts",
    receiptPolicy: "verify_url_and_receipt_canon_required",
    requiredScopes: ["tenant:context", "workspace:context", "governance:write"],
  },
  j360: {
    criticality: "high",
    approval: "mandatory_human_approval",
    receiptPolicy: "receipt_canon_required",
  },
  riskanalyzer: {
    criticality: "high",
    approval: "policy_driven",
    receiptPolicy: "standard_run_bundle",
  },
  onchainmonitor: {
    criticality: "high",
    approval: "required_for_alert_creation",
    receiptPolicy: "run_bundle_plus_ledger_when_tx",
  },
  defi1: {
    criticality: "high",
    approval: "conditional_for_value_transfer",
    receiptPolicy: "ledger_when_onchain",
  },
};

const AGENT_EXPERIENCE_OVERRIDES: Record<string, AgentExperienceOverride> = {
  aadv: {
    cognitiveProfile: {
      reasoningMode: "diagnostic",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "explicit",
      memoryStyle: "evidence_anchored",
      decisionPosture: "constrained_action",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Coleta guiada e síntese auditável com baixa fricção.",
      responseShape: "evidence_pack",
      toneProfile: "operational",
      interactionPattern: "guided_flow",
      defaultCTA: "Completar o bloco faltante e consolidar evidências.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "structured",
      trustSignals: ["progresso", "evidências", "resumo_executivo"],
    },
  },
  defi1: {
    cognitiveProfile: {
      reasoningMode: "simulation",
      initiativeLevel: "medium",
      ambiguityStrategy: "infer_conservatively",
      confidenceBehavior: "explicit",
      memoryStyle: "contextual",
      decisionPosture: "execution_guarded",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Comparar cenários DeFi antes de qualquer ação.",
      responseShape: "options_matrix",
      toneProfile: "analytical",
      interactionPattern: "guided_flow",
      defaultCTA: "Escolher a simulação preferida ou pedir nova comparação.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "light",
      trustSignals: ["risco", "custo", "efeito_esperado"],
    },
  },
  diarias: {
    cognitiveProfile: {
      reasoningMode: "synthesis",
      initiativeLevel: "low",
      ambiguityStrategy: "infer_conservatively",
      confidenceBehavior: "implicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "never",
    },
    uxContract: {
      primaryUserValue: "Reduzir esforço mental em rotinas recorrentes.",
      responseShape: "executive_summary",
      toneProfile: "operational",
      interactionPattern: "single_turn",
      defaultCTA: "Revisar desvios e seguir para a próxima ação do dia.",
      maxCognitiveLoad: "low",
      clarificationPolicy: "minimal",
      progressExposure: "light",
      trustSignals: ["status", "desvios", "pendências"],
    },
  },
  eiah: {
    cognitiveProfile: {
      reasoningMode: "orchestration",
      initiativeLevel: "high",
      ambiguityStrategy: "route_to_core",
      confidenceBehavior: "explicit",
      memoryStyle: "contextual",
      decisionPosture: "constrained_action",
      delegationPolicy: "preferred",
    },
    uxContract: {
      primaryUserValue: "Despachar o usuário para o melhor próximo passo com contexto.",
      responseShape: "executive_summary",
      toneProfile: "executive",
      interactionPattern: "guided_flow",
      defaultCTA: "Escolher entre analisar, simular, executar ou auditar.",
      maxCognitiveLoad: "low",
      clarificationPolicy: "targeted",
      progressExposure: "light",
      trustSignals: ["handoff", "próximo_passo", "resumo"],
    },
  },
  finnexus: {
    cognitiveProfile: {
      reasoningMode: "diagnostic",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "explicit",
      memoryStyle: "contextual",
      decisionPosture: "execution_guarded",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Transformar contexto financeiro em decisão prática e priorizada.",
      responseShape: "options_matrix",
      toneProfile: "analytical",
      interactionPattern: "guided_flow",
      defaultCTA: "Escolher a ação financeira ou revisar pendências para concluir.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "structured",
      trustSignals: ["impacto", "pendências", "prioridade"],
    },
  },
  floworchestrator: {
    cognitiveProfile: {
      reasoningMode: "orchestration",
      initiativeLevel: "high",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "gated",
      memoryStyle: "contextual",
      decisionPosture: "execution_guarded",
      delegationPolicy: "preferred",
    },
    uxContract: {
      primaryUserValue: "Dar clareza de sequência, checkpoints e blockers em fluxos complexos.",
      responseShape: "step_plan",
      toneProfile: "operational",
      interactionPattern: "guided_flow",
      defaultCTA: "Avançar para o próximo checkpoint validado.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "structured",
      trustSignals: ["estado_atual", "próximo_passo", "condição_de_avanço"],
    },
  },
  guardian: {
    cognitiveProfile: {
      reasoningMode: "compliance",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "gated",
      memoryStyle: "evidence_anchored",
      decisionPosture: "execution_guarded",
      delegationPolicy: "mandatory_for_sensitive",
    },
    uxContract: {
      primaryUserValue: "Provar integridade e conformidade com verificabilidade legível.",
      responseShape: "evidence_pack",
      toneProfile: "analytical",
      interactionPattern: "review_loop",
      defaultCTA: "Validar evidência, receipt e verify_url antes de prosseguir.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "strict",
      progressExposure: "structured",
      trustSignals: ["verify_url", "receipt", "integridade"],
    },
  },
  ibc: {
    cognitiveProfile: {
      reasoningMode: "synthesis",
      initiativeLevel: "medium",
      ambiguityStrategy: "infer_conservatively",
      confidenceBehavior: "implicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Converter contexto comercial em próxima ação útil para o funil.",
      responseShape: "step_plan",
      toneProfile: "commercial",
      interactionPattern: "single_turn",
      defaultCTA: "Executar a próxima abordagem comercial recomendada.",
      maxCognitiveLoad: "low",
      clarificationPolicy: "minimal",
      progressExposure: "light",
      trustSignals: ["insight", "hipótese", "ação"],
    },
  },
  imagenftdiarias: {
    cognitiveProfile: {
      reasoningMode: "synthesis",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "implicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "never",
    },
    uxContract: {
      primaryUserValue: "Traduzir intenção em prompt visual consistente e pronto para uso.",
      responseShape: "brief_answer",
      toneProfile: "supportive",
      interactionPattern: "single_turn",
      defaultCTA: "Gerar a variante visual preferida.",
      maxCognitiveLoad: "low",
      clarificationPolicy: "targeted",
      progressExposure: "none",
      trustSignals: ["prompt_pronto", "variantes", "justificativa_visual"],
    },
  },
  j360: {
    cognitiveProfile: {
      reasoningMode: "compliance",
      initiativeLevel: "low",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "explicit",
      memoryStyle: "evidence_anchored",
      decisionPosture: "execution_guarded",
      delegationPolicy: "mandatory_for_sensitive",
    },
    uxContract: {
      primaryUserValue: "Traduzir risco jurídico em parecer curto e acionável.",
      responseShape: "risk_brief",
      toneProfile: "analytical",
      interactionPattern: "review_loop",
      defaultCTA: "Fornecer o contexto contratual faltante ou revisar o parecer.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "strict",
      progressExposure: "light",
      trustSignals: ["lacunas", "risco", "recomendação"],
    },
  },
  mkt: {
    cognitiveProfile: {
      reasoningMode: "synthesis",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "implicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Organizar campanha por objetivo, canal, mensagem e métrica.",
      responseShape: "step_plan",
      toneProfile: "commercial",
      interactionPattern: "guided_flow",
      defaultCTA: "Escolher o canal prioritário e iniciar o plano.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "structured",
      trustSignals: ["canal", "cronograma", "hipóteses"],
    },
  },
  nftpy: {
    cognitiveProfile: {
      reasoningMode: "critique",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "implicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Estruturar narrativa, conceito e roadmap de coleção NFT.",
      responseShape: "options_matrix",
      toneProfile: "commercial",
      interactionPattern: "review_loop",
      defaultCTA: "Selecionar a direção criativa e avançar para lançamento.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "light",
      trustSignals: ["conceito", "fases", "posicionamento"],
    },
  },
  onchainmonitor: {
    cognitiveProfile: {
      reasoningMode: "monitoring",
      initiativeLevel: "high",
      ambiguityStrategy: "infer_conservatively",
      confidenceBehavior: "explicit",
      memoryStyle: "contextual",
      decisionPosture: "constrained_action",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Entregar alerta objetivo com contexto mínimo e ação imediata.",
      responseShape: "alert_card",
      toneProfile: "operational",
      interactionPattern: "monitoring_loop",
      defaultCTA: "Confirmar o evento e aplicar a ação sugerida.",
      maxCognitiveLoad: "low",
      clarificationPolicy: "minimal",
      progressExposure: "structured",
      trustSignals: ["evento", "impacto", "ação_imediata"],
    },
  },
  pitch: {
    cognitiveProfile: {
      reasoningMode: "critique",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "explicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "optional",
    },
    uxContract: {
      primaryUserValue: "Refinar narrativa executiva e expor buracos de persuasão.",
      responseShape: "executive_summary",
      toneProfile: "executive",
      interactionPattern: "review_loop",
      defaultCTA: "Revisar a versão executiva e iterar o pitch.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "targeted",
      progressExposure: "light",
      trustSignals: ["forças", "lacunas", "melhorias"],
    },
  },
  riskanalyzer: {
    cognitiveProfile: {
      reasoningMode: "diagnostic",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "explicit",
      memoryStyle: "evidence_anchored",
      decisionPosture: "execution_guarded",
      delegationPolicy: "mandatory_for_sensitive",
    },
    uxContract: {
      primaryUserValue: "Separar risco, bloqueio real e mitigação de forma acionável.",
      responseShape: "risk_brief",
      toneProfile: "analytical",
      interactionPattern: "review_loop",
      defaultCTA: "Aplicar mitigação ou escalar o risco crítico.",
      maxCognitiveLoad: "medium",
      clarificationPolicy: "strict",
      progressExposure: "structured",
      trustSignals: ["severidade", "probabilidade", "mitigação"],
    },
  },
};

function asToolArray(tools: unknown): Array<Record<string, unknown>> {
  return Array.isArray(tools)
    ? tools.filter((tool): tool is Record<string, unknown> => Boolean(tool) && typeof tool === "object")
    : [];
}

function getModelPolicy(profile: CoreAgentProfile | null) {
  if (!profile) return "unconfigured";
  const multiModels =
    profile.models && typeof profile.models === "object" ? Object.keys(profile.models).length : 0;
  if (multiModels > 0) {
    return `multi-model (${multiModels} perfis)`;
  }
  return `single-model (${profile.model})`;
}

function getToolCapabilities(tools: unknown) {
  const items = asToolArray(tools)
    .map((tool) => (typeof tool.name === "string" ? tool.name : null))
    .filter((value): value is string => Boolean(value));
  return items;
}

function getRequiredScopes(tools: unknown) {
  const scopes = new Set<string>();
  for (const tool of asToolArray(tools)) {
    const auth = tool.auth;
    if (!auth || typeof auth !== "object") continue;
    const authRecord = auth as Record<string, unknown>;
    const scopeGroups = authRecord.scopes;
    if (!scopeGroups || typeof scopeGroups !== "object") continue;
    for (const scopeSet of Object.values(scopeGroups as Record<string, unknown>)) {
      if (!Array.isArray(scopeSet)) continue;
      for (const scope of scopeSet) {
        if (typeof scope === "string" && scope.trim()) {
          scopes.add(scope);
        }
      }
    }
  }
  return Array.from(scopes);
}

function getApprovalPolicy(tools: unknown) {
  const confirmations = asToolArray(tools)
    .map((tool) => tool.requires_confirmation)
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toLowerCase());

  if (confirmations.some((value) => value === "true")) {
    return "mandatory";
  }
  if (confirmations.some((value) => value && value !== "false")) {
    return "conditional";
  }
  return "not_required";
}

function buildGovernanceSnapshot(
  agent: string,
  profile: CoreAgentProfile | null
): AgentGovernanceSnapshot {
  const normalizedAgent = normalizeAgentKey(agent);
  const overrides = AGENT_GOVERNANCE_OVERRIDES[normalizedAgent] ?? {};
  const toolCapabilities = getToolCapabilities(profile?.tools);
  const requiredScopes = overrides.requiredScopes ?? getRequiredScopes(profile?.tools);

  return {
    modelPolicy: getModelPolicy(profile),
    toolCapabilities,
    criticality: overrides.criticality ?? (toolCapabilities.length > 0 ? "medium" : "low"),
    approval: overrides.approval ?? getApprovalPolicy(profile?.tools),
    receiptPolicy: overrides.receiptPolicy ?? (toolCapabilities.length > 0 ? "standard_run_bundle" : "not_applicable"),
    requiredScopes: requiredScopes.length > 0 ? requiredScopes : ["tenant:context", "workspace:context"],
  };
}

function buildKnowledgeSnapshot(agent: string, profile: CoreAgentProfile | null): AgentKnowledgeSnapshot {
  const normalizedAgent = normalizeAgentKey(agent);
  if (profile?.knowledgePolicy) {
    return profile.knowledgePolicy;
  }
  return (
    AGENT_KNOWLEDGE_OVERRIDES[normalizedAgent] ?? {
      deterministicSources: [],
      sourcePrecedence: [],
      conflictResolution: "human_review",
      llmUsageMode: "open_reasoning_restricted",
      fallbackPolicy: "human_review",
      provenancePolicy: "recommended",
      maskingPolicy: "conditional",
    }
  );
}

function buildCognitiveSnapshot(agent: string): AgentCognitiveSnapshot {
  const normalizedAgent = normalizeAgentKey(agent);
  return (
    AGENT_EXPERIENCE_OVERRIDES[normalizedAgent]?.cognitiveProfile ?? {
      reasoningMode: "synthesis",
      initiativeLevel: "medium",
      ambiguityStrategy: "ask_first",
      confidenceBehavior: "implicit",
      memoryStyle: "contextual",
      decisionPosture: "advisory",
      delegationPolicy: "optional",
    }
  );
}

function buildUXSnapshot(agent: string): AgentUXSnapshot {
  const normalizedAgent = normalizeAgentKey(agent);
  return (
    AGENT_EXPERIENCE_OVERRIDES[normalizedAgent]?.uxContract ?? {
      primaryUserValue: "Entregar resposta útil sem derivar para comportamento genérico.",
      responseShape: "brief_answer",
      toneProfile: "supportive",
      interactionPattern: "single_turn",
      defaultCTA: "Prosseguir com a próxima ação recomendada.",
      maxCognitiveLoad: "low",
      clarificationPolicy: "minimal",
      progressExposure: "none",
      trustSignals: ["clareza", "próximo_passo"],
    }
  );
}

function buildChatCopySnapshot(agent: string, profile?: { chatCopy?: AgentChatCopySnapshot | null } | null) {
  if (profile?.chatCopy) {
    return profile.chatCopy;
  }
  return coreProfileForAgent(agent)?.chatCopy;
}

function buildAttachmentContractSnapshot(
  agent: string,
  profile?: { attachmentContract?: AgentAttachmentContractSnapshot | null } | null,
) {
  if (profile?.attachmentContract) {
    return profile.attachmentContract;
  }
  return coreProfileForAgent(agent)?.attachmentContract;
}

function buildParticipationSnapshot(
  agent: string,
  isAvailableInWorkspace: boolean,
  profile?: { participation?: AgentParticipationSnapshot | null } | null
): AgentParticipationSnapshot {
  const base = profile?.participation ?? coreProfileForAgent(agent)?.participation;
  if (base) {
    return {
      ...base,
      agentId: base.agentId || agent,
      status: isAvailableInWorkspace ? "active" : base.status === "active" ? "restricted" : base.status,
      canBeSuggested: isAvailableInWorkspace ? base.canBeSuggested : false,
      canReceiveHandoff: isAvailableInWorkspace ? base.canReceiveHandoff : false,
      requiresEntitlement: !isAvailableInWorkspace || base.requiresEntitlement,
    };
  }
  return {
    agentId: agent,
    status: isAvailableInWorkspace ? "active" : "restricted",
    visibility: "visible",
    canBeSuggested: isAvailableInWorkspace,
    canReceiveHandoff: isAvailableInWorkspace,
    requiresEntitlement: !isAvailableInWorkspace,
    requiredModules: [],
    requiredWorkspaceCapabilities: [],
  };
}

/**
 * Lista agentes disponíveis, combinando dados de pricing,
 * perfis de agentes e ações registradas no core.
 * 
 * Multi-tenant: o client Prisma é obtido via prismaGlobal
 * para garantir isolamento de dados por tenant/workspace.
 */
export async function listAgents(
  tenantId: string,
  workspaceId: string,
  client?: PrismaClient
): Promise<AgentListing[]> {
  const db = client ?? prismaGlobal;

  const [pricing, profiles, activeDelegations, workspacePolicies] = await Promise.all([
    db.pricing.findMany({ where: { active: true } }),
    db.agentProfile.findMany(),
    db.delegationPolicy.findMany({
      where: {
        delegateeId: tenantId,
        validUntil: { gt: new Date() },
        scope: { in: ["read", "execute", "admin"] },
        marketplaceId: { not: null },
      },
      include: {
        marketplace: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.tenantActionPolicy.findMany({
      where: {
        tenantId,
        workspaceId,
        allowed: true,
      },
    }),
  ]);

  const registry = listRegisteredActions();
  const subscribedAgentKeys = new Set<string>();
  const workspaceAllowedKeys = new Set(
    workspacePolicies.map((policy) => normalizeAgentKey(policy.actionName))
  );

  for (const delegation of activeDelegations) {
    const marketplace = delegation.marketplace;
    if (!marketplace || marketplace.type !== "agent") continue;
    const normalizedMarketplaceName = normalizeAgentKey(marketplace.name);
    if (!normalizedMarketplaceName) continue;
    if (!workspaceAllowedKeys.has(normalizedMarketplaceName)) continue;
    subscribedAgentKeys.add(normalizedMarketplaceName);
  }

  const profileMap = new Map<string, (typeof profiles)[number]>();
  for (const profile of profiles) {
    profileMap.set(resolveAgentId(profile.agent), profile);
  }

  const response: AgentListing[] = pricing
    .filter((plan) => subscribedAgentKeys.has(normalizeAgentKey(resolveAgentId(plan.agent))))
    .map((plan) => {
    const canonical = resolveAgentId(plan.agent);
    const profile = profileMap.get(canonical);
    return {
      id: canonical,
      name: profile?.name ?? canonical,
      description: profile?.description ?? `Agent ${canonical}`,
      pricing: profile
        ? {
          perRunCents: plan.perRunCents,
          perMBcents: plan.perMBcents,
        }
        : undefined,
      profile: profile
        ? {
          model: profile.model,
          systemPrompt: profile.systemPrompt,
          tools: profile.tools,
        }
        : undefined,
      knowledgePolicy: buildKnowledgeSnapshot(canonical, profile ?? coreProfileForAgent(canonical)),
      governance: buildGovernanceSnapshot(canonical, profile ?? coreProfileForAgent(canonical)),
      cognitiveProfile: buildCognitiveSnapshot(canonical),
      uxContract: buildUXSnapshot(canonical),
      chatCopy: buildChatCopySnapshot(canonical, profile ?? coreProfileForAgent(canonical)),
      attachmentContract: buildAttachmentContractSnapshot(canonical, profile ?? coreProfileForAgent(canonical)),
      participation: buildParticipationSnapshot(canonical, true, profile ?? coreProfileForAgent(canonical)),
      modeContracts:
        ((profile as { modeContracts?: AgentListing["modeContracts"] | null } | undefined)?.modeContracts as
          | AgentListing["modeContracts"]
          | undefined) ?? coreProfileForAgent(canonical)?.modeContracts,
    };
    });

  for (const profile of profiles) {
    const canonical = resolveAgentId(profile.agent);
    if (!subscribedAgentKeys.has(normalizeAgentKey(canonical))) {
      continue;
    }
    if (!response.some((item) => item.id === canonical)) {
      response.push({
        id: canonical,
        name: profile.name,
        description: profile.description,
        pricing: undefined,
        profile: {
          model: profile.model,
          systemPrompt: profile.systemPrompt,
          tools: profile.tools,
        },
        knowledgePolicy: buildKnowledgeSnapshot(canonical, profile),
        governance: buildGovernanceSnapshot(canonical, profile),
        cognitiveProfile: buildCognitiveSnapshot(canonical),
        uxContract: buildUXSnapshot(canonical),
        chatCopy: buildChatCopySnapshot(canonical, profile),
        attachmentContract: buildAttachmentContractSnapshot(canonical, profile),
        participation: buildParticipationSnapshot(canonical, true, profile),
        modeContracts:
          ((profile as { modeContracts?: AgentListing["modeContracts"] | null }).modeContracts as
            | AgentListing["modeContracts"]
            | undefined) ?? coreProfileForAgent(canonical)?.modeContracts,
      });
    }
  }

  for (const coreProfile of CORE_AGENT_PROFILES) {
    if (!subscribedAgentKeys.has(normalizeAgentKey(coreProfile.agent))) {
      continue;
    }
    if (!response.some((item) => item.id === coreProfile.agent)) {
      response.push({
        id: coreProfile.agent,
        name: coreProfile.name,
        description: coreProfile.description ?? null,
        pricing: undefined,
        profile: {
          model: coreProfile.model,
          systemPrompt: coreProfile.systemPrompt,
          tools: coreProfile.tools ?? null,
        },
        knowledgePolicy: buildKnowledgeSnapshot(coreProfile.agent, coreProfile),
        governance: buildGovernanceSnapshot(coreProfile.agent, coreProfile),
        cognitiveProfile: buildCognitiveSnapshot(coreProfile.agent),
        uxContract: buildUXSnapshot(coreProfile.agent),
        chatCopy: buildChatCopySnapshot(coreProfile.agent, coreProfile),
        attachmentContract: buildAttachmentContractSnapshot(coreProfile.agent, coreProfile),
        participation: buildParticipationSnapshot(coreProfile.agent, true, coreProfile),
        modeContracts: coreProfile.modeContracts,
      });
    }
  }

  for (const entry of registry) {
    const canonical = resolveAgentId(entry.name);
    if (!subscribedAgentKeys.has(normalizeAgentKey(canonical))) {
      continue;
    }
    if (canonical !== entry.name) {
      // Avoid duplicating core agent entries through registry aliases (e.g. "riskAnalyzer" vs "risk-analyzer").
      continue;
    }
    if (!response.some((item) => item.id === entry.name)) {
      response.push({
        id: entry.name,
        name: entry.name,
        description: entry.description ?? null,
        pricing: undefined,
        profile: undefined,
        knowledgePolicy: buildKnowledgeSnapshot(entry.name, coreProfileForAgent(entry.name)),
        governance: buildGovernanceSnapshot(entry.name, coreProfileForAgent(entry.name)),
        cognitiveProfile: buildCognitiveSnapshot(entry.name),
        uxContract: buildUXSnapshot(entry.name),
        chatCopy: buildChatCopySnapshot(entry.name, coreProfileForAgent(entry.name)),
        attachmentContract: buildAttachmentContractSnapshot(entry.name, coreProfileForAgent(entry.name)),
        participation: buildParticipationSnapshot(entry.name, true, coreProfileForAgent(entry.name)),
        modeContracts: coreProfileForAgent(entry.name)?.modeContracts,
      });
    }
  }

  return response;
}

async function isAgentAvailableInWorkspace(
  tenantId: string,
  workspaceId: string,
  agent: string,
  db: PrismaClient
) {
  const canonical = resolveAgentId(agent);
  const normalizedCanonical = normalizeAgentKey(canonical);
  const [workspacePolicies, activeDelegations] = await Promise.all([
    db.tenantActionPolicy.findMany({
      where: {
        tenantId,
        workspaceId,
        allowed: true,
      },
      select: { actionName: true },
    }),
    db.delegationPolicy.findMany({
      where: {
        delegateeId: tenantId,
        validUntil: { gt: new Date() },
        scope: { in: ["read", "execute", "admin"] },
        marketplaceId: { not: null },
      },
      include: { marketplace: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const workspaceAllowedKeys = new Set(workspacePolicies.map((policy) => normalizeAgentKey(policy.actionName)));
  if (!workspaceAllowedKeys.has(normalizedCanonical)) {
    return false;
  }

  return activeDelegations.some((delegation) => {
    const marketplace = delegation.marketplace;
    if (!marketplace || marketplace.type !== "agent") return false;
    return normalizeAgentKey(resolveAgentId(marketplace.name)) === normalizedCanonical;
  });
}

/**
 * Retorna o perfil de um agente, considerando o contexto multi-tenant.
 * Se não existir no banco, retorna fallback do registro estático.
 */
export async function getAgentProfile(
  tenantId: string,
  workspaceId: string,
  agent: string,
  client?: PrismaClient
) {
  const db = client ?? prismaGlobal;
  const resolvedAgent = resolveAgentId(agent);
  const isAvailableInWorkspace = await isAgentAvailableInWorkspace(tenantId, workspaceId, resolvedAgent, db);

  const dbProfile = await db.agentProfile.findUnique({ where: { agent: resolvedAgent } });
  if (dbProfile) {
    return {
      ...dbProfile,
      knowledgePolicy:
        (dbProfile as { knowledgePolicy?: AgentKnowledgeSnapshot | null }).knowledgePolicy ??
        buildKnowledgeSnapshot(resolvedAgent, coreProfileForAgent(resolvedAgent)),
      participation:
        (dbProfile as { participation?: AgentParticipationSnapshot | null }).participation ??
        buildParticipationSnapshot(resolvedAgent, isAvailableInWorkspace, coreProfileForAgent(resolvedAgent)),
      chatCopy:
        (dbProfile as { chatCopy?: AgentChatCopySnapshot | null }).chatCopy ??
        buildChatCopySnapshot(resolvedAgent, coreProfileForAgent(resolvedAgent)),
      modeContracts:
        (dbProfile as { modeContracts?: AgentListing["modeContracts"] | null }).modeContracts ??
        coreProfileForAgent(resolvedAgent)?.modeContracts,
    };
  }

  const coreSeed = coreSeedAsRecord(resolvedAgent);
  if (coreSeed) {
    return {
      ...coreSeed,
      participation: buildParticipationSnapshot(resolvedAgent, isAvailableInWorkspace, coreProfileForAgent(resolvedAgent)),
    };
  }

  const registryEntry = listRegisteredActions().find((action) => action.name === resolvedAgent);

  if (registryEntry) {
    return {
      id: resolvedAgent,
      agent: resolvedAgent,
      name: registryEntry.description ?? resolvedAgent,
      description: registryEntry.description ?? null,
      model: "unknown",
      systemPrompt: "",
      tools: null,
      knowledgePolicy: buildKnowledgeSnapshot(resolvedAgent, coreProfileForAgent(resolvedAgent)),
      participation: buildParticipationSnapshot(resolvedAgent, isAvailableInWorkspace, coreProfileForAgent(resolvedAgent)),
      chatCopy: buildChatCopySnapshot(resolvedAgent, coreProfileForAgent(resolvedAgent)),
      modeContracts: coreProfileForAgent(resolvedAgent)?.modeContracts,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return null;
}
