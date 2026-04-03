import type { PrismaClient } from "@repo/db";
import { prismaGlobal } from "@repo/db";
import { frictionEventSchema, type FrictionEvent, type FrictionKind } from "../types/frictionEventContract";
import { buildFrictionEventSummary, type FrictionEventSummary } from "../types/frictionEventSummary";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function extractFrictionEventFromAuditMetadata(metadata: unknown): FrictionEvent | null {
  const record = asRecord(metadata);
  if (!record) return null;
  const candidate = "frictionEvent" in record ? record.frictionEvent : record;
  const parsed = frictionEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export async function listFrictionEvents(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  windowStart?: Date;
  limit?: number;
  kinds?: FrictionKind[];
}) {
  const rows = await (params.prisma ?? prismaGlobal).guardrailAuditLedger.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      ...(params.windowStart ? { createdAt: { gte: params.windowStart } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 200,
  });

  const events = rows
    .map((row) => extractFrictionEventFromAuditMetadata(row.metadata))
    .filter((event): event is FrictionEvent => Boolean(event));

  if (!params.kinds?.length) return events;
  const allowed = new Set(params.kinds);
  return events.filter((event) => allowed.has(event.kind));
}

export async function summarizeFrictionEvents(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  windowStart?: Date;
  limit?: number;
}): Promise<FrictionEventSummary> {
  const events = await listFrictionEvents(params);
  const byKind = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.kind] = (acc[event.kind] ?? 0) + 1;
    return acc;
  }, {});
  const bySource = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.source] = (acc[event.source] ?? 0) + 1;
    return acc;
  }, {});
  const bySurface = events.reduce<Record<string, number>>((acc, event) => {
    const key = event.surfaceId ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const byDomain = events.reduce<Record<string, number>>((acc, event) => {
    const key = event.activeDomain ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const byReasonCode = events.reduce<Record<string, number>>((acc, event) => {
    const key = event.reasonCode ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const byWorkspace = events.reduce<Record<string, number>>((acc, event) => {
    const key = event.workspaceId || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return buildFrictionEventSummary({
    scope: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      windowStart: params.windowStart ?? null,
    },
    total: events.length,
    byKind,
    bySource,
    byDomain,
    bySurface,
    byReasonCode,
    byWorkspace,
    recentEvents: events.slice(0, 20),
  });
}
