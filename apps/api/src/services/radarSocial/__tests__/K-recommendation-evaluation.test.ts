// Cenário K — avaliação humana persistida do Radar Social: vínculo com a
// recomendação exata, autorização por escopo + "read" vigente, cadeia única
// por (recomendação, avaliador), rubrica versionada e idempotência. Ver
// docs/architecture/radar-social-construction-plan-v1.md, "Fechamento
// documental proposto (18/09/2026)" e "Consolidação final (18/09/2026)".
// Nenhuma chamada real a modelo em nenhum teste — a recomendação avaliada é
// produzida pelo executor SUBSTITUTO já existente do pacote A
// (runSimulatedAnalysis + fakeExecutor), nunca por runGovernedAnalysis.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, grantScope, createNamedClient,
  defaultGenerationConfigInput, defaultRecommendationCandidate, seedEntityAndMaterial, fakeExecutor,
  holdEntityRowLock, observeConnectionState, waitFor,
} from "./helpers";
import { createRadarEntityAccessResolver, grantRadarEntityAccess, revokeRadarEntityAccess } from "../radarEntityAccessGrantService";
import { createRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { runSimulatedAnalysis } from "../radarAnalysisAttemptService";
import {
  RADAR_RECOMMENDATION_EVALUATION_CONTRACT_VERSION,
  RADAR_RECOMMENDATION_EVALUATION_RUBRICS,
  CURRENT_CRITERIA_VERSION,
  RadarRecommendationEvaluationConflictError,
  RadarRecommendationEvaluationError,
} from "../radarRecommendationEvaluationContract";
import {
  RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE,
  submitRadarRecommendationEvaluation,
  getRadarRecommendationEvaluation,
  listRadarRecommendationEvaluationsForRecommendation,
  RadarRecommendationEvaluationNotFoundError,
} from "../radarRecommendationEvaluationService";
import { RadarKnownEntityNotFoundError } from "../radarKnownEntityService";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-k-${++clientSeq}-${process.pid}`).prisma;
}

async function setupEvaluatedRecommendation(
  prisma: ReturnType<typeof db>,
  prefix: string,
  conteudo?: string
) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId: creatorUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE });
  const resolver = createRadarEntityAccessResolver(prisma);
  const { entity, material } = await seedEntityAndMaterial(prisma, { tenantId, workspaceId, userId: creatorUserId, conteudo });

  const request = await createRadarAnalysisRequest(
    {
      tenantId, workspaceId, actorUserId: creatorUserId, resolver,
      input: { entityId: entity.id, materialId: material.id, objective: "Avaliar oportunidade comercial", operationKey: `op-${randomUUID().slice(0, 8)}` },
      generationConfigInput: defaultGenerationConfigInput(),
    },
    prisma
  );
  const { executor } = fakeExecutor(() => defaultRecommendationCandidate());
  const concluded = await runSimulatedAnalysis(
    { tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver, executor },
    prisma
  );
  if (!concluded.recommendation) throw new Error("setup falhou: recomendação não produzida");
  return { tenantId, workspaceId, creatorUserId, entity, material, resolver, recommendationId: concluded.recommendation.id };
}

async function addSecondEvaluator(
  prisma: ReturnType<typeof db>,
  opts: { tenantId: string; workspaceId: string; creatorUserId: string; entityId: string }
) {
  const { userId: evaluatorUserId } = await seedTenantWorkspaceUser(prisma, { tenantId: opts.tenantId, workspaceId: opts.workspaceId, userId: `${opts.tenantId}-evaluator-b` });
  await grantRadarEntityAccess(
    { tenantId: opts.tenantId, workspaceId: opts.workspaceId, actorUserId: opts.creatorUserId, entityId: opts.entityId, granteeUserId: evaluatorUserId, operation: "read" },
    prisma
  );
  return { evaluatorUserId };
}

function validJudgment(overrides: Record<string, unknown> = {}) {
  return {
    fundamentacao: "bem_fundamentada", clareza: "clara", utilidade: "util",
    justificativa: undefined, comentario: undefined,
    ...overrides,
  };
}

test("avaliação vinculada à recomendação correta: recommendationId persistido é exatamente o esperado, outra recomendação nunca é tocada", async () => {
  const prisma = db();
  try {
    const setupA = await setupEvaluatedRecommendation(prisma, "k-link-a");
    const setupB = await setupEvaluatedRecommendation(prisma, "k-link-b");

    const result = await submitRadarRecommendationEvaluation(
      {
        tenantId: setupA.tenantId, workspaceId: setupA.workspaceId, actorUserId: setupA.creatorUserId,
        resolver: setupA.resolver, recommendationId: setupA.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`,
        ...validJudgment(),
      },
      prisma
    );
    assert.equal(result.evaluation.recommendationId, setupA.recommendationId);
    assert.equal(result.recovered, false);

    const evaluationsForB = await listRadarRecommendationEvaluationsForRecommendation(
      { tenantId: setupB.tenantId, workspaceId: setupB.workspaceId, actorUserId: setupB.creatorUserId, resolver: setupB.resolver, recommendationId: setupB.recommendationId },
      prisma
    );
    assert.equal(evaluationsForB.length, 0, "a recomendação B nunca é tocada pela avaliação de A");
  } finally { await prisma.$disconnect(); }
});

