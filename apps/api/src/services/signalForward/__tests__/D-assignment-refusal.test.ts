// Cenário D — recusa de atribuição real (agente "mkt" não habilitado no
// workspace). Confirma: nenhum run criado, nenhuma solicitação parcial,
// auditoria de recusa preservada FORA da transação revertida (não duplicada).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt } from "../signalForwardingService.ts";

test("recusa de atribuição real: sem run, sem solicitação parcial, auditoria preservada", async () => {
  const client = createNamedClient("poc-real-d");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-d");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, {
      tenantId, workspaceId, mktEnabled: false, // agente MKT NÃO habilitado neste workspace
    });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-d", requestFingerprint: "fp-d",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => (err as Error).name === "WorkspaceAgentAssignmentError"
    );

    const requestCount = await client.prisma.signalForwardRequest.count({
      where: { tenantId, workspaceId, idempotencyKey: input.idempotencyKey },
    });
    assert.equal(requestCount, 0, "nenhuma solicitação parcial — a tx inteira reverteu, incluindo o insert inicial");

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);

    // Auditoria preservada FORA da transação revertida — reemitida pelo catch externo.
    const auditRows = await client.prisma.guardrailAuditLedger.findMany({
      where: { tenantId, workspaceId, eventType: "signal_forward.agent_assignment_refused" },
    });
    assert.equal(auditRows.length, 1, "exatamente uma linha de auditoria — sem duplicação");
    const metadata = auditRows[0]?.metadata as any;
    assert.equal(metadata?.rolledBack, true, "evidência de que a linha veio do catch externo pós-rollback, não da tentativa interna revertida");
  } finally {
    await client.close();
  }
});
