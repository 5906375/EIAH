// Radar Social — testes de integração HTTP da demonstração interna. Exige
// um Postgres descartável real via DATABASE_URL. Cobre: habilitação por
// padrão desabilitada, recusa de banco incompatível, jornada completa com
// grants persistidos, acesso negado/revogado, criação/recuperação
// idempotente, recuperação sem novo envio, limite de concorrência,
// avaliação+correção com histórico, proteção de campo sensível e ausência
// de chamada de rede a host externo.
//
// Usa `prismaGlobal` de "@repo/db" diretamente (nunca
// `createNamedClient`/`pg`/`@prisma/adapter-pg` de
// ../services/radarSocial/__tests__/helpers.ts): esse helper importa `pg` e
// `@prisma/adapter-pg` diretamente, pacotes que `apps/api/package.json` não
// declara como dependência própria (só `packages/db` os declara) — em
// resolução estrita de node_modules do pnpm isso falha com
// ERR_MODULE_NOT_FOUND antes mesmo de qualquer teste rodar, mesmo com os
// pacotes já presentes no store do pnpm (confirmado nesta rodada: o mesmo
// erro ocorre ao importar de helpers.ts em QUALQUER teste já existente da
// unidade, não é uma regressão introduzida aqui). Corrigir isso exigiria
// alterar `apps/api/package.json` ou rodar novamente o link do pnpm — fora
// do escopo autorizado nesta rodada ("não autorizo instalação de
// dependências"). Por isso este arquivo reimplementa localmente só o
// mínimo de setup (tenant/workspace/user/membership/escopo) usando
// `prismaGlobal`, sem depender de `helpers.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import express from "express";
import supertest from "supertest";
import { randomUUID } from "node:crypto";
import { prismaGlobal as prisma, getPrismaForTenant } from "@repo/db";
import { createRadarKnownEntity } from "../services/radarSocial/radarKnownEntityService";
import { revokeRadarEntityAccess } from "../services/radarSocial/radarEntityAccessGrantService";
import { createRunRecord, finalizeRunRecord } from "../services/runs";
import { governedErrorHandler } from "../middlewares/governedErrorHandler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  radarSocialRouter,
  radarDemoSubstituteCallCount,
  resetRadarDemoSubstituteCallCountForTesting,
  RADAR_DEMO_AGENT_KEY,
  RADAR_DEMO_AGENT_VERSION,
} from "../routes/radarSocial";
import {
  isRadarSocialDemoModeSyncEnabled,
  isRadarSocialDemoDbVerified,
  resetRadarSocialDemoDbVerificationCacheForTesting,
} from "../routes/radarSocialDemoGate";

/** Reimplementação local mínima — mesma forma de
 * ../services/radarSocial/__tests__/helpers.ts::seedTenantWorkspaceUser,
 * sem importar aquele arquivo (ver nota acima). */
async function seedTenantWorkspaceUser(opts: { tenantId: string; workspaceId: string; userId?: string }) {
  const userId = opts.userId ?? `${opts.tenantId}-user`;
  await prisma.tenant.create({ data: { id: opts.tenantId, name: opts.tenantId } });
  await prisma.workspace.create({ data: { id: opts.workspaceId, tenantId: opts.tenantId, name: opts.workspaceId } });
  await prisma.user.create({ data: { id: userId, tenantId: opts.tenantId, email: `${userId}@example.test` } });
  await prisma.tenantMembership.create({
    data: { id: `${opts.tenantId}-${userId}-membership`, tenantId: opts.tenantId, userId, updatedAt: new Date() },
  });
  return { userId };
}

async function grantScope(opts: { tenantId: string; workspaceId: string; scope: string }) {
  await prisma.tenantActionPolicy.create({
    data: { tenantId: opts.tenantId, workspaceId: opts.workspaceId, actionName: opts.scope, allowed: true },
  });
}

test.after(async () => {
  await prisma.$disconnect();
});

// --- 1. Prova estrutural: ausência de importação do transporte real ------

test("radarSocial.ts nunca importa runCompletion — único caminho é o substituto hardcoded", () => {
  const source = fs.readFileSync(path.join(__dirname, "../routes/radarSocial.ts"), "utf8");
  // Ignora comentários (a própria documentação do arquivo cita "runCompletion"
  // ao EXPLICAR a garantia) — verifica só código real: nenhuma linha de
  // import/require traz esse identificador para o escopo do módulo.
  const codeLines = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"));
  const codeOnly = codeLines.join("\n");
  assert.ok(!codeOnly.includes("runCompletion"), "radarSocial.ts não deve referenciar runCompletion em código real (fora de comentários)");
});

