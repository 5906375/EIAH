import { getPrismaForTenant } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";
import { appendSignedHash, type RiskLevel, type TrustScoreReport } from "@eiah/core";

export async function appendSclRecord(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  runId: string;
  payload: unknown;
  riskLevel?: RiskLevel;
  trustScore?: TrustScoreReport;
}) {
  const prisma =
    params.prisma ??
    (getPrismaForTenant(params.tenantId, params.workspaceId ?? "") as PrismaClient);
  return appendSignedHash({
    prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId ?? null,
    runId: params.runId,
    payload: params.payload,
    riskLevel: params.riskLevel,
    trustScore: params.trustScore,
  });
}
