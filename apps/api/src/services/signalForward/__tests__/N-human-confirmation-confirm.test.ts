// Cenário N — conclusão da confirmação (D6): conteúdo, autorização,
// idempotência e recuperação. Ver CONSULTATION_ORIGIN_AUTHZ_v2.md seção 22.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNamedClient,
  seedRealScenario,
  grantScope,
  newTenantWorkspace,
  alwaysAuthorizedSubjectResolver,
  fixedOutcomeSubjectResolver,
  defaultConfirmationDraft,
  backdateConfirmationWindowExpiry,
} from "./helpers";
import { forwardSignalToMkt } from "../signalForwardingService";
import { createConfirmationWindow, saveDraftRevision, confirmHumanConfirmation, recoverHumanConfirmation } from "../humanConfirmationService";
import { HumanConfirmationError } from "../humanConfirmationContract";

async function setUpAwaitingConfirmation(prisma: any, tenantId: string, workspaceId: string, userId: string, sourceRunId: string, key: string) {
  const forward = await forwardSignalToMkt(
    { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: key },
    {},
    prisma
  );
  const resolver = alwaysAuthorizedSubjectResolver();
  const window = await createConfirmationWindow(prisma, {
    tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
    confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
  });
  await saveDraftRevision(prisma, {
    tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
    expectedRevision: 0, confirmedIdentity: userId, draft: defaultConfirmationDraft(), subjectAuthorizationResolver: resolver,
  });
  return { forward, window, resolver };
}

test("confirmar: cria exatamente um Run, grava snapshot, marca dispatch_pending", async () => {
  const client = createNamedClient("poc-real-n1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n1");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n1");

    const confirmation = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n1", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(confirmation.status, "concluded");
    assert.equal(confirmation.reused, false);
    assert.ok(confirmation.destinationRunId);

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1);

    const windowRow = await client.prisma.humanConfirmation.findUnique({ where: { id: window.humanConfirmationId } });
    assert.equal(windowRow?.status, "concluded");
    assert.ok(windowRow?.confirmedPayloadSnapshot);
    const snapshot = windowRow?.confirmedPayloadSnapshot as any;
    assert.equal(snapshot.finalPrompt, "Prompt final revisado pelo humano para a tarefa MKT.");
    assert.equal(snapshot.operationKey, "op-n1");

    const forwardRow = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardRow?.status, "dispatch_pending");
    assert.equal(forwardRow?.destinationRunId, confirmation.destinationRunId);
    assert.equal(forwardRow?.concludedHumanConfirmationId, window.humanConfirmationId);
  } finally {
    await client.close();
  }
});

test("confirmar: exige finalPrompt e objective já persistidos (não aceita conteúdo no corpo da confirmação)", async () => {
  const client = createNamedClient("poc-real-n2");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n2");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-n2" },
      {}, client.prisma
    );
    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    // Nenhum rascunho salvo — finalPrompt/objective ainda nulos.

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 0,
        operationKey: "op-n2", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "confirmation_final_prompt_required"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);
  } finally {
    await client.close();
  }
});

test("confirmar: só o requestedByUserId pode confirmar (terceiro é sempre rejeitado)", async () => {
  const client = createNamedClient("poc-real-n3");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n3");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n3");

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n3", confirmedIdentity: "outro-usuario", subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "only_requester_can_act"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);
  } finally {
    await client.close();
  }
});

test("confirmar: bloqueado se a interface de autorização do sujeito recusar (access_denied)", async () => {
  const client = createNamedClient("poc-real-n4");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n4");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n4");

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n4", confirmedIdentity: userId,
        subjectAuthorizationResolver: fixedOutcomeSubjectResolver("access_denied"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_access_denied"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0, "ausência de autorização do sujeito bloqueia confirmação e criação do Run");
  } finally {
    await client.close();
  }
});

test("confirmar: perda de acesso entre revisão e confirmação bloqueia a confirmação", async () => {
  const client = createNamedClient("poc-real-n5");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n5");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n5");

    // No momento da confirmação, o acesso ao sujeito já não existe mais —
    // a checagem, refeita nesse instante, bloqueia mesmo com revisão/TTL ok.
    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n5", confirmedIdentity: userId,
        subjectAuthorizationResolver: fixedOutcomeSubjectResolver("access_denied"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_access_denied"
    );
  } finally {
    await client.close();
  }
});

test("confirmar: TTL vencido rejeita a confirmação (janela não é concluída)", async () => {
  const client = createNamedClient("poc-real-n6");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n6");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n6");
    await backdateConfirmationWindowExpiry(client.prisma, window.humanConfirmationId);

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n6", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "confirmation_window_expired"
    );

    const windowRow = await client.prisma.humanConfirmation.findUnique({ where: { id: window.humanConfirmationId } });
    assert.equal(windowRow?.status, "awaiting_human_completion", "TTL vencido não conclui a janela — ela fica elegível para expirar/reabrir");
    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 0);
  } finally {
    await client.close();
  }
});

test("reenvio idempotente: mesma operationKey e revisão recupera o resultado já persistido, sem criar novo Run", async () => {
  const client = createNamedClient("poc-real-n7");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n7");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n7");

    const first = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n7", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(first.reused, false);

    const second = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n7", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(second.reused, true);
    assert.equal(second.destinationRunId, first.destinationRunId);

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1, "reenvio idempotente não cria um segundo Run");
  } finally {
    await client.close();
  }
});

