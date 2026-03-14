import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p3-economy-hardening";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readFile(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return fs.readFileSync(file, "utf8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFile(relativePath)) as T;
}

function assertContains(content: string, needle: string, key: string) {
  if (!content.includes(needle)) fail("missing_required_pattern", { key, needle });
}

const billingRoute = readFile("apps/api/src/routes/billing.ts");
const paymentIntentsService = readFile("apps/api/src/services/paymentIntents.ts");
const settlementProvidersService = readFile("apps/api/src/services/settlementProviders.ts");
const invoiceService = readFile("packages/core/src/services/tenantInvoiceService.ts");

const settlementE2E = readJson<{
  ok?: boolean;
  providers?: Array<{ id?: string; mode?: string }>;
  assertions?: {
    webhookReplay?: {
      replayRejected?: boolean;
      duplicateSideEffects?: number;
    };
  };
}>("ops/evidence/latest/settlement-provider-e2e-2026-03-09.json");

const webhookReplay = readJson<{
  ok?: boolean;
  replayRejected?: boolean;
  duplicateSideEffects?: number;
}>("ops/evidence/latest/billing-webhook-replay-2026-03-09.json");

const disputes = readJson<{
  ok?: boolean;
  lifecycle?: string[];
  assertions?: {
    validTransitions?: boolean;
    disputeClosedTriggersReputation?: boolean;
  };
}>("ops/evidence/latest/dispute-lifecycle-e2e-2026-03-09.json");

const reputation = readJson<{
  ok?: boolean;
  events?: string[];
  idempotency?: { replaySafe?: boolean };
}>("ops/evidence/latest/reputation-update-flow-2026-03-09.json");

const commissionFlow = readJson<{
  ok?: boolean;
  flow?: string[];
  assertions?: { duplicateSideEffects?: number };
}>("ops/evidence/latest/realestate-commission-settlement-e2e-2026-03-09.json");

assertContains(billingRoute, 'get("/billing/tenant/invoices"', "route.invoices_list");
assertContains(billingRoute, 'post("/billing/tenant/invoices/generate"', "route.invoices_generate");
assertContains(billingRoute, 'post("/webhooks/billing/:provider?"', "route.billing_webhook");
assertContains(billingRoute, 'get("/payments/providers"', "route.providers_list");
assertContains(billingRoute, 'post("/payments/providers/:provider/settle"', "route.providers_settle");
assertContains(billingRoute, 'post("/billing/disputes"', "route.disputes_create");
assertContains(billingRoute, 'post("/billing/disputes/:id/transition"', "route.disputes_transition");
assertContains(billingRoute, 'get("/billing/reputation"', "route.reputation_list");

assertContains(paymentIntentsService, '"settlement_receipt"', "service.settlement_receipt");
assertContains(paymentIntentsService, 'requestId: `settlement:${updated.id}:', "service.settlement_request_id");
assertContains(paymentIntentsService, '"run_id" TEXT NOT NULL', "service.payment_intent_run_link");
assertContains(invoiceService, "invoice.generated", "service.invoice_generated_event");
assertContains(invoiceService, "tenantInvoice.upsert", "service.invoice_upsert");

if (settlementE2E.ok !== true) fail("settlement_e2e_not_ok");
const providers = (settlementE2E.providers ?? []).map((item) => ({
  id: String(item.id ?? ""),
  mode: String(item.mode ?? "").toLowerCase(),
}));
const providerIds = new Set(providers.map((item) => item.id));
for (const provider of ["stripe", "crypto", "bank"]) {
  if (!providerIds.has(provider)) {
    fail("missing_settlement_provider_in_evidence", { provider });
  }
}
const invalidModes = providers.filter((item) => !["full", "simulated"].includes(item.mode));
if (invalidModes.length > 0) {
  fail("unsupported_settlement_provider_mode", { invalidModes });
}
const hasStubInEvidence = providers.some((item) => item.mode === "stub");
if (hasStubInEvidence) {
  fail("settlement_provider_stub_mode_not_allowed");
}
if (settlementProvidersService.includes('"stub"')) {
  fail("settlement_provider_stub_mode_found_in_runtime");
}

if (settlementE2E.assertions?.webhookReplay?.replayRejected !== true) {
  fail("settlement_webhook_replay_not_rejected");
}
if (Number(settlementE2E.assertions?.webhookReplay?.duplicateSideEffects ?? 1) !== 0) {
  fail("settlement_duplicate_side_effects_not_zero");
}

if (webhookReplay.ok !== true) fail("billing_webhook_replay_not_ok");
if (webhookReplay.replayRejected !== true) fail("billing_webhook_replay_rejected_missing");
if (Number(webhookReplay.duplicateSideEffects ?? 1) !== 0) {
  fail("billing_webhook_duplicate_side_effects_not_zero");
}

if (disputes.ok !== true) fail("dispute_lifecycle_not_ok");
const lifecycle = new Set((disputes.lifecycle ?? []).map((item) => item.toLowerCase()));
for (const step of ["open", "under_review", "resolved"]) {
  if (!lifecycle.has(step)) fail("missing_dispute_lifecycle_step", { step });
}
if (disputes.assertions?.validTransitions !== true) fail("dispute_valid_transitions_missing");
if (disputes.assertions?.disputeClosedTriggersReputation !== true) {
  fail("dispute_reputation_link_missing");
}

if (reputation.ok !== true) fail("reputation_flow_not_ok");
const events = new Set((reputation.events ?? []).map((item) => item.toLowerCase()));
for (const event of ["receipt.finalized", "dispute.closed"]) {
  if (!events.has(event)) fail("missing_reputation_event", { event });
}
if (reputation.idempotency?.replaySafe !== true) fail("reputation_replay_safety_missing");

if (commissionFlow.ok !== true) fail("commission_flow_not_ok");
const flowText = (commissionFlow.flow ?? []).join(" | ").toLowerCase();
for (const token of ["provider settlement", "receipt.finalized", "ledger reconciliation"]) {
  if (!flowText.includes(token)) fail("missing_receipt_ledger_provider_link", { token });
}
if (Number(commissionFlow.assertions?.duplicateSideEffects ?? 1) !== 0) {
  fail("commission_duplicate_side_effects_not_zero");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      summary: {
        invoice: true,
        settlement: true,
        webhookBilling: true,
        disputesAndReputation: true,
        receiptLedgerProviderLink: true,
      },
    },
    null,
    2
  )
);
