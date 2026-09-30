import assert from "node:assert/strict";
import test from "node:test";
import { PROVIDER_CONTRACT_VERSION, evaluateProviderConfirmation, validateProviderRegistry,
  type Asset, type PaymentRail, type ProviderRegistration, type ExpectedPayment,
  type ProviderConfirmation, type ConfirmationVerifier } from "../lib/financialProviderContract.ts";

const now = "2026-09-30T11:00:00.000Z";
const fiat: Asset = { kind: "fiat", currency: "BRL", decimals: 2 };
const crypto: Asset = { kind: "crypto", networkId: "fixture-network", assetId: "fixture-asset", decimals: 18 };
function fixture(rail: PaymentRail = "pix", asset: Asset = fiat) {
  const registration: ProviderRegistration = { schemaVersion: PROVIDER_CONTRACT_VERSION,
    id: "fixture-provider", environment: "production", state: "enabled",
    credentialRef: "secret-ref-only", receivingAccountRef: "fixture-eiah-account",
    supports: [{ rail, asset }], confirmationPolicyRef: "fixture-policy-v1", verificationMethodRef: "fixture-verifier-v1",
    capabilities: { query: true, webhook: true, reversal: true, reconciliation: true } };
  const expected: ExpectedPayment = { tenantId: "tenant-a", obligationId: "invoice-a", paymentId: "payment-a",
    providerId: registration.id, receivingAccountRef: registration.receivingAccountRef,
    rail, asset, amountAtomic: "1000" };
  const confirmation: ProviderConfirmation = { schemaVersion: "financial-confirmation.v1", payment: expected,
    environment: "production", stage: "confirmed", transactionId: "fixture-transaction", evidenceRef: "fixture-evidence",
    observedAt: now, confirmationPolicyRef: registration.confirmationPolicyRef };
  return { registration, expected, confirmation };
}
async function evaluate(f = fixture(), verify: ConfirmationVerifier = async () => true) {
  const before = JSON.stringify(f);
  const answer = await evaluateProviderConfirmation({ ...f, evaluatedAt: now, maxAgeMs: 60_000, verify });
  assert.equal(JSON.stringify(f), before);
  assert.equal(answer.operationalEligibility, "blocked");
  assert.equal(answer.independentSourceVerification, "not_demonstrated");
  return answer;
}
for (const rail of ["pix", "credit_card", "bank_transfer", "crypto_transfer"] as const) {
  test(`confirmation contract fixture for ${rail} never promotes operational eligibility`, async () => {
    assert.equal((await evaluate(fixture(rail, rail === "crypto_transfer" ? crypto : fiat))).status, "confirmed");
  });
}
test("registration alone and simulated/sandbox modes cannot confirm real payment", async () => {
  const f = fixture();
  for (const state of ["registered", "validating", "suspended"] as const)
    assert.equal((await evaluate({ ...f, registration: { ...f.registration, state } })).status, "verification_unavailable");
  for (const environment of ["simulated", "sandbox"] as const) {
    assert.equal((await evaluate({ ...f, registration: { ...f.registration, environment } })).status, "verification_unavailable");
    assert.equal((await evaluate({ ...f, confirmation: { ...f.confirmation, environment } })).status, "verification_unavailable");
  }
});
test("authorization and initiation stay pending; reversal stays explicit", async () => {
  const f = fixture();
  for (const stage of ["initiated", "authorized"] as const)
    assert.equal((await evaluate({ ...f, confirmation: { ...f.confirmation, stage } })).status, "pending");
  assert.equal((await evaluate({ ...f, confirmation: { ...f.confirmation, stage: "reversed" } })).status, "reversed");
});
test("tenant, obligation, account, amount and provider must match the expected payment", async () => {
  const f = fixture();
  for (const patch of [{ tenantId: "other" }, { obligationId: "other" }, { receivingAccountRef: "other" },
    { amountAtomic: "999" }, { providerId: "other" }, { paymentId: "other" }]) {
    assert.equal((await evaluate({ ...f, confirmation: { ...f.confirmation,
      payment: { ...f.expected, ...patch } } })).reason, "confirmation_payment_mismatch");
  }
});
test("crypto asset, network and precision must match without conversion", async () => {
  const f = fixture("crypto_transfer", crypto);
  for (const asset of [{ ...crypto, kind: "crypto" as const, networkId: "other" },
    { ...crypto, kind: "crypto" as const, assetId: "other" }, { ...crypto, decimals: 6 }]) {
    assert.equal((await evaluate({ ...f, confirmation: { ...f.confirmation, payment: { ...f.expected, asset } } })).status, "verification_unavailable");
  }
});
test("registry rejects duplicates, unsupported Pix asset and incompatible rails", () => {
  const r = fixture().registration;
  assert.throws(() => validateProviderRegistry([r, r]), /duplicate_provider/);
  assert.throws(() => validateProviderRegistry([{ ...r, supports: [...r.supports, ...r.supports] }]), /duplicate_support/);
  assert.throws(() => validateProviderRegistry([fixture("pix", { kind: "fiat", currency: "USD", decimals: 2 }).registration]), /invalid_or_duplicate_support/);
  assert.throws(() => validateProviderRegistry([fixture("credit_card", crypto).registration]), /invalid_or_duplicate_support/);
});
test("unknown provider account or unsupported rail fails closed", async () => {
  const f = fixture();
  for (const expected of [{ ...f.expected, providerId: "unknown" }, { ...f.expected, receivingAccountRef: "other" },
    { ...f.expected, rail: "credit_card" as const }]) assert.equal((await evaluate({ ...f, expected })).status, "verification_unavailable");
});
test("unverified evidence and verifier failure cannot confirm payment", async () => {
  assert.equal((await evaluate(fixture(), async () => false)).reason, "confirmation_not_verified");
  assert.equal((await evaluate(fixture(), async () => { throw new Error("offline"); })).reason, "verification_failed");
});
test("stale/future evidence and policy drift fail closed", async () => {
  const f = fixture();
  for (const patch of [{ observedAt: "2026-09-30T10:58:00.000Z" }, { observedAt: "2026-09-30T11:00:01.000Z" },
    { confirmationPolicyRef: "other" }, { evidenceRef: "" }, { transactionId: "" }]) {
    assert.equal((await evaluate({ ...f, confirmation: { ...f.confirmation, ...patch } })).status, "verification_unavailable");
  }
});
test("atomic amounts reject floats, signs and ambiguous leading zeros", async () => {
  const f = fixture();
  for (const amountAtomic of ["0", "-1", "1.2", "0100", "1e3", "9".repeat(79)])
    assert.equal((await evaluate({ ...f, expected: { ...f.expected, amountAtomic } })).reason, "invalid_amount");
});
test("missing confirmation is unavailable", async () => {
  const f = fixture();
  const r = await evaluateProviderConfirmation({ ...f, confirmation: null, evaluatedAt: now, maxAgeMs: 60_000,
    verify: async () => true });
  assert.equal(r.status, "verification_unavailable");
});
