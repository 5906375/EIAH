export function buildTrustScoreWhereUnique(
  tenantId: string,
  workspaceId: string,
  agentId: string
) {
  return {
    unique_trustscore_agent: {
      tenantId,
      workspaceId,
      agentId,
    },
  };
}
