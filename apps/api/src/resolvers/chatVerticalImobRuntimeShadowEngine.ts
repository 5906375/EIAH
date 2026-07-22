import { z } from "zod";

import {
  chatVerticalImobRuntimeShadowStateSchema,
  resolveChatVerticalImobRuntimeShadowState,
  type ChatVerticalImobRuntimeShadowState,
  type ResolveChatVerticalImobRuntimeShadowStateInput,
} from "./chatVerticalImobRuntimeShadow";

const evidenceSchema = z.enum(["explicit", "contextual", "absent"]);
const governanceDecisionSchema = z.enum(["allowed", "denied", "not_required", "not_evaluated"]);
const REQUEST_INVALID_REASON_CODE = "IMOB_RUNTIME_SHADOW_REQUEST_INVALID" as const;

/**
 * Boundary schema for the IMOB runtime shadow engine. Deliberately omits
 * `source`/`mode`/`outcome` (accepted by the inner candidate resolver but
 * never exposed here): callers of this engine contract can never request
 * `outcome: "allowed"` or `capability.mode: "critical_action"` because the
 * fields do not exist at this boundary.
 */
export const chatVerticalImobRuntimeShadowEngineRequestSchema = z
  .object({
    handoffId: z.string().min(1),
    intent: z
      .object({
        verticalId: z.string().nullable(),
        label: z.string().nullable().optional(),
        capabilityId: z.string().nullable().optional(),
      })
      .strict(),
    confidenceSignals: z
      .object({
        verticalEvidence: evidenceSchema,
        capabilityEvidence: evidenceSchema,
        competingIntent: z.boolean(),
      })
      .strict(),
    registry: z.unknown(),
    refs: z
      .object({
        conversationId: z.string().min(1).optional(),
        threadId: z.string().min(1).optional(),
        caseId: z.string().min(1).optional(),
        entityRef: z
          .object({ type: z.string().min(1), id: z.string().min(1) })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    governance: z
      .object({
        tenantId: z.string().min(1),
        workspaceId: z.string().min(1),
        scope: z.string().min(1),
        registry: z.object({ decision: z.enum(["allowed", "denied", "not_evaluated"]) }).strict(),
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
    reply: z.unknown().optional(),
  })
  .strict();

export type ChatVerticalImobRuntimeShadowEngineRequest = z.infer<
  typeof chatVerticalImobRuntimeShadowEngineRequestSchema
>;

function blockedForInvalidRequest(): ChatVerticalImobRuntimeShadowState {
  return {
    kind: "chat.vertical_runtime_shadow_state.v1",
    verticalId: "imob",
    stage: "blocked",
    source: "runtime_shadow",
    reasonCode: REQUEST_INVALID_REASON_CODE,
    sideEffects: 0,
  };
}

/**
 * Contract-tested engine boundary for the IMOB runtime shadow state.
 * Validates an untrusted request-shaped payload (the same shape a future
 * HTTP route would receive from the network) and delegates to
 * resolveChatVerticalImobRuntimeShadowState(). Never throws — a malformed
 * request fails closed into a blocked shadow state with a safe reasonCode.
 *
 * This function is intentionally NOT mounted on any Express router/route in
 * this PR: it exists purely as the testable contract layer between a future
 * HTTP endpoint (out of scope here) and the pure IMOB preflight chain.
 */
export function resolveChatVerticalImobRuntimeShadowEngineState(
  request: unknown,
): ChatVerticalImobRuntimeShadowState {
  const parsedRequest = chatVerticalImobRuntimeShadowEngineRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    return blockedForInvalidRequest();
  }

  const state = resolveChatVerticalImobRuntimeShadowState(
    parsedRequest.data as ResolveChatVerticalImobRuntimeShadowStateInput,
  );
  const parsedState = chatVerticalImobRuntimeShadowStateSchema.safeParse(state);
  return parsedState.success ? parsedState.data : blockedForInvalidRequest();
}
