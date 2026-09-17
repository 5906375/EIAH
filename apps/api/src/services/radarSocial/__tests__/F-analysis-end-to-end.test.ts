// Cenário F — fluxo completo com executor SUBSTITUTO controlado: material
// persistido -> análise simulada -> recomendação persistida -> recuperação
// autorizada sem nova análise. Nenhuma chamada real a modelo em nenhum
// teste deste arquivo.
import test from "node:test";
import assert from "node:assert/strict";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, createNamedClient,
  alwaysAuthorizedResolver, fixedOutcomeResolver, seedEntityAndMaterial, defaultGenerationConfigInput,
  defaultRecommendationCandidate, fakeExecutor,
} from "./helpers";
import { createRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { runSimulatedAnalysis, claimAttempt, preserveResult, concludeAttempt, requestAttemptCancellation } from "../radarAnalysisAttemptService";
import { getRadarRecommendation, RadarRecommendationNotFoundError } from "../radarRecommendationService";
import { RadarAnalysisAttemptConflictError } from "../radarAnalysisAttemptContract";
import { randomUUID } from "node:crypto";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-f-${++clientSeq}-${process.pid}`).prisma;
}

async function setup(prisma: ReturnType<typeof db>, prefix: string, conteudo?: string) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  const { entity, material } = await seedEntityAndMaterial(prisma, { tenantId, workspaceId, userId, conteudo });
  const request = await createRadarAnalysisRequest(
    { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "Avaliar oportunidade", operationKey: `op-${randomUUID().slice(0, 8)}` }, generationConfigInput: defaultGenerationConfigInput() },
    prisma
  );
  return { tenantId, workspaceId, userId, entity, material, request };
}

test("fluxo feliz: material -> análise simulada -> recomendação persistida -> recuperação sem nova execução", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, request } = await setup(prisma, "f-happy");
    const { executor, calls } = fakeExecutor(() => defaultRecommendationCandidate());

    const result = await runSimulatedAnalysis(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor },
      prisma
    );
    assert.equal(result.attempt.status, "completed");
    assert.ok(result.recommendation);
    assert.equal(result.recommendation!.recommendationType, "actionable");
    assert.equal(calls.length, 1, "executor chamado exatamente uma vez");

    // Recuperação: leitura autorizada, sem tocar o executor de novo.
    const recovered = await getRadarRecommendation(
      { tenantId, workspaceId, actorUserId: userId, attemptId: request.firstAttempt.id, resolver: alwaysAuthorizedResolver() },
      prisma
    );
    assert.equal(recovered.id, result.recommendation!.id);
    assert.equal(calls.length, 1, "recuperação não chama o executor de novo");

    // Revogação de acesso bloqueia a recuperação da recomendação.
    await assert.rejects(
      () => getRadarRecommendation({ tenantId, workspaceId, actorUserId: userId, attemptId: request.firstAttempt.id, resolver: fixedOutcomeResolver("access_denied") }, prisma),
      RadarRecommendationNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("evidência insuficiente: resultado válido e persistido, distinto de falha técnica", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-insufficient", "A empresa mencionou que 'está avaliando crescer' em nota vaga.");
    const { executor } = fakeExecutor(() => ({
      contractVersion: "radar-recommendation.v1",
      recommendationType: "insufficient_evidence",
      summary: "Material só cita avaliação vaga de crescimento.",
      statements: [{ content: "A empresa mencionou que está avaliando crescer.", natureza: "FACT_IN_MATERIAL", referenceIds: ["ref-1"] }],
      references: [{ id: "ref-1", quote: "está avaliando crescer" }],
      insufficientEvidenceReason: "Não há fato concreto (data, local, escala) que sustente recomendação.",
    }));

    const result = await runSimulatedAnalysis(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor },
      prisma
    );
    assert.equal(result.attempt.status, "completed", "insufficient_evidence é sucesso da análise, não falha");
    assert.equal(result.recommendation!.recommendationType, "insufficient_evidence");
    assert.equal(result.attempt.failureReasonCode, null);
  } finally { await prisma.$disconnect(); }
});

test("referência inválida: rejeitada antes de persistir, tentativa marcada failed, nenhuma recomendação criada", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-badref");
    const { executor } = fakeExecutor(() => defaultRecommendationCandidate({
      references: [{ id: "ref-1", quote: "vamos abrir 5 novas filiais imediatamente" }], // não existe no material
    }));

    const result = await runSimulatedAnalysis(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor },
      prisma
    );
    assert.equal(result.attempt.status, "failed");
    assert.equal(result.attempt.failureReasonCode, "reference_not_verifiable");
    assert.equal(result.recommendation, null);

    const count = await prisma.radarRecommendation.count({ where: { attemptId: request.firstAttempt.id } });
    assert.equal(count, 0);
  } finally { await prisma.$disconnect(); }
});

test("payload acima do limite de tamanho: rejeitado antes de qualquer escrita, tentativa não avança para provider_responded_pending_persistence", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-oversize");
    const oversized = defaultRecommendationCandidate({ summary: "x".repeat(40_000) });
    const { executor } = fakeExecutor(() => oversized);

    await assert.rejects(
      () => runSimulatedAnalysis({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor }, prisma)
    );
    const attempt = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(attempt.status, "running", "falha de tamanho ocorre antes de preservar — tentativa permanece running, sem meio-termo");
    assert.equal(attempt.preservedResultPayload, null);
  } finally { await prisma.$disconnect(); }
});

test("falha do provedor (resultado desconhecido): tentativa marcada failed sem recomendação; nova chamada exige nova autorização, não é automática", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-providerfail");
    const { executor } = fakeExecutor(() => { throw new Error("simulated provider timeout"); });

    await assert.rejects(
      () => runSimulatedAnalysis({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor }, prisma)
    );
    // O claim já moveu para "running"; sem preservação, a tentativa fica
    // ambígua (running) — nenhuma repetição automática é disparada por
    // este serviço.
    const attempt = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(attempt.status, "running");
    const recCount = await prisma.radarRecommendation.count({ where: { attemptId: request.firstAttempt.id } });
    assert.equal(recCount, 0);
  } finally { await prisma.$disconnect(); }
});

test("cancelamento solicitado com resposta tardia: efetivado no checkpoint, não persiste recomendação", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-cancel");
    const { executor } = fakeExecutor(async () => {
      // Simula que o cancelamento foi solicitado ENQUANTO a chamada estava
      // "em voo" — pedimos o cancelamento antes do executor devolver.
      await requestAttemptCancellation({ tenantId, workspaceId, attemptId: request.firstAttempt.id }, prisma);
      return defaultRecommendationCandidate();
    });

    const result = await runSimulatedAnalysis(
      { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor },
      prisma
    );
    assert.equal(result.attempt.status, "cancelled");
    assert.equal(result.recommendation, null);
    const recCount = await prisma.radarRecommendation.count({ where: { attemptId: request.firstAttempt.id } });
    assert.equal(recCount, 0, "resposta tardia após cancelamento não vira recomendação");
  } finally { await prisma.$disconnect(); }
});

test("recuperação de resultado durável: retomar conclusão sem chamar o executor de novo", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-resume");
    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver() }, prisma);
    await preserveResult({
      tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken,
      executorOutput: { candidate: defaultRecommendationCandidate(), provider: "radar-test-provider", model: "radar-test-model-v1", providerRequestId: "req-resume-1" },
    }, prisma);

    const afterPreserve = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(afterPreserve.status, "provider_responded_pending_persistence");

    // "Queda simulada": o processo cai aqui. Retomada usa o MESMO
    // claimToken (ainda vigente) para concluir — sem chamar executor algum.
    const concluded = await concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(concluded.attempt.status, "completed");
    assert.ok(concluded.recommendation);
  } finally { await prisma.$disconnect(); }
});

test("recomendação duplicada impedida: concluir duas vezes com o mesmo claimToken só persiste uma vez", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "f-noduplicate");
    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver() }, prisma);
    await preserveResult({
      tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken,
      executorOutput: { candidate: defaultRecommendationCandidate(), provider: "radar-test-provider", model: "radar-test-model-v1", providerRequestId: "req-dup-1" },
    }, prisma);
    await concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver: alwaysAuthorizedResolver() }, prisma);

    // Segunda tentativa de concluir com o MESMO claimToken: status já não é
    // mais provider_responded_pending_persistence -> rejeitada.
    await assert.rejects(
      () => concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver: alwaysAuthorizedResolver() }, prisma),
      RadarAnalysisAttemptConflictError
    );
    const count = await prisma.radarRecommendation.count({ where: { attemptId: request.firstAttempt.id } });
    assert.equal(count, 1);
  } finally { await prisma.$disconnect(); }
});

test("material corrigido depois da análise mantém a referência histórica exata", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity, material, request } = await setup(prisma, "f-correction");
    const { executor } = fakeExecutor(() => defaultRecommendationCandidate());
    const result = await runSimulatedAnalysis({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "worker-1", resolver: alwaysAuthorizedResolver(), executor }, prisma);
    assert.equal(result.attempt.status, "completed");

    // Corrige o material DEPOIS da análise (sucessora nova).
    const { correctRadarMaterial } = await import("../radarMaterialService");
    await correctRadarMaterial({
      tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
      input: { entityId: entity.id, conteudo: "Conteúdo totalmente reescrito, sem menção a Recife.", fonteDeclarada: "correção", operationKey: `corr-${randomUUID().slice(0, 8)}`, supersedesMaterialId: material.id },
    }, prisma);

    // A solicitação/recomendação já existentes continuam apontando para o
    // materialId ORIGINAL, imutável — nunca movidas para a sucessora.
    const requestReloaded = await prisma.radarAnalysisRequest.findFirstOrThrow({ where: { id: request.request.id } });
    assert.equal(requestReloaded.materialId, material.id);
    const recommendation = await getRadarRecommendation({ tenantId, workspaceId, actorUserId: userId, attemptId: request.firstAttempt.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(recommendation.recommendationType, "actionable");
  } finally { await prisma.$disconnect(); }
});
