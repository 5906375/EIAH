// Cenário I — integração do resolvedor REAL (createRadarEntityAccessResolver,
// apoiado em RadarEntityAccessGrant persistido) com os serviços que hoje só
// tinham cobertura de teste via substitutos (alwaysAuthorizedResolver/
// fixedOutcomeResolver). Ver docs/architecture/radar-social-construction-plan-v1.md,
// Atualização 1.27. Nenhuma chamada real a modelo em nenhum teste deste
// arquivo — cobre exatamente os caminhos listados na revisão: leitura de
// entidade, listagem de entidades, leitura/listagem de materiais e
// histórico, correção de material, recuperação de solicitação de análise, e
// criação/recuperação de tentativa intencional.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantAnalysisScopes, createNamedClient,
  defaultGenerationConfigInput,
} from "./helpers";
import { createRadarKnownEntity, getRadarKnownEntity, listRadarKnownEntities, RadarKnownEntityNotFoundError } from "../radarKnownEntityService";
import { revokeRadarEntityAccess, createRadarEntityAccessResolver } from "../radarEntityAccessGrantService";
import { receiveRadarMaterial, correctRadarMaterial, getRadarMaterial, listRadarMaterials, RadarMaterialNotFoundError } from "../radarMaterialService";
import { createRadarAnalysisRequest, getRadarAnalysisRequest } from "../radarAnalysisRequestService";
import { createOrRecoverIntentionalAttempt, getRadarAnalysisAttempt } from "../radarAnalysisAttemptService";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-i-${++clientSeq}-${process.pid}`).prisma;
}

async function setupEntity(prisma: ReturnType<typeof db>, prefix: string) {
  const { tenantId, workspaceId } = newTenantWorkspace(prefix);
  const { userId: creatorUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
  await grantAnalysisScopes(prisma, { tenantId, workspaceId });
  const entity = await createRadarKnownEntity(
    { tenantId, workspaceId, actorUserId: creatorUserId, input: { displayName: "Entidade de teste — integração resolvedor real" } },
    prisma
  );
  const resolver = createRadarEntityAccessResolver(prisma);
  return { tenantId, workspaceId, creatorUserId, entity, resolver };
}

test("leitura de entidade: resolvedor real autoriza com grant vigente, nega depois de revogado", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, resolver } = await setupEntity(prisma, "i-entity-read");
    const read = await getRadarKnownEntity({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, resolver }, prisma);
    assert.equal(read.id, entity.id);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "read" }, prisma);
    await assert.rejects(
      () => getRadarKnownEntity({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, resolver }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("listagem de entidades: resolvedor real filtra por item, sem abortar a página inteira", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("i-entity-list");
    const { userId: creatorUserId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantAnalysisScopes(prisma, { tenantId, workspaceId });
    const entityA = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: creatorUserId, input: { displayName: "Entidade A" } }, prisma);
    const entityB = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: creatorUserId, input: { displayName: "Entidade B" } }, prisma);
    const resolver = createRadarEntityAccessResolver(prisma);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entityA.id, granteeUserId: creatorUserId, operation: "read" }, prisma);

    const page = await listRadarKnownEntities({ tenantId, workspaceId, actorUserId: creatorUserId, resolver, limit: 10 }, prisma);
    const ids = page.items.map((e) => e.id).sort();
    assert.deepEqual(ids, [entityB.id].sort(), "só a entidade com read ainda vigente aparece — a revogada é filtrada, não aborta a listagem");
  } finally { await prisma.$disconnect(); }
});

test("leitura de material: herda o acesso da entidade via resolvedor real, nega depois de revogado", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, resolver } = await setupEntity(prisma, "i-material-read");
    const { material } = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Texto de teste.", fonteDeclarada: "fonte", operationKey: `mat-${randomUUID().slice(0, 8)}` } },
      prisma
    );
    const read = await getRadarMaterial({ tenantId, workspaceId, actorUserId: creatorUserId, materialId: material.id, resolver }, prisma);
    assert.equal(read.id, material.id);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "read" }, prisma);
    await assert.rejects(
      () => getRadarMaterial({ tenantId, workspaceId, actorUserId: creatorUserId, materialId: material.id, resolver }, prisma),
      RadarMaterialNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("listagem de materiais/histórico: uma única checagem sobre a entidade governa a página inteira; revogação aborta a listagem, não filtra item a item", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, resolver } = await setupEntity(prisma, "i-material-list");
    await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Primeiro material.", fonteDeclarada: "fonte", operationKey: `mat-${randomUUID().slice(0, 8)}` } },
      prisma
    );
    const before = await listRadarMaterials({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, resolver, limit: 10 }, prisma);
    assert.equal(before.items.length, 1);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "read" }, prisma);
    await assert.rejects(
      () => listRadarMaterials({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, resolver, limit: 10 }, prisma),
      RadarKnownEntityNotFoundError,
      "diferente da listagem de entidades: aqui a checagem é uma só, sobre a entidade — revogação aborta toda a página, não filtra material a material"
    );
  } finally { await prisma.$disconnect(); }
});

test("correção de material: exige write vigente do resolvedor real; revogação de write bloqueia a correção seguinte", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, resolver } = await setupEntity(prisma, "i-material-correct");
    const { material } = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Conteúdo original.", fonteDeclarada: "fonte", operationKey: `mat-${randomUUID().slice(0, 8)}` } },
      prisma
    );
    const corrected = await correctRadarMaterial(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Conteúdo corrigido.", fonteDeclarada: "fonte corrigida", operationKey: `corr-${randomUUID().slice(0, 8)}`, supersedesMaterialId: material.id } },
      prisma
    );
    assert.notEqual(corrected.material.id, material.id);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "write" }, prisma);
    await assert.rejects(
      () => correctRadarMaterial(
        { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Segunda correção, deveria ser bloqueada.", fonteDeclarada: "fonte", operationKey: `corr2-${randomUUID().slice(0, 8)}`, supersedesMaterialId: corrected.material.id } },
        prisma
      )
    );
  } finally { await prisma.$disconnect(); }
});

test("recuperação de solicitação de análise: resolvedor real exige analyze vigente do solicitante", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, resolver } = await setupEntity(prisma, "i-request-get");
    const { material } = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Texto.", fonteDeclarada: "fonte", operationKey: `mat-${randomUUID().slice(0, 8)}` } },
      prisma
    );
    const created = await createRadarAnalysisRequest(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: `op-${randomUUID().slice(0, 8)}` }, generationConfigInput: defaultGenerationConfigInput() },
      prisma
    );
    const fetched = await getRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: creatorUserId, requestId: created.request.id, resolver }, prisma);
    assert.equal(fetched.id, created.request.id);

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "analyze" }, prisma);
    await assert.rejects(
      () => getRadarAnalysisRequest({ tenantId, workspaceId, actorUserId: creatorUserId, requestId: created.request.id, resolver }, prisma)
    );
  } finally { await prisma.$disconnect(); }
});

test("criação/recuperação de tentativa intencional: resolvedor real exige analyze vigente; payload intermediário nunca é exposto pela leitura", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId, creatorUserId, entity, resolver } = await setupEntity(prisma, "i-attempt-create");
    const { material } = await receiveRadarMaterial(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, conteudo: "Texto.", fonteDeclarada: "fonte", operationKey: `mat-${randomUUID().slice(0, 8)}` } },
      prisma
    );
    const created = await createRadarAnalysisRequest(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, input: { entityId: entity.id, materialId: material.id, objective: "x", operationKey: `op-${randomUUID().slice(0, 8)}` }, generationConfigInput: defaultGenerationConfigInput() },
      prisma
    );
    // Libera o slot de "uma tentativa ativa" para poder criar uma segunda sob nova chave.
    await prisma.radarAnalysisAttempt.updateMany({ where: { id: created.firstAttempt.id }, data: { status: "failed", failureReasonCode: "test_setup" } });

    const secondAttempt = await createOrRecoverIntentionalAttempt(
      { tenantId, workspaceId, actorUserId: creatorUserId, resolver, analysisRequestId: created.request.id, attemptOperationKey: "retry-real-resolver", generationConfigInput: defaultGenerationConfigInput() },
      prisma
    );
    assert.equal(secondAttempt.recovered, false);

    const fetched = await getRadarAnalysisAttempt({ tenantId, workspaceId, attemptId: secondAttempt.attempt.id, resolver }, prisma);
    assert.equal(fetched.id, secondAttempt.attempt.id);
    assert.equal("preservedResultPayload" in fetched, false, "leitura da tentativa nunca expõe o payload intermediário");

    await revokeRadarEntityAccess({ tenantId, workspaceId, actorUserId: creatorUserId, entityId: entity.id, granteeUserId: creatorUserId, operation: "analyze" }, prisma);
    await prisma.radarAnalysisAttempt.updateMany({ where: { id: secondAttempt.attempt.id }, data: { status: "failed", failureReasonCode: "test_setup" } });
    await assert.rejects(
      () => createOrRecoverIntentionalAttempt(
        { tenantId, workspaceId, actorUserId: creatorUserId, resolver, analysisRequestId: created.request.id, attemptOperationKey: "retry-after-revoke", generationConfigInput: defaultGenerationConfigInput() },
        prisma
      )
    );
  } finally { await prisma.$disconnect(); }
});
