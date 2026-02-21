import type {
  ActionCriticality,
  ActionCriticalitySource,
  RegisteredActionMetadata,
} from "../actionRegistry";

export type CriticalityAuditEntry = {
  name: string;
  version?: string;
  criticality?: ActionCriticality;
  criticalitySource?: ActionCriticalitySource;
  suggestedCriticality: ActionCriticality;
  sideEffects: boolean;
  dataSensitivity: "low" | "medium" | "high";
  needsReview: boolean;
};

export type CriticalityAuditReport = {
  total: number;
  explicitCount: number;
  coveragePct: number;
  missing: CriticalityAuditEntry[];
  actions: CriticalityAuditEntry[];
};

export function inferSideEffects(name: string) {
  const n = name.toLowerCase();
  return (
    n.includes("create") ||
    n.includes("update") ||
    n.includes("delete") ||
    n.includes("send") ||
    n.includes("broadcast") ||
    n.includes("publish") ||
    n.includes("emit") ||
    n.includes("approve") ||
    n.includes("reject") ||
    n.includes("subscribe") ||
    n.includes("charge")
  );
}

export function inferDataSensitivity(name: string): "low" | "medium" | "high" {
  const n = name.toLowerCase();
  if (n.includes("guardian") || n.includes("privacy")) return "high";
  if (n.includes("billing") || n.includes("payment")) return "high";
  if (n.includes("risk") || n.includes("audit") || n.includes("ledger")) return "medium";
  if (n.includes("memory") || n.includes("knowledge")) return "medium";
  return "low";
}

export function inferCriticality(
  name: string,
  sideEffects: boolean,
  dataSensitivity: "low" | "medium" | "high"
): ActionCriticality {
  if (!sideEffects && dataSensitivity === "low") return "low";
  if (sideEffects && dataSensitivity === "high") return "critical";
  if (sideEffects && dataSensitivity === "medium") return "high";
  if (!sideEffects && dataSensitivity === "high") return "high";
  return "medium";
}

export function auditCriticalityCoverage(
  actions: RegisteredActionMetadata[]
): CriticalityAuditReport {
  const normalized = actions.map((action) => {
    const sideEffects = inferSideEffects(action.name);
    const dataSensitivity = inferDataSensitivity(action.name);
    const suggestedCriticality = inferCriticality(
      action.name,
      sideEffects,
      dataSensitivity
    );
    const criticalitySource = action.criticalitySource;
    const needsReview = criticalitySource !== "explicit";

    return {
      name: action.name,
      version: action.version,
      criticality: action.criticality,
      criticalitySource,
      suggestedCriticality,
      sideEffects,
      dataSensitivity,
      needsReview,
    } satisfies CriticalityAuditEntry;
  });

  const sorted = normalized.sort((a, b) => a.name.localeCompare(b.name));
  const missing = sorted.filter((entry) => entry.needsReview);
  const explicitCount = sorted.length - missing.length;
  const coveragePct = sorted.length === 0 ? 0 : (explicitCount / sorted.length) * 100;

  return {
    total: sorted.length,
    explicitCount,
    coveragePct: Number(coveragePct.toFixed(2)),
    missing,
    actions: sorted,
  };
}
