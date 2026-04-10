import type { ImobCrmPropertyGoal } from "./imobCrmPropertyGoals";
import type { ImobCrmPropertyType } from "./imobCrmPropertyTypes";

export type ImobCrmEntityType = "lead" | "owner" | "property" | "case";

export type ImobCrmTurnMode = "consult" | "execute";

export type ImobCrmConversationState = Record<string, unknown>;
export type ImobCrmTurnEntitlements = Record<string, unknown>;
export type ImobCrmRecommendedAction = {
  id: string;
  label: string;
  actionType: "consultive" | "operational" | "governed";
  inputHint?: string;
  reasonCode?: string;
};

export type ImobCrmCanonicalCase = {
  journeyType?: string;
  partyRole?: string;
  commercialGoal?: string;
  recommendedActions?: ImobCrmRecommendedAction[];
  blockedActions?: string[];
  missingContext?: string[];
  reasonCodes?: string[];
};

export type ImobCrmLeadSummary = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  goal?: ImobCrmPropertyGoal | null;
  targetCity?: string | null;
  budgetMaxCents?: number | null;
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
  reasonCode?: string;
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
