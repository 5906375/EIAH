import type { ImobCrmPropertyGoal } from "./imobCrmPropertyGoals";
import type { ImobCrmPropertyType } from "./imobCrmPropertyTypes";
import type { ImobReasonCode } from "../control/imobReasonCodeCatalog";
import type { ImobLeadDiscoverySignals } from "../imobConversationContract";

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
