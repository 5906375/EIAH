import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { BillingLedgerService } from "./tenantBilling";
import {
  isSettlementProviderId,
  settleWithProvider,
  type SettlementProviderId,
} from "./settlementProviders";

export type PaymentIntentStatus =
  | "pending"
  | "blocked"
  | "released"
  | "settled"
  | "failed"
  | "cancelled";

type PaymentIntentRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  amountCents: number;
  currency: string;
  status: PaymentIntentStatus;
  provider: string | null;
  requestId: string;
  externalId: string | null;
  settlementReceipt: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreatePaymentIntentInput = {
  tenantId: string;
  workspaceId: string;
  runId: string;
  amountCents: number;
  currency?: string;
  provider?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PoUGateResult = {
  allowed: boolean;
  reason: string;
  proof: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mapPaymentIntentRow(row: any): PaymentIntentRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    runId: String(row.run_id),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    status: String(row.status) as PaymentIntentStatus,
    provider: row.provider ? String(row.provider) : null,
    requestId: String(row.request_id),
    externalId: row.external_id ? String(row.external_id) : null,
    settlementReceipt: asObject(row.settlement_receipt),
    metadata: asObject(row.metadata),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function resolveRequestId(input: CreatePaymentIntentInput) {
  if (input.requestId && input.requestId.trim()) return input.requestId.trim();
  return `payment-intent:${input.runId}:${input.amountCents}`;
}

export async function ensureEconomyBillingTables(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "payment_intents" (
      "id" TEXT PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "workspace_id" TEXT NOT NULL,
      "run_id" TEXT NOT NULL,
      "amount_cents" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'BRL',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "provider" TEXT,
      "request_id" TEXT NOT NULL,
      "external_id" TEXT,
      "settlement_receipt" JSONB,
      "metadata" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "payment_intents_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "payment_intents_workspace_id_fkey"
        FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "payment_intents_run_id_fkey"
        FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_tenant_request_unique"
      ON "payment_intents"("tenant_id", "request_id");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "payment_intents_tenant_workspace_status_idx"
      ON "payment_intents"("tenant_id", "workspace_id", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "payment_intents_provider_status_idx"
      ON "payment_intents"("provider", "status");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
      "id" TEXT PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "event_id" TEXT NOT NULL,
      "payment_intent_id" TEXT,
      "tenant_id" TEXT,
      "workspace_id" TEXT,
      "status" TEXT NOT NULL DEFAULT 'accepted',
      "signature_hash" TEXT,
      "payload_hash" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "billing_webhook_events_payment_intent_fkey"
        FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "billing_webhook_events_provider_event_unique"
      ON "billing_webhook_events"("provider", "event_id");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "billing_webhook_events_tenant_created_idx"
      ON "billing_webhook_events"("tenant_id", "created_at");
  `);
}

export async function createPaymentIntent(prisma: PrismaClient, input: CreatePaymentIntentInput) {
  await ensureEconomyBillingTables(prisma);

  const requestId = resolveRequestId(input);
  const id = `pi_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const currency = input.currency?.trim() || "BRL";
  const provider = input.provider?.trim() || null;
  const metadataJson = JSON.stringify(input.metadata ?? {});

  const rows = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO "payment_intents" (
        "id","tenant_id","workspace_id","run_id","amount_cents","currency","status","provider","request_id","metadata"
      ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9::jsonb)
      ON CONFLICT ("tenant_id","request_id")
      DO UPDATE SET "updated_at"=CURRENT_TIMESTAMP
      RETURNING *;
    `,
    id,
    input.tenantId,
    input.workspaceId,
    input.runId,
    input.amountCents,
    currency,
    provider,
    requestId,
    metadataJson
  )) as any[];

  return mapPaymentIntentRow(rows[0]);
}

export async function getPaymentIntentById(
  prisma: PrismaClient,
  params: { id: string; tenantId?: string | null; workspaceId?: string | null }
) {
  await ensureEconomyBillingTables(prisma);

  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT *
      FROM "payment_intents"
      WHERE "id"=$1
        AND ($2::text IS NULL OR "tenant_id"=$2::text)
        AND ($3::text IS NULL OR "workspace_id"=$3::text)
      LIMIT 1;
    `,
    params.id,
    params.tenantId ?? null,
    params.workspaceId ?? null
  )) as any[];

  if (!rows[0]) return null;
  return mapPaymentIntentRow(rows[0]);
}

export async function updatePaymentIntentStatus(
  prisma: PrismaClient,
  params: {
    id: string;
    tenantId: string;
    nextStatus: PaymentIntentStatus;
    externalId?: string | null;
    settlementReceipt?: Record<string, unknown> | null;
    metadataPatch?: Record<string, unknown> | null;
  }
) {
  await ensureEconomyBillingTables(prisma);
  const receiptJson = params.settlementReceipt ? JSON.stringify(params.settlementReceipt) : null;
  const metadataJson = params.metadataPatch ? JSON.stringify(params.metadataPatch) : null;

  const rows = (await prisma.$queryRawUnsafe(
    `
      UPDATE "payment_intents"
      SET
        "status"=$3,
        "external_id"=COALESCE($4, "external_id"),
        "settlement_receipt"=COALESCE($5::jsonb, "settlement_receipt"),
        "metadata"=CASE
          WHEN $6::jsonb IS NULL THEN "metadata"
          ELSE COALESCE("metadata", '{}'::jsonb) || $6::jsonb
        END,
        "updated_at"=CURRENT_TIMESTAMP
      WHERE "id"=$1 AND "tenant_id"=$2
      RETURNING *;
    `,
    params.id,
    params.tenantId,
    params.nextStatus,
    params.externalId ?? null,
    receiptJson,
    metadataJson
  )) as any[];

  if (!rows[0]) return null;
  return mapPaymentIntentRow(rows[0]);
}

export async function evaluatePoUGateForRun(
  prisma: PrismaClient,
  params: { tenantId: string; workspaceId: string; runId: string }
): Promise<PoUGateResult> {
  const runRows = (await prisma.$queryRawUnsafe(
    `
      SELECT "id","status","tx_id","critical_hash"
      FROM "runs"
      WHERE "id"=$1 AND "tenant_id"=$2 AND "workspace_id"=$3
      LIMIT 1;
    `,
    params.runId,
    params.tenantId,
    params.workspaceId
  )) as any[];

  const run = runRows[0];
  if (!run) {
    return {
      allowed: false,
      reason: "run_not_found",
      proof: { runId: params.runId },
    };
  }
  if (String(run.status) !== "success") {
    return {
      allowed: false,
      reason: "run_not_success",
      proof: { runId: params.runId, status: String(run.status) },
    };
  }
  if (!run.tx_id || !run.critical_hash) {
    return {
      allowed: false,
      reason: "missing_receipt_link",
      proof: {
        runId: params.runId,
        txIdPresent: Boolean(run.tx_id),
        criticalHashPresent: Boolean(run.critical_hash),
      },
    };
  }

  const sclRows = (await prisma.$queryRawUnsafe(
    `
      SELECT "id","tx_id","critical_hash"
      FROM "scl_ledger"
      WHERE "tenant_id"=$1
        AND "workspace_id"=$2
        AND "run_id"=$3
        AND "tx_id"=$4
        AND "critical_hash"=$5
      LIMIT 1;
    `,
    params.tenantId,
    params.workspaceId,
    params.runId,
    String(run.tx_id),
    String(run.critical_hash)
  )) as any[];

  if (!sclRows[0]) {
    return {
      allowed: false,
      reason: "scl_not_finalized",
      proof: {
        runId: params.runId,
        txId: String(run.tx_id),
        criticalHash: String(run.critical_hash),
      },
    };
  }

  return {
    allowed: true,
    reason: "pou_gate_pass",
    proof: {
      runId: params.runId,
      txId: String(run.tx_id),
      criticalHash: String(run.critical_hash),
      sclEntryId: String(sclRows[0].id),
    },
  };
}

export async function releasePaymentIntentByPoU(
  prisma: PrismaClient,
  params: { paymentIntentId: string; tenantId: string; workspaceId: string }
) {
  const intent = await getPaymentIntentById(prisma, {
    id: params.paymentIntentId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!intent) return { intent: null, gate: null };

  if (intent.status === "settled") {
    return {
      intent,
      gate: {
        allowed: true,
        reason: "already_settled",
        proof: {
          runId: intent.runId,
          paymentIntentId: intent.id,
          status: intent.status,
        },
      },
    };
  }

  const gate = await evaluatePoUGateForRun(prisma, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: intent.runId,
  });
  const nextStatus: PaymentIntentStatus = gate.allowed ? "released" : "blocked";
  const updated = await updatePaymentIntentStatus(prisma, {
    id: intent.id,
    tenantId: params.tenantId,
    nextStatus,
    metadataPatch: {
      gateDecision: nextStatus,
      gateReason: gate.reason,
      gateProof: gate.proof,
      gatedAt: new Date().toISOString(),
    },
  });
  return { intent: updated, gate };
}

export async function settlePaymentIntent(
  prisma: PrismaClient,
  params: {
    paymentIntentId: string;
    tenantId: string;
    workspaceId: string;
    provider: string;
    requestId?: string | null;
    source?: "api" | "webhook";
  }
) {
  const intent = await getPaymentIntentById(prisma, {
    id: params.paymentIntentId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!intent) {
    return { ok: false as const, code: "PAYMENT_INTENT_NOT_FOUND" };
  }

  if (!isSettlementProviderId(params.provider)) {
    return { ok: false as const, code: "UNSUPPORTED_PROVIDER" };
  }

  if (intent.status === "settled") {
    return { ok: true as const, intent, idempotent: true, settlement: null };
  }
  if (intent.status !== "released") {
    return {
      ok: false as const,
      code: "PAYMENT_INTENT_NOT_RELEASED",
      intent,
    };
  }

  const requestId =
    params.requestId?.trim() ||
    `payment_intent:${intent.id}:settlement:${params.provider}`;
  const settlement = await settleWithProvider(params.provider as SettlementProviderId, {
    paymentIntentId: intent.id,
    amountCents: intent.amountCents,
    currency: intent.currency,
    requestId,
    metadata: intent.metadata,
  });

  const updated = await updatePaymentIntentStatus(prisma, {
    id: intent.id,
    tenantId: params.tenantId,
    nextStatus: settlement.status === "succeeded" ? "settled" : "released",
    externalId: settlement.providerSettlementId,
    settlementReceipt: {
      ...settlement.receipt,
      source: params.source ?? "api",
      provider: settlement.provider,
      status: settlement.status,
    },
  });

  if (updated && settlement.status === "succeeded") {
    const ledgerService = new BillingLedgerService(prisma);
    await ledgerService.insertCredit({
      tenantId: updated.tenantId,
      workspaceId: updated.workspaceId,
      runId: updated.runId,
      amountCents: updated.amountCents,
      currency: updated.currency,
      provider: settlement.provider,
      description: `Settlement credit for payment intent ${updated.id}`,
      requestId: `settlement:${updated.id}:${settlement.providerSettlementId}`,
    });
  }

  return {
    ok: true as const,
    intent: updated,
    idempotent: false,
    settlement,
  };
}

export function buildWebhookSignatureBase(params: {
  provider: string;
  timestamp: string;
  eventId: string;
  paymentIntentId: string;
  status: string;
  amountCents: number;
}) {
  return [
    params.provider,
    params.timestamp,
    params.eventId,
    params.paymentIntentId,
    params.status,
    String(params.amountCents),
  ].join(".");
}

export function computeWebhookSignature(secret: string, base: string) {
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}

export async function registerWebhookEvent(
  prisma: PrismaClient,
  params: {
    provider: string;
    eventId: string;
    paymentIntentId: string | null;
    tenantId: string | null;
    workspaceId: string | null;
    status: string;
    signatureHash?: string | null;
    payloadHash?: string | null;
  }
) {
  await ensureEconomyBillingTables(prisma);

  const existing = (await prisma.$queryRawUnsafe(
    `
      SELECT "id" FROM "billing_webhook_events"
      WHERE "provider"=$1 AND "event_id"=$2
      LIMIT 1;
    `,
    params.provider,
    params.eventId
  )) as any[];
  if (existing[0]) {
    return { inserted: false as const, id: String(existing[0].id) };
  }

  const id = `whe_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`;
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "billing_webhook_events" (
        "id","provider","event_id","payment_intent_id","tenant_id","workspace_id","status","signature_hash","payload_hash"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);
    `,
    id,
    params.provider,
    params.eventId,
    params.paymentIntentId,
    params.tenantId,
    params.workspaceId,
    params.status,
    params.signatureHash ?? null,
    params.payloadHash ?? null
  );
  return { inserted: true as const, id };
}
