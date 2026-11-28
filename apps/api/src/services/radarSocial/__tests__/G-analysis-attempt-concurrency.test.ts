// Cenário G — protocolo explícito de posse (Atualização 1.18): claim
// concorrente real, trabalhador antigo rejeitado, espera por trava
// ultrapassando a expiração, e reclaim de tentativa abandonada. Coordenação
// determinística via pg_stat_activity — nenhum sleep como sincronização.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, createNamedClient,
  alwaysAuthorizedResolver, seedEntityAndMaterial, defaultGenerationConfigInput, defaultRecommendationCandidate,
  backdateAttemptClaim, holdAttemptRowLock, waitFor, observeConnectionState,
} from "./helpers";
import { createRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { claimAttempt, preserveResult, reclaimExpiredAttempt, ATTEMPT_LEASE_TTL_SECONDS } from "../radarAnalysisAttemptService";
import { RadarAnalysisAttemptConflictError } from "../radarAnalysisAttemptContract";
import { randomUUID } from "node:crypto";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-g-${++clientSeq}-${process.pid}`).prisma;
}

async function setup(prisma: ReturnType<typeof db>, prefix: string) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  const { entity, material } = await seedEntityAndMaterial(prisma, { tenantId, workspaceId, userId });
  const request = await createRadarAnalysisRequest(
    { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: `op-${randomUUID().slice(0, 8)}` }, generationConfigInput: defaultGenerationConfigInput() },
    prisma
  );
  return { tenantId, workspaceId, userId, entity, material, request };
}

test("token, estado e prazo válidos: escrita aceita (caminho feliz do protocolo)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-happy");
    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver: alwaysAuthorizedResolver() }, prisma);
    const updated = await preserveResult({
      tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken,
      executorOutput: { candidate: defaultRecommendationCandidate(), provider: "p", model: "radar-test-model-v1", providerRequestId: "r1" },
    }, prisma);
    assert.equal(updated.status, "provider_responded_pending_persistence");
  } finally { await prisma.$disconnect(); }
});

test("claim concorrente: duas reivindicações simultâneas da mesma tentativa pending — só uma vence", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-claimrace");
    const attempt = () => claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: `w-${randomUUID().slice(0, 4)}`, resolver: alwaysAuthorizedResolver() }, prisma);
    const results = await Promise.allSettled([attempt(), attempt()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof RadarAnalysisAttemptConflictError);
  } finally { await prisma.$disconnect(); }
});

test("trabalhador antigo (token substituído) não pode preservar nem concluir depois do reclaim", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-stale");
    const { claimToken: oldToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w-old", resolver: alwaysAuthorizedResolver() }, prisma);

    // Simula que o trabalhador antigo "morreu": posse expirada, sem
    // esperar o TTL real (backdating, mesma técnica de D6).
    await backdateAttemptClaim(prisma, request.firstAttempt.id, ATTEMPT_LEASE_TTL_SECONDS + 1);

    const { claimToken: newToken } = await reclaimExpiredAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w-new" }, prisma);
    assert.notEqual(newToken, oldToken);

    // O trabalhador antigo tenta preservar com o token velho — rejeitado.
    await assert.rejects(
      () => preserveResult({
        tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken: oldToken,
        executorOutput: { candidate: defaultRecommendationCandidate(), provider: "p", model: "radar-test-model-v1", providerRequestId: "r-old" },
      }, prisma),
      RadarAnalysisAttemptConflictError
    );

    // O trabalhador novo, com o token correto, consegue.
    const updated = await preserveResult({
      tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken: newToken,
      executorOutput: { candidate: defaultRecommendationCandidate(), provider: "p", model: "radar-test-model-v1", providerRequestId: "r-new" },
    }, prisma);
    assert.equal(updated.status, "provider_responded_pending_persistence");
  } finally { await prisma.$disconnect(); }
});

test("expiração sem reclaim: mesmo sem outro trabalhador, prazo vencido rejeita a escrita do detentor original", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-selfexpire");
    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver: alwaysAuthorizedResolver() }, prisma);
    await backdateAttemptClaim(prisma, request.firstAttempt.id, ATTEMPT_LEASE_TTL_SECONDS + 1);

    await assert.rejects(
      () => preserveResult({
        tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken,
        executorOutput: { candidate: defaultRecommendationCandidate(), provider: "p", model: "radar-test-model-v1", providerRequestId: "r1" },
      }, prisma),
      (e: unknown) => e instanceof RadarAnalysisAttemptConflictError && e.reasonCode === "preserve_result_rejected_stale_or_expired_claim"
    );
  } finally { await prisma.$disconnect(); }
});

test("reclaim concorrente: duas reconciliações disputando a mesma tentativa expirada — só uma vence", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-reclaimrace");
    await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w-old", resolver: alwaysAuthorizedResolver() }, prisma);
    await backdateAttemptClaim(prisma, request.firstAttempt.id, ATTEMPT_LEASE_TTL_SECONDS + 1);

    const reclaim = () => reclaimExpiredAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: `w-${randomUUID().slice(0, 4)}` }, prisma);
    const results = await Promise.allSettled([reclaim(), reclaim()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  } finally { await prisma.$disconnect(); }
});

test("reclaim: não expirado é rejeitado (proteção contra reconciliação prematura)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-notyet");
    await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver: alwaysAuthorizedResolver() }, prisma);
    await assert.rejects(
      () => reclaimExpiredAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w2" }, prisma),
      (e: unknown) => e instanceof RadarAnalysisAttemptConflictError && e.reasonCode === "reclaim_rejected_not_expired_or_lost_race"
    );
  } finally { await prisma.$disconnect(); }
});

test("espera por trava ultrapassando a expiração: operação obtém a trava depois do prazo já vencido e é recusada", async () => {
  const prisma = db();
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { tenantId, workspaceId, request } = await setup(prisma, "g-lockwait");
    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver: alwaysAuthorizedResolver() }, prisma);
    // Já nasce "quase expirado": só 1s de folga — a espera pela trava abaixo
    // (mais o tempo de round-trip) é suficiente para ultrapassar o prazo.
    await backdateAttemptClaim(prisma, request.firstAttempt.id, ATTEMPT_LEASE_TTL_SECONDS - 1);

    let releaseHold: () => void;
    const holdReleaseSignal = new Promise<void>((resolve) => { releaseHold = resolve; });
    const holderAppName = "poc-radar-g-holder";
    const holdPromise = holdAttemptRowLock(holderAppName, request.firstAttempt.id, holdReleaseSignal);

    // Espera determinística até o holder realmente estar segurando a trava
    // (idle in transaction) antes de disparar a segunda operação.
    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, holderAppName);
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "holder com a trava" });

    const preservePromise = preserveResult({
      tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken,
      executorOutput: { candidate: defaultRecommendationCandidate(), provider: "p", model: "radar-test-model-v1", providerRequestId: "r1" },
    }, prisma);

    // Aguarda mais de 1s (o tempo de folga restante) segurando a trava —
    // tempo real passa enquanto a segunda operação fica bloqueada esperando.
    await new Promise((r) => setTimeout(r, 1500));
    releaseHold!();
    await holdPromise;

    await assert.rejects(
      () => preservePromise,
      (e: unknown) => e instanceof RadarAnalysisAttemptConflictError && e.reasonCode === "preserve_result_rejected_stale_or_expired_claim"
    );
  } finally {
    await prisma.$disconnect();
    await observerPool.end();
  }
});
