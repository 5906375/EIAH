export type ImobMissionId =
  | "capture_seasonal_property"
  | "capture_rental_property"
  | "capture_sale_property"
  | "qualify_and_match_lead"
  | "schedule_and_follow_visit"
  | "collect_documents"
  | "prepare_contract"
  | "settle_commission"
  | "commercial_activation"
  | "case_review";

export type ImobMissionTier = "p0" | "p1" | "p2";

export type MissionSteps = {
  capture_seasonal_property:
    | "collecting_owner"
    | "registering_property"
    | "owner_property_linking"
    | "verifying_docs"
    | "needs_rework"
    | "final_review";
  capture_rental_property:
    | "collecting_owner"
    | "registering_property"
    | "owner_property_linking"
    | "rental_checklist"
    | "needs_rework"
    | "final_review";
  capture_sale_property:
    | "collecting_owner"
    | "registering_property"
    | "owner_property_linking"
    | "sale_checklist"
    | "needs_rework"
    | "final_review";
  qualify_and_match_lead:
    | "gathering_signals"
    | "scoring"
    | "matching_inventory"
    | "awaiting_more_info"
    | "no_match_found"
    | "disqualified"
    | "ready_for_visit";
  schedule_and_follow_visit:
    | "selecting_slot"
    | "confirming_participants"
    | "scheduled"
    | "rescheduling"
    | "cancelled"
    | "no_show"
    | "post_visit"
    | "needs_reengagement";
  collect_documents:
    | "collecting"
    | "classifying"
    | "validating_sufficiency"
    | "missing_documents"
    | "package_ready";
  prepare_contract:
    | "checking_document_sufficiency"
    | "drafting"
    | "legal_handoff"
    | "needs_document_rework"
    | "ready_for_signature";
  settle_commission:
    | "calculating_basis"
    | "awaiting_approval"
    | "settlement_ready"
    | "reconciled"
    | "blocked_by_policy";
  commercial_activation:
    | "drafting_campaign"
    | "awaiting_human_approval"
    | "ready_to_publish"
    | "published_or_sent"
    | "blocked_by_policy";
  case_review:
    | "generating_snapshot"
    | "snapshot_ready";
};

export type ImobMissionStep<M extends ImobMissionId> = MissionSteps[M];

export type ImobOperation =
  | "owner"
  | "property"
  | "lead"
  | "market"
  | "documents"
  | "visit"
  | "campaign"
  | "contract"
  | "commission"
  | "case"
  | "proof";

export type MissionStatus =
  | "draft"
  | "in_progress"
  | "blocked"
  | "ready_for_transition"
  | "done";

export type ReadinessStatus =
  | "ready"
  | "incomplete"
  | "blocked"
  | "not_applicable";

export type ImobBlocker = {
  code: string;
  message: string;
};

export type PendingField = {
  field: string;
  label?: string | null;
};

export type ImobNextAction = {
  id: string;
  label: string;
  operation: ImobOperation;
  targetAgent: string;
  reasonCode: string;
  requiredInput?: PendingField[];
};

export type ImobCaseState<M extends ImobMissionId = ImobMissionId> = {
  schemaVersion: 1;
  tenantId: string;
  workspaceId: string;
  caseId: string;
  mission: M;
  missionStatus: MissionStatus;
  currentStep: MissionSteps[M];
  currentOperation: ImobOperation;
  entities: {
    ownerId?: string;
    propertyId?: string;
    leadId?: string;
    visitId?: string;
    documentPackageId?: string;
    campaignId?: string;
    contractId?: string;
    commissionId?: string;
  };
  readiness: {
    owner?: ReadinessStatus;
    property?: ReadinessStatus;
    lead?: ReadinessStatus;
    visit?: ReadinessStatus;
    documents?: ReadinessStatus;
    campaign?: ReadinessStatus;
    contract?: ReadinessStatus;
    commission?: ReadinessStatus;
    proof?: ReadinessStatus;
  };
  blockers: ImobBlocker[];
  pendingFields: PendingField[];
  nextAction: ImobNextAction;
  proof: {
    required: boolean;
    minimumProofSatisfied: boolean;
    missingProof: string[];
    evidenceBundleId?: string;
    snapshotId?: string;
    snapshotVersion?: number;
    receiptId?: string;
    ledgerTxId?: string;
  };
  audit: {
    version: number;
    lastRunId?: string;
    lastUpdatedAt: string;
    updatedByAgent: string;
  };
};

export type CaseStateUpdateCommand<M extends ImobMissionId = ImobMissionId> = {
  tenantId?: string;
  workspaceId?: string;
  caseId?: string;
  expectedVersion: number;
  patch: Partial<ImobCaseState<M>>;
  reasonCode: string;
  runId?: string;
  updatedByAgent: string;
  commandId?: string;
  idempotencyKey?: string;
};

export type CaseStateUpdateResult =
  | {
      ok: true;
      state: ImobCaseState;
      newVersion: number;
    }
  | {
      ok: false;
      reasonCode:
        | "CASE_VERSION_CONFLICT"
        | "CASE_STATE_INCONSISTENT"
        | "MISSING_TENANT_ID"
        | "MISSING_WORKSPACE_ID"
        | "MISSING_CASE_ID";
      latestState?: ImobCaseState;
    };

export type SideEffectCommand = {
  commandId: string;
  idempotencyKey: string;
  operation: ImobOperation;
  caseId: string;
  mission: ImobMissionId;
  step: string;
  targetAgent: string;
};

export type SideEffectDispatchGuardResult =
  | { ok: true; reservedCommand: SideEffectCommand }
  | {
      ok: false;
      reasonCode:
        | "CASE_VERSION_CONFLICT"
        | "DUPLICATE_SIDE_EFFECT_BLOCKED"
        | "MISSING_IDEMPOTENCY_KEY"
        | "NO_AGENT_FOR_OPERATION";
    };

export type ImobMissionPolicy = {
  mission: ImobMissionId;
  requiredEntities: string[];
  requiredProof: string[];
  allowedOperations: ImobOperation[];
  criticalActions: string[];
  humanApprovalRequired?: boolean;
  txIdRequired?: boolean;
  missionTier: ImobMissionTier;
};

export type ProofGateResult =
  | {
      ok: true;
      minimumProofSatisfied: true;
    }
  | {
      ok: false;
      minimumProofSatisfied: false;
      reasonCode: "MISSING_REQUIRED_PROOF";
      missingProof: string[];
    };