test("reenvio com operationKey diferente sobre confirmação já concluída é rejeitado como conflito", async () => {
  const client = createNamedClient("poc-real-n8");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n8");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n8");

    await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n8-original", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n8-outra-chave", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "confirmation_operation_key_conflict"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1, "chave diferente sobre confirmação já concluída não cria um segundo Run");
  } finally {
    await client.close();
  }
});

test("recuperar confirmação concluída: autorizado vê o snapshot; sem autorização vigente, erro sem revelar conteúdo", async () => {
  const client = createNamedClient("poc-real-n9");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n9");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n9");
    await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n9", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    const recovered = await recoverHumanConfirmation(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(recovered.status, "concluded");
    assert.ok(recovered.confirmedPayloadSnapshot);
    assert.ok(recovered.destinationRunId);

    await assert.rejects(
      recoverHumanConfirmation(client.prisma, {
        tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
        confirmedIdentity: userId, subjectAuthorizationResolver: fixedOutcomeSubjectResolver("access_denied"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_access_denied"
    );

    await assert.rejects(
      recoverHumanConfirmation(client.prisma, {
        tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
        confirmedIdentity: "outro-usuario", subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "only_requester_can_act"
    );
  } finally {
    await client.close();
  }
});

test("recuperação idempotente mesmo depois do prazo vencido: confirmação já concluída continua recuperável, sem reabrir janela nem criar outro Run", async () => {
  const client = createNamedClient("poc-real-n10");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n10");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n10");
    const confirmed = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n10", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    // O prazo da janela (já concluída) "vencer" depois não desfaz a conclusão.
    await backdateConfirmationWindowExpiry(client.prisma, window.humanConfirmationId);

    const replay = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n10", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.destinationRunId, confirmed.destinationRunId);

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1);
  } finally {
    await client.close();
  }
});

// Regressão (achado da revisão delimitada): o ramo de réplica idempotente de
// confirmHumanConfirmation lia confirmedPayloadSnapshot e devolvia
// destinationRunId sem revalidar a autorização do sujeito (camada 4) —
// violava seção 22.3 ("nenhuma tentativa, nova ou repetida, lê
// confirmedPayloadSnapshot antes da autorização atual ser confirmada") e o
// critério de aceite de 22.10 para recuperação idempotente. Deliberadamente
// NÃO usa recoverHumanConfirmation — esse caminho já revalidava corretamente;
// o defeito era exclusivo do reenvio via confirmHumanConfirmation.
test("[regressão] reenvio de confirmação já concluída via confirmHumanConfirmation revalida a autorização do sujeito: access_denied bloqueia, sem devolver o resultado protegido", async () => {
  const client = createNamedClient("poc-real-n11");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n11");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n11");

    const confirmed = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n11", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(confirmed.reused, false);

    // Acesso ao sujeito perdido entre a conclusão original e o reenvio — a
    // MESMA operationKey é reenviada pelo MESMO caminho (confirmHumanConfirmation),
    // não por recoverHumanConfirmation.
    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n11", confirmedIdentity: userId,
        subjectAuthorizationResolver: fixedOutcomeSubjectResolver("access_denied"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_access_denied"
    );

    // Nenhum Run novo; registros existentes inalterados pelo reenvio recusado.
    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1, "nenhum novo Run criado pelo reenvio recusado");

    const windowAfter = await client.prisma.humanConfirmation.findUnique({ where: { id: window.humanConfirmationId } });
    assert.equal(windowAfter?.status, "concluded");
    assert.equal((windowAfter?.confirmedPayloadSnapshot as any)?.operationKey, "op-n11", "snapshot concluído original inalterado");

    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfter?.destinationRunId, confirmed.destinationRunId, "destinationRunId do encaminhamento inalterado");
    assert.equal(forwardAfter?.concludedHumanConfirmationId, window.humanConfirmationId);
  } finally {
    await client.close();
  }
});

test("reenvio via confirmHumanConfirmation: resolvedor ausente (resolver_unavailable) bloqueia, mesmo com confirmação já concluída", async () => {
  const client = createNamedClient("poc-real-n12");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n12");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n12");
    const confirmed = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n12", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n12", confirmedIdentity: userId,
        subjectAuthorizationResolver: fixedOutcomeSubjectResolver("resolver_unavailable"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_resolver_unavailable"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1);
    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfter?.destinationRunId, confirmed.destinationRunId);
  } finally {
    await client.close();
  }
});

test("reenvio via confirmHumanConfirmation: resolvedor que falha (resolution_failed) bloqueia, mesmo com confirmação já concluída", async () => {
  const client = createNamedClient("poc-real-n13");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-n13");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const { forward, window, resolver } = await setUpAwaitingConfirmation(client.prisma, tenantId, workspaceId, userId, sourceRunId, "key-n13");
    const confirmed = await confirmHumanConfirmation(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
      operationKey: "op-n13", confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await assert.rejects(
      confirmHumanConfirmation(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window.humanConfirmationId, expectedRevision: 1,
        operationKey: "op-n13", confirmedIdentity: userId,
        subjectAuthorizationResolver: fixedOutcomeSubjectResolver("resolution_failed"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_resolution_failed"
    );

    const runCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt" } });
    assert.equal(runCount, 1);
    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfter?.destinationRunId, confirmed.destinationRunId);
  } finally {
    await client.close();
  }
});

// Caso "autorizado" do reenvio via confirmHumanConfirmation já é coberto por
// N7 ("reenvio idempotente... sem criar novo Run") e N10 ("recuperação
// idempotente mesmo depois do prazo vencido") acima — reutilizados, não
// duplicados aqui.
