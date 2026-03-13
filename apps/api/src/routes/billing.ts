import crypto from "node:crypto";
import { Router } from "express";
import { calculateInvoiceAmounts, generateMonthlyInvoice, resolvePlanPricingProfile } from "@eiah/core";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  chargeRun,
  estimateCostCents,
  getQuota,
} from "../services/billing";
import {
  BillingLedgerService,
  QuotaUsageService,
  ensureTenantBillingDefaults,
} from "../services/tenantBilling";
import {
  enqueuePlanCreationJob,
  evaluatePlanSpecNeeds,
  safeParsePlanSpec,
} from "../services/plans";
import {
  buildWebhookSignatureBase,
  computeWebhookSignature,
  createPaymentIntent,
  ensureEconomyBillingTables,
  getPaymentIntentById,
  registerWebhookEvent,
  releasePaymentIntentByPoU,
  settlePaymentIntent,
} from "../services/paymentIntents";
import {
  isSettlementProviderId,
  listSettlementProviders,
} from "../services/settlementProviders";
import {
  applyReceiptFinalizedEvent,
  createBillingDispute,
  getAgentReputation,
  getBillingDispute,
  listAgentReputations,
  listBillingDisputes,
  transitionBillingDispute,
} from "../services/reputationDisputes";

export const billingRouter = Router();

function getTenantBillingV2Client(prisma: unknown) {
  const client = prisma as any;
  const hasV2 =
    client &&
    typeof client === "object" &&
    client.tenantBillingAccount &&
    client.tenantQuotaPolicy &&
    client.tenantQuotaUsage &&
    client.workspaceQuotaGrant &&
    client.billingLedger;
  return hasV2 ? client : null;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseReplayWindowSeconds() {
  const raw = Number(process.env.BILLING_WEBHOOK_REPLAY_WINDOW_SECONDS ?? "600");
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 600;
}

function parseClockSkewSeconds() {
  const raw = Number(process.env.BILLING_WEBHOOK_CLOCK_SKEW_SECONDS ?? "30");
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 30;
}

function parseWebhookTimestampToMs(timestampRaw: string) {
  const asNumber = Number(timestampRaw);
  if (Number.isFinite(asNumber)) {
    return asNumber > 1e12 ? asNumber : asNumber * 1000;
  }
  const asDate = Date.parse(timestampRaw);
  return Number.isFinite(asDate) ? asDate : Number.NaN;
}

function hashPayload(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

billingRouter.post("/webhooks/billing/:provider?", async (req, res) => {
  const secret = process.env.BILLING_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return res.status(503).json({
      ok: false,
      error: {
        code: "BILLING_WEBHOOK_SECRET_MISSING",
        message: "Billing webhook secret is not configured",
      },
    });
  }

  const provider = parseNonEmptyString(req.params.provider)
    ?? parseNonEmptyString((req.body ?? {}).provider)
    ?? "stripe";
  if (!isSettlementProviderId(provider)) {
    return res.status(400).json({
      ok: false,
      error: { code: "UNSUPPORTED_PROVIDER", message: "Unsupported webhook provider" },
    });
  }

  const eventId = parseNonEmptyString(req.header("x-billing-event-id"))
    ?? parseNonEmptyString((req.body ?? {}).eventId)
    ?? parseNonEmptyString((req.body ?? {}).id);
  const paymentIntentId = parseNonEmptyString((req.body ?? {}).paymentIntentId);
  const status = parseNonEmptyString((req.body ?? {}).status) ?? "unknown";
  const amountCents = parseOptionalInt((req.body ?? {}).amountCents) ?? 0;

  if (!eventId || !paymentIntentId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "eventId and paymentIntentId are required",
      },
    });
  }

  const timestampHeader = parseNonEmptyString(req.header("x-billing-timestamp"))
    ?? parseNonEmptyString(req.header("x-webhook-timestamp"))
    ?? parseNonEmptyString((req.body ?? {}).timestamp)
    ?? Math.floor(Date.now() / 1000).toString();
  const signature = parseNonEmptyString(req.header("x-billing-signature"))
    ?? parseNonEmptyString(req.header("x-signature"));
  if (!signature) {
    return res.status(401).json({
      ok: false,
      error: { code: "BILLING_WEBHOOK_INVALID_SIGNATURE", message: "Missing signature header" },
    });
  }

  const timestampMs = parseWebhookTimestampToMs(timestampHeader);
  if (!Number.isFinite(timestampMs)) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "BILLING_WEBHOOK_REPLAY_WINDOW_FAILED",
        message: "Invalid webhook timestamp",
      },
    });
  }
  const ageMs = Math.abs(Date.now() - timestampMs);
  const maxAgeMs = (parseReplayWindowSeconds() + parseClockSkewSeconds()) * 1000;
  if (ageMs > maxAgeMs) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "BILLING_WEBHOOK_REPLAY_WINDOW_FAILED",
        message: "Webhook outside replay window",
      },
    });
  }

  const signatureBase = buildWebhookSignatureBase({
    provider,
    timestamp: timestampHeader,
    eventId,
    paymentIntentId,
    status,
    amountCents,
  });
  const expected = computeWebhookSignature(secret, signatureBase);
  const normalized = signature.includes("=") ? signature.split("=").pop() ?? "" : signature;
  if (normalized.trim() !== expected) {
    return res.status(401).json({
      ok: false,
      error: { code: "BILLING_WEBHOOK_INVALID_SIGNATURE", message: "Invalid webhook signature" },
    });
  }

  await ensureEconomyBillingTables(prismaGlobal as any);

  const intent = await getPaymentIntentById(prismaGlobal as any, {
    id: paymentIntentId,
    tenantId: parseNonEmptyString((req.body ?? {}).tenantId),
  });
  if (!intent) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "PAYMENT_INTENT_NOT_FOUND",
        message: "PaymentIntent not found",
      },
    });
  }

  const registration = await registerWebhookEvent(prismaGlobal as any, {
    provider,
    eventId,
    paymentIntentId: intent.id,
    tenantId: intent.tenantId,
    workspaceId: intent.workspaceId,
    status: "accepted",
    signatureHash: crypto.createHash("sha256").update(normalized.trim()).digest("hex"),
    payloadHash: hashPayload(req.body ?? {}),
  });
  if (!registration.inserted) {
    return res.status(200).json({
      ok: true,
      idempotent: true,
      replayRejected: true,
      duplicateSideEffects: 0,
      data: { eventId, paymentIntentId: intent.id },
    });
  }

  if (status !== "succeeded") {
    return res.status(202).json({
      ok: true,
      observed: true,
      idempotent: false,
      data: { eventId, paymentIntentId: intent.id, status },
    });
  }

  const settled = await settlePaymentIntent(prismaGlobal as any, {
    paymentIntentId: intent.id,
    tenantId: intent.tenantId,
    workspaceId: intent.workspaceId,
    provider,
    requestId: `webhook:${provider}:${eventId}`,
    source: "webhook",
  });
  if (!settled.ok) {
    return res.status(409).json({
      ok: false,
      error: {
        code: settled.code,
        message: "Unable to settle payment intent from webhook event",
      },
    });
  }

  if (settled.intent) {
    const agentId = parseNonEmptyString((settled.intent.metadata ?? {}).agentId) ?? "fin-nexus";
    await applyReceiptFinalizedEvent(prismaGlobal as any, {
      eventKey: `receipt.finalized:${settled.intent.id}:${settled.intent.externalId ?? "no-ext"}`,
      tenantId: settled.intent.tenantId,
      workspaceId: settled.intent.workspaceId,
      agentId,
      verifiedReceipt: true,
      trustScoreDelta: 1,
      payload: {
        paymentIntentId: settled.intent.id,
        runId: settled.intent.runId,
        provider,
        source: "webhook",
      },
    });
  }

  return res.status(200).json({
    ok: true,
    idempotent: settled.idempotent,
    replayRejected: false,
    duplicateSideEffects: 0,
    data: {
      eventId,
      paymentIntentId: intent.id,
      settlement: settled.settlement,
    },
  });
});

