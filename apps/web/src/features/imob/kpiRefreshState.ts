export type KpiRefreshState = "loading-first" | "refreshing" | "stable";

export function resolveKpiRefreshState(params: {
  loading: boolean;
  hasSnapshot: boolean;
}): KpiRefreshState {
  if (params.loading && !params.hasSnapshot) return "loading-first";
  if (params.loading && params.hasSnapshot) return "refreshing";
  return "stable";
}

export function shouldShowKpiPlaceholder(state: KpiRefreshState) {
  return state === "loading-first";
}

export function shouldShowKpiRefreshingHint(state: KpiRefreshState) {
  return state === "refreshing";
}
