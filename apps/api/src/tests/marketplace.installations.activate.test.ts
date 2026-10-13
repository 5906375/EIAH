import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureCommercialAuthorityStore } from "../services/commercialAuthority";
import { ensureAgentEnablementStore } from "../services/agentEnablement";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-install-${suffix}`;
const workspaceId = `workspace-install-${suffix}`;
const userId = `user-install-${suffix}`;
const apiToken = `tok-install-${suffix}`;
// Usuário do workspace sem permissão de ativar produtos (Corretor).
const memberUserId = `user-member-${suffix}`;
const memberToken = `tok-member-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "Marketplace Installer" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "marketplace-installation-test",
      revoked: false,
    },
  });
  // Só o proprietário (Founder) ou quem tem products.activate ativa produtos.
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey: "founder" });
  await prismaGlobal.user.create({
    data: { id: memberUserId, tenantId, email: `${memberUserId}@example.com`, displayName: "Marketplace Member" },
  });
  await prismaGlobal.apiToken.create({
    data: { token: memberToken, tenantId, workspaceId, userId: memberUserId, description: "marketplace-member-test", revoked: false },
  });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: memberUserId, roleKey: "corretor" });
  // ADR-011: a EIAH já liberou o IMOB neste workspace (o fluxo de liberação tem teste próprio).
  await ensureVerticalAccessStore(prismaGlobal);
  await prismaGlobal.$executeRaw`
    INSERT INTO vertical_access_approvals (id, tenant_id, workspace_id, vertical, status, source, decided_by, decided_at)
    VALUES (${`approval-${suffix}`}, ${tenantId}, ${workspaceId}, 'IMOB', 'aprovado', 'request', 'admin:test@example.com', NOW())
  `;
});

test("POST /api/marketplace/installations/activate recusa quem não é proprietário nem tem permissão de ativar", async () => {
  const res = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ product: "IMOB" });
  assert.equal(res.status, 403);
  assert.equal(res.body?.error?.code, "PRODUCT_ACTIVATION_FORBIDDEN");
  const rows = await prismaGlobal.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total FROM tenant_product_installations
    WHERE tenant_id = ${tenantId} AND workspace_id = ${workspaceId}
  `;
  assert.equal(Number(rows[0]?.total ?? 0), 0, "nada foi instalado");
});

after(async () => {
  await prismaGlobal.workspaceAgentAssignment.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.tenantActionPolicy.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.$executeRaw`
    DELETE FROM tenant_product_installations
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
  `;
  await prismaGlobal.$executeRaw`DELETE FROM vertical_access_approval_events WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$executeRaw`DELETE FROM vertical_access_approvals WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$disconnect();
});

test("POST /api/marketplace/installations/activate ativa IMOB e retorna rotas liberadas", async () => {
  const res = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "IMOB" });

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.installation?.tenantId, tenantId);
  assert.equal(res.body?.installation?.workspaceId, workspaceId);
  assert.equal(res.body?.installation?.product, "IMOB");
  assert.equal(res.body?.installation?.status, "active");
  assert.ok(Array.isArray(res.body?.releasedRoutes));
  assert.ok(res.body?.releasedRoutes.includes("/app/imob/chat"));

  // ADR-010 (PR A): activation provisions the agents the IMOB vertical requires.
  const assignments = await prismaGlobal.workspaceAgentAssignment.findMany({
    where: { tenantId, workspaceId },
    select: { agentKey: true, enabled: true },
  });
  assert.deepEqual(
    assignments.map((item) => item.agentKey).sort(),
    ["EIAH", "imob-chat-audit"],
  );
  assert.ok(assignments.every((item) => item.enabled));

  // ADR-010 (PR A2): activation grants only the approved IMOB registration policies.
  const policies = await prismaGlobal.tenantActionPolicy.findMany({
    where: { tenantId, workspaceId },
    select: { actionName: true, allowed: true },
  });
  assert.deepEqual(
    policies.map((item) => item.actionName).sort(),
    ["realestate.collect_documents", "realestate.qualify_lead", "realestate.register_property"],
  );
  assert.ok(policies.every((item) => item.allowed));

  const list = await request
    .get("/api/marketplace/installations")
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(list.status, 200);
  assert.equal(list.body?.ok, true);
  const imob = (list.body?.items ?? []).find((entry: any) => entry.product === "IMOB");
  assert.ok(imob);
  assert.equal(imob.status, "active");
});

test("POST /api/marketplace/installations/activate é idempotente por tenant/workspace/produto", async () => {
  const first = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "IMOB" });

  const second = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "IMOB" });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const rows = await prismaGlobal.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::bigint AS count
    FROM tenant_product_installations
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
      AND product = 'IMOB'
  `;

  const countValue = rows[0]?.count;
  const count = typeof countValue === "bigint" ? Number(countValue) : Number(countValue ?? 0);
  assert.equal(count, 1);

  const assignmentCount = await prismaGlobal.workspaceAgentAssignment.count({ where: { tenantId, workspaceId } });
  assert.equal(assignmentCount, 2, "re-activation must not duplicate agent assignments");

  const policyCount = await prismaGlobal.tenantActionPolicy.count({ where: { tenantId, workspaceId } });
  assert.equal(policyCount, 3, "re-activation must not duplicate action policies");
});

test("POST /api/marketplace/installations/activate rejeita produto inválido", async () => {
  const res = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "LEGAL" });

  assert.equal(res.status, 400);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "INVALID_PAYLOAD");
});

// ---------------------------------------------------------------------------------------------
// AUTHZ-SCOPE-1 — autoridade comercial (marketplace.subscribe): HTTP + PostgreSQL reais, dados sintéticos descartáveis.
// Nenhuma contratação, cobrança, campanha ou integração externa: os efeitos são linhas sintéticas do banco de teste.
// A primeira designação `grantor` é uma fixture sintética (o bootstrap real permanece bloqueado, ver o último teste).
// ---------------------------------------------------------------------------------------------