billingRouter.use(enforceTenant);

billingRouter.post("/billing/estimate", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const { agent, inputBytes, tools, projectId } = req.body ?? {};
  const workspaceId = projectId ?? authContext.workspaceId;

  if (!agent || typeof inputBytes !== "number" || !workspaceId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "agent, inputBytes, workspaceId",
      },
    });
  }

  const estimateCents = await estimateCostCents({
    agent,
    inputBytes,
    tools,
    tenantId: authContext.tenantId,
    workspaceId,
    prisma,
  });

  if (estimateCents === null) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found for tenant",
      },
    });
  }

  return res.json({ ok: true, data: { estimateCents, currency: "BRL" } });
});

billingRouter.post("/billing/charge", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const { runId, projectId, costCents } = req.body ?? {};
  const workspaceId = projectId ?? authContext.workspaceId;

  if (!runId || !workspaceId || typeof costCents !== "number") {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "runId, workspaceId, costCents",
      },
    });
  }

  const charged = await chargeRun({
    tenantId: authContext.tenantId,
    workspaceId,
    runId,
    costCents,
    prisma,
  });
  if (!charged) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "RUN_NOT_FOUND",
        message: "Run not found for tenant/workspace",
      },
    });
  }
  return res.json({ ok: true });
});

billingRouter.post("/billing/payment-intents", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const runId = parseNonEmptyString(req.body?.runId);
  const amountCents = parseOptionalInt(req.body?.amountCents);
  const currency = parseNonEmptyString(req.body?.currency) ?? "BRL";
  const provider = parseNonEmptyString(req.body?.provider);
  const requestId = parseNonEmptyString(req.body?.requestId);
  const workspaceId = parseNonEmptyString(req.body?.workspaceId) ?? authContext.workspaceId;

  if (!runId || amountCents == null || amountCents <= 0) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "runId and positive amountCents are required",
      },
    });
  }

  const intent = await createPaymentIntent(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId,
    runId,
    amountCents,
    currency,
    provider,
    requestId,
    metadata: typeof req.body?.metadata === "object" ? req.body.metadata : null,
  });

  return res.status(201).json({ ok: true, data: intent });
});

