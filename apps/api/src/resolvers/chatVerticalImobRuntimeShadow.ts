import { z } from "zod";

import {
  resolveChatVerticalImobCandidate,
  type ResolveChatVerticalImobCandidateInput,
} from "./chatVerticalImobCandidateResolver";
import {
  buildChatVerticalImobClarification,
  chatVerticalImobClarificationPayloadSchema,
} from "./chatVerticalImobClarification";
import {
  chatVerticalImobHandoffPreflightPayloadSchema,
  resolveChatVerticalImobHandoffPreflight,
} from "./chatVerticalImobHandoff";

const RUNTIME_SHADOW_KIND = "chat.vertical_runtime_shadow_state.v1" as const;
const RUNTIME_SHADOW_VERTICAL_ID = "imob" as const;
const RUNTIME_SHADOW_SOURCE = "runtime_shadow" as const;
const RUNTIME_SHADOW_INCONSISTENT_REASON_CODE = "IMOB_RUNTIME_SHADOW_STATE_INCONSISTENT" as const;
const CONFIRM_REPLY = "confirm_inventory_preview" as const;
const safeReasonCodePattern = /^[A-Z][A-Z0-9_]*$/;

const candidateStateSchema = z
  .object({
    kind: z.literal(RUNTIME_SHADOW_KIND),
    verticalId: z.literal(RUNTIME_SHADOW_VERTICAL_ID),
    stage: z.literal("candidate"),
    source: z.literal(RUNTIME_SHADOW_SOURCE),
    sideEffects: z.literal(0),
  })
  .strict();

const clarificationStateSchema = z
  .object({
    kind: z.literal(RUNTIME_SHADOW_KIND),
    verticalId: z.literal(RUNTIME_SHADOW_VERTICAL_ID),
    stage: z.literal("clarification"),
    source: z.literal(RUNTIME_SHADOW_SOURCE),
    clarification: chatVerticalImobClarificationPayloadSchema,
    sideEffects: z.literal(0),
  })
  .strict();

const handoffStateSchema = z
  .object({
    kind: z.literal(RUNTIME_SHADOW_KIND),
    verticalId: z.literal(RUNTIME_SHADOW_VERTICAL_ID),
    stage: z.literal("handoff"),
    source: z.literal(RUNTIME_SHADOW_SOURCE),
    handoff: chatVerticalImobHandoffPreflightPayloadSchema,
    sideEffects: z.literal(0),
  })
  .strict();

const blockedStateSchema = z
  .object({
    kind: z.literal(RUNTIME_SHADOW_KIND),
    verticalId: z.literal(RUNTIME_SHADOW_VERTICAL_ID),
    stage: z.literal("blocked"),
    source: z.literal(RUNTIME_SHADOW_SOURCE),
    reasonCode: z.string().regex(safeReasonCodePattern),
    sideEffects: z.literal(0),
  })
  .strict();

const notApplicableStateSchema = z
  .object({
    kind: z.literal(RUNTIME_SHADOW_KIND),
    verticalId: z.literal(RUNTIME_SHADOW_VERTICAL_ID),
    stage: z.literal("not_applicable"),
    source: z.literal(RUNTIME_SHADOW_SOURCE),
    sideEffects: z.literal(0),
  })
  .strict();

export const chatVerticalImobRuntimeShadowStateSchema = z.discriminatedUnion("stage", [
  candidateStateSchema,
  clarificationStateSchema,
  handoffStateSchema,
  blockedStateSchema,
  notApplicableStateSchema,
]);

export type ChatVerticalImobRuntimeShadowState = z.infer<
  typeof chatVerticalImobRuntimeShadowStateSchema
>;

export type ResolveChatVerticalImobRuntimeShadowStateInput = ResolveChatVerticalImobCandidateInput & {
  reply?: unknown;
};

