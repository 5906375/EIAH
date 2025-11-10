import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** pricing simples: busca por agente; se não houver, 0 */
export async function estimateCostCents(params: {
  agent: string;
  inputBytes: number;
  tools?: string[];
  workspaceId: string;
}) {
  const pricing = await prisma.pricing.findFirst({
    where: { agent: params.agent, active: true },
  });

  const perRun = pricing?.perRunCents ?? 0;
  const perMB = pricing?.perMBcents ?? 0;
  const mb = Math.ceil(params.inputBytes / (1024 * 1024));

  return perRun + perMB * mb;
}

export async function chargeRun(
  workspaceId: string,
  runId: string,
  costCents: number
) {
  // atualiza consumo mensal
  await prisma.planQuota
    .update({
      where: { projectId: workspaceId },
      data: { monthUsageCents: { increment: costCents } },
    })
    .catch(async () => {
      // cria se não existir
      await prisma.planQuota.create({
        data: {
          projectId: workspaceId,
          softLimitCents: 5000,
          hardLimitCents: 10000,
          monthUsageCents: costCents,
        },
      });
    });

  // anexa custo ao run
  await prisma.run
    .update({ where: { id: runId }, data: { costCents } })
    .catch(() => undefined);

  return { ok: true } as const;
}

export async function getQuota(workspaceId: string) {
  const quota = await prisma.planQuota.findUnique({ where: { projectId: workspaceId } });

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