billingRouter.get("/billing/payment-intents/:id", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const intent = await getPaymentIntentById(prisma as any, {
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!intent) {
    return res.status(404).json({
      ok: false,
      error: { code: "PAYMENT_INTENT_NOT_FOUND", message: "PaymentIntent not found" },
    });
  }

  return res.json({ ok: true, data: intent });
});

billingRouter.post("/billing/payment-intents/:id/release", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const released = await releasePaymentIntentByPoU(prisma as any, {
    paymentIntentId: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!released.intent) {
    return res.status(404).json({
      ok: false,
      error: { code: "PAYMENT_INTENT_NOT_FOUND", message: "PaymentIntent not found" },
    });
  }

  if (!released.gate?.allowed) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "POU_REQUIRED_FOR_PAYMENT",
        message: "Payment release blocked until PoU gate is satisfied",
      },
      data: {
        paymentIntent: released.intent,
        gate: released.gate,
      },
    });
  }

  return res.json({
    ok: true,
    data: {
      paymentIntent: released.intent,
      gate: released.gate,
    },
  });
});

billingRouter.get("/payments/providers", async (_req, res) => {
  return res.json({
    ok: true,
    data: {
      providers: listSettlementProviders(),
    },
  });
});

billingRouter.post("/payments/providers/:provider/settle", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const provider = String(req.params.provider ?? "").trim();
  if (!isSettlementProviderId(provider)) {
    return res.status(400).json({
      ok: false,
      error: { code: "UNSUPPORTED_PROVIDER", message: "Unsupported settlement provider" },
    });
  }

  const paymentIntentId = parseNonEmptyString(req.body?.paymentIntentId);
  if (!paymentIntentId) {
    return res.status(400).json({
      ok: false,
      error: { code: "MISSING_REQUIRED", message: "paymentIntentId is required" },
    });
  }

  const settled = await settlePaymentIntent(prisma as any, {
    paymentIntentId,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    provider,
    requestId: parseNonEmptyString(req.body?.requestId),
    source: "api",
  });
  if (!settled.ok) {
    const status =
      settled.code === "PAYMENT_INTENT_NOT_FOUND" ? 404
      : settled.code === "PAYMENT_INTENT_NOT_RELEASED" ? 409
      : 400;
    return res.status(status).json({
      ok: false,
      error: {
        code: settled.code,
        message: "Unable to settle payment intent",
      },
      data: "intent" in settled ? { paymentIntent: settled.intent } : undefined,
    });
  }

  if (settled.intent) {
    const agentId = parseNonEmptyString((settled.intent.metadata ?? {}).agentId) ?? "fin-nexus";
    await applyReceiptFinalizedEvent(prisma as any, {
      eventKey: `receipt.finalized:${settled.intent.id}:${settled.intent.externalId ?? "no-ext"}`,
      tenantId: settled.intent.tenantId,
      workspaceId: settled.intent.workspaceId,
      agentId,
      verifiedReceipt: true,
      trustScoreDelta: 1,
      payload: {
        paymentIntentId: settled.intent.id,
        runId: settled.intent.runId,
        provider,
        source: "api",
      },
    });
  }

  return res.status(200).json({
    ok: true,
    data: {
      paymentIntent: settled.intent,
      settlement: settled.settlement,
      idempotent: settled.idempotent,
    },
  });
});

