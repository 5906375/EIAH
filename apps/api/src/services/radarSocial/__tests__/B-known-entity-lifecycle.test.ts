// Cenário B — ciclo de vida de RadarKnownEntity contra Postgres real
// descartável: cadastro, autorização comum (membership/vínculo/escopo),
// consulta/listagem com acesso individual, alteração/desativação com
// controle de revisão e isolamento entre tenants/workspaces.
import test from "node:test";
import assert from "node:assert/strict";
import {
  newTenantWorkspace, seedTenantWorkspaceUser, grantScope, createNamedClient,
  alwaysAuthorizedResolver, fixedOutcomeResolver, denyListResolver, recordingResolver,
} from "./helpers";
import {
  createRadarKnownEntity, getRadarKnownEntity, listRadarKnownEntities,
  updateRadarKnownEntity, deactivateRadarKnownEntity,
  RadarKnownEntityConflictError, RadarKnownEntityNotFoundError,
  RADAR_SOCIAL_READ_SCOPE, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE,
} from "../radarKnownEntityService";
import { RadarSocialAuthorizationError } from "../radarEntityAccessResolver";

let clientSeq = 0;
function db() {
  return createNamedClient(`radar-b-${++clientSeq}-${process.pid}`).prisma;
}

test("criação: sem membership no tenant, a operação é bloqueada (fail-closed)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-nomember");
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId, name: tenantId }, update: {} });
    await prisma.workspace.upsert({ where: { id: workspaceId }, create: { id: workspaceId, tenantId, name: workspaceId }, update: {} });
    await assert.rejects(
      () => createRadarKnownEntity({ tenantId, workspaceId, actorUserId: "ghost-user", input: { displayName: "X" } }, prisma),
      (e: unknown) => e instanceof RadarSocialAuthorizationError && e.reasonCode === "membership_not_found"
    );
  } finally { await prisma.$disconnect(); }
});

test("criação: workspace de outro tenant é bloqueada (vínculo workspace-tenant)", async () => {
  const prisma = db();
  try {
    const a = newTenantWorkspace("b-mismatch-a");
    const b = newTenantWorkspace("b-mismatch-b");
    const { userId } = await seedTenantWorkspaceUser(prisma, a);
    await seedTenantWorkspaceUser(prisma, b); // cria o workspace de B, mas o ator só tem membership em A
    await assert.rejects(
      () => createRadarKnownEntity({ tenantId: a.tenantId, workspaceId: b.workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma),
      (e: unknown) => e instanceof RadarSocialAuthorizationError && e.reasonCode === "workspace_tenant_mismatch"
    );
  } finally { await prisma.$disconnect(); }
});

test("criação: membership e workspace corretos, mas sem escopo de gestão concedido, é negada", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-noscope");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await assert.rejects(
      () => createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma),
      RadarSocialAuthorizationError
    );
  } finally { await prisma.$disconnect(); }
});

test("criação, consulta e listagem: fluxo autorizado de ponta a ponta", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-happy");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });

    const created = await createRadarKnownEntity(
      { tenantId, workspaceId, actorUserId: userId, input: { displayName: "Empresa Alfa", externalRef: "ext-alfa-1" } },
      prisma
    );
    assert.equal(created.displayName, "Empresa Alfa");
    assert.equal(created.externalRef, "ext-alfa-1");
    assert.equal(created.status, "active");
    assert.equal(created.revision, 0);
    assert.equal(created.createdByUserId, userId);

    const fetched = await getRadarKnownEntity(
      { tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: alwaysAuthorizedResolver() },
      prisma
    );
    assert.deepEqual(fetched, created);

    const { items } = await listRadarKnownEntities(
      { tenantId, workspaceId, actorUserId: userId, resolver: alwaysAuthorizedResolver(), limit: 10 },
      prisma
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.id, created.id);
  } finally { await prisma.$disconnect(); }
});

test("externalRef único por (tenant, workspace): segunda entidade com o mesmo externalRef conflita", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-extref");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });

    await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "A", externalRef: "dup-1" } }, prisma);
    await assert.rejects(
      () => createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "B", externalRef: "dup-1" } }, prisma),
      (e: unknown) => e instanceof RadarKnownEntityConflictError && e.reasonCode === "external_ref_already_in_use"
    );
  } finally { await prisma.$disconnect(); }
});

