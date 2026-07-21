import { z } from "zod";

import { IMOB_CONFIDENCE_THRESHOLDS } from "./chatVerticalImobConfidence";

export const IMOB_CLARIFICATION_ALLOWED_REPLIES = [
  "confirm_inventory_preview",
  "refine_inventory_intent",
  "cancel_vertical_switch",
] as const;

export const chatVerticalImobClarificationPayloadSchema = z
  .object({
    kind: z.literal("chat.vertical_clarification.v1"),
    verticalId: z.literal("imob"),
    capabilityId: z.literal("inventory.preview"),
    reason: z.literal("IMOB_INVENTORY_INTENT_AMBIGUOUS"),
    questionKey: z.literal("imob.inventory.preview.clarify_intent"),
    allowedReplies: z.tuple([
      z.literal(IMOB_CLARIFICATION_ALLOWED_REPLIES[0]),
      z.literal(IMOB_CLARIFICATION_ALLOWED_REPLIES[1]),
      z.literal(IMOB_CLARIFICATION_ALLOWED_REPLIES[2]),
    ]),
    defaultReply: z.literal("refine_inventory_intent"),
    sideEffects: z.literal(0),
  })
  .strict();

export type ChatVerticalImobClarificationPayload = z.infer<
  typeof chatVerticalImobClarificationPayloadSchema
>;

export type ChatVerticalImobClarificationResult =
  | {
      status: "clarification_ready";
      payload: ChatVerticalImobClarificationPayload;
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

function notApplicable(): ChatVerticalImobClarificationResult {
  return { status: "not_applicable", payload: null, sideEffects: 0 };
}

export function buildChatVerticalImobClarification(
  resolution: unknown,
): ChatVerticalImobClarificationResult {
  if (!isRecord(resolution)) return notApplicable();
  if (
    resolution.status !== "clarification_needed" ||
    resolution.clarificationNeeded !== true ||
    resolution.sideEffects !== 0
  ) {
    return notApplicable();
  }

  const confidence = resolution.confidence;
  const candidate = resolution.candidate;
  const snapshot = resolution.snapshot;
  if (!isRecord(confidence) || confidence.level !== "medium" || confidence.sideEffects !== 0) {
    return notApplicable();
  }
  if (!isRecord(candidate) || !isRecord(snapshot)) return notApplicable();

  const vertical = candidate.vertical;
  const capability = candidate.capability;
  const presentation = candidate.presentation;
  const snapshotVertical = snapshot.vertical;
  const snapshotCapability = snapshot.capability;
  const snapshotPresentation = snapshot.presentation;
  if (
    typeof confidence.score !== "number" ||
    !Number.isFinite(confidence.score) ||
    confidence.score < IMOB_CONFIDENCE_THRESHOLDS.medium ||
    confidence.score >= IMOB_CONFIDENCE_THRESHOLDS.high ||
    !isRecord(vertical) ||
    vertical.id !== "imob" ||
    !isRecord(capability) ||
    capability.id !== "inventory.preview" ||
    capability.mode !== "read_only" ||
    !isRecord(presentation) ||
    (presentation.source !== "fixture" && presentation.source !== "shadow") ||
    presentation.variant !== "result_list" ||
    candidate.outcome !== "preview_only" ||
    candidate.reasonCode !== "VERTICAL_PREVIEW_ONLY" ||
    !isRecord(snapshotVertical) ||
    snapshotVertical.id !== "imob" ||
    !isRecord(snapshotCapability) ||
    snapshotCapability.id !== "inventory.preview" ||
    snapshotCapability.mode !== "read_only" ||
    !isRecord(snapshotPresentation) ||
    (snapshotPresentation.source !== "fixture" && snapshotPresentation.source !== "shadow") ||
    snapshotPresentation.source !== presentation.source ||
    snapshotPresentation.variant !== presentation.variant ||
    snapshot.outcome !== "preview_only" ||
    snapshot.reasonCode !== candidate.reasonCode
  ) {
    return notApplicable();
  }

  const payloadResult = chatVerticalImobClarificationPayloadSchema.safeParse({
    kind: "chat.vertical_clarification.v1",
    verticalId: "imob",
    capabilityId: "inventory.preview",
    reason: "IMOB_INVENTORY_INTENT_AMBIGUOUS",
    questionKey: "imob.inventory.preview.clarify_intent",
    allowedReplies: [...IMOB_CLARIFICATION_ALLOWED_REPLIES],
    defaultReply: "refine_inventory_intent",
    sideEffects: 0,
  });

  if (!payloadResult.success) return notApplicable();
  return {
    status: "clarification_ready",
    payload: payloadResult.data,
    sideEffects: 0,
  };
}
