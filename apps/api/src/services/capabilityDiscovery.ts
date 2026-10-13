// Descoberta SOMENTE LEITURA de capacidades transversais.
//
// Uma vertical declara uma necessidade ESTRUTURADA (domínio + capacidade). Este módulo resolve quem pode atendê-la
// consultando apenas fontes existentes e autoritativas, sem olhar texto do usuário:
//   - registro de agentes: declaração de capacidade (`agents.ts`) e catálogo do workspace (`listAgents`);
//   - Marketplace (inclusive agentes ainda não assinados), com a mesma regra de visibilidade da assinatura;
//   - modelos homologados em `tenant_recipes`, com o mesmo filtro de tenant e workspace de `/tenant-recipes`.
//
// Estados (nunca confundir existência no Marketplace com disponibilidade operacional):
//   habilitado     catálogo do workspace + participação ativa, sugerível e apta a handoff (mesma regra do Front Door)
//   habilitavel    existe no Marketplace, visível ao tenant, e ainda não está habilitado neste workspace
//   indisponivel   condição necessária não atendida (sem provedor declarado, fora do Marketplace, participação fechada)
//   nao_verificado informação insuficiente ou falha de consulta (fail-closed: nenhuma ação é oferecida)
//
// Este módulo NÃO escreve nada: não assina, não cria política nem delegação, não inicia handoff, não cria a tabela de
// receitas. A única ação possível é a habilitação governada de AGENTE, que exige confirmação humana explícita e acontece
// no Marketplace. Convite de pessoa ao workspace é outro fluxo (frontDoorAccess) e nunca é emitido aqui.

import type { PrismaClient } from "@repo/db";
import {
  getAgentCapabilityDeclarations,
  listAgents,
  listAgentsDeclaringCapability,
  listCoreAgentCatalog,
  normalizeAgentKey,
  resolveAgentAvailabilityFromCatalog,
  resolveAgentId,
} from "./agents";

export type CapabilityNeed = Readonly<{
  /** Identificador estável da necessidade declarada pela vertical (ex.: imob.listing.promotion). */
  needId: string;
  domain: string;
  capability: string;
  /** Rótulo de apresentação declarado pela vertical. */
  label?: string;
}>;

export type CapabilityState = "habilitado" | "habilitavel" | "indisponivel" | "nao_verificado";

export type DiscoveredRecipe = Readonly<{
  id: string;
  title: string;
  summary: string;
  tags: readonly string[];
  homologatedAt: string | null;
}>;

/**
 * `actionDomain` separa estruturalmente a habilitação de AGENTE (única emitida aqui) do convite de PESSOA ao
 * workspace, que pertence a outro fluxo e nunca aparece nesta lista de ações.
 */
export type CapabilityNextAction =
  | Readonly<{ kind: "enable_agent"; actionDomain: "agent_enablement"; requiresHumanConfirmation: true; marketplaceItemId: string; path: string }>
  | Readonly<{ kind: "request_work"; actionDomain: "agent_work"; enabled: false; reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" }>
  | Readonly<{ kind: "none"; actionDomain: null }>;

export type DiscoveredCapability = Readonly<{
  need: CapabilityNeed;
  state: CapabilityState;
  reasons: readonly string[];
  provider: Readonly<{
    agentId: string;
    name: string;
    description: string | null;
    declaredCapabilities: readonly string[];
    origin: "agent_registry" | "marketplace";
  }> | null;
  recipes: Readonly<{ status: "ok" | "nao_verificado" | "nao_aplicavel"; items: readonly DiscoveredRecipe[] }>;
  enablement: Readonly<{ marketplaceItemId: string; visibility: "public" | "own_tenant"; conditions: readonly string[] }> | null;
  nextAction: CapabilityNextAction;
}>;

type CatalogEntry = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  chatCopy?: { whatIDo?: unknown } | null;
  participation?: Record<string, unknown> | null;
};

type MarketplaceEntry = {
  id: string;
  name: string;
  description?: string | null;
  isPublic?: boolean | null;
  publisherId?: string | null;
  trustScore?: number | null;
  createdAt?: Date | string | null;
};

