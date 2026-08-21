import fs from "node:fs";
import path from "node:path";
import {
  STRUCTURAL_GATE_BOUNDARY_SHA,
  STRUCTURAL_GATE_BOUNDARY_NOTE,
} from "./apeStructuralGateBoundary";

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

function assertContains(content: string, needle: string, key: string) {
  if (!content.includes(needle)) fail("missing_required_pattern", { key, needle });
}

const billingRoute = readFile("apps/api/src/routes/billing.ts");
const paymentIntentsService = readFile("apps/api/src/services/paymentIntents.ts");
const settlementProvidersService = readFile("apps/api/src/services/settlementProviders.ts");
const invoiceService = readFile("packages/core/src/services/tenantInvoiceService.ts");

type Invariant = { id: string; description: string };
const invariants: Invariant[] = [];
function checkInvariant(id: string, description: string, run: () => void) {
  run();
  invariants.push({ id, description });
}

checkInvariant("route.invoices_list", "GET /billing/tenant/invoices route exists", () =>
  assertContains(billingRoute, 'get("/billing/tenant/invoices"', "route.invoices_list")
);
checkInvariant(
  "route.invoices_generate",
  "POST /billing/tenant/invoices/generate route exists",
  () => assertContains(billingRoute, 'post("/billing/tenant/invoices/generate"', "route.invoices_generate")
);
checkInvariant("route.billing_webhook", "POST /webhooks/billing/:provider? route exists", () =>
  assertContains(billingRoute, 'post("/webhooks/billing/:provider?"', "route.billing_webhook")
);
checkInvariant("route.providers_list", "GET /payments/providers route exists", () =>
  assertContains(billingRoute, 'get("/payments/providers"', "route.providers_list")
);
checkInvariant(
  "route.providers_settle",
  "POST /payments/providers/:provider/settle route exists",
  () => assertContains(billingRoute, 'post("/payments/providers/:provider/settle"', "route.providers_settle")
);
checkInvariant("route.disputes_create", "POST /billing/disputes route exists", () =>
  assertContains(billingRoute, 'post("/billing/disputes"', "route.disputes_create")
);
checkInvariant(
  "route.disputes_transition",
  "POST /billing/disputes/:id/transition route exists",
  () => assertContains(billingRoute, 'post("/billing/disputes/:id/transition"', "route.disputes_transition")
);
checkInvariant("route.reputation_list", "GET /billing/reputation route exists", () =>
  assertContains(billingRoute, 'get("/billing/reputation"', "route.reputation_list")
);

checkInvariant(
  "service.settlement_receipt",
  "paymentIntents service emits a settlement_receipt",
  () => assertContains(paymentIntentsService, '"settlement_receipt"', "service.settlement_receipt")
);
checkInvariant(
  "service.settlement_request_id",
  "paymentIntents service builds a settlement idempotency request id",
  () =>
    assertContains(
      paymentIntentsService,
      "requestId: `settlement:${updated.id}:",
      "service.settlement_request_id"
    )
);
checkInvariant(
  "service.payment_intent_run_link",
  "paymentIntents schema links a run_id",
  () => assertContains(paymentIntentsService, '"run_id" TEXT NOT NULL', "service.payment_intent_run_link")
);
checkInvariant(
  "service.invoice_generated_event",
  "tenantInvoiceService emits invoice.generated",
  () => assertContains(invoiceService, "invoice.generated", "service.invoice_generated_event")
);
checkInvariant(
  "service.invoice_upsert",
  "tenantInvoiceService persists via tenantInvoice.upsert",
  () => assertContains(invoiceService, "tenantInvoice.upsert", "service.invoice_upsert")
);
checkInvariant(
  "service.no_stub_settlement_provider",
  "settlementProviders service does not expose a stub mode at runtime",
  () => {
    if (settlementProvidersService.includes('"stub"')) {
      fail("settlement_provider_stub_mode_found_in_runtime");
    }
  }
);

if (invariants.length === 0) {
  fail("invariant_set_empty");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      invariants: invariants.map((item) => item.id),
      invariantCount: invariants.length,
      structuralGateBoundary: {
        sha: STRUCTURAL_GATE_BOUNDARY_SHA,
        note: STRUCTURAL_GATE_BOUNDARY_NOTE,
      },
      note:
        "Este check valida somente estrutura de código (rotas/serviços) e depende de " +
        "uma suíte de testes reais executada antes dele no mesmo job " +
        "(billing/economy/webhook/disputes/reputation/commission-settlement). " +
        "Não lê mais nenhum artefato de evidência declarativa gerado sinteticamente.",
    },
    null,
    2
  )
);
