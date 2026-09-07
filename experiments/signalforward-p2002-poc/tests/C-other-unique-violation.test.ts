// Cenário C — outra violação de unicidade REAL (não sintética), provocada em
// fixture experimental distinta (OtherUniqueFixture). Reutiliza literalmente
// dispatchAfterTransactionError (o mesmo código de decisão de forwardSignalToMkt),
// não uma cópia. Confirma: recuperação NÃO é iniciada, erro original preservado,
// gravações da tentativa são revertidas (rollback).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, resetFixturesForTenant } from "./helpers.ts";
import { dispatchAfterTransactionError, ConflictError, SignalForwardInconsistencyError } from "../service.ts";
import type { Prisma } from "../prisma/generated/client/client.ts";

test("outra violação de unicidade real (OtherUniqueFixture) não é convertida em reuso", async () => {
  const client = createNamedClient("poc-tx-other-unique");
  try {
    await resetFixturesForTenant(client.prisma, "poc-tenant-other");

    const tenantId = "poc-tenant-other";
    const externalRef = "poc-ext-ref-conflict";

    await client.prisma.otherUniqueFixture.create({ data: { tenantId, externalRef } });

    const input = {
      tenantId,
      workspaceId: "poc-workspace-other",
      requestedByUserId: "poc-user-1",
      sourceRunId: "poc-source-run-other",
      destinationAgent: "mkt",
      idempotencyKey: "poc-key-other-unique",
      requestFingerprint: "poc-fp-other-unique",
    };

    let caughtError: unknown;
    try {
      // Transação deliberadamente análoga a forwardSignalToMkt, mas que
      // provoca uma violação de unicidade NÃO relacionada à chave idempotente
      // (na fixture OtherUniqueFixture), dentro da mesma transação.
      await client.prisma.$transaction(async (tx) => {
        await tx.signalForwardRequest.create({
          data: {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            sourceRunId: input.sourceRunId,
            destinationAgent: input.destinationAgent,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            requestedByUserId: input.requestedByUserId,
            status: "pending_dispatch",
          },
        });

        // Provoca a violação REAL, em outra constraint.
        await tx.otherUniqueFixture.create({ data: { tenantId, externalRef } });
      });
      assert.fail("deveria ter lançado uma violação de unicidade real");
    } catch (e) {
      try {
        // Reutiliza o MESMO código de decisão de forwardSignalToMkt.
        await dispatchAfterTransactionError(client.prisma, input, e);
        assert.fail("dispatchAfterTransactionError não deveria retornar sucesso para outra violação");
      } catch (dispatched) {
        caughtError = dispatched;
      }
    }

    assert.ok(caughtError, "um erro deveria ter sido relançado");
    assert.ok(
      !(caughtError instanceof ConflictError) && !(caughtError instanceof SignalForwardInconsistencyError),
      "o erro relançado deve ser o erro original do Postgres/Prisma, não um erro de recuperação"
    );
    const typed = caughtError as Prisma.PrismaClientKnownRequestError;
    assert.equal(typed.code, "P2002");
    assert.equal((typed.meta as Record<string, unknown>)?.modelName, "OtherUniqueFixture");

    // Rollback: nenhuma SignalForwardRequest da tentativa deveria ter sido persistida.
    const count = await client.prisma.signalForwardRequest.count({
      where: { tenantId: input.tenantId, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
    });
    assert.equal(count, 0, "a gravação da tentativa deveria ter sido revertida (rollback)");
  } finally {
    await client.close();
  }
});
