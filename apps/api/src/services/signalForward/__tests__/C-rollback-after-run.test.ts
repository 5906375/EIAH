// Cenário C — falha deliberada APÓS createRunRecord real, ANTES do vínculo.
// Confirma: nenhum run órfão, nenhuma solicitação parcial (tudo na mesma tx).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt } from "../signalForwardingService.ts";

test("rollback após criar o run real, antes do vínculo: nenhum run órfão, nenhuma solicitação parcial", async () => {
  const client = createNamedClient("poc-real-c");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-c");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-c", requestFingerprint: "fp-c",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {
        afterRunCreate: async () => {
          throw new Error("forced_failure_after_run_create_before_link");
        },
      }, client.prisma),
      (err: unknown) => (err as Error).message === "forced_failure_after_run_create_before_link"
    );

    const requestCount = await client.prisma.signalForwardRequest.count({
      where: { tenantId, workspaceId, idempotencyKey: input.idempotencyKey },
    });
    assert.equal(requestCount, 0, "nenhuma SignalForwardRequest deveria ter sido persistida (rollback)");

    const runCount = await client.prisma.run.count({
      where: { tenantId, workspaceId, agent: "mkt" },
    });
    assert.equal(runCount, 0, "o run REAL criado dentro da transação deveria ter sido revertido junto (mesma tx)");
  } finally {
    await client.close();
  }
});