type RecipeEntry = {
  id: string;
  agentId: string;
  title: string;
  summary: string;
  tags?: unknown;
  status?: string | null;
  deprecatedAt?: Date | string | null;
  homologatedAt?: Date | string | null;
};

export type CapabilityDiscoveryReaders = Readonly<{
  listCatalog: (params: { tenantId: string; workspaceId: string }) => Promise<CatalogEntry[]>;
  listMarketplaceAgents: (params: { tenantId: string }) => Promise<MarketplaceEntry[]>;
  listHomologatedRecipes: (params: { tenantId: string; workspaceId: string }) => Promise<RecipeEntry[]>;
}>;

const MARKETPLACE_PATH = "/app/marketplace";
const TOKEN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/** Leituras reais. Todas filtram por tenant (e workspace quando aplicável) e são somente leitura. */
export function createDefaultCapabilityReaders(client: PrismaClient): CapabilityDiscoveryReaders {
  return {
    // Catálogo canônico do workspace: o mesmo que alimenta GET /agents e o Front Door.
    listCatalog: ({ tenantId, workspaceId }) => listAgents(tenantId, workspaceId, client) as unknown as Promise<CatalogEntry[]>,
    // Mesma visibilidade de GET /marketplace e da guarda de POST /marketplace/:id/subscribe.
    listMarketplaceAgents: ({ tenantId }) =>
      client.marketplaceItem.findMany({
        where: { type: "agent", OR: [{ isPublic: true }, { publisherId: tenantId }] },
        select: { id: true, name: true, description: true, isPublic: true, publisherId: true, trustScore: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }) as unknown as Promise<MarketplaceEntry[]>,
    // Mesmo filtro de GET /tenant-recipes (visão de workspace): homologadas, do tenant e do escopo do workspace.
    // Não seleciona instruções nem conteúdo e não cria a tabela (sem DDL): se ela não existir, a consulta falha e
    // o resultado é "nao_verificado".
    listHomologatedRecipes: ({ tenantId, workspaceId }) =>
      client.$queryRaw<RecipeEntry[]>`
        SELECT
          id,
          agent_id AS "agentId",
          title,
          summary,
          tags,
          status,
          homologated_at AS "homologatedAt",
          deprecated_at AS "deprecatedAt"
        FROM tenant_recipes
        WHERE tenant_id = ${tenantId}
          AND status = 'homologated'
          AND (
            workspace_scope_mode = 'all_workspaces'
            OR workspace_scope_ids ? ${workspaceId}
          )
        ORDER BY updated_at DESC;
      `,
  };
}

type Loaded<T> = { ok: true; value: T } | { ok: false };

function memoLoader<T>(load: () => Promise<T>): () => Promise<Loaded<T>> {
  let pending: Promise<Loaded<T>> | null = null;
  return () => {
    pending ??= load().then(
      (value): Loaded<T> => ({ ok: true, value }),
      (): Loaded<T> => ({ ok: false }),
    );
    return pending;
  };
}

const RANK: Record<CapabilityState, number> = { habilitado: 3, habilitavel: 2, nao_verificado: 1, indisponivel: 0 };

function asIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

type Evaluation = {
  state: CapabilityState;
  reasons: string[];
  agentId: string;
  catalogEntry: CatalogEntry | null;
  marketplaceItem: MarketplaceEntry | null;
};

function closed(need: CapabilityNeed, state: CapabilityState, reasons: string[]): DiscoveredCapability {
  return {
    need,
    state,
    reasons,
    provider: null,
    recipes: { status: "nao_aplicavel", items: [] },
    enablement: null,
    nextAction: { kind: "none", actionDomain: null },
  };
}

/**
 * Resolve varias necessidades de uma vez, compartilhando as consultas. Nunca lança: qualquer falha vira
 * "nao_verificado" sem oferecer ação.
 */
export async function discoverCapabilityNeeds(params: {
  needs: readonly CapabilityNeed[];
  tenantId: string;
  workspaceId: string;
  client?: PrismaClient;
  readers?: CapabilityDiscoveryReaders;
}): Promise<DiscoveredCapability[]> {
  const needs = (Array.isArray(params.needs) ? params.needs : []).map((need) => ({
    needId: String(need?.needId ?? ""),
    domain: typeof need?.domain === "string" ? need.domain.trim().toLowerCase() : "",
    capability: typeof need?.capability === "string" ? need.capability.trim().toLowerCase() : "",
    ...(typeof need?.label === "string" && need.label.trim() !== "" ? { label: need.label.trim() } : {}),
  }));
  const scopeOk = typeof params.tenantId === "string" && params.tenantId.trim() !== ""
    && typeof params.workspaceId === "string" && params.workspaceId.trim() !== "";
  const readers = params.readers ?? (params.client ? createDefaultCapabilityReaders(params.client) : null);
  if (!scopeOk || readers === null) {
    return needs.map((need) => closed(need, "nao_verificado", [scopeOk ? "READERS_UNAVAILABLE" : "SCOPE_INVALID"]));
  }
  const { tenantId, workspaceId } = params;

  const loadCatalog = memoLoader(() => readers.listCatalog({ tenantId, workspaceId }));
  const loadMarketplace = memoLoader(() => readers.listMarketplaceAgents({ tenantId }));
  const loadRecipes = memoLoader(() => readers.listHomologatedRecipes({ tenantId, workspaceId }));
  const loadCore = memoLoader(async () => listCoreAgentCatalog());

  async function evaluate(agentId: string): Promise<Evaluation> {
    const key = normalizeAgentKey(resolveAgentId(agentId));
    const base = { agentId, catalogEntry: null, marketplaceItem: null };
    const catalog = await loadCatalog();
    if (!catalog.ok || !Array.isArray(catalog.value)) return { ...base, state: "nao_verificado", reasons: ["CATALOG_QUERY_FAILED"] };
    const entry = catalog.value.find((item) => normalizeAgentKey(resolveAgentId(item?.id ?? "")) === key) ?? null;
    if (entry) {
      const verdict = resolveAgentAvailabilityFromCatalog([entry], agentId);
      if (verdict === "available") return { ...base, catalogEntry: entry, state: "habilitado", reasons: [] };
      if (verdict === "unverified") return { ...base, catalogEntry: entry, state: "nao_verificado", reasons: ["PARTICIPATION_UNVERIFIED"] };
      return { ...base, catalogEntry: entry, state: "indisponivel", reasons: ["PARTICIPATION_NOT_ACTIVE"] };
    }
    // Fora do catálogo do workspace: existir no Marketplace torna o agente HABILITAVEL, nunca habilitado.
    const marketplace = await loadMarketplace();
    if (!marketplace.ok || !Array.isArray(marketplace.value)) return { ...base, state: "nao_verificado", reasons: ["MARKETPLACE_QUERY_FAILED"] };
    const matches = marketplace.value
      .filter((item) => typeof item?.id === "string" && item.id !== "" && typeof item.name === "string"
        && normalizeAgentKey(resolveAgentId(item.name)) === key
        && (item.isPublic === true || item.publisherId === tenantId))
      .sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0));
    if (matches.length === 0) return { ...base, state: "indisponivel", reasons: ["NOT_IN_MARKETPLACE"] };
    return { ...base, marketplaceItem: matches[0], state: "habilitavel", reasons: ["NOT_ENABLED_IN_WORKSPACE"] };
  }

  async function resolveOne(need: CapabilityNeed): Promise<DiscoveredCapability> {
    if (!TOKEN.test(need.domain) || !TOKEN.test(need.capability)) return closed(need, "nao_verificado", ["INVALID_NEED"]);
    const providers = listAgentsDeclaringCapability(need.domain, need.capability);
    if (providers.length === 0) return closed(need, "indisponivel", ["NO_DECLARED_PROVIDER"]);

    let best: Evaluation | null = null;
    for (const agentId of providers) {
      const evaluation = await evaluate(agentId);
      if (best === null || RANK[evaluation.state] > RANK[best.state]) best = evaluation;
    }
    if (best === null) return closed(need, "nao_verificado", ["NO_EVALUATION"]);

    const core = await loadCore();
    const coreEntry = core.ok ? core.value.find((item) => normalizeAgentKey(item.id) === normalizeAgentKey(resolveAgentId(best!.agentId))) : undefined;
    const registryEntry = best.catalogEntry ?? coreEntry ?? null;
    const declared = [
      ...getAgentCapabilityDeclarations(best.agentId).map((entry) => entry.label),
      ...asStrings(registryEntry?.chatCopy && "whatIDo" in registryEntry.chatCopy ? registryEntry.chatCopy.whatIDo : []),
    ];
    const provider = {
      agentId: best.agentId,
      name: (registryEntry?.name ?? best.marketplaceItem?.name ?? best.agentId) as string,
      description: (registryEntry?.description ?? best.marketplaceItem?.description ?? null) as string | null,
      declaredCapabilities: Array.from(new Set(declared)).slice(0, 6),
      origin: best.catalogEntry || coreEntry ? ("agent_registry" as const) : ("marketplace" as const),
    };

    let recipes: DiscoveredCapability["recipes"] = { status: "nao_aplicavel", items: [] };
    if (best.state === "habilitado" || best.state === "habilitavel") {
      const loaded = await loadRecipes();
      if (!loaded.ok || !Array.isArray(loaded.value)) {
        recipes = { status: "nao_verificado", items: [] };
      } else {
        const key = normalizeAgentKey(resolveAgentId(best.agentId));
        recipes = {
          status: "ok",
          items: loaded.value
            .filter((row) => row && row.status === "homologated" && !asIso(row.deprecatedAt)
              && typeof row.agentId === "string" && normalizeAgentKey(resolveAgentId(row.agentId)) === key)
            .map((row) => ({
              id: String(row.id),
              title: String(row.title),
              summary: String(row.summary),
              tags: asStrings(row.tags),
              homologatedAt: asIso(row.homologatedAt),
            })),
        };
      }
    }

    let enablement: DiscoveredCapability["enablement"] = null;
    let nextAction: CapabilityNextAction = { kind: "none", actionDomain: null };
    if (best.state === "habilitavel" && best.marketplaceItem) {
      const own = best.marketplaceItem.isPublic !== true;
      enablement = {
        marketplaceItemId: best.marketplaceItem.id,
        visibility: own ? "own_tenant" : "public",
        conditions: [
          "Assinatura governada pelo Marketplace (delegação e política do workspace).",
          "Confirmação humana explícita antes de habilitar.",
          own ? "Item privado do próprio tenant." : "Item público do Marketplace.",
          "Revisões adicionais impostas por política do workspace: não verificadas nesta consulta.",
        ],
      };
      nextAction = {
        kind: "enable_agent",
        actionDomain: "agent_enablement",
        requiresHumanConfirmation: true,
        marketplaceItemId: best.marketplaceItem.id,
        path: MARKETPLACE_PATH,
      };
    } else if (best.state === "habilitado") {
      nextAction = { kind: "request_work", actionDomain: "agent_work", enabled: false, reason: "OPERATIONAL_HANDOFF_NOT_IMPLEMENTED" };
    }

    return { need, state: best.state, reasons: best.reasons, provider, recipes, enablement, nextAction };
  }

  const results: DiscoveredCapability[] = [];
  for (const need of needs) {
    try {
      results.push(await resolveOne(need));
    } catch {
      results.push(closed(need, "nao_verificado", ["DISCOVERY_FAILED"]));
    }
  }
  return results;
}

export async function discoverCapabilityNeed(params: {
  need: CapabilityNeed;
  tenantId: string;
  workspaceId: string;
  client?: PrismaClient;
  readers?: CapabilityDiscoveryReaders;
}): Promise<DiscoveredCapability> {
  const [result] = await discoverCapabilityNeeds({ ...params, needs: [params.need] });
  return result;
}
