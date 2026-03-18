export type AgentDeterministicSource = {
  sourceId: string;
  kind: "db" | "ledger" | "event_store" | "document_index" | "api" | "snapshot";
  authorityLevel: "primary" | "secondary" | "advisory";
  required: boolean;
  version: string;
};

export type AgentKnowledgePolicy = {
  deterministicSources: AgentDeterministicSource[];
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

export type AgentCognitiveProfile = {
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

export type AgentUXContract = {
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

export type AgentChatCopy = {
  whoIAm: string;
  whatIDo: string[];
  whenToUseMe: string[];
  whatINotDo?: string[];
  exampleRequests: string[];
  quickReplies?: string[];
  defaultNextStep?: string;
  analysisFocus?: string[];
  commonRisks?: string[];
  missingFieldsGuide?: string[];
  supportedDocumentTypes?: string[];
  blockedMessages?: {
    genericBlocked?: string;
    missingContext?: string;
    missingRequiredSource?: string;
    insufficientDocumentScope?: string;
  };
};

export type LegalSpecialty = {
  key: string;
  label: string;
  description: string;
  triggers?: string[];
  analysisFocus?: string[];
  commonRisks?: string[];
  missingFieldsGuide?: string[];
  supportedDocumentTypes?: string[];
  exampleRequests?: string[];
  quickReplies?: string[];
};

export type AgentAttachmentKind =
  | "contract"
  | "clause"
  | "addendum"
  | "notice"
  | "invoice"
  | "receipt"
  | "evidence"
  | "spreadsheet"
  | "proposal"
  | "public_notice"
  | "generic_document";

export type AgentAttachmentIntakeMode = "upload_file" | "paste_text" | "structured_form";

export type AgentAttachmentAnalysisMode =
  | "full_review"
  | "partial_review"
  | "clause_review"
  | "risk_scan"
  | "missing_fields"
  | "evidence_validation"
  | "financial_check";

export type AgentAttachmentContract = {
  acceptsAttachments: boolean;
  acceptedAttachmentKinds: AgentAttachmentKind[];
  acceptedMimeTypes?: string[];
  intakeModes: AgentAttachmentIntakeMode[];
  analysisModes: AgentAttachmentAnalysisMode[];
  defaultAnalysisMode?: AgentAttachmentAnalysisMode;
  requiredMetadata?: string[];
  initialPrompts?: string[];
  uploadHelpText?: string;
};

export type AgentParticipationStatus = "active" | "restricted" | "experimental" | "future" | "deprecated";
export type AgentParticipationVisibility = "visible" | "hidden" | "internal_only";

export type AgentParticipation = {
  agentId: string;
  status: AgentParticipationStatus;
  visibility: AgentParticipationVisibility;
  canBeSuggested: boolean;
  canReceiveHandoff: boolean;
  requiresEntitlement: boolean;
  requiredModules?: string[];
  requiredWorkspaceCapabilities?: string[];
};

export type AgentModeContract = {
  mode: "help" | "orchestrator" | "proposal";
  label: string;
  description: string;
  knowledgePolicy?: AgentKnowledgePolicy;
  cognitiveProfile?: AgentCognitiveProfile;
  uxContract?: AgentUXContract;
  chatCopy?: AgentChatCopy;
};

export type AgentProfileSeed = {
  id?: string;
  agent: string;
  name: string;
  description: string;
  model: string;
  models?: Record<string, unknown>;
  systemPrompt: string;
  tools: Array<Record<string, unknown>>;
  knowledgePolicy?: AgentKnowledgePolicy;
  participation?: AgentParticipation;
  modeContracts?: AgentModeContract[];
  chatCopy?: AgentChatCopy;
  legalSpecialties?: Record<string, LegalSpecialty>;
  attachmentContract?: AgentAttachmentContract;
  metadata?: unknown;
};

import type { ActionHandler } from "../actionRegistry";

/** Wrap a static AgentProfileSeed into an ActionHandler output. */
export function profileAction(profile: AgentProfileSeed): ActionHandler {
  return async () => ({
    status: "success",
    output: profile,
  });
}

export type { ActionHandler };
