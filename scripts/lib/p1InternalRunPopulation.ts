/** Proposed internal P1 candidate universe. Included rows are not a source-completeness proof. */
import { validateSourceTimestamp } from "./p1SourceMaterial.js";

export const INTERNAL_RUN_POPULATION_VERSION = "p1-internal-run-population.v1";
export type InternalRunInput = Readonly<{
  id: string; tenantId: string; workspaceId: string; createdAt: string;
  finishedAt: string | null; status: string; costCents: number;
}>;
export type InternalWorkspaceInput = Readonly<{ id: string; tenantId: string }>;
export type InternalRunSelection = Readonly<{
  schemaVersion: typeof INTERNAL_RUN_POPULATION_VERSION;
  tenantId: string;
  window: Readonly<{ from: string; to: string }>;
  cutoffAt: string;
  workspaceIds: readonly string[];
  runIds: readonly string[];
  pendingRunIds: readonly string[];
  terminalRunIds: readonly string[];
  candidateCount: number;
  selectionRule: "all_included_tenant_runs_created_in_window";
  sourcePopulationVerification: "not_demonstrated";
  operationMappingVerification: "not_demonstrated";
  operationalEligibility: "blocked";
}>;

const terminal = new Set(["success", "error", "blocked"]);
const pending = new Set(["pending", "running", "awaiting_approval"]);
function requireThat(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(reason);
}
function nonempty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v === v.trim();
}
function instant(v: unknown): number { return Date.parse(validateSourceTimestamp(v)); }

/**
 * Fail closed on malformed/inconsistent included rows. Does not query the DB,
 * infer billability from cost/ledger/usage, or claim that missing rows are absent.
 */
export function selectInternalRunCandidates(input: Readonly<{
  tenantId: string;
  window: Readonly<{ from: string; to: string }>;
  cutoffAt: string;
  workspaces: readonly InternalWorkspaceInput[];
  runs: readonly InternalRunInput[];
}>): InternalRunSelection {
  requireThat(input && nonempty(input.tenantId), "tenant_required");
  requireThat(input.window && Array.isArray(input.workspaces) && Array.isArray(input.runs), "invalid_population_input");
  const from = instant(input.window.from), to = instant(input.window.to), cutoff = instant(input.cutoffAt);
  requireThat(from < to && to <= cutoff, "invalid_window_or_cutoff");
  const workspaces = new Set<string>();
  for (const w of input.workspaces) {
    requireThat(w && nonempty(w.id) && w.tenantId === input.tenantId, "workspace_tenant_mismatch");
    requireThat(!workspaces.has(w.id), "duplicate_workspace");
    workspaces.add(w.id);
  }
  const ids = new Set<string>(), pendingIds: string[] = [], terminalIds: string[] = [];
  for (const run of input.runs) {
    requireThat(run && nonempty(run.id) && run.tenantId === input.tenantId, "run_tenant_mismatch");
    requireThat(!ids.has(run.id), "duplicate_run");
    requireThat(nonempty(run.workspaceId) && workspaces.has(run.workspaceId), "run_workspace_not_in_tenant");
    const created = instant(run.createdAt);
    requireThat(from <= created && created < to, "run_outside_window");
    requireThat(Number.isSafeInteger(run.costCents), "invalid_run_cost");
    requireThat(terminal.has(run.status) || pending.has(run.status), "unknown_run_status");
    if (run.finishedAt === null) {
      requireThat(pending.has(run.status), "terminal_run_without_finish");
      pendingIds.push(run.id);
    } else {
      const finished = instant(run.finishedAt);
      requireThat(created <= finished && finished <= cutoff && terminal.has(run.status), "run_status_or_finish_inconsistent");
      terminalIds.push(run.id);
    }
    ids.add(run.id);
  }
  return {
    schemaVersion: INTERNAL_RUN_POPULATION_VERSION, tenantId: input.tenantId,
    window: { from: input.window.from, to: input.window.to }, cutoffAt: input.cutoffAt,
    workspaceIds: [...workspaces].sort(), runIds: [...ids].sort(),
    pendingRunIds: pendingIds.sort(), terminalRunIds: terminalIds.sort(),
    candidateCount: ids.size, selectionRule: "all_included_tenant_runs_created_in_window",
    sourcePopulationVerification: "not_demonstrated",
    operationMappingVerification: "not_demonstrated", operationalEligibility: "blocked",
  };
}
