import { z } from "zod";
import { experienceSurfaceIdSchema } from "./experienceSurfaceContract";
import { resolverAuditActiveDomainSchema, resolverAuditDecisionTypeSchema } from "./resolverAuditEvent";

// Source of truth operacional do contrato mínimo de fricção da plataforma.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const frictionSourceSchema = z.enum(["access_gate", "helpdesk", "resolver_audit"]);

export const frictionSeveritySchema = z.enum(["low", "medium", "high"]);

export const frictionKindSchema = z.enum([
  "access_denied",
  "chat_clarification_overuse",
  "chat_generic_fallback",
  "chat_too_systemic",
  "chat_natural_request_not_understood",
  "chat_unnecessary_run_creation",
  "investigation_mode_entered",
  "investigation_mode_exited",
  "investigation_mode_changed",
  "recommended_action_diverged",
]);

export const helpdeskUxIssueCategorySchema = z.enum([
  "clarification_overuse",
  "generic_fallback",
  "too_systemic",
  "natural_request_not_understood",
  "unnecessary_run_creation",
  "healthy_or_inconclusive",
]);

export const frictionEventSchema = z.object({
  eventId: z.string().min(1),
  source: frictionSourceSchema,
  kind: frictionKindSchema,
  severity: frictionSeveritySchema,
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  activeDomain: resolverAuditActiveDomainSchema.optional(),
  surfaceId: experienceSurfaceIdSchema.optional(),
  reasonCode: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  summary: z.string().min(1),
  occurredAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FrictionKind = z.infer<typeof frictionKindSchema>;
export type FrictionSource = z.infer<typeof frictionSourceSchema>;
export type FrictionSeverity = z.infer<typeof frictionSeveritySchema>;
export type HelpdeskUxIssueCategory = z.infer<typeof helpdeskUxIssueCategorySchema>;
export type FrictionEvent = z.infer<typeof frictionEventSchema>;

export function buildFrictionEvent(input: FrictionEvent): FrictionEvent {
  return frictionEventSchema.parse(input);
}

export function mapHelpdeskUxIssueToFrictionKind(category: HelpdeskUxIssueCategory): FrictionKind | null {
  switch (category) {
    case "clarification_overuse":
      return "chat_clarification_overuse";
    case "generic_fallback":
      return "chat_generic_fallback";
    case "too_systemic":
      return "chat_too_systemic";
    case "natural_request_not_understood":
      return "chat_natural_request_not_understood";
    case "unnecessary_run_creation":
      return "chat_unnecessary_run_creation";
    default:
      return null;
  }
}

export function mapResolverDecisionToFrictionKind(
  decisionType: z.infer<typeof resolverAuditDecisionTypeSchema>
): FrictionKind | null {
  switch (decisionType) {
    case "investigation_mode.entered":
      return "investigation_mode_entered";
    case "investigation_mode.exited":
      return "investigation_mode_exited";
    case "investigation_mode.changed":
      return "investigation_mode_changed";
    case "recommended_action.diverged":
      return "recommended_action_diverged";
    default:
      return null;
  }
}

export function mapImobAccessDeniedToFrictionKind(): FrictionKind {
  return "access_denied";
}
