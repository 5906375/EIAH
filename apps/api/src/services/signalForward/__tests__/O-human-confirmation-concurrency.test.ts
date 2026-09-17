// Cenário O — protocolo de concorrência de D6 (seção 22.2/22.2.1/22.2.2):
// duas criações, duas reaberturas, edição vs confirmação, cancelamento vs
// confirmação, duas confirmações. Coordenação por barreiras reais (hooks +
// pg_stat_activity), nunca por sleep/atraso arbitrário — mesmo padrão já
// usado em B-concurrency.test.ts. Rollback sem Run órfão já coberto em
// C-rollback-after-run.test.ts — não duplicado aqui.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  createNamedClient,
  waitFor,
  observeConnectionState,
  seedRealScenario,
  grantScope,
  newTenantWorkspace,
  alwaysAuthorizedSubjectResolver,
  defaultConfirmationDraft,
} from "./helpers";
import { forwardSignalToMkt } from "../signalForwardingService";
import { createConfirmationWindow, saveDraftRevision, closeConfirmationWindow, confirmHumanConfirmation } from "../humanConfirmationService";
import { HumanConfirmationError } from "../humanConfirmationContract";

test("duas criações de janela concorrentes: só uma sobrevive, nenhum registro órfão", async () => {
  const clientA = createNamedClient("poc-real-o-a1");
  const clientB = createNamedClient("poc-real-o-b1");
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-o1");
    const { userId, sourceRunId } = await seedRealScenario(clientA.prisma, { tenantId, workspaceId });
    await grantScope(clientA.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-o1" },
      {}, clientA.prisma
    );
    const resolver = alwaysAuthorizedSubjectResolver();

    let releaseA: () => void;
    const gate = new Promise<void>((resolve) => { releaseA = resolve; });

    const promiseA = createConfirmationWindow(
      clientA.prisma,
      { tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver },
      { afterLockAcquired: () => gate }
    );

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-o-a1");
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "A idle in transaction (janela)" });

    const promiseB = createConfirmationWindow(clientB.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-o-b1");
      return s.waitEventType === "Lock";
    }, { timeoutMs: 3000, intervalMs: 25, label: "B bloqueada disputando a trava de SignalForwardRequest" });

    releaseA!();

    const results = await Promise.allSettled([promiseA, promiseB]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exatamente uma das duas criações deve ter sucesso");
    assert.equal(rejected.length, 1);
    assert.match(String((rejected[0] as PromiseRejectedResult).reason), /active_confirmation_window_already_exists/);

    const count = await clientA.prisma.humanConfirmation.count({ where: { signalForwardRequestId: forward.forwardRequestId } });
    assert.equal(count, 1, "nenhuma janela órfã da tentativa que perdeu a corrida");
  } finally {
    await clientA.close();
    await clientB.close();
    await observerPool.end();
  }
});

test("duas reaberturas concorrentes após cancelamento: só uma janela ativa resulta", async () => {
  const clientA = createNamedClient("poc-real-o-a2");
  const clientB = createNamedClient("poc-real-o-b2");
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-o2");
    const { userId, sourceRunId } = await seedRealScenario(clientA.prisma, { tenantId, workspaceId });
    await grantScope(clientA.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-o2" },
      {}, clientA.prisma
    );
    const resolver = alwaysAuthorizedSubjectResolver();
    const window1 = await createConfirmationWindow(clientA.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await closeConfirmationWindow(clientA.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window1.humanConfirmationId, reason: "cancelled_by_human", confirmedIdentity: userId,
    });

    let releaseA: () => void;
    const gate = new Promise<void>((resolve) => { releaseA = resolve; });

    const promiseA = createConfirmationWindow(
      clientA.prisma,
      { tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver },
      { afterLockAcquired: () => gate }
    );

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-o-a2");
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "A idle in transaction (reabertura)" });

    const promiseB = createConfirmationWindow(clientB.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-o-b2");
      return s.waitEventType === "Lock";
    }, { timeoutMs: 3000, intervalMs: 25, label: "B bloqueada disputando a reabertura" });

    releaseA!();

    const results = await Promise.allSettled([promiseA, promiseB]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);

    const activeCount = await clientA.prisma.humanConfirmation.count({
      where: { signalForwardRequestId: forward.forwardRequestId, status: "awaiting_human_completion" },
    });
    assert.equal(activeCount, 1, "só uma janela ativa deve resultar, mesmo com duas reaberturas concorrentes");
  } finally {
    await clientA.close();
    await clientB.close();
    await observerPool.end();
  }
});

test("edição concorrente com confirmação: quem commita primeiro invalida a condição da outra (representativo, sequencial)", async () => {
  const client = createNamedClient("poc-real-o3");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-o3");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-o3" },
      {}, client.prisma
    );
    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await saveDraftRevision(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId, draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
    });

    // A edição "vence" (já commitou, revision=1) antes da tentativa de
    // confirmar chegar, que ainda acredita estar na revisão 0.
    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 0,
        operationKey: "op-o3", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "confirmation_revision_conflict"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);
  } finally {
    await client.close();
  }
});

test("cancelamento concorrente com confirmação: cancelamento vence, tentativa de confirmar sobre janela já cancelada é rejeitada (representativo, sequencial)", async () => {
  const client = createNamedClient("poc-real-o4");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-o4");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-o4" },
      {}, client.prisma
    );
    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await saveDraftRevision(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId, draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
    });

    await closeConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, reason: "cancelled_by_human", confirmedIdentity: userId,
    });

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-o4", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "stale_confirmation_window"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);
  } finally {
    await client.close();
  }
});

test("duas confirmações concorrentes (chaves de operação diferentes): exatamente um Run criado", async () => {
  const clientA = createNamedClient("poc-real-o-a5");
  const clientB = createNamedClient("poc-real-o-b5");
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-o5");
    const { userId, sourceRunId } = await seedRealScenario(clientA.prisma, { tenantId, workspaceId });
    await grantScope(clientA.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-o5" },
      {}, clientA.prisma
    );
    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(clientA.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId, confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await saveDraftRevision(clientA.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId, draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
    });

    let releaseA: () => void;
    const gate = new Promise<void>((resolve) => { releaseA = resolve; });

    const promiseA = confirmHumanConfirmation(
      clientA.prisma,
      {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-o5-a", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      },
      { afterLockAcquired: () => gate }
    );

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-o-a5");
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "A idle in transaction (confirmar)" });

    const promiseB = confirmHumanConfirmation(clientB.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-o5-b", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, "poc-real-o-b5");
      return s.waitEventType === "Lock";
    }, { timeoutMs: 3000, intervalMs: 25, label: "B bloqueada disputando a confirmação" });

    releaseA!();

    const results = await Promise.allSettled([promiseA, promiseB]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exatamente uma confirmação com chave diferente deve ter sucesso");
    assert.equal(rejected.length, 1);
    assert.match(String((rejected[0] as PromiseRejectedResult).reason), /confirmation_operation_key_conflict|stale_confirmation_window/);

    const runCount = await clientA.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1, "exatamente um Run, mesmo sob duas tentativas concorrentes de confirmar");
  } finally {
    await clientA.close();
    await clientB.close();
    await observerPool.end();
  }
});
