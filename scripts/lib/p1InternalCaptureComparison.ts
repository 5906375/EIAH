/** Compares tenant-wide included source IDs with per-workspace financial projections. */
import { validateFinancialProjection, type FinancialProjection } from "./p1FinancialProjection.js";
import { INTERNAL_SOURCE_CAPTURE_VERSION, type InternalSourceCapture } from "./p1InternalSourceCapture.js";
import { sourceContentDigest } from "./p1SourceMaterial.js";

export type InternalCaptureComparison = Readonly<{
  schemaVersion: "p1-internal-capture-comparison.v1";
  internalConsistency: "consistent" | "failed";
  reasons: readonly string[];
  independentSourceVerification: "not_demonstrated";
  snapshotVerification: "not_demonstrated";
  watermarkVerification: "not_demonstrated";
  operationMappingVerification: "not_demonstrated";
  operationalEligibility: "blocked";
}>;
const key = (kind: string, id: string) => JSON.stringify([kind, id]);
const validDigest = (digest: unknown) => typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest);
function identity(id: unknown): id is string { return typeof id === "string" && id.length > 0 && id.trim() === id; }

export function compareInternalCaptureWithProjections(raw: unknown, projectionInputs: readonly unknown[]): InternalCaptureComparison {
  const reasons: string[] = [];
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_internal_capture");
    const capture = raw as InternalSourceCapture;
    if (capture.schemaVersion !== INTERNAL_SOURCE_CAPTURE_VERSION || !Array.isArray(capture.workspaceIds) ||
      !Array.isArray(capture.runs) || !Array.isArray(capture.facts) || !capture.scope || !capture.window ||
      !capture.counts || !validDigest(capture.digest) ||
      sourceContentDigest(capture as unknown as Record<string, unknown>) !== capture.digest) throw new Error("invalid_internal_capture");
    if (!Array.isArray(projectionInputs)) throw new Error("invalid_projections");
    const projections: FinancialProjection[] = projectionInputs.map(validateFinancialProjection);
    const workspaces = new Set<string>();
    for (const id of capture.workspaceIds) {
      if (!identity(id) || workspaces.has(id)) reasons.push("duplicate_or_invalid_capture_workspace");
      else workspaces.add(id);
    }
    const projectedWorkspaces = new Set<string>();
    const projectedRuns = new Map<string, { id: string; workspaceId: string; createdAt: string; finishedAt: string | null; status: string }>();
    const projectedFacts = new Map<string, { workspaceId: string | null; runId: string | null; createdAt: string }>();
    for (const p of projections) {
      if (p.scope.tenantId !== capture.scope.tenantId || p.scope.domain !== capture.scope.domain ||
        p.window.from !== capture.window.from || p.window.to !== capture.window.to || p.cutoffAt !== capture.cutoffAt)
        reasons.push("projection_scope_or_cutoff_mismatch");
      if (projectedWorkspaces.has(p.scope.workspaceId)) reasons.push(`duplicate_projection_workspace:${p.scope.workspaceId}`);
      projectedWorkspaces.add(p.scope.workspaceId);
      for (const run of p.runs) {
        if (projectedRuns.has(run.id)) reasons.push(`duplicate_projection_run:${run.id}`);
        projectedRuns.set(run.id, run);
      }
      for (const [kind, rows] of [["usage", p.usage], ["ledger", p.ledger], ["authority", p.authority]] as const) {
        for (const fact of rows) {
          const id = key(kind, fact.id);
          if (projectedFacts.has(id)) reasons.push(`duplicate_projection_fact:${id}`);
          projectedFacts.set(id, { workspaceId: fact.workspaceId, runId: fact.reference.runId,
            createdAt: "timestamp" in fact ? fact.timestamp : fact.createdAt });
        }
      }
    }
    for (const id of workspaces) if (!projectedWorkspaces.has(id)) reasons.push(`projection_workspace_missing:${id}`);
    for (const id of projectedWorkspaces) if (!workspaces.has(id)) reasons.push(`unexpected_projection_workspace:${id}`);
    const capturedRuns = new Set<string>();
    for (const r of capture.runs) {
      if (!r || !identity(r.id) || capturedRuns.has(r.id)) { reasons.push("duplicate_or_invalid_capture_run"); continue; }
      capturedRuns.add(r.id);
      if (!workspaces.has(r.workspaceId)) reasons.push(`run_workspace_not_captured:${r.id}`);
      const p = projectedRuns.get(r.id);
      if (!p || p.workspaceId !== r.workspaceId || p.createdAt !== r.createdAt ||
        p.finishedAt !== r.finishedAt || p.status !== r.status) reasons.push(`run_missing_or_different:${r.id}`);
    }
    for (const id of projectedRuns.keys()) if (!capturedRuns.has(id)) reasons.push(`unexpected_projection_run:${id}`);
    const capturedFacts = new Set<string>();
    for (const f of capture.facts) {
      if (!f || !identity(f.id) || !["usage", "ledger", "authority"].includes(f.kind)) { reasons.push("invalid_capture_fact"); continue; }
      const id = key(f.kind, f.id);
      if (capturedFacts.has(id)) reasons.push(`duplicate_capture_fact:${id}`);
      capturedFacts.add(id);
      if (f.workspaceId !== null && !workspaces.has(f.workspaceId)) reasons.push(`fact_workspace_not_captured:${id}`);
      // The disposition of a null or unknown run link still needs an approved applicability rule.
      if (f.runId === null || !capturedRuns.has(f.runId)) reasons.push(`unresolved_fact_link:${id}`);
      const p = projectedFacts.get(id);
      if (!p || p.workspaceId !== f.workspaceId || p.runId !== f.runId || p.createdAt !== f.createdAt)
        reasons.push(`fact_missing_or_different:${id}`);
    }
    for (const id of projectedFacts.keys()) if (!capturedFacts.has(id)) reasons.push(`unexpected_projection_fact:${id}`);
    if (capture.counts.workspaces !== capture.workspaceIds.length || capture.counts.runs !== capture.runs.length ||
      capture.counts.pendingRuns !== capture.runs.filter(r => r.finishedAt === null).length ||
      capture.counts.unresolvedFacts !== capture.facts.filter(f => f.runId === null || !capturedRuns.has(f.runId)).length ||
      capture.counts.usage !== capture.facts.filter(f => f.kind === "usage").length ||
      capture.counts.ledger !== capture.facts.filter(f => f.kind === "ledger").length ||
      capture.counts.authority !== capture.facts.filter(f => f.kind === "authority").length)
      reasons.push("capture_counts_mismatch");
  } catch (error) { reasons.push(error instanceof Error ? error.message : "invalid_input"); }
  return { schemaVersion: "p1-internal-capture-comparison.v1", internalConsistency: reasons.length ? "failed" : "consistent",
    reasons: [...new Set(reasons)], independentSourceVerification: "not_demonstrated", snapshotVerification: "not_demonstrated",
    watermarkVerification: "not_demonstrated", operationMappingVerification: "not_demonstrated", operationalEligibility: "blocked" };
}
