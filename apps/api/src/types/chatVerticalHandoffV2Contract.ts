import { z } from "zod";

export const KNOWN_VERTICAL_IDS = [
  "core",
  "imob",
  "legal",
  "mkt",
  "bpo_financeiro",
  "log",
  "health",
] as const;

export const VERTICAL_CAPABILITY_MODES = [
  "read_only",
  "requires_write",
  "critical_action",
] as const;

export const VERTICAL_HANDOFF_REASON_CODES = [
  "VERTICAL_NOT_REGISTERED",
  "VERTICAL_DISABLED",
  "VERTICAL_ENTITLEMENT_REQUIRED",
  "VERTICAL_SCOPE_DENIED",
  "VERTICAL_CAPABILITY_NOT_AVAILABLE",
  "VERTICAL_REGISTRY_VERSION_MISMATCH",
  "VERTICAL_POLICY_DENIED",
  "VERTICAL_HITL_REQUIRED",
  "VERTICAL_GOVERNANCE_NOT_EVALUATED",
  "VERTICAL_PRESENTATION_INVALID",
  "VERTICAL_HANDOFF_ALLOWED",
  "VERTICAL_PREVIEW_ONLY",
] as const;

export type KnownVerticalId = (typeof KNOWN_VERTICAL_IDS)[number];
export type VerticalId = KnownVerticalId | `custom:${string}`;
export type VerticalCapabilityMode = (typeof VERTICAL_CAPABILITY_MODES)[number];
export type VerticalHandoffReasonCode = (typeof VERTICAL_HANDOFF_REASON_CODES)[number];

const knownVerticalIds = new Set<string>(KNOWN_VERTICAL_IDS);
const customVerticalIdPattern = /^custom:[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/;

export function isVerticalId(value: unknown): value is VerticalId {
  return typeof value === "string" && (knownVerticalIds.has(value) || customVerticalIdPattern.test(value));
}

export const verticalIdSchema = z
  .string()
  .refine(isVerticalId, { message: "vertical_id_invalid" })
  .transform((value) => value as VerticalId);

const capabilityModeSchema = z.enum(VERTICAL_CAPABILITY_MODES);
const capabilityIdSchema = z.string().regex(/^[a-z][a-z0-9._-]*$/);
const governanceDecisionSchema = z.enum(["allowed", "denied", "not_required", "not_evaluated"]);

const verticalRegistryEntrySchema = z
  .object({
    id: verticalIdSchema,
    label: z.string().min(1),
    status: z.enum(["enabled", "disabled"]),
    capabilities: z.array(
      z
        .object({
          id: capabilityIdSchema,
          allowedModes: z.array(capabilityModeSchema).min(1),
        })
        .strict(),
    ),
    entitlement: z
      .object({
        required: z.boolean(),
        key: z.string().min(1).nullable(),
      })
      .strict(),
    rbac: z
      .object({
        requiredRoles: z.array(z.string().min(1)),
      })
      .strict(),
    policyGates: z.array(z.string().min(1)),
    rolloutStage: z.enum(["context_only", "installed_surface", "operationalized"]),
  })
  .strict();

export const verticalRegistryV1Schema = z
  .object({
    version: z.literal("vertical.registry.v1"),
    registryVersion: z.string().min(1),
    scope: z
      .object({
        tenantId: z.string().min(1),
        workspaceId: z.string().min(1),
      })
      .strict(),
    verticals: z.array(verticalRegistryEntrySchema).min(1),
  })
  .strict()
  .superRefine((registry, context) => {
    const verticalIds = registry.verticals.map((vertical) => vertical.id);
    if (new Set(verticalIds).size !== verticalIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "vertical_ids_must_be_unique" });
    }

    registry.verticals.forEach((vertical, verticalIndex) => {
      const capabilityIds = vertical.capabilities.map((capability) => capability.id);
      if (new Set(capabilityIds).size !== capabilityIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["verticals", verticalIndex, "capabilities"],
          message: "capability_ids_must_be_unique",
        });
      }
    });
  });

export const chatVerticalHandoffV2Schema = z
  .object({
    version: z.literal("chat.vertical_handoff.v2"),
    handoffId: z.string().min(1),
    vertical: z
      .object({
        id: verticalIdSchema,
        label: z.string().min(1).optional(),
        registryVersion: z.string().min(1),
      })
      .strict(),
    capability: z
      .object({
        id: capabilityIdSchema,
        mode: capabilityModeSchema,
      })
      .strict(),
    refs: z
      .object({
        conversationId: z.string().min(1).optional(),
        threadId: z.string().min(1).optional(),
        caseId: z.string().min(1).optional(),
        entityRef: z
          .object({
            type: z.string().min(1),
            id: z.string().min(1),
          })
          .strict()
          .optional(),
      })
      .strict(),
    governance: z
      .object({
        tenantId: z.string().min(1),
        workspaceId: z.string().min(1),
        scope: z.string().min(1),
        registry: z
          .object({
            decision: z.enum(["allowed", "denied", "not_evaluated"]),
          })
          .strict(),
        rbac: z.object({ decision: governanceDecisionSchema }).strict(),
        entitlement: z.object({ decision: governanceDecisionSchema }).strict(),
        policy: z.object({ decision: governanceDecisionSchema }).strict(),
        hitl: z
          .object({
            status: z.enum(["not_required", "required", "approved", "rejected", "expired", "not_evaluated"]),
          })
          .strict(),
      })
      .strict(),
    presentation: z
      .object({
        source: z.enum(["fixture", "shadow", "operational"]),
        variant: z.enum(["blocked", "chat_card", "result_list", "cockpit_link"]),
      })
      .strict(),
    outcome: z.enum(["allowed", "blocked", "preview_only"]),
    reasonCode: z.enum(VERTICAL_HANDOFF_REASON_CODES),
  })
  .strict();