test("mudança da rubrica vigente não impede recuperar avaliação anterior com a mesma chave e conteúdo (correção obrigatória)", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-rubric-change");
    const operationKey = `eval-${randomUUID().slice(0, 8)}`;
    const judgment = validJudgment({ fundamentacao: "parcialmente_fundamentada", justificativa: "Falta uma referência mais direta." });

    // Cria sob a rubrica v1 (real, de produção).
    const first = await submitRadarRecommendationEvaluation(
      {
        tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId,
        resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...judgment,
        currentCriteriaVersionForTesting: CURRENT_CRITERIA_VERSION,
      },
      prisma
    );
    assert.equal(first.evaluation.criteriaVersion, CURRENT_CRITERIA_VERSION);

    // Simula que a rubrica "vigente" do servidor avançou para uma v2 —
    // mapa de teste local, NUNCA a rubrica real de produção (que continua
    // com só a v1). Reenvio idêntico, mas com a "vigente" simulada como v2.
    const rubricsWithFutureVersion = {
      ...RADAR_RECOMMENDATION_EVALUATION_RUBRICS,
      "radar-recommendation-evaluation-criteria.v2-teste": RADAR_RECOMMENDATION_EVALUATION_RUBRICS[CURRENT_CRITERIA_VERSION],
    };
    const second = await submitRadarRecommendationEvaluation(
      {
        tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId,
        resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...judgment,
        currentCriteriaVersionForTesting: "radar-recommendation-evaluation-criteria.v2-teste",
        rubricsForTesting: rubricsWithFutureVersion,
      },
      prisma
    );
    assert.equal(second.recovered, true, "reenvio idêntico recuperado, não uma nova gravação");
    assert.equal(second.evaluation.id, first.evaluation.id);
    assert.equal(second.evaluation.criteriaVersion, CURRENT_CRITERIA_VERSION, "criteriaVersion permanece a CONGELADA na criação, nunca recalculada para a 'vigente' simulada");

    const count = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, recommendationId: setup.recommendationId } });
    assert.equal(count, 1, "nenhuma segunda linha criada pela mudança de rubrica vigente");
  } finally { await prisma.$disconnect(); }
});

test("createdAt permanece idêntico no reenvio (correção obrigatória): recuperação idempotente nunca produz nova escrita", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-createdat");
    const operationKey = `eval-${randomUUID().slice(0, 8)}`;
    const judgment = validJudgment();

    const first = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...judgment },
      prisma
    );
    const second = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...judgment },
      prisma
    );
    assert.equal(second.recovered, true);
    assert.equal(second.evaluation.createdAt.getTime(), first.evaluation.createdAt.getTime(), "createdAt idêntico — reenvio nunca reescreve o registro");
  } finally { await prisma.$disconnect(); }
});

