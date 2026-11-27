/** Local source projections only. No billing semantics, source access or metric executor. */
import { canonicalDigest } from "../../packages/core/src/utils/canonicalDigest.js";

export const SOURCE_MATERIAL_VERSION = "p1-source-material.v1";
export const SOURCE_DIAGNOSTIC_VERSION = "p1-source-diagnostic.v2";
export class SourceMaterialError extends Error {}
export type SnapshotMetadata = Readonly<{
  description: string; sourceQueryDescription: string; capturedAt: string; rowCount: number;
}>;
export type SourceScope = Readonly<{ tenantId: string; workspaceId: string; domain: string }>;
export type SourceRun = Readonly<{
  id: string; createdAt: string; finishedAt: string | null; digest: string;
}>;
export type SourceFact = Readonly<{
  id: string; kind: "usage" | "ledger" | "authority"; createdAt: string;
  link: Readonly<{ status: "linked"; runId: string; runDigest: string }>
    | Readonly<{ status: "unresolved"; runId: string | null; reason: string }>;
  digest: string;
}>;
// Intentionally minimal identity/time projections, NOT complete financial source rows.
export type SourceMaterial =
  | Readonly<{ schemaVersion: typeof SOURCE_MATERIAL_VERSION; kind: "metadata_only"; metadata: SnapshotMetadata }>
  | Readonly<{
      schemaVersion: typeof SOURCE_MATERIAL_VERSION; kind: "rows_included";
      scope: SourceScope; window: Readonly<{ from: string; to: string }>;
      cutoffAt: string; generatedAt: string; runs: readonly SourceRun[]; facts: readonly SourceFact[];
      counts: Readonly<{ runs: number; facts: number; unresolvedLinks: number }>;
      semantics: Readonly<{ operationMapping: "unresolved"; duplicateKey: "unresolved"; denominators: "unresolved" }>;
      digest: string;
    }>;
export type SourceDiagnostic = Readonly<{
  schemaVersion: typeof SOURCE_DIAGNOSTIC_VERSION;
  sourceMaterial: "absent" | "metadata_only" | "rows_included";
  internalConsistency: Readonly<{ status: "not_evaluated_here"; note: string }>;
  completenessAndAuthenticityOfInputs: Readonly<{ status: "not_demonstrated"; reason: string }>;
  // Stage 1 cannot execute metrics. Successful/failed executions require a future executor/contract.
  recomputation: Readonly<{ status: "not_run"; reason: "executor_not_implemented" }>;
  independentSourceVerification: Readonly<{ status: "not_demonstrated" }>;
}>;

