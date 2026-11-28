export const FINANCIAL_STANDING_VERSION = "tenant-financial-standing.v1" as const;

export type Obligation = Readonly<{
  id: string; tenantId: string; purpose: "eiah_service_fee";
  amountCents: number; currency: string; dueAt: string;
}>;
export type Payment = Readonly<{
  id: string; tenantId: string; obligationId: string; amountCents: number; currency: string;
  status: "pending" | "confirmed" | "reversed";
  confirmedAt: string | null; reversedAt: string | null;
  provider: string; transactionId: string; evidenceRef: string;
  adapterMode: "external" | "simulated";
}>;
export type FinancialSnapshot = Readonly<{
  schemaVersion: typeof FINANCIAL_STANDING_VERSION;
  tenantId: string; sourceRef: string; snapshotRef: string; observedAt: string;
  obligations: readonly Obligation[]; payments: readonly Payment[];
}>;
// The implementation must verify origin AND complete coverage of obligations and
// payment/reversal history for this snapshot. Payload flags are not verification.
export type FinancialSourceVerifier = (snapshot: FinancialSnapshot) => Promise<{
  originVerified: boolean; coverageVerified: boolean;
}>;
export type FinancialStanding = Readonly<{
  status: "current" | "past_due" | "verification_unavailable";
  reason: string;
  decision: "continue_other_gates" | "block";
  overdueObligationIds: readonly string[];
  independentSourceVerification: "not_demonstrated";
  operationalEligibility: "blocked";
}>;

function result(status: FinancialStanding["status"], reason: string,
  overdueObligationIds: readonly string[] = []): FinancialStanding {
  return { status, reason, decision: status === "current" ? "continue_other_gates" : "block",
    overdueObligationIds, independentSourceVerification: "not_demonstrated", operationalEligibility: "blocked" };
}
function requireFact(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function timestamp(value: unknown): number {
  requireFact(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value), "invalid_timestamp");
  const time = Date.parse(value);
  requireFact(Number.isFinite(time), "invalid_timestamp");
  requireFact(new Date(time).toISOString() === value, "noncanonical_timestamp");
  return time;
}
function amount(value: unknown): asserts value is number {
  requireFact(Number.isSafeInteger(value) && Number(value) >= 0, "invalid_amount");
}

// Prototype only: no DB, provider call, PRE_DUIMP wiring or operational promotion.
export async function evaluateTenantFinancialStanding(input: {
  tenantId: string; evaluatedAt: string; maxSnapshotAgeMs: number;
  snapshot: FinancialSnapshot | null; verifySource: FinancialSourceVerifier;
}): Promise<FinancialStanding> {
  try {
    requireFact(text(input.tenantId), "invalid_tenant");
    const now = timestamp(input.evaluatedAt);
    requireFact(Number.isSafeInteger(input.maxSnapshotAgeMs) && input.maxSnapshotAgeMs >= 0, "invalid_freshness_policy");
    const snapshot = input.snapshot;
    requireFact(snapshot && snapshot.schemaVersion === FINANCIAL_STANDING_VERSION, "source_unavailable");
    requireFact(snapshot.tenantId === input.tenantId, "tenant_mismatch");
    requireFact(text(snapshot.sourceRef) && text(snapshot.snapshotRef), "source_reference_missing");
    const observed = timestamp(snapshot.observedAt);
    requireFact(observed <= now && now - observed <= input.maxSnapshotAgeMs, "snapshot_not_current");
    requireFact(Array.isArray(snapshot.obligations) && Array.isArray(snapshot.payments), "invalid_population");
    const obligations = new Map<string, Obligation>();
    for (const row of snapshot.obligations) {
      requireFact(row && text(row.id) && !obligations.has(row.id), "duplicate_or_invalid_obligation");
      requireFact(row.tenantId === input.tenantId, "tenant_mismatch");
      requireFact(row.purpose === "eiah_service_fee", "unrelated_obligation");
      amount(row.amountCents); timestamp(row.dueAt);
      requireFact(typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency), "invalid_currency");
      obligations.set(row.id, row);
    }
    const paymentIds = new Set<string>();
    const transactionIds = new Set<string>();
    const paid = new Map<string, number>();
    for (const row of snapshot.payments) {
      requireFact(row && text(row.id) && !paymentIds.has(row.id), "duplicate_or_invalid_payment");
      paymentIds.add(row.id);
      requireFact(row.tenantId === input.tenantId, "tenant_mismatch");
      const obligation = obligations.get(row.obligationId);
      requireFact(obligation, "payment_obligation_missing");
      amount(row.amountCents);
      requireFact(row.currency === obligation.currency, "currency_mismatch");
      requireFact(row.adapterMode === "external", "simulated_or_unknown_receipt");
      requireFact(text(row.provider) && text(row.transactionId) && text(row.evidenceRef), "payment_evidence_missing");
      const key = JSON.stringify([row.provider, row.transactionId]);
      requireFact(!transactionIds.has(key), "duplicate_transaction");
      transactionIds.add(key);
      requireFact(["pending", "confirmed", "reversed"].includes(row.status), "unknown_payment_status");
      if (row.status === "pending") {
        requireFact(row.confirmedAt === null && row.reversedAt === null, "contradictory_payment_state");
        continue;
      }
      const confirmed = timestamp(row.confirmedAt);
      requireFact(confirmed <= observed, "payment_after_snapshot");
      if (row.status === "reversed") {
        const reversed = timestamp(row.reversedAt);
        requireFact(reversed >= confirmed && reversed <= observed, "invalid_reversal");
        continue;
      }
      requireFact(row.reversedAt === null, "contradictory_payment_state");
      const total = (paid.get(row.obligationId) ?? 0) + row.amountCents;
      amount(total);
      requireFact(total <= obligation.amountCents, "payment_overallocation");
      paid.set(row.obligationId, total);
    }
    let verification;
    try { verification = await input.verifySource(snapshot); }
    catch { return result("verification_unavailable", "source_verification_failed"); }
    requireFact(verification?.originVerified === true && verification?.coverageVerified === true, "source_not_verified_or_incomplete");
    const overdue = [...obligations.values()].filter(row => timestamp(row.dueAt) < now
      && (paid.get(row.id) ?? 0) < row.amountCents).map(row => row.id).sort();
    return overdue.length ? result("past_due", "confirmed_overdue_balance", overdue)
      : result("current", "no_confirmed_overdue_balance");
  } catch (error) {
    return result("verification_unavailable", error instanceof Error ? error.message : "invalid_source_material");
  }
}
