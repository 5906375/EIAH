import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { cleanupImobInstallationForTest, installImobForTest } from "./support/imobInstallationFixture";

// P12 — segurança do resolve-turn NORMAL do IMOB: permissão de etapa (com e sem caseId) e status HTTP das negativas.
// Banco/Redis descartáveis (loopback); identidades e dados exclusivamente sintéticos.
process.env.DATABASE_URL ??= process.env.VITEST_DATABASE_URL ?? "postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public";
process.env.REDIS_URL ??= process.env.VITEST_REDIS_URL ?? "redis://127.0.0.1:6379";

let request: ReturnType<typeof supertest>;
let prismaGlobal: any;
let closers: Array<() => Promise<unknown>> = [];

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-p12-${suffix}`;
const otherTenantId = `tenant-p12-other-${suffix}`;
const workspaceId = `ws-p12-${suffix}`;
const otherWorkspaceId = `ws-p12-other-${suffix}`;
const otherTenantWorkspaceId = `ws-p12-xt-${suffix}`;

const users = {
  admin: { id: `user-p12-admin-${suffix}`, token: `tok-p12-admin-${suffix}` },
  limited: { id: `user-p12-limited-${suffix}`, token: `tok-p12-limited-${suffix}` },
  noChat: { id: `user-p12-nochat-${suffix}`, token: `tok-p12-nochat-${suffix}` },
};

const STAGE_ALLOWED = "pending_data";
const STAGE_DENIED = "ready_for_review";
const marker = {
  allowed: `MARCADOR-ETAPA-PERMITIDA-${suffix}`,
  denied: `MARCADOR-ETAPA-NEGADA-${suffix}`,
  otherWorkspace: `MARCADOR-OUTRO-WORKSPACE-${suffix}`,
  otherTenant: `MARCADOR-OUTRO-TENANT-${suffix}`,
};
const cases: Record<"allowed" | "denied" | "otherWorkspace" | "otherTenant", { id: string; threadId: string }> = {
  allowed: { id: "", threadId: `thread-p12-allowed-${suffix}` },
  denied: { id: "", threadId: `thread-p12-denied-${suffix}` },
  otherWorkspace: { id: "", threadId: `thread-p12-ows-${suffix}` },
  otherTenant: { id: "", threadId: `thread-p12-otn-${suffix}` },
};

const STATUS_MESSAGE = "qual status desse caso?";

// P12.2: entidades owner/imóvel/lead com etapa permitida (pending_data) e negada (ready_for_review) para o perfil limitado.
const alpha = suffix.replace(/[^a-z0-9]/g, "");
const entityMarker = {
  ownerAllowed: `OwnerPermitido${alpha}`,
  ownerDenied: `OwnerNegado${alpha}`,
  propertyAllowed: `ImovelPermitido${alpha}`,
  propertyDenied: `ImovelNegado${alpha}`,
  leadAllowed: `LeadPermitido${alpha}`,
  leadDenied: `LeadNegado${alpha}`,
  ownerOtherWorkspace: `OwnerOutroWs${alpha}`,
};
// Dados que NÃO aparecem em nenhuma mensagem do teste: se surgirem numa resposta, a entidade foi lida.
const entityData = {
  ownerAllowed: { phone: "47911110001", email: `owner-permitido-${alpha}@p12.invalid` },
  ownerDenied: { phone: "47911110002", email: `owner-negado-${alpha}@p12.invalid` },
  leadAllowed: { phone: "47922220001", email: `lead-permitido-${alpha}@p12.invalid` },
  leadDenied: { phone: "47922220002", email: `lead-negado-${alpha}@p12.invalid` },
  propertyDenied: { description: `Descricao interna negada ${alpha}`, neighborhood: `BairroNegado${alpha}` },
  propertyAllowed: { description: `Descricao interna permitida ${alpha}`, neighborhood: `BairroPermitido${alpha}` },
};
const entityId: Record<string, string> = {};
const serviceToken = `tok-p12-service-${suffix}`;

function api(method: "get" | "post" | "patch" | "delete", path: string, token: string, body?: Record<string, unknown>) {
  const call = request[method](`/api/imob${path}`).set("Authorization", `Bearer ${token}`);
  return body ? call.send(body) : call;
}

async function setMembershipStatus(userId: string, status: string) {
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status = ${status} WHERE user_id = ${userId} AND workspace_id = ${workspaceId}`;
}

function assertMembershipInactive(response: { status: number; body: any }) {
  assert.equal(response.status, 403);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "IMOB_WORKSPACE_MEMBERSHIP_INACTIVE");
  assert.deepEqual(response.body?.error?.scope, { tenantId, workspaceId }, "só o escopo do próprio solicitante");
}

