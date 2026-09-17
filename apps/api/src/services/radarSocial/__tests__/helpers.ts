// Radar Social — helpers de teste (banco descartável). Unidade independente
// de apps/api/src/services/signalForward/__tests__/helpers.ts — não importa
// dali, para não acoplar as duas frentes (regra do pedido: preservar D5/D6
// sem misturar).
import { PrismaClient } from "@repo/db";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomUUID } from "node:crypto";
import type { RadarEntityAccessOutcome, RadarEntityAccessResolver, RadarEntityAccessInput } from "../radarEntityAccessResolver";

const { Pool } = pg;

function baseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (banco descartável exigido para os testes de radarSocial)");
  return url;
}

/** Mesma técnica de apps/api/src/services/signalForward/__tests__/helpers.ts
 * (reimplementada aqui, unidade independente): `new PrismaClient()` sem
 * adapter explícito não é válido nesta configuração (driver adapters) — todo
 * client de teste precisa ser construído com um adapter real. */
export function createNamedClient(applicationName: string) {
  const url = new URL(baseUrl());
  url.searchParams.set("application_name", applicationName);
  const pool = new Pool({ connectionString: url.toString() });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    pool,
    async close() {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

export function newTenantWorkspace(prefix: string) {
  const suffix = `${prefix}-${randomUUID().slice(0, 8)}`;
  return { tenantId: `t-${suffix}`, workspaceId: `w-${suffix}` };
}

/** Cria Tenant, Workspace, User e TenantMembership reais — o mínimo comum
 * exigido por assertRadarSocialOperationAuthorized em toda operação. */
export async function seedTenantWorkspaceUser(
  prisma: PrismaClient,
  opts: { tenantId: string; workspaceId: string; userId?: string }
) {
  const userId = opts.userId ?? `${opts.tenantId}-user`;
  await prisma.tenant.upsert({
    where: { id: opts.tenantId },
    create: { id: opts.tenantId, name: opts.tenantId },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: opts.workspaceId },
    create: { id: opts.workspaceId, tenantId: opts.tenantId, name: opts.workspaceId },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, tenantId: opts.tenantId, email: `${userId}@example.test` },
    update: {},
  });
  await prisma.tenantMembership.upsert({
    where: { id: `${opts.tenantId}-${userId}-membership` },
    create: {
      id: `${opts.tenantId}-${userId}-membership`,
      tenantId: opts.tenantId,
      userId,
      updatedAt: new Date(),
    },
    update: {},
  });
  return { userId };
}

export async function grantScope(
  prisma: PrismaClient,
  opts: { tenantId: string; workspaceId: string; scope: string }
) {
  await prisma.tenantActionPolicy.create({
    data: { tenantId: opts.tenantId, workspaceId: opts.workspaceId, actionName: opts.scope, allowed: true },
  });
}

// --- Substitutos controlados de RadarEntityAccessResolver ------------------
// Implementados EXCLUSIVAMENTE em código de teste (mesma regra de D6): o
// código de produção (radarKnownEntityService.ts/radarMaterialService.ts) só
// conhece a interface, nunca uma implementação-padrão.

export function alwaysAuthorizedResolver(): RadarEntityAccessResolver {
  return async () => "authorized";
}

export function fixedOutcomeResolver(outcome: RadarEntityAccessOutcome): RadarEntityAccessResolver {
  return async () => outcome;
}

/** Resolvedor que nega um conjunto específico de entityIds e autoriza todo
 * o resto — usado para exercitar filtragem individual em listagens sem
 * derrubar a operação inteira. */
export function denyListResolver(deniedEntityIds: readonly string[]): RadarEntityAccessResolver {
  const denied = new Set(deniedEntityIds);
  return async (input) => (denied.has(input.entityId) ? "access_denied" : "authorized");
}

/** Resolvedor "espião": grava cada chamada recebida (ordem e parâmetros) e
 * sempre autoriza — usado para verificar QUE o serviço realmente invoca o
 * resolvedor, com quais entityId/operation, sem depender de side effects
 * observáveis só pelo resultado final. */
export function recordingResolver(): { resolver: RadarEntityAccessResolver; calls: RadarEntityAccessInput[] } {
  const calls: RadarEntityAccessInput[] = [];
  const resolver: RadarEntityAccessResolver = async (input) => {
    calls.push(input);
    return "authorized";
  };
  return { resolver, calls };
}

// --- Helpers da unidade de análise/recomendação (Atualizações 1.11–1.18) --

export async function waitFor(
  check: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number; label: string }
): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`waitFor timeout: ${opts.label}`);
}

/** Mesma técnica já comprovada em signalForward/__tests__/helpers.ts:
 * observa pg_stat_activity por application_name para saber
 * deterministicamente que uma conexão está esperando por uma trava, sem
 * sleeps. */
export async function observeConnectionState(
  observerPool: pg.Pool,
  applicationName: string
): Promise<{ state: string | null; waitEventType: string | null }> {
  const res = await observerPool.query(
    `select state, wait_event_type from pg_stat_activity where application_name = $1`,
    [applicationName]
  );
  if (res.rows.length === 0) return { state: null, waitEventType: null };
  return { state: res.rows[0].state, waitEventType: res.rows[0].wait_event_type };
}

/** Concede os três escopos usados pela unidade de análise/recomendação de
 * uma vez — conveniência de teste, não uma política aprovada. */
