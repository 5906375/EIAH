import type { ImobCrmPropertyType } from "./crm/imobCrmPropertyTypes";
import type { ImobReasonCode } from "./control/imobReasonCodeCatalog";

export type ImobConversationMode = "consult" | "search" | "execute" | "search_knowledge" | "blocked";

export type ImobBackingSpecialistKey =
  | "commercial_intelligence"
  | "daily_ops"
  | "legal"
  | "financial"
  | "audit";

export type ImobChatWidgetKind =
  | "commercial_home"
  | "daily_routine"
  | "inventory_showcase"
  | "lead_summary"
  | "case_summary"
  | "proposal_summary"
  | "document_checklist"
  | "print_bundle";

export type ImobBackingSpecialistContract = {
  key: ImobBackingSpecialistKey;
  primaryAgentId: string;
  responsibility: string;
  visibleToUserByDefault: false;
  escalationTriggers: string[];
};

export type ImobBackingSpecialistOutputType =
  | "advice"
  | "validation"
  | "evidence"
  | "financial_check"
  | "operational_support";

export type ImobBackingSpecialistReasonCode = ImobReasonCode;

export type ImobResolvedBackingSpecialist = ImobBackingSpecialistContract & {
  rationale: string;
  reasonCode?: ImobBackingSpecialistReasonCode;
  suggestedAction?: string | null;
  urgency?: "low" | "medium" | "high" | null;
  outputType?: ImobBackingSpecialistOutputType;
  requiredContext?: string[];
  ownershipBoundary?: string | null;
};

export type ImobChatExperienceContract = {
  sourceOfTruth: "imob_orchestrator_contract";
  visibleAgentId: "IMOB";
  dashboardRole: "managerial_console";
  marketplaceRole: "activation_only";
  widgets: ImobChatWidgetKind[];
  backingSpecialists: ImobBackingSpecialistContract[];
};

export type ImobConversationIntent =
  | "discover_rent"
  | "discover_sale"
  | "refine_search"
  | "knowledge_search"
  | "operational";

export type ImobPropertyType = ImobCrmPropertyType | null;

export type ImobSearchSlots = {
  goal: "locacao" | "venda" | "aluguel_por_temporada" | null;
  city: string | null;
  region: string | null;
  neighborhood: string | null;
  budgetMax: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: ImobPropertyType;
};

export type ImobPendingSlot =
  | "none"
  | "city"
  | "budget"
  | "bedrooms"
  | "bathrooms"
  | "propertyType";

export type ImobThreadConversationState = {
  slots: ImobSearchSlots;
  mode: ImobConversationMode;
  pendingSlot: ImobPendingSlot;
  resultOffset: number;
  operational?: ImobOperationalState | null;
};

export type ImobIntent = "capture" | "match" | "lead" | "visit" | "listing" | "documents" | "proposal" | "deal" | "contract" | "rules" | "commission" | "adjustment";

export type ImobOperationalFlow =
  | "owner.create"
  | "property.create"
  | "listing.activate"
  | "lead.qualify"
  | "visit.schedule"
  | "documents.collect"
  | "proposal.create"
  | "deal.review"
  | "contract.prepare"
  | "rules.configure"
  | "commission.settle"
  | "adjustment.apply";

export type ImobOwnerPersona = "proprietario" | "vendedor" | "locador";

export type ImobOwnerDraft = {
  ownerPersona: ImobOwnerPersona;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerDocument: string | null;
};

export type ImobLeadPersona = "lead" | "comprador" | "locatario";

export type ImobLeadDraft = {
  leadPersona: ImobLeadPersona;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  desiredGoal: "locacao" | "venda" | "aluguel_por_temporada" | null;
  desiredCity: string | null;
  budgetMax: number | null;
};

export type ImobProposalDraft = {
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  propertyId: string | null;
  offerAmount: number | null;
  contractType: "rent" | "sale" | "management" | null;
};

export type ImobPropertyDraft = {
  propertyId: string | null;
  propertyType: ImobPropertyType;
  goal: "locacao" | "venda" | "aluguel_por_temporada" | null;
  cep: string | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
};

export type ImobVisitDraft = {
  propertyId: string | null;
  visitorName: string | null;
  visitorPhone: string | null;
  preferredDate: string | null;
  preferredWindow: "manha" | "tarde" | "noite" | null;
};

export type ImobListingDraft = {
  propertyId: string | null;
  listingTitle: string | null;
  publicationChannels: string[];
  askingPrice: number | null;
  publicationGoal: "locacao" | "venda" | null;
};

export type ImobDocumentDraft = {
  referenceId: string | null;
  subjectType: "owner" | "property" | "lead" | "proposal" | "contract" | null;
  documentTypes: string[];
  deliveryChannel: "upload" | "email" | "whatsapp" | "drive" | null;
};