async function resolveTurn(token: string, body: Record<string, unknown>) {
  const response = await request.post("/api/imob/chat/resolve-turn").set("Authorization", `Bearer ${token}`).send(body);
  if (process.env.P12_TRACE_FILE) {
    // Registro sanitizado opcional (apenas status/código/indicadores; nenhum corpo, id ou marcador).
    const text = JSON.stringify(response.body ?? {});
    const labelOf = (id: string | null) => (Object.entries(cases).find(([, value]) => value.id === id)?.[0] ?? null);
    const line = {
      who: Object.entries(users).find(([, user]) => user.token === token)?.[0],
      input: Object.keys(body).sort().join("+"),
      status: response.status,
      code: response.body?.error?.code ?? null,
      action: response.body?.data?.action ?? null,
      returnedCase: labelOf(returnedCaseId(response)),
      markersPresent: Object.entries(marker).filter(([, value]) => text.includes(value)).map(([key]) => key),
    };
    (await import("node:fs")).appendFileSync(process.env.P12_TRACE_FILE, `${JSON.stringify(line)}\n`);
  }
  return response;
}

function serialized(response: { body: unknown }) {
  return JSON.stringify(response.body ?? {});
}

function assertNoLeak(response: { body: unknown }, ...needles: string[]) {
  const text = serialized(response);
  for (const needle of needles) {
    assert.equal(text.includes(needle), false, `a resposta não pode conter dado do caso protegido (${needle.slice(0, 18)}…)`);
  }
}

function returnedCaseId(response: { body: any }): string | null {
  return response.body?.data?.caseContext?.caseId ?? null;
}

function deniedAuditRows() {
  return prismaGlobal.guardrailAuditLedger.count({ where: { tenantId, workspaceId, eventType: "imob.access_denied" } }) as Promise<number>;
}

// A auditoria da negativa é assíncrona (fire-and-forget); aguarda a linha com escopo de tenant/workspace preenchido.
async function waitForDeniedAudit(before: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await deniedAuditRows()) > before) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function assertStageDenied(response: { status: number; body: any }) {
  assert.equal(response.status, 403);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "IMOB_STAGE_FORBIDDEN");
}

async function createCase(params: { tenant: string; workspace: string; stage: string; markerText: string; threadId: string }) {
  return prismaGlobal.imobCase.create({
    data: {
      tenantId: params.tenant,
      workspaceId: params.workspace,
      threadId: params.threadId,
      flow: "contract.prepare",
      stage: params.stage,
      status: "running",
      blockers: [params.markerText],
      pendingItems: [params.markerText],
      metadata: {},
    },
  });
}

async function setUpdatedAt(caseId: string, isoDate: string) {
  await prismaGlobal.$executeRaw`UPDATE imob_cases SET updated_at = ${new Date(isoDate)} WHERE id = ${caseId}`;
}

