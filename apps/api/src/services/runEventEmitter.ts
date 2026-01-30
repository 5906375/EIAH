import { prismaGlobal, type PrismaClient } from "@repo/db";
import { recordGuardrailAudit, recordGuardrailLedger } from "@eiah/core";
import { recordRunEvent } from "./runEvents";

type EmitRunEventParams = {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  type: string;
  payload?: unknown;
  criticalHash?: string | null;
  sclTxId?: string | null;
};

const ALERT_EVENT_TYPES = new Set([
  "run.action.error",
  "run.action.failed",
  "run.blocked.guardrails",
  "run.orchestrator.failed",
  "run.failed",
]);

const LEDGER_EVENT_TYPES = new Map<string, string>([
  ["llm.completion.retry_config", "llm.retry_config"],
  ["job.retry_scheduled", "job.retry_scheduled"],
  ["job.failed", "job.failed"],
]);

function extractAlertReason(payload?: unknown) {
  if (!payload || typeof payload !== "object") return "alert triggered";
  const record = payload as Record<string, unknown>;
  return (
    (record.reason as string | undefined) ??
    (record.message as string | undefined) ??
    (record.error as string | undefined) ??
    "alert triggered"
  );
}

export async function emitRunEvent(params: EmitRunEventParams) {
  const event = await recordRunEvent(params);
  const prisma = params.prisma ?? prismaGlobal;

  const ledgerActionType = LEDGER_EVENT_TYPES.get(event.type);
  if (ledgerActionType) {
    await recordGuardrailLedger({
      prisma,
      tenantId: event.tenantId,
      runId: event.runId,
      actionType: ledgerActionType,
      payload: params.payload,
    } as Parameters<typeof recordGuardrailLedger>[0]);
  }

  if (ALERT_EVENT_TYPES.has(event.type)) {
    const reason = extractAlertReason(params.payload);
    await recordGuardrailAudit({
      prisma,
      tenantId: event.tenantId,
      workspaceId: event.workspaceId,
      runId: event.runId,
      eventType: "alert.triggered",
      severity: "error",
      message: reason,
      metadata: {
        sourceEvent: event.type,
        runEventId: event.id,
        payload: params.payload ?? null,
      },
    } as Parameters<typeof recordGuardrailAudit>[0]);

    await recordGuardrailLedger({
      prisma,
      tenantId: event.tenantId,
      runId: event.runId,
      actionType: "alert.triggered",
      payload: {
        sourceEvent: event.type,
        runEventId: event.id,
        reason,
      },
    } as Parameters<typeof recordGuardrailLedger>[0]);
  }

  return event;
}