test("divergência real de conteúdo gera conflito, sem nova escrita", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-diverge-content");
    const operationKey = `eval-${randomUUID().slice(0, 8)}`;

    await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...validJudgment() },
      prisma
    );

    await assert.rejects(
      () => submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...validJudgment({ utilidade: "nao_util", justificativa: "Mudei de ideia." }) },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationConflictError && e.reasonCode === "operation_key_reused_incompatible_evaluation"
    );

    const count = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, recommendationId: setup.recommendationId } });
    assert.equal(count, 1, "conflito não cria segunda linha");
  } finally { await prisma.$disconnect(); }
});

test("divergência de predecessor (supersedesEvaluationId) gera conflito, sem nova escrita", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-diverge-predecessor");
    const rootOperationKey = `eval-root-${randomUUID().slice(0, 8)}`;
    const correctionOperationKey = `eval-fix-${randomUUID().slice(0, 8)}`;

    const root = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: rootOperationKey, ...validJudgment() },
      prisma
    );
    const correction = await submitRadarRecommendationEvaluation(
      {
        tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver,
        recommendationId: setup.recommendationId, operationKey: correctionOperationKey,
        ...validJudgment({ fundamentacao: "parcialmente_fundamentada", justificativa: "Correção do julgamento inicial." }),
        supersedesEvaluationId: root.evaluation.id,
      },
      prisma
    );
    assert.ok(correction.evaluation.supersedesEvaluationId === root.evaluation.id);

    // Reenvio sob a MESMA correctionOperationKey, mesmo conteúdo, mas
    // supersedesEvaluationId DIVERGENTE (aponta para nada/outra coisa).
    await assert.rejects(
      () => submitRadarRecommendationEvaluation(
        {
          tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver,
          recommendationId: setup.recommendationId, operationKey: correctionOperationKey,
          ...validJudgment({ fundamentacao: "parcialmente_fundamentada", justificativa: "Correção do julgamento inicial." }),
          supersedesEvaluationId: undefined,
        },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationConflictError && e.reasonCode === "operation_key_reused_incompatible_evaluation"
    );
  } finally { await prisma.$disconnect(); }
});

test("recuperação exige autorização vigente: leitura negada sem grant, revogação após criação bloqueia leitura futura sem apagar o passado", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-authz-revoke");
    const { evaluatorUserId } = await addSecondEvaluator(prisma, { tenantId: setup.tenantId, workspaceId: setup.workspaceId, creatorUserId: setup.creatorUserId, entityId: setup.entity.id });

    const submitted = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );

    // Leitura autorizada funciona antes da revogação.
    const read = await getRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorUserId, resolver: setup.resolver, evaluationId: submitted.evaluation.id },
      prisma
    );
    assert.equal(read.id, submitted.evaluation.id);

    // Revoga o "read" do avaliador sobre a entidade.
    const { revokeRadarEntityAccess } = await import("../radarEntityAccessGrantService");
    await revokeRadarEntityAccess(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, entityId: setup.entity.id, granteeUserId: evaluatorUserId, operation: "read" },
      prisma
    );

    // Leitura pelo PRÓPRIO autor, agora sem acesso, é negada — mesmo da
    // própria avaliação (revogação é prospectiva, nunca apaga o que já foi
    // produzido, mas toda leitura revalida no instante).
    await assert.rejects(
      () => getRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorUserId, resolver: setup.resolver, evaluationId: submitted.evaluation.id },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationNotFoundError
    );

    // A linha em si permanece intacta no banco — revogação não apaga o passado.
    const stillThere = await prisma.radarRecommendationEvaluation.findUnique({ where: { id: submitted.evaluation.id } });
    assert.ok(stillThere, "avaliação já criada não é apagada pela revogação");
  } finally { await prisma.$disconnect(); }
});