before(async () => {
  process.env.NODE_ENV = "test";
  if (process.env.VITEST_DATABASE_URL) process.env.DATABASE_URL = process.env.VITEST_DATABASE_URL;
  if (process.env.VITEST_REDIS_URL) process.env.REDIS_URL = process.env.VITEST_REDIS_URL;

  const dbModule = await import("@repo/db");
  prismaGlobal = dbModule.prismaGlobal;
  const { ensureWorkspaceResponsibilityStore } = await import("../services/workspaceResponsibility");
  closers = [
    (await import("../services/memory")).closeMemoryResources,
    (await import("@eiah/core/events/redisPublisher")).closeRedisPublisher,
    (await import("@eiah/core/policy/TenantPolicyStore")).closeTenantPolicyStoreResources,
    (await import("../../../../packages/core/src/security/killSwitch.js")).closeCriticalKillSwitchRedis,
    (await import("../services/runEventStream")).closeRunEventStream,
    (await import("../services/runEvents")).closeRunEventsTransport,
    (await import("@eiah/core/queue/runQueue")).closeRunQueueConnections,
    dbModule.closePrismaResources,
  ];

  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.tenant.create({ data: { id: otherTenantId, name: otherTenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.workspace.create({ data: { id: otherWorkspaceId, tenantId, name: otherWorkspaceId } });
  await prismaGlobal.workspace.create({ data: { id: otherTenantWorkspaceId, tenantId: otherTenantId, name: otherTenantWorkspaceId } });

  for (const [name, user] of Object.entries(users)) {
    await prismaGlobal.user.create({
      data: { id: user.id, tenantId, email: `${name}-${suffix}@p12.invalid`, displayName: `P12 ${name}` },
    });
    await prismaGlobal.apiToken.create({
      data: { token: user.token, tenantId, workspaceId, userId: user.id, description: `p12-${name}`, revoked: false },
    });
  }

  // Memberships explícitas (o primeiro membro com papel de gestão evita a promoção automática do membro único).
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  const memberships: Array<[string, string, string[]]> = [
    [users.admin.id, "founder", ["imob.chat.use", "imob.stage.*"]],
    [users.limited.id, "corretor", ["imob.chat.use", `imob.stage.${STAGE_ALLOWED}`]],
    [users.noChat.id, "corretor", ["imob.stage.*"]],
  ];
  for (const [userId, roleKey, permissions] of memberships) {
    await prismaGlobal.$executeRaw`
      INSERT INTO eiah_workspace_memberships (user_id, tenant_id, workspace_id, role_key, permissions, status)
      VALUES (${userId}, ${tenantId}, ${workspaceId}, ${roleKey}, ${JSON.stringify(permissions)}::jsonb, 'active')
    `;
  }

  // AUTHZ-IMOB-INSTALLATION-001: as APIs do IMOB exigem o IMOB instalado e habilitado no workspace; a fixture instala pelo serviço de ativação
  // existente (só o workspace dos usuários do teste; os demais escopos são apenas dados que não devem ser alcançados).
  await installImobForTest({ prisma: prismaGlobal, tenantId, workspaceId, userId: users.admin.id });

  // Dois casos no MESMO workspace em etapas distintas; o da etapa negada é o mais recente.
  const allowed = await createCase({ tenant: tenantId, workspace: workspaceId, stage: STAGE_ALLOWED, markerText: marker.allowed, threadId: cases.allowed.threadId });
  const denied = await createCase({ tenant: tenantId, workspace: workspaceId, stage: STAGE_DENIED, markerText: marker.denied, threadId: cases.denied.threadId });
  const otherWs = await createCase({ tenant: tenantId, workspace: otherWorkspaceId, stage: STAGE_ALLOWED, markerText: marker.otherWorkspace, threadId: cases.otherWorkspace.threadId });
  const otherTn = await createCase({ tenant: otherTenantId, workspace: otherTenantWorkspaceId, stage: STAGE_ALLOWED, markerText: marker.otherTenant, threadId: cases.otherTenant.threadId });
  cases.allowed.id = allowed.id;
  cases.denied.id = denied.id;
  cases.otherWorkspace.id = otherWs.id;
  cases.otherTenant.id = otherTn.id;
  await setUpdatedAt(allowed.id, "2026-01-01T10:00:00Z");
  await setUpdatedAt(denied.id, "2026-01-01T11:00:00Z");
  await setUpdatedAt(otherWs.id, "2026-01-01T12:00:00Z");
  await setUpdatedAt(otherTn.id, "2026-01-01T13:00:00Z");

  await prismaGlobal.apiToken.create({
    data: { token: serviceToken, tenantId, workspaceId, userId: null, description: "p12-service-token", revoked: false },
  });
  const mk = (model: string, data: Record<string, unknown>) => prismaGlobal[model].create({ data: { tenantId, workspaceId, ...data } });
  entityId.ownerAllowed = (await mk("imobOwner", { name: entityMarker.ownerAllowed, status: STAGE_ALLOWED, ...entityData.ownerAllowed })).id;
  entityId.ownerDenied = (await mk("imobOwner", { name: entityMarker.ownerDenied, status: STAGE_DENIED, ...entityData.ownerDenied })).id;
  entityId.propertyAllowed = (await mk("imobProperty", { address: entityMarker.propertyAllowed, status: STAGE_ALLOWED, ...entityData.propertyAllowed })).id;
  entityId.propertyDenied = (await mk("imobProperty", { address: entityMarker.propertyDenied, status: STAGE_DENIED, ...entityData.propertyDenied })).id;
  entityId.leadAllowed = (await mk("imobLead", { name: entityMarker.leadAllowed, stage: STAGE_ALLOWED, ...entityData.leadAllowed })).id;
  entityId.leadDenied = (await mk("imobLead", { name: entityMarker.leadDenied, stage: STAGE_DENIED, ...entityData.leadDenied })).id;
  entityId.ownerChatDenied = (await mk("imobOwner", { name: `Chat Negado ${alpha}`, status: STAGE_DENIED, document: "11122233396", phone: "47933330002", email: `negado-chat-${alpha}@p12.invalid` })).id;
  entityId.leadChatDenied = (await mk("imobLead", { name: `LeadChatNegado${alpha}`, stage: STAGE_DENIED, phone: "47944440002" })).id;
  entityId.ownerOtherWorkspace = (await prismaGlobal.imobOwner.create({
    data: { tenantId, workspaceId: otherWorkspaceId, name: entityMarker.ownerOtherWorkspace, status: STAGE_ALLOWED },
  })).id;
});

after(async () => {
  if (!prismaGlobal) return;
  const tenants = [tenantId, otherTenantId];
  await cleanupImobInstallationForTest(prismaGlobal, tenants);
  await prismaGlobal.$executeRaw`DELETE FROM memory_events WHERE tenant_id IN (${tenants[0]}, ${tenants[1]})`;
  await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_memberships WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
  await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_roles WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
  await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_role_assignments WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.imobProperty.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.imobOwner.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.imobLead.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId: { in: tenants } } });
  await prismaGlobal.tenant.deleteMany({ where: { id: { in: tenants } } });
  for (const close of closers) await close();
  setImmediate(() => process.exit(process.exitCode ?? 0));
});

// A — caseId explícito de etapa autorizada: operação preservada.
test("A: caseId explícito em etapa autorizada continua permitido", async () => {
  const response = await resolveTurn(users.limited.token, { caseId: cases.allowed.id, message: STATUS_MESSAGE });
  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.ok(serialized(response).includes(cases.allowed.id) || serialized(response).includes(marker.allowed));
  assertNoLeak(response, cases.denied.id, marker.denied);
});

// B — caseId explícito em etapa negada: 403 explícito, sem dados.
test("B: caseId explícito em etapa negada responde 403 IMOB_STAGE_FORBIDDEN sem dados do caso", async () => {
  const auditBefore = await deniedAuditRows();
  const response = await resolveTurn(users.limited.token, { caseId: cases.denied.id, message: STATUS_MESSAGE });
  assertStageDenied(response);
  assertNoLeak(response, cases.denied.id, marker.denied, marker.allowed);
  assert.equal(await waitForDeniedAudit(auditBefore), true, "a negativa de etapa é auditada com escopo de tenant/workspace preenchido (causa-raiz do 500)");
});

