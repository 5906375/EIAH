import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

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