test("externalRef: múltiplas entidades SEM externalRef convivem (UNIQUE padrão, NULLs distintos)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-extref-null");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });

    const e1 = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "A" } }, prisma);
    const e2 = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "B" } }, prisma);
    assert.notEqual(e1.id, e2.id);
    assert.equal(e1.externalRef, null);
    assert.equal(e2.externalRef, null);
  } finally { await prisma.$disconnect(); }
});

test("isolamento entre tenants: mesmo externalRef em tenants diferentes não conflita, e consulta cross-tenant não encontra", async () => {
  const prisma = db();
  try {
    const a = newTenantWorkspace("b-iso-a");
    const b = newTenantWorkspace("b-iso-b");
    const { userId: userA } = await seedTenantWorkspaceUser(prisma, a);
    const { userId: userB } = await seedTenantWorkspaceUser(prisma, b);
    await grantScope(prisma, { tenantId: a.tenantId, workspaceId: a.workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId: b.tenantId, workspaceId: b.workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId: b.tenantId, workspaceId: b.workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });

    const entA = await createRadarKnownEntity({ tenantId: a.tenantId, workspaceId: a.workspaceId, actorUserId: userA, input: { displayName: "A", externalRef: "shared-ref" } }, prisma);
    const entB = await createRadarKnownEntity({ tenantId: b.tenantId, workspaceId: b.workspaceId, actorUserId: userB, input: { displayName: "B", externalRef: "shared-ref" } }, prisma);
    assert.notEqual(entA.id, entB.id);

    // userB, autenticado no tenant B, tenta ler a entidade de A usando o
    // escopo/tenant/workspace de B — mesmo reasonCode de "não encontrado"
    // que um id inexistente qualquer, nunca revela que A existe.
    await assert.rejects(
      () => getRadarKnownEntity({ tenantId: b.tenantId, workspaceId: b.workspaceId, actorUserId: userB, entityId: entA.id, resolver: alwaysAuthorizedResolver() }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("consulta individual: resolvedor nega -> not found (não revela existência)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-denyget");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma);

    await assert.rejects(
      () => getRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: fixedOutcomeResolver("access_denied") }, prisma),
      RadarKnownEntityNotFoundError
    );
  } finally { await prisma.$disconnect(); }
});

test("consulta individual: resolvedor indisponível/falho DERRUBA a operação (nunca libera por ausência)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-resolverdown");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma);

    for (const outcome of ["resolver_unavailable", "resolution_failed"] as const) {
      await assert.rejects(
        () => getRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: fixedOutcomeResolver(outcome) }, prisma)
      );
    }
  } finally { await prisma.$disconnect(); }
});

test("listagem: filtra por item negado, sem derrubar a página inteira", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-listfilter");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const e1 = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "Visível" } }, prisma);
    const e2 = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "Negada" } }, prisma);

    const { items } = await listRadarKnownEntities(
      { tenantId, workspaceId, actorUserId: userId, resolver: denyListResolver([e2.id]), limit: 10 },
      prisma
    );
    assert.deepEqual(items.map((i) => i.id).sort(), [e1.id].sort());
  } finally { await prisma.$disconnect(); }
});

test("listagem: resolver_unavailable no meio da página derruba a operação inteira (nunca lista parcial silenciosa)", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-listabort");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma);

    await assert.rejects(
      () => listRadarKnownEntities({ tenantId, workspaceId, actorUserId: userId, resolver: fixedOutcomeResolver("resolver_unavailable"), limit: 10 }, prisma)
    );
  } finally { await prisma.$disconnect(); }
});

test("alteração: expectedRevision correto atualiza e incrementa revision; leitura herdada confirma novo valor", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-update");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "Antigo" } }, prisma);

    const updated = await updateRadarKnownEntity(
      { tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, patch: { displayName: "Novo" }, resolver: alwaysAuthorizedResolver() },
      prisma
    );
    assert.equal(updated.displayName, "Novo");
    assert.equal(updated.revision, 1);
  } finally { await prisma.$disconnect(); }
});

test("alteração concorrente: duas tentativas com a MESMA expectedRevision — só uma vence, a outra falha sem sobrescrever", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-updateconcurrent");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "Original" } }, prisma);

    const attempt = (displayName: string) => updateRadarKnownEntity(
      { tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, patch: { displayName }, resolver: alwaysAuthorizedResolver() },
      prisma
    );

    const results = await Promise.allSettled([attempt("Vencedora"), attempt("Perdedora")]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof RadarKnownEntityConflictError);

    const final = await getRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(final.revision, 1);
    assert.equal(final.displayName, (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof updateRadarKnownEntity>>>).value.displayName);
  } finally { await prisma.$disconnect(); }
});