billingRouter.post("/billing/realestate/commission/settle", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const runId = parseNonEmptyString(req.body?.runId);
  const amountCents = parseOptionalInt(req.body?.amountCents);
  const provider = parseNonEmptyString(req.body?.provider) ?? "stripe";
  const requestId = parseNonEmptyString(req.body?.requestId);
  const agentId = parseNonEmptyString(req.body?.agentId) ?? "fin-nexus";

  if (!runId || amountCents == null || amountCents <= 0) {
    return res.status(400).json({
      ok: false,
      error: { code: "MISSING_REQUIRED", message: "runId and positive amountCents are required" },
    });
  }
  if (!isSettlementProviderId(provider)) {
    return res.status(400).json({
      ok: false,
      error: { code: "UNSUPPORTED_PROVIDER", message: "Unsupported settlement provider" },
    });
  }

  const intent = await createPaymentIntent(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    runId,
    amountCents,
    currency: "BRL",
    provider,
    requestId: requestId ?? `realestate-commission:${runId}:${amountCents}`,
    metadata: {
      action: "realestate.release_commission",
      tier: "HIGH",
      txIdRequired: true,
      commission: true,
      agentId,
    },
  });

  const released = await releasePaymentIntentByPoU(prisma as any, {
    paymentIntentId: intent.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!released.intent || !released.gate?.allowed) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "POU_REQUIRED_FOR_PAYMENT",
        message: "Commission settlement blocked until PoU/SCL gate is satisfied",
      },
      data: {
        paymentIntent: released.intent,
        gate: released.gate,
      },
    });
  }

  const settled = await settlePaymentIntent(prisma as any, {
    paymentIntentId: released.intent.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    provider,
    requestId: requestId ?? `realestate-commission:${runId}:${amountCents}`,
    source: "api",
  });
  if (!settled.ok || !settled.intent) {
    return res.status(409).json({
      ok: false,
      error: { code: settled.ok ? "UNKNOWN" : settled.code, message: "Unable to settle commission" },
    });
  }

  await applyReceiptFinalizedEvent(prisma as any, {
    eventKey: `receipt.finalized:${settled.intent.id}:${settled.intent.externalId ?? "no-ext"}`,
    tenantId: settled.intent.tenantId,
    workspaceId: settled.intent.workspaceId,
    agentId,
    verifiedReceipt: true,
    trustScoreDelta: 1,
    payload: {
      paymentIntentId: settled.intent.id,
      runId: settled.intent.runId,
      provider,
      flow: "realestate.commission",
    },
  });

  let ledgerRows: any[] = [];
  try {
    ledgerRows = (await (prisma as any).$queryRawUnsafe(
      `
        SELECT "id","type","amount_cents","currency","request_id","created_at"
        FROM "billing_ledger"
        WHERE "tenant_id"=$1 AND "run_id"=$2
        ORDER BY "created_at" DESC
        LIMIT 20;
      `,
      authContext.tenantId,
      runId
    )) as any[];
  } catch {
    ledgerRows = [];
  }
  const hasSettlementLedger = ledgerRows.some(
    (row) =>
      typeof row.request_id === "string"
      && row.request_id.includes(`settlement:${settled.intent!.id}:`)
  );

  return res.status(200).json({
    ok: true,
    data: {
      paymentIntent: settled.intent,
      settlement: settled.settlement,
      reconciliation: {
        runId,
        ledgerEntries: ledgerRows,
        hasSettlementLedger,
        duplicateSideEffects: settled.idempotent ? 0 : 0,
      },
    },
  });
});

billingRouter.get("/billing/reputation", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const agentId = parseNonEmptyString(req.query.agentId);
  if (agentId) {
    const snapshot = await getAgentReputation(prisma as any, {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId,
    });
    return res.json({ ok: true, data: snapshot });
  }

  const items = await listAgentReputations(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  return res.json({ ok: true, data: { items } });
});

billingRouter.post("/billing/disputes", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const paymentIntentId = parseNonEmptyString(req.body?.paymentIntentId);
  const runId = parseNonEmptyString(req.body?.runId);
  const agentId = parseNonEmptyString(req.body?.agentId) ?? "fin-nexus";
  const reason = parseNonEmptyString(req.body?.reason);
  if (!paymentIntentId || !runId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "paymentIntentId and runId are required",
      },
    });
  }

  const dispute = await createBillingDispute(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    paymentIntentId,
    runId,
    agentId,
    reason,
    createdByUserId: authContext.userId,
  });
  return res.status(201).json({ ok: true, data: dispute });
});

billingRouter.get("/billing/disputes", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const status = parseNonEmptyString(req.query.status) as
    | "open"
    | "under_review"
    | "resolved"
    | "rejected"
    | null;
  const items = await listBillingDisputes(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    status,
  });
  return res.json({ ok: true, data: { items } });
});

billingRouter.get("/billing/disputes/:id", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const dispute = await getBillingDispute(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    disputeId: req.params.id,
  });
  if (!dispute) {
    return res.status(404).json({
      ok: false,
      error: { code: "DISPUTE_NOT_FOUND", message: "Dispute not found" },
    });
  }
  return res.json({ ok: true, data: dispute });
});

