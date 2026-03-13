export type TrustSnapshot = Record<string, unknown> | null;
type ResolveTrustSnapshotParams = {
  prisma: any;
  tenantId: string;
  workspaceId: string;
  runId: string;
};

/**
 * Resolve latest trust snapshot for a run/workspace in a deterministic way.
 */
export async function resolveTrustSnapshotForLedger(
  params: ResolveTrustSnapshotParams
): Promise<TrustSnapshot> {
  const latest = await params.prisma.guardrailLedger.findFirst({
    where: {
      tenantId: params.tenantId,
      runId: params.runId,
    },
    orderBy: { timestamp: "desc" },
    select: {
      id: true,
      timestamp: true,
      trustScore: true,
      actionType: true,
    },
  });

  if (!latest || latest.trustScore == null) return null;

  const trustLevel =
    latest.trustScore >= 70 ? "high" : latest.trustScore >= 40 ? "medium" : "low";

  return {
    guardrailId: latest.id,
    timestamp: latest.timestamp instanceof Date ? latest.timestamp.toISOString() : latest.timestamp,
    trustScore: latest.trustScore,
    trustLevel,
    actionType: latest.actionType ?? null,
    scope: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
    },
  };
}
