import { z } from "zod";
import { frictionEventSchema } from "./frictionEventContract";

// Source of truth operacional do snapshot agregado de fricção.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const frictionEventSummaryScopeSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  windowStart: z.coerce.date().nullable(),
});

export const frictionEventSummarySchema = z.object({
  scope: frictionEventSummaryScopeSchema,
  total: z.number().int().min(0),
  byKind: z.record(z.string(), z.number().int().min(0)),
  bySource: z.record(z.string(), z.number().int().min(0)),
  byDomain: z.record(z.string(), z.number().int().min(0)),
  bySurface: z.record(z.string(), z.number().int().min(0)),
  byReasonCode: z.record(z.string(), z.number().int().min(0)),
  byWorkspace: z.record(z.string(), z.number().int().min(0)),
  recentEvents: z.array(frictionEventSchema),
});

export type FrictionEventSummaryScope = z.infer<typeof frictionEventSummaryScopeSchema>;
export type FrictionEventSummary = z.infer<typeof frictionEventSummarySchema>;

export function buildFrictionEventSummary(input: FrictionEventSummary): FrictionEventSummary {
  return frictionEventSummarySchema.parse(input);
}