// C — sem caseId, o mais recente está em etapa negada: nada dele é exposto.
test("C: sem caseId, caso mais recente em etapa negada não é exposto (sem substituição silenciosa por dado negado)", async () => {
  const response = await resolveTurn(users.limited.token, { message: STATUS_MESSAGE });
  assert.notEqual(response.status, 500);
  assertNoLeak(response, cases.denied.id, marker.denied);
  assert.notEqual(returnedCaseId(response), cases.denied.id);
});

test("C2: leitor de caso com permissão de etapa (usado em todos os pontos de seleção implícita) pula a etapa negada e falha fechado", async () => {
  const { scopedImobCases } = await import("../services/imob/crm/imobCrmOperationalResolverShared");
  const { canWorkspaceOperateImobStage } = await import("../services/workspaceResponsibility");
  const limitedPermissions = ["imob.chat.use", `imob.stage.${STAGE_ALLOWED}`];
  const gate = (stage: string | null | undefined) => canWorkspaceOperateImobStage(limitedPermissions, stage);
  const latest = { where: { tenantId, workspaceId }, orderBy: { updatedAt: "desc" as const } };

  assert.equal((await scopedImobCases(prismaGlobal).findFirst(latest))?.id, cases.denied.id, "sem gate, o mais recente é o caso de etapa negada (comportamento de base)");
  assert.equal((await scopedImobCases(prismaGlobal, gate).findFirst(latest))?.id, cases.allowed.id, "com gate, o mais recente AUTORIZADO");
  assert.equal(await scopedImobCases(prismaGlobal, gate).findFirst({ where: { id: cases.denied.id, tenantId, workspaceId } }), null, "id explícito de etapa negada não é lido");
  assert.equal((await scopedImobCases(prismaGlobal, gate).findFirst({ where: { id: cases.allowed.id, tenantId, workspaceId } }))?.id, cases.allowed.id);
  assert.equal(await scopedImobCases(prismaGlobal, () => false).findFirst(latest), null, "sem nenhuma etapa permitida, nada é devolvido");
});

// D — sem caseId, acesso legítimo preservado: quem tem todas as etapas continua recebendo o caso mais recente.
test("D: sem caseId, perfil com todas as etapas continua recebendo o caso mais recente; perfil limitado recebe o caso autorizado", async () => {
  const admin = await resolveTurn(users.admin.token, { message: STATUS_MESSAGE });
  assert.equal(admin.status, 200);
  assert.ok(serialized(admin).includes(cases.denied.id) || serialized(admin).includes(marker.denied), "perfil com etapa '*' mantém o comportamento de caso mais recente");

  const limited = await resolveTurn(users.limited.token, { message: STATUS_MESSAGE });
  assert.equal(limited.status, 200);
  assert.ok(serialized(limited).includes(cases.allowed.id) || serialized(limited).includes(marker.allowed), "perfil limitado enxerga o caso da etapa autorizada");
  assertNoLeak(limited, cases.denied.id, marker.denied);
});

// E — caso de outro workspace (mesmo tenant): negado/ausente, sem vazamento nem fallback.
test("E: caso de outro workspace do mesmo tenant não é acessível por caseId, threadId nem id na mensagem", async () => {
  for (const token of [users.limited.token, users.admin.token]) {
    const byId = await resolveTurn(token, { caseId: cases.otherWorkspace.id, message: STATUS_MESSAGE });
    assert.notEqual(byId.status, 500);
    assertNoLeak(byId, marker.otherWorkspace);
    const byThread = await resolveTurn(token, { threadId: cases.otherWorkspace.threadId, message: STATUS_MESSAGE });
    assert.notEqual(byThread.status, 500);
    assertNoLeak(byThread, marker.otherWorkspace, cases.otherWorkspace.id);
    const byMessage = await resolveTurn(token, { message: `qual status do caso ${cases.otherWorkspace.id}?` });
    assert.notEqual(byMessage.status, 500);
    assertNoLeak(byMessage, marker.otherWorkspace);
  }
});

// F — caso de outro tenant.
test("F: caso de outro tenant não é acessível por caseId, threadId nem id na mensagem", async () => {
  for (const token of [users.limited.token, users.admin.token]) {
    const byId = await resolveTurn(token, { caseId: cases.otherTenant.id, message: STATUS_MESSAGE });
    assert.notEqual(byId.status, 500);
    assertNoLeak(byId, marker.otherTenant);
    const byThread = await resolveTurn(token, { threadId: cases.otherTenant.threadId, message: STATUS_MESSAGE });
    assert.notEqual(byThread.status, 500);
    assertNoLeak(byThread, marker.otherTenant, cases.otherTenant.id);
    const byMessage = await resolveTurn(token, { message: `qual status do caso ${cases.otherTenant.id}?` });
    assert.notEqual(byMessage.status, 500);
    assertNoLeak(byMessage, marker.otherTenant);
  }
});

