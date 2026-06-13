import { z } from "zod";

// Source of truth operacional do contrato minimo multi-vertical para atribuicao
// de responsavel, antes de qualquer migration de schema.

export const responsibleActorVerticalKeySchema = z.enum(["IMOB", "LEGAL"]);

export const responsibleActorEntityTypeSchema = z.enum([
  "imob.case",
  "imob.lead",
  "imob.property",
  "legal.document",
  "legal.opinion",
]);

export const responsibleActorEntitlementStatusSchema = z.enum([
  "active",
  "suspended",
  "past_due",
  "inactive",
]);

const entityTypesByVertical = {
  IMOB: ["imob.case", "imob.lead", "imob.property"],
  LEGAL: ["legal.document", "legal.opinion"],
} as const satisfies Record<
  z.infer<typeof responsibleActorVerticalKeySchema>,
  readonly z.infer<typeof responsibleActorEntityTypeSchema>[]
>;

export const responsibleActorAssignmentContractSchema = z
  .object({
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1),
    verticalKey: responsibleActorVerticalKeySchema,
    entityType: responsibleActorEntityTypeSchema,
    entityId: z.string().min(1),
    entitlementStatus: responsibleActorEntitlementStatusSchema.default("active"),
    responsibleUserId: z.string().min(1).optional(),
    responsibleMemberId: z.string().min(1).optional(),
    policyVersion: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const allowedEntityTypes = entityTypesByVertical[value.verticalKey];
    if (!allowedEntityTypes.includes(value.entityType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entityType"],
        message: `entityType ${value.entityType} is not valid for verticalKey ${value.verticalKey}`,
      });
    }

    if (!value.responsibleUserId && !value.responsibleMemberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsibleUserId"],
        message: "responsibleUserId or responsibleMemberId is required",
      });
    }
  });

export type ResponsibleActorVerticalKey = z.infer<typeof responsibleActorVerticalKeySchema>;
export type ResponsibleActorEntityType = z.infer<typeof responsibleActorEntityTypeSchema>;
export type ResponsibleActorEntitlementStatus = z.infer<typeof responsibleActorEntitlementStatusSchema>;
export type ResponsibleActorAssignmentContract = z.infer<typeof responsibleActorAssignmentContractSchema>;

export function buildResponsibleActorAssignmentContract(input: unknown): ResponsibleActorAssignmentContract {
  return responsibleActorAssignmentContractSchema.parse(input);
}

