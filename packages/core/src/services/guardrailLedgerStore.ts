import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@repo/db";

export type GuardrailSeverity = "info" | "warn" | "error";

export async function recordGuardrailLedger(params: {
  prisma: PrismaClient;
  tenantId: string;
  actionType: string;
  runId?: string | null;
  payload?: unknown;
  payloadHash?: string | null;
  criticalHash?: string | null;
  riskScore?: number | null;
  trustScore?: number | null;
  txId?: string | null;
  signature?: string | null;
  signatureKeyId?: string | null;
  signedAt?: Date | null;
  idempotencyKey?: string | null;
  usageCount?: number;
  isSystemFault?: boolean;
}) {
  const payloadHash =
    params.payloadHash ??
    (params.payload !== undefined
      ? crypto.createHash("sha256").update(JSON.stringify(params.payload)).digest("hex")
      : null);
  const fallbackCriticalHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: params.tenantId,
        actionType: params.actionType,
        runId: params.runId ?? null,
        txId: params.txId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        usageCount: params.usageCount ?? null,
        isSystemFault: params.isSystemFault ?? null,
      })
    )
    .digest("hex");
  const criticalHash = params.criticalHash ?? payloadHash ?? fallbackCriticalHash;

  await params.prisma.guardrailLedger.create({
    data: {
      tenantId: params.tenantId,
      runId: params.runId ?? null,
      actionType: params.actionType,
      txId: params.txId ?? null,
      criticalHash,
      payloadHash,
      riskScore: params.riskScore ?? null,
      trustScore: params.trustScore ?? null,
      signature: params.signature ?? null,
      signatureKeyId: params.signatureKeyId ?? null,
      signedAt: params.signedAt ?? null,
    },
  });
}

export async function recordGuardrailAudit(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  runId?: string | null;
  eventType: string;
  severity?: GuardrailSeverity;
  message: string;
  metadata?: unknown;
}) {
  const metadataValue =
    params.metadata === undefined
      ? Prisma.DbNull
      : params.metadata === null
      ? Prisma.JsonNull
      : (params.metadata as Prisma.InputJsonValue);

  await params.prisma.guardrailAuditLedger.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId ?? null,
      eventType: params.eventType,
      severity: params.severity ?? "info",
      message: params.message,
      metadata: metadataValue,
    },
  });
}
