import type { ImobCrmPropertyGoal } from "./imobCrmPropertyGoals";
import type { ImobCrmPropertyType } from "./imobCrmPropertyTypes";
import type { ImobReasonCode } from "../control/imobReasonCodeCatalog";
import type {
  ImobLeadDiscoverySignals,
  ImobPilotOperationalSnapshot,
} from "../imobConversationContract";

export type ImobCrmEntityType = "lead" | "owner" | "property" | "case";

export type ImobCrmTurnMode = "consult" | "execute";

export type ImobCrmConversationState = Record<string, unknown>;
export type ImobCrmTurnEntitlements = Record<string, unknown>;
export type ImobCrmRecommendedAction = {
  id: string;
  label: string;
  actionType: "consultive" | "operational" | "governed";
  inputHint?: string;
  reasonCode?: ImobReasonCode;
};

export type ImobCrmCanonicalCase = {
  journeyType?: string;
  partyRole?: string;
  commercialGoal?: string;
  recommendedActions?: ImobCrmRecommendedAction[];
  blockedActions?: string[];
  missingContext?: string[];
  reasonCodes?: ImobReasonCode[];
};

export type ImobCrmHumanJourneyPhase =
  | "captacao"
  | "qualificacao"
  | "atendimento_ativo"
  | "visita"
  | "proposta"
  | "negociacao"
  | "documentacao"
  | "fechamento"
  | "pos_venda";

export type ImobCrmHumanJourney = {
  phase: ImobCrmHumanJourneyPhase;
  phaseObjective: string;
};

export type ImobCrmHumanWorkflow = {
  currentObjective?: string | null;
  waitingOn?: "lead" | "owner" | "broker" | "legal" | "finance" | "internal" | null;
  urgency?: "low" | "medium" | "high" | "critical" | null;
  agingHours?: number | null;
  followUpRisk?: "low" | "medium" | "high" | null;
  nextActionOwner?: string | null;
  lastMeaningfulContactAt?: string | null;
  doneDefinition?: string | null;
  likelyFailureMode?: string | null;
};

export type ImobCrmLeadSummary = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  goal?: ImobCrmPropertyGoal | null;
  targetCity?: string | null;
  budgetMaxCents?: number | null;
  discoverySignals?: ImobLeadDiscoverySignals | null;
};

export type ImobCrmPropertySummary = {
  id?: string;
  propertyType?: ImobCrmPropertyType | null;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  goal?: ImobCrmPropertyGoal | null;
  askingPriceCents?: number | null;
  owner?: { id?: string; name?: string | null } | null;
};

export type ImobCrmOwnerSummary = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
};

export type ImobCrmCaseContext = {
  caseId?: string;
  flow?: string | null;
  stage?: string | null;
  status?: string | null;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blocker?: string | null;
  pendingItems?: string[];
  threadId?: string | null;
  updatedAt?: string | null;
  lead?: ImobCrmLeadSummary | null;
  property?: ImobCrmPropertySummary | null;
  owner?: ImobCrmOwnerSummary | null;
  canonical?: ImobCrmCanonicalCase;
  humanJourney?: ImobCrmHumanJourney | null;
  humanWorkflow?: ImobCrmHumanWorkflow | null;
} & Record<string, unknown>;

export type ImobCrmPresentationCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  action?: string;
  nextMessage?: string;
};

export type ImobCrmPresentationCard = {
  title: string;
  lines: string[];
  ctas?: ImobCrmPresentationCta[];
  actionsLayout?: "inline";
};

export type ImobConsultiveSpecialistSupport = {
  agentId: string;
  reasonCode?: ImobReasonCode;
  why?: string | null;
  suggestedAction?: string | null;
  ownershipBoundary?: string | null;
};

export type ImobCaseBrief = {
  summary: string;
  phaseObjective?: string | null;
  primaryRisk?: string | null;
  waitingOn?: ImobCrmHumanWorkflow["waitingOn"];
  nextActionOwner?: string | null;
  nextSafeStep?: string | null;
  specialistAgentId?: string | null;
};

export type ImobPreparedMessageVariant = {
  id: string;
  label: string;
  tone: "direct" | "consultive";
  text: string;
};

