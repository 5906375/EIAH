import type { ImobInternalAgentId } from "../agents/imobInternalAgents";
import type { ImobOperationalOpportunity } from "../imobConversationContract";
import type {
  ImobBlocker,
  ImobCaseState,
  ImobMissionId,
  ImobNextAction,
  ImobOperation,
  MissionStatus,
  ReadinessStatus,
} from "../orchestrator/imobMissionTypes";

export type ImobCaseMission =
  | "capture_seasonal_property"
  | "capture_rental_property"
  | "capture_sale_property"
  | "qualify_lead"
  | "schedule_visit"
  | "collect_documents"
  | "prepare_contract"
  | "settle_commission"
  | "commercial_activation"
  | "case_review";

export type ImobCaseStage =
  | "intake"
  | "owner_collecting"
  | "property_collecting"
  | "owner_property_linking"
  | "documents_collecting"
  | "seasonal_rules"
  | "lead_matching"
  | "visit_scheduling"
  | "proposal_preparing"
  | "contract_preparing"
  | "commission_review"
  | "campaign_preparing"
  | "done"
  | "blocked";

export type ImobCaseActionId =
  | "owner.create"
  | "property.create"
  | "property.link_owner"
  | "documents.collect"
  | "rules.configure"
  | "lead.qualify"
  | "visit.schedule"
  | "proposal.create"
  | "listing.activate"
  | "contract.prepare"
  | "commission.settle"
  | "case.review";

export type ImobPropertyGoalV1 = "aluguel_por_temporada" | "locacao" | "venda";

export type ImobEntitySnapshotV1 = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

export type ImobOwnerSnapshotV1 = ImobEntitySnapshotV1 & {
  email?: string | null;
  phone?: string | null;
  document?: string | null;
};

export type ImobPropertySnapshotV1 = ImobEntitySnapshotV1 & {
  propertyType?: string | null;
  goal?: ImobPropertyGoalV1 | null;
  cep?: string | null;
  city?: string | null;
  address?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
};

export type ImobLeadSnapshotV1 = ImobEntitySnapshotV1 & {
  email?: string | null;
  phone?: string | null;
  desiredGoal?: ImobPropertyGoalV1 | null;
  desiredCity?: string | null;
  readinessScore?: number | null;
  readinessBand?: "HOT" | "WARM" | "COLD" | "UNKNOWN" | null;
};

export type ImobLeadMatchingSnapshotV1 = {
  status: "suggested" | "awaiting_candidate" | "no_match" | "insufficient_context";
  matchStrength: "high" | "medium" | "low" | "unknown";
  propertyId?: string | null;
  propertyLabel?: string | null;
  reasonCodes: string[];
  summary: string;
  recommendedNextMove: string;
};

export type ImobLeadLifecycleSnapshotV1 = {
  status: "active" | "disqualified" | "reengagement_ready";
  reason?: string | null;
  nextTrigger?: string | null;
  summary: string;
};