// G — negativa de permissão de workspace: 403 (não 500) e sem detalhes internos.
test("G: membro sem imob.chat.use recebe 403 IMOB_WORKSPACE_PERMISSION_FORBIDDEN, sem detalhes internos", async () => {
  const auditBefore = await deniedAuditRows();
  const response = await resolveTurn(users.noChat.token, { message: STATUS_MESSAGE });
  assert.equal(response.status, 403);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "IMOB_WORKSPACE_PERMISSION_FORBIDDEN");
  assert.deepEqual(response.body?.error?.scope, { tenantId, workspaceId }, "o escopo devolvido é apenas o do próprio solicitante");
  assert.equal(/stack|prisma|zod|ZodError|SELECT |at \w+ \(/.test(serialized(response)), false);
  assertNoLeak(response, cases.denied.id, cases.allowed.id, marker.denied, marker.allowed);
  assert.equal(await waitForDeniedAudit(auditBefore), true, "a negativa de workspace é auditada com escopo preenchido");
});

// H — falha interna genuína não é mascarada como 403.
test("H: falha interna genuína continua 500 INTERNAL_ERROR (não vira 403)", async () => {
  await prismaGlobal.$executeRawUnsafe("ALTER TABLE imob_cases RENAME TO imob_cases_p12_off");
  try {
    const response = await resolveTurn(users.admin.token, { caseId: cases.allowed.id, message: STATUS_MESSAGE });
    assert.equal(response.status, 500);
    assert.notEqual(response.body?.error?.code, "IMOB_STAGE_FORBIDDEN");
    assert.notEqual(response.body?.error?.code, "IMOB_WORKSPACE_PERMISSION_FORBIDDEN");
    assert.equal(/imob_cases|prisma|stack/i.test(serialized(response)), false, "a resposta 500 não expõe detalhes internos");
  } finally {
    await prismaGlobal.$executeRawUnsafe("ALTER TABLE imob_cases_p12_off RENAME TO imob_cases");
  }
});

// I — sem desvio por recuperação de contexto, threadId, id na mensagem ou continuação de conversa.
test("I: threadId, id na mensagem e contexto de conversa não contornam a etapa negada", async () => {
  const byThread = await resolveTurn(users.limited.token, { threadId: cases.denied.threadId, message: STATUS_MESSAGE });
  assertStageDenied(byThread);
  assertNoLeak(byThread, cases.denied.id, marker.denied);

  const byMessage = await resolveTurn(users.limited.token, { message: `qual status do caso ${cases.denied.id}?` });
  assert.notEqual(byMessage.status, 500);
  assertNoLeak(byMessage, marker.denied);
  assert.notEqual(returnedCaseId(byMessage), cases.denied.id);

  const byContext = await resolveTurn(users.limited.token, {
    message: STATUS_MESSAGE,
    threadState: { operational: { caseId: cases.denied.id, caseStage: STAGE_DENIED } },
  });
  assert.notEqual(byContext.status, 500);
  assertNoLeak(byContext, marker.denied);
  assert.notEqual(returnedCaseId(byContext), cases.denied.id);

  const continuation = await resolveTurn(users.limited.token, { message: "e o que falta nele?" });
  assert.notEqual(continuation.status, 500);
  assertNoLeak(continuation, marker.denied);
  assert.notEqual(returnedCaseId(continuation), cases.denied.id);
});

test("I2: ação direcionada por actionId em caso de etapa negada é negada", async () => {
  const response = await resolveTurn(users.limited.token, { caseId: cases.denied.id, actionId: "p12-acao-inexistente", message: STATUS_MESSAGE });
  assertStageDenied(response);
});

// ---------------------------------------------------------------------------------------------------------------------
// P12.1 — membership revogada/não ativa não consulta nem opera casos (todas as rotas do IMOB).
test("R1: membership revogada ou suspensa recebe 403 IMOB_WORKSPACE_MEMBERSHIP_INACTIVE em rotas de caso, owner e command center, sem dados", async () => {
  for (const status of ["revoked", "suspended"]) {
    await setMembershipStatus(users.limited.id, status);
    try {
      const auditBefore = await deniedAuditRows();
      const chat = await resolveTurn(users.limited.token, { caseId: cases.allowed.id, message: STATUS_MESSAGE });
      assertMembershipInactive(chat);
      assertNoLeak(chat, cases.allowed.id, marker.allowed, cases.denied.id, marker.denied);
      assert.equal(await waitForDeniedAudit(auditBefore), true, "a negativa é auditada com escopo preenchido");
      const byCase = await api("get", `/cases/${cases.allowed.id}/events`, users.limited.token);
      assertMembershipInactive(byCase);
      assertMembershipInactive(await api("get", `/cases/${cases.allowed.id}`, users.limited.token));
      assertMembershipInactive(await api("get", "/owners", users.limited.token));
      assertMembershipInactive(await api("get", "/command-center/funnel-health", users.limited.token));
      assertMembershipInactive(await api("get", "/chat/conversations", users.limited.token));
      assertNoLeak(byCase, marker.allowed, entityMarker.ownerAllowed);
    } finally {
      await setMembershipStatus(users.limited.id, "active");
    }
  }
});

