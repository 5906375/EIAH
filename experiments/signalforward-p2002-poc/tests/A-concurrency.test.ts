// Cenário A — concorrência real, mesma chave e mesmo fingerprint.
// Prova de disputa real pelo índice único via observação de pg_stat_activity,
// NÃO via Promise.all/atrasos isolados.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createNamedClient, waitFor, observeConnectionState, resetFixturesForTenant } from "./helpers.ts";
import { forwardSignalToMkt } from "../service.ts";

test("concorrência real: duas transações disputam a mesma chave idempotente", async () => {
  const clientA = createNamedClient("poc-tx-a");
  const clientB = createNamedClient("poc-tx-b");
  const observerPool = new pg.Pool({ connectionString: process.env.POC_DATABASE_URL });

  try {
    await resetFixturesForTenant(clientA.prisma, "poc-tenant-conc");

    const input = {
      tenantId: "poc-tenant-conc",
      workspaceId: "poc-workspace-conc",
      requestedByUserId: "poc-user-1",
      sourceRunId: "poc-source-run-conc",
      destinationAgent: "mkt",
      idempotencyKey: "poc-key-concurrent",
      requestFingerprint: "poc-fp-concurrent",
    };

    let releaseA: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    // Dispara A e segura a transação aberta logo após o insert (via hook de teste).
    const promiseA = forwardSignalToMkt(clientA.prisma, input, {
      afterInsert: () => gate,
    });

    // Prova de disputa real, passo 1: A deve estar com a transação aberta e
    // NÃO commitada (idle in transaction) antes de B começar.
    await waitFor(
      async () => {
        const state = await observeConnectionState(observerPool, "poc-tx-a");
        return state.state === "idle in transaction";
      },
      { timeoutMs: 3000, intervalMs: 25, label: "A deveria estar 'idle in transaction' após o insert" }
    );

    // Dispara B com a MESMA chave e o MESMO fingerprint.
    const promiseB = forwardSignalToMkt(clientB.prisma, input);

    // Prova de disputa real, passo 2: B deve ficar BLOQUEADA aguardando o lock
    // do índice único que A ainda não liberou (não commitou nem fez rollback).
    await waitFor(
      async () => {
        const state = await observeConnectionState(observerPool, "poc-tx-b");
        return state.waitEventType === "Lock";
      },
      { timeoutMs: 3000, intervalMs: 25, label: "B deveria estar bloqueada (wait_event_type=Lock) disputando o índice único" }
    );

    // Só agora liberamos A — a releitura de B (se ocorrer) só pode acontecer
    // depois que a transação que falhou (a de B) for encerrada pelo Postgres,
    // o que só ocorre depois que A commita e o Postgres resolve o conflito.
    releaseA!();

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    // Exatamente uma solicitação criou (reused:false) e a outra reutilizou (reused:true).
    const results = [resultA, resultB];
    const created = results.filter((r) => r.reused === false);
    const reused = results.filter((r) => r.reused === true);
    assert.equal(created.length, 1, "exatamente uma chamada deveria criar (reused:false)");
    assert.equal(reused.length, 1, "exatamente uma chamada deveria reutilizar (reused:true)");

    // Mesmo destinationRunId nos dois retornos.
    assert.equal(resultA.destinationRunId, resultB.destinationRunId);
    assert.ok(resultA.destinationRunId, "destinationRunId não deveria ser nulo");

    // Exatamente uma SignalForwardRequest e exatamente um RunFixture — sem run órfão.
    const requestCount = await clientA.prisma.signalForwardRequest.count({
      where: { tenantId: input.tenantId, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
    });
    assert.equal(requestCount, 1, "deveria existir exatamente 1 SignalForwardRequest");

    const runCount = await clientA.prisma.runFixture.count({
      where: { tenantId: input.tenantId, workspaceId: input.workspaceId },
    });
    assert.equal(runCount, 1, "deveria existir exatamente 1 RunFixture — nenhum run órfão da tentativa que falhou");
  } finally {
    await clientA.close();
    await clientB.close();
    await observerPool.end();
  }
});
