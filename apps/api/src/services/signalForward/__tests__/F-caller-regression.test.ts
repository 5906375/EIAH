// Cenário F — regressão dos chamadores: createRunRecord/assertWorkspaceAgentEnabled
// continuam funcionando para chamadores que passam PrismaClient normal (sem tx),
// exatamente como antes da adaptação. A verificação de tipos (7 call sites reais
// de createRunRecord + 11 call sites reais de recordGuardrailAudit) já foi feita
// via `tsc -p tsconfig.build.json --noEmit` (0 erros) — ver relatório da entrega.
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, newTenantWorkspace } from "./helpers.ts";
import { createRunRecord } from "../../runs.ts";

test("createRunRecord continua funcionando normalmente com PrismaClient puro (sem transação)", async () => {
  const client = createNamedClient("poc-real-f");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-f");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });

    // Chamada direta, sem passar por signalForwardingService nem por $transaction —
    // mesmo padrão usado pelos 7 call sites reais preexistentes (routes/runs.ts,
    // routes/agents.ts, routes/imob.ts, routes/shadow-executions.ts).
    const run = await createRunRecord({
      prisma: client.prisma,
      tenantId, workspaceId, userId,
      agent: "mkt", status: "success",
      request: { metadata: { direct: true } },
    });

    assert.equal(run.agent, "mkt");
    assert.equal(run.status, "success");
    assert.ok(run.assignmentId);
  } finally {
    await client.close();
  }
});

test("createRunRecord sem client explícito usa prismaGlobal (fallback preexistente, sem mudança)", async () => {
  const { PrismaClient, prismaGlobal } = await import("@repo/db");
  const { tenantId, workspaceId } = newTenantWorkspace("real-f-global");
  const { userId } = await seedRealScenario(prismaGlobal as InstanceType<typeof PrismaClient>, { tenantId, workspaceId });

  const run = await createRunRecord({
    tenantId, workspaceId, userId,
    agent: "mkt", status: "success",
    request: { metadata: { viaGlobal: true } },
  });
  assert.equal(run.agent, "mkt");
});