export type ImobMarketScanRecommendationSnapshotV1 = {
  sourceStatus: "completed" | "empty" | "unavailable";
  recommendedAction: ImobOperationalOpportunity["recommendedAction"];
  comparableCount: number;
  comparableSources?: Array<{
    providerId: string;
    source: string;
    count: number;
  }> | null;
  confidenceScore?: number | null;
  confidenceBand?: "high" | "medium" | "low" | "unknown" | null;
  liquiditySignal?: "high" | "medium" | "low" | "unknown" | null;
  pricingRisk?: "low" | "medium" | "high" | "unknown" | null;
  priceRange?: {
    min: number;
    max: number;
    currency: "BRL";
  } | null;
  summary: string;
  reasonCodes: string[];
  recommendedNextMove: string;
};
export type ImobCaseBlockerV1 = {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type ImobCaseContextV1 = {
  version: "1.0";
  tenantId: string;
  workspaceId: string;
  caseId: string;
  missionContext?: {
    mission: ImobCaseMission;
    defaultGoal?: ImobPropertyGoalV1 | null;
    startedFromMessage?: string | null;
    recipeId?: string | null;
    lockedUntilExplicitChange: boolean;
  };
  entities: {
    owner?: ImobOwnerSnapshotV1 | null;
    property?: ImobPropertySnapshotV1 | null;
    lead?: ImobLeadSnapshotV1 | null;
    visit?: ImobEntitySnapshotV1 | null;
    proposal?: ImobEntitySnapshotV1 | null;
    documents?: ImobEntitySnapshotV1 | null;
    campaign?: ImobEntitySnapshotV1 | null;
    contract?: ImobEntitySnapshotV1 | null;
    commission?: ImobEntitySnapshotV1 | null;
  };
  leadMatching?: ImobLeadMatchingSnapshotV1 | null;
  leadLifecycle?: ImobLeadLifecycleSnapshotV1 | null;
  marketScanRecommendation?: ImobMarketScanRecommendationSnapshotV1 | null;
  links: {
    ownerProperty?: {
      ownerId?: string | null;
      propertyId?: string | null;
      status: "missing" | "pending_confirmation" | "linked" | "ambiguous";
    };
  };
  readiness: {
    ownerReady: boolean;
    propertyReady: boolean;
    leadReady: boolean;
    leadReadinessScore: number | null;
    documentsReady: boolean;
    seasonalRulesReady: boolean;
    operationalReady: boolean;
  };
  blockers: ImobCaseBlockerV1[];
  canonicalCaseState?: ImobCaseState | null;
  legacyCompatibility?: {
    migratedFromLegacy: boolean;
    sourceFlow?: string | null;
    sourceMission?: ImobCaseMission | null;
  };
  recoverySnapshot?: ImobCaseRecoverySnapshotV1 | null;
  crmProjection?: ImobCrmCaseProjectionV1 | null;
};

export type ImobCasePlanActionV1 = {
  id: string;
  label: string;
  operation: ImobCaseActionId;
  nextMessage: string;
  kind: "primary" | "secondary" | "neutral";
  reasonCode?: string;
};

export type ImobCasePlanV1 = {
  version: "1.0";
  mission: ImobCaseMission;
  stage: ImobCaseStage;
  resolved: {
    owner: boolean;
    property: boolean;
    ownerLinkedToProperty: boolean;
    lead: boolean;
    documents: boolean;
    seasonalRules: boolean;
    visit: boolean;
    proposal: boolean;
    contract: boolean;
    commission: boolean;
  };
  blockers: ImobCaseBlockerV1[];
  primaryAction: ImobCasePlanActionV1 | null;
  secondaryActions: ImobCasePlanActionV1[];
  suppressedActions: ImobCaseActionId[];
};

export type ImobRecoveryIntentV1 =
  | "consult_case"
  | "resume_case"
  | "what_is_missing"
  | "next_step";

export type ImobCaseRecoverySnapshotV1 = {
  version: "1.0";
  mission: ImobCaseMission;
  stage: ImobCaseStage;
  blockers: ImobCaseBlockerV1[];
  missingItems: string[];
  primaryAction: ImobCasePlanActionV1 | null;
  secondaryActions: ImobCasePlanActionV1[];
  supportedIntents: ImobRecoveryIntentV1[];
  safeFallbackAction: ImobCasePlanActionV1;
  reasonCode:
    | "RECOVERY_READY"
    | "RECOVERY_BLOCKED"
    | "RECOVERY_MISSING_ITEMS"
    | "RECOVERY_NEXT_STEP_UNRESOLVED";
};

export type ImobCrmQueueIdV1 =
  | "dedupe_queue"
  | "proof_queue"
  | "next_action_queue"
  | "blocker_queue";

export type ImobCrmQueueItemV1 = {
  queueId: ImobCrmQueueIdV1;
  caseId: string;
  reasonCode: string;
  summary: string;
};

export type ImobCrmCaseCardV1 = {
  tenantId: string;
  workspaceId: string;
  caseId: string;
  mission: ImobMissionId;
  missionStatus: MissionStatus;
  currentOperation: ImobOperation;
  ownerAgent: "IMOB_Orchestrator";
  targetAgent?: ImobInternalAgentId;
  readiness: {
    owner?: ReadinessStatus;
    property?: ReadinessStatus;
    lead?: ReadinessStatus;
    visit?: ReadinessStatus;
    documents?: ReadinessStatus;
    proof?: ReadinessStatus;
  };
  blockers: ImobBlocker[];
  nextAction: ImobNextAction | null;
  proofStatus: "not_required" | "missing" | "satisfied";
  lastActivityAt: string;
};

export type ImobCrmCaseProjectionV1 = {
  version: "1.0";
  caseCard: ImobCrmCaseCardV1;
  queues: ImobCrmQueueItemV1[];
  derivedFrom: "canonical_case_state";
};

export type ImobRecoveryResponseV1 = {
  version: "1.0";
  intent: ImobRecoveryIntentV1;
  title: string;
  summary: string;
  blockers: ImobCaseBlockerV1[];
  missingItems: string[];
  primaryAction: ImobCasePlanActionV1 | null;
  secondaryActions: ImobCasePlanActionV1[];
  safeFallbackAction: ImobCasePlanActionV1;
  reasonCode:
    | "RECOVERY_CASE_SUMMARY_READY"
    | "RECOVERY_RESUME_READY"
    | "RECOVERY_MISSING_ITEMS_READY"
    | "RECOVERY_NEXT_STEP_READY";
};
