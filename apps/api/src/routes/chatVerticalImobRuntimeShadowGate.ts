export const CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY =
  "EIAH_CHAT_IMOB_RUNTIME_SHADOW_ROUTE_ENABLED" as const;

/**
 * Controlled mount gate for the IMOB runtime shadow route. Default is OFF:
 * the route only becomes reachable when this env var is explicitly set to
 * the literal string "true". Accepts an injectable env object (mirroring
 * resolveWorkerTopology's pattern in @eiah/core/queue/workerTopology) so the
 * gate can be unit-tested without mutating global process.env or booting
 * the real app.
 */
export function isChatVerticalImobRuntimeShadowRouteEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[CHAT_VERTICAL_IMOB_RUNTIME_SHADOW_ROUTE_ENV_KEY] === "true";
}
