/** Proposed internal P1 source capture. The read port does not authenticate its own origin. */
import { selectInternalRunCandidates, type InternalRunInput, type InternalWorkspaceInput } from "./p1InternalRunPopulation.js";
import { sourceContentDigest, validateSourceTimestamp } from "./p1SourceMaterial.js";

export const INTERNAL_SOURCE_CAPTURE_VERSION = "p1-internal-source-capture.v1";
type FactIdentity = Readonly<{
  id: string; tenantId: string; workspaceId: string | null; runId: string | null; createdAt: string;
}>;
export type InternalFactInput =
  | (FactIdentity & Readonly<{ kind: "usage" }>)
  | (FactIdentity & Readonly<{ kind: "ledger"; entryType: "debit" }>)
  | (FactIdentity & Readonly<{ kind: "authority"; actionType: "blocked.guardrails" }>);
export type SourceReadScope = Readonly<{
  tenantId: string; from: string; to: string; cutoffAt: string;
}>;
/** All methods of one view must be backed by the same source snapshot in a future adapter. */
export type InternalSourceReadView = Readonly<{
  snapshotRef: string;
  listWorkspaces(tenantId: string): Promise<readonly InternalWorkspaceInput[]>;
  listRuns(scope: SourceReadScope): Promise<readonly InternalRunInput[]>;
  /** Include pertinent unlinked facts and facts created after the run window through the cutoff. */
  listFacts(scope: SourceReadScope): Promise<readonly InternalFactInput[]>;
}>;
export type InternalSourceReadPort = Readonly<{
  withReadView<T>(read: (view: InternalSourceReadView) => Promise<T>): Promise<T>;
}>;
export type InternalSourceCapture = Readonly<{
  schemaVersion: typeof INTERNAL_SOURCE_CAPTURE_VERSION;
  scope: Readonly<{ tenantId: string; domain: "billing" }>;
  window: Readonly<{ from: string; to: string }>;
  cutoffAt: string;
  snapshotRef: string;
  workspaceIds: readonly string[];
  runs: readonly Readonly<Pick<InternalRunInput, "id" | "workspaceId" | "createdAt" | "finishedAt" | "status">>[];
  facts: readonly InternalFactInput[];
  counts: Readonly<{ workspaces: number; runs: number; pendingRuns: number; usage: number; ledger: number; authority: number; unresolvedFacts: number }>;
  sourcePopulationVerification: "not_demonstrated";
  snapshotVerification: "not_demonstrated";
  watermarkVerification: "not_demonstrated";
  operationMappingVerification: "not_demonstrated";
  operationalEligibility: "blocked";
  digest: string;
}>;
function requireThat(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason); }
function nonempty(v: unknown): v is string { return typeof v === "string" && !!v.trim() && v === v.trim(); }
function instant(v: unknown): number { return Date.parse(validateSourceTimestamp(v)); }
const key = (kind: string, id: string) => JSON.stringify([kind, id]);

/**
 * Captures INCLUDED rows and checks scope/identity. The port implementation
 * must prove transaction consistency, pagination exhaustion and watermark
 * separately; this function never upgrades those guarantees.
 */
export async function captureInternalSourceCandidates(
  port: InternalSourceReadPort, scope: SourceReadScope,
): Promise<InternalSourceCapture> {
  requireThat(port && typeof port.withReadView === "function", "read_port_required");
  requireThat(scope && nonempty(scope.tenantId), "tenant_required");
  const from = instant(scope.from), to = instant(scope.to), cutoff = instant(scope.cutoffAt);
  requireThat(from < to && to <= cutoff, "invalid_window_or_cutoff");
  return port.withReadView(async view => {
    requireThat(view && nonempty(view.snapshotRef), "snapshot_reference_required");
    const workspaces = await view.listWorkspaces(scope.tenantId);
    const runs = await view.listRuns(scope);
    const selection = selectInternalRunCandidates({
      tenantId: scope.tenantId, window: { from: scope.from, to: scope.to },
      cutoffAt: scope.cutoffAt, workspaces, runs,
    });
    const facts = await view.listFacts(scope);
    requireThat(Array.isArray(facts), "invalid_facts");
    const byRun = new Map(runs.map(r => [r.id, r]));
    const workspaceIds = new Set(selection.workspaceIds);
    const factIds = new Set<string>();
    const counts = { workspaces: workspaceIds.size, runs: runs.length, pendingRuns: selection.pendingRunIds.length,
      usage: 0, ledger: 0, authority: 0, unresolvedFacts: 0 };
    const capturedFacts: InternalFactInput[] = [];
    for (const f of facts) {
      requireThat(f && nonempty(f.id) && ["usage", "ledger", "authority"].includes(f.kind), "invalid_fact_identity");
      requireThat(f.kind !== "ledger" || f.entryType === "debit", "unsupported_ledger_entry_type");
      requireThat(f.kind !== "authority" || f.actionType === "blocked.guardrails", "unsupported_authority_action_type");
      const identity = key(f.kind, f.id);
      requireThat(!factIds.has(identity), "duplicate_fact");
      factIds.add(identity);
      requireThat(f.tenantId === scope.tenantId, "fact_tenant_mismatch");
      const date = instant(f.createdAt);
      requireThat(date <= cutoff, "fact_after_cutoff");
      requireThat(f.workspaceId === null || (nonempty(f.workspaceId) && workspaceIds.has(f.workspaceId)), "fact_workspace_not_in_tenant");
      requireThat(f.runId === null || nonempty(f.runId), "invalid_fact_run_reference");
      const linkedRun = f.runId === null ? undefined : byRun.get(f.runId);
      if (linkedRun) requireThat(f.workspaceId === null || f.workspaceId === linkedRun.workspaceId, "fact_run_workspace_mismatch");
      else counts.unresolvedFacts++;
      if (f.kind === "usage") counts.usage++;
      else if (f.kind === "ledger") counts.ledger++;
      else counts.authority++;
      capturedFacts.push({ ...f });
    }
    const content = {
      schemaVersion: INTERNAL_SOURCE_CAPTURE_VERSION as typeof INTERNAL_SOURCE_CAPTURE_VERSION, scope: { tenantId: scope.tenantId, domain: "billing" as const },
      window: { from: scope.from, to: scope.to }, cutoffAt: scope.cutoffAt, snapshotRef: view.snapshotRef,
      workspaceIds: selection.workspaceIds,
      runs: runs.map(r => ({ id: r.id, workspaceId: r.workspaceId, createdAt: r.createdAt, finishedAt: r.finishedAt, status: r.status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      facts: capturedFacts.sort((a, b) => key(a.kind, a.id).localeCompare(key(b.kind, b.id))),
      counts, sourcePopulationVerification: "not_demonstrated" as const,
      snapshotVerification: "not_demonstrated" as const, watermarkVerification: "not_demonstrated" as const,
      operationMappingVerification: "not_demonstrated" as const, operationalEligibility: "blocked" as const,
    };
    return { ...content, digest: sourceContentDigest(content) };
  });
}