export type VerticalRegistryV1 = z.infer<typeof verticalRegistryV1Schema>;
export type ChatVerticalHandoffV2 = z.infer<typeof chatVerticalHandoffV2Schema>;

export type ChatVerticalHandoffV2Evaluation =
  | { ok: true; handoff: ChatVerticalHandoffV2; sideEffects: 0 }
  | { ok: false; reasonCode: VerticalHandoffReasonCode; sideEffects: 0 };

function blocked(reasonCode: VerticalHandoffReasonCode): ChatVerticalHandoffV2Evaluation {
  return { ok: false, reasonCode, sideEffects: 0 };
}

function isNotEvaluated(decision: string): boolean {
  return decision === "not_evaluated";
}

export function evaluateChatVerticalHandoffV2(
  registryInput: unknown,
  handoffInput: unknown,
): ChatVerticalHandoffV2Evaluation {
  const registryResult = verticalRegistryV1Schema.safeParse(registryInput);
  if (!registryResult.success) {
    return blocked("VERTICAL_GOVERNANCE_NOT_EVALUATED");
  }

  const rawVerticalId = (handoffInput as { vertical?: { id?: unknown } } | null)?.vertical?.id;
  if (!isVerticalId(rawVerticalId)) {
    return blocked("VERTICAL_NOT_REGISTERED");
  }

  const rawCapability = (handoffInput as { capability?: { id?: unknown; mode?: unknown } } | null)?.capability;
  if (
    typeof rawCapability?.id !== "string" ||
    !/^[a-z][a-z0-9._-]*$/.test(rawCapability.id) ||
    !VERTICAL_CAPABILITY_MODES.includes(rawCapability.mode as VerticalCapabilityMode)
  ) {
    return blocked("VERTICAL_CAPABILITY_NOT_AVAILABLE");
  }

  const handoffResult = chatVerticalHandoffV2Schema.safeParse(handoffInput);
  if (!handoffResult.success) {
    return blocked("VERTICAL_GOVERNANCE_NOT_EVALUATED");
  }

  const registry = registryResult.data;
  const handoff = handoffResult.data;

  if (
    registry.scope.tenantId !== handoff.governance.tenantId ||
    registry.scope.workspaceId !== handoff.governance.workspaceId
  ) {
    return blocked("VERTICAL_SCOPE_DENIED");
  }

  if (registry.registryVersion !== handoff.vertical.registryVersion) {
    return blocked("VERTICAL_REGISTRY_VERSION_MISMATCH");
  }

  const vertical = registry.verticals.find((entry) => entry.id === handoff.vertical.id);
  if (!vertical) {
    return blocked("VERTICAL_NOT_REGISTERED");
  }
  if (vertical.status !== "enabled") {
    return blocked("VERTICAL_DISABLED");
  }

  const capability = vertical.capabilities.find((entry) => entry.id === handoff.capability.id);
  if (!capability || !capability.allowedModes.includes(handoff.capability.mode)) {
    return blocked("VERTICAL_CAPABILITY_NOT_AVAILABLE");
  }

  const { governance } = handoff;
  if (
    isNotEvaluated(governance.registry.decision) ||
    isNotEvaluated(governance.rbac.decision) ||
    isNotEvaluated(governance.entitlement.decision) ||
    isNotEvaluated(governance.policy.decision)
  ) {
    return blocked("VERTICAL_GOVERNANCE_NOT_EVALUATED");
  }
  if (governance.registry.decision === "denied" || governance.rbac.decision === "denied") {
    return blocked("VERTICAL_SCOPE_DENIED");
  }
  if (vertical.entitlement.required && governance.entitlement.decision !== "allowed") {
    return blocked("VERTICAL_ENTITLEMENT_REQUIRED");
  }
  if (governance.entitlement.decision === "denied") {
    return blocked("VERTICAL_ENTITLEMENT_REQUIRED");
  }
  if (governance.policy.decision === "denied") {
    return blocked("VERTICAL_POLICY_DENIED");
  }

  if (
    handoff.presentation.source === "fixture" &&
    (handoff.capability.mode !== "read_only" || handoff.outcome !== "preview_only")
  ) {
    return blocked("VERTICAL_PRESENTATION_INVALID");
  }
  if (
    handoff.presentation.source === "shadow" &&
    (handoff.capability.mode !== "read_only" || handoff.outcome === "allowed")
  ) {
    return blocked("VERTICAL_PRESENTATION_INVALID");
  }
  if (handoff.capability.mode === "critical_action" && governance.hitl.status !== "approved") {
    return blocked("VERTICAL_HITL_REQUIRED");
  }

  return {
    ok: true,
    handoff: {
      ...handoff,
      vertical: {
        ...handoff.vertical,
        label: vertical.label,
      },
    },
    sideEffects: 0,
  };
}

export function projectChatVerticalHandoffV2ForSurface(handoff: ChatVerticalHandoffV2) {
  return {
    version: handoff.version,
    handoffId: handoff.handoffId,
    vertical: handoff.vertical,
    capability: handoff.capability,
    presentation: handoff.presentation,
    outcome: handoff.outcome,
    reasonCode: handoff.reasonCode,
  } as const;
}
