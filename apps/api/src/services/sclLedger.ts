import { prismaGlobal, type PrismaClient } from "@repo/db";
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
  return appendSignedHash({
    prisma: params.prisma ?? prismaGlobal,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId ?? null,
    runId: params.runId,
    payload: params.payload,
    riskLevel: params.riskLevel,
    trustScore: params.trustScore,
  });
}
