// Cenário C — recebimento/correção de RadarMaterial contra Postgres real
// descartável: idempotência completa (identidade da solicitação), conflitos
// de conteúdo, criação vs. correção, concorrência real (duas requisições
// simultâneas com a mesma chave e com predecessores diferentes), replay
// após desativação/correção concluída, revogação antes da recuperação e
// ausência de gravações parciais.
import test from "node:test";
import assert from "node:assert/strict";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantScope, createNamedClient,
  alwaysAuthorizedResolver, fixedOutcomeResolver,
} from "./helpers";
import {
  createRadarKnownEntity, deactivateRadarKnownEntity,
  RADAR_SOCIAL_ENTITY_MANAGE_SCOPE, RADAR_SOCIAL_READ_SCOPE,
} from "../radarKnownEntityService";
import {
  receiveRadarMaterial, correctRadarMaterial, getRadarMaterial, listRadarMaterials,
  RADAR_SOCIAL_MATERIAL_WRITE_SCOPE,
} from "../radarMaterialService";
import { RadarMaterialConflictError } from "../radarMaterialContract";
import { RadarKnownEntityNotFoundError } from "../radarKnownEntityService";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-c-${++clientSeq}-${process.pid}`).prisma;
}

async function setupEntity(prisma: ReturnType<typeof db>, prefix: string) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
  await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
  await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_MATERIAL_WRITE_SCOPE });
  const entity = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "Entidade de teste" } }, prisma);
  return { tenantId, workspaceId, userId, entity };
}

test("recebimento: fluxo autorizado cria material com hash correto e preserva conteúdo exato", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-happy");
    const conteudo = "Empresa X anunciou expansão.\nFonte: LinkedIn.";
    const { material, recovered } = await receiveRadarMaterial(
      {
        tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(),
        input: { entityId: entity.id, conteudo, fonteDeclarada: "LinkedIn", capturadoEm: "2026-09-10", operationKey: "op-1" },
      },
      prisma
    );
    assert.equal(recovered, false);
    assert.equal(material.conteudo, conteudo);
    assert.equal(material.providedByUserId, userId);
    assert.equal(material.supersedesMaterialId, null);
    assert.match(material.hashDoMaterial, /^[0-9a-f]{64}$/);
  } finally { await prisma.$disconnect(); }
});

test("idempotência: reenvio EXATO da mesma solicitação recupera a linha existente, sem criar segunda", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-idem");
    const input = { entityId: entity.id, conteudo: "texto igual", fonteDeclarada: "fonte", operationKey: "op-idem" };
    const first = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input }, prisma);
    const second = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input }, prisma);
    assert.equal(second.recovered, true);
    assert.equal(second.material.id, first.material.id);

    const count = await prisma.radarMaterial.count({ where: { tenantId, workspaceId, operationKey: "op-idem" } });
    assert.equal(count, 1);
  } finally { await prisma.$disconnect(); }
});

test("conflito: mesma operationKey, conteúdo diferente -> RadarMaterialConflictError, nunca segunda gravação", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-conflict-conteudo");
    const base = { entityId: entity.id, fonteDeclarada: "fonte", operationKey: "op-conflict" };
    await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, conteudo: "A" } }, prisma);
    await assert.rejects(
      () => receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, conteudo: "B" } }, prisma),
      RadarMaterialConflictError
    );
    const count = await prisma.radarMaterial.count({ where: { tenantId, workspaceId, operationKey: "op-conflict" } });
    assert.equal(count, 1, "nenhuma segunda linha deve ter sido gravada — rollback sem gravação parcial");
  } finally { await prisma.$disconnect(); }
});

test("criação versus correção: mesma operationKey, uma vez supersedesMaterialId=null e outra preenchido -> conflito, nunca confundidas", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-create-vs-correct");
    const predecessor = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "predecessor", fonteDeclarada: "f", operationKey: "op-pred" } },
      prisma
    );
    const base = { entityId: entity.id, conteudo: "mesmo conteudo", fonteDeclarada: "f", operationKey: "op-createorcorrect" };
    await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, supersedesMaterialId: null } }, prisma);
    await assert.rejects(
      () => receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, supersedesMaterialId: predecessor.material.id } }, prisma),
      RadarMaterialConflictError
    );
  } finally { await prisma.$disconnect(); }
});

test("mesma operationKey, predecessores diferentes -> conflito", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-diff-predecessor");
    const p1 = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "p1", fonteDeclarada: "f", operationKey: "op-p1" } }, prisma);
    const p2 = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "p2", fonteDeclarada: "f", operationKey: "op-p2" } }, prisma);

    const base = { entityId: entity.id, conteudo: "correcao", fonteDeclarada: "f", operationKey: "op-samekey-diffpred" };
    await correctRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, supersedesMaterialId: p1.material.id } }, prisma);
    await assert.rejects(
      () => correctRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { ...base, supersedesMaterialId: p2.material.id } }, prisma),
      RadarMaterialConflictError
    );
  } finally { await prisma.$disconnect(); }
});

test("correção: cria sucessora imutável referenciando o predecessor; original preservado sem alteração", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-correction");
    const original = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "versao 1", fonteDeclarada: "f", operationKey: "op-orig" } },
      prisma
    );
    const corrected = await correctRadarMaterial(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "versao 2", fonteDeclarada: "f", operationKey: "op-corr", supersedesMaterialId: original.material.id } },
      prisma
    );
    assert.equal(corrected.material.supersedesMaterialId, original.material.id);

    const originalReloaded = await getRadarMaterial({ tenantId, workspaceId, actorUserId: userId, materialId: original.material.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(originalReloaded.conteudo, "versao 1", "predecessor permanece intocado — imutabilidade");
  } finally { await prisma.$disconnect(); }
});

test("duas correções concorrentes do MESMO predecessor: só uma cria sucessora, a outra falha em conflito", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-concurrent-correction");
    const original = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "original", fonteDeclarada: "f", operationKey: "op-base" } },
      prisma
    );

    const attempt = (opKey: string, conteudo: string) => correctRadarMaterial(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo, fonteDeclarada: "f", operationKey: opKey, supersedesMaterialId: original.material.id } },
      prisma
    );

    const results = await Promise.allSettled([attempt("op-corrA", "correcao A"), attempt("op-corrB", "correcao B")]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "só uma correção concorrente pode vencer (no máximo uma sucessora por predecessor)");
    assert.equal(rejected.length, 1);
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof RadarMaterialConflictError);

    const successorCount = await prisma.radarMaterial.count({ where: { tenantId, workspaceId, supersedesMaterialId: original.material.id } });
    assert.equal(successorCount, 1);
  } finally { await prisma.$disconnect(); }
});

test("duas requisições simultâneas com a MESMA chave e conteúdo idêntico: uma cria, a outra recupera (nunca duas linhas)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-concurrent-same");
    const input = { entityId: entity.id, conteudo: "conteudo concorrente", fonteDeclarada: "f", operationKey: "op-concurrent" };
    const attempt = () => receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input }, prisma);

    const [r1, r2] = await Promise.all([attempt(), attempt()]);
    const recoveredFlags = [r1.recovered, r2.recovered].sort();
    assert.deepEqual(recoveredFlags, [false, true]);
    assert.equal(r1.material.id, r2.material.id);

    const count = await prisma.radarMaterial.count({ where: { tenantId, workspaceId, operationKey: "op-concurrent" } });
    assert.equal(count, 1);
  } finally { await prisma.$disconnect(); }
});

test("recebimento vs. desativação: entidade desativada bloqueia material NOVO, mas não impede replay de um recebimento já bem-sucedido", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-deactivate-vs-receive");
    const input = { entityId: entity.id, conteudo: "antes de desativar", fonteDeclarada: "f", operationKey: "op-before-deactivate" };
    const original = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input }, prisma);

    await deactivateRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: entity.id, expectedRevision: 0, resolver: alwaysAuthorizedResolver() }, prisma);

    // Novo material (chave nunca usada) é bloqueado pela entidade inativa.
    await assert.rejects(
      () => receiveRadarMaterial(
        { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "depois de desativar", fonteDeclarada: "f", operationKey: "op-after-deactivate" } },
        prisma
      ),
      (e: unknown) => e instanceof RadarMaterialConflictError && e.reasonCode === "entity_not_active"
    );

    // Replay EXATO do recebimento já bem-sucedido continua funcionando —
    // entidade inativa é guarda de NOVA escrita, não de replay histórico.
    const replay = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input }, prisma);
    assert.equal(replay.recovered, true);
    assert.equal(replay.material.id, original.material.id);
  } finally { await prisma.$disconnect(); }
});

test("replay após correção concluída: reenviar a correção original continua recuperando, mesmo com sucessor já existente", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-replay-after-correction");
    const original = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "v1", fonteDeclarada: "f", operationKey: "op-v1" } },
      prisma
    );
    const correctionInput = { entityId: entity.id, conteudo: "v2", fonteDeclarada: "f", operationKey: "op-v2", supersedesMaterialId: original.material.id };
    const corrected = await correctRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: correctionInput }, prisma);

    // Replay exato da MESMA correção (predecessor já tem sucessor = ela
    // mesma) deve recuperar, não conflitar por "predecessor já superado".
    const replay = await correctRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: correctionInput }, prisma);
    assert.equal(replay.recovered, true);
    assert.equal(replay.material.id, corrected.material.id);
  } finally { await prisma.$disconnect(); }
});

test("revogação antes da recuperação: resolvedor negando na tentativa de replay bloqueia mesmo havendo linha recuperável", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-revoke-before-recover");
    const input = { entityId: entity.id, conteudo: "texto", fonteDeclarada: "f", operationKey: "op-revoke" };
    await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input }, prisma);

    // Acesso é revalidado a CADA chamada, inclusive replay — resolvedor
    // negando agora bloqueia mesmo existindo uma linha idêntica recuperável.
    await assert.rejects(
      () => receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: fixedOutcomeResolver("access_denied"), input }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("recuperação herdada da entidade: getRadarMaterial e listRadarMaterials usam uma única checagem de acesso sobre a entidade", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, userId, entity } = await setupEntity(prisma, "c-inherited-read");
    const m1 = await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "m1", fonteDeclarada: "f", operationKey: "op-m1" } }, prisma);
    await receiveRadarMaterial({ tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), input: { entityId: entity.id, conteudo: "m2", fonteDeclarada: "f", operationKey: "op-m2" } }, prisma);

    const fetched = await getRadarMaterial({ tenantId, workspaceId, actorUserId: userId, materialId: m1.material.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(fetched.id, m1.material.id);

    const { items } = await listRadarMaterials({ tenantId, workspaceId, actorUserId: userId, entityId: entity.id, resolver: alwaysAuthorizedResolver(), limit: 10 }, prisma);
    assert.equal(items.length, 2);

    await assert.rejects(
      () => listRadarMaterials({ tenantId, workspaceId, actorUserId: userId, entityId: entity.id, resolver: fixedOutcomeResolver("access_denied"), limit: 10 }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("isolamento entre tenants: operationKey igual em tenants diferentes não colide", async () => {
  const prisma = db();
  try {
    const a = await setupEntity(prisma, "c-iso-a");
    const b = await setupEntity(prisma, "c-iso-b");
    const inputA = { entityId: a.entity.id, conteudo: "conteudo A", fonteDeclarada: "f", operationKey: "op-shared" };
    const inputB = { entityId: b.entity.id, conteudo: "conteudo B", fonteDeclarada: "f", operationKey: "op-shared" };

    const resA = await receiveRadarMaterial({ tenantId: a.tenantId, workspaceId: a.workspaceId, actorUserId: a.userId, resolver: alwaysAuthorizedResolver(), input: inputA }, prisma);
    const resB = await receiveRadarMaterial({ tenantId: b.tenantId, workspaceId: b.workspaceId, actorUserId: b.userId, resolver: alwaysAuthorizedResolver(), input: inputB }, prisma);
    assert.notEqual(resA.material.id, resB.material.id);
    assert.equal(resA.recovered, false);
    assert.equal(resB.recovered, false);
  } finally { await prisma.$disconnect(); }
});