// --- 2. Habilitação desabilitada por padrão -------------------------------

test("gate síncrono: desabilitado por padrão, exige as três condições em conjunto", () => {
  assert.equal(isRadarSocialDemoModeSyncEnabled({}), false, "sem nenhuma variável, desabilitado");
  assert.equal(
    isRadarSocialDemoModeSyncEnabled({ RADAR_DEMO_MODE: "1", NODE_ENV: "production", RADAR_DEMO_DB_MARKER: "x" }),
    false,
    "produção nunca habilita, mesmo com a flag"
  );
  assert.equal(
    isRadarSocialDemoModeSyncEnabled({ RADAR_DEMO_MODE: "1", NODE_ENV: "test" }),
    false,
    "sem RADAR_DEMO_DB_MARKER, desabilitado"
  );
  assert.equal(
    isRadarSocialDemoModeSyncEnabled({ RADAR_DEMO_MODE: "1", NODE_ENV: "test", RADAR_DEMO_DB_MARKER: "x" }),
    true,
    "as três condições juntas habilitam"
  );
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(radarSocialRouter);
  app.use(governedErrorHandler);
  return app;
}

test("habilitação local bloqueada por padrão: sem RADAR_DEMO_MODE, qualquer rota responde 503", async () => {
  resetRadarSocialDemoDbVerificationCacheForTesting();
  const app = buildApp();
  const res = await supertest(app).get("/entities").set("authorization", "Bearer irrelevante-nesta-checagem");
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, "RADAR_DEMO_UNAVAILABLE");
});

// --- 3. Recusa de banco incompatível ---------------------------------------

test("recusa de banco incompatível: marcador ausente/divergente bloqueia, sem tentar outro banco", async () => {
  resetRadarSocialDemoDbVerificationCacheForTesting();
  const env = { RADAR_DEMO_MODE: "1", NODE_ENV: "test", RADAR_DEMO_DB_MARKER: `marcador-inexistente-${randomUUID()}` };
  const verified = await isRadarSocialDemoDbVerified(prisma, env);
  assert.equal(verified, false, "token sem linha correspondente na tabela _radar_demo_marker nunca verifica");
});

// --- 3b. Correção pontual em finalizeRunRecord (apps/api/src/services/runs.ts) ---
//
// Achado desta rodada: finalizeRunRecord fazia client.run.update({where:
// {id: scopedRunId}}) sem tenantId/workspaceId — nunca falhava porque todo
// chamador de produção até aqui (workers em background) usa prismaGlobal,
// sem tenantGuard. runGovernedAnalysis, acionado pela rota do Radar Social
// com o client tenant-guarded real (req.prisma via getPrismaForTenant), é o
// primeiro chamador a expor isso. Corrigido incluindo tenantId/workspaceId
// no where — assertRunScope, logo acima na mesma função, já garantia que
// scopedRunId pertence a esse tenant/workspace, então a correção não muda o
// conjunto de linhas afetadas para nenhum chamador existente (workers
// incluídos). Este teste prova as duas pontas: conclusão bem-sucedida
// através de um client tenant-guarded real, e recusa (sem lançar, sem
// atualizar) quando o escopo informado não corresponde ao run.

