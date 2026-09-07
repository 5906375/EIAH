// Cenário B — concorrência real com a cadeia REAL (createRunRecord real).
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createNamedClient, waitFor, observeConnectionState, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt } from "../signalForwardingService.ts";

test("concorrência real (cadeia real): duas transações disputam a mesma chave idempotente", async () => {
  const clientA = createNamedClient("poc-real-b-a");
  const clientB = createNamedClient("poc-real-b-b");
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-b");
    const { userId, sourceRunId } = await seedRealScenario(clientA.prisma, { tenantId, workspaceId });
    await grantScope(clientA.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-concurrent", requestFingerprint: "fp-concurrent",
    };

    let releaseA: () => void;
    const gate = new Promise<void>((resolve) => { releaseA = resolve; });

    const promiseA = forwardSignalToMkt(input, { afterInsert: () => gate }, clientA.prisma);

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-b-a");
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "A idle in transaction" });

    const promiseB = forwardSignalToMkt(input, {}, clientB.prisma);

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-b-b");
      return s.waitEventType === "Lock";
    }, { timeoutMs: 3000, intervalMs: 25, label: "B bloqueada disputando o índice único" });

    releaseA!();

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    const results = [resultA, resultB];
    assert.equal(results.filter((r) => r.reused === false).length, 1);
    assert.equal(results.filter((r) => r.reused === true).length, 1);
    assert.equal(resultA.destinationRunId, resultB.destinationRunId);
    assert.ok(resultA.destinationRunId);

    const requestCount = await clientA.prisma.signalForwardRequest.count({
      where: { tenantId, workspaceId, idempotencyKey: input.idempotencyKey },
    });
    assert.equal(requestCount, 1);

    const runCount = await clientA.prisma.run.count({
      where: { tenantId, workspaceId, agent: "mkt" },
    });
    assert.equal(runCount, 1, "nenhum run órfão da tentativa que perdeu a corrida");
  } finally {
    await clientA.close();
    await clientB.close();
    await observerPool.end();
  }
});
