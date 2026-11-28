// Cenário M — ciclo de vida da janela de confirmação (D6): abrir, editar,
// cancelar/expirar, reabrir. Ver CONSULTATION_ORIGIN_AUTHZ_v2.md seção 22.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNamedClient,
  seedRealScenario,
  createOriginRun,
  grantScope,
  newTenantWorkspace,
  alwaysAuthorizedSubjectResolver,
  fixedOutcomeSubjectResolver,
  defaultConfirmationDraft,
  backdateConfirmationWindowExpiry,
} from "./helpers";
import { forwardSignalToMkt } from "../signalForwardingService";
import {
  createConfirmationWindow,
  saveDraftRevision,
  closeConfirmationWindow,
  confirmHumanConfirmation,
} from "../humanConfirmationService";
import { HumanConfirmationError } from "../humanConfirmationContract";

async function encaminhar(prisma: any, opts: { tenantId: string; workspaceId: string; userId: string; sourceRunId: string; key: string }) {
  return forwardSignalToMkt(
    { tenantId: opts.tenantId, workspaceId: opts.workspaceId, requestedByUserId: opts.userId, sourceRunId: opts.sourceRunId, destinationAgent: "mkt", idempotencyKey: opts.key },
    {},
    prisma
  );
}

test("abrir janela: cria HumanConfirmation awaiting_human_completion e guarda o ponteiro no encaminhamento", async () => {
  const client = createNamedClient("poc-real-m1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m1");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m1" });

    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    assert.equal(window.status, "awaiting_human_completion");
    assert.equal(window.revision, 0);
    assert.ok(window.suggestedPrompt.length > 0);

    const forwardRow = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardRow?.activeHumanConfirmationId, window.humanConfirmationId);
    assert.equal(forwardRow?.concludedHumanConfirmationId, null);
  } finally {
    await client.close();
  }
});

test("abrir janela: só o requestedByUserId pode abrir", async () => {
  const client = createNamedClient("poc-real-m2");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m2");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m2" });

    await assert.rejects(
      createConfirmationWindow(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        confirmedIdentity: "outro-usuario", subjectAuthorizationResolver: alwaysAuthorizedSubjectResolver(),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "only_requester_can_act"
    );
  } finally {
    await client.close();
  }
});

test("abrir janela: segunda tentativa enquanto há janela ativa é rejeitada", async () => {
  const client = createNamedClient("poc-real-m3");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m3");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m3" });
    const resolver = alwaysAuthorizedSubjectResolver();

    await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    await assert.rejects(
      createConfirmationWindow(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "active_confirmation_window_already_exists"
    );

    const count = await client.prisma.humanConfirmation.count({ where: { signalForwardRequestId: forward.forwardRequestId } });
    assert.equal(count, 1, "a segunda tentativa não deve deixar um registro órfão");
  } finally {
    await client.close();
  }
});

test("abrir janela: bloqueada se ausência de resolução do sujeito (resolver_unavailable)", async () => {
  const client = createNamedClient("poc-real-m4");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m4");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m4" });

    await assert.rejects(
      createConfirmationWindow(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        confirmedIdentity: userId, subjectAuthorizationResolver: fixedOutcomeSubjectResolver("resolver_unavailable"),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "subject_authorization_resolver_unavailable"
    );

    const count = await client.prisma.humanConfirmation.count({ where: { signalForwardRequestId: forward.forwardRequestId } });
    assert.equal(count, 0, "nenhuma janela deve ser criada quando o sujeito não pôde ser autorizado");
  } finally {
    await client.close();
  }
});

test("abrir janela: bloqueada sobre encaminhamento legado com Run e sem confirmação", async () => {
  const client = createNamedClient("poc-real-m5");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m5");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m5" });

    // Simula um encaminhamento anterior a D6: destinationRunId preenchido
    // diretamente (nunca via humanConfirmationService), sem confirmação.
    const legacyRun = await client.prisma.run.create({
      data: { tenantId, workspaceId, agent: "mkt", status: "pending", request: { legacy: true } },
    });
    await client.prisma.signalForwardRequest.update({
      where: { id: forward.forwardRequestId },
      data: { destinationRunId: legacyRun.id, status: "run_created" },
    });

    await assert.rejects(
      createConfirmationWindow(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        confirmedIdentity: userId, subjectAuthorizationResolver: alwaysAuthorizedSubjectResolver(),
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "legacy_run_without_human_confirmation"
    );
  } finally {
    await client.close();
  }
});