test("finalizeRunRecord: conclui através de client tenant-guarded real; recusa update em escopo incompatível", async (t) => {
  const tenantId = `t-run-guard-${randomUUID().slice(0, 8)}`;
  const workspaceId = `w-run-guard-${randomUUID().slice(0, 8)}`;
  const otherTenantId = `t-run-guard-other-${randomUUID().slice(0, 8)}`;
  const otherWorkspaceId = `w-run-guard-other-${randomUUID().slice(0, 8)}`;
  await seedTenantWorkspaceUser({ tenantId, workspaceId });
  await seedTenantWorkspaceUser({ tenantId: otherTenantId, workspaceId: otherWorkspaceId });
  const agentKey = `test-agent-${randomUUID().slice(0, 8)}`;
  await prisma.agentMetadata.create({ data: { agent: agentKey, displayName: "Agente de teste — tenantGuard", version: "1.0.0" } });
  await prisma.workspaceAgentAssignment.create({ data: { tenantId, workspaceId, agentKey, agentVersion: "1.0.0", enabled: true } });

  const guardedClient = getPrismaForTenant(tenantId, workspaceId);
  t.after(() => void guardedClient.$disconnect());

  const run = await createRunRecord(
    { prisma: guardedClient as unknown as Parameters<typeof createRunRecord>[0]["prisma"], tenantId, workspaceId, agent: agentKey, status: "running", request: { test: true } }
  );
  assert.ok(run.id, "createRunRecord já funcionava através do client tenant-guarded (achado é específico de finalizeRunRecord)");

  const finalized = await finalizeRunRecord({
    prisma: guardedClient as unknown as Parameters<typeof finalizeRunRecord>[0]["prisma"],
    runId: run.id, tenantId, workspaceId, status: "success", response: { ok: true },
  });
  assert.ok(finalized, "conclusão pelo client tenant-guarded, no tenant correto, deve suceder após a correção");
  assert.equal((finalized as { status: string }).status, "success");

  // Escopo incompatível: mesmo runId, tenantId/workspaceId de OUTRO tenant —
  // protegido por assertRunScope (independente do tenantGuard do client),
  // comportamento preexistente, não alterado por esta correção.
  const refused = await finalizeRunRecord({
    prisma, runId: run.id, tenantId: otherTenantId, workspaceId: otherWorkspaceId, status: "error", response: { ok: false },
  });
  assert.equal(refused, null, "escopo incompatível é recusado (assertRunScope), sem atualizar a linha de outro tenant");

  const stillSuccess = await prisma.run.findFirst({ where: { id: run.id, tenantId, workspaceId } });
  assert.equal(stillSuccess?.status, "success", "a tentativa de escopo incompatível não alterou a linha real");
});

// --- Jornada completa, com isolamento de rede real e todas as garantias ---