test("alteração: expectedRevision desatualizada é rejeitada com reasonCode específico", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-staleRevision");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma);
    await updateRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, patch: { displayName: "Y" }, resolver: alwaysAuthorizedResolver() }, prisma);

    await assert.rejects(
      () => updateRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, patch: { displayName: "Z" }, resolver: alwaysAuthorizedResolver() }, prisma),
      (e: unknown) => e instanceof RadarKnownEntityConflictError && e.reasonCode === "expected_revision_outdated"
    );
  } finally { await prisma.$disconnect(); }
});

test("desativação: bloqueia por revision, e segunda desativação concorrente da mesma revisão falha (não 'desativa de novo')", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-deactivate");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma);

    const attempt = () => deactivateRadarKnownEntity(
      { tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, resolver: alwaysAuthorizedResolver() }, prisma
    );
    const results = await Promise.allSettled([attempt(), attempt()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);

    const final = await getRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(final.status, "inactive");
    assert.equal(final.revision, 1);
  } finally { await prisma.$disconnect(); }
});

test("gestão vs. leitura: escopo de leitura sozinho NÃO autoriza alterar/desativar (permissões distintas, checkScopePermission é por tenant/workspace)", async () => {
  // O escopo (TenantActionPolicy) é concedido por (tenantId, workspaceId),
  // não por usuário — para isolar a distinção leitura x gestão, o workspace
  // deste teste recebe SOMENTE o escopo de leitura; a entidade é criada
  // diretamente via Prisma (não via createRadarKnownEntity, que exigiria o
  // escopo de gestão) para chegar a um estado "existe, mas sem gestão
  // concedida neste workspace" sem depender de dois atores.
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-readonly");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const created = await prisma.radarKnownEntity.create({
      data: { tenantId, workspaceId, displayName: "X", createdByUserId: userId },
    });

    // Sem nenhuma TenantActionPolicy para o escopo de gestão neste workspace,
    // o reasonCode é POLICY_NOT_FOUND (ausência de política), distinto de
    // SCOPE_NOT_ALLOWED (política existente negando explicitamente) — ambos
    // resultam em bloqueio fail-closed, o que importa para este teste.
    await assert.rejects(
      () => updateRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, patch: { displayName: "Y" }, resolver: alwaysAuthorizedResolver() }, prisma),
      RadarSocialAuthorizationError
    );
    await assert.rejects(
      () => deactivateRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, resolver: alwaysAuthorizedResolver() }, prisma),
      RadarSocialAuthorizationError
    );
    // Leitura, em contraste, funciona neste mesmo workspace (só o escopo de
    // leitura foi concedido) — confirma que a negação acima é específica de
    // gestão, não uma falha genérica de autorização.
    const fetched = await getRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: alwaysAuthorizedResolver() }, prisma);
    assert.equal(fetched.id, created.id);
  } finally { await prisma.$disconnect(); }
});

test("resolvedor é chamado com entityId e operation corretos (espião) — read em getRadarKnownEntity, manage em updateRadarKnownEntity", async () => {
  const prisma = db();
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("b-spy");
    const { userId } = await seedTenantWorkspaceUser(prisma, { tenantId, workspaceId });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_ENTITY_MANAGE_SCOPE });
    await grantScope(prisma, { tenantId, workspaceId, scope: RADAR_SOCIAL_READ_SCOPE });
    const created = await createRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, input: { displayName: "X" } }, prisma);

    const readSpy = recordingResolver();
    await getRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, resolver: readSpy.resolver }, prisma);
    assert.equal(readSpy.calls.length, 1);
    assert.equal(readSpy.calls[0]!.operation, "read");
    assert.equal(readSpy.calls[0]!.entityId, created.id);
    assert.equal(readSpy.calls[0]!.confirmedIdentity, userId);

    const manageSpy = recordingResolver();
    await updateRadarKnownEntity({ tenantId, workspaceId, actorUserId: userId, entityId: created.id, expectedRevision: 0, patch: { displayName: "Y" }, resolver: manageSpy.resolver }, prisma);
    assert.equal(manageSpy.calls.length, 1);
    assert.equal(manageSpy.calls[0]!.operation, "manage");
  } finally { await prisma.$disconnect(); }
});