test("consulta de avaliações de terceiros: avaliador B lê a avaliação de A sob a mesma política de leitura própria", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-third-party-read");
    const { evaluatorUserId: evaluatorB } = await addSecondEvaluator(prisma, { tenantId: setup.tenantId, workspaceId: setup.workspaceId, creatorUserId: setup.creatorUserId, entityId: setup.entity.id });

    const byCreator = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );

    const readByB = await getRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorB, resolver: setup.resolver, evaluationId: byCreator.evaluation.id },
      prisma
    );
    assert.equal(readByB.id, byCreator.evaluation.id);
    assert.equal(readByB.evaluatorUserId, setup.creatorUserId, "B lê uma avaliação cujo autor é outra pessoa");
  } finally { await prisma.$disconnect(); }
});

test("correção preserva o original: linha original byte a byte idêntica, cadeia inteira legível", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-correction-history");
    const root = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-root-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );
    const rootSnapshotBefore = await prisma.radarRecommendationEvaluation.findUniqueOrThrow({ where: { id: root.evaluation.id } });

    const correction = await submitRadarRecommendationEvaluation(
      {
        tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver,
        recommendationId: setup.recommendationId, operationKey: `eval-fix-${randomUUID().slice(0, 8)}`,
        ...validJudgment({ fundamentacao: "nao_fundamentada", justificativa: "Na verdade a referência não sustenta a conclusão." }),
        supersedesEvaluationId: root.evaluation.id,
      },
      prisma
    );

    const rootSnapshotAfter = await prisma.radarRecommendationEvaluation.findUniqueOrThrow({ where: { id: root.evaluation.id } });
    assert.deepEqual(rootSnapshotBefore, rootSnapshotAfter, "linha original nunca é reescrita por uma correção");

    const chain = await listRadarRecommendationEvaluationsForRecommendation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId },
      prisma
    );
    const ids = chain.map((e) => e.id).sort();
    assert.deepEqual(ids, [root.evaluation.id, correction.evaluation.id].sort(), "cadeia inteira (original + correção) permanece legível");
  } finally { await prisma.$disconnect(); }
});

test("concorrência não cria raízes duplicadas: duas avaliações raiz concorrentes da mesma pessoa, exatamente uma sobrevive", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-concurrent-root");
    const [r1, r2] = await Promise.allSettled([
      submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-a-${randomUUID().slice(0, 8)}`, ...validJudgment() },
        prisma
      ),
      submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-b-${randomUUID().slice(0, 8)}`, ...validJudgment() },
        prisma
      ),
    ]);
    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    const rejected = [r1, r2].filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exatamente uma raiz sobrevive");
    assert.equal(rejected.length, 1);
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof RadarRecommendationEvaluationConflictError
      && (rejected[0] as PromiseRejectedResult).reason.reasonCode === "root_already_exists_use_correction");

    const rootCount = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, recommendationId: setup.recommendationId, supersedesEvaluationId: null } });
    assert.equal(rootCount, 1, "nunca duas raízes para o mesmo par (recomendação, avaliador)");
  } finally { await prisma.$disconnect(); }
});

test("concorrência não cria sucessoras duplicadas: duas correções concorrentes da mesma predecessora, exatamente uma sobrevive", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-concurrent-succession");
    const root = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-root-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );

    const [c1, c2] = await Promise.allSettled([
      submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-fix-a-${randomUUID().slice(0, 8)}`, ...validJudgment({ fundamentacao: "parcialmente_fundamentada", justificativa: "Correção A." }), supersedesEvaluationId: root.evaluation.id },
        prisma
      ),
      submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-fix-b-${randomUUID().slice(0, 8)}`, ...validJudgment({ fundamentacao: "nao_fundamentada", justificativa: "Correção B." }), supersedesEvaluationId: root.evaluation.id },
        prisma
      ),
    ]);
    const fulfilled = [c1, c2].filter((r) => r.status === "fulfilled");
    const rejected = [c1, c2].filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exatamente uma sucessora sobrevive");
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof RadarRecommendationEvaluationConflictError
      && (rejected[0] as PromiseRejectedResult).reason.reasonCode === "evaluation_already_corrected");

    const successorCount = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, supersedesEvaluationId: root.evaluation.id } });
    assert.equal(successorCount, 1, "nunca duas sucessoras para a mesma predecessora");
  } finally { await prisma.$disconnect(); }
});