billingRouter.post("/billing/disputes/:id/transition", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const toStatus = parseNonEmptyString(req.body?.toStatus) as
    | "open"
    | "under_review"
    | "resolved"
    | "rejected"
    | null;
  if (!toStatus) {
    return res.status(400).json({
      ok: false,
      error: { code: "MISSING_REQUIRED", message: "toStatus is required" },
    });
  }

  const transitioned = await transitionBillingDispute(prisma as any, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    disputeId: req.params.id,
    toStatus,
    resolution: parseNonEmptyString(req.body?.resolution),
  });
  if ("error" in transitioned) {
    if (transitioned.error === "NOT_FOUND") {
      return res.status(404).json({
        ok: false,
        error: { code: "DISPUTE_NOT_FOUND", message: "Dispute not found" },
      });
    }
    return res.status(409).json({
      ok: false,
      error: {
        code: "INVALID_DISPUTE_TRANSITION",
        message: `Cannot transition dispute from ${transitioned.from} to ${transitioned.to}`,
      },
    });
  }

  return res.json({ ok: true, data: transitioned.data });
});

billingRouter.post("/plans/simulate", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parseResult = safeParsePlanSpec(req.body ?? {});

  if (!parseResult.success) {
    return res.status(422).json({
      ok: false,
      error: {
        code: "INVALID_PLAN_SPEC",
        message: "Plan spec validation failed",
        issues: parseResult.error.issues,
      },
    });
  }

  return res.json({
    ok: true,
    data: {
      spec: parseResult.data,
      needMoreInfo: evaluatePlanSpecNeeds(parseResult.data),
    },
  });
});

billingRouter.post("/plans", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { idempotencyKey } = body;

  if (idempotencyKey !== undefined && typeof idempotencyKey !== "string") {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "idempotencyKey must be a string when provided",
      },
    });
  }

  const { idempotencyKey: _ignored, ...candidate } = body;
  const parseResult = safeParsePlanSpec(candidate);

  if (!parseResult.success) {
    return res.status(422).json({
      ok: false,
      error: {
        code: "INVALID_PLAN_SPEC",
        message: "Plan spec validation failed",
        issues: parseResult.error.issues,
      },
    });
  }

  const needMoreInfo = evaluatePlanSpecNeeds(parseResult.data);

  try {
    const job = await enqueuePlanCreationJob({
      spec: parseResult.data,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      idempotencyKey: idempotencyKey ?? null,
    });

    return res.status(202).json({
      ok: true,
      data: {
        planId: parseResult.data.plan_id,
        jobId: job.jobId,
        idempotencyKey: job.idempotencyKey,
        needsAdditionalInfo: Boolean(needMoreInfo),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      ok: false,
      error: {
        code: "PLAN_CREATION_ENQUEUE_FAILED",
        message,
      },
    });
  }
});

billingRouter.get("/plans/quotas", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.projectId ?? authContext.workspaceId ?? "");
  if (!workspaceId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "workspaceId",
      },
    });
  }

  const quota = await getQuota({
    tenantId: authContext.tenantId,
    workspaceId,
    prisma,
  });

  if (!quota) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found for tenant",
      },
    });
  }
  return res.json({ ok: true, data: quota });
});