export type ImobContractDraft = {
  propertyId: string | null;
  ownerName: string | null;
  counterpartyName: string | null;
  contractType: "rent" | "sale" | "management" | null;
  documentPacketStatus: "pending" | "ready" | null;
  handoffTarget: "LEGAL" | null;
  approvalRequired: boolean;
};

export type ImobRulesDraft = {
  propertyId: string | null;
  propertyFinality: "aluguel_por_temporada" | "locacao" | "venda" | null;
  checkin: string | null;
  checkout: string | null;
  minHospedes: number | null;
  maxHospedes: number | null;
  regras: string | null;
  outrasRegras: string | null;
};

export type ImobDealDraft = {
  dealId: string | null;
  propertyId: string | null;
  reviewStage: "proposal" | "documentation" | "contract" | "closing" | null;
  blockers: string[];
  handoffTarget: "LEGAL" | "FINANCE" | "IMOB_OPS" | null;
  approvalRequired: boolean;
};

export type ImobCommissionDraft = {
  dealId: string | null;
  brokerRef: string | null;
  amountCents: number | null;
  settlementStatus: "pending" | "ready" | "paid" | null;
  payoutChannel: "pix" | "ted" | "boleto" | null;
  approvalRequired: boolean;
};

export type ImobOperationalState = {
  flow: "owner.create" | "property.create" | "lead.qualify" | "visit.schedule" | "listing.activate" | "documents.collect" | "proposal.create" | "deal.review" | "contract.prepare" | "rules.configure" | "commission.settle";
  status: "collecting" | "ready_for_review";
  pendingFields: string[];
  ownerDraft?: ImobOwnerDraft;
  propertyDraft?: ImobPropertyDraft;
  leadDraft?: ImobLeadDraft;
  visitDraft?: ImobVisitDraft;
  listingDraft?: ImobListingDraft;
  documentDraft?: ImobDocumentDraft;
  proposalDraft?: ImobProposalDraft;
  dealDraft?: ImobDealDraft;
  contractDraft?: ImobContractDraft;
  rulesDraft?: ImobRulesDraft;
  commissionDraft?: ImobCommissionDraft;
};

export type ImobKnowledgeSourceFilter = "drive" | "upload" | "web" | "internal_doc";

export type ImobAccessContext = {
  tenantId?: string | null;
  workspaceId?: string | null;
  entitlements?: {
    REAL_ESTATE_CORE?: boolean;
    IMOB_INSTALLED?: boolean;
  } | null;
};

import type { ParsedImobIntent } from "./imobIntentCatalog";

export type ImobResolveTurnRequest = {
  message: string;
  semanticIntent?: ParsedImobIntent | null;
  semanticIntentSource?: "openai" | "parser_fallback" | null;
  threadLabel?: string | null;
  threadId?: string | null;
  caseId?: string | null;
  threadState?: ImobThreadConversationState | null;
  access?: ImobAccessContext;
};

export type ImobAttachmentCrmSuggestionMode = "include" | "edit" | "discard";

export type ImobAttachmentCrmSuggestionField = {
  field: "name" | "document" | "rg";
  label: string;
  currentValue?: string | null;
  suggestedValue?: string | null;
};

export type ImobAttachmentCrmSuggestion = {
  entityType: "owner";
  ownerId: string;
  ownerName: string;
  fields: ImobAttachmentCrmSuggestionField[];
  documentIds: string[];
  availableModes: ImobAttachmentCrmSuggestionMode[];
};

export type ImobPresentationCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  href?: string;
  action?:
    | "confirm_execution"
    | "reject_execution"
    | "export_contract_pdf"
    | "continue_inventory_search"
    | "apply_attachment_crm_include"
    | "apply_attachment_crm_edit"
    | "apply_attachment_crm_discard"
    | "open_attachment_menu"
    | "send_suggested_message"
    | "print_card";
  nextMessage?: string;
  payload?: Record<string, unknown>;
};

export type ImobPresentationCard = {
  title: string;
  lines: string[];
  ctas?: ImobPresentationCta[];
  actionsLayout?: "inline";
};

export type ImobPresentationBlockPhase = "pre_execution" | "post_success";

export type ImobPresentationBlock = {
  kind: "confirmation" | "next_actions" | "summary" | "details";
  title?: string;
  text?: string;
  lines?: string[];
  ctas?: ImobPresentationCta[];
  actionsLayout?: "inline";
  persistent?: boolean;
  phase?: ImobPresentationBlockPhase;
};

