import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type AgentListing = {
  id: string;
  name: string;
  description: string | null;
  pricing?: {
    perRunCents: number;
    perMBcents: number;
  };
  profile?: {
    model: string;
    systemPrompt: string;
    tools: unknown;
  };
};

export async function listAgents(): Promise<AgentListing[]> {
  const [pricing, profiles] = await Promise.all([
    prisma.pricing.findMany({ where: { active: true } }),
    prisma.agentProfile.findMany(),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.agent, profile]));

  const response: AgentListing[] = pricing.map((plan) => {
    const profile = profileMap.get(plan.agent);
    return {
      id: plan.agent,
      name: profile?.name ?? plan.agent,
      description: profile?.description ?? `Agent ${plan.agent}`,
      pricing: profile
        ? {
            perRunCents: plan.perRunCents,
            perMBcents: plan.perMBcents,
          }
        : undefined,
      profile: profile
        ? {
            model: profile.model,
            systemPrompt: profile.systemPrompt,
            tools: profile.tools,
          }
        : undefined,
    };
  });

  for (const profile of profiles) {
    if (!response.some((item) => item.id === profile.agent)) {
      response.push({
        id: profile.agent,
        name: profile.name,
        description: profile.description,
        pricing: undefined,
        profile: {
          model: profile.model,
          systemPrompt: profile.systemPrompt,
          tools: profile.tools,
        },
      });
    }
  }

  return response;
}

export async function getAgentProfile(agent: string) {
  return prisma.agentProfile.findUnique({ where: { agent } });
}
