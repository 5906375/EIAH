import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export type StoredRecommendationState = {
  recommendations: Record<
    string,
    {
      adopted: boolean;
      accepts: number;
      rejects: number;
      lastAcceptedAt: string | null;
      lastSuggestedAt: string | null;
      score: number;
      status: "ADOTADO" | "REJEITADO" | "PENDENTE";
    }
  >;
  client_preferences?: Record<string, boolean>;
  best_performing_tactics?: string[];
  version?: number;
};

export async function getAgentRecommendationState(params: {
  tenantId: string;
  workspaceId: string;
  agentId: string;
}) {
  const record = await prisma.agentRecommendationState.findUnique({
    where: {
      tenantId_workspaceId_agent: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agent: params.agentId,
      },
    },
  });

  if (!record) {
    return null;
  }

  return {
    state: record.state as StoredRecommendationState,
    lastRunId: record.lastRunId ?? null,
    version: record.version ?? 1,
    updatedAt: record.updatedAt,
  };
}

export async function saveAgentRecommendationState(params: {
  tenantId: string;
  workspaceId: string;
  agentId: string;
  state: StoredRecommendationState;
  lastRunId: string;
}) {
  const payload: Prisma.AgentRecommendationStateCreateInput = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agent: params.agentId,
    state: params.state as Prisma.InputJsonValue,
    lastRunId: params.lastRunId,
    version: params.state?.version ?? 1,
  };

  const updatePayload: Prisma.AgentRecommendationStateUpdateInput = {
    state: params.state as Prisma.InputJsonValue,
    lastRunId: params.lastRunId,
    version:
      typeof params.state?.version === "number"
        ? params.state.version
        : { increment: 1 },
  };

  return prisma.agentRecommendationState.upsert({
    where: {
      tenantId_workspaceId_agent: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agent: params.agentId,
      },
    },
    create: payload,
    update: updatePayload,
  });
}
