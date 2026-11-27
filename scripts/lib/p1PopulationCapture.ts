/** Synthetic/local population comparison. A supplied capture is never proof of its own origin. */
import { validateFinancialProjection, type FinancialProjection } from "./p1FinancialProjection.js";
import { sourceContentDigest, validateSourceTimestamp } from "./p1SourceMaterial.js";

export const POPULATION_CAPTURE_VERSION = "p1-population-capture.v1";
type CaptureRun = Readonly<{ id: string; operationId: string; createdAt: string; finishedAt: string | null; status: string }>;
type CaptureFact = Readonly<{ kind: "usage" | "ledger" | "authority"; id: string; runId: string | null; createdAt: string }>;
export type PopulationCapture = Readonly<{
  schemaVersion: typeof POPULATION_CAPTURE_VERSION;
  scope: Readonly<{ tenantId: string; workspaceId: string; domain: "billing" }>;
  window: Readonly<{ from: string; to: string }>;
  cutoffAt: string;
  snapshot: Readonly<{ ref: string; digest: string }>;
  watermark: Readonly<{ ref: string; visibleThrough: string }>;
  runs: readonly CaptureRun[];
  facts: readonly CaptureFact[];
  digest: string;
}>;
export type PopulationComparison = Readonly<{
  schemaVersion: "p1-population-comparison.v1";
  internalConsistency: "consistent" | "failed";
  reasons: readonly string[];
  independentSourceVerification: "not_demonstrated";
  operationMappingVerification: "not_demonstrated";
  snapshotVerification: "not_demonstrated";
  watermarkVerification: "not_demonstrated";
  operationalEligibility: "blocked";
}>;
const terminal = new Set(["success", "error", "blocked"]);
const pending = new Set(["pending", "running", "awaiting_approval"]);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.trim() === v;
const fail = (reason: string): never => { throw new Error(reason); };
function timestamp(v: unknown): number {
  try { return Date.parse(validateSourceTimestamp(v)); } catch { return fail("invalid_timestamp"); }
}
function uniqueKey(kind: string, id: string) { return JSON.stringify([kind, id]); }

/** Compares two INCLUDED sets. No database access, trusted snapshot or verified watermark. */
export function comparePopulationCapture(raw: unknown, projectionRaw: unknown): PopulationComparison {
  const reasons: string[] = [];
  try {
    const p: FinancialProjection = validateFinancialProjection(projectionRaw);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid_capture");
    const c = raw as PopulationCapture;
    if (c.schemaVersion !== POPULATION_CAPTURE_VERSION || !Array.isArray(c.runs) || !Array.isArray(c.facts)) fail("invalid_capture");
    if (!hash(c.digest) || sourceContentDigest(c as unknown as Record<string, unknown>) !== c.digest) fail("capture_digest_mismatch");
    if (!c.scope || c.scope.domain !== "billing" || !str(c.scope.tenantId) || !str(c.scope.workspaceId)) fail("invalid_scope");
    if (!c.window || !c.snapshot || !c.watermark || !str(c.snapshot.ref) || !hash(c.snapshot.digest) || !str(c.watermark.ref)) fail("invalid_capture_metadata");
    const from = timestamp(c.window.from), to = timestamp(c.window.to), cutoff = timestamp(c.cutoffAt);
    const visibleThrough = timestamp(c.watermark.visibleThrough);
    if (!(from < to && to <= cutoff && visibleThrough >= cutoff)) reasons.push("capture_boundary_not_demonstrated");
    if (c.scope.tenantId !== p.scope.tenantId || c.scope.workspaceId !== p.scope.workspaceId ||
      c.window.from !== p.window.from || c.window.to !== p.window.to || c.cutoffAt !== p.cutoffAt) reasons.push("projection_scope_or_cutoff_mismatch");
    const runs = new Map<string, CaptureRun>();
    for (const r of c.runs) {
      if (!r || !str(r.id) || !str(r.operationId) || !str(r.status) || runs.has(r.id)) { reasons.push("duplicate_or_invalid_run_identity"); continue; }
      runs.set(r.id, r);
      const created = timestamp(r.createdAt);
      if (created < from || created >= to) reasons.push("run_outside_creation_window");
      if (!terminal.has(r.status) && !pending.has(r.status)) reasons.push("unknown_run_status");
      if (r.finishedAt === null) { if (terminal.has(r.status)) reasons.push("terminal_run_without_finish"); else reasons.push("pending_run_at_cutoff"); }
      else if (timestamp(r.finishedAt) < created || timestamp(r.finishedAt) > cutoff || pending.has(r.status)) reasons.push("run_status_or_finish_inconsistent");
    }
    const projectedRuns = new Map(p.runs.map(r => [r.id, r]));
    for (const [id, r] of runs) {
      const projected = projectedRuns.get(id);
      if (!projected || projected.createdAt !== r.createdAt || projected.finishedAt !== r.finishedAt || projected.status !== r.status) reasons.push(`run_missing_or_different:${id}`);
    }
    for (const id of projectedRuns.keys()) if (!runs.has(id)) reasons.push(`unexpected_projection_run:${id}`);
    const projectedFacts = new Map<string, { runId: string | null; createdAt: string }>();
    for (const [kind, rows] of [["usage", p.usage], ["ledger", p.ledger], ["authority", p.authority]] as const) {
      for (const row of rows) projectedFacts.set(uniqueKey(kind, row.id), { runId: row.reference.runId, createdAt: "timestamp" in row ? row.timestamp : row.createdAt });
    }
    const facts = new Set<string>();
    for (const f of c.facts) {
      if (!f || !["usage", "ledger", "authority"].includes(f.kind) || !str(f.id)) { reasons.push("invalid_fact_identity"); continue; }
      const key = uniqueKey(f.kind, f.id);
      if (facts.has(key)) reasons.push(`duplicate_fact:${key}`);
      facts.add(key);
      if (timestamp(f.createdAt) > cutoff) reasons.push(`fact_after_cutoff:${key}`);
      const projected = projectedFacts.get(key);
      if (!projected || projected.runId !== f.runId || projected.createdAt !== f.createdAt) reasons.push(`fact_missing_or_different:${key}`);
    }
    for (const key of projectedFacts.keys()) if (!facts.has(key)) reasons.push(`unexpected_projection_fact:${key}`);
  } catch (error) { reasons.push(error instanceof Error ? error.message : "invalid_input"); }
  return { schemaVersion: "p1-population-comparison.v1", internalConsistency: reasons.length ? "failed" : "consistent",
    reasons: [...new Set(reasons)], independentSourceVerification: "not_demonstrated",
    operationMappingVerification: "not_demonstrated", snapshotVerification: "not_demonstrated",
    watermarkVerification: "not_demonstrated", operationalEligibility: "blocked" };
}