test("avaliação e recuperação não executam análise nem ação externa: nenhum novo Run/RadarAnalysisAttempt/RadarProviderCallSlot", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-no-side-effect");
    const [runsBefore, attemptsBefore, slotsBefore] = await Promise.all([
      prisma.run.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId } }),
      prisma.radarAnalysisAttempt.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId } }),
      prisma.radarProviderCallSlot.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId } }),
    ]);

    const operationKey = `eval-${randomUUID().slice(0, 8)}`;
    const submitted = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...validJudgment() },
      prisma
    );
    // Recuperação idempotente — mesmo caminho, nenhuma análise nova.
    await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...validJudgment() },
      prisma
    );
    await getRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, evaluationId: submitted.evaluation.id },
      prisma
    );

    const [runsAfter, attemptsAfter, slotsAfter] = await Promise.all([
      prisma.run.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId } }),
      prisma.radarAnalysisAttempt.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId } }),
      prisma.radarProviderCallSlot.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId } }),
    ]);
    assert.equal(runsAfter, runsBefore, "nenhum Run criado por avaliação ou recuperação");
    assert.equal(attemptsAfter, attemptsBefore, "nenhuma RadarAnalysisAttempt nova (a original do setup não muda)");
    assert.equal(slotsAfter, slotsBefore, "nenhuma RadarProviderCallSlot criada");
  } finally { await prisma.$disconnect(); }
});

test("isolamento entre tenants e workspaces: ids replicados em pares distintos nunca vazam entre si", async () => {
  const prisma = db();
  try {
    const setupA = await setupEvaluatedRecommendation(prisma, "k-isolation-a");
    const setupB = await setupEvaluatedRecommendation(prisma, "k-isolation-b");

    await submitRadarRecommendationEvaluation(
      { tenantId: setupA.tenantId, workspaceId: setupA.workspaceId, actorUserId: setupA.creatorUserId, resolver: setupA.resolver, recommendationId: setupA.recommendationId, operationKey: "same-op-key", ...validJudgment() },
      prisma
    );
    await submitRadarRecommendationEvaluation(
      { tenantId: setupB.tenantId, workspaceId: setupB.workspaceId, actorUserId: setupB.creatorUserId, resolver: setupB.resolver, recommendationId: setupB.recommendationId, operationKey: "same-op-key", ...validJudgment({ utilidade: "nao_util", justificativa: "Conteúdo completamente diferente do de A." }) },
      prisma
    );

    const listA = await listRadarRecommendationEvaluationsForRecommendation(
      { tenantId: setupA.tenantId, workspaceId: setupA.workspaceId, actorUserId: setupA.creatorUserId, resolver: setupA.resolver, recommendationId: setupA.recommendationId },
      prisma
    );
    assert.equal(listA.length, 1);
    assert.equal(listA[0]!.utilidade, "util", "avaliação de A não foi afetada pela de B, mesmo com o mesmo operationKey");
  } finally { await prisma.$disconnect(); }
});

test("saneamento e contrato: justificativa obrigatória quando não totalmente positivo, contractVersion persistido, enum inválido rejeitado", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-contract-shape");

    await assert.rejects(
      () => submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`, ...validJudgment({ fundamentacao: "nao_avaliavel", justificativa: undefined }) },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationError && e.reasonCode === "justificativa_required_when_not_fully_positive"
    );

    await assert.rejects(
      () => submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`, ...validJudgment({ clareza: "valor-inexistente" }) },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationError && e.reasonCode === "field_invalid_enum"
    );

    const submitted = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );
    assert.equal(submitted.evaluation.contractVersion, RADAR_RECOMMENDATION_EVALUATION_CONTRACT_VERSION);
  } finally { await prisma.$disconnect(); }
});