export type ImobCommercialHomeWidget = {
  kind: "commercial_home";
  title: string;
  subtitle: string;
  quickActions: Array<{
    id: string;
    title: string;
    summary: string;
    autoprompt: string;
  }>;
  priorities?: Array<{
    id: string;
    title: string;
    detail: string;
    autoprompt: string;
  }>;
};

export type ImobInventoryShowcaseWidget = {
  kind: "inventory_showcase";
  title: string;
  subtitle?: string;
  items: Array<ImobInventoryOption & { autoprompt?: string | null }>;
};

export type ImobCaseSummaryWidget = {
  kind: "case_summary";
  title: string;
  journeyLabel: string;
  stageLabel: string;
  nextStep?: string | null;
  blocker?: string | null;
  recommendedActions: Array<{
    id: string;
    label: string;
    autoprompt?: string | null;
  }>;
  specialists: ImobResolvedBackingSpecialist[];
};

export type ImobDocumentChecklistWidget = {
  kind: "document_checklist";
  title: string;
  checklist: string[];
  blocker?: string | null;
  nextStep?: string | null;
  specialists: ImobResolvedBackingSpecialist[];
};

export type ImobPrintBundleWidget = {
  kind: "print_bundle";
  title: string;
  items: Array<{
    label: string;
    value: string;
  }>;
};

export type ImobPresentationWidget =
  | ImobCommercialHomeWidget
  | ImobInventoryShowcaseWidget
  | ImobCaseSummaryWidget
  | ImobDocumentChecklistWidget
  | ImobPrintBundleWidget;

export type ImobPresentationFormFieldOption = {
  value: string;
  label: string;
  group?: string;
};

export type ImobPresentationFormFieldLookup = {
  kind: "cep";
  autoFillTargets: Partial<Record<"address" | "city" | "neighborhood", string>>;
};

export type ImobPresentationFormField = {
  name: string;
  label: string;
  type: "text" | "tel" | "email" | "select";
  required?: boolean;
  placeholder?: string;
  value?: string | null;
  helperText?: string;
  allowAttachment?: boolean;
  attachmentLabel?: string;
  inputMode?: "text" | "numeric";
  maxLength?: number;
  options?: ImobPresentationFormFieldOption[];
  lookup?: ImobPresentationFormFieldLookup;
};

export type ImobPresentationFormAction = {
  id: "cancel" | "submit";
  label: string;
  kind?: "primary" | "secondary" | "neutral";
};

export type ImobPresentationForm = {
  entity: string;
  action: string;
  label: string;
  description?: string;
  subjectId?: string;
  fields: ImobPresentationFormField[];
  actions?: ImobPresentationFormAction[];
};

export type ImobExecutionRequest = {
  intent: ImobIntent;
  operation: ImobOperationalFlow;
  action: string;
  prompt: string;
  input: Record<string, unknown>;
};

export type ImobSearchInventoryRequest = {
  query: string;
  region?: string | null;
  segment?: "locacao" | "venda" | "ambos" | null;
  slots?: Partial<ImobSearchSlots> | null;
  offset?: number;
  limit?: number;
};

export type ImobInventoryOption = {
  id: string;
  title: string;
  city: string;
  region: string;
  neighborhood?: string;
  segment: "locacao" | "venda";
  priceLabel: string;
  priceAmount?: number | null;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
};

export type ImobSearchInventoryResponse = {
  query: string;
  region: string;
  segment: "locacao" | "venda" | "ambos";
  items: ImobInventoryOption[];
  total: number;
  offset: number;
  limit: number;
  presentation: {
    text: string;
    card?: ImobPresentationCard;
    widget?: ImobPresentationWidget;
  };
};

export type ImobOperationalOwner = "Corretor" | "Jurídico" | "Financeiro" | "Cliente" | "IMOB Ops";

export type ImobCaseJourneyType =
  | "property_capture"
  | "lead_qualification"
  | "proposal"
  | "visit_follow_up"
  | "negotiation"
  | "documentation"
  | "contract"
  | "closing"
  | "commission"
  | "temporada_rules"
  | "operations";

export type ImobCasePartyRole =
  | "broker"
  | "manager"
  | "owner"
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord"
  | "operator";

export type ImobCaseCommercialGoal =
  | "captacao"
  | "qualificacao"
  | "proposta"
  | "visita"
  | "negociacao"
  | "documentacao"
  | "contrato"
  | "fechamento"
  | "comissao"
  | "temporada"
  | "operacao";

export type ImobCaseRecommendedAction = {
  id: string;
  label: string;
  actionType: "consultive" | "operational" | "governed";
  inputHint?: string;
  reasonCode?: ImobReasonCode;
};