export async function grantAnalysisScopes(prisma: PrismaClient, opts: { tenantId: string; workspaceId: string }) {
  await grantScope(prisma, { tenantId: opts.tenantId, workspaceId: opts.workspaceId, scope: "radar_social.read" });
  await grantScope(prisma, { tenantId: opts.tenantId, workspaceId: opts.workspaceId, scope: "radar_social.entities.manage" });
  await grantScope(prisma, { tenantId: opts.tenantId, workspaceId: opts.workspaceId, scope: "radar_social.materials.write" });
  await grantScope(prisma, { tenantId: opts.tenantId, workspaceId: opts.workspaceId, scope: "radar_social.analysis.request" });
  await grantScope(prisma, { tenantId: opts.tenantId, workspaceId: opts.workspaceId, scope: "radar_social.analysis.execute" });
}

/** Cria entidade + material reais (via os serviços já implementados na
 * unidade anterior) para servir de base às análises testadas aqui. */
export async function seedEntityAndMaterial(
  prisma: PrismaClient,
  opts: { tenantId: string; workspaceId: string; userId: string; conteudo?: string }
) {
  const { createRadarKnownEntity } = await import("../radarKnownEntityService");
  const { receiveRadarMaterial } = await import("../radarMaterialService");
  const entity = await createRadarKnownEntity(
    { tenantId: opts.tenantId, workspaceId: opts.workspaceId, actorUserId: opts.userId, input: { displayName: "Entidade de teste — análise" } },
    prisma
  );
  const { material } = await receiveRadarMaterial(
    {
      tenantId: opts.tenantId, workspaceId: opts.workspaceId, actorUserId: opts.userId,
      resolver: alwaysAuthorizedResolver(),
      input: {
        entityId: entity.id,
        conteudo: opts.conteudo ?? "Empresa Fictícia Alfa anunciou abertura de filial em Recife ainda este ano.",
        fonteDeclarada: "fonte de teste",
        operationKey: `mat-op-${randomUUID().slice(0, 8)}`,
      },
    },
    prisma
  );
  return { entity, material };
}

/** generationConfigInput mínimo válido — só o substituto de teste
 * "radar-test-model-v1" é reconhecido (Atualização 1.17/rodada de
 * aprovação). */
export function defaultGenerationConfigInput(overrides: Record<string, unknown> = {}) {
  return {
    requestedModel: "radar-test-model-v1",
    promptTemplateVersion: "radar-analysis-prompt.v1",
    knowledgePolicySnapshot: { llmUsageMode: "grounded_reasoning", provenancePolicy: "required", maskingPolicy: "conditional" },
    ...overrides,
  };
}

/** Candidato de recomendação mínimo válido (mesma forma de
 * preservedResultPayload / RadarRecommendation) — a referência precisa
 * existir literalmente no material de `seedEntityAndMaterial` acima. */
export function defaultRecommendationCandidate(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "radar-recommendation.v1",
    recommendationType: "actionable",
    summary: "Empresa Fictícia Alfa anunciou expansão para Recife.",
    statements: [
      {
        content: "A empresa anunciou abertura de filial em Recife.",
        natureza: "FACT_IN_MATERIAL",
        referenceIds: ["ref-1"],
      },
    ],
    references: [{ id: "ref-1", quote: "abertura de filial em Recife" }],
    suggestedAction: "Avaliar contato comercial com a nova filial.",
    ...overrides,
  };
}

/** Exclusivo de teste: força `claimed_at` de uma tentativa para o passado,
 * sem esperar o TTL real — mesma técnica já usada em D6
 * (`backdateConfirmationWindowExpiry`, humanConfirmation). Nenhum caminho
 * de produção expõe forma de encurtar o prazo de posse. */
export async function backdateAttemptClaim(prisma: PrismaClient, attemptId: string, secondsAgo: number) {
  const { Prisma } = await import("@repo/db");
  await prisma.$executeRaw(Prisma.sql`
    UPDATE radar_analysis_attempts SET claimed_at = clock_timestamp() - (${secondsAgo} || ' seconds')::interval
    WHERE id = ${attemptId}
  `);
}

/** Exclusivo de teste: abre uma transação nomeada, adquire a trava da
 * linha (SELECT ... FOR UPDATE) e a mantém até `release` resolver — usado
 * para observar deterministicamente uma segunda conexão "esperando pela
 * trava" (via pg_stat_activity), sem sleeps. */
export async function holdAttemptRowLock(
  applicationName: string,
  attemptId: string,
  release: Promise<void>
) {
  const client = createNamedClient(applicationName);
  const { Prisma } = await import("@repo/db");
  await client.prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM radar_analysis_attempts WHERE id = ${attemptId} FOR UPDATE`);
    await release;
  });
  await client.close();
}

/** Mesma técnica de `holdAttemptRowLock`, agora sobre `radar_known_entities`
 * — usada para observar deterministicamente uma segunda conexão esperando
 * pelo ponto de serialização único do resolvedor de acesso (Atualização
 * 1.24/1.25), sem sleeps. */
export async function holdEntityRowLock(
  applicationName: string,
  entityId: string,
  release: Promise<void>
) {
  const client = createNamedClient(applicationName);
  const { Prisma } = await import("@repo/db");
  await client.prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM radar_known_entities WHERE id = ${entityId} FOR UPDATE`);
    await release;
  });
  await client.close();
}

/** Fábrica de executor SUBSTITUTO controlado — nunca chama rede/modelo
 * real. `respond` decide o candidato (ou lança, simulando falha do
 * provedor). */
export function fakeExecutor(
  respond: (input: { objective: string; additionalContext: string | null; materialConteudo: string }) => Promise<unknown> | unknown
) {
  const calls: unknown[] = [];
  const executor = async (input: { objective: string; additionalContext: string | null; materialConteudo: string }) => {
    calls.push(input);
    const candidate = await respond(input);
    return {
      candidate,
      provider: "radar-test-provider",
      model: "radar-test-model-v1",
      providerRequestId: `req-${randomUUID().slice(0, 8)}`,
    };
  };
  return { executor, calls };
}
