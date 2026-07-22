import {
  apiGetImobRuntimeShadowState,
  type ImobRuntimeShadowEngineRequest,
  type ImobRuntimeShadowStateResponse,
} from "@/lib/api";

export type { ImobRuntimeShadowEngineRequest, ImobRuntimeShadowStateResponse };

export type ImobRuntimeShadowFetchResult =
  | { available: true; state: ImobRuntimeShadowStateResponse }
  | { available: false };

const VALID_STAGES = new Set(["candidate", "clarification", "handoff", "blocked", "not_applicable"]);

function isValidShadowState(value: unknown): value is ImobRuntimeShadowStateResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat.vertical_runtime_shadow_state.v1" &&
    record.verticalId === "imob" &&
    record.source === "runtime_shadow" &&
    record.sideEffects === 0 &&
    typeof record.stage === "string" &&
    VALID_STAGES.has(record.stage)
  );
}

/**
 * Fail-closed adapter for the IMOB runtime shadow state. If the backend
 * route is disabled (EIAH_CHAT_IMOB_RUNTIME_SHADOW_ROUTE_ENABLED default
 * OFF returns 404), unreachable, or returns a payload that does not match
 * the expected shape, this degrades safely to { available: false } instead
 * of throwing. Never retries, read-only, no side effects.
 */
export async function fetchImobRuntimeShadowState(
  request: ImobRuntimeShadowEngineRequest,
): Promise<ImobRuntimeShadowFetchResult> {
  try {
    const state = await apiGetImobRuntimeShadowState(request);
    if (!isValidShadowState(state)) return { available: false };
    return { available: true, state };
  } catch {
    return { available: false };
  }
}
