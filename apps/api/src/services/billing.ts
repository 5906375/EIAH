import { PrismaClient, prismaGlobal } from "@repo/db";
import { emitRunEvent } from "./runEventEmitter";
import {
  BillingLedgerService,
  QuotaUsageService,
  ensureTenantBillingDefaults,
  isTenantBillingV2ShadowEnabled,
} from "./tenantBilling";

type WorkspaceScope = { tenantId: string; workspaceId: string };

/**
 * Cria o client tenant-aware para qualquer operação de billing.
 * Substitui o prisma global, garantindo isolamento e enforcement via tenantGuard.
 */
function resolveClient(
  tenantId: string,
  workspaceId: string,
  client?: PrismaClient
) {
  return client ?? prismaGlobal;
}

/**
 * Verifica se o workspace pertence ao tenant informado.
 */
async function workspaceBelongsToTenant(
  client: PrismaClient,
  scope: WorkspaceScope
) {
  const workspace = await client.workspace.findUnique({
    where: { id: scope.workspaceId },
    select: { tenantId: true },
  });
  return workspace?.tenantId === scope.tenantId;
}

/**
 * Verifica se o run pertence ao mesmo tenant e workspace.
 */
async function runBelongsToTenantWorkspace(
  client: PrismaClient,
  scope: WorkspaceScope & { runId: string }
) {
  const run = await client.run.findUnique({
    where: { id: scope.runId },
    select: { tenantId: true, workspaceId: true },
  });
  return (
    run?.tenantId === scope.tenantId && run?.workspaceId === scope.workspaceId
  );
}

/**
 * Calcula custo estimado em centavos de um run (baseado em pricing ativo).
 * Multi-tenant seguro: client vem de prismaGlobal.
 */
export async function estimateCostCents(params: {
  agent: string;
  inputBytes: number;
  tools?: string[];
  tenantId: string;
  workspaceId: string;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const allowed = await workspaceBelongsToTenant(client, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!allowed) return null;

  const pricing = await client.pricing.findFirst({
    where: { agent: params.agent, active: true },
  });

  const perRun = pricing?.perRunCents ?? 0;
  const perMB = pricing?.perMBcents ?? 0;
  const mb = Math.ceil(params.inputBytes / (1024 * 1024));

  return perRun + perMB * mb;
}

/**
 * Registra a cobrança de um run e atualiza quota de consumo.
 */
export async function chargeRun(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  costCents: number;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const runInScope = await runBelongsToTenantWorkspace(client, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
  });
  if (!runInScope) return false;

  // Atualiza consumo mensal
  await client.planQuota
    .update({
      where: { projectId: params.workspaceId },
      data: { monthUsageCents: { increment: params.costCents } },
    })
    .catch(async () => {
      // Cria se não existir
      await client.planQuota.create({
        data: {
          projectId: params.workspaceId,
          softLimitCents: 5000,
          hardLimitCents: 10000,
          monthUsageCents: params.costCents,
        },
      });
    });

  // Anexa custo ao run
  await client.run
    .update({
      where: { id: params.runId },
      data: { costCents: params.costCents },
    })
    .catch(() => undefined);

  if (isTenantBillingV2ShadowEnabled()) {
    try {
      await ensureTenantBillingDefaults(client, {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });

      const ledgerService = new BillingLedgerService(client);
      const quotaUsageService = new QuotaUsageService(client);
      const requestId = `run:${params.runId}:debit`;

      const ledger = await ledgerService.insertDebit({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId,
        amountCents: params.costCents,
        currency: "BRL",
        description: "Shadow charge for run execution",
        requestId,
      });

      if (ledger.inserted) {
        const usageSnapshot = await quotaUsageService.incrementFromEvent({
          tenantId: params.tenantId,
          amountCents: params.costCents,
          entryType: "debit",
        });

        await emitRunEvent({
          runId: params.runId,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          type: "billing.usage.updated",
          payload: {
            mode: "shadow",
            ledgerId: ledger.entry.id,
            requestId,
            cycleStart: usageSnapshot.cycle.cycleStart.toISOString(),
            cycleEnd: usageSnapshot.cycle.cycleEnd.toISOString(),
            usage: {
              runs: usageSnapshot.usage.runs,
              costCents: usageSnapshot.usage.costCents,
              tokens: usageSnapshot.usage.tokens,
              storageMb: usageSnapshot.usage.storageMb,
            },
          },
        });
      }
    } catch (error) {
      console.warn("[tenant-billing-shadow] failed to write shadow usage", {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return true;
}

/**
 * Retorna a quota atual de uso (billing) do workspace.
 */
export async function getQuota(params: WorkspaceScope & { prisma?: PrismaClient }) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const allowed = await workspaceBelongsToTenant(client, params);
  if (!allowed) return null;

  const quota = await client.planQuota.findUnique({
    where: { projectId: params.workspaceId },
  });

  if (!quota) {
    return {
      softLimitCents: 0,
      hardLimitCents: 0,
      monthUsageCents: 0,
      percent: 0,
    } as const;
  }

  const percent = quota.hardLimitCents
    ? Math.min(100, (quota.monthUsageCents / quota.hardLimitCents) * 100)
    : 0;

  return {
    softLimitCents: quota.softLimitCents,
    hardLimitCents: quota.hardLimitCents,
    monthUsageCents: quota.monthUsageCents,
    percent,
  };
}
