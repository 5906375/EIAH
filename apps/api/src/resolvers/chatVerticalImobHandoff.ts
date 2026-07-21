import { z } from "zod";

import { IMOB_CLARIFICATION_ALLOWED_REPLIES } from "./chatVerticalImobClarification";
import { IMOB_CONFIDENCE_THRESHOLDS } from "./chatVerticalImobConfidence";

const IMOB_HANDOFF_PREFLIGHT_VERTICAL_ID = "imob" as const;
const IMOB_HANDOFF_PREFLIGHT_CAPABILITY_ID = "inventory.preview" as const;
const IMOB_HANDOFF_PREFLIGHT_INTENT_KEY = "imob.inventory.preview.open_context" as const;
const IMOB_HANDOFF_PREFLIGHT_CONFIRM_REPLY: (typeof IMOB_CLARIFICATION_ALLOWED_REPLIES)[number] =
  "confirm_inventory_preview";

export const IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS = [
  "open_context_preview",
  "keep_chat_context",
  "cancel",
] as const;

export const chatVerticalImobHandoffPreflightPayloadSchema = z
  .object({
    kind: z.literal("chat.vertical_handoff_preflight.v1"),
    verticalId: z.literal(IMOB_HANDOFF_PREFLIGHT_VERTICAL_ID),
    capabilityId: z.literal(IMOB_HANDOFF_PREFLIGHT_CAPABILITY_ID),
    handoffIntentKey: z.literal(IMOB_HANDOFF_PREFLIGHT_INTENT_KEY),
    source: z.enum(["high_confidence", "clarification_confirmed"]),
    allowedNextActions: z.tuple([
      z.literal(IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS[0]),
      z.literal(IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS[1]),
      z.literal(IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS[2]),
    ]),
    defaultNextAction: z.literal(IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS[0]),
    sideEffects: z.literal(0),
  })
  .strict();

export type ChatVerticalImobHandoffPreflightPayload = z.infer<
  typeof chatVerticalImobHandoffPreflightPayloadSchema
>;

export type ChatVerticalImobHandoffPreflightResult =
  | {
      status: "handoff_ready";
      payload: ChatVerticalImobHandoffPreflightPayload;
      sideEffects: 0;
    }
  | {
      status: "not_applicable";
      payload: null;
      sideEffects: 0;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notApplicable(): ChatVerticalImobHandoffPreflightResult {
  return { status: "not_applicable", payload: null, sideEffects: 0 };
}

function buildHandoffPreflight(
  source: "high_confidence" | "clarification_confirmed",
): ChatVerticalImobHandoffPreflightResult {
  const payloadResult = chatVerticalImobHandoffPreflightPayloadSchema.safeParse({
    kind: "chat.vertical_handoff_preflight.v1",
    verticalId: IMOB_HANDOFF_PREFLIGHT_VERTICAL_ID,
    capabilityId: IMOB_HANDOFF_PREFLIGHT_CAPABILITY_ID,
    handoffIntentKey: IMOB_HANDOFF_PREFLIGHT_INTENT_KEY,
    source,
    allowedNextActions: [...IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS],
    defaultNextAction: IMOB_HANDOFF_PREFLIGHT_NEXT_ACTIONS[0],
    sideEffects: 0,
  });

  if (!payloadResult.success) return notApplicable();
  return { status: "handoff_ready", payload: payloadResult.data, sideEffects: 0 };
}

function isEligiblePreviewCandidateShape(candidate: unknown): boolean {
  if (!isRecord(candidate)) return false;

  const vertical = candidate.vertical;
  const capability = candidate.capability;
  const presentation = candidate.presentation;

  return (
    isRecord(vertical) &&
    vertical.id === IMOB_HANDOFF_PREFLIGHT_VERTICAL_ID &&
    isRecord(capability) &&
    capability.id === IMOB_HANDOFF_PREFLIGHT_CAPABILITY_ID &&
    capability.mode === "read_only" &&
    isRecord(presentation) &&
    (presentation.source === "fixture" || presentation.source === "shadow") &&
    presentation.variant === "result_list" &&
    candidate.outcome === "preview_only" &&
    candidate.reasonCode === "VERTICAL_PREVIEW_ONLY"
  );
}

function resolveFromCandidateResolution(resolution: unknown): ChatVerticalImobHandoffPreflightResult {
  if (!isRecord(resolution)) return notApplicable();
  if (
    resolution.status !== "candidate" ||
    resolution.clarificationNeeded !== false ||
    resolution.sideEffects !== 0
  ) {
    return notApplicable();
  }

  const confidence = resolution.confidence;
  if (
    !isRecord(confidence) ||
    confidence.level !== "high" ||
    confidence.sideEffects !== 0 ||
    typeof confidence.score !== "number" ||
    !Number.isFinite(confidence.score) ||
    confidence.score < IMOB_CONFIDENCE_THRESHOLDS.high
  ) {
    return notApplicable();
  }

  if (!isEligiblePreviewCandidateShape(resolution.candidate)) return notApplicable();

  return buildHandoffPreflight("high_confidence");
}

function resolveFromClarificationConfirmation(
  clarification: unknown,
  reply: unknown,
): ChatVerticalImobHandoffPreflightResult {
  if (typeof reply !== "string" || reply !== IMOB_HANDOFF_PREFLIGHT_CONFIRM_REPLY) {
    return notApplicable();
  }

  if (!isRecord(clarification)) return notApplicable();
  if (clarification.status !== "clarification_ready" || clarification.sideEffects !== 0) {
    return notApplicable();
  }

  const payload = clarification.payload;
  if (!isRecord(payload)) return notApplicable();
  if (
    payload.kind !== "chat.vertical_clarification.v1" ||
    payload.verticalId !== IMOB_HANDOFF_PREFLIGHT_VERTICAL_ID ||
    payload.capabilityId !== IMOB_HANDOFF_PREFLIGHT_CAPABILITY_ID ||
    payload.reason !== "IMOB_INVENTORY_INTENT_AMBIGUOUS" ||
    payload.sideEffects !== 0 ||
    !Array.isArray(payload.allowedReplies) ||
    !payload.allowedReplies.includes(IMOB_HANDOFF_PREFLIGHT_CONFIRM_REPLY)
  ) {
    return notApplicable();
  }

  return buildHandoffPreflight("clarification_confirmed");
}

/**
 * Preflight determinístico: consome apenas o resultado já resolvido do
 * candidate resolver IMOB (status "candidate", alta confiança) ou o payload
 * de clarificação IMOB já confirmado com a reply canônica. Nunca lê o
 * contrato v2 nem o shadow snapshot diretamente — apenas os campos públicos
 * já expostos pelos resolvers anteriores.
 */
export function resolveChatVerticalImobHandoffPreflight(
  input: unknown,
): ChatVerticalImobHandoffPreflightResult {
  if (!isRecord(input)) return notApplicable();

  if (input.kind === "candidate_resolution") {
    return resolveFromCandidateResolution(input.resolution);
  }

  if (input.kind === "clarification_confirmation") {
    return resolveFromClarificationConfirmation(input.clarification, input.reply);
  }

  return notApplicable();
}
