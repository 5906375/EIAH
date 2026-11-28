// Cenário H — resolvedor real de acesso do Radar Social: RadarEntityAccessGrant,
// grants iniciais atômicos, concessão/revogação com protocolo de
// concorrência (ponto de serialização único na linha de RadarKnownEntity),
// proteção do último gestor ELEGÍVEL, auditoria atômica e revogação versus
// conclusão. Ver docs/architecture/radar-social-construction-plan-v1.md,
// Atualizações 1.21, 1.22, 1.24 e 1.25. Nenhuma chamada real a modelo em
// nenhum teste deste arquivo.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, createNamedClient,
  alwaysAuthorizedResolver, defaultGenerationConfigInput, defaultRecommendationCandidate,
  fakeExecutor, waitFor, observeConnectionState, holdEntityRowLock,
} from "./helpers";
import { createRadarKnownEntity, RadarKnownEntityNotFoundError } from "../radarKnownEntityService";
import {
  grantRadarEntityAccess, revokeRadarEntityAccess, listRadarEntityAccessGrants, createRadarEntityAccessResolver,
} from "../radarEntityAccessGrantService";
import { RadarEntityAccessGrantConflictError, RadarEntityAccessGrantError } from "../radarEntityAccessGrantContract";
import { RadarSocialAuthorizationError } from "../radarEntityAccessResolver";
import { createRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { claimAttempt, preserveResult, concludeAttempt } from "../radarAnalysisAttemptService";
import { RadarAnalysisAttemptConflictError } from "../radarAnalysisAttemptContract";
import { getRadarRecommendation, RadarRecommendationNotFoundError } from "../radarRecommendationService";
import { randomUUID } from "node:crypto";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-h-${++clientSeq}-${process.pid}`).prisma;
}

async function setupEntity(prisma: ReturnType<typeof db>, prefix: string) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId: creatorUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  const entity = await createRadarKnownEntity(
    { tenantId, workspaceId, actorUserId: creatorUserId, input: { displayName: "Entidade de teste — acesso" } },
    prisma
  );
  return { tenantId, workspaceId, creatorUserId, entity };
}

test("criador: quatro grants iniciais criados atomicamente com a entidade, revogáveis", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-creator");
    const grants = await listRadarEntityAccessGrants(
      { tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, resolver: alwaysAuthorizedResolver() },
      prisma
    );
    const operations = grants.map((g) => g.operation).sort();
    assert.deepEqual(operations, ["analyze", "manage", "read", "write"]);
    assert.ok(grants.every((g) => g.granteeUserId === creatorUserId && g.grantedByUserId === creatorUserId));

    // Revogável: revogar "write" do criador não é bloqueado por nenhuma guarda.
    await revokeRadarEntityAccess(
      { tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "write" },
      prisma
    );
    const resolver = createRadarEntityAccessResolver(prisma);
    const outcome = await resolver({ confirmedIdentity: creatorUserId, tenantId, workspaceId, entityId: entity.id, operation: "write" });
    assert.equal(outcome, "access_denied");
  } finally { await prisma.$disconnect(); }
});

test("permissões independentes: read concedido não implica analyze/write/manage", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-independent");
    const { userId: secondUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId, userId: `${tenantId}-second-user` });
    await grantRadarEntityAccess(
      { tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "read" },
      prisma
    );
    const resolver = createRadarEntityAccessResolver(prisma);
    assert.equal(await resolver({ confirmedIdentity: secondUserId, tenantId, workspaceId, entityId: entity.id, operation: "read" }), "authorized");
    for (const op of ["analyze", "write", "manage"] as const) {
      assert.equal(await resolver({ confirmedIdentity: secondUserId, tenantId, workspaceId, entityId: entity.id, operation: op }), "access_denied");
    }
  } finally { await prisma.$disconnect(); }
});

test("concessão/revogação e auditoria atômicas: transição real audita uma vez; repetição não audita; guarda reprovada não deixa rastro", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-audit");
    const { userId: secondUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId, userId: `${tenantId}-second-user` });

    // Filtra por substring do campo `message` (String simples) em vez de
    // filtro de caminho JSON — evita depender de suporte específico de
    // versão do conector a filtros de JSON path, mesma informação está
    // presente em texto (entity/grantee/operation) em toda mensagem gravada.
    const countAuditEvents = (eventType: string, granteeUserId: string, operation: string) =>
      prisma.guardrailAuditLedger.count({
        where: {
          tenantId, workspaceId, eventType,
          message: { contains: `operation=${operation} entity=${entity.id} grantee=${granteeUserId}` },
        },
      });

    await grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "read" }, prisma);
    assert.equal(await countAuditEvents("radar_entity_access_granted", secondUserId, "read"), 1);

    // Repetição sem mudança de estado: não audita de novo.
    await grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "read" }, prisma);
    assert.equal(await countAuditEvents("radar_entity_access_granted", secondUserId, "read"), 1, "repetição não gera segundo evento");

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "read" }, prisma);
    assert.equal(await countAuditEvents("radar_entity_access_revoked", secondUserId, "read"), 1);

    // Revogação repetida: já não está enabled -> no-op, sem segundo evento.
    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "read" }, prisma);
    assert.equal(await countAuditEvents("radar_entity_access_revoked", secondUserId, "read"), 1, "revogação repetida não gera segundo evento");

    // Guarda do último gestor reprova -> nem estado nem auditoria mudam.
    await assert.rejects(
      () => revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "manage" }, prisma),
      RadarEntityAccessGrantConflictError
    );
    assert.equal(await countAuditEvents("radar_entity_access_revoked", creatorUserId, "manage"), 0, "guarda reprovada não deixa rastro de auditoria");
    const resolver = createRadarEntityAccessResolver(prisma);
    assert.equal(await resolver({ confirmedIdentity: creatorUserId, tenantId, workspaceId, entityId: entity.id, operation: "manage" }), "authorized", "estado do grant reprovado permanece intacto");
  } finally { await prisma.$disconnect(); }
});

test("gestor inelegível excluído da contagem: grant fantasma (sem membership) não protege nem bloqueia limpeza", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-ineligible");
    const phantomUserId = `phantom-${randomUUID().slice(0, 8)}`; // nunca recebe TenantMembership
    await grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: phantomUserId, operation: "manage" }, prisma);

    // O criador continua sendo o ÚNICO gestor ELEGÍVEL (o fantasma não conta) —
    // revogar o criador deve ser bloqueado mesmo com duas linhas "manage" habilitadas.
    await assert.rejects(
      () => revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "manage" }, prisma),
      (e: unknown) => e instanceof RadarEntityAccessGrantConflictError && e.reasonCode === "cannot_revoke_last_eligible_manage_grant"
    );

    // Remover o grant fantasma NUNCA é bloqueado — ele não conta como gestor real.
    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: phantomUserId, operation: "manage" }, prisma);
    const resolver = createRadarEntityAccessResolver(prisma);
    assert.equal(await resolver({ confirmedIdentity: phantomUserId, tenantId, workspaceId, entityId: entity.id, operation: "manage" }), "access_denied");
  } finally { await prisma.$disconnect(); }
});

test("perda de manage durante a espera: revalidação sob a trava rejeita, nunca usa autorização anterior à espera", async () => {
  const prisma = db();
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-loseduringwait");
    const { userId: secondUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId, userId: `${tenantId}-second-user` });
    // Segundo usuário também é gestor elegível, para podermos revogar SEU
    // manage enquanto ele mesmo tenta conceder algo (concorrente).
    await grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "manage" }, prisma);

    let releaseHold: () => void;
    const holdReleaseSignal = new Promise<void>((resolve) => { releaseHold = resolve; });
    const holderAppName = "poc-radar-h-holder";
    const holdPromise = holdEntityRowLock(holderAppName, entity.id, holdReleaseSignal);

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, holderAppName);
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "holder segurando a trava da entidade" });

    // Enquanto a trava está retida por outra conexão: o criador revoga o
    // manage do secondUserId ATRAVÉS de uma chamada real, que também
    // precisa da MESMA trava — então ela fica enfileirada atrás do holder,
    // não antes dele. Para simular "perde manage enquanto espera" de forma
    // determinística sem depender de ordem de fila, revogamos diretamente
    // via SQL (equivalente a uma revogação que já comitou antes do holder
    // liberar), então disparamos a tentativa de secondUserId DEPOIS,
    // enquanto o holder ainda segura a trava.
    await prisma.$executeRawUnsafe(
      `UPDATE radar_entity_access_grants SET enabled=false, revoked_by_user_id=$1, revoked_at=clock_timestamp()
       WHERE tenant_id=$2 AND workspace_id=$3 AND entity_id=$4 AND grantee_user_id=$5 AND operation='manage' AND enabled=true`,
      creatorUserId, tenantId, workspaceId, entity.id, secondUserId
    );

    const waitingCall = grantRadarEntityAccess(
      { tenantId, workspaceId, actorUserId: secondUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "analyze" },
      prisma
    );

    await new Promise((r) => setTimeout(r, 300));
    releaseHold!();
    await holdPromise;

    await assert.rejects(
      () => waitingCall,
      (e: unknown) => e instanceof RadarEntityAccessGrantError && e.reasonCode === "actor_manage_not_active"
    );
  } finally {
    await prisma.$disconnect();
    await observerPool.end();
  }
});

test("revogações cruzadas entre gestores: exatamente uma sucede, a outra é recusada por autorização (não por política de último gestor)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-crossrevoke");
    const { userId: secondUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId, userId: `${tenantId}-second-user` });
    await grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "manage" }, prisma);

    const aRevokesB = () => revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: secondUserId, operation: "manage" }, prisma);
    const bRevokesA = () => revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: secondUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "manage" }, prisma);

    const results = await Promise.allSettled([aRevokesB(), bRevokesA()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(fulfilled.length, 1, "exatamente uma revogação sucede");
    assert.equal(rejected.length, 1, "exatamente uma revogação é recusada");
    assert.ok(
      rejected[0]!.reason instanceof RadarEntityAccessGrantError && rejected[0]!.reason.reasonCode === "actor_manage_not_active",
      "a recusa é por perda de autorização do ator, nunca por política de último gestor"
    );

    const resolver = createRadarEntityAccessResolver(prisma);
    const creatorStillManage = await resolver({ confirmedIdentity: creatorUserId, tenantId, workspaceId, entityId: entity.id, operation: "manage" });
    const secondStillManage = await resolver({ confirmedIdentity: secondUserId, tenantId, workspaceId, entityId: entity.id, operation: "manage" });
    const activeManagers = [creatorStillManage, secondStillManage].filter((o) => o === "authorized").length;
    assert.equal(activeManagers, 1, "exatamente um gestor permanece — nunca zero, nunca dois inalterados");
  } finally { await prisma.$disconnect(); }
});

test("proteção do último gestor elegível: com exatamente um manage restante, revogá-lo é sempre recusado", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-lastmanager");
    await assert.rejects(
      () => revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "manage" }, prisma),
      (e: unknown) => e instanceof RadarEntityAccessGrantConflictError && e.reasonCode === "cannot_revoke_last_eligible_manage_grant"
    );
  } finally { await prisma.$disconnect(); }
});

test("entidade já sem gestor elegível: bloqueio permanece, sem bypass nem recuperação automática", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, "h-nomanager");
    // Simula o criador saindo do tenant (caminho que NÃO participa deste
    // protocolo) — remove a TenantMembership diretamente, sem tocar o grant.
    await prisma.tenantMembership.deleteMany({ where: { tenantId, userId: creatorUserId } });

    // Nenhum bypass: o próprio ex-membro não consegue mais nem chamar
    // grant/revoke — barrado já no primeiro controle (membership), antes
    // de qualquer decisão sobre grants.
    await assert.rejects(
      () => grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "read" }, prisma),
      RadarSocialAuthorizationError
    );

    // Acesso operacional já concedido (read, por exemplo) permanece
    // funcionando — a falta de gestor elegível bloqueia GESTÃO, não o
    // acesso já concedido a quem quer que seja.
    const resolver = createRadarEntityAccessResolver(prisma);
    assert.equal(await resolver({ confirmedIdentity: creatorUserId, tenantId, workspaceId, entityId: entity.id, operation: "read" }), "authorized");
  } finally { await prisma.$disconnect(); }
});

async function setupRequestUnderRealResolver(
  prisma: ReturnType<typeof db>,
  prefix: string,
  conteudo?: string
) {
  const { tenantId, workspaceId, creatorUserId, entity } = await setupEntity(prisma, prefix);
  const resolver = createRadarEntityAccessResolver(prisma);
  const { receiveRadarMaterial } = await import("../radarMaterialService");
  const { material } = await receiveRadarMaterial(
    {
      tenantId, workspaceId, actorUserId: creatorUserId, resolver,
      input: {
        entityId: entity.id,
        conteudo: conteudo ?? "Empresa Fictícia Alfa anunciou abertura de filial em Recife ainda este ano.",
        fonteDeclarada: "fonte de teste", operationKey: `mat-op-${randomUUID().slice(0, 8)}`,
      },
    },
    prisma
  );
  const request = await createRadarAnalysisRequest(
    {
      tenantId, workspaceId, actorUserId: creatorUserId, resolver,
      input: { entityId: entity.id, materialId: material.id, objective: "Avaliar oportunidade", operationKey: `op-${randomUUID().slice(0, 8)}` },
      generationConfigInput: defaultGenerationConfigInput(),
    },
    prisma
  );
  return { tenantId, workspaceId, creatorUserId, entity, material, request, resolver };
}

test("revogação antes da conclusão: concludeAttempt bloqueado, nenhuma recomendação, resultado preservado retomável após reconcessão sem nova chamada ao executor", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, request, resolver } = await setupRequestUnderRealResolver(prisma, "h-revokebeforeconclude");
    const { executor, calls } = fakeExecutor(() => defaultRecommendationCandidate());

    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver }, prisma);
    const executorOutput = await executor({ objective: "x", additionalContext: null, materialConteudo: "x" });
    await preserveResult({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, executorOutput }, prisma);
    assert.equal(calls.length, 1);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "analyze" }, prisma);

    // Revogação já commitada ANTES desta chamada — a checagem de entrada
    // de concludeAttempt (assertAttemptAccess, pré-existente do pacote A)
    // já rejeita aqui, antes mesmo da transação/trava de entidade nova
    // desta rodada ser alcançada. É o mesmo resultado prático (nenhuma
    // recomendação, tentativa inalterada), só um reasonCode diferente do
    // da corrida em trânsito (coberto no teste seguinte).
    await assert.rejects(
      () => concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver }, prisma),
      (e: unknown) => e instanceof RadarKnownEntityNotFoundError && e.reasonCode === "radar_entity_access_access_denied"
    );
    const afterRejected = await prisma.radarAnalysisAttempt.findFirstOrThrow({ where: { id: request.firstAttempt.id } });
    assert.equal(afterRejected.status, "provider_responded_pending_persistence", "nenhuma mudança de status quando a autorização é revogada");
    assert.equal(await prisma.radarRecommendation.count({ where: { attemptId: request.firstAttempt.id } }), 0);

    // Reconcessão: a MESMA tentativa é concluída depois, sem nova chamada ao executor.
    await grantRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "analyze" }, prisma);
    const concluded = await concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver }, prisma);
    assert.equal(concluded.attempt.status, "completed");
    assert.ok(concluded.recommendation);
    assert.equal(calls.length, 1, "conclusão retomada não chama o executor de novo");
  } finally { await prisma.$disconnect(); }
});

test("revogação em trânsito durante concludeAttempt: a espera pela trava de entidade expõe uma revogação que só commitou DEPOIS da checagem de entrada", async () => {
  const prisma = db();
  const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { tenantId, workspaceId, entity, request, resolver } = await setupRequestUnderRealResolver(prisma, "h-revokeintransit");
    const { executor } = fakeExecutor(() => defaultRecommendationCandidate());

    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver }, prisma);
    const executorOutput = await executor({ objective: "x", additionalContext: null, materialConteudo: "x" });
    await preserveResult({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, executorOutput }, prisma);

    // Acesso ainda válido neste instante — a checagem de ENTRADA de
    // concludeAttempt (assertAttemptAccess, fora da transação) vai passar.
    const holderAppName = "poc-radar-h-conclude-holder";
    let releaseHold: () => void;
    const holdReleaseSignal = new Promise<void>((resolve) => { releaseHold = resolve; });
    const holdPromise = holdEntityRowLock(holderAppName, entity.id, holdReleaseSignal);

    await waitFor(async () => {
      const s = await observeConnectionState(observerPool, holderAppName);
      return s.state === "idle in transaction";
    }, { timeoutMs: 3000, intervalMs: 25, label: "holder segurando a trava da entidade" });

    // Dispara concludeAttempt: passa a checagem de entrada (acesso ainda
    // válido), entra na transação, trava a tentativa (sem contenção), e
    // então fica esperando a trava de entidade (retida pelo holder acima).
    const concludePromise = concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver }, prisma);

    // Folga real para concludeAttempt certamente já ter travado a tentativa
    // e estar na fila de espera pela trava de entidade (retida pelo
    // holder) antes de disparar a revogação abaixo.
    await new Promise((r) => setTimeout(r, 200));

    // Revogação que "chega" enquanto concludeAttempt já está na fila da
    // trava de entidade — só pode commitar DEPOIS que o holder liberar,
    // então observamos aqui que ela também fica pendente até a liberação:
    // disparamos e só then confirmamos a ordem observando o resultado
    // final, não a intercalação bruta (Postgres não expõe ordem de fila
    // determinística entre esperantes, só serialização real).
    const revokePromise = revokeRadarEntityAccess(
      { tenantId, workspaceId, actorUserId: request.request.requestedByUserId, entityId: entity.id, granteeUserId: request.request.requestedByUserId, operation: "analyze" },
      prisma
    );

    await new Promise((r) => setTimeout(r, 300));
    releaseHold!();
    await holdPromise;

    // Uma das duas operações (revoke ou conclude) vence a corrida pela
    // trava de entidade liberada; a outra vê o efeito da vencedora. Em
    // qualquer ordem, a garantia central se mantém: NUNCA uma recomendação
    // é criada com acesso já revogado no momento da escrita.
    const [concludeOutcome, revokeOutcome] = await Promise.allSettled([concludePromise, revokePromise]);
    if (concludeOutcome.status === "fulfilled") {
      // concludeAttempt venceu: revogação só se aplicou depois — recomendação válida.
      assert.equal(concludeOutcome.value.attempt.status, "completed");
      assert.ok(concludeOutcome.value.recommendation);
      assert.equal(revokeOutcome.status, "fulfilled", "revogação aplica normalmente depois, sem erro");
    } else {
      // revogação venceu: concludeAttempt, ao revalidar sob a trava, vê o
      // acesso já revogado e rejeita — nunca cria recomendação.
      assert.ok(
        concludeOutcome.reason instanceof RadarAnalysisAttemptConflictError
        && concludeOutcome.reason.reasonCode === "entity_access_revoked_before_conclusion",
        "quando a revogação vence, concludeAttempt rejeita pelo reasonCode da revalidação em trânsito, não pela checagem de entrada"
      );
      const recCount = await prisma.radarRecommendation.count({ where: { attemptId: request.firstAttempt.id } });
      assert.equal(recCount, 0, "nenhuma recomendação criada quando a revogação vence a corrida");
    }
  } finally {
    await prisma.$disconnect();
    await observerPool.end();
  }
});

test("conclusão antes da revogação: recomendação persiste; leitura subsequente com read revogado é negada sem apagar o registro", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, request, resolver } = await setupRequestUnderRealResolver(prisma, "h-concludebeforerevoke");
    const { executor } = fakeExecutor(() => defaultRecommendationCandidate());

    const { claimToken } = await claimAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, workerId: "w1", resolver }, prisma);
    const executorOutput = await executor({ objective: "x", additionalContext: null, materialConteudo: "x" });
    await preserveResult({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, executorOutput }, prisma);
    const concluded = await concludeAttempt({ tenantId, workspaceId, attemptId: request.firstAttempt.id, claimToken, resolver }, prisma);
    assert.equal(concluded.attempt.status, "completed");

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "read" }, prisma);

    await assert.rejects(
      () => getRadarRecommendation({ tenantId, workspaceId, actorUserId: creatorUserId, attemptId: request.firstAttempt.id, resolver }, prisma),
      RadarRecommendationNotFoundError
    );
    // O registro em si permanece intacto — só a leitura é negada.
    const stillThere = await prisma.radarRecommendation.findFirst({ where: { attemptId: request.firstAttempt.id } });
    assert.ok(stillThere, "recomendação já persistida nunca é apagada por revogação posterior");
  } finally { await prisma.$disconnect(); }
});

test("isolamento entre tenants/workspaces: grant concedido em um tenant nunca autoriza em outro, mesmo com IDs coincidentes", async () => {
  const prisma = db();
  try {
    const a = await setupEntity(prisma, "h-iso-a");
    const b = await setupEntity(prisma, "h-iso-b");
    // Concede acesso ao MESMO usuário (coincidência proposital) só no tenant A.
    await grantRadarEntityAccess({ tenantId: a.tenantId, workspaceId: a.workspaceId, actorUserId: a.creatorUserId, entityId: a.entity.id, granteeUserId: b.creatorUserId, operation: "read" }, prisma);
    const resolver = createRadarEntityAccessResolver(prisma);
    assert.equal(await resolver({ confirmedIdentity: b.creatorUserId, tenantId: a.tenantId, workspaceId: a.workspaceId, entityId: a.entity.id, operation: "read" }), "authorized");
    // O mesmo usuário, no tenant B, sobre a entidade de B, nunca ganhou nada.
    assert.equal(await resolver({ confirmedIdentity: b.creatorUserId, tenantId: b.tenantId, workspaceId: b.workspaceId, entityId: b.entity.id, operation: "read" }), "authorized", "acesso próprio de criador em B, não relacionado ao grant de A");
    // Tentar usar as credenciais do tenant B contra a entidade de A, sob o tenant A, mas workspace de B: fora do escopo.
    assert.equal(await resolver({ confirmedIdentity: b.creatorUserId, tenantId: a.tenantId, workspaceId: b.workspaceId, entityId: a.entity.id, operation: "read" }), "entity_not_found");
  } finally { await prisma.$disconnect(); }
});

test("ausência ou falha de autorização bloqueando: erro de infraestrutura no resolvedor nunca autoriza", async () => {
  const { prisma: setupPrisma } = createNamedClient(`radar-h-brokenresolver-setup-${process.pid}`);
  const { prisma: brokenPrisma, pool: brokenPool } = createNamedClient(`radar-h-brokenresolver-${process.pid}`);
  try {
    const { tenantId, workspaceId, entity } = await setupEntity(setupPrisma, "h-brokenresolver");
    await brokenPool.end(); // encerra o pool subjacente: qualquer query seguinte por este client falha
    const resolver = createRadarEntityAccessResolver(brokenPrisma);
    const outcome = await resolver({ confirmedIdentity: "whoever", tenantId, workspaceId, entityId: entity.id, operation: "read" });
    assert.equal(outcome, "resolution_failed", "erro de infraestrutura nunca vira 'authorized'");
  } finally {
    await setupPrisma.$disconnect();
  }
});
