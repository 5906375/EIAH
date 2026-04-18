import { z } from "zod";
import { IMOB_REASON_CODE_VALUES } from "../services/imob/control/imobReasonCodeCatalog";

const optionalShortString = (max: number) => z.union([z.string().trim().min(1).max(max), z.null()]).optional();
const optionalStringArraySchema = z.array(z.string().trim().min(1).max(160)).max(100).optional();
const imobReasonCodeSchema = z.enum(IMOB_REASON_CODE_VALUES);

export const imobOwnerCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  document: optionalShortString(60),
  email: z.union([z.string().trim().email().max(160), z.null()]).optional(),
  phone: optionalShortString(40),
  personType: optionalShortString(40),
  status: optionalShortString(80),
  pendingItems: optionalStringArraySchema,
  metadata: z.unknown().optional(),
});

export const imobOwnerUpdateSchema = imobOwnerCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const imobPropertyCreateSchema = z.object({
  ownerId: optionalShortString(80),
  propertyType: optionalShortString(60),
  goal: optionalShortString(40),
  address: optionalShortString(240),
  city: optionalShortString(120),
  neighborhood: optionalShortString(120),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  areaM2: z.number().int().min(0).max(100000).optional(),
  garageSpots: z.number().int().min(0).max(100).optional(),
  askingPriceCents: z.number().int().min(0).max(1_000_000_000).optional(),
  description: optionalShortString(4000),
  status: optionalShortString(80),
  pendingItems: optionalStringArraySchema,
  metadata: z.unknown().optional(),
});

export const imobPropertyUpdateSchema = imobPropertyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const imobLeadCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  document: optionalShortString(60),
  email: z.union([z.string().trim().email().max(160), z.null()]).optional(),
  phone: optionalShortString(40),
  goal: optionalShortString(40),
  targetCity: optionalShortString(120),
  targetNeighborhood: optionalShortString(120),
  budgetMaxCents: z.number().int().min(0).max(1_000_000_000).optional(),
  stage: optionalShortString(80),
  temperature: optionalShortString(80),
  pendingItems: optionalStringArraySchema,
  metadata: z.unknown().optional(),
});

export const imobLeadUpdateSchema = imobLeadCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const imobCaseEventInputSchema = z.object({
  type: z.string().trim().min(1).max(120),
  actorType: z.string().trim().min(1).max(80),
  actorRef: optionalShortString(120),
  summary: z.string().trim().min(1).max(1000),
  evidenceRef: optionalShortString(160),
  payload: z.unknown().optional(),
  runId: optionalShortString(80),
});

export const imobCaseCreateSchema = z.object({
  threadId: optionalShortString(120),
  flow: z.string().trim().min(1).max(120),
  stage: z.string().trim().min(1).max(120),
  status: z.string().trim().min(1).max(120),
  ownerResponsible: optionalShortString(80),
  nextStep: optionalShortString(1000),
  blockers: optionalStringArraySchema,
  pendingItems: optionalStringArraySchema,
  ownerId: optionalShortString(80),
  propertyId: optionalShortString(80),
  leadId: optionalShortString(80),
  externalDealId: optionalShortString(120),
  metadata: z.unknown().optional(),
  initialEvent: imobCaseEventInputSchema.optional(),
});

export const imobAttachmentResolveSchema = z.object({
  caseId: optionalShortString(80),
  threadId: optionalShortString(120),
  conversationId: optionalShortString(120),
  documentIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
});

export const imobAttachmentCrmSuggestionApplySchema = z.object({
  caseId: optionalShortString(80),
  threadId: optionalShortString(120),
  conversationId: optionalShortString(120),
  documentIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  mode: z.enum(["include", "edit", "discard"]),
});

export const imobCaseUpdateSchema = z.object({
  threadId: optionalShortString(120),
  flow: optionalShortString(120),
  stage: optionalShortString(120),
  status: optionalShortString(120),
  ownerResponsible: optionalShortString(80),
  nextStep: optionalShortString(1000),
  blockers: optionalStringArraySchema,
  pendingItems: optionalStringArraySchema,
  ownerId: optionalShortString(80),
  propertyId: optionalShortString(80),
  leadId: optionalShortString(80),
  externalDealId: optionalShortString(120),
  metadata: z.unknown().optional(),
  eventSummary: optionalShortString(1000),
  eventType: optionalShortString(120),
  eventPayload: z.unknown().optional(),
  eventRunId: optionalShortString(80),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const imobFollowUpRunSchema = z.object({
  dryRun: z.boolean().optional(),
  onlyOverdue: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  caseId: optionalShortString(80),
});

export const imobApprovalActionSchema = z.object({
  caseId: z.string().trim().min(1).max(80),
  action: z.enum(["approve", "delegate", "escalate"]),
  reasonCode: imobReasonCodeSchema,
  specialistId: optionalShortString(80),
  delegatedTo: optionalShortString(160),
  escalationTarget: optionalShortString(160),
  note: optionalShortString(1000),
  evidenceRef: optionalShortString(240),
  evidenceRefs: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  runId: optionalShortString(80),
}).superRefine((value, ctx) => {
  if (value.action === "delegate" && !value.delegatedTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delegatedTo"],
      message: "delegatedTo is required when action is delegate",
    });
  }
  if (value.action === "escalate" && !value.escalationTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["escalationTarget"],
      message: "escalationTarget is required when action is escalate",
    });
  }
});