describe("AUTHZ-SCOPE-1: autoridade comercial de contratação de agentes", () => {
  const sx = `${suffix}-authz`;
  const ids = {
    tA: `tenant-authz-a-${sx}`, tB: `tenant-authz-b-${sx}`, tP: `tenant-authz-p-${sx}`,
    wA: `workspace-authz-a-${sx}`, wA2: `workspace-authz-a2-${sx}`, wB: `workspace-authz-b-${sx}`, wP: `workspace-authz-p-${sx}`,
  };
  const users = Object.fromEntries(
    ["founder", "techAdmin", "grantor", "grantor2", "holder", "plain", "plain2", "roleUser", "gB", "h3", "outsider", "tbUser", "pub", "nonMember"]
      .map((name) => [name, `user-authz-${name}-${sx}`]),
  ) as Record<string, string>;
  const tokens = Object.fromEntries(
    [...Object.keys(users), "service", "holderWs2"].map((name) => [name, `tok-authz-${name}-${sx}-SECRETLIKE`]),
  ) as Record<string, string>;
  const item = {
    a: `Authority Agent A ${sx}`, b: `Authority Agent B ${sx}`, c: `Authority Agent C ${sx}`, d: `Authority Agent D ${sx}`,
    // agente GOVERNADO (declara capacidades transversais): a habilitação exige o registro verificável
    mkt: "MKT",
  };
  const extraTenants: string[] = [];
  const itemIds: Record<string, string> = {};
  const EVID = (n: number) => `SYNTH-EVIDENCE-${n}`;
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const as = (name: string) => `Bearer ${tokens[name]}`;
  const api = {
    post: (name: string, path: string, body: unknown = {}) => request.post(path).set("Authorization", as(name)).send(body as object),
    put: (name: string, path: string, body: unknown = {}) => request.put(path).set("Authorization", as(name)).send(body as object),
    patch: (name: string, path: string, body: unknown = {}) => request.patch(path).set("Authorization", as(name)).send(body as object),
    get: (name: string, path: string) => request.get(path).set("Authorization", as(name)),
  };
  const subscribe = (name: string, key: keyof typeof item, body: unknown = {}) => api.post(name, `/api/marketplace/${itemIds[key]}/subscribe`, body);
  const grant = (name: string, beneficiary: string, over: Record<string, unknown> = {}) =>
    api.post(name, "/api/commercial-authority/designations", {
      decision: "grant", beneficiaryUserId: users[beneficiary], role: "holder", validUntil: inDays(60), evidenceRef: EVID(1), ...over,
    });

  async function count(sql: string, ...values: unknown[]) {
    const rows = (await prismaGlobal.$queryRawUnsafe(sql, ...values)) as Array<{ n: bigint | number }>;
    return Number(rows[0]?.n ?? 0);
  }
  const delegationsFor = (key: keyof typeof item) =>
    prismaGlobal.delegationPolicy.count({ where: { delegateeId: ids.tA, marketplaceId: itemIds[key] } });
  const policiesFor = (key: keyof typeof item) =>
    prismaGlobal.tenantActionPolicy.count({ where: { tenantId: ids.tA, actionName: { equals: item[key], mode: "insensitive" } } });
  const designationsOf = (userKey: string) =>
    count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1 AND beneficiary_user_id = $2", ids.tA, users[userKey]);
  const activeDesignation = async (userKey: string, role: string) =>
    count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1 AND beneficiary_user_id = $2 AND authority_role = $3 AND revoked_at IS NULL AND valid_until > NOW()", ids.tA, users[userKey], role);
  const auditEvents = (eventType: string) =>
    prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId: ids.tA, eventType }, orderBy: { createdAt: "asc" } });
  async function seedDesignation(params: { workspaceId?: string; userKey: string; role: "holder" | "grantor"; limits?: object; days?: number }) {
    const id = `cad_seed_${params.userKey}_${sx}`;
    await prismaGlobal.$executeRawUnsafe(
      `INSERT INTO eiah_commercial_authority_designations
         (id, tenant_id, workspace_id, beneficiary_user_id, scope, authority_role, limits, granted_by_user_id, evidence_ref, valid_until)
       VALUES ($1, $2, $3, $4, 'marketplace.subscribe', $5, $6::jsonb, 'synthetic-fixture', 'SYNTHETIC-FIXTURE-SEED', NOW() + ($7 || ' days')::interval)`,
      id, ids.tA, params.workspaceId ?? ids.wA, users[params.userKey], params.role,
      JSON.stringify(params.limits ?? { allowedScopes: ["read", "execute", "admin"], maxValidityDays: 365 }), String(params.days ?? 300),
    );
    return id;
  }

  before(async () => {
    await prismaGlobal.tenant.createMany({ data: [ids.tA, ids.tB, ids.tP].map((id) => ({ id, name: id })) });
    await prismaGlobal.workspace.createMany({ data: [
      { id: ids.wA, tenantId: ids.tA, name: ids.wA }, { id: ids.wA2, tenantId: ids.tA, name: ids.wA2 },
      { id: ids.wB, tenantId: ids.tB, name: ids.wB }, { id: ids.wP, tenantId: ids.tP, name: ids.wP },
    ] });
    const home: Record<string, string> = { tbUser: ids.tB, pub: ids.tP };
    await prismaGlobal.user.createMany({ data: Object.entries(users).map(([name, id]) => ({
      id, tenantId: home[name] ?? ids.tA, email: `${name}-${sx}@example.com`, displayName: `Authz ${name}`,
    })) });
    const tokenRow = (name: string, tenantId: string, workspaceId: string, userId: string | null) =>
      ({ token: tokens[name], tenantId, workspaceId, userId, description: `authz-${name}`, revoked: false });
    await prismaGlobal.apiToken.createMany({ data: [
      ...Object.keys(users).filter((name) => !["tbUser", "pub", "nonMember"].includes(name)).map((name) => tokenRow(name, ids.tA, name === "outsider" ? ids.wA2 : ids.wA, users[name])),
      tokenRow("nonMember", ids.tA, ids.wA, users.nonMember),
      tokenRow("service", ids.tA, ids.wA, null),
      tokenRow("holderWs2", ids.tA, ids.wA2, users.holder),
      tokenRow("tbUser", ids.tB, ids.wB, users.tbUser),
      tokenRow("pub", ids.tP, ids.wP, users.pub),
    ] });
    const member = (userKey: string, roleKey: string, workspaceId = ids.wA, tenantId = ids.tA) =>
      ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: users[userKey], roleKey });
    await member("founder", "founder");
    await member("techAdmin", "admin");
    for (const name of ["grantor", "grantor2", "holder", "plain", "plain2", "roleUser", "gB", "h3"]) await member(name, "corretor");
    await member("outsider", "corretor", ids.wA2);
    await member("tbUser", "gestor", ids.wB, ids.tB);
    await member("pub", "gestor", ids.wP, ids.tP);
    // "papel personalizado" que carrega a string da permissão numa membership: sem designação, ela não vale nada.
    await prismaGlobal.$executeRawUnsafe(
      `UPDATE eiah_workspace_memberships SET permissions = permissions || '["marketplace.subscribe"]'::jsonb WHERE user_id = $1 AND tenant_id = $2`,
      users.roleUser, ids.tA,
    );
    // Administrador técnico: actions.admin no workspace (política sintética), sem autoridade comercial.
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId: ids.tA, workspaceId: ids.wA, actionName: "actions.admin", allowed: true } });
    for (const key of ["a", "b", "c", "d"] as const) {
      const created = await prismaGlobal.marketplaceItem.create({ data: { type: "agent", name: item[key], version: "1", isPublic: true, publisherId: ids.tP, trustScore: 70 } });
      itemIds[key] = created.id;
    }
    const mkt = await prismaGlobal.marketplaceItem.create({ data: { type: "agent", name: "MKT", version: "1", isPublic: true, publisherId: ids.tP, trustScore: 71 } });
    itemIds.mkt = mkt.id;
    await ensureCommercialAuthorityStore(prismaGlobal);
    await ensureAgentEnablementStore(prismaGlobal);
    await seedDesignation({ userKey: "grantor", role: "grantor" });
    await seedDesignation({ userKey: "grantor2", role: "grantor", limits: { allowedScopes: ["read"], maxValidityDays: 30 }, days: 20 });
  });

  after(async () => {
    const tenants = [ids.tA, ids.tB, ids.tP];
    await prismaGlobal.$executeRawUnsafe("DROP TRIGGER IF EXISTS eiah_authz_test_block_audit ON guardrail_audit_ledger").catch(() => undefined);
    await prismaGlobal.$executeRawUnsafe("DROP FUNCTION IF EXISTS eiah_authz_test_block_audit()").catch(() => undefined);
    await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_agent_commercial_enablements WHERE tenant_id = ANY($1)", [...tenants, ...extraTenants]).catch(() => undefined);
    await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_commercial_authority_designations WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
    await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId: { in: tenants } } });
    await prismaGlobal.delegationPolicy.deleteMany({ where: { OR: [{ delegateeId: { in: tenants } }, { delegatorId: { in: tenants } }] } });
    await prismaGlobal.tenantActionPolicy.deleteMany({ where: { tenantId: { in: tenants } } });
    await prismaGlobal.marketplaceItem.deleteMany({ where: { publisherId: { in: tenants } } });
    await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_invitations WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
    await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_memberships WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
    await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_roles WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
    await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_workspace_role_assignments WHERE tenant_id = ANY($1)", tenants).catch(() => undefined);
    await prismaGlobal.apiToken.deleteMany({ where: { tenantId: { in: tenants } } });
    await prismaGlobal.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prismaGlobal.workspace.deleteMany({ where: { tenantId: { in: tenants } } });
    // requireScope (actions.admin) grava em guardrail_ledger, que é append-only por desenho: o tenant que a rota
    // administrativa tocou não pode ser apagado. Os demais são removidos; o banco de teste é descartável.
    for (const id of tenants) await prismaGlobal.tenant.deleteMany({ where: { id } }).catch(() => undefined);
  });

  test("1-5 sem designação ninguém contrata: pessoa comum, Founder, administrador técnico, 'papel personalizado', serviço, outro workspace e outro tenant", async () => {
    const attempts: Array<[string, string]> = [
      ["plain", "pessoa sem designação"], ["founder", "Founder sem concessão explícita"], ["techAdmin", "administrador técnico (actions.admin)"],
      ["roleUser", "papel/permissão marketplace.subscribe na membership, sem designação"], ["service", "token de serviço sem pessoa"],
      ["holderWs2", "titular de outro workspace usando o token do workspace B"], ["tbUser", "pessoa de outro tenant"], ["nonMember", "sem membership"],
    ];
    for (const [name, label] of attempts) {
      const response = await subscribe(name, "a", { tenantId: ids.tA, workspaceId: ids.wA, authority: "contratacao_autorizada" });
      assert.equal(response.status, 403, label);
      assert.equal(response.body?.error?.code, "MARKETPLACE_SUBSCRIBE_FORBIDDEN", label);
    }
    assert.equal(await delegationsFor("a"), 0, "nenhuma delegação criada");
    assert.equal(await policiesFor("a"), 0, "nenhuma política criada");
    const denied = await auditEvents("marketplace.subscribe.denied");
    assert.equal(denied.length >= 7, true, "as negações do tenant são registradas");
    const serialized = JSON.stringify(denied);
    assert.equal(serialized.includes("SECRETLIKE"), false, "nenhum token (nem fragmento) no ledger");
    assert.equal(/bearer/i.test(serialized), false);
    assert.equal(await prismaGlobal.workspaceAgentAssignment.count({ where: { tenantId: ids.tA } }), 0, "nenhum produto/agente provisionado");
  });

  test("5 papel personalizado não permite autoconcessão; e ninguém concede a si mesmo; bootstrap bloqueado e explícito", async () => {
    const self = await grant("roleUser", "roleUser");
    assert.equal(self.status, 403);
    assert.equal(self.body.error.code, "SELF_GRANT_FORBIDDEN");
    // token de serviço/agente (sem pessoa) nunca concede nem revoga, com motivo explícito
    const serviceGrant = await grant("service", "plain2");
    assert.equal(serviceGrant.status, 403);
    assert.equal(serviceGrant.body.error.code, "IDENTITY_REQUIRED");
    const serviceRevoke = await api.post("service", `/api/commercial-authority/designations/cad_seed_grantor_${sx}/revoke`, { decision: "revoke", reason: "tentativa de serviço", evidenceRef: EVID(2) });
    assert.equal(serviceRevoke.status, 403);
    assert.equal(serviceRevoke.body.error.code, "IDENTITY_REQUIRED");
    assert.equal(await activeDesignation("grantor", "grantor"), 1, "a autoridade do concedente segue intacta");
    for (const name of ["roleUser", "founder", "techAdmin", "plain", "holder"]) {
      const response = await grant(name, "plain2");
      assert.equal(response.status, 403, name);
      assert.equal(response.body.error.code, "GRANTOR_AUTHORITY_REQUIRED", name);
      assert.equal(response.body.error.bootstrap, undefined, "o workspace A tem concedente: a causa não é o bootstrap");
    }
    // workspace sem nenhum concedente: nenhuma concessão inicial implícita, com motivo explícito
    const noSource = await api.post("outsider", "/api/commercial-authority/designations", { decision: "grant", beneficiaryUserId: users.holder, role: "grantor", validUntil: inDays(30), evidenceRef: EVID(2) });
    assert.equal(noSource.status, 403);
    assert.equal(noSource.body.error.code, "GRANTOR_AUTHORITY_REQUIRED");
    assert.equal(noSource.body.error.bootstrap.reasonCode, "FIRST_AUTHORITY_SOURCE_NOT_RATIFIED");
    assert.equal(noSource.body.error.bootstrap.status, "blocked");
    const notMember = await api.post("holderWs2", "/api/commercial-authority/designations", { decision: "grant", beneficiaryUserId: users.outsider, role: "holder", validUntil: inDays(30), evidenceRef: EVID(2) });
    assert.equal(notMember.status, 403, "quem não é membro do workspace não concede");
    assert.equal(notMember.body.error.code, "ACTOR_MEMBERSHIP_NOT_ACTIVE");
    const statusWs2 = await api.get("outsider", "/api/commercial-authority/status");
    assert.equal(statusWs2.body.bootstrap.reasonCode, "FIRST_AUTHORITY_SOURCE_NOT_RATIFIED");
    assert.equal(statusWs2.body.holder, null);
    const statusA = await api.get("grantor", "/api/commercial-authority/status");
    assert.equal(statusA.body.bootstrap, null);
    assert.ok(statusA.body.grantor.designationId);
    assert.equal(await designationsOf("roleUser"), 0);
    assert.equal(await designationsOf("plain2"), 0);
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1 AND workspace_id = $2", ids.tA, ids.wA2), 0, "nenhuma designação nasceu no workspace sem concedente");
    // corpo estrito e decisão/evidência explícitas
    for (const body of [
      { decision: "grant", beneficiaryUserId: users.plain, validUntil: inDays(30), evidenceRef: EVID(1), tenantId: ids.tB },
      { decision: "grant", beneficiaryUserId: users.plain, validUntil: inDays(30), evidenceRef: EVID(1), workspaceId: ids.wB },
      { beneficiaryUserId: users.plain, validUntil: inDays(30), evidenceRef: EVID(1) },
      { decision: "grant", beneficiaryUserId: users.plain, validUntil: inDays(30) },
      { decision: "grant", beneficiaryUserId: users.plain, validUntil: "ontem", evidenceRef: EVID(1) },
      { decision: "grant", beneficiaryUserId: users.plain, role: "owner", validUntil: inDays(30), evidenceRef: EVID(1) },
    ]) {
      assert.equal((await api.post("grantor", "/api/commercial-authority/designations", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await api.get("plain", "/api/commercial-authority/designations")).status, 403, "listar exige autoridade de conceder");
  });

  test("3 concessão governada: ninguém concede o que não possui; validade e limites têm teto; separação de funções; beneficiário é membro", async () => {
    // limites e validade do concedente são o teto
    const tooLong = await grant("grantor2", "plain", { validUntil: inDays(25), limits: { allowedScopes: ["read"], maxValidityDays: 10 } });
    assert.equal(tooLong.status, 403);
    assert.equal(tooLong.body.error.code, "EXCEEDS_GRANTOR_AUTHORITY");
    const wideScope = await grant("grantor2", "plain", { validUntil: inDays(10), limits: { allowedScopes: ["read", "execute"], maxValidityDays: 10 } });
    assert.equal(wideScope.body.error.code, "EXCEEDS_GRANTOR_AUTHORITY");
    const wideDays = await grant("grantor2", "plain", { validUntil: inDays(10), limits: { allowedScopes: ["read"], maxValidityDays: 90 } });
    assert.equal(wideDays.body.error.code, "EXCEEDS_GRANTOR_AUTHORITY");
    assert.equal(await designationsOf("plain"), 0);
    // quem concede não é o beneficiário
    assert.equal((await grant("grantor", "grantor")).body.error.code, "SELF_GRANT_FORBIDDEN");
    // separação de funções: o concedente não vira titular (nem o titular concedente)
    const sod = await grant("grantor", "grantor2", { role: "holder" });
    assert.equal(sod.status, 409);
    assert.equal(sod.body.error.code, "SEPARATION_OF_DUTIES");
    // beneficiário precisa ser membro ativo do mesmo workspace; conceder NÃO convida ninguém
    const invitesBefore = await count("SELECT COUNT(*)::bigint AS n FROM eiah_workspace_invitations WHERE tenant_id = $1", ids.tA);
    const outsiderOfWs = await grant("grantor", "outsider");
    assert.equal(outsiderOfWs.status, 422);
    assert.equal(outsiderOfWs.body.error.code, "BENEFICIARY_NOT_WORKSPACE_MEMBER");
    assert.equal((await grant("grantor", "tbUser")).status, 422, "pessoa de outro tenant");
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_workspace_invitations WHERE tenant_id = $1", ids.tA), invitesBefore, "conceder autoridade não convida pessoa");
    // concessão legítima: designação + evento de auditoria referenciado
    const ok = await grant("grantor", "holder", { evidenceRef: EVID(3) });
    assert.equal(ok.status, 201);
    const d = ok.body.designation;
    assert.equal(d.beneficiaryUserId, users.holder);
    assert.equal(d.grantedByUserId, users.grantor);
    assert.equal(d.role, "holder");
    assert.deepEqual(d.limits, { allowedScopes: ["read", "execute"], maxValidityDays: 90 });
    assert.equal(d.tenantId, ids.tA);
    assert.equal(d.workspaceId, ids.wA);
    assert.equal(d.evidenceRef, EVID(3));
    assert.equal(d.grantorDesignationId, `cad_seed_grantor_${sx}`);
    const events = await auditEvents("commercial_authority.grant.authorized");
    const event = events.find((entry) => (entry.metadata as any)?.designationId === d.id);
    assert.ok(event, "evento de auditoria da concessão");
    const meta = event!.metadata as Record<string, any>;
    assert.deepEqual([meta.actorUserId, meta.beneficiaryUserId, meta.tenantId, meta.workspaceId, meta.scope, meta.role, meta.evidenceRef, meta.outcome, meta.decision],
      [users.grantor, users.holder, ids.tA, ids.wA, "marketplace.subscribe", "holder", EVID(3), "authorized", "grant"]);
    assert.equal(meta.formalRatification, "pending");
    assert.equal(meta.decisionRef, "AUTHZ-SCOPE-1/2026-10-12");
    assert.deepEqual(meta.limits, d.limits);
    assert.ok(!Number.isNaN(Date.parse(meta.decidedAt)));
    assert.equal(JSON.stringify(event).includes("SECRETLIKE"), false);
    const linked = await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE id = $1 AND grant_audit_event_id = $2", d.id, event!.id);
    assert.equal(linked, 1, "a designação aponta o evento que a fundamenta");
    // duplicidade: a tentativa recusada não deixa evento de "autorizado" (decisão e efeito são atômicos)
    const grantedEventsBefore = (await auditEvents("commercial_authority.grant.authorized")).length;
    assert.equal((await grant("grantor", "holder")).status, 409);
    assert.equal((await auditEvents("commercial_authority.grant.authorized")).length, grantedEventsBefore, "sem efeito não há evento de autorização");
    assert.equal(await activeDesignation("holder", "holder"), 1);
    // quem só TEM a autoridade de contratar não a concede
    assert.equal((await grant("holder", "plain")).body.error.code, "GRANTOR_AUTHORITY_REQUIRED");
  });

  test("12+8 fluxo positivo sintético e revogação imediata: contratar com designação, respeitar limites, revogar e perder a autoridade na chamada seguinte", async () => {
    const hired = await subscribe("holder", "a", { scope: "execute", trustMin: 55 });
    assert.equal(hired.status, 200, JSON.stringify(hired.body));
    assert.equal(hired.body.ok, true);
    assert.equal(await delegationsFor("a"), 1);
    assert.equal(await policiesFor("a"), 1);
    const authorizedEvents = await auditEvents("marketplace.subscribe.authorized");
    const decision = authorizedEvents.find((entry) => (entry.metadata as any)?.target?.marketplaceItemId === itemIds.a);
    assert.ok(decision, "decisão registrada");
    const meta = decision!.metadata as Record<string, any>;
    assert.equal(meta.decidedBy, users.holder);
    assert.equal(meta.tenantId, ids.tA);
    assert.equal(meta.workspaceId, ids.wA);
    assert.equal(meta.target.agentName, item.a);
    assert.equal(meta.target.scope, "execute");
    assert.equal(meta.target.trustMin, 55);
    assert.ok(meta.target.designationId?.startsWith("cad_"));
    assert.equal(JSON.stringify(decision).includes("SECRETLIKE"), false);

    // limites da designação: escopo admin e prazo acima do máximo
    const adminScope = await subscribe("holder", "b", { scope: "admin" });
    assert.equal(adminScope.status, 403);
    assert.equal(adminScope.body.error.code, "COMMERCIAL_LIMIT_EXCEEDED");
    const tooLong = await subscribe("holder", "b", { scope: "read", validUntil: inDays(200) });
    assert.equal(tooLong.body.error.code, "COMMERCIAL_LIMIT_EXCEEDED");
    assert.equal(await delegationsFor("b"), 0);

    // o titular vê a ação de revisão; quem só consulta não
    const seen = await api.get("holder", "/api/agents/capabilities/discover?domain=marketing&capability=campaign");
    assert.equal(seen.body.item.authority.status, "contratacao_autorizada");
    assert.equal(seen.body.item.nextAction.kind, "review_commercial_terms");

    // revogação: valida imediatamente
    const designation = (await api.get("grantor", "/api/commercial-authority/designations")).body.designations.find((entry: any) => entry.beneficiaryUserId === users.holder && !entry.revokedAt);
    assert.ok(designation);
    assert.equal((await api.post("plain", `/api/commercial-authority/designations/${designation.id}/revoke`, { decision: "revoke", reason: "tentativa indevida", evidenceRef: EVID(4) })).status, 403);
    assert.equal((await api.post("tbUser", `/api/commercial-authority/designations/${designation.id}/revoke`, { decision: "revoke", reason: "outro tenant", evidenceRef: EVID(4) })).status, 404);
    assert.equal((await api.post("grantor", `/api/commercial-authority/designations/${designation.id}/revoke`, { reason: "sem decisão", evidenceRef: EVID(4) })).status, 400);
    const revoked = await api.post("grantor", `/api/commercial-authority/designations/${designation.id}/revoke`, { decision: "revoke", reason: "fim do mandato sintético", evidenceRef: EVID(5) });
    assert.equal(revoked.status, 200);
    assert.deepEqual(revoked.body.revokedIds, [designation.id]);
    const afterRevoke = await subscribe("holder", "b", { scope: "read" });
    assert.equal(afterRevoke.status, 403, "a revogação vale na chamada seguinte");
    assert.equal(afterRevoke.body.error.reasonCode, "DESIGNATION_NOT_FOUND");
    assert.equal(await delegationsFor("b"), 0);
    const revokeEvent = (await auditEvents("commercial_authority.revoke.authorized")).find((entry) => (entry.metadata as any)?.designationId === designation.id);
    assert.ok(revokeEvent);
    assert.deepEqual([(revokeEvent!.metadata as any).actorUserId, (revokeEvent!.metadata as any).beneficiaryUserId, (revokeEvent!.metadata as any).evidenceRef], [users.grantor, users.holder, EVID(5)]);
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE id = $1 AND revoked_at IS NOT NULL AND revoked_by_user_id = $2 AND revoke_audit_event_id = $3", designation.id, users.grantor, revokeEvent!.id), 1);
    const discovered = await api.get("holder", "/api/agents/capabilities/discover?domain=marketing&capability=campaign");
    assert.equal(discovered.body.item.authority.status, "somente_consulta");
    assert.equal((await api.post("grantor", `/api/commercial-authority/designations/${designation.id}/revoke`, { decision: "revoke", reason: "de novo", evidenceRef: EVID(5) })).status, 409);

    // renúncia pela própria pessoa e revogação em cascata
    assert.equal((await grant("grantor", "plain", { role: "holder" })).status, 201);
    const plainDesignation = (await api.get("grantor", "/api/commercial-authority/designations")).body.designations.find((entry: any) => entry.beneficiaryUserId === users.plain && !entry.revokedAt);
    assert.equal((await api.post("plain", `/api/commercial-authority/designations/${plainDesignation.id}/revoke`, { decision: "revoke", reason: "renúncia sintética", evidenceRef: EVID(6) })).status, 200);
    assert.equal(await activeDesignation("plain", "holder"), 0);

    assert.equal((await grant("grantor", "gB", { role: "grantor" })).status, 201);
    const viaGB = await grant("gB", "h3", { role: "holder", validUntil: inDays(30) });
    assert.equal(viaGB.status, 201, "o novo concedente concede dentro dos limites");
    assert.equal((await subscribe("h3", "c", { scope: "read" })).status, 200);
    const gbDesignation = (await api.get("grantor", "/api/commercial-authority/designations")).body.designations.find((entry: any) => entry.beneficiaryUserId === users.gB && !entry.revokedAt);
    const cascade = await api.post("grantor", `/api/commercial-authority/designations/${gbDesignation.id}/revoke`, { decision: "revoke", reason: "perda de confiança sintética", evidenceRef: EVID(7), cascade: true });
    assert.equal(cascade.status, 200);
    assert.equal(cascade.body.revokedIds.length, 2);
    const afterCascade = await subscribe("h3", "d", { scope: "read" });
    assert.equal(afterCascade.status, 403);
    assert.equal(await delegationsFor("d"), 0);
    assert.equal((await grant("gB", "plain2")).status, 403, "concedente revogado não concede mais");
  });

  test("6-7 /actions/override e delegações não contornam o controle: nem sozinhos nem combinados", async () => {
    // administrador técnico legítimo (actions.admin) tentando criar autoridade/efeito comercial
    for (const actionName of ["marketplace.subscribe", " Marketplace.Subscribe "]) {
      const response = await api.post("techAdmin", "/api/actions/override", { actionName, allowed: true });
      assert.equal(response.status, 409, actionName);
      assert.equal(response.body.error.code, "COMMERCIAL_AUTHORITY_REQUIRED", actionName);
    }
    for (const actionName of [item.d, item.d.toUpperCase()]) {
      const response = await api.post("techAdmin", "/api/actions/override", { actionName, allowed: true });
      assert.equal(response.status, 403, actionName);
      assert.equal(response.body.error.code, "MARKETPLACE_SUBSCRIBE_FORBIDDEN", actionName);
    }
    const mkt = await api.post("techAdmin", "/api/actions/override", { actionName: "MKT", allowed: true });
    assert.equal(mkt.status, 403, "agente canônico: actions.admin sem autoridade individual");
    assert.equal(await policiesFor("d"), 0);
    assert.equal(await prismaGlobal.tenantActionPolicy.count({ where: { tenantId: ids.tA, actionName: { in: ["marketplace.subscribe", "MKT"] } } }), 0);
    // rota continua protegida por actions.admin e preserva operações legítimas
    // actions.admin é política do WORKSPACE (não da pessoa): outro workspace, sem a política, continua barrado.
    assert.equal((await api.post("outsider", "/api/actions/override", { actionName: "ping", allowed: true })).status, 403);
    assert.equal((await api.post("techAdmin", "/api/actions/override", { actionName: `realestate.synthetic_${sx}`, allowed: true })).status, 200, "ação comum segue permitida");
    assert.equal((await api.post("techAdmin", "/api/actions/override", { actionName: item.d, allowed: false })).status, 200, "negar segue permitido");
    await prismaGlobal.tenantActionPolicy.deleteMany({ where: { tenantId: ids.tA, actionName: { in: [item.d, `realestate.synthetic_${sx}`] } } });

    // combinação: o publicador delega o item ao tenant (legítimo) e o administrador técnico tenta fechar a habilitação
    const delegated = await api.post("pub", "/api/delegations", { delegateeId: ids.tA, marketplaceId: itemIds.d, scope: "execute", trustMin: 50, validUntil: inDays(30) });
    assert.equal(delegated.status, 200, "delegar a outro tenant segue possível");
    const closeIt = await api.post("techAdmin", "/api/actions/override", { actionName: item.d, allowed: true });
    assert.equal(closeIt.status, 403);
    const catalog = await api.get("techAdmin", "/api/agents");
    assert.equal((catalog.body.items ?? []).some((entry: any) => String(entry.id).toLowerCase() === item.d.toLowerCase()), false, "o agente não ficou habilitado");
    // a delegatária não altera sozinha os termos recebidos; e ninguém sem autoridade se auto-delega
    const delegationId = delegated.body.item.id;
    for (const name of ["founder", "techAdmin", "plain"]) {
      const patch = await api.patch(name, `/api/delegations/${delegationId}`, { scope: "admin", validUntil: inDays(300) });
      assert.equal(patch.status, 403, name);
      const selfDelegation = await api.post(name, "/api/delegations", { delegateeId: ids.tA, marketplaceId: itemIds.d, scope: "execute", trustMin: 50, validUntil: inDays(30) });
      assert.equal(selfDelegation.status, 403, name);
    }
    const stored = await prismaGlobal.delegationPolicy.findUnique({ where: { id: delegationId } });
    assert.equal(stored?.scope, "execute");
    assert.equal(await prismaGlobal.delegationPolicy.count({ where: { delegatorId: ids.tA, delegateeId: ids.tA } }), 0, "nenhuma auto-delegação criada");
    // subscrever o item delegado também exige a autoridade
    assert.equal((await subscribe("founder", "d", { scope: "read" })).status, 403);
    assert.equal(await policiesFor("d"), 0);
  });

  test("5+10 papéis personalizados e convites não produzem autoridade comercial; convidar pessoa e contratar agente são operações distintas", async () => {
    const roles = await api.put("founder", "/api/profile/me", { workspaceRoleOptions: [{ label: "Comercial", permissions: ["marketplace.subscribe"] }] });
    assert.equal(roles.status, 422);
    assert.equal(roles.body.error.code, "COMMERCIAL_AUTHORITY_NOT_GRANTABLE_HERE");
    const withPermission = await api.post("founder", "/api/profile/workspace-members/invitations", { email: `convite-comercial-${sx}@example.com`, roleKey: "corretor", permissions: ["  Marketplace.Subscribe "] });
    assert.equal(withPermission.status, 422);
    assert.equal(withPermission.body.error.code, "COMMERCIAL_AUTHORITY_NOT_GRANTABLE_HERE");
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_workspace_invitations WHERE tenant_id = $1 AND email = $2", ids.tA, `convite-comercial-${sx}@example.com`), 0);
    const designationsBefore = await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", ids.tA);
    const invited = await api.post("founder", "/api/profile/workspace-members/invitations", { email: `convite-simples-${sx}@example.com`, roleKey: "corretor" });
    assert.equal(invited.status, 201, "convidar uma pessoa segue funcionando");
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", ids.tA), designationsBefore, "convidar não cria autoridade comercial");
    // a string na membership (papel antigo/personalizado) não é lida como autoridade
    const roleUser = await subscribe("roleUser", "b", { scope: "read" });
    assert.equal(roleUser.status, 403);
    assert.equal(roleUser.body.error.reasonCode, "DESIGNATION_NOT_FOUND");
  });

  test("11 descoberta e recomendação seguem disponíveis para quem só consulta, sem ação de contratação", async () => {
    for (const name of ["plain2", "founder", "techAdmin", "service"]) {
      const response = await api.get(name, "/api/agents/capabilities/discover?domain=marketing&capability=campaign");
      assert.equal(response.status, 200, name);
      assert.equal(response.body.item.state, "habilitavel", name);
      assert.equal(response.body.item.provider.agentId, "MKT", name);
      assert.equal(response.body.item.authority.status, "somente_consulta", name);
      assert.equal(response.body.item.nextAction.kind, "request_approval", name);
      assert.equal(response.body.item.nextAction.enabled, false, name);
      assert.equal(JSON.stringify(response.body.item.nextAction).includes("/app/marketplace"), false, name);
    }
    // parâmetros do cliente não alteram a autoridade, que vem do servidor
    const forged = await request.get("/api/agents/capabilities/discover?domain=marketing&capability=campaign&authority=contratacao_autorizada").set("Authorization", as("plain2")).set("x-user-id", users.grantor);
    assert.equal(forged.body.item.authority.status, "somente_consulta");
    assert.equal((await request.get("/api/agents/capabilities/discover?domain=marketing&capability=campaign")).status, 401);
  });

  test("9 falha na auditoria impede o efeito comercial: contratar, conceder e revogar não deixam rastro quando o registro falha", async () => {
    assert.equal((await grant("grantor", "holder", { evidenceRef: EVID(8) })).status, 201, "titular sintético para o cenário");
    await prismaGlobal.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION eiah_authz_test_block_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit blocked (test)'; END $$ LANGUAGE plpgsql`);
    await prismaGlobal.$executeRawUnsafe(
      `CREATE TRIGGER eiah_authz_test_block_audit BEFORE INSERT ON guardrail_audit_ledger FOR EACH ROW WHEN (NEW.tenant_id = '${ids.tA}') EXECUTE FUNCTION eiah_authz_test_block_audit()`,
    );
    try {
      const blocked = await subscribe("holder", "b", { scope: "read" });
      assert.equal(blocked.status, 503);
      assert.equal(blocked.body.error.code, "SUBSCRIBE_DECISION_RECORD_UNAVAILABLE");
      assert.equal(await delegationsFor("b"), 0);
      assert.equal(await policiesFor("b"), 0);

      const designationsBefore = await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", ids.tA);
      const noGrant = await grant("grantor", "plain2", { evidenceRef: EVID(9) });
      assert.equal(noGrant.status, 503);
      assert.equal(noGrant.body.error.code, "AUTHORITY_RECORD_UNAVAILABLE");
      assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", ids.tA), designationsBefore, "nenhuma designação sem o registro");

      const holderRow = (await api.get("grantor", "/api/commercial-authority/designations")).body.designations.find((entry: any) => entry.beneficiaryUserId === users.holder && !entry.revokedAt);
      const noRevoke = await api.post("grantor", `/api/commercial-authority/designations/${holderRow.id}/revoke`, { decision: "revoke", reason: "teste de falha", evidenceRef: EVID(9) });
      assert.equal(noRevoke.status, 503);
      assert.equal(await activeDesignation("holder", "holder"), 1, "sem registro não há revogação");

      // a negação não depende do registro
      assert.equal((await subscribe("plain2", "b", { scope: "read" })).status, 403);
    } finally {
      await prismaGlobal.$executeRawUnsafe("DROP TRIGGER IF EXISTS eiah_authz_test_block_audit ON guardrail_audit_ledger");
      await prismaGlobal.$executeRawUnsafe("DROP FUNCTION IF EXISTS eiah_authz_test_block_audit()");
    }
    // recuperado o registro, a mesma operação passa
    assert.equal((await subscribe("holder", "b", { scope: "read" })).status, 200);
    assert.equal(await delegationsFor("b"), 1);
  });

  test("8 designação expirada e membership suspensa perdem a autoridade imediatamente (sem depender de revogação explícita)", async () => {
    // expirada: a linha existe, não está revogada, mas passou da validade
    await seedDesignation({ userKey: "plain2", role: "holder", days: -1 });
    const expired = await subscribe("plain2", "c", { scope: "read" });
    assert.equal(expired.status, 403);
    assert.equal(expired.body.error.reasonCode, "DESIGNATION_NOT_FOUND");
    // membership suspensa: a designação ativa deixa de valer enquanto o vínculo não estiver ativo
    await seedDesignation({ userKey: "h3", role: "holder", days: 30 });
    await prismaGlobal.$executeRawUnsafe("UPDATE eiah_workspace_memberships SET status = 'suspended' WHERE user_id = $1 AND tenant_id = $2", users.h3, ids.tA);
    const suspended = await subscribe("h3", "c", { scope: "read" });
    assert.equal(suspended.status, 403);
    assert.equal(suspended.body.error.reasonCode, "MEMBERSHIP_NOT_ACTIVE");
    const discovered = await api.get("h3", "/api/agents/capabilities/discover?domain=marketing&capability=campaign");
    assert.equal(discovered.body.item.authority.status, "somente_consulta");
    await prismaGlobal.$executeRawUnsafe("UPDATE eiah_workspace_memberships SET status = 'active' WHERE user_id = $1 AND tenant_id = $2", users.h3, ids.tA);
    assert.equal((await api.get("h3", "/api/agents/capabilities/discover?domain=marketing&capability=campaign")).body.item.authority.status, "contratacao_autorizada", "reativada a membership, a designação ainda vigente volta a valer");
    assert.equal(await delegationsFor("c") , 1, "nenhuma contratação nova nos cenários negativos (a de h3 em 12+8 permanece)");
  });

  const listedAgent = async (tokenName: string, agent: string) => {
    const response = await api.get(tokenName, "/api/agents");
    assert.equal(response.status, 200);
    return (response.body.items ?? []).some((entry: any) => String(entry.id).toLowerCase() === agent.toLowerCase());
  };
  const discoverMkt = async (tokenName: string) =>
    (await api.get(tokenName, "/api/agents/capabilities/discover?domain=marketing&capability=campaign")).body.item;
  const enablementRows = () => prismaGlobal.$queryRawUnsafe(
    `SELECT id, agent_key AS "agentKey", marketplace_item_id AS "marketplaceItemId", delegation_id AS "delegationId", scope,
            trust_min AS "trustMin", designation_id AS "designationId", decided_by_user_id AS "decidedBy",
            decision_audit_event_id AS "decisionAuditEventId", revoked_at AS "revokedAt", valid_until AS "validUntil"
     FROM eiah_agent_commercial_enablements WHERE tenant_id = $1 ORDER BY created_at`, ids.tA,
  ) as Promise<Array<Record<string, any>>>;

  test("1-4 agente governado: política antiga + delegação de publicador NÃO habilitam; a habilitação só nasce da contratação governada e fica vinculada à decisão", async () => {
    // política remanescente de uma contratação passada + delegação unilateral do publicador (sem decisão do domínio)
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId: ids.tA, workspaceId: ids.wA, actionName: "MKT", allowed: true } });
    const unilateral = await api.post("pub", "/api/delegations", { delegateeId: ids.tA, marketplaceId: itemIds.mkt, scope: "execute", trustMin: 50, validUntil: inDays(30) });
    assert.equal(unilateral.status, 200, "delegação legítima segue possível");
    for (const name of ["plain", "founder", "techAdmin", "holder"]) assert.equal(await listedAgent(name, "MKT"), false, `${name}: sem decisão do domínio o agente não está habilitado`);
    assert.equal((await discoverMkt("plain")).state, "habilitavel");
    assert.equal((await enablementRows()).length, 0);

    // contratação governada pelo titular: cria a habilitação vinculada (reaproveita a delegação existente, dentro dos limites)
    const hired = await subscribe("holder", "mkt", { scope: "read" });
    assert.equal(hired.status, 200, JSON.stringify(hired.body));
    assert.ok(hired.body.enablementId?.startsWith("cae_"));
    const [row] = await enablementRows();
    assert.equal(row.agentKey, "mkt");
    assert.equal(row.delegationId, unilateral.body.item.id, "a habilitação se liga à delegação específica");
    assert.equal(row.marketplaceItemId, itemIds.mkt);
    assert.equal(row.scope, "execute", "condições efetivas da delegação");
    assert.equal(Number(row.trustMin), 50);
    assert.equal(row.decidedBy, users.holder);
    assert.ok(row.designationId?.startsWith("cad_"), "designação que fundamentou");
    const decision = (await auditEvents("marketplace.subscribe.authorized")).find((entry) => entry.id === row.decisionAuditEventId);
    assert.ok(decision, "a habilitação referencia o evento da decisão");
    assert.equal((decision!.metadata as any).target.designationId, row.designationId);
    for (const name of ["plain", "founder", "holder"]) assert.equal(await listedAgent(name, "MKT"), true, `${name}: habilitado pela decisão vigente`);
    assert.equal((await discoverMkt("plain")).state, "habilitado");

    // o publicador altera as condições da delegação por fora: a habilitação deixa de corresponder
    const delegationId = unilateral.body.item.id;
    assert.equal((await api.patch("pub", `/api/delegations/${delegationId}`, { scope: "admin" })).status, 200);
    assert.equal(await listedAgent("plain", "MKT"), false, "condições diferentes das aceitas");
    assert.equal((await api.patch("pub", `/api/delegations/${delegationId}`, { scope: "execute" })).status, 200);
    assert.equal(await listedAgent("plain", "MKT"), true, "restabelecidas as condições aceitas, a decisão vigente volta a valer");
    // delegação expirada derruba a habilitação; renovada com as mesmas condições, volta
    await prismaGlobal.$executeRawUnsafe("UPDATE delegation_policies SET valid_until = NOW() - interval '1 hour' WHERE id = $1", delegationId);
    assert.equal(await listedAgent("plain", "MKT"), false);
    await prismaGlobal.$executeRawUnsafe("UPDATE delegation_policies SET valid_until = NOW() + interval '30 days' WHERE id = $1", delegationId);
    assert.equal(await listedAgent("plain", "MKT"), true);
    // habilitação expirada não é reutilizada
    await prismaGlobal.$executeRawUnsafe("UPDATE eiah_agent_commercial_enablements SET valid_until = NOW() - interval '1 hour' WHERE id = $1", row.id);
    assert.equal(await listedAgent("plain", "MKT"), false, "expirada");
    await prismaGlobal.$executeRawUnsafe("UPDATE eiah_agent_commercial_enablements SET valid_until = NOW() + interval '30 days' WHERE id = $1", row.id);
    assert.equal(await listedAgent("plain", "MKT"), true);
  });

  test("1-2+5-8 revogação comercial: delegação nova, política antiga e actions.admin NÃO reativam o agente; só nova decisão da pessoa com autoridade", async () => {
    const [current] = (await enablementRows()).filter((entry) => !entry.revokedAt);
    assert.ok(current);
    // quem não tem autoridade comercial não desfaz a habilitação
    for (const [name, code] of [["plain", "COMMERCIAL_AUTHORITY_REQUIRED"], ["techAdmin", "COMMERCIAL_AUTHORITY_REQUIRED"], ["service", "IDENTITY_REQUIRED"]] as const) {
      const denied = await api.post(name, `/api/commercial-authority/enablements/${current.id}/revoke`, { decision: "revoke", reason: "tentativa sem autoridade", evidenceRef: EVID(20) });
      assert.equal(denied.status, 403, name);
      assert.equal(denied.body.error.code, code, name);
    }
    assert.equal((await api.post("tbUser", `/api/commercial-authority/enablements/${current.id}/revoke`, { decision: "revoke", reason: "outro tenant", evidenceRef: EVID(20) })).status, 403);
    assert.equal(await listedAgent("plain", "MKT"), true);
    const revoked = await api.post("holder", `/api/commercial-authority/enablements/${current.id}/revoke`, { decision: "revoke", reason: "fim do contrato sintético", evidenceRef: EVID(21) });
    assert.equal(revoked.status, 200);
    assert.equal(await listedAgent("plain", "MKT"), false, "revogada");
    const revokeEvent = (await auditEvents("commercial_authority.enablement_revoke.authorized")).find((entry) => (entry.metadata as any).enablementId === current.id);
    assert.ok(revokeEvent);
    assert.deepEqual([(revokeEvent!.metadata as any).actorUserId, (revokeEvent!.metadata as any).evidenceRef], [users.holder, EVID(21)]);
    const policy = await prismaGlobal.tenantActionPolicy.findFirst({ where: { tenantId: ids.tA, workspaceId: ids.wA, actionName: { equals: "MKT", mode: "insensitive" } } });
    assert.equal(policy?.allowed, false, "política negada de forma explícita (revogar = allowed:false)");
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_agent_commercial_enablements WHERE id = $1 AND revoked_at IS NOT NULL AND revoke_audit_event_id = $2", current.id, revokeEvent!.id), 1);

    // tentativas de reativação sem nova decisão
    const another = await api.post("pub", "/api/delegations", { delegateeId: ids.tA, marketplaceId: itemIds.mkt, scope: "execute", trustMin: 50, validUntil: inDays(60) });
    assert.equal(another.status, 200, "o publicador pode delegar; isso não habilita");
    assert.equal(await listedAgent("plain", "MKT"), false, "delegação nova após revogação comercial não reativa");
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId: ids.tA, workspaceId: ids.wA, actionName: { equals: "MKT", mode: "insensitive" } }, data: { allowed: true } });
    assert.equal(await listedAgent("plain", "MKT"), false, "política antiga reaberta não substitui a decisão vigente");
    for (const [name, status, code] of [["techAdmin", 403, "MARKETPLACE_SUBSCRIBE_FORBIDDEN"], ["founder", 403, "MARKETPLACE_SUBSCRIBE_FORBIDDEN"], ["plain", 403, "MARKETPLACE_SUBSCRIBE_FORBIDDEN"], ["service", 403, "MARKETPLACE_SUBSCRIBE_FORBIDDEN"]] as const) {
      const response = await api.post(name, "/api/actions/override", { actionName: "MKT", allowed: true });
      assert.equal(response.status, status, name);
      assert.equal(response.body.error.code, code, name);
    }
    assert.equal((await api.post("service", "/api/actions/override", { actionName: "MKT", allowed: true })).body.error.reasonCode, "IDENTITY_REQUIRED", "serviço não se apresenta como decisor humano");
    assert.equal((await api.post("outsider", "/api/actions/override", { actionName: "MKT", allowed: true })).status, 403, "outro workspace (sem actions.admin)");
    assert.equal(await listedAgent("plain", "MKT"), false);
    // quem TEM autoridade comercial pode ajustar a política via override (decisão registrada), mas isso é só a metade "política"
    const viaOverride = await api.post("holder", "/api/actions/override", { actionName: "MKT", allowed: true });
    assert.equal(viaOverride.status, 200);
    const overrideDecision = (await auditEvents("actions.override.commercial.authorized")).find((entry) => (entry.metadata as any).decidedBy === users.holder);
    assert.ok(overrideDecision, "a decisão comercial do override é registrada");
    assert.equal(await listedAgent("plain", "MKT"), false, "política sozinha nunca habilita agente governado");
    assert.equal((await api.post("techAdmin", "/api/actions/override", { actionName: "MKT", allowed: false })).status, 200, "negar segue permitido a actions.admin");
    // nova decisão do titular: a habilitação é refeita, ligada à delegação vigente e à nova decisão
    const rehired = await subscribe("holder", "mkt", { scope: "read" });
    assert.equal(rehired.status, 200);
    assert.equal(await listedAgent("plain", "MKT"), true);
    const rows = await enablementRows();
    assert.equal(rows.filter((entry) => !entry.revokedAt).length, 1);
    assert.notEqual(rows.find((entry) => !entry.revokedAt)!.decisionAuditEventId, current.decisionAuditEventId, "nova decisão, novo evento");
  });

  test("9 falha na auditoria bloqueia o efeito comercial também no override e na revogação de habilitação; a recuperação restabelece", async () => {
    const active = (await enablementRows()).find((entry) => !entry.revokedAt)!;
    await prismaGlobal.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION eiah_authz_test_block_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit blocked (test)'; END $$ LANGUAGE plpgsql`);
    await prismaGlobal.$executeRawUnsafe(
      `CREATE TRIGGER eiah_authz_test_block_audit BEFORE INSERT ON guardrail_audit_ledger FOR EACH ROW WHEN (NEW.tenant_id = '${ids.tA}') EXECUTE FUNCTION eiah_authz_test_block_audit()`,
    );
    try {
      const override = await api.post("holder", "/api/actions/override", { actionName: item.a, allowed: true });
      assert.equal(override.status, 503);
      assert.equal(override.body.error.code, "COMMERCIAL_DECISION_RECORD_UNAVAILABLE");
      assert.equal(await prismaGlobal.tenantActionPolicy.count({ where: { tenantId: ids.tA, actionName: { equals: item.a, mode: "insensitive" } , allowed: true } }), 1, "a política do agente A (de testes anteriores) não mudou");
      const revoke = await api.post("holder", `/api/commercial-authority/enablements/${active.id}/revoke`, { decision: "revoke", reason: "teste de falha", evidenceRef: EVID(22) });
      assert.equal(revoke.status, 503);
      assert.equal(revoke.body.error.code, "ENABLEMENT_RECORD_UNAVAILABLE");
      assert.equal(await listedAgent("plain", "MKT"), true, "sem registro não há revogação");
      const resubscribe = await subscribe("h3", "mkt", { scope: "read" });
      assert.equal(resubscribe.status, 503, "nova contratação sem registro da decisão");
      assert.equal((await enablementRows()).filter((entry) => !entry.revokedAt).length, 1, "nenhuma habilitação nova");
    } finally {
      await prismaGlobal.$executeRawUnsafe("DROP TRIGGER IF EXISTS eiah_authz_test_block_audit ON guardrail_audit_ledger");
      await prismaGlobal.$executeRawUnsafe("DROP FUNCTION IF EXISTS eiah_authz_test_block_audit()");
    }
    assert.equal((await api.post("holder", `/api/commercial-authority/enablements/${active.id}/revoke`, { decision: "revoke", reason: "recuperado", evidenceRef: EVID(23) })).status, 200);
    assert.equal(await listedAgent("plain", "MKT"), false);
  });

  test("3 onboarding não concede autoridade nem habilitação comercial implícita de agente governado", async () => {
    const email = `onboarding-${sx}@example.com`;
    const created = await request.post("/api/auth/onboarding").send({ email, name: "Criador Sintético", orgName: `Org Authz ${sx}`, marketplaceId: itemIds.mkt, password: "senha-sintetica-12345" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { tenantId: newTenant, workspaceId: newWorkspace, userId: newUser, token, delegationId } = created.body.data;
    extraTenants.push(newTenant);
    assert.ok(delegationId, "a delegação do cadastro existe (legítima, não é contratação)");
    const asNew = (path: string) => request.get(path).set("Authorization", `Bearer ${token}`);
    // nenhuma habilitação, política, designação ou autoridade nasceu para quem criou o tenant
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_agent_commercial_enablements WHERE tenant_id = $1", newTenant), 0);
    assert.equal(await prismaGlobal.tenantActionPolicy.count({ where: { tenantId: newTenant, actionName: { equals: "MKT", mode: "insensitive" } } }), 0);
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", newTenant), 0);
    const agents = await asNew("/api/agents");
    assert.equal((agents.body.items ?? []).some((entry: any) => String(entry.id).toLowerCase() === "mkt"), false);
    const found = (await asNew("/api/agents/capabilities/discover?domain=marketing&capability=campaign")).body.item;
    assert.equal(found.state, "habilitavel");
    assert.equal(found.authority.status, "somente_consulta");
    const status = await asNew("/api/commercial-authority/status");
    assert.deepEqual([status.body.holder, status.body.grantor], [null, null]);
    assert.equal(status.body.bootstrap.reasonCode, "FIRST_AUTHORITY_SOURCE_NOT_RATIFIED");
    // nem com uma política remanescente o agente é habilitado, e o criador não contrata
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId: newTenant, workspaceId: newWorkspace, actionName: "MKT", allowed: true } });
    assert.equal(((await asNew("/api/agents")).body.items ?? []).some((entry: any) => String(entry.id).toLowerCase() === "mkt"), false);
    const attempt = await request.post(`/api/marketplace/${itemIds.mkt}/subscribe`).set("Authorization", `Bearer ${token}`).send({ scope: "read" });
    assert.equal(attempt.status, 403);
    assert.equal(attempt.body.error.reasonCode, "DESIGNATION_NOT_FOUND");
    assert.ok(newUser);
  });

  test("ausência de efeitos externos: nada além de linhas sintéticas do banco descartável", async () => {
    // contratação nunca provisiona produto nem agente de workspace e não cria instalação de produto
    assert.equal(await prismaGlobal.workspaceAgentAssignment.count({ where: { tenantId: { in: [ids.tA, ids.tB, ids.tP] } } }), 0);
    assert.equal(await count("SELECT COUNT(*)::bigint AS n FROM tenant_product_installations WHERE tenant_id = ANY($1)", [ids.tA, ids.tB, ids.tP]), 0);
    assert.equal(await prismaGlobal.run.count({ where: { tenantId: { in: [ids.tA, ids.tB, ids.tP] } } }), 0, "nenhuma execução (campanha) foi iniciada");
    // o ledger de auditoria não contém credenciais em nenhum evento do tenant
    const all = JSON.stringify(await prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId: ids.tA } }));
    assert.equal(all.includes("SECRETLIKE"), false);
    assert.equal(/password|senha|jwt|eyJ[A-Za-z0-9_-]{20,}/i.test(all), false);
  });
});
