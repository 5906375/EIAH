import type { ImobPilotFlowHistoryEntry } from "./imobPilotFlowHistory";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";

export type ImobPilotFlowObservabilitySnapshot = {
  flowsExecuted: number;
  flowsBlocked: number;
  flowsCompleted: number;
  flowsShadowRecorded: number;
  duplicateRate: number;
  gateBlockRate: number;
  sandboxSuccessRate: number;
  averageFlowResolutionTime: number;
};

function computeSnapshot(history: ImobPilotFlowHistoryEntry[]): ImobPilotFlowObservabilitySnapshot {
  const total = history.length;
  const blocked = history.filter((item) => item.status === "blocked").length;
  const completed = history.filter((item) => item.status === "completed").length;
  const shadowRecorded = history.filter((item) => item.status === "shadow_recorded").length;
  const duplicates = history.filter((item) => item.status === "duplicate").length;

  const resolutionTimes = history
    .map((item) => {
      const generatedAtMs = new Date(item.generatedAt).getTime();
      const signal = item.evidenceRefs.find((ref) => ref.ref === "pilot.flow.generated_at");
      const baseMs = signal?.value ? new Date(String(signal.value)).getTime() : generatedAtMs;
      return Math.max(0, generatedAtMs - baseMs);
    });
  const averageFlowResolutionTime = resolutionTimes.length === 0
    ? 0
    : Math.round(resolutionTimes.reduce((sum, item) => sum + item, 0) / resolutionTimes.length);

  return {
    flowsExecuted: total,
    flowsBlocked: blocked,
    flowsCompleted: completed,
    flowsShadowRecorded: shadowRecorded,
    duplicateRate: total === 0 ? 0 : duplicates / total,
    gateBlockRate: total === 0 ? 0 : blocked / total,
    sandboxSuccessRate: total === 0 ? 0 : (completed + shadowRecorded) / total,
    averageFlowResolutionTime,
  };
}

export function buildImobPilotFlowObservability(params: {
  history: ImobPilotFlowHistoryEntry[];
}) {
  return computeSnapshot(params.history);
}

export function buildImobPilotFlowObservabilityByType(params: {
  history: ImobPilotFlowHistoryEntry[];
}) {
  const grouped = new Map<ImobPilotFlowType, ImobPilotFlowHistoryEntry[]>();
  for (const item of params.history) {
    const current = grouped.get(item.flowType) ?? [];
    current.push(item);
    grouped.set(item.flowType, current);
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([flowType, items]) => [flowType, computeSnapshot(items)]),
  ) as Partial<Record<ImobPilotFlowType, ImobPilotFlowObservabilitySnapshot>>;
}
