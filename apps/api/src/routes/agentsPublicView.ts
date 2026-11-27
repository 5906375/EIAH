import type { AgentListing } from "../services/agents";

/**
 * Fronteira HTTP de `GET /api/agents` e `GET /api/agents/:name`.
 *
 * Projeção explícita dos campos de catálogo e de contrato conversacional. Instruções internas
 * (`systemPrompt`), configuração de integração (`tools`) e roteamento de modelos (`models`)
 * nunca são serializados, nem em objetos aninhados. Os objetos do serviço não são alterados:
 * `POST /runs` e o `runWorker` continuam lendo o perfil completo via `getAgentProfile()`.
 */
const RESERVED_KEYS = new Set(["systemPrompt", "tools", "models"]);

function withoutReservedKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutReservedKeys(entry)) as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !RESERVED_KEYS.has(key))
        .map(([key, entry]) => [key, withoutReservedKeys(entry)])
    ) as T;
  }
  return value;
}

export type PublicAgentListing = Omit<AgentListing, "profile"> & {
  profile?: { model: string };
};

export function toPublicAgentListing(item: AgentListing): PublicAgentListing {
  return withoutReservedKeys({
    id: item.id,
    name: item.name,
    description: item.description,
    pricing: item.pricing,
    profile: item.profile ? { model: item.profile.model } : undefined,
    knowledgePolicy: item.knowledgePolicy,
    governance: item.governance,
    cognitiveProfile: item.cognitiveProfile,
    uxContract: item.uxContract,
    chatCopy: item.chatCopy,
    journeyContract: item.journeyContract,
    chatRuntime: item.chatRuntime,
    attachmentContract: item.attachmentContract,
    participation: item.participation,
    modeContracts: item.modeContracts,
  });
}

const PUBLIC_PROFILE_FIELDS = [
  "id",
  "agent",
  "name",
  "description",
  "model",
  "knowledgePolicy",
  "participation",
  "chatCopy",
  "journeyContract",
  "chatRuntime",
  "modeContracts",
  "createdAt",
  "updatedAt",
] as const;

export function toPublicAgentProfile(profile: object): Record<string, unknown> {
  const source = profile as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (field in source) projected[field] = source[field];
  }
  return withoutReservedKeys(projected);
}
