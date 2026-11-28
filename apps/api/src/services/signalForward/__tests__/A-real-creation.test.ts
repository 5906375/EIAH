// Cenário A — criação autorizada com createRunRecord REAL (não fixture).
// D6: o Run de destino não nasce mais em forwardSignalToMkt — a intenção
// original deste teste (createRunRecord real, assignmentId/agentVersion
// resolvidos de verdade) agora se prova depois de uma confirmação humana
// concluída, seguindo o fluxo completo: encaminhar -> abrir janela ->
// salvar rascunho -> confirmar.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNamedClient,
  seedRealScenario,
  grantScope,
  newTenantWorkspace,
  defaultRadarSignalResult,
  alwaysAuthorizedSubjectResolver,
  defaultConfirmationDraft,
} from "./helpers";
import { forwardSignalToMkt } from "../signalForwardingService";
import { FINGERPRINT_CONTRACT_VERSION } from "../originContract";
import { createConfirmationWindow, saveDraftRevision, confirmHumanConfirmation } from "../humanConfirmationService";

test("encaminhar sem Run, confirmar cria createRunRecord real: atribuição válida, solicitação+run+vínculo persistidos", async () => {
  const client = createNamedClient("poc-real-a");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-a");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-a",
    };

    const result = await forwardSignalToMkt(input, {}, client.prisma);

    // D6: encaminhar não cria Run — aguarda confirmação humana.
    assert.equal(result.reused, false);
    assert.equal(result.status, "pending_dispatch");
    assert.equal(result.destinationRunId, null);

    const forward = await client.prisma.signalForwardRequest.findUnique({
      where: { id: result.forwardRequestId },
    });
    assert.equal(forward?.destinationRunId, null);
    assert.equal(forward?.status, "pending_dispatch");
    assert.equal(forward?.sourceRunId, sourceRunId);
    // fingerprint calculado no servidor (64 hex chars = sha256) — não é o
    // que o chamador forneceria (chamador nem fornece mais esse campo).
    assert.match(forward?.requestFingerprint ?? "", /^[a-f0-9]{64}$/);
    // versão do fingerprint persistida explicitamente pelo servidor, igual à
    // constante realmente usada para calcular requestFingerprint (mesma fonte,
    // originContract.ts) — não derivada de parsing do hash.
    assert.equal(forward?.fingerprintVersion, FINGERPRINT_CONTRACT_VERSION);
    // snapshot da origem preservado, correspondente ao response real do run de origem
    assert.deepEqual(forward?.originSnapshot, defaultRadarSignalResult());

    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: result.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(window.status, "awaiting_human_completion");
    assert.equal(window.revision, 0);

    await saveDraftRevision(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId,
      draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
    });

    const confirmation = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: result.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-a-1", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(confirmation.status, "concluded");
    assert.equal(confirmation.reused, false);
    assert.ok(confirmation.destinationRunId);

    const forwardAfterConfirm = await client.prisma.signalForwardRequest.findUnique({
      where: { id: result.forwardRequestId },
    });
    assert.equal(forwardAfterConfirm?.destinationRunId, confirmation.destinationRunId);
    assert.equal(forwardAfterConfirm?.status, "dispatch_pending");
    assert.equal(forwardAfterConfirm?.concludedHumanConfirmationId, window.humanConfirmationId);
    assert.equal(forwardAfterConfirm?.activeHumanConfirmationId, null);

    // createRunRecord REAL: confirma assignmentId/agentVersion resolvidos de
    // verdade (não nulos), prova de que assertWorkspaceAgentEnabled real rodou.
    const run = await client.prisma.run.findUnique({ where: { id: confirmation.destinationRunId! } });
    assert.equal(run?.agent, "mkt");
    assert.equal(run?.tenantId, tenantId);
    assert.equal(run?.workspaceId, workspaceId);
    assert.ok(run?.assignmentId, "assignmentId deveria estar resolvido pela atribuição real");
    assert.equal(run?.agentVersion, "1.0.0");
    const requestMeta = run?.request as any;
    assert.equal(requestMeta?.metadata?.signalForwardRequestId, result.forwardRequestId);
    assert.equal(requestMeta?.metadata?.humanConfirmationId, window.humanConfirmationId);
    assert.equal(requestMeta?.prompt, "Prompt final revisado pelo humano para a tarefa MKT.");
  } finally {
    await client.close();
  }
});