test("R2: a negativa segue o status vivo da membership (sem cache) e não afeta outras pessoas do workspace", async () => {
  await setMembershipStatus(users.limited.id, "revoked");
  try {
    assertMembershipInactive(await resolveTurn(users.limited.token, { caseId: cases.allowed.id, message: STATUS_MESSAGE }));
    const adminWhileRevoked = await resolveTurn(users.admin.token, { message: STATUS_MESSAGE });
    assert.equal(adminWhileRevoked.status, 200, "outra pessoa com membership ativa continua operando");
  } finally {
    await setMembershipStatus(users.limited.id, "active");
  }
  const restored = await resolveTurn(users.limited.token, { caseId: cases.allowed.id, message: STATUS_MESSAGE });
  assert.equal(restored.status, 200, "reativada, volta a operar (nada foi apagado)");
  assert.ok(serialized(restored).includes(cases.allowed.id) || serialized(restored).includes(marker.allowed));
});

test("R3: token de serviço sem pessoa associada é negado pela autoridade de serviço do IMOB (403 IMOB_SERVICE_AUTHORITY_REQUIRED), não pela guarda de vínculo do P12", async () => {
  // AUTHZ-IMOB-SERVICE-001 (C03): token sem `userId` não é "corretor" e não recebe o IMOB por ausência de usuário. A guarda de vínculo do P12
  // continua não o negando por vínculo (não é `IMOB_WORKSPACE_MEMBERSHIP_INACTIVE`); quem nega, fail-closed, é a porta de autoridade de serviço.
  const response = await resolveTurn(serviceToken, { message: STATUS_MESSAGE });
  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "IMOB_SERVICE_AUTHORITY_REQUIRED");
  assert.notEqual(response.body?.error?.code, "IMOB_WORKSPACE_MEMBERSHIP_INACTIVE");
});

