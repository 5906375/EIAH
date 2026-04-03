import crypto from "node:crypto";
import { z } from "zod";
import { experienceSurfaceIdSchema, type ExperienceSurfaceId } from "./experienceSurfaceContract";

// Source of truth operacional do contrato auditável do resolver.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const resolverAuditDecisionTypeSchema = z.enum([
  "landing_resolved",
  "recommended_action.aligned",
  "recommended_action.diverged",
  "investigation_mode.entered",
  "investigation_mode.exited",
  "investigation_mode.changed",
]);

export const resolverAuditFallbackModeSchema = z.enum([
  "fail_closed",
  "core_safe_default",
  "context_incomplete",
]);

export const resolverAuditRoleSchema = z.enum([
  "workspace_member",
  "workspace_admin",
  "tenant_admin",
  "founder_global",
  "service_operator",
]);

export const resolverAuditActiveDomainSchema = z.enum(["core", "imob"]);

export const ResolverAuditEventSchema = z.object({
  eventId: z.string().min(1),
  resolverVersion: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  role: resolverAuditRoleSchema,
  activeDomain: resolverAuditActiveDomainSchema,
  installedProducts: z.array(z.string().min(1)),
  surfaceId: experienceSurfaceIdSchema,
  decisionType: resolverAuditDecisionTypeSchema,
  decisionValue: z.string().min(1),
  fallbackMode: resolverAuditFallbackModeSchema,
  fromMode: z.string().min(1).optional(),
  toMode: z.string().min(1).optional(),
  reasonCodes: z.array(z.string().min(1)).optional(),
  traceId: z.string().min(1).optional(),
  occurredAt: z.string().datetime(),
});

export type ResolverAuditEvent = z.infer<typeof ResolverAuditEventSchema>;
export type ResolverAuditSurfaceId = ExperienceSurfaceId;
export type ResolverAuditDecisionType = z.infer<typeof resolverAuditDecisionTypeSchema>;

export const InvestigationModeAuditRequestSchema = z.object({
  auditType: z.literal("investigation_mode").optional(),
  surfaceId: z.enum(["runs", "billing"]),
  action: z.enum(["entered", "exited", "changed"]),
  fromMode: z.string().trim().min(1).max(80).optional(),
  toMode: z.string().trim().min(1).max(80).optional(),
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InvestigationModeAuditRequest = z.infer<typeof InvestigationModeAuditRequestSchema>;

export const LandingActionAlignmentAuditRequestSchema = z.object({
  auditType: z.literal("landing_action_alignment"),
  surfaceId: experienceSurfaceIdSchema,
  action: z.enum(["aligned", "diverged"]),
  landingPath: z.string().trim().min(1),
  primaryActionId: z.string().trim().min(1).max(120).optional(),
  primaryActionPath: z.string().trim().min(1).optional(),
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ExperienceAuditRequestSchema = z.union([
  InvestigationModeAuditRequestSchema,
  LandingActionAlignmentAuditRequestSchema,
]);

export type LandingActionAlignmentAuditRequest = z.infer<typeof LandingActionAlignmentAuditRequestSchema>;
export type ExperienceAuditRequest = z.infer<typeof ExperienceAuditRequestSchema>;

export function buildResolverAuditEvent(
  input: Omit<ResolverAuditEvent, "eventId" | "occurredAt">
): ResolverAuditEvent {
  return ResolverAuditEventSchema.parse({
    ...input,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  });
}
