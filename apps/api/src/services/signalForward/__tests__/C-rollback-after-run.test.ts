// Cenário C — falha deliberada APÓS createRunRecord real, ANTES do vínculo.
// Confirma: nenhum run órfão, nenhum registro parcial (tudo na mesma tx).
// D6: o Run de destino nasce em confirmHumanConfirmation, não mais em
// forwardSignalToMkt — este cenário move-se para lá, preservando a
// intenção original do teste.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNamedClient,
  seedRealScenario,
  grantScope,
  newTenantWorkspace,
  alwaysAuthorizedSubjectResolver,
  defaultConfirmationDraft,
} from "./helpers";
import { forwardSignalToMkt } from "../signalForwardingService";
import { createConfirmationWindow, saveDraftRevision, confirmHumanConfirmation } from "../humanConfirmationService";

test("rollback após criar o run real, antes do vínculo: nenhum run órfão, nenhuma confirmação concluída parcial", async () => {
  const client = createNamedClient("poc-real-c");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-c");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-c" },
      {},
      client.prisma
    );

    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await saveDraftRevision(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId,
      draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
    });

    await assert.rejects(
      confirmHumanConfirmation(
        client.prisma,
        {
          tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
          humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
          operationKey: "op-c-1", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
        },
        {
          afterRunCreate: async () => {
            throw new Error("forced_failure_after_run_create_before_link");
          },
        }
      ),
      (err: unknown) => (err as Error).message === "forced_failure_after_run_create_before_link"
    );

    const runCount = await client.prisma.run.count({
      where: { tenantId, workspaceId, agent: "mkt" },
    });
    assert.equal(runCount, 0, "o run REAL criado dentro da transação deveria ter sido revertido junto (mesma tx)");

    const confirmationAfter = await client.prisma.humanConfirmation.findUnique({
      where: { id: window.humanConfirmationId },
    });
    assert.equal(confirmationAfter?.status, "awaiting_human_completion", "confirmação não deveria ter sido marcada concluída (rollback)");
    assert.equal(confirmationAfter?.revision, 1, "revisão da edição, feita antes da tentativa de confirmar, é preservada");
    assert.equal(confirmationAfter?.confirmedPayloadSnapshot, null);

    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({
      where: { id: forward.forwardRequestId },
    });
    assert.equal(forwardAfter?.destinationRunId, null);
    assert.equal(forwardAfter?.concludedHumanConfirmationId, null);
    assert.equal(forwardAfter?.activeHumanConfirmationId, window.humanConfirmationId, "janela ainda ativa, confirmável de novo");
  } finally {
    await client.close();
  }
});