test("salvar revisão: incrementa revision e persiste os campos; revisão desatualizada é rejeitada sem sobrescrita", async () => {
  const client = createNamedClient("poc-real-m6");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m6");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m6" });
    const resolver = alwaysAuthorizedSubjectResolver();
    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    const saved = await saveDraftRevision(client.prisma, {
      tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
      expectedRevision: 0, confirmedIdentity: userId,
      draft: defaultConfirmationDraft({ audience: "Leads B2B" }), subjectAuthorizationResolver: resolver,
    });
    assert.equal(saved.revision, 1);

    // Revisão desatualizada (ainda 0) — rejeitada, sem sobrescrever revision=1.
    await assert.rejects(
      saveDraftRevision(client.prisma, {
        tenantId, workspaceId, humanConfirmationId: window.humanConfirmationId,
        expectedRevision: 0, confirmedIdentity: userId,
        draft: defaultConfirmationDraft({ audience: "OUTRA audiencia, não deveria persistir" }), subjectAuthorizationResolver: resolver,
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "confirmation_revision_conflict"
    );

    const row = await client.prisma.humanConfirmation.findUnique({ where: { id: window.humanConfirmationId } });
    assert.equal(row?.revision, 1);
    assert.equal(row?.draftAudience, "Leads B2B", "conteúdo da tentativa com revisão desatualizada não deve sobrescrever");
  } finally {
    await client.close();
  }
});

test("cancelar janela: transiciona para cancelled_by_human e libera o ponteiro; nova janela pode ser aberta em seguida", async () => {
  const client = createNamedClient("poc-real-m7");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m7");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m7" });
    const resolver = alwaysAuthorizedSubjectResolver();
    const window1 = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    const closed = await closeConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window1.humanConfirmationId, reason: "cancelled_by_human", confirmedIdentity: userId,
    });
    assert.equal(closed.status, "cancelled_by_human");

    const forwardAfterCancel = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfterCancel?.activeHumanConfirmationId, null);

    // Reabertura: nova janela, revision=0, sem resquício da anterior.
    const window2 = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.notEqual(window2.humanConfirmationId, window1.humanConfirmationId);
    assert.equal(window2.status, "awaiting_human_completion");
    assert.equal(window2.revision, 0);

    const forwardAfterReopen = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfterReopen?.activeHumanConfirmationId, window2.humanConfirmationId);

    const window1After = await client.prisma.humanConfirmation.findUnique({ where: { id: window1.humanConfirmationId } });
    assert.equal(window1After?.status, "cancelled_by_human", "janela anterior preservada como histórico, nunca sobrescrita");
  } finally {
    await client.close();
  }
});

test("expirar janela (TTL vencido): transiciona para expired e permite reabertura", async () => {
  const client = createNamedClient("poc-real-m8");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m8");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m8" });
    const resolver = alwaysAuthorizedSubjectResolver();
    const window1 = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await backdateConfirmationWindowExpiry(client.prisma, window1.humanConfirmationId);

    const closed = await closeConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window1.humanConfirmationId, reason: "expired",
    });
    assert.equal(closed.status, "expired");

    const window2 = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    assert.equal(window2.status, "awaiting_human_completion");
    assert.equal(window2.revision, 0);
  } finally {
    await client.close();
  }
});

test("operação atrasada: cancelar/expirar a janela antiga depois que uma nova já existe não tem efeito sobre a janela nova", async () => {
  const client = createNamedClient("poc-real-m9");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m9");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m9" });
    const resolver = alwaysAuthorizedSubjectResolver();

    const window1 = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });
    await closeConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      humanConfirmationId: window1.humanConfirmationId, reason: "cancelled_by_human", confirmedIdentity: userId,
    });
    const window2 = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: resolver,
    });

    // Operação atrasada: tenta expirar a janela1, que já não é mais a ativa.
    await assert.rejects(
      closeConfirmationWindow(client.prisma, {
        tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
        humanConfirmationId: window1.humanConfirmationId, reason: "expired",
      }),
      (err: unknown) => err instanceof HumanConfirmationError && err.reasonCode === "stale_confirmation_window"
    );

    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({ where: { id: forward.forwardRequestId } });
    assert.equal(forwardAfter?.activeHumanConfirmationId, window2.humanConfirmationId, "janela nova não afetada pela operação atrasada sobre a antiga");
    const window2After = await client.prisma.humanConfirmation.findUnique({ where: { id: window2.humanConfirmationId } });
    assert.equal(window2After?.status, "awaiting_human_completion");
  } finally {
    await client.close();
  }
});

test("preservação de D5: subject.subjectId fictício continua passando na validação estrutural (D6 não resolve o sujeito)", async () => {
  const client = createNamedClient("poc-real-m10");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-m10");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const sourceRunId = await createOriginRun(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });
    const forward = await encaminhar(client.prisma, { tenantId, workspaceId, userId, sourceRunId, key: "key-m10" });

    const window = await createConfirmationWindow(client.prisma, {
      tenantId, workspaceId, signalForwardRequestId: forward.forwardRequestId,
      confirmedIdentity: userId, subjectAuthorizationResolver: alwaysAuthorizedSubjectResolver(),
    });
    assert.equal(window.status, "awaiting_human_completion");
  } finally {
    await client.close();
  }
});
