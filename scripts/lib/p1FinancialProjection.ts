/** Financial projection contract. Claims about source completeness are deliberately absent. */
import { sourceContentDigest, validateSourceTimestamp, type SourceScope } from "./p1SourceMaterial.js";
export const FINANCIAL_PROJECTION_VERSION = "p1-financial-projection.v1";
export class FinancialProjectionError extends Error {}
export type Money = Readonly<{ amountCents: number | null; currency: string | null; unit: string | null }>;
type Identity = Readonly<{ id: string; tenantId: string; workspaceId: string | null; digest: string }>;
export type FinancialRun = Identity & Readonly<{ workspaceId: string; createdAt: string; finishedAt: string | null; agent: string; traceId: string | null; status: string; errorCode: string | null; money: Money }>;
type Reference = Readonly<{ runId: string | null; runDigest: string | null }>;
export type FinancialUsage = Identity & Readonly<{ workspaceId: string; createdAt: string; reference: Reference; requestId: string; meterType: string; money: Money }>;
export type FinancialLedger = Identity & Readonly<{ createdAt: string; reference: Reference; requestId: string | null; entryType: string; money: Money }>;
export type FinancialAuthority = Identity & Readonly<{ timestamp: string; reference: Reference; actionType: string }>;
export type DeclaredMetrics = Readonly<{ auditGapCount: number; duplicateChargesCount: number; authorityUnresolvedCount: number }>;
export type FinancialProjection = Readonly<{
  schemaVersion: typeof FINANCIAL_PROJECTION_VERSION; scope: SourceScope;
  window: Readonly<{ from: string; to: string }>; cutoffAt: string; generatedAt: string;
  runs: readonly FinancialRun[]; usage: readonly FinancialUsage[]; ledger: readonly FinancialLedger[]; authority: readonly FinancialAuthority[];
  counts: Readonly<{ runs: number; usage: number; ledger: number; authority: number }>;
  declaredMetrics: DeclaredMetrics | null; digest: string;
}>;
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new FinancialProjectionError(message); }
function rec(raw: unknown, keys: string[], label: string): Record<string, unknown> {
  requireThat(!!raw && typeof raw === "object" && !Array.isArray(raw), `${label}: object required`);
  const r = raw as Record<string, unknown>;
  requireThat(Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k)), `${label}: missing or unexpected fields`); return r;
}
function str(v: unknown): asserts v is string { requireThat(typeof v === "string" && !!v.trim() && v === v.trim(), "nonempty trimmed string required"); }
function nullable(v: unknown): void { if (v !== null) str(v); }
function integer(v: unknown): asserts v is number { requireThat(typeof v === "number" && Number.isSafeInteger(v), "safe integer cents/count required; fractions, nonfinite and overflow rejected"); }
function hash(r: Record<string, unknown>): void { requireThat(typeof r.digest === "string" && /^[a-f0-9]{64}$/.test(r.digest) && r.digest === sourceContentDigest(r), "digest mismatch"); }
function money(v: unknown): void {
  const r = rec(v, ["amountCents", "currency", "unit"], "money");
  if (r.amountCents !== null) integer(r.amountCents);
  nullable(r.currency); nullable(r.unit);
}
export function validateFinancialProjection(raw: unknown): FinancialProjection {
  const p = rec(raw, ["schemaVersion", "scope", "window", "cutoffAt", "generatedAt", "runs", "usage", "ledger", "authority", "counts", "declaredMetrics", "digest"], "projection");
  requireThat(p.schemaVersion === FINANCIAL_PROJECTION_VERSION, "unknown financial projection version");
  const scope = rec(p.scope, ["tenantId", "workspaceId", "domain"], "scope"); Object.values(scope).forEach(str);
  requireThat(scope.domain === "billing", "financial projection requires billing domain; no operation mapping inferred");
  const window = rec(p.window, ["from", "to"], "window");
  const from = Date.parse(validateSourceTimestamp(window.from)), to = Date.parse(validateSourceTimestamp(window.to));
  const cutoff = Date.parse(validateSourceTimestamp(p.cutoffAt)), generated = Date.parse(validateSourceTimestamp(p.generatedAt));
  requireThat(from < to && to <= cutoff && cutoff <= generated, "invalid window/cutoff/generation order");
  const runs = new Map<string, string>();
  const common = ["id", "tenantId", "workspaceId", "digest"];
  for (const name of ["runs", "usage", "ledger", "authority"] as const) {
    requireThat(Array.isArray(p[name]), `${name}: array required`);
    const ids = new Set<string>();
    for (const rawRow of p[name] as unknown[]) {
      const extra = name === "runs" ? ["createdAt", "finishedAt", "agent", "traceId", "status", "errorCode", "money"]
        : name === "usage" ? ["createdAt", "reference", "requestId", "meterType", "money"]
        : name === "ledger" ? ["createdAt", "reference", "requestId", "entryType", "money"] : ["timestamp", "reference", "actionType"];
      const r = rec(rawRow, [...common, ...extra], name); str(r.id); str(r.tenantId); nullable(r.workspaceId);
      requireThat(!ids.has(r.id), `duplicate ${name} identity`); ids.add(r.id);
      requireThat(r.tenantId === scope.tenantId && (r.workspaceId === null || r.workspaceId === scope.workspaceId), "scope mismatch");
      const date = Date.parse(validateSourceTimestamp(name === "authority" ? r.timestamp : r.createdAt));
      requireThat(date <= cutoff, "row after cutoff");
      if (name === "runs") {
        str(r.workspaceId); str(r.agent); str(r.status); nullable(r.traceId); nullable(r.errorCode);
        requireThat(from <= date && date < to, "run outside creation window");
        if (r.finishedAt !== null) { const end = Date.parse(validateSourceTimestamp(r.finishedAt)); requireThat(date <= end && end <= cutoff, "invalid finish date"); }
        runs.set(r.id, r.digest as string);
      } else {
        const reference = rec(r.reference, ["runId", "runDigest"], "reference"); nullable(reference.runId); nullable(reference.runDigest);
        if (reference.runId !== null && runs.has(reference.runId as string)) requireThat(reference.runDigest === runs.get(reference.runId as string), "referenced run digest mismatch");
        else requireThat(reference.runDigest === null, "unresolved reference must not invent a run digest");
        if (name === "usage") { str(r.workspaceId); str(r.requestId); str(r.meterType); requireThat(reference.runId !== null, "usage runId required"); }
        if (name === "ledger") { nullable(r.requestId); str(r.entryType); }
        if (name === "authority") str(r.actionType);
      }
      if (name !== "authority") money(r.money);
      hash(r);
    }
  }
  const counts = rec(p.counts, ["runs", "usage", "ledger", "authority"], "counts");
  for (const k of Object.keys(counts)) { integer(counts[k]); requireThat(counts[k] === (p[k] as unknown[]).length, "derived counts mismatch"); }
  if (p.declaredMetrics !== null) {
    const d = rec(p.declaredMetrics, ["auditGapCount", "duplicateChargesCount", "authorityUnresolvedCount"], "declared metrics");
    for (const v of Object.values(d)) { integer(v); requireThat(v >= 0, "negative declared metric"); }
  }
  hash(p); return JSON.parse(JSON.stringify(p)) as FinancialProjection;
}
