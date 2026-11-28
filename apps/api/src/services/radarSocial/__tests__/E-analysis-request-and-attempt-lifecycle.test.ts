// Cenário E — RadarAnalysisRequest e criação/recuperação idempotente de
// RadarAnalysisAttempt por attemptOperationKey, contra Postgres real
// descartável. Nenhuma chamada real a modelo — nenhum executor é invocado
// neste arquivo (só criação/recuperação de registros).
import test from "node:test";
import assert from "node:assert/strict";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, createNamedClient,
  alwaysAuthorizedResolver, fixedOutcomeResolver, seedEntityAndMaterial, defaultGenerationConfigInput,
  defaultRecommendationCandidate,
} from "./helpers";
import { createRadarAnalysisRequest, getRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { createOrRecoverIntentionalAttempt, claimAttempt, preserveResult } from "../radarAnalysisAttemptService";
import { RadarAnalysisRequestConflictError } from "../radarAnalysisRequestContract";
import { RadarAnalysisAttemptConflictError } from "../radarAnalysisAttemptContract";
import { RadarKnownEntityNotFoundError } from "../radarKnownEntityService";
import { RadarSocialAuthorizationError } from "../radarEntityAccessResolver";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-e-${++clientSeq}-${process.pid}`).prisma;
}

async function setup(prisma: ReturnType<typeof db>, prefix: string) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  const { entity, material } = await seedEntityAndMaterial(prisma, { tenantId, workspaceId, userId });
  return { tenantId, workspaceId, userId, entity, material };
}

test("criação: fluxo autorizado cria a solicitação e a primeira tentativa (pending) juntas", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-happy");
    const result = await createRadarAnalysisRequest(
      {
        tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
        input: { entityId: entity.id, materialId: material.id, objective: "Avaliar oportunidade comercial", operationKey: "req-1" },
        generationConfigInput: defaultGenerationConfigInput(),
      },
      prisma
    );
    assert.equal(result.recovered, false);
    assert.equal(result.request.objective, "Avaliar oportunidade comercial");
    assert.equal(result.firstAttempt.status, "pending");
    assert.equal(result.firstAttempt.attemptOperationKey, "initial");
    assert.equal(result.firstAttempt.attemptNumber, 1);
    assert.equal(result.firstAttempt.generationConfig.requestedModel, "radar-test-model-v1");
  } finally { await prisma.$disconnect(); }
});

test("idempotência: reenvio idêntico recupera a mesma solicitação e a mesma primeira tentativa", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-idem");
    const input = { entityId: entity.id, materialId: material.id, objective: "Mesma pergunta", operationKey: "req-idem" };
    const first = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    const second = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    assert.equal(second.recovered, true);
    assert.equal(second.request.id, first.request.id);
    assert.equal(second.firstAttempt.id, first.firstAttempt.id);

    const count = await prisma.radarAnalysisRequest.count({ where: { tenantId, workspaceId, operationKey: "req-idem" } });
    assert.equal(count, 1);
  } finally { await prisma.$disconnect(); }
});

test("conflito: mesma operationKey, objective diferente -> conflito, nunca segunda gravação", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-conflict");
    const base = { entityId: entity.id, materialId: material.id, operationKey: "req-conflict" };
    await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, objective: "Pergunta A" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    await assert.rejects(
      () => createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, objective: "Pergunta B" }, generationConfigInput: defaultGenerationConfigInput() }, prisma),
      RadarAnalysisRequestConflictError
    );
    const count = await prisma.radarAnalysisRequest.count({ where: { tenantId, workspaceId, operationKey: "req-conflict" } });
    assert.equal(count, 1);
  } finally { await prisma.$disconnect(); }
});

test("isolamento entre tenants: mesma operationKey em tenants diferentes não colide", async () => {
  const prisma = db();
  try {
    const a = await setup(prisma, "e-iso-a");
    const b = await setup(prisma, "e-iso-b");
    const resA = await createRadarAnalysisRequest({ tenantId: a.tenantId, workspaceId: a.workspaceId, actorUserId: a.userId, resolver: alwaysAuthorizedResolver(), input: { entityId: a.entity.id, materialId: a.material.id, objective: "Pergunta", operationKey: "req-shared" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    const resB = await createRadarAnalysisRequest({ tenantId: b.tenantId, workspaceId: b.workspaceId, actorUserId: b.userId, resolver: alwaysAuthorizedResolver(), input: { entityId: b.entity.id, materialId: b.material.id, objective: "Pergunta", operationKey: "req-shared" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    assert.notEqual(resA.request.id, resB.request.id);
  } finally { await prisma.$disconnect(); }
});

test("autorização: sem membership, bloqueia; revogação de acesso à entidade bloqueia mesmo com membership/escopo corretos", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("e-noauth");
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId, name: tenantId }, update: {} });
    await prisma.workspace.upsert({ where: { id: workspaceId }, create: { id: workspaceId, tenantId, name: workspaceId }, update: {} });
    await assert.rejects(
      () => createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: "ghost", resolver: alwaysAuthorizedResolver(), input: { entityId: "e1", materialId: "m1", objective: "x", operationKey: "op" }, generationConfigInput: defaultGenerationConfigInput() }, prisma),
      RadarSocialAuthorizationError
    );

    const { tenantId: t2, workspaceId: w2, userId, entity, material } = await setup(prisma, "e-revoked");
    await assert.rejects(
      () => createRadarAnalysisRequest({ tenantId: t2, workspaceId: w2, actorUserId: userId, resolver: fixedOutcomeResolver("access_denied"), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-revoked" }, generationConfigInput: defaultGenerationConfigInput() }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("recuperação de solicitação: getRadarAnalysisRequest é leitura autorizada, revogação bloqueia", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-get");
    const created = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-get" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    const fetched = await getRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, requestId: created.request.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(fetched.id, created.request.id);

    await assert.rejects(
      () => getRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, requestId: created.request.id, resolver: fixedOutcomeResolver("access_denied") }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

// --- attemptOperationKey: casos A a D (Atualização 1.18) --------------------

test("caso A: chave existente recupera a tentativa com generationConfig CONGELADO, mesmo com resolução de servidor diferente agora", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-caseA");
    const request = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-caseA" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    await prisma.radarAnalysisAttempt.updateMany({ where: { id: request.firstAttempt.id }, data: { status: "failed", failureReasonCode: "test_setup" } });

    const first = await createOrRecoverIntentionalAttempt({
      tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
      analysisRequestId: request.request.id, attemptOperationKey: "retry-1",
      generationConfigInput: defaultGenerationConfigInput({ requestedMaxTokens: 500 }),
    }, prisma);
    assert.equal(first.recovered, false);
    assert.equal(first.attempt.generationConfig.requestedMaxTokens, 500);

    // "Servidor" resolveria algo DIFERENTE agora (2000 tokens) — não importa:
    // reenvio pela MESMA chave recupera o já congelado (500), sem recalcular.
    const second = await createOrRecoverIntentionalAttempt({
      tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
      analysisRequestId: request.request.id, attemptOperationKey: "retry-1",
      generationConfigInput: defaultGenerationConfigInput({ requestedMaxTokens: 2000 }),
    }, prisma);
    assert.equal(second.recovered, true);
    assert.equal(second.attempt.id, first.attempt.id);
    assert.equal(second.attempt.generationConfig.requestedMaxTokens, 500, "generationConfig não foi recalculado no reenvio");
  } finally { await prisma.$disconnect(); }
});

test("caso B: chave inexistente cria tentativa nova, resolvendo generationConfig agora", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-caseB");
    const request = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-caseB" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    // A primeira tentativa (initial) já existe e está pending — para criar
    // outra sob nova chave sem violar "no máximo uma ativa", cancelamos/
    // avançamos a primeira não é o foco aqui: usamos uma solicitação cuja
    // tentativa inicial já não conta (mesma solicitação, chave nova só é
    // aceita se não houver outra ativa — testado à parte no teste de
    // unicidade abaixo). Aqui validamos só a resolução em si, então
    // finalizamos a tentativa inicial artificialmente para liberar o slot.
    await prisma.radarAnalysisAttempt.updateMany({ where: { id: request.firstAttempt.id }, data: { status: "failed", failureReasonCode: "test_setup" } });

    const created = await createOrRecoverIntentionalAttempt({
      tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
      analysisRequestId: request.request.id, attemptOperationKey: "retry-b",
      generationConfigInput: defaultGenerationConfigInput(),
    }, prisma);
    assert.equal(created.recovered, false);
    assert.equal(created.attempt.attemptNumber, 2);
  } finally { await prisma.$disconnect(); }
});

test("caso C: duas criações concorrentes com a mesma chave — uma cria, a outra recupera, nunca conflita por generationConfig divergente", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-caseC");
    const request = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-caseC" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    await prisma.radarAnalysisAttempt.updateMany({ where: { id: request.firstAttempt.id }, data: { status: "failed", failureReasonCode: "test_setup" } });

    const attempt = (maxTokens: number) => createOrRecoverIntentionalAttempt({
      tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
      analysisRequestId: request.request.id, attemptOperationKey: "retry-race",
      generationConfigInput: defaultGenerationConfigInput({ requestedMaxTokens: maxTokens }),
    }, prisma);

    const [r1, r2] = await Promise.all([attempt(300), attempt(900)]);
    const recoveredFlags = [r1.recovered, r2.recovered].sort();
    assert.deepEqual(recoveredFlags, [false, true]);
    assert.equal(r1.attempt.id, r2.attempt.id);

    const count = await prisma.radarAnalysisAttempt.count({ where: { tenantId, workspaceId, analysisRequestId: request.request.id, attemptOperationKey: "retry-race" } });
    assert.equal(count, 1);
  } finally { await prisma.$disconnect(); }
});

test("caso D / unicidade: nova tentativa intencional com tentativa ativa existente é rejeitada (no máximo uma ativa por solicitação)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-caseD");
    const request = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-caseD" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);
    // A primeira tentativa ("initial") continua pending (ativa) — uma nova
    // tentativa intencional sob OUTRA chave deve ser rejeitada pelo índice
    // único parcial.
    await assert.rejects(
      () => createOrRecoverIntentionalAttempt({
        tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
        analysisRequestId: request.request.id, attemptOperationKey: "retry-d",
        generationConfigInput: defaultGenerationConfigInput(),
      }, prisma),
      (e: unknown) => e instanceof RadarAnalysisAttemptConflictError && e.reasonCode === "only_one_active_attempt_allowed"
    );
  } finally { await prisma.$disconnect(); }
});

test("caso D2 / unicidade estendida (Atualização 1.20): resultado durável aguardando conclusão também bloqueia nova tentativa intencional", async () => {
  // Regressão: até a Atualização 1.19, o índice único parcial cobria só
  // ('pending','running') — uma tentativa em provider_responded_pending_persistence
  // (resposta do provedor já preservada, aguardando validação/conclusão) NÃO
  // contava como "ativa" e permitia criar uma segunda tentativa intencional
  // sob outra attemptOperationKey, abrindo espaço para duas execuções
  // concorrentes do mesmo pedido. Corrigido estendendo o filtro do índice
  // para incluir também provider_responded_pending_persistence.
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material } = await setup(prisma, "e-caseD2");
    const request = await createRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: "op-caseD2" }, generationConfigInput: defaultGenerationConfigInput() }, prisma);

    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver: alwaysAuthorizedResolver() }, prisma);
    await preserveResult({
      tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken,
      executorOutput: { candidate: defaultRecommendationCandidate(), provider: "p", model: "radar-test-model-v1", providerRequestId: "r-d2" },
    }, prisma);

    const afterPreserve = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(afterPreserve.status, "provider_responded_pending_persistence");

    await assert.rejects(
      () => createOrRecoverIntentionalAttempt({
        tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
        analysisRequestId: request.request.id, attemptOperationKey: "retry-d2",
        generationConfigInput: defaultGenerationConfigInput(),
      }, prisma),
      (e: unknown) => e instanceof RadarAnalysisAttemptConflictError && e.reasonCode === "only_one_active_attempt_allowed"
    );

    const count = await prisma.radarAnalysisAttempt.count({ where: { tenantId, workspaceId, analysisRequestId: request.request.id } });
    assert.equal(count, 1, "nenhuma segunda linha de tentativa foi criada");
  } finally { await prisma.$disconnect(); }
});
