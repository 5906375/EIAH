export const PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENV_KEY =
  "EIAH_PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENABLED" as const;

/**
 * Controlled availability/rollout gate for mounting the PRE_DUIMP runtime
 * shadow route. This flag controls ONLY whether the route is reachable in
 * the running app — it is not the shadow mechanism itself. Shadow-only
 * behavior (mode="shadow", externalTransmissionAllowed=false, no external
 * transmission) is enforced unconditionally by the domain contract
 * (preDuimpContextContract.ts) and the Actions catalog
 * (preDuimpActionCatalog.ts), regardless of this flag's value.
 *
 * Default is OFF: the route only becomes reachable when this env var is
 * explicitly set to the literal string "true". Mirrors
 * isChatVerticalImobRuntimeShadowRouteEnabled
 * (chatVerticalImobRuntimeShadowGate.ts) exactly — same injectable-env
 * pattern for unit testing without mutating global process.env or booting
 * the real app.
 */
export function isPreDuimpRuntimeShadowRouteEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENV_KEY] === "true";
}
