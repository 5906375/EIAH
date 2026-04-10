export function resolveObserveAgentId(params: {
  contextAgentId?: unknown;
  runAgentId: string;
}) {
  const contextAgentId =
    typeof params.contextAgentId === "string" && params.contextAgentId.trim().length > 0
      ? params.contextAgentId.trim()
      : null;
  return contextAgentId ?? params.runAgentId;
}