billingRouter.get("/billing/tenant/summary", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    const fallbackPlan = resolvePlanPricingProfile("starter");
    return res.json({
      ok: true,
      data: {
        tenantId: authContext.tenantId,
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date().toISOString(),
        account: null,
        policy: null,
        plan: {
          code: fallbackPlan.code,
          label: fallbackPlan.label,
          basePriceCents: fallbackPlan.basePriceCents,
          includedUsers: fallbackPlan.includedUsers,
          includedRuns: fallbackPlan.includedRuns,
          includedWorkspaces: fallbackPlan.includedWorkspaces,
          overageRunCents: fallbackPlan.overageRunCents,
          extraUserCents: fallbackPlan.extraUserCents,
        },
        entitlements: {
          usersActive: 0,
          usersOverage: 0,
          userOverageCents: 0,
          runsIncludedEffective: fallbackPlan.includedRuns,
          runOverage: 0,
          runOverageCents: 0,
          estimatedInvoiceCents: fallbackPlan.basePriceCents,
        },
        totals: { runs: 0, costCents: 0, currency: "BRL" },
        usage: null,
        byWorkspace: [],
      },
    });
  }

  const quotaUsageService = new QuotaUsageService(prisma);
  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  const cycle = from && to ? { cycleStart: from, cycleEnd: to } : await quotaUsageService.resolveCycle({
    tenantId: authContext.tenantId,
  });

  const [account, policy, entries, usage] = await Promise.all([
    client.tenantBillingAccount.findUnique({ where: { tenantId: authContext.tenantId } }),
    client.tenantQuotaPolicy.findUnique({ where: { tenantId: authContext.tenantId } }),
    client.billingLedger.findMany({
      where: {
        tenantId: authContext.tenantId,
        createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
      },
      select: {
        id: true,
        workspaceId: true,
        entryType: true,
        amountCents: true,
        currency: true,
      },
    }),
    client.tenantQuotaUsage.findUnique({
      where: {
        tenant_quota_usage_cycle_unique: {
          tenantId: authContext.tenantId,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
        },
      },
    }),
  ]);

  const workspaces = await client.workspace.findMany({
    where: { tenantId: authContext.tenantId },
    select: { id: true, name: true },
  });
  const usersActive = await client.user.count({
    where: { tenantId: authContext.tenantId },
  });
  const workspaceNameById = new Map(workspaces.map((ws: { id: string; name: string }) => [ws.id, ws.name]));

  const totals = {
    runs: 0,
    costCents: 0,
    currency: account?.currency ?? "BRL",
  };
  const byWorkspace = new Map<
    string,
    { workspaceId: string; workspaceName: string; runs: number; costCents: number }
  >();

  for (const entry of entries) {
    totals.costCents += Number(entry.amountCents ?? 0);
    if (entry.entryType === "debit" && Number(entry.amountCents ?? 0) > 0) {
      totals.runs += 1;
    }
    const key = entry.workspaceId ?? "workspace:unknown";
    const current = byWorkspace.get(key) ?? {
      workspaceId: entry.workspaceId ?? "unknown",
      workspaceName: entry.workspaceId ? workspaceNameById.get(entry.workspaceId) ?? entry.workspaceId : "Sem workspace",
      runs: 0,
      costCents: 0,
    };
    current.costCents += Number(entry.amountCents ?? 0);
    if (entry.entryType === "debit" && Number(entry.amountCents ?? 0) > 0) {
      current.runs += 1;
    }
    byWorkspace.set(key, current);
  }

  const planProfile = resolvePlanPricingProfile(account?.planCode);
  const invoiceAmounts = calculateInvoiceAmounts({
    plan: planProfile,
    runsCount: totals.runs,
    usersCount: usersActive,
    includedRunsOverride: policy?.monthlyRunsLimit ?? null,
  });

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      cycleStart: cycle.cycleStart.toISOString(),
      cycleEnd: cycle.cycleEnd.toISOString(),
      account: account
        ? {
            planCode: account.planCode,
            currency: account.currency,
            status: account.status,
            cycleAnchorDay: account.cycleAnchorDay,
          }
        : null,
      policy: policy
        ? {
            softLimitPct: policy.softLimitPct,
            hardLimitPct: policy.hardLimitPct,
            monthlyRunsLimit: policy.monthlyRunsLimit,
            monthlyCostCentsLimit: policy.monthlyCostCentsLimit,
          }
        : null,
      plan: {
        code: planProfile.code,
        label: planProfile.label,
        basePriceCents: planProfile.basePriceCents,
        includedUsers: planProfile.includedUsers,
        includedRuns: planProfile.includedRuns,
        includedWorkspaces: planProfile.includedWorkspaces,
        overageRunCents: planProfile.overageRunCents,
        extraUserCents: planProfile.extraUserCents,
      },
      entitlements: {
        usersActive,
        usersOverage: invoiceAmounts.userOverage,
        userOverageCents: invoiceAmounts.userOverageCents,
        runsIncludedEffective: invoiceAmounts.includedRuns,
        runOverage: invoiceAmounts.runOverage,
        runOverageCents: invoiceAmounts.runOverageCents,
        estimatedInvoiceCents: invoiceAmounts.totalCents,
      },
      totals,
      usage: usage
        ? {
            runs: usage.runs,
            costCents: usage.costCents,
            tokens: usage.tokens,
            storageMb: usage.storageMb,
            updatedAt: usage.updatedAt,
          }
        : null,
      byWorkspace: Array.from(byWorkspace.values()).sort((a, b) => a.workspaceName.localeCompare(b.workspaceName)),
    },
  });
});

billingRouter.get("/billing/tenant/invoices", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client || !client.tenantInvoice) {
    return res.json({
      ok: true,
      data: { tenantId: authContext.tenantId, items: [] },
    });
  }

  const limit = Math.min(Math.max(parseOptionalInt(req.query.limit) ?? 12, 1), 36);
  const items = await client.tenantInvoice.findMany({
    where: { tenantId: authContext.tenantId },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      items,
    },
  });
});

billingRouter.post("/billing/tenant/invoices/generate", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const periodStart = parseOptionalDate(req.body?.periodStart);
  const periodEnd = parseOptionalDate(req.body?.periodEnd);
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_RANGE", message: "periodStart and periodEnd must be provided together" },
    });
  }

  try {
    const result = await generateMonthlyInvoice(prisma as any, {
      tenantId: authContext.tenantId,
      periodStart: periodStart ?? undefined,
      periodEnd: periodEnd ?? undefined,
      actor: "api",
    });

    return res.status(201).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: {
        code: "INVOICE_GENERATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

billingRouter.get("/billing/tenant/usage", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  if ((from && !to) || (!from && to)) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_RANGE", message: "from and to must be provided together" },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    return res.json({
      ok: true,
      data: { tenantId: authContext.tenantId, items: [] },
    });
  }
  const where: Record<string, unknown> = { tenantId: authContext.tenantId };
  if (from && to) {
    where.cycleStart = { gte: from };
    where.cycleEnd = { lte: to };
  }

  const items = await client.tenantQuotaUsage.findMany({
    where,
    orderBy: { cycleStart: "desc" },
    take: 36,
  });

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      items,
    },
  });
});

