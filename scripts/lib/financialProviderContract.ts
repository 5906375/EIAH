export const PROVIDER_CONTRACT_VERSION = "financial-provider.v1" as const;
export type PaymentRail = "pix" | "credit_card" | "bank_transfer" | "crypto_transfer";
export type Asset = Readonly<
  { kind: "fiat"; currency: string; decimals: number } |
  { kind: "crypto"; networkId: string; assetId: string; decimals: number }
>;
export type ProviderRegistration = Readonly<{
  schemaVersion: typeof PROVIDER_CONTRACT_VERSION;
  id: string; environment: "simulated" | "sandbox" | "production";
  state: "registered" | "validating" | "enabled" | "suspended";
  credentialRef: string;
  receivingAccountRef: string;
  supports: readonly Readonly<{ rail: PaymentRail; asset: Asset }>[];
  confirmationPolicyRef: string;
  verificationMethodRef: string;
  capabilities: Readonly<{ query: boolean; webhook: boolean; reversal: boolean; reconciliation: boolean }>;
}>;
export type ExpectedPayment = Readonly<{
  tenantId: string; obligationId: string; paymentId: string; providerId: string;
  receivingAccountRef: string; rail: PaymentRail; asset: Asset;
  // Exact positive atomic units; no floating point or implicit crypto conversion.
  amountAtomic: string;
}>;
export type ProviderConfirmation = Readonly<{
  schemaVersion: "financial-confirmation.v1";
  payment: ExpectedPayment;
  environment: ProviderRegistration["environment"];
  stage: "initiated" | "authorized" | "confirmed" | "reversed";
  transactionId: string; evidenceRef: string; observedAt: string;
  confirmationPolicyRef: string;
}>;
export interface FinancialProviderReadAdapter {
  queryConfirmation(expected: ExpectedPayment): Promise<ProviderConfirmation | null>;
}
// Must verify registration enablement, account ownership, authentic evidence and
// the policy's settlement/finality criteria against the exact supplied inputs.
export type ConfirmationVerifier = (input: {
  registration: ProviderRegistration; expected: ExpectedPayment; confirmation: ProviderConfirmation;
}) => Promise<boolean>;

function check(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function assetKey(asset: Asset): string {
  check(asset && Number.isInteger(asset.decimals) && asset.decimals >= 0 && asset.decimals <= 36, "invalid_asset");
  if (asset.kind === "fiat") {
    check(/^[A-Z]{3}$/.test(asset.currency), "invalid_asset");
    return JSON.stringify([asset.kind, asset.currency, asset.decimals]);
  }
  check(asset.kind === "crypto" && text(asset.networkId) && text(asset.assetId), "invalid_asset");
  return JSON.stringify([asset.kind, asset.networkId, asset.assetId, asset.decimals]);
}
function railValid(rail: PaymentRail, asset: Asset): boolean {
  return asset.kind === "crypto" ? rail === "crypto_transfer" :
    ["pix", "credit_card", "bank_transfer"].includes(rail) && (rail !== "pix" || asset.currency === "BRL");
}
export function validateProviderRegistry(registrations: readonly ProviderRegistration[]): void {
  const ids = new Set<string>();
  for (const row of registrations) {
    check(row.schemaVersion === PROVIDER_CONTRACT_VERSION && text(row.id), "invalid_registration");
    check(!ids.has(row.id), "duplicate_provider"); ids.add(row.id);
    check(["simulated", "sandbox", "production"].includes(row.environment), "invalid_environment");
    check(["registered", "validating", "enabled", "suspended"].includes(row.state), "invalid_registration_state");
    check(text(row.credentialRef) && text(row.receivingAccountRef) && text(row.confirmationPolicyRef)
      && text(row.verificationMethodRef), "registration_reference_missing");
    check(row.capabilities && Object.values(row.capabilities).every(v => typeof v === "boolean")
      && [row.capabilities.query, row.capabilities.webhook, row.capabilities.reversal,
        row.capabilities.reconciliation].every(v => typeof v === "boolean"), "invalid_capabilities");
    check(Array.isArray(row.supports) && row.supports.length > 0, "unsupported_payment");
    const supports = new Set<string>();
    for (const support of row.supports) {
      const key = JSON.stringify([support.rail, assetKey(support.asset)]);
      check(railValid(support.rail, support.asset) && !supports.has(key), "invalid_or_duplicate_support");
      supports.add(key);
    }
  }
}
export async function evaluateProviderConfirmation(input: {
  registration: ProviderRegistration; expected: ExpectedPayment;
  confirmation: ProviderConfirmation | null;
  evaluatedAt: string; maxAgeMs: number; verify: ConfirmationVerifier;
}) {
  const output = (status: "confirmed" | "pending" | "reversed" | "verification_unavailable", reason: string) =>
    ({ status, reason, operationalEligibility: "blocked" as const, independentSourceVerification: "not_demonstrated" as const });
  try {
    const { registration: r, expected: e, confirmation: c } = input;
    validateProviderRegistry([r]);
    check(r.environment === "production" && r.state === "enabled", "provider_not_operational");
    check(c && c.schemaVersion === "financial-confirmation.v1", "confirmation_unavailable");
    check([e.tenantId, e.obligationId, e.paymentId, e.providerId, e.receivingAccountRef].every(text), "invalid_payment_identity");
    check(typeof e.amountAtomic === "string" && /^[1-9][0-9]{0,77}$/.test(e.amountAtomic), "invalid_amount");
    const asset = assetKey(e.asset);
    check(e.providerId === r.id && e.receivingAccountRef === r.receivingAccountRef, "provider_or_account_mismatch");
    check(r.supports.some(s => s.rail === e.rail && assetKey(s.asset) === asset), "unsupported_payment");
    const p = c.payment;
    check(p && ["tenantId", "obligationId", "paymentId", "providerId", "receivingAccountRef", "rail", "amountAtomic"]
      .every(key => p[key as keyof ExpectedPayment] === e[key as keyof ExpectedPayment])
      && assetKey(p.asset) === asset, "confirmation_payment_mismatch");
    check(c.environment === "production", "simulated_or_sandbox_confirmation");
    check(c.confirmationPolicyRef === r.confirmationPolicyRef && text(c.transactionId) && text(c.evidenceRef), "confirmation_evidence_missing");
    const observed = Date.parse(c.observedAt), now = Date.parse(input.evaluatedAt);
    check(Number.isFinite(observed) && Number.isFinite(now) && new Date(observed).toISOString() === c.observedAt
      && new Date(now).toISOString() === input.evaluatedAt && Number.isSafeInteger(input.maxAgeMs)
      && input.maxAgeMs >= 0 && observed <= now && now - observed <= input.maxAgeMs, "confirmation_not_current");
    check(["initiated", "authorized", "confirmed", "reversed"].includes(c.stage), "unknown_confirmation_stage");
    let verified = false;
    try { verified = await input.verify({ registration: r, expected: e, confirmation: c }); }
    catch { return output("verification_unavailable", "verification_failed"); }
    check(verified === true, "confirmation_not_verified");
    if (c.stage === "initiated" || c.stage === "authorized") return output("pending", "payment_not_confirmed");
    return c.stage === "reversed" ? output("reversed", "payment_reversed") : output("confirmed", "confirmation_contract_consistent");
  } catch (error) {
    return output("verification_unavailable", error instanceof Error ? error.message : "invalid_confirmation");
  }
}