function inconsistentBlockedState(): ChatVerticalImobRuntimeShadowState {
  return {
    kind: RUNTIME_SHADOW_KIND,
    verticalId: RUNTIME_SHADOW_VERTICAL_ID,
    stage: "blocked",
    source: RUNTIME_SHADOW_SOURCE,
    reasonCode: RUNTIME_SHADOW_INCONSISTENT_REASON_CODE,
    sideEffects: 0,
  };
}

function computeState(
  input: ResolveChatVerticalImobRuntimeShadowStateInput,
): ChatVerticalImobRuntimeShadowState {
  const resolution = resolveChatVerticalImobCandidate(input);

  if (resolution.status === "not_applicable") {
    return {
      kind: RUNTIME_SHADOW_KIND,
      verticalId: RUNTIME_SHADOW_VERTICAL_ID,
      stage: "not_applicable",
      source: RUNTIME_SHADOW_SOURCE,
      sideEffects: 0,
    };
  }

  if (resolution.status === "blocked") {
    const reasonCode = safeReasonCodePattern.test(resolution.reasonCode)
      ? resolution.reasonCode
      : RUNTIME_SHADOW_INCONSISTENT_REASON_CODE;
    return {
      kind: RUNTIME_SHADOW_KIND,
      verticalId: RUNTIME_SHADOW_VERTICAL_ID,
      stage: "blocked",
      source: RUNTIME_SHADOW_SOURCE,
      reasonCode,
      sideEffects: 0,
    };
  }

  if (resolution.status === "candidate") {
    const handoff = resolveChatVerticalImobHandoffPreflight({
      kind: "candidate_resolution",
      resolution,
    });

    if (handoff.status === "handoff_ready") {
      return {
        kind: RUNTIME_SHADOW_KIND,
        verticalId: RUNTIME_SHADOW_VERTICAL_ID,
        stage: "handoff",
        source: RUNTIME_SHADOW_SOURCE,
        handoff: handoff.payload,
        sideEffects: 0,
      };
    }

    // High-confidence candidate whose independent handoff re-validation did
    // not agree: keep it as a distinguishable "candidate" shadow state
    // instead of silently collapsing into not_applicable/blocked.
    return {
      kind: RUNTIME_SHADOW_KIND,
      verticalId: RUNTIME_SHADOW_VERTICAL_ID,
      stage: "candidate",
      source: RUNTIME_SHADOW_SOURCE,
      sideEffects: 0,
    };
  }

  // resolution.status === "clarification_needed"
  const clarification = buildChatVerticalImobClarification(resolution);
  if (clarification.status !== "clarification_ready") {
    return inconsistentBlockedState();
  }

  const reply = input.reply;
  if (typeof reply === "string" && reply === CONFIRM_REPLY) {
    const handoff = resolveChatVerticalImobHandoffPreflight({
      kind: "clarification_confirmation",
      clarification,
      reply,
    });

    if (handoff.status === "handoff_ready") {
      return {
        kind: RUNTIME_SHADOW_KIND,
        verticalId: RUNTIME_SHADOW_VERTICAL_ID,
        stage: "handoff",
        source: RUNTIME_SHADOW_SOURCE,
        handoff: handoff.payload,
        sideEffects: 0,
      };
    }
  }

  return {
    kind: RUNTIME_SHADOW_KIND,
    verticalId: RUNTIME_SHADOW_VERTICAL_ID,
    stage: "clarification",
    source: RUNTIME_SHADOW_SOURCE,
    clarification: clarification.payload,
    sideEffects: 0,
  };
}

/**
 * Backend-only shadow adapter: composes the already-existing IMOB preflight
 * chain (candidate resolver -> clarification -> handoff preflight) into a
 * single renderable, schema-validated state. Read-only, no side effects, not
 * wired to any HTTP route, chat runtime or ChatAgentLauncher.
 */
export function resolveChatVerticalImobRuntimeShadowState(
  input: ResolveChatVerticalImobRuntimeShadowStateInput,
): ChatVerticalImobRuntimeShadowState {
  const state = computeState(input);
  const parsed = chatVerticalImobRuntimeShadowStateSchema.safeParse(state);
  return parsed.success ? parsed.data : inconsistentBlockedState();
}