export type ImobPreparedFollowUp = {
  objective: string;
  recipientRole: "lead" | "owner" | "broker" | "legal" | "finance" | "internal";
  trigger: string;
  expectedReply?: string | null;
  escalationHint?: string | null;
  variants: ImobPreparedMessageVariant[];
};

export type ImobActionableChecklistItem = {
  id: string;
  title: string;
  criticality: "critical" | "supporting";
  owner: string;
  unlocks: string;
  urgency: "low" | "medium" | "high" | "critical";
};

export type ImobActionableChecklist = {
  title: string;
  items: ImobActionableChecklistItem[];
};

export type ImobHandoffPack = {
  targetArea: string;
  reason: string;
  summary: string;
  blocker?: string | null;
  needsValidation: string[];
  remainsWithBroker: string[];
  urgency?: "low" | "medium" | "high" | "critical" | null;
  ownershipBoundary?: string | null;
};

export type ImobEvidenceRef = {
  kind: "case_field" | "workflow_signal" | "recommended_action" | "specialist_hint";
  ref: string;
  label: string;
  value?: string | number | boolean | null;
};

export type ImobDecisionRationale = {
  summary: string;
  confidence: "low" | "medium" | "high";
  reasonCodes: string[];
  sourceRefs: ImobEvidenceRef[];
  missingEvidence?: string[];
  generatedAt: string;
};

export type ImobLeadScoreBand = "HOT" | "WARM" | "COLD" | "UNKNOWN";

export type ImobLeadScoreFactor = {
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
};

export type ImobLeadScoringSnapshot = {
  scoreBand: ImobLeadScoreBand;
  scoreValue: number;
  scoreVersion: "imob.lead_scoring.v1.1";
  summary: string;
  confidence: "low" | "medium" | "high";
  reasonCodes: string[];
  factors: ImobLeadScoreFactor[];
  missingEvidence?: string[];
  shadowMode: true;
  generatedAt: string;
};

export type ImobLeadDiscoveryCoverage = "complete" | "partial" | "insufficient";

export type ImobLeadDiscoverySnapshot = {
  coverage: ImobLeadDiscoveryCoverage;
  discoveryVersion: "imob.lead_discovery.v1";
  summary: string;
  capturedSignals: string[];
  missingSignals: ImobLeadDiscoverySignalKey[];
  recommendedNextMove: string;
  shadowMode: true;
  generatedAt: string;
};

export type ImobLeadProfileReportStatus = "ready" | "partial" | "insufficient";

export type ImobLeadProfileReportSnapshot = {
  profileVersion: "imob.lead_profile_report.v1";
  profileStatus: ImobLeadProfileReportStatus;
  commercialReadiness: "high" | "medium" | "low" | "unknown";
  financialReadiness: "high" | "medium" | "low" | "unknown";
  consentScope: "internal_only";
  summary: string;
  strengths: string[];
  risks: string[];
  missingEvidence: string[];
  recommendedNextMove: string;
  shadowMode: true;
  generatedAt: string;
};

export type ImobViabilityMarketAnalysisSnapshot = {
  analysisVersion: "imob.viability_market_analysis.v1";
  marketStatus: "viable" | "watch" | "fragile" | "insufficient_context";
  viabilityScore: number;
  liquiditySignal: "high" | "medium" | "low" | "unknown";
  priceConfidence: "high" | "medium" | "low" | "unknown";
  summary: string;
  anchorSignals: string[];
  missingEvidence: string[];
  recommendedNextMove: string;
  shadowMode: true;
  generatedAt: string;
};

export type ImobClosingDocumentsSnapshot = {
  documentStateVersion: "imob.closing_documents_real.v1";
  readinessStatus: "ready" | "partial" | "blocked" | "insufficient_context";
  packetReadiness: "ready" | "partial" | "blocked" | "unknown";
  legalHandoffRecommended: boolean;
  summary: string;
  pendingDocuments: string[];
  blockingIssues: string[];
  nextValidationOwner: "corretor" | "juridico" | "proprietario" | "lead" | "interno";
  recommendedNextMove: string;
  shadowMode: true;
  generatedAt: string;
};

