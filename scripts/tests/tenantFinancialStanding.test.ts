import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTenantFinancialStanding, FINANCIAL_STANDING_VERSION,
  type FinancialSnapshot, type FinancialSourceVerifier, type Payment } from "../lib/tenantFinancialStanding.ts";

const now = "2026-09-30T10:00:00.000Z";
const verifier: FinancialSourceVerifier = async () => ({ originVerified: true, coverageVerified: true });
function fixture(): FinancialSnapshot {
  return { schemaVersion: FINANCIAL_STANDING_VERSION, tenantId: "tenant-a",
    sourceRef: "fixture-source", snapshotRef: "fixture-snapshot", observedAt: now,
    obligations: [{ id: "invoice-a", tenantId: "tenant-a", purpose: "eiah_service_fee",
      amountCents: 1000, currency: "BRL", dueAt: "2026-09-29T10:00:00.000Z" }], payments: [] };
}
function payment(patch: Partial<Payment> = {}): Payment {
  return { id: "payment-a", tenantId: "tenant-a", obligationId: "invoice-a",
    amountCents: 1000, currency: "BRL", status: "confirmed",
    confirmedAt: "2026-09-29T11:00:00.000Z", reversedAt: null,
    provider: "fixture-external", transactionId: "transaction-a", evidenceRef: "fixture-evidence",
    adapterMode: "external", ...patch };
}
async function evaluate(snapshot: FinancialSnapshot | null, verifySource = verifier) {
  const before = JSON.stringify(snapshot);
  const answer = await evaluateTenantFinancialStanding({ tenantId: "tenant-a", evaluatedAt: now,
    maxSnapshotAgeMs: 60_000, snapshot, verifySource });
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(answer.operationalEligibility, "blocked");
  assert.equal(answer.independentSourceVerification, "not_demonstrated");
  return answer;
}
test("confirmed overdue balance blocks; complete payment permits only the remaining gates", async () => {
  assert.equal((await evaluate(fixture())).status, "past_due");
  const settled = await evaluate({ ...fixture(), payments: [payment()] });
  assert.equal(settled.status, "current");
  assert.equal(settled.decision, "continue_other_gates");
});
test("partial or pending payment does not clear overdue balance", async () => {
  for (const row of [payment({ amountCents: 400 }), payment({ status: "pending", confirmedAt: null })]) {
    assert.equal((await evaluate({ ...fixture(), payments: [row] })).status, "past_due");
  }
});
test("full reversal restores balance; a different overdue obligation still blocks", async () => {
  assert.equal((await evaluate({ ...fixture(), payments: [payment({ status: "reversed", reversedAt: now })] })).status, "past_due");
  const f = fixture();
  const r = await evaluate({ ...f, obligations: [...f.obligations, { ...f.obligations[0], id: "invoice-b" }], payments: [payment()] });
  assert.deepEqual(r.overdueObligationIds, ["invoice-b"]);
});
test("due boundary is explicit; future and zero obligations are not overdue balances", async () => {
  for (const patch of [{ dueAt: now }, { dueAt: "2026-10-01T00:00:00.000Z" }, { amountCents: 0 }]) {
    const f = fixture();
    assert.equal((await evaluate({ ...f, obligations: [{ ...f.obligations[0], ...patch }] })).status, "current");
  }
});
test("empty population needs origin and coverage verification", async () => {
  const empty = { ...fixture(), obligations: [] };
  assert.equal((await evaluate(empty)).status, "current");
  assert.equal((await evaluate(empty, async () => ({ originVerified: true, coverageVerified: false }))).status, "verification_unavailable");
});
test("missing source, rejected origin and verifier exception are unavailable, not delinquency", async () => {
  for (const answer of [await evaluate(null), await evaluate(fixture(), async () => ({ originVerified: false, coverageVerified: true })),
    await evaluate(fixture(), async () => { throw new Error("offline"); })]) {
    assert.equal(answer.status, "verification_unavailable"); assert.equal(answer.decision, "block");
    assert.deepEqual(answer.overdueObligationIds, []);
  }
});
test("simulated receipt cannot clear payment even when verifier would accept", async () => {
  let called = false;
  const r = await evaluate({ ...fixture(), payments: [payment({ adapterMode: "simulated" })] }, async () => {
    called = true; return { originVerified: true, coverageVerified: true };
  });
  assert.equal(r.reason, "simulated_or_unknown_receipt"); assert.equal(called, false);
});
test("tenant scope is checked on snapshot, obligation and payment", async () => {
  const f = fixture();
  for (const s of [{ ...f, tenantId: "other" }, { ...f, obligations: [{ ...f.obligations[0], tenantId: "other" }] },
    { ...f, payments: [payment({ tenantId: "other" })] }]) assert.equal((await evaluate(s)).reason, "tenant_mismatch");
});
test("duplicate identities and transaction IDs cannot double count", async () => {
  const f = fixture();
  for (const s of [{ ...f, obligations: [...f.obligations, ...f.obligations] }, { ...f, payments: [payment(), payment()] },
    { ...f, payments: [payment({ amountCents: 500 }), payment({ id: "second", amountCents: 500 })] }]) {
    assert.equal((await evaluate(s)).status, "verification_unavailable");
  }
});
test("orphan payment, currency mismatch and overallocation fail closed", async () => {
  for (const patch of [{ obligationId: "other" }, { currency: "USD" }, { amountCents: 1001 }]) {
    assert.equal((await evaluate({ ...fixture(), payments: [payment(patch)] })).status, "verification_unavailable");
  }
});
test("unsafe and fractional money cannot decide standing", async () => {
  for (const amountCents of [NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture();
    assert.equal((await evaluate({ ...f, obligations: [{ ...f.obligations[0], amountCents }] })).reason, "invalid_amount");
  }
});
test("stale and future snapshots block", async () => {
  for (const observedAt of ["2026-09-30T09:58:59.000Z", "2026-09-30T10:00:01.000Z"]) {
    assert.equal((await evaluate({ ...fixture(), observedAt })).reason, "snapshot_not_current");
  }
});
test("contradictory and future payment states block", async () => {
  for (const patch of [{ status: "pending" as const }, { reversedAt: now },
    { confirmedAt: "2026-09-30T10:00:01.000Z" },
    { status: "reversed" as const, reversedAt: "2026-09-28T10:00:00.000Z" }]) {
    assert.equal((await evaluate({ ...fixture(), payments: [payment(patch)] })).status, "verification_unavailable");
  }
});
