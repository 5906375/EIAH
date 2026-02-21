import { Prisma } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";

type AuditEvent = {
  tenantId: string;
  workspaceId?: string | null;
  runId?: string | null;
  eventType: string;
  severity: "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown> | null;
};

const auditProbe: AuditEvent[] = [];

export function recordAuditEvent(params: { prisma: PrismaClient } & AuditEvent) {
  if (!params.tenantId) return Promise.resolve();
  const payload: AuditEvent = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId ?? null,
    runId: params.runId ?? null,
    eventType: params.eventType,
    severity: params.severity,
    message: params.message,
    metadata:
      params.metadata === undefined ? null : params.metadata,
  };
  const dbMetadata =
    params.metadata === undefined
      ? Prisma.DbNull
      : params.metadata === null
      ? Prisma.JsonNull
      : (params.metadata as Prisma.InputJsonValue);

  if (process.env.AUDIT_PROBE === "1") {
    auditProbe.push(payload);
  }

  return params.prisma.guardrailAuditLedger
    .create({
      data: {
        ...payload,
        metadata: dbMetadata,
      },
    })
    .catch(() => undefined);
}

export function getAuditProbe() {
  return [...auditProbe];
}

export function clearAuditProbe() {
  auditProbe.length = 0;
}