export type ImobCanonicalCase = {
  journeyType?: ImobCaseJourneyType;
  partyRole?: ImobCasePartyRole;
  commercialGoal?: ImobCaseCommercialGoal;
  recommendedActions?: ImobCaseRecommendedAction[];
  blockedActions?: string[];
  missingContext?: string[];
  reasonCodes?: ImobReasonCode[];
};

export type ImobHumanJourneyPhase =
  | "captacao"
  | "qualificacao"
  | "atendimento_ativo"
  | "visita"
  | "proposta"
  | "negociacao"
  | "documentacao"
  | "fechamento"
  | "pos_venda";

export type ImobHumanJourney = {
  phase: ImobHumanJourneyPhase;
  phaseObjective: string;
};

export type ImobHumanWorkflow = {
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

export type ImobCaseContext = {
  caseId: string;
  flow: ImobOperationalFlow;
  stage: string;
  status: string;
  ownerResponsible?: ImobOperationalOwner | null;
  nextStep?: string | null;
  blocker?: string | null;
  pendingItems?: string[];
  threadId?: string | null;
  updatedAt?: string;
  canonical?: ImobCanonicalCase;
  humanJourney?: ImobHumanJourney | null;
  humanWorkflow?: ImobHumanWorkflow | null;
};

export type ImobPresentationConfidence = {
  entity: ImobEntityKey | null;
  source?: "openai" | "parser_fallback";
  action: ImobActionKey | null;
  matchedEntityAlias: string | null;
  matchedActionAlias: string | null;
  entityScore: number;
  actionScore: number;
  pluralityHint: "singular" | "plural" | null;
  canonicalLabel: string | null;
  lowConfidence?: boolean;
};

export type ImobPresentationChoiceStyle = "inline";

export type ImobPresentationMetadata = {
  confidence?: ImobPresentationConfidence;
  choiceStyle?: ImobPresentationChoiceStyle;
};

export type ImobCaseBrief = {
  summary: string;
  phaseObjective?: string | null;
  primaryRisk?: string | null;
  waitingOn?: ImobHumanWorkflow["waitingOn"];
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

export type ImobOperationalPresentation = {
  text: string;
  metadata?: ImobPresentationMetadata;
  card?: ImobPresentationCard;
  blocks?: ImobPresentationBlock[];
  widget?: ImobPresentationWidget;
  form?: ImobPresentationForm;
  suggestedNextAction?: string;
  owner?: ImobOperationalOwner;
  nextStep?: string;
  blocker?: string | null;
  caseBrief?: ImobCaseBrief;
  preparedFollowUp?: ImobPreparedFollowUp;
  actionableChecklist?: ImobActionableChecklist;
  handoffPack?: ImobHandoffPack;
  pendingFieldLabels?: string[];
  dedupeKey?: string;
};

export type ImobAttachmentValidationComparisonStatus = "confere" | "diverge" | "ilegivel";
export type ImobAttachmentValidationDecision = "approved" | "review_needed";

export type ImobAttachmentValidationFieldResult = {
  field: "nome" | "cpf" | "rg";
  label: string;
  status: ImobAttachmentValidationComparisonStatus;
  extractedValue?: string | null;
  caseValue?: string | null;
  note?: string;
};

export const IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT = {
  id: "imob.identity_document_validation.v2",
  acceptedKinds: ["identity_document", "supporting_photo"],
  supportedMimeTypesForAutoValidation: ["text/plain", "application/pdf", "image/png", "image/jpeg"],
  extractedFields: ["nome", "cpf", "rg"],
  comparisonStatuses: ["confere", "diverge", "ilegivel"],
  decisions: ["approved", "review_needed"],
  autoApprovalRule: {
    description: "Aprovar automaticamente apenas quando nome confere e ao menos um identificador documental disponível no caso confere sem divergência crítica.",
    required: ["nome"],
    oneOf: ["cpf", "rg"],
    fallback: "review_needed",
  },
  biometricValidation: "not_in_scope",
} as const;

export type ImobResolveTurnResponse = {
  mode: ImobConversationMode;
  action: string;
  threadLabel: string;
  conversationState: ImobThreadConversationState;
  presentation: ImobOperationalPresentation;
  caseContext?: ImobCaseContext;
  executionRequest?: ImobExecutionRequest;
  searchRequest?: ImobSearchInventoryRequest;
  knowledgeRequest?: {
    query: string;
    filters: {
      region?: string | null;
      segment?: "locacao" | "venda" | "ambos" | null;
      sourceTypes?: ImobKnowledgeSourceFilter[];
    };
  };
};

export const IMOB_MAX_USER_OPTIONS = 3;

export function createEmptyImobSlots(): ImobSearchSlots {
  return {
    goal: null,
    city: null,
    region: null,
    neighborhood: null,
    budgetMax: null,
    bedrooms: null,
    bathrooms: null,
    propertyType: null,
  };
}
