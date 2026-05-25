export type MetadataLike = Record<string, unknown>;

export type OwnerInput = {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  personType?: string | null;
  status?: string | null;
  pendingItems?: string[];
  metadata?: unknown;
};

export type PropertyInput = {
  ownerId?: string | null;
  propertyType?: string | null;
  goal?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaM2?: number | null;
  garageSpots?: number | null;
  askingPriceCents?: number | null;
  description?: string | null;
  status?: string | null;
  pendingItems?: string[];
  metadata?: unknown;
};

export type LeadInput = {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  goal?: string | null;
  targetCity?: string | null;
  targetNeighborhood?: string | null;
  budgetMaxCents?: number | null;
  stage?: string | null;
  temperature?: string | null;
  pendingItems?: string[];
  metadata?: unknown;
};

export type CaseEventInput = {
  type?: string | null;
  actorType?: string | null;
  actorRef?: string | null;
  summary?: string | null;
  evidenceRef?: string | null;
  payload?: unknown;
  runId?: string | null;
};

export type CaseInput = {
  threadId?: string | null;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: string[];
  pendingItems?: string[];
  ownerId?: string | null;
  propertyId?: string | null;
  leadId?: string | null;
  externalDealId?: string | null;
  metadata?: unknown;
  initialEvent?: CaseEventInput;
  eventSummary?: string | null;
  eventType?: string | null;
  eventPayload?: unknown;
  eventRunId?: string | null;
  eventEvidenceRef?: string | null;
  eventActorType?: string | null;
  eventActorRef?: string | null;
};

export type ResolvedPresentation = {
  pendingFieldLabels?: unknown;
  blocker?: unknown;
  owner?: unknown;
  nextStep?: unknown;
  dedupeKey?: unknown;
  suggestedNextAction?: unknown;
  text?: unknown;
};

export type ResolvedTurnForCaseUpsert = any;

export type PropertyLookupRecord = {
  id: string;
  address?: string | null;
  city?: string | null;
  goal?: string | null;
  propertyType?: string | null;
  metadata?: unknown;
};

export type FormLike = Record<string, unknown> | undefined;
export type DraftLike = Record<string, unknown>;

export type LeadDraftLike = DraftLike & {
  leadName?: unknown;
  leadPhone?: unknown;
  leadEmail?: unknown;
  desiredGoal?: unknown;
  desiredCity?: unknown;
  budgetMax?: unknown;
};

export type OwnerDraftLike = DraftLike & {
  ownerName?: unknown;
  ownerPhone?: unknown;
  ownerEmail?: unknown;
  ownerDocument?: unknown;
};

export type PropertyDraftLike = DraftLike & {
  propertyType?: unknown;
  goal?: unknown;
  city?: unknown;
  neighborhood?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  address?: unknown;
};

export type LeadRecordLike = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  goal?: unknown;
  targetCity?: unknown;
  budgetMaxCents?: unknown;
};

export type OwnerRecordLike = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  document?: unknown;
};

export type PropertyRecordLike = {
  propertyType?: unknown;
  goal?: unknown;
  city?: unknown;
  neighborhood?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  address?: unknown;
};
