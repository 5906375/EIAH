import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInMemoryIdempotencyStore,
  createFixedWindowRateLimiter,
  executeRegisteredAction,
} from "../../actions";
import { registerBillingActions } from "../billing";
import { registerFinanceActions } from "../finance";
import { registerNotificationActions } from "../notifications";

const tenantId = "tenant-p2-global";
const workspaceId = "workspace-p2-global";
const runId = "run-p2-global";

function baseContext() {
  return {
    tenantId,
    workspaceId,
    runId,
    logger: () => undefined,
  };
}

function registerHighCoreActions() {
  const idempotencyStore = createInMemoryIdempotencyStore();
  const rateLimiter = createFixedWindowRateLimiter({ limit: 100, windowMs: 60_000 });
  registerBillingActions();
  registerFinanceActions({ idempotencyStore, rateLimiter });
  registerNotificationActions({ idempotencyStore, rateLimiter });
}

test("P2 global HIGH coverage: billing/finance/notifications actions execute successfully", async () => {
  registerHighCoreActions();

  const billingResult = await executeRegisteredAction("billing.create_white_label_plan", {
    ...baseContext(),
    input: {
      tenantId,
      workspaceId,
      userId: "user-p2-global",
      spec: {
        plan_id: "wl-plan-p2",
        name: "Plano White Label P2",
        amount: 1990,
        currency: "BRL",
        interval: "monthly",
        branding: {
          brand_name: "EIAH Corp",
          logo_url: "https://example.com/logo.png",
          primary_color: "#0EA5E9",
          email_from: "billing@example.com",
        },
        rules: ["charge_on_usage"],
        custom_texts: {
          welcome: "Bem-vindo",
        },
        metadata: {
          cash_position: 0,
        },
      },
    },
  });
  assert.equal(billingResult.status, "error");
  assert.equal((billingResult.output as { status?: string } | undefined)?.status, "need_more_info");

  const registerPayableResult = await executeRegisteredAction("finance.registerPayable", {
    ...baseContext(),
    input: {
      supplierName: "Fornecedor A",
      supplierTaxId: "12345678901",
      amount: 1200,
      currency: "BRL",
      dueDate: "2026-03-31",
      documentId: "doc-001",
    },
  });
  assert.equal(registerPayableResult.status, "success");

  const reconcileResult = await executeRegisteredAction("finance.reconcileBankTransactions", {
    ...baseContext(),
    input: {
      bankTransactions: [
        {
          id: "tx-1",
          postedAt: "2026-03-14",
          amount: 1200,
          currency: "BRL",
          counterpartyTaxId: "12345678901",
        },
      ],
      payables: [
        {
          payableId: "pay-1",
          amount: 1200,
          currency: "BRL",
          supplierTaxId: "12345678901",
        },
      ],
    },
  });
  assert.equal(reconcileResult.status, "success");

  const archiveResult = await executeRegisteredAction("finance.archivePaymentDocument", {
    ...baseContext(),
    input: {
      documentId: "doc-archive-1",
      fileName: "boleto.pdf",
      contentType: "application/pdf",
    },
  });
  assert.equal(archiveResult.status, "success");

  const pagerDutyResult = await executeRegisteredAction("notification.triggerPagerDuty", {
    ...baseContext(),
    input: {
      routingKey: "route-key-123456",
      summary: "Pagamento bloqueado por reconciliação",
      source: "finance-core",
      severity: "critical",
      dedupKey: "dedup-p2-global",
    },
  });
  assert.equal(pagerDutyResult.status, "success");
});