test("R4: falha ao consultar a membership é erro interno (500), nunca 403 nem 200", async () => {
  await prismaGlobal.$executeRawUnsafe("ALTER TABLE eiah_workspace_memberships RENAME TO eiah_workspace_memberships_p12_off");
  try {
    const response = await resolveTurn(users.limited.token, { caseId: cases.allowed.id, message: STATUS_MESSAGE });
    assert.equal(response.status, 500);
    assert.notEqual(response.body?.error?.code, "IMOB_WORKSPACE_MEMBERSHIP_INACTIVE");
    assertNoLeak(response, marker.allowed, cases.allowed.id);
  } finally {
    await prismaGlobal.$executeRawUnsafe("ALTER TABLE eiah_workspace_memberships_p12_off RENAME TO eiah_workspace_memberships");
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// P12.2 — owner, imóvel e lead: permissão do workspace e etapa da entidade nas rotas REST.
const REST_ENTITIES = [
  { path: "owners", idKey: "ownerId", allowed: "ownerAllowed", denied: "ownerDenied", markerAllowed: entityMarker.ownerAllowed, markerDenied: entityMarker.ownerDenied, field: "status", create: { name: "Owner P12 novo" } },
  { path: "properties", idKey: "propertyId", allowed: "propertyAllowed", denied: "propertyDenied", markerAllowed: entityMarker.propertyAllowed, markerDenied: entityMarker.propertyDenied, field: "status", create: { address: "Rua P12 novo" } },
  { path: "leads", idKey: "leadId", allowed: "leadAllowed", denied: "leadDenied", markerAllowed: entityMarker.leadAllowed, markerDenied: entityMarker.leadDenied, field: "stage", create: { name: "Lead P12 novo" } },
] as const;

for (const entity of REST_ENTITIES) {
  test(`E-${entity.path}: lista filtra por etapa; leitura, alteração e remoção de etapa negada respondem 403 sem dados`, async () => {
    const list = await api("get", `/${entity.path}`, users.limited.token);
    assert.equal(list.status, 200);
    assert.ok(serialized(list).includes(entity.markerAllowed), "etapa permitida aparece");
    assertNoLeak(list, entity.markerDenied, entityId[entity.denied]);

    const readAllowed = await api("get", `/${entity.path}/${entityId[entity.allowed]}`, users.limited.token);
    assert.equal(readAllowed.status, 200);

    const readDenied = await api("get", `/${entity.path}/${entityId[entity.denied]}`, users.limited.token);
    assertStageDenied(readDenied);
    assertNoLeak(readDenied, entity.markerDenied, entityId[entity.denied]);

    const patchDenied = await api("patch", `/${entity.path}/${entityId[entity.denied]}`, users.limited.token, { [entity.path === "properties" ? "city" : "name"]: "ALTERADO-INDEVIDO" });
    assertStageDenied(patchDenied);
    const escalate = await api("patch", `/${entity.path}/${entityId[entity.allowed]}`, users.limited.token, { [entity.field]: STAGE_DENIED });
    assertStageDenied(escalate);
    const createDenied = await api("post", `/${entity.path}`, users.limited.token, { ...entity.create, [entity.field]: STAGE_DENIED });
    assertStageDenied(createDenied);

    if (entity.path !== "leads") {
      const delDenied = await api("delete", `/${entity.path}/${entityId[entity.denied]}`, users.limited.token);
      assertStageDenied(delDenied);
    }

    // Nada foi alterado nem arquivado pelas tentativas negadas.
    const model = entity.path === "owners" ? "imobOwner" : entity.path === "properties" ? "imobProperty" : "imobLead";
    const row = await prismaGlobal[model].findUnique({ where: { id: entityId[entity.denied] } });
    assert.equal(row[entity.field], STAGE_DENIED);
    assert.equal(JSON.stringify(row).includes("ALTERADO-INDEVIDO"), false);
    const allowedRow = await prismaGlobal[model].findUnique({ where: { id: entityId[entity.allowed] } });
    assert.equal(allowedRow[entity.field], STAGE_ALLOWED);
  });

  test(`E-${entity.path}: perfil com todas as etapas, criação e edição legítimas continuam funcionando`, async () => {
    const admin = await api("get", `/${entity.path}`, users.admin.token);
    assert.equal(admin.status, 200);
    assert.ok(serialized(admin).includes(entity.markerAllowed) && serialized(admin).includes(entity.markerDenied));
    assert.equal((await api("get", `/${entity.path}/${entityId[entity.denied]}`, users.admin.token)).status, 200);

    const created = await api("post", `/${entity.path}`, users.limited.token, { ...entity.create });
    assert.equal(created.status, 201, "criação sem etapa explícita negada é permitida (imob.chat.use)");
    const createdId = (created.body?.data?.id ?? created.body?.data?.data?.id) as string;
    assert.ok(createdId);

    const edited = await api("patch", `/${entity.path}/${entityId[entity.allowed]}`, users.limited.token, { [entity.path === "properties" ? "city" : "name"]: `${entity.markerAllowed} editado` });
    assert.equal(edited.status, 200);
    const missing = await api("get", `/${entity.path}/id-inexistente-${suffix}`, users.limited.token);
    assert.equal(missing.status, 404, "recurso inexistente continua 404");
  });

  test(`E-${entity.path}: sem imob.chat.use responde 403 IMOB_WORKSPACE_PERMISSION_FORBIDDEN; outro workspace/tenant não aparece`, async () => {
    const denied = await api("get", `/${entity.path}`, users.noChat.token);
    assert.equal(denied.status, 403);
    assert.equal(denied.body?.error?.code, "IMOB_WORKSPACE_PERMISSION_FORBIDDEN");
    const admin = await api("get", `/${entity.path}`, users.admin.token);
    assertNoLeak(admin, entityMarker.ownerOtherWorkspace);
    const foreign = await api("get", `/${entity.path}/${entityId.ownerOtherWorkspace}`, users.admin.token);
    assert.equal(foreign.status, 404, "entidade de outro workspace é inexistente para este escopo");
    assertNoLeak(foreign, entityMarker.ownerOtherWorkspace);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// P12.2/P12.3 — o chat (resolve-turn) também respeita a etapa de owner, lead e imóvel: lookup, lista e atualização.
test("C-lists: listas do chat (proprietários, leads, imóveis) omitem a etapa negada; perfil com todas as etapas as vê", async () => {
  const cases3 = [
    { message: "listar proprietários", allowed: entityMarker.ownerAllowed, denied: entityMarker.ownerDenied },
    { message: "listar leads", allowed: entityMarker.leadAllowed, denied: entityMarker.leadDenied },
    { message: "listar imóveis", allowed: entityMarker.propertyAllowed, denied: entityMarker.propertyDenied },
  ];
  for (const item of cases3) {
    const limited = await resolveTurn(users.limited.token, { message: item.message });
    assert.equal(limited.status, 200);
    assert.ok(serialized(limited).includes(item.allowed), `limitado vê a etapa permitida (${item.message})`);
    assertNoLeak(limited, item.denied);
    const admin = await resolveTurn(users.admin.token, { message: item.message });
    assert.ok(serialized(admin).includes(item.denied), `controle positivo: perfil com etapa '*' vê a etapa negada (${item.message})`);
  }
});

test("C-owner: lookup por telefone/documento de owner em etapa negada devolve 'não encontrado' e nenhum dado; admin encontra", async () => {
  for (const message of ["consultar proprietário telefone 47933330002", "consultar proprietário 11122233396"]) {
    const limited = await resolveTurn(users.limited.token, { message });
    assert.equal(limited.status, 200);
    assert.equal(limited.body?.data?.presentation?.card?.title, "Proprietário não encontrado");
    assertNoLeak(limited, "47933330002", `negado-chat-${alpha}@p12.invalid`, "11122233396", `Chat Negado ${alpha}`);
  }
  const admin = await resolveTurn(users.admin.token, { message: "consultar proprietário telefone 47933330002" });
  assert.ok(serialized(admin).includes("47933330002"), "controle positivo: o cadastro é alcançável por quem opera a etapa");
});

test("C-update: atualização por chat de owner/lead em etapa negada não altera nada; quem opera a etapa altera", async () => {
  const limitedOwner = await resolveTurn(users.limited.token, { message: "atualizar proprietário 11122233396 telefone 47900001111" });
  assert.notEqual(limitedOwner.status, 500);
  const limitedLead = await resolveTurn(users.limited.token, { message: "consultar lead telefone 47944440002" });
  assert.equal(limitedLead.status, 200);
  assert.equal(limitedLead.body?.data?.presentation?.card?.title, "Lead não encontrado");
  const ownerRow = await prismaGlobal.imobOwner.findUnique({ where: { id: entityId.ownerChatDenied } });
  const leadRow = await prismaGlobal.imobLead.findUnique({ where: { id: entityId.leadChatDenied } });
  assert.equal(ownerRow.phone, "47933330002", "telefone do owner de etapa negada não mudou");
  assert.equal(leadRow.stage, STAGE_DENIED, "etapa do lead negado não mudou");

  // Controle positivo: o mesmo texto, por quem opera a etapa, alcança e altera o lead (prova que o caminho era alcançável).
  const admin = await resolveTurn(users.admin.token, { message: "consultar lead telefone 47944440002" });
  assert.equal(admin.status, 200);
  const leadAfter = await prismaGlobal.imobLead.findUnique({ where: { id: entityId.leadChatDenied } });
  assert.notEqual(leadAfter.stage, STAGE_DENIED, "quem opera a etapa alcança o lead");
});

// Escopo de etapa do prisma dos resolvedores (unidade, sem banco): mesma regra para caso, owner, lead e imóvel.
test("U-scope: scopeImobPrismaToStage filtra leituras, falha fechado, preserva curinga e escopa transações", async () => {
  const { scopeImobPrismaToStage } = await import("../services/imob/crm/imobCrmOperationalResolverShared");
  const calls: string[] = [];
  const rows = {
    imobCase: [{ id: "c-denied", stage: "ready_for_review" }, { id: "c-ok", stage: "pending_data" }],
    imobOwner: [{ id: "o-denied", status: "ready_for_review", name: "x" }, { id: "o-ok", status: "pending_data", name: "y" }],
    imobLead: [{ id: "l-denied", stage: "ready_for_review" }, { id: "l-ok", stage: "pending_data" }],
    imobProperty: [{ id: "p-denied", status: "ready_for_review" }, { id: "p-ok", status: "pending_data" }],
  } as Record<string, any[]>;
  const delegate = (model: string) => ({
    findMany: async (args: any) => { calls.push(`${model}.findMany`); return rows[model].map((row) => (args?.select ? Object.fromEntries(Object.entries(row).filter(([k]) => args.select[k])) : row)); },
    findFirst: async (args: any) => (await (delegate(model).findMany(args)))[0] ?? null,
    findUnique: async (args: any) => rows[model].find((row) => row.id === args.where.id) ?? null,
    create: async () => { calls.push(`${model}.create`); return { id: "novo" }; },
  });
  const fake: any = {
    imobCase: delegate("imobCase"), imobOwner: delegate("imobOwner"), imobLead: delegate("imobLead"), imobProperty: delegate("imobProperty"),
    marker: "passthrough",
    $queryRaw: async function () { return (this as any) === fake ? "bound-ok" : "unbound"; },
    $transaction: async (work: any) => (typeof work === "function" ? work(fake) : work),
  };
  const gate = (stage: string | null | undefined) => !stage || stage === "pending_data";
  const scoped: any = scopeImobPrismaToStage(fake, gate);

  assert.equal(scopeImobPrismaToStage(fake, () => true), fake, "curinga (todas as etapas): o mesmo objeto, sem filtro");
  assert.equal(scopeImobPrismaToStage(fake, undefined), fake, "sem gate: o mesmo objeto");
  for (const [model, ok, denied] of [["imobCase", "c-ok", "c-denied"], ["imobOwner", "o-ok", "o-denied"], ["imobLead", "l-ok", "l-denied"], ["imobProperty", "p-ok", "p-denied"]] as const) {
    assert.deepEqual((await scoped[model].findMany({})).map((row: any) => row.id), [ok], `${model}: lista só a etapa permitida`);
    assert.equal((await scoped[model].findFirst({ orderBy: { updatedAt: "desc" } })).id, ok, `${model}: 'mais recente' = o mais recente AUTORIZADO`);
    assert.equal(await scoped[model].findUnique({ where: { id: denied } }), null, `${model}: id de etapa negada => null`);
    assert.equal((await scoped[model].findUnique({ where: { id: ok } })).id, ok);
  }
  // select sem o campo de etapa: o campo é lido para decidir e removido do resultado.
  const selected = await scoped.imobOwner.findMany({ select: { id: true } });
  assert.deepEqual(selected, [{ id: "o-ok" }]);
  // nenhuma etapa permitida => vazio/null (falha fechado).
  const none: any = scopeImobPrismaToStage(fake, (stage) => stage === "nenhuma");
  assert.deepEqual(await none.imobLead.findMany({}), []);
  assert.equal(await none.imobCase.findFirst({}), null);
  // escritas, propriedades e métodos não relacionados passam sem alteração; `this` é preservado.
  assert.deepEqual(await scoped.imobOwner.create({ data: {} }), { id: "novo" });
  assert.equal(scoped.marker, "passthrough");
  assert.equal(await scoped.$queryRaw(), "bound-ok");
  // transação: o cliente da transação também é escopado.
  const inTx = await scoped.$transaction(async (tx: any) => (await tx.imobLead.findMany({})).map((row: any) => row.id));
  assert.deepEqual(inTx, ["l-ok"]);
});
