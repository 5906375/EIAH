import {
  apiCreateChatRouteTelemetry,
  type CanonicalChatDomain,
  type ChatRouteTelemetryPayload,
} from "@/lib/api";

export type ChatRouteTelemetryInput = Omit<ChatRouteTelemetryPayload, "domainHint"> & {
  domainHint?: string | null;
};

const CANONICAL_CHAT_DOMAINS = new Set<CanonicalChatDomain>([
  "imob",
  "legal",
  "mkt",
  "fin",
  "log",
  "core",
]);

export function resolveCanonicalChatDomainHint(value?: string | null): CanonicalChatDomain | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && CANONICAL_CHAT_DOMAINS.has(normalized as CanonicalChatDomain)
    ? normalized as CanonicalChatDomain
    : undefined;
}

export function sanitizeChatRouteTelemetryPayload(
  payload: ChatRouteTelemetryInput,
): ChatRouteTelemetryPayload {
  const { domainHint: rawDomainHint, ...contentFreePayload } = payload;
  const domainHint = resolveCanonicalChatDomainHint(rawDomainHint);
  return domainHint
    ? { ...contentFreePayload, domainHint }
    : contentFreePayload;
}

export function resolveChatRouteEntryKind(params: { search?: string | null; hash?: string | null }) {
  return params.search || params.hash ? "deep_link" as const : "plain" as const;
}

export function buildChatRouteEntryTelemetry(params: {
  surfaceRoute: ChatRouteTelemetryPayload["surfaceRoute"];
  search?: string | null;
  hash?: string | null;
  domainHint?: string | null;
  selectedVertical?: string | null;
}): ChatRouteTelemetryPayload {
  return sanitizeChatRouteTelemetryPayload({
    event: "route_entry",
    surfaceRoute: params.surfaceRoute,
    entryKind: resolveChatRouteEntryKind(params),
    domainHint: params.domainHint,
    selectedVertical: params.selectedVertical?.trim() || null,
  });
}

export function emitChatRouteTelemetry(payload: ChatRouteTelemetryInput) {
  void apiCreateChatRouteTelemetry(sanitizeChatRouteTelemetryPayload(payload)).catch(() => {
    // Telemetria passiva nunca bloqueia a experiencia do chat.
  });
}
