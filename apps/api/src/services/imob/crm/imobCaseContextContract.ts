export type ImobCaseMission =
  | "capture_seasonal_property"
  | "capture_rental_property"
  | "capture_sale_property"
  | "qualify_lead"
  | "schedule_visit"
  | "collect_documents"
  | "prepare_contract"
  | "settle_commission"
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
    documents?: ImobEntitySnapshotV1 | null;
    contract?: ImobEntitySnapshotV1 | null;
    commission?: ImobEntitySnapshotV1 | null;
  };
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
    documentsReady: boolean;
    seasonalRulesReady: boolean;
    operationalReady: boolean;
  };
  blockers: ImobCaseBlockerV1[];
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
