import { createHash, randomUUID } from "node:crypto";
import type {
  ImobMarketScanRunSnapshot,
  ImobMarketSourceAccessMode,
  ImobSourceAccessDecisionSnapshot,
} from "../imobConversationContract";

export type ImobMarketScanRunStatus = ImobMarketScanRunSnapshot["status"];

type MarketScanRunRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  status: ImobMarketScanRunStatus | string;
  accessMode?: ImobMarketSourceAccessMode | string | null;
  sourceIds?: unknown;
  queryHash: string;
  evidenceBundleId?: string | null;
  resultSnapshot?: unknown;
};

type ImobMarketScanRunDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<MarketScanRunRow>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<MarketScanRunRow>;
};

export type ImobMarketScanRunStorePrisma = {
  imobMarketScanRun?: ImobMarketScanRunDelegate;
};

const STATUS_SEQUENCE: ImobMarketScanRunStatus[] = [
  "requested",
  "authorization",
  "fetch",
  "normalization",
  "matching",
  "scoring",
  "recommendation",
  "completed",
  "blocked",
  "failed",
];

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`)
    .join(",")}}`;
}

export function computeMarketScanQueryHash(query: unknown): string {
  return createHash("sha256").update(stableJson(query)).digest("hex");
}

function asSourceIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeStatus(value: string): ImobMarketScanRunStatus {
  return STATUS_SEQUENCE.includes(value as ImobMarketScanRunStatus) ? (value as ImobMarketScanRunStatus) : "failed";
}

function toSnapshot(row: MarketScanRunRow, sourceAccessDecision?: ImobSourceAccessDecisionSnapshot | null): ImobMarketScanRunSnapshot {
  return {
    runId: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    caseId: row.caseId ?? null,
    status: normalizeStatus(String(row.status)),
    accessMode: (row.accessMode as ImobMarketSourceAccessMode | null | undefined) ?? null,
    sourceIds: asSourceIds(row.sourceIds),
    queryHash: row.queryHash,
    evidenceBundleId: row.evidenceBundleId ?? null,
    sourceAccessDecision: sourceAccessDecision ?? null,
  };
}

function requireDelegate(prisma: ImobMarketScanRunStorePrisma): ImobMarketScanRunDelegate {
  if (!prisma.imobMarketScanRun) {
    throw new Error("ImobMarketScanRun delegate unavailable. Run the Prisma migration/client update before enabling market scan runs.");
  }
  return prisma.imobMarketScanRun;
}

export async function createMarketScanRun(params: {
  prisma: ImobMarketScanRunStorePrisma;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  query: unknown;
  region?: string | null;
  operation?: string | null;
  propertyType?: string | null;
  sourceIds: string[];
  accessMode?: ImobMarketSourceAccessMode | null;
  requestedAt?: Date;
}) {
  const requestedAt = params.requestedAt ?? new Date();
  const row = await requireDelegate(params.prisma).create({
    data: {
      id: randomUUID(),
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      caseId: params.caseId ?? null,
      query: params.query,
      region: params.region ?? null,
      operation: params.operation ?? null,
      propertyType: params.propertyType ?? null,
      requestedAt,
      startedAt: null,
      completedAt: null,
      status: "requested",
      accessMode: params.accessMode ?? null,
      sourceIds: params.sourceIds,
      termsMode: null,
      queryHash: computeMarketScanQueryHash(params.query),
      evidenceBundleId: null,
      resultSnapshot: null,
      recommendationId: null,
      opportunityId: null,
      failureReason: null,
    },
  });
  return toSnapshot(row);
}

async function updateMarketScanRunStatus(params: {
  prisma: ImobMarketScanRunStorePrisma;
  runId: string;
  status: ImobMarketScanRunStatus;
  data?: Record<string, unknown>;
  sourceAccessDecision?: ImobSourceAccessDecisionSnapshot | null;
}) {
  const terminal = params.status === "completed" || params.status === "blocked" || params.status === "failed";
  const row = await requireDelegate(params.prisma).update({
    where: { id: params.runId },
    data: {
      status: params.status,
      ...(params.status === "authorization" ? { startedAt: new Date() } : {}),
      ...(terminal ? { completedAt: new Date() } : {}),
      ...(params.data ?? {}),
    },
  });
  return toSnapshot(row, params.sourceAccessDecision);
}

export function markMarketScanAuthorizationStarted(params: { prisma: ImobMarketScanRunStorePrisma; runId: string }) {
  return updateMarketScanRunStatus({ ...params, status: "authorization" });
}

export function markMarketScanFetchStarted(params: { prisma: ImobMarketScanRunStorePrisma; runId: string }) {
  return updateMarketScanRunStatus({ ...params, status: "fetch" });
}

export function markMarketScanNormalizationStarted(params: { prisma: ImobMarketScanRunStorePrisma; runId: string }) {
  return updateMarketScanRunStatus({ ...params, status: "normalization" });
}

export function markMarketScanMatchingStarted(params: { prisma: ImobMarketScanRunStorePrisma; runId: string }) {
  return updateMarketScanRunStatus({ ...params, status: "matching" });
}

export function markMarketScanScoringStarted(params: { prisma: ImobMarketScanRunStorePrisma; runId: string }) {
  return updateMarketScanRunStatus({ ...params, status: "scoring" });
}

export function markMarketScanRecommendationStarted(params: { prisma: ImobMarketScanRunStorePrisma; runId: string }) {
  return updateMarketScanRunStatus({ ...params, status: "recommendation" });
}

export function blockMarketScanRun(params: {
  prisma: ImobMarketScanRunStorePrisma;
  runId: string;
  reason: string;
  sourceAccessDecision: ImobSourceAccessDecisionSnapshot;
}) {
  return updateMarketScanRunStatus({
    prisma: params.prisma,
    runId: params.runId,
    status: "blocked",
    sourceAccessDecision: params.sourceAccessDecision,
    data: { failureReason: params.reason },
  });
}

export function completeMarketScanRun(params: {
  prisma: ImobMarketScanRunStorePrisma;
  runId: string;
  resultSnapshot: unknown;
  evidenceBundleId?: string | null;
  recommendationId?: string | null;
  opportunityId?: string | null;
}) {
  return updateMarketScanRunStatus({
    prisma: params.prisma,
    runId: params.runId,
    status: "completed",
    data: {
      resultSnapshot: params.resultSnapshot,
      evidenceBundleId: params.evidenceBundleId ?? null,
      recommendationId: params.recommendationId ?? null,
      opportunityId: params.opportunityId ?? null,
    },
  });
}

export function failMarketScanRun(params: { prisma: ImobMarketScanRunStorePrisma; runId: string; reason: string }) {
  return updateMarketScanRunStatus({
    prisma: params.prisma,
    runId: params.runId,
    status: "failed",
    data: { failureReason: params.reason },
  });
}