export type ImobMissionOrchestrationSnapshot = {
  missionVersion: "imob.mission_orchestration.v1";
  missionId: string;
  missionStatus: "ready" | "watch" | "blocked" | "insufficient_context";
  ownerAgentId: "IMOB";
  ownerCapability: string;
  supportingAgents: string[];
  missionReasonCodes: string[];
  summary: string;
  pendingHandoffs: string[];
  blockingIssues: string[];
  recommendedNextMove: string;
  evidenceRefs: ImobEvidenceRef[];
  shadowMode: true;
  createdAt: string;
  closedAt?: string | null;
  generatedAt: string;
};

export type ImobPilotFlowType =
  | "assisted_reengagement_flow"
  | "assisted_calendar_flow"
  | "assisted_listing_flow"
  | "shadow_capture_enrichment_flow";

export type ImobPilotFlowStatus =
  | "blocked"
  | "queued"
  | "completed"
  | "shadow_recorded"
  | "duplicate";

export type ImobPilotFlowSnapshot = {
  flowRunId: string;
  flowId: string;
  flowType: ImobPilotFlowType;
  missionId: string;
  visibleAgentId: "IMOB";
  capabilityId: string;
  caseId: string | null;
  leadId: string | null;
  gateDecision: {
    allowed: boolean;
    capability: {
      capabilityId: string;
      ownerAgent: string;
      visibleAgentId: "IMOB";
      status: string;
      executionMode: string;
      riskTier: string;
      rolloutStage: string;
      category: string;
    } | null;
    reasonCodes: string[];
  };
  jobId?: string | null;
  trackingId?: string | null;
  evidenceRefs: ImobEvidenceRef[];
  status: ImobPilotFlowStatus;
  nextHumanAction: string;
  generatedAt: string;
};

export type ImobCommercialPreference = {
  key:
    | "goal"
    | "target_city"
    | "budget"
    | "budget_flexibility"
    | "pain_point"
    | "motivation";
  label: string;
  value: string;
  source: "declared" | "conversation" | "crm_case";
};

export type ImobCommercialObjection = {
  key:
    | "budget"
    | "timing"
    | "decision_maker"
    | "documentation"
    | "follow_up_risk"
    | "readiness";
  label: string;
  summary: string;
  status: "active" | "mitigated" | "unknown";
};

export type ImobCommercialTrigger = {
  kind:
    | "follow_up"
    | "decision_window"
    | "document_pending"
    | "budget_revalidation"
    | "readiness_check";
  summary: string;
};

export type ImobCommercialMemorySnapshot = {
  memoryVersion: "imob.commercial_memory.v1.1";
  summary: string;
  confidence: "low" | "medium" | "high";
  reasonCodes: string[];
  preferences: ImobCommercialPreference[];
  objections: ImobCommercialObjection[];
  urgencySignals: string[];
  lastUsefulAction?: string | null;
  nextTrigger?: ImobCommercialTrigger | null;
  missingEvidence?: string[];
  generatedAt: string;
};

export type ImobReengagementReason =
  | "follow_up_risk"
  | "decision_window"
  | "document_pending"
  | "budget_revalidation"
  | "readiness_check";

export type ImobReengagementSuggestion = {
  reason: ImobReengagementReason;
  summary: string;
  recommendedTiming: "now" | "today" | "this_week";
  suggestedChannel: "whatsapp" | "phone" | "email" | "internal";
  messageBase?: string | null;
  anchorSignals: string[];
  missingEvidence?: string[];
  shadowMode: true;
  generatedAt: string;
};

export type ImobInventoryWatchStatus =
  | "matching"
  | "weak_match"
  | "no_match"
  | "insufficient_context";

export type ImobInventoryWatchMatchStrength = "high" | "medium" | "low" | "unknown";

export type ImobInventoryWatchSnapshot = {
  watchStatus: ImobInventoryWatchStatus;
  matchStrength: ImobInventoryWatchMatchStrength;
  watchVersion: "imob.inventory_watch.v1";
  summary: string;
  anchorSignals: string[];
  missingCriteria: string[];
  recommendedNextMove: string;
  shadowMode: true;
  generatedAt: string;
};

export type ImobConsultiveResponseMinimum = {
  phase?: string | null;
  blocker?: string | null;
  waitingOn?: ImobCrmHumanWorkflow["waitingOn"];
  nextActionOwner?: string | null;
  nextSafeStep?: string | null;
  specialists?: ImobConsultiveSpecialistSupport[];
};