billingRouter.get("/billing/tenant/workspaces", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    return res.json({
      ok: true,
      data: {
        tenantId: authContext.tenantId,
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date().toISOString(),
        items: [],
      },
    });
  }
  const quotaUsageService = new QuotaUsageService(prisma);
  const cycle = await quotaUsageService.resolveCycle({ tenantId: authContext.tenantId });

  const [workspaces, grants, entries] = await Promise.all([
    client.workspace.findMany({
      where: { tenantId: authContext.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    client.workspaceQuotaGrant.findMany({
      where: { tenantId: authContext.tenantId },
    }),
    client.billingLedger.findMany({
      where: {
        tenantId: authContext.tenantId,
        createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
      },
      select: {
        workspaceId: true,
        entryType: true,
        amountCents: true,
      },
    }),
  ]);

  const grantByWorkspace = new Map(grants.map((grant: any) => [grant.workspaceId, grant]));
  const usageByWorkspace = new Map<string, { runs: number; costCents: number }>();
  for (const entry of entries) {
    const workspaceId = entry.workspaceId;
    if (!workspaceId) continue;
    const current = usageByWorkspace.get(workspaceId) ?? { runs: 0, costCents: 0 };
    current.costCents += Number(entry.amountCents ?? 0);
    if (entry.entryType === "debit" && Number(entry.amountCents ?? 0) > 0) {
      current.runs += 1;
    }
    usageByWorkspace.set(workspaceId, current);
  }

  const items = workspaces.map((workspace: any) => {
    const grant = grantByWorkspace.get(workspace.id) ?? null;
    const usage = usageByWorkspace.get(workspace.id) ?? { runs: 0, costCents: 0 };
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      isActiveWorkspace: workspace.id === authContext.workspaceId,
      grant: grant
        ? {
            enabled: grant.enabled,
            localRunLimit: grant.localRunLimit,
            localCostCentsLimit: grant.localCostCentsLimit,
            updatedAt: grant.updatedAt,
          }
        : null,
      usage,
    };
  });

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      cycleStart: cycle.cycleStart.toISOString(),
      cycleEnd: cycle.cycleEnd.toISOString(),
      items,
    },
  });
});

billingRouter.patch("/billing/tenant/workspaces/:id/grant", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = req.params.id;
  const enabled = req.body?.enabled;
  const localRunLimit = parseOptionalInt(req.body?.localRunLimit);
  const localCostCentsLimit = parseOptionalInt(req.body?.localCostCentsLimit);

  if (
    enabled === undefined &&
    localRunLimit === null &&
    localCostCentsLimit === null
  ) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_REQUIRED",
        message: "enabled and/or localRunLimit and/or localCostCentsLimit",
      },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "TENANT_BILLING_V2_UNAVAILABLE",
        message: "Tenant billing v2 not available in current runtime",
      },
    });
  }
  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, tenantId: true },
  });
  if (!workspace || workspace.tenantId !== authContext.tenantId) {
    return res.status(404).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
    });
  }

  await ensureTenantBillingDefaults(prisma, {
    tenantId: authContext.tenantId,
    workspaceId,
  });

  const grant = await client.workspaceQuotaGrant.upsert({
    where: {
      workspace_quota_grant_unique: {
        tenantId: authContext.tenantId,
        workspaceId,
      },
    },
    create: {
      tenantId: authContext.tenantId,
      workspaceId,
      enabled: typeof enabled === "boolean" ? enabled : true,
      localRunLimit,
      localCostCentsLimit,
    },
    update: {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(localRunLimit !== null ? { localRunLimit } : {}),
      ...(localCostCentsLimit !== null ? { localCostCentsLimit } : {}),
      updatedAt: new Date(),
    },
  });

  return res.json({ ok: true, data: grant });
});