test("jornada completa com grants persistidos, execução governada, recuperação e avaliação com histórico", async (t) => {
  const marker = `marker-${randomUUID()}`;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _radar_demo_marker (token TEXT PRIMARY KEY)`);
  await prisma.$executeRawUnsafe(`INSERT INTO _radar_demo_marker (token) VALUES ($1) ON CONFLICT DO NOTHING`, marker);
  resetRadarSocialDemoDbVerificationCacheForTesting();
  const env = { RADAR_DEMO_MODE: "1", NODE_ENV: "test", RADAR_DEMO_DB_MARKER: marker };
  assert.equal(await isRadarSocialDemoDbVerified(prisma, env), true);

  // O middleware do router lê `process.env` de verdade (nunca o objeto acima,
  // usado só para a checagem unitária direta) — precisa refletir as mesmas
  // três condições para que as chamadas HTTP abaixo sejam aceitas.
  const savedEnv = { RADAR_DEMO_MODE: process.env.RADAR_DEMO_MODE, NODE_ENV: process.env.NODE_ENV, RADAR_DEMO_DB_MARKER: process.env.RADAR_DEMO_DB_MARKER };
  process.env.RADAR_DEMO_MODE = "1";
  process.env.NODE_ENV = "test";
  process.env.RADAR_DEMO_DB_MARKER = marker;
  resetRadarSocialDemoDbVerificationCacheForTesting();
  t.after(() => {
    process.env.RADAR_DEMO_MODE = savedEnv.RADAR_DEMO_MODE;
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    process.env.RADAR_DEMO_DB_MARKER = savedEnv.RADAR_DEMO_DB_MARKER;
    resetRadarSocialDemoDbVerificationCacheForTesting();
  });

  const { tenantId, workspaceId } = { tenantId: `t-radar-demo-${randomUUID().slice(0, 8)}`, workspaceId: `w-radar-demo-${randomUUID().slice(0, 8)}` };
  const { userId } = await seedTenantWorkspaceUser({ tenantId, workspaceId });
  for (const scope of [
    "radar_social.read",
    "radar_social.entities.manage",
    "radar_social.materials.write",
    "radar_social.analysis.request",
    "radar_social.analysis.execute",
    "radar_social.recommendation.evaluate",
  ]) {
    await grantScope({ tenantId, workspaceId, scope });
  }
  const token = `test-token-${randomUUID()}`;
  await prisma.apiToken.create({ data: { tenantId, workspaceId, userId, token, revoked: false } });
  await prisma.agentMetadata.upsert({
    where: { agent: RADAR_DEMO_AGENT_KEY },
    create: { agent: RADAR_DEMO_AGENT_KEY, displayName: "Agente sintético de teste", version: RADAR_DEMO_AGENT_VERSION },
    update: { version: RADAR_DEMO_AGENT_VERSION },
  });
  await prisma.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId, agentKey: RADAR_DEMO_AGENT_KEY, agentVersion: RADAR_DEMO_AGENT_VERSION, enabled: true },
  });
  const entity = await createRadarKnownEntity(
    { tenantId, workspaceId, actorUserId: userId, input: { displayName: "Empresa Fictícia Teste" } },
    prisma
  );

  resetRadarDemoSubstituteCallCountForTesting();

  // Bloqueio de rede real: qualquer tentativa de sair para um host fora do
  // loopback durante esta jornada é um erro de teste — conexões locais ao
  // Postgres (net, não http/https) nunca são afetadas.
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;
  const blockedAttempts: string[] = [];
  function guard(original: typeof http.request) {
    return function guarded(this: unknown, ...args: unknown[]) {
      const target = args[0];
      const hostname =
        typeof target === "string"
          ? new URL(target).hostname
          : typeof target === "object" && target !== null
            ? (target as { hostname?: string; host?: string }).hostname ?? (target as { host?: string }).host ?? ""
            : "";
      if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "") {
        blockedAttempts.push(String(hostname));
        throw new Error(`radar-demo-network-guard: tentativa de rede bloqueada para host "${hostname}"`);
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
  (http as unknown as { request: unknown }).request = guard(originalHttpRequest);
  (https as unknown as { request: unknown }).request = guard(originalHttpsRequest);
  t.after(() => {
    (http as unknown as { request: unknown }).request = originalHttpRequest;
    (https as unknown as { request: unknown }).request = originalHttpsRequest;
  });

  const app = buildApp();
  const authed = () => ({
    get: (url: string) => supertest(app).get(url).set("authorization", `Bearer ${token}`),
    post: (url: string) => supertest(app).post(url).set("authorization", `Bearer ${token}`),
  });

  await t.test("GET /entities lista a entidade recém-criada", async () => {
    const res = await supertest(app).get("/entities").set("authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.some((e: { id: string }) => e.id === entity.id));
  });

  const materialOperationKey = `mat-op-${randomUUID()}`;
  let materialId = "";
  await t.test("POST material: criação e recuperação idempotente (sem duplicar)", async () => {
    const first = await supertest(app)
      .post(`/entities/${entity.id}/materials`)
      .set("authorization", `Bearer ${token}`)
      .send({ conteudo: "Empresa Fictícia Teste anunciou expansão para o Recife.", fonteDeclarada: "fonte sintética", operationKey: materialOperationKey });
    assert.equal(first.status, 201);
    materialId = first.body.material.id;

    const replay = await supertest(app)
      .post(`/entities/${entity.id}/materials`)
      .set("authorization", `Bearer ${token}`)
      .send({ conteudo: "Empresa Fictícia Teste anunciou expansão para o Recife.", fonteDeclarada: "fonte sintética", operationKey: materialOperationKey });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.recovered, true);
    assert.equal(replay.body.material.id, materialId, "reenvio nunca cria um segundo material");
  });

  const requestOperationKey = `req-op-${randomUUID()}`;
  let requestId = "";
  let attemptId = "";
  await t.test("POST analysis-requests: identidade de agente do corpo é rejeitada; criação/recuperação idempotente da 1ª tentativa", async () => {
    const withAgentKey = await supertest(app)
      .post(`/entities/${entity.id}/analysis-requests`)
      .set("authorization", `Bearer ${token}`)
      .send({ materialId, objective: "avaliar sinais", operationKey: `${requestOperationKey}-rejeitado`, agentKey: "algo-escolhido-pelo-navegador" });
    assert.equal(withAgentKey.status, 400);
    assert.equal(withAgentKey.body.error.code, "radar_demo_agent_identity_not_client_controlled");

    const first = await supertest(app)
      .post(`/entities/${entity.id}/analysis-requests`)
      .set("authorization", `Bearer ${token}`)
      .send({ materialId, objective: "avaliar sinais de expansão", operationKey: requestOperationKey });
    assert.equal(first.status, 201);
    requestId = first.body.request.id;
    attemptId = first.body.firstAttempt.id;
    assert.equal(first.body.firstAttempt.attemptNumber, 1);

    const replay = await supertest(app)
      .post(`/entities/${entity.id}/analysis-requests`)
      .set("authorization", `Bearer ${token}`)
      .send({ materialId, objective: "avaliar sinais de expansão", operationKey: requestOperationKey });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.recovered, true);
    assert.equal(replay.body.firstAttempt.id, attemptId, "reenvio nunca cria uma segunda tentativa");
  });

  await t.test("Consultar/atualizar página nunca dispara análise: GET repetido não incrementa o substituto", async () => {
    await authed().get(`/attempts/${attemptId}`);
    await authed().get(`/attempts/${attemptId}`);
    await authed().get(`/attempts/${attemptId}`);
    assert.equal(radarDemoSubstituteCallCount, 0);
  });

  await t.test("POST /attempts/:id/run: execução governada com transporte substituído, sem claimToken na resposta", async () => {
    const res = await authed().post(`/attempts/${attemptId}/run`).send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.attempt.status, "completed");
    assert.equal(Object.prototype.hasOwnProperty.call(res.body.attempt, "claimToken"), false, "claimToken nunca exposto");
    assert.ok(res.body.recommendation);
    assert.equal(radarDemoSubstituteCallCount, 1, "exatamente uma chamada ao transporte substituto");
    assert.equal(blockedAttempts.length, 0, "nenhuma tentativa de rede externa durante a execução governada");
  });

  await t.test("Recuperação sem novo envio: GET da recomendação repetido não incrementa o substituto", async () => {
    const first = await authed().get(`/analysis-requests/${requestId}/recommendation`);
    assert.equal(first.status, 200);
    const second = await authed().get(`/analysis-requests/${requestId}/recommendation`);
    assert.equal(second.status, 200);
    assert.equal(second.body.recommendation.id, first.body.recommendation.id);
    assert.equal(radarDemoSubstituteCallCount, 1, "recuperação via GET nunca aciona o transporte de novo");
  });

  let recommendationId = "";
  const evaluationOperationKey = `eval-op-${randomUUID()}`;
  await t.test("Avaliação humana + correção com histórico", async () => {
    const rec = await authed().get(`/analysis-requests/${requestId}/recommendation`);
    recommendationId = rec.body.recommendation.id;

    const first = await authed()
      .post(`/recommendations/${recommendationId}/evaluations`)
      .send({ fundamentacao: "bem_fundamentada", clareza: "clara", utilidade: "util", operationKey: evaluationOperationKey });
    assert.equal(first.status, 201);
    const evaluationId = first.body.evaluation.id;

    const correction = await authed()
      .post(`/recommendations/${recommendationId}/evaluations`)
      .send({
        fundamentacao: "parcialmente_fundamentada", clareza: "clara", utilidade: "util",
        justificativa: "Na prática, faltou uma referência adicional.",
        operationKey: `${evaluationOperationKey}-correcao`, supersedesEvaluationId: evaluationId,
      });
    assert.equal(correction.status, 201);

    const history = await authed().get(`/recommendations/${recommendationId}/evaluations`);
    assert.equal(history.status, 200);
    assert.equal(history.body.evaluations.length, 2, "histórico mostra as duas linhas — original e correção, nunca substitui");
  });

  await t.test("Proteção de campo sensível: nenhuma resposta desta jornada contém preservedResultPayload/claimToken/Run cru", async () => {
    const responses = await Promise.all([
      authed().get(`/entities/${entity.id}`),
      authed().get(`/attempts/${attemptId}`),
      authed().get(`/analysis-requests/${requestId}/recommendation`),
      authed().get(`/recommendations/${recommendationId}/evaluations`),
    ]);
    for (const res of responses) {
      const raw = JSON.stringify(res.body);
      assert.ok(!raw.includes("preservedResultPayload"), "preservedResultPayload nunca deve aparecer");
      assert.ok(!raw.includes("claimToken"), "claimToken nunca deve aparecer");
    }
  });

  await t.test("Acesso negado/revogado: revogar 'read' faz a entidade sumir, sem distinguir inexistência de negação", async () => {
    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: userId, entityId: entity.id, granteeUserId: userId, operation: "read" }, prisma);
    const res = await authed().get(`/entities/${entity.id}`);
    assert.equal(res.status, 404);
    assert.ok(String(res.body.error.code).startsWith("radar_"), "reasonCode unificado, nunca revela mais que 'não encontrado ou sem acesso'");
  });

  assert.equal(blockedAttempts.length, 0, "nenhuma chamada de rede externa em toda a jornada");
});

// --- Limite de concorrência ------------------------------------------------

test("limite de concorrência da demonstração: duas tentativas concorrentes, só uma ocupa a vaga (limit=1)", async (t) => {
  const marker = `marker-conc-${randomUUID()}`;
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _radar_demo_marker (token TEXT PRIMARY KEY)`);
  await prisma.$executeRawUnsafe(`INSERT INTO _radar_demo_marker (token) VALUES ($1) ON CONFLICT DO NOTHING`, marker);
  resetRadarSocialDemoDbVerificationCacheForTesting();
  const env = { RADAR_DEMO_MODE: "1", NODE_ENV: "test", RADAR_DEMO_DB_MARKER: marker };
  assert.equal(await isRadarSocialDemoDbVerified(prisma, env), true);

  const savedEnv = { RADAR_DEMO_MODE: process.env.RADAR_DEMO_MODE, NODE_ENV: process.env.NODE_ENV, RADAR_DEMO_DB_MARKER: process.env.RADAR_DEMO_DB_MARKER };
  process.env.RADAR_DEMO_MODE = "1";
  process.env.NODE_ENV = "test";
  process.env.RADAR_DEMO_DB_MARKER = marker;
  resetRadarSocialDemoDbVerificationCacheForTesting();
  t.after(() => {
    process.env.RADAR_DEMO_MODE = savedEnv.RADAR_DEMO_MODE;
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    process.env.RADAR_DEMO_DB_MARKER = savedEnv.RADAR_DEMO_DB_MARKER;
    resetRadarSocialDemoDbVerificationCacheForTesting();
  });

  const tenantId = `t-radar-conc-${randomUUID().slice(0, 8)}`;
  const workspaceId = `w-radar-conc-${randomUUID().slice(0, 8)}`;
  const { userId } = await seedTenantWorkspaceUser({ tenantId, workspaceId });
  for (const scope of ["radar_social.read", "radar_social.entities.manage", "radar_social.materials.write", "radar_social.analysis.request", "radar_social.analysis.execute"]) {
    await grantScope({ tenantId, workspaceId, scope });
  }
  const token = `test-token-${randomUUID()}`;
  await prisma.apiToken.create({ data: { tenantId, workspaceId, userId, token, revoked: false } });
  await prisma.agentMetadata.upsert({
    where: { agent: RADAR_DEMO_AGENT_KEY },
    create: { agent: RADAR_DEMO_AGENT_KEY, displayName: "Agente sintético de teste", version: RADAR_DEMO_AGENT_VERSION },
    update: { version: RADAR_DEMO_AGENT_VERSION },
  });
  await prisma.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId, agentKey: RADAR_DEMO_AGENT_KEY, agentVersion: RADAR_DEMO_AGENT_VERSION, enabled: true },
  });
  const entity = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "Empresa Concorrência" } }, prisma);

  const app = buildApp();
  const authed = () => ({
    get: (url: string) => supertest(app).get(url).set("authorization", `Bearer ${token}`),
    post: (url: string) => supertest(app).post(url).set("authorization", `Bearer ${token}`),
  });

  async function createPendingAttempt(suffix: string) {
    const material = await authed()
      .post(`/entities/${entity.id}/materials`)
      .send({ conteudo: `Material de concorrência ${suffix} com um trecho citável.`, fonteDeclarada: "teste", operationKey: `mat-${suffix}-${randomUUID()}` });
    const request = await authed()
      .post(`/entities/${entity.id}/analysis-requests`)
      .send({ materialId: material.body.material.id, objective: "objetivo de teste", operationKey: `req-${suffix}-${randomUUID()}` });
    return request.body.firstAttempt.id as string;
  }

  const [attemptA, attemptB] = await Promise.all([createPendingAttempt("a"), createPendingAttempt("b")]);

  const [resA, resB] = await Promise.all([
    authed().post(`/attempts/${attemptA}/run`).send({}),
    authed().post(`/attempts/${attemptB}/run`).send({}),
  ]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 409], "exatamente uma das duas tentativas concorrentes ocupa a vaga única");
  const rejected = resA.status === 409 ? resA : resB;
  assert.equal(rejected.body.error.code, "provider_call_slot_unavailable");
});