test("correção por terceiro é recusada mesmo com permissão para avaliar e ler a entidade: original preservado, nenhuma sucessora criada", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-third-party-correction");
    const { evaluatorUserId: evaluatorB } = await addSecondEvaluator(prisma, { tenantId: setup.tenantId, workspaceId: setup.workspaceId, creatorUserId: setup.creatorUserId, entityId: setup.entity.id });

    const root = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-root-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );

    // B tem "read" (herdado de addSecondEvaluator) e o escopo de avaliar já
    // é concedido a todo o workspace (grantAnalysisScopes/grantScope no
    // setup) — B PODE avaliar e ler, mas não é o autor da avaliação raiz.
    await assert.rejects(
      () => submitRadarRecommendationEvaluation(
        {
          tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorB, resolver: setup.resolver,
          recommendationId: setup.recommendationId, operationKey: `eval-fix-by-b-${randomUUID().slice(0, 8)}`,
          ...validJudgment({ fundamentacao: "nao_fundamentada", justificativa: "B tentando corrigir A." }),
          supersedesEvaluationId: root.evaluation.id,
        },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationError && e.reasonCode === "supersedes_evaluation_not_found"
    );

    const rootAfter = await prisma.radarRecommendationEvaluation.findUniqueOrThrow({ where: { id: root.evaluation.id } });
    assert.equal(rootAfter.evaluatorUserId, setup.creatorUserId, "original preservado, autoria intacta");
    assert.equal(rootAfter.fundamentacao, "bem_fundamentada", "conteúdo original nunca alterado pela tentativa de terceiro");

    const successorCount = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, supersedesEvaluationId: root.evaluation.id } });
    assert.equal(successorCount, 0, "nenhuma sucessora criada por um terceiro");

    // B ainda pode criar sua PRÓPRIA avaliação raiz, distinta da de A —
    // confirma que a recusa é especificamente sobre corrigir avaliação
    // alheia, não uma negação geral de avaliar.
    const byB = await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorB, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-b-own-${randomUUID().slice(0, 8)}`, ...validJudgment() },
      prisma
    );
    assert.equal(byB.evaluation.evaluatorUserId, evaluatorB);
  } finally { await prisma.$disconnect(); }
});

test("reenvio após revogação: recuperação negada, sem devolver conteúdo protegido nem criar registro novo", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-resend-after-revoke");
    const operationKey = `eval-${randomUUID().slice(0, 8)}`;
    const secretJustificativa = `justificativa sigilosa SECRETO-${randomUUID()}`;
    const judgment = validJudgment({ fundamentacao: "parcialmente_fundamentada", justificativa: secretJustificativa });

    await submitRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...judgment },
      prisma
    );

    await revokeRadarEntityAccess(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, entityId: setup.entity.id, granteeUserId: setup.creatorUserId, operation: "read" },
      prisma
    );

    // Reenvio com a MESMA operationKey e o MESMO conteúdo — não é chamada
    // ao serviço de leitura, é o próprio submitRadarRecommendationEvaluation
    // de novo, exatamente o caminho de "recuperação idempotente".
    let caughtError: unknown;
    try {
      await submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey, ...judgment },
        prisma
      );
      assert.fail("reenvio deveria ter sido recusado após a revogação");
    } catch (e) {
      caughtError = e;
    }
    assert.ok(caughtError instanceof RadarKnownEntityNotFoundError, "recusado por autorização, não por outro motivo");
    const serializedError = JSON.stringify((caughtError as Error).message) + JSON.stringify((caughtError as { context?: unknown }).context ?? {});
    assert.ok(!serializedError.includes(secretJustificativa), "erro de recusa não expõe a justificativa protegida");

    const count = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, recommendationId: setup.recommendationId } });
    assert.equal(count, 1, "nenhum registro novo criado pelo reenvio negado — só a linha original de antes da revogação");
  } finally { await prisma.$disconnect(); }
});

test("leitura de terceiros com conteúdo real: comentário e justificativa corretos para quem tem acesso, negados após perda de acesso", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-third-party-content");
    const { evaluatorUserId: evaluatorB } = await addSecondEvaluator(prisma, { tenantId: setup.tenantId, workspaceId: setup.workspaceId, creatorUserId: setup.creatorUserId, entityId: setup.entity.id });

    const justificativaMarker = `JUSTIFICATIVA-SECRETO-${randomUUID()}`;
    const comentarioMarker = `COMENTARIO-SECRETO-${randomUUID()}`;
    const submitted = await submitRadarRecommendationEvaluation(
      {
        tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver,
        recommendationId: setup.recommendationId, operationKey: `eval-${randomUUID().slice(0, 8)}`,
        ...validJudgment({ fundamentacao: "parcialmente_fundamentada", justificativa: justificativaMarker, comentario: comentarioMarker }),
      },
      prisma
    );

    const readByB = await getRadarRecommendationEvaluation(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorB, resolver: setup.resolver, evaluationId: submitted.evaluation.id },
      prisma
    );
    assert.equal(readByB.justificativa, justificativaMarker, "B recebe a justificativa exata escrita por A");
    assert.equal(readByB.comentario, comentarioMarker, "B recebe o comentário exato escrito por A");

    await revokeRadarEntityAccess(
      { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, entityId: setup.entity.id, granteeUserId: evaluatorB, operation: "read" },
      prisma
    );

    await assert.rejects(
      () => getRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: evaluatorB, resolver: setup.resolver, evaluationId: submitted.evaluation.id },
        prisma
      ),
      (e: unknown) => e instanceof RadarRecommendationEvaluationNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("revogação concorrente durante criação: quem trava a entidade primeiro decide o desfecho, sem inversão de ordem", async () => {
  const prisma = db();
  try {
    const setup = await setupEvaluatedRecommendation(prisma, "k-revoke-race");

    // --- Cenário 1: a REVOGAÇÃO trava primeiro -> vence -> a gravação
    // concorrente enfileirada depois é recusada.
    {
      const holderAppName = `radar-k-race1-holder-${randomUUID().slice(0, 8)}`;
      let releaseHolder!: () => void;
      const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
      const holderPromise = holdEntityRowLock(holderAppName, setup.entity.id, holderReleased);
      const observer1 = createNamedClient(`radar-k-race1-observer-${randomUUID().slice(0, 8)}`);

      await waitFor(
        async () => (await observeConnectionState(observer1.pool, holderAppName)).state === "idle in transaction",
        { timeoutMs: 5000, intervalMs: 20, label: "holder detém a trava da entidade (cenário 1)" }
      );

      const revokeAppName = `radar-k-race1-revoke-${randomUUID().slice(0, 8)}`;
      const revokeClient = createNamedClient(revokeAppName);
      const revokePromise = revokeRadarEntityAccess(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, entityId: setup.entity.id, granteeUserId: setup.creatorUserId, operation: "read" },
        revokeClient.prisma
      );
      await waitFor(
        async () => (await observeConnectionState(observer1.pool, revokeAppName)).waitEventType === "Lock",
        { timeoutMs: 5000, intervalMs: 20, label: "revogação enfileirada, esperando a trava da entidade (cenário 1)" }
      );

      const submitAppName = `radar-k-race1-submit-${randomUUID().slice(0, 8)}`;
      const submitClient = createNamedClient(submitAppName);
      const submitPromise = submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-race1-${randomUUID().slice(0, 8)}`, ...validJudgment() },
        submitClient.prisma
      );
      await waitFor(
        async () => (await observeConnectionState(observer1.pool, submitAppName)).waitEventType === "Lock",
        { timeoutMs: 5000, intervalMs: 20, label: "submit enfileirado, esperando a trava da entidade (cenário 1) — se isto der timeout, submitRadarRecommendationEvaluation não está contendendo pela trava da entidade (defeito)" }
      );

      releaseHolder();
      await holderPromise;
      await revokePromise;

      await assert.rejects(
        () => submitPromise,
        (e: unknown) => e instanceof RadarKnownEntityNotFoundError
      );

      const count1 = await prisma.radarRecommendationEvaluation.count({ where: { tenantId: setup.tenantId, workspaceId: setup.workspaceId, recommendationId: setup.recommendationId } });
      assert.equal(count1, 0, "revogação que venceu impede a gravação posterior não autorizada");

      await revokeClient.close(); await submitClient.close(); await observer1.close();
      await grantRadarEntityAccess(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, entityId: setup.entity.id, granteeUserId: setup.creatorUserId, operation: "read" },
        prisma
      );
    }

    // --- Cenário 2: a GRAVAÇÃO trava primeiro -> vence -> permanece
    // preservada; a revogação concorrente só afeta leituras futuras.
    {
      const holderAppName = `radar-k-race2-holder-${randomUUID().slice(0, 8)}`;
      let releaseHolder!: () => void;
      const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
      const holderPromise = holdEntityRowLock(holderAppName, setup.entity.id, holderReleased);
      const observer2 = createNamedClient(`radar-k-race2-observer-${randomUUID().slice(0, 8)}`);

      await waitFor(
        async () => (await observeConnectionState(observer2.pool, holderAppName)).state === "idle in transaction",
        { timeoutMs: 5000, intervalMs: 20, label: "holder detém a trava da entidade (cenário 2)" }
      );

      const submitAppName = `radar-k-race2-submit-${randomUUID().slice(0, 8)}`;
      const submitClient = createNamedClient(submitAppName);
      const submitPromise = submitRadarRecommendationEvaluation(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, recommendationId: setup.recommendationId, operationKey: `eval-race2-${randomUUID().slice(0, 8)}`, ...validJudgment() },
        submitClient.prisma
      );
      await waitFor(
        async () => (await observeConnectionState(observer2.pool, submitAppName)).waitEventType === "Lock",
        { timeoutMs: 5000, intervalMs: 20, label: "submit enfileirado, esperando a trava da entidade (cenário 2)" }
      );

      const revokeAppName = `radar-k-race2-revoke-${randomUUID().slice(0, 8)}`;
      const revokeClient = createNamedClient(revokeAppName);
      const revokePromise = revokeRadarEntityAccess(
        { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, entityId: setup.entity.id, granteeUserId: setup.creatorUserId, operation: "read" },
        revokeClient.prisma
      );
      await waitFor(
        async () => (await observeConnectionState(observer2.pool, revokeAppName)).waitEventType === "Lock",
        { timeoutMs: 5000, intervalMs: 20, label: "revogação enfileirada, esperando a trava da entidade (cenário 2)" }
      );

      releaseHolder();
      await holderPromise;

      const result = await submitPromise;
      await revokePromise;

      assert.equal(result.recovered, false);
      const stillThere = await prisma.radarRecommendationEvaluation.findUnique({ where: { id: result.evaluation.id } });
      assert.ok(stillThere, "gravação autorizada que venceu permanece preservada, mesmo com revogação concorrente logo depois");

      await assert.rejects(
        () => getRadarRecommendationEvaluation(
          { tenantId: setup.tenantId, workspaceId: setup.workspaceId, actorUserId: setup.creatorUserId, resolver: setup.resolver, evaluationId: result.evaluation.id },
          prisma
        ),
        (e: unknown) => e instanceof RadarRecommendationEvaluationNotFoundError,
        "leitura posterior exige autorização vigente — a revogação já efetivada bloqueia, mas não desfaz o que já foi gravado"
      );

      await submitClient.close(); await revokeClient.close(); await observer2.close();
    }
  } finally { await prisma.$disconnect(); }
});
