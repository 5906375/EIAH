import { z } from "zod";

export const CHAT_ROUTE_CANONICAL_DOMAINS = [
  "imob",
  "legal",
  "mkt",
  "fin",
  "log",
  "core",
] as const;

export const ChatRouteTelemetrySchema = z
  .object({
    event: z.enum(["route_entry", "turn_observed", "feature_observed", "vertical_context_changed", "error_observed"]),
    surfaceRoute: z.enum(["/app/chat", "/app/imob/chat"]),
    entryKind: z.enum(["plain", "deep_link"]).optional().nullable(),
    domainHint: z.enum(CHAT_ROUTE_CANONICAL_DOMAINS).optional().nullable(),
    selectedVertical: z.string().trim().max(64).optional().nullable(),
    routeIntent: z.string().trim().max(64).optional().nullable(),
    decisionKind: z.string().trim().max(96).optional().nullable(),
    feature: z.enum(["knowledge_search", "document_intake", "proof", "receipt", "bundle"]).optional().nullable(),
    genericFallbackObserved: z.boolean().optional(),
    genericTutorialObserved: z.boolean().optional(),
    threadContinuityObserved: z.boolean().optional(),
    verticalSwitchObserved: z.boolean().optional(),
    failClosedObserved: z.boolean().optional(),
    reasonCode: z.string().trim().max(128).optional().nullable(),
  })
  .strict();

export function buildChatRouteTelemetryInvalidPayloadError() {
  return {
    ok: false as const,
    error: {
      code: "INVALID_PAYLOAD" as const,
      message: "Chat route telemetry payload is invalid",
    },
  };
}