export type ImobCrmConsultiveRead = ImobConsultiveResponseMinimum;

export type ImobCrmTurnCopyState =
  | "entry_options"
  | "collecting_fields"
  | "form_draft"
  | "entity_list"
  | "entity_detail"
  | "processed"
  | "updated"
  | "blocked_missing_data"
  | "blocked_scope"
  | "continuity"
  | "fallback_options"
  | "next_actions"
  | "dedupe_choice"
  | "batch_summary";

export type ImobCrmTurnPresentation = {
  text?: string;
  owner?: string;
  nextStep?: string;
  blocker?: string;
  // Minimum consultive contract for operational reads in IMOB_CRM.
  // When the runtime responds in consult mode about a case, it should try to
  // expose phase, blocker, waitingOn, nextActionOwner and a safe next step.
  consultiveRead?: ImobConsultiveResponseMinimum;
  caseBrief?: ImobCaseBrief;
  preparedFollowUp?: ImobPreparedFollowUp;
  actionableChecklist?: ImobActionableChecklist;
  handoffPack?: ImobHandoffPack;
  decisionRationale?: ImobDecisionRationale;
  leadDiscovery?: ImobLeadDiscoverySnapshot;
  leadProfileReport?: ImobLeadProfileReportSnapshot;
  viabilityMarketAnalysis?: ImobViabilityMarketAnalysisSnapshot;
  closingDocuments?: ImobClosingDocumentsSnapshot;
  missionOrchestration?: ImobMissionOrchestrationSnapshot;
  pilotFlow?: ImobPilotFlowSnapshot;
  pilotOperationalState?: ImobPilotOperationalSnapshot;
  leadScore?: ImobLeadScoringSnapshot;
  commercialMemory?: ImobCommercialMemorySnapshot;
  reengagementSuggestion?: ImobReengagementSuggestion;
  inventoryWatch?: ImobInventoryWatchSnapshot;
  pendingFieldLabels?: string[];
  copyState?: ImobCrmTurnCopyState;
  suggestedNextAction?: string;
  dedupeKey?: string;
  widget?: Record<string, unknown>;
  card?: ImobCrmPresentationCard;
  form?: Record<string, unknown>;
};

export type ImobCrmTurnResolution = {
  mode: ImobCrmTurnMode;
  action: string;
  threadLabel?: string;
  conversationState?: ImobCrmConversationState;
  caseContext?: ImobCrmCaseContext | null;
  presentation?: ImobCrmTurnPresentation;
  entitlements?: ImobCrmTurnEntitlements;
} & Record<string, unknown>;

export type ImobCrmAgentAction =
  | "lead.resolve"
  | "owner.resolve"
  | "property.resolve"
  | "case.resolve"
  | "registration.dedupe"
  | "bulk_intake.prepare"
  | "document.attach"
  | "case.status";

export type ImobCrmAgentRequest = {
  tenantId: string;
  workspaceId: string;
  profileId?: string | null;
  userId?: string | null;
  action: ImobCrmAgentAction;
  payload: Record<string, unknown>;
};

export type ImobCrmMatch = {
  type: ImobCrmEntityType;
  id: string;
  label: string;
  confidence: number;
};

export type ImobCrmAgentResponse = {
  mode: "read" | "review" | "mutate" | "blocked";
  entity?: { type: ImobCrmEntityType; id: string };
  matches?: ImobCrmMatch[];
  patch?: Record<string, unknown>;
  reasonCode?: ImobReasonCode;
  presentationHints?: {
    title: string;
    lines: string[];
    nextStep?: string;
  };
};

export type ImobCrmRegistrationFlow = "lead.qualify" | "owner.create" | "property.create";

export type ImobCrmDedupeDecision =
  | { kind: "none" }
  | {
      kind: "hydrate";
      flow: ImobCrmRegistrationFlow;
      entity: ImobCrmMatch;
      existingLabel: string;
      draft: Record<string, unknown>;
      pendingFields: string[];
    }
  | {
      kind: "choice";
      flow: ImobCrmRegistrationFlow;
      title: string;
      text: string;
      lines: string[];
      nextMessages: string[];
      matches: ImobCrmMatch[];
    };