function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new SourceMaterialError(message);
}
function record(raw: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  requireThat(!!raw && typeof raw === "object" && !Array.isArray(raw), `${label}: object required`);
  const r = raw as Record<string, unknown>;
  requireThat(Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k)), `${label}: unexpected or missing fields`);
  return r;
}
function str(raw: unknown, label: string): asserts raw is string {
  requireThat(typeof raw === "string" && raw.trim().length > 0 && raw === raw.trim(), `${label}: nonempty trimmed string required`);
}
function count(raw: unknown, label: string): asserts raw is number {
  requireThat(typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0, `${label}: nonnegative safe integer required`);
}
export function validateSourceTimestamp(raw: unknown): string {
  requireThat(typeof raw === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(raw), "timestamp: UTC ISO seconds/milliseconds required");
  const ms = Date.parse(raw);
  requireThat(Number.isFinite(ms) && new Date(ms).toISOString() === (raw.includes(".") ? raw : raw.replace("Z", ".000Z")), "timestamp: invalid calendar date");
  return raw;
}
function digest(raw: unknown): asserts raw is string {
  requireThat(typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw), "digest: lowercase SHA-256 required");
}
/** Same repository canonicalization; this checks bytes, never authenticity/completeness. */
export function sourceContentDigest(value: Record<string, unknown>): string {
  const { digest: _digest, ...content } = value;
  return canonicalDigest(content);
}
function checkDigest(r: Record<string, unknown>): void {
  digest(r.digest);
  requireThat(r.digest === sourceContentDigest(r), "digest mismatch");
}
export function validateSnapshotMetadata(raw: unknown): SnapshotMetadata {
  const r = record(raw, ["description", "sourceQueryDescription", "capturedAt", "rowCount"], "metadata");
  str(r.description, "description"); str(r.sourceQueryDescription, "query description");
  validateSourceTimestamp(r.capturedAt); count(r.rowCount, "rowCount");
  return { description: r.description, sourceQueryDescription: r.sourceQueryDescription, capturedAt: r.capturedAt as string, rowCount: r.rowCount };
}
export function validateSourceMaterial(raw: unknown): SourceMaterial {
  requireThat(!!raw && typeof raw === "object" && !Array.isArray(raw), "material: object required");
  const input = raw as Record<string, unknown>;
  requireThat(input.schemaVersion === SOURCE_MATERIAL_VERSION, "unsupported source material version");
  if (input.kind === "metadata_only") {
    const r = record(raw, ["schemaVersion", "kind", "metadata"], "material");
    return { schemaVersion: SOURCE_MATERIAL_VERSION, kind: "metadata_only", metadata: validateSnapshotMetadata(r.metadata) };
  }
  requireThat(input.kind === "rows_included", "unsupported material kind");
  const r = record(raw, ["schemaVersion", "kind", "scope", "window", "cutoffAt", "generatedAt", "runs", "facts", "counts", "semantics", "digest"], "material");
  const scope = record(r.scope, ["tenantId", "workspaceId", "domain"], "scope");
  for (const key of ["tenantId", "workspaceId", "domain"]) str(scope[key], key);
  const window = record(r.window, ["from", "to"], "window");
  const from = Date.parse(validateSourceTimestamp(window.from)); const to = Date.parse(validateSourceTimestamp(window.to));
  const cutoff = Date.parse(validateSourceTimestamp(r.cutoffAt)); const generated = Date.parse(validateSourceTimestamp(r.generatedAt));
  requireThat(from < to && to <= cutoff && cutoff <= generated, "window/cutoff/generation order invalid");
  const semantics = record(r.semantics, ["operationMapping", "duplicateKey", "denominators"], "semantics");
  requireThat(Object.values(semantics).every(v => v === "unresolved"), "billing semantics must remain unresolved");
  requireThat(Array.isArray(r.runs) && Array.isArray(r.facts), "runs/facts arrays required");
  const runDigests = new Map<string, string>();
  for (const value of r.runs) {
    const row = record(value, ["id", "createdAt", "finishedAt", "digest"], "run");
    str(row.id, "run id"); requireThat(!runDigests.has(row.id), "duplicate run identity");
    const created = Date.parse(validateSourceTimestamp(row.createdAt));
    requireThat(from <= created && created < to, "run outside creation window");
    if (row.finishedAt !== null) {
      const finished = Date.parse(validateSourceTimestamp(row.finishedAt));
      requireThat(created <= finished && finished <= cutoff, "run finish outside observation boundary");
    }
    checkDigest(row); runDigests.set(row.id, row.digest as string);
  }
  const identities = new Set<string>(); let unresolved = 0;
  for (const value of r.facts) {
    const row = record(value, ["id", "kind", "createdAt", "link", "digest"], "fact");
    str(row.id, "fact id"); requireThat(["usage", "ledger", "authority"].includes(row.kind as string), "unknown fact kind");
    const identity = JSON.stringify([row.kind, row.id]);
    requireThat(!identities.has(identity), "duplicate fact identity"); identities.add(identity);
    requireThat(Date.parse(validateSourceTimestamp(row.createdAt)) <= cutoff, "fact after cutoff");
    requireThat(!!row.link && typeof row.link === "object", "fact link required");
    const linked = (row.link as Record<string, unknown>).status === "linked";
    const link = record(row.link, linked ? ["status", "runId", "runDigest"] : ["status", "runId", "reason"], "link");
    if (linked) {
      str(link.runId, "run reference"); digest(link.runDigest);
      requireThat(runDigests.get(link.runId) === link.runDigest, "missing run reference or mismatched run digest");
    } else {
      requireThat(link.status === "unresolved", "unknown link status");
      if (link.runId !== null) str(link.runId, "unresolved run reference");
      str(link.reason, "unresolved reason"); unresolved++;
    }
    checkDigest(row);
  }
  const counts = record(r.counts, ["runs", "facts", "unresolvedLinks"], "counts");
  for (const v of Object.values(counts)) count(v, "count");
  requireThat(counts.runs === r.runs.length && counts.facts === r.facts.length && counts.unresolvedLinks === unresolved, "derived counts mismatch");
  checkDigest(r);
  // Return a detached JSON projection; callers cannot mutate input through this result.
  return JSON.parse(JSON.stringify(r)) as SourceMaterial;
}
/** Validates stage-1 output only. Claims of executed success OR failure are unsupported. */
export function validateSourceDiagnostic(raw: unknown): SourceDiagnostic {
  const r = record(raw, ["schemaVersion", "sourceMaterial", "recomputation", "independentSourceVerification", "internalConsistency", "completenessAndAuthenticityOfInputs"], "diagnostic");
  requireThat(r.schemaVersion === SOURCE_DIAGNOSTIC_VERSION, "unsupported diagnostic version");
  requireThat(["absent", "metadata_only", "rows_included"].includes(r.sourceMaterial as string), "unknown source material status");
  const recomputation = record(r.recomputation, ["status", "reason"], "recomputation");
  requireThat(recomputation.status === "not_run" && recomputation.reason === "executor_not_implemented", "execution claims are not verifiable in stage 1");
  const verification = record(r.independentSourceVerification, ["status"], "independent verification");
  requireThat(verification.status === "not_demonstrated", "independent verification is not demonstrated");
  const internal = record(r.internalConsistency, ["status", "note"], "internal consistency");
  requireThat(internal.status === "not_evaluated_here", "cycle consistency is not evaluated here"); str(internal.note, "internal note");
  const completeness = record(r.completenessAndAuthenticityOfInputs, ["status", "reason"], "completeness");
  requireThat(completeness.status === "not_demonstrated", "completeness is not demonstrated"); str(completeness.reason, "completeness reason");
  return JSON.parse(JSON.stringify(r)) as SourceDiagnostic;
}
export function describeSourceMaterial(raw: unknown = null): SourceDiagnostic {
  const material = raw === null ? null : validateSourceMaterial(raw);
  return {
    schemaVersion: SOURCE_DIAGNOSTIC_VERSION, sourceMaterial: material?.kind ?? "absent",
    internalConsistency: { status: "not_evaluated_here", note: "cycle consistency remains delegated to p1CycleSelection.ts; source structure validation is not source verification" },
    completenessAndAuthenticityOfInputs: { status: "not_demonstrated", reason: "included metadata, projections and hashes do not prove source completeness or authenticity" },
    recomputation: { status: "not_run", reason: "executor_not_implemented" },
    independentSourceVerification: { status: "not_demonstrated" },
  };
}
