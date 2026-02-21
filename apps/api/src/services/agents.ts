import { Prisma, getPrismaForTenant } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";
import { listRegisteredActions } from "@eiah/core";
import {
  aadvProfile,
  defiOneProfile,
  diariasProfile,
  eiahProfile,
  finNexusProfile,
  flowOrchestratorProfile,
  guardianProfile,
  iBcProfile,
  imageNftDiariasProfile,
  j360Profile,
  marketingProfile,
  nftPyProfile,
  onchainMonitorProfile,
  pitchProfileThinking,
  riskAnalyzerProfile,
} from "@eiah/core";

/**
 * Estrutura de listagem de agentes com pricing e perfil.
 */
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

type CoreAgentProfile = {
  agent: string;
  name: string;
  description?: string;
  model: string;
  systemPrompt: string;
  tools?: unknown;
};

const CORE_AGENT_PROFILES: CoreAgentProfile[] = [
  aadvProfile,
  defiOneProfile,
  diariasProfile,
  eiahProfile,
  finNexusProfile,
  flowOrchestratorProfile,
  guardianProfile,
  iBcProfile,
  imageNftDiariasProfile,
  { ...j360Profile, agent: "J_360" },
  marketingProfile,
  nftPyProfile,
  onchainMonitorProfile,
  pitchProfileThinking,
  riskAnalyzerProfile,
];

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CANONICAL_AGENT_BY_KEY = (() => {
  const map = new Map<string, string>();
  for (const profile of CORE_AGENT_PROFILES) {
    const key = normalizeAgentKey(profile.agent);
    if (key) {
      map.set(key, profile.agent);
    }
  }
  return map;
})();

export function resolveAgentId(input: string) {
  const key = normalizeAgentKey(input);
  return CANONICAL_AGENT_BY_KEY.get(key) ?? input.trim();
}

function coreProfileForAgent(agent: string) {
  const canonical = resolveAgentId(agent);
  return (
    CORE_AGENT_PROFILES.find((profile) => profile.agent === canonical) ??
    CORE_AGENT_PROFILES.find((profile) => normalizeAgentKey(profile.agent) === normalizeAgentKey(agent)) ??
    null
  );
}

function coreSeedAsRecord(agent: string) {
  const coreProfile = coreProfileForAgent(agent);
  if (!coreProfile) return null;
  const now = new Date();
  return {
    id: `core:${coreProfile.agent}`,
    agent: coreProfile.agent,
    name: coreProfile.name,
    description: coreProfile.description ?? null,
    model: coreProfile.model,
    systemPrompt: coreProfile.systemPrompt,
    tools: (coreProfile.tools as Prisma.JsonValue | undefined) ?? Prisma.JsonNull,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Lista agentes disponíveis, combinando dados de pricing,
 * perfis de agentes e ações registradas no core.
 * 
 * Multi-tenant: o client Prisma é obtido via prismaGlobal
 * para garantir isolamento de dados por tenant/workspace.
 */
export async function listAgents(
  tenantId: string,
  workspaceId: string,
  client?: PrismaClient
): Promise<AgentListing[]> {
  const db = client ?? (getPrismaForTenant(tenantId, workspaceId) as PrismaClient);

  const [pricing, profiles] = await Promise.all([
    db.pricing.findMany({ where: { active: true } }),
    db.agentProfile.findMany(),
  ]);

  const registry = listRegisteredActions();

  const profileMap = new Map<string, (typeof profiles)[number]>();
  for (const profile of profiles) {
    profileMap.set(resolveAgentId(profile.agent), profile);
  }

  const response: AgentListing[] = pricing.map((plan) => {
    const canonical = resolveAgentId(plan.agent);
    const profile = profileMap.get(canonical);
    return {
      id: canonical,
      name: profile?.name ?? canonical,
      description: profile?.description ?? `Agent ${canonical}`,
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
    const canonical = resolveAgentId(profile.agent);
    if (!response.some((item) => item.id === canonical)) {
      response.push({
        id: canonical,
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

  for (const coreProfile of CORE_AGENT_PROFILES) {
    if (!response.some((item) => item.id === coreProfile.agent)) {
      response.push({
        id: coreProfile.agent,
        name: coreProfile.name,
        description: coreProfile.description ?? null,
        pricing: undefined,
        profile: {
          model: coreProfile.model,
          systemPrompt: coreProfile.systemPrompt,
          tools: coreProfile.tools ?? null,
        },
      });
    }
  }

  for (const entry of registry) {
    const canonical = resolveAgentId(entry.name);
    if (canonical !== entry.name) {
      // Avoid duplicating core agent entries through registry aliases (e.g. "riskAnalyzer" vs "risk-analyzer").
      continue;
    }
    if (!response.some((item) => item.id === entry.name)) {
      response.push({
        id: entry.name,
        name: entry.name,
        description: entry.description ?? null,
        pricing: undefined,
        profile: undefined,
      });
    }
  }

  return response;
}

/**
 * Retorna o perfil de um agente, considerando o contexto multi-tenant.
 * Se não existir no banco, retorna fallback do registro estático.
 */
export async function getAgentProfile(
  tenantId: string,
  workspaceId: string,
  agent: string,
  client?: PrismaClient
) {
  const db = client ?? (getPrismaForTenant(tenantId, workspaceId) as PrismaClient);
  const resolvedAgent = resolveAgentId(agent);

  const dbProfile = await db.agentProfile.findUnique({ where: { agent: resolvedAgent } });
  if (dbProfile) return dbProfile;

  const coreSeed = coreSeedAsRecord(resolvedAgent);
  if (coreSeed) return coreSeed;

  const registryEntry = listRegisteredActions().find((action) => action.name === resolvedAgent);

  if (registryEntry) {
    return {
      id: resolvedAgent,
      agent: resolvedAgent,
      name: registryEntry.description ?? resolvedAgent,
      description: registryEntry.description ?? null,
      model: "unknown",
      systemPrompt: "",
      tools: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return null;
}
