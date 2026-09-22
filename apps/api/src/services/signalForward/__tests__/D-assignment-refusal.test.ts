// Cenário D — recusa de atribuição real (agente "mkt" não habilitado no
// workspace). D6: essa checagem (assertWorkspaceAgentEnabled, via
// createRunRecord) não ocorre mais em forwardSignalToMkt — moveu-se para a
// conclusão da confirmação humana (humanConfirmationService.ts,
// confirmHumanConfirmation), que é onde o Run de destino agora é criado.
// Confirma: nenhum run criado, nenhuma confirmação concluída, auditoria de
// recusa preservada FORA da transação revertida (não duplicada).
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

test("encaminhar e abrir janela não exigem atribuição do agente de destino; só a confirmação exige", async () => {
  const client = createNamedClient("poc-real-d");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-d");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, {
      tenantId, workspaceId, mktEnabled: false, // agente MKT NÃO habilitado neste workspace
    });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-d",
    };

    // D6: encaminhar não toca createRunRecord/assertWorkspaceAgentEnabled —
    // prossegue normalmente mesmo com o agente de destino desabilitado.
    const forward = await forwardSignalToMkt(input, {}, client.prisma);
    assert.equal(forward.status, "pending_dispatch");
    assert.equal(forward.destinationRunId, null);

    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await saveDraftRevision(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId, draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
    });

    // Só na conclusão da confirmação (criação real do Run) a atribuição é exigida.
    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-d", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => (err as Error).name === "WorkspaceAgentAssignmentError"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);

    const windowAfter = await client.prisma.humanConfirmation.findUnique({ where: { id: window.humanConfirmationId } });
    assert.equal(windowAfter?.status, "awaiting_human_completion", "confirmação revertida junto — janela continua confirmável de novo");

    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfter?.destinationRunId, null);
    assert.equal(forwardAfter?.concludedHumanConfirmationId, null);

    // Auditoria preservada FORA da transação revertida — reemitida pelo catch externo.
    const auditRows = await client.prisma.guardrailAuditLedger.findMany({
      where: { tenantId, workspaceId, eventType: "signal_forward.agent_assignment_refused" },
    });
    assert.equal(auditRows.length, 1, "exatamente uma linha de auditoria — sem duplicação");
    const metadata = auditRows[0]?.metadata as any;
    assert.equal(metadata?.rolledBack, true, "evidência de que a linha veio do catch externo pós-rollback, não da tentativa interna revertida");
    assert.equal(metadata?.humanConfirmationId, window.humanConfirmationId);
  } finally {
    await client.close();
  }
});