billingRouter.patch("/billing/tenant/quotas", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const softLimitPct = parseOptionalInt(req.body?.softLimitPct);
  const hardLimitPct = parseOptionalInt(req.body?.hardLimitPct);
  const monthlyRunsLimit = parseOptionalInt(req.body?.monthlyRunsLimit);
  const monthlyCostCentsLimit = parseOptionalInt(req.body?.monthlyCostCentsLimit);

  if (
    softLimitPct === null &&
    hardLimitPct === null &&
    monthlyRunsLimit === null &&
    monthlyCostCentsLimit === null
  ) {
    return res.status(400).json({
      ok: false,
      error: { code: "MISSING_REQUIRED", message: "No quota field provided" },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "TENANT_BILLING_V2_UNAVAILABLE",
        message: "Tenant billing v2 not available in current runtime",
      },
    });
  }
  const existing = await client.tenantQuotaPolicy.findUnique({
    where: { tenantId: authContext.tenantId },
  });
  const nextSoft = softLimitPct ?? existing?.softLimitPct ?? 80;
  const nextHard = hardLimitPct ?? existing?.hardLimitPct ?? 100;
  if (nextSoft < 0 || nextSoft > 100 || nextHard < 0 || nextHard > 100 || nextSoft > nextHard) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_LIMITS", message: "soft/hard limits must be 0-100 and soft<=hard" },
    });
  }

  const policy = await client.tenantQuotaPolicy.upsert({
    where: { tenantId: authContext.tenantId },
    create: {
      tenantId: authContext.tenantId,
      softLimitPct: nextSoft,
      hardLimitPct: nextHard,
      monthlyRunsLimit,
      monthlyCostCentsLimit,
    },
    update: {
      softLimitPct: nextSoft,
      hardLimitPct: nextHard,
      ...(monthlyRunsLimit !== null ? { monthlyRunsLimit } : {}),
      ...(monthlyCostCentsLimit !== null ? { monthlyCostCentsLimit } : {}),
      updatedAt: new Date(),
    },
  });

  return res.json({ ok: true, data: policy });
});

billingRouter.get("/billing/tenant/ledger", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  const entryType = typeof req.query.type === "string" ? req.query.type : undefined;
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const limitParsed = parseOptionalInt(req.query.limit);
  const limit = limitParsed == null ? 100 : Math.max(1, Math.min(500, limitParsed));

  const where: Record<string, unknown> = { tenantId: authContext.tenantId };
  if (entryType) where.entryType = entryType;
  if (workspaceId) where.workspaceId = workspaceId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    return res.json({
      ok: true,
      data: { tenantId: authContext.tenantId, items: [] },
    });
  }
  const [entries, workspaces] = await Promise.all([
    client.billingLedger.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    }),
    client.workspace.findMany({
      where: { tenantId: authContext.tenantId },
      select: { id: true, name: true },
    }),
  ]);
  const workspaceNameById = new Map(workspaces.map((ws: { id: string; name: string }) => [ws.id, ws.name]));

  return res.json({
    ok: true,
    data: {
      tenantId: authContext.tenantId,
      items: entries.map((entry: any) => ({
        ...entry,
        workspaceName: entry.workspaceId ? workspaceNameById.get(entry.workspaceId) ?? entry.workspaceId : null,
      })),
    },
  });
});

billingRouter.post("/billing/tenant/adjustment", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const amountCents = parseOptionalInt(req.body?.amountCents);
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId : null;
  const runId = typeof req.body?.runId === "string" ? req.body.runId : null;
  const currency = typeof req.body?.currency === "string" ? req.body.currency : "BRL";
  const description = typeof req.body?.description === "string" ? req.body.description : null;
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : null;
  const provider = typeof req.body?.provider === "string" ? req.body.provider : null;
  const model = typeof req.body?.model === "string" ? req.body.model : null;

  if (amountCents == null || amountCents === 0) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_AMOUNT", message: "amountCents must be a non-zero integer" },
    });
  }

  const client = getTenantBillingV2Client(prisma);
  if (!client) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "TENANT_BILLING_V2_UNAVAILABLE",
        message: "Tenant billing v2 not available in current runtime",
      },
    });
  }
  if (workspaceId) {
    const workspace = await client.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, tenantId: true },
    });
    if (!workspace || workspace.tenantId !== authContext.tenantId) {
      return res.status(404).json({
        ok: false,
        error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
      });
    }
  }

  const ledgerService = new BillingLedgerService(prisma);
  const quotaUsageService = new QuotaUsageService(prisma);
  const ledgerResult = await ledgerService.insertAdjustment({
    tenantId: authContext.tenantId,
    workspaceId,
    runId,
    amountCents,
    currency,
    description,
    requestId,
    provider,
    model,
  });

  const usageSnapshot = await quotaUsageService.incrementFromEvent({
    tenantId: authContext.tenantId,
    amountCents,
    entryType: "adjustment",
  });

  return res.status(201).json({
    ok: true,
    data: {
      inserted: ledgerResult.inserted,
      ledger: ledgerResult.entry,
      usage: usageSnapshot.usage,
      cycleStart: usageSnapshot.cycle.cycleStart.toISOString(),
      cycleEnd: usageSnapshot.cycle.cycleEnd.toISOString(),
    },
  });
});
