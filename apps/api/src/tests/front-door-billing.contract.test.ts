import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import { collectVerticalAccessScoreFacts } from "../services/products/verticalAccessApproval";
import { scoreVerticalAccess } from "../services/products/verticalAccessScore";

// ADR-011 §2.8: conta de billing e primeira mensalidade simulada pela conversa do front door.

let request: ReturnType<typeof supertest>;
const prisma = prismaGlobal as unknown as PrismaClient;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-fdbilling-${suffix}`;
const workspaceId = `workspace-fdbilling-${suffix}`;
const founderId = `user-fdbilling-founder-${suffix}`;
const corretorId = `user-fdbilling-corretor-${suffix}`;
const tokens = { founder: `tok-fdbilling-founder-${suffix}`, corretor: `tok-fdbilling-corretor-${suffix}` };

before(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.SETTLEMENT_PROVIDER_MODE_BANK;
  const { default: app } = await import("../index");
  request = supertest(app);
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Imobiliária ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Principal ${suffix}` } });
  await prismaGlobal.user.createMany({
    data: [
      { id: founderId, tenantId, email: `founder-${suffix}@example.com`, displayName: "Founder" },
      { id: corretorId, tenantId, email: `corretor-${suffix}@example.com`, displayName: "Corretor" },
    ],
  });
  await prismaGlobal.apiToken.createMany({
    data: [
      { token: tokens.founder, tenantId, workspaceId, userId: founderId, description: "fdb-founder", revoked: false },
      { token: tokens.corretor, tenantId, workspaceId, userId: corretorId, description: "fdb-corretor", revoked: false },
    ],
  });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: founderId, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: corretorId, roleKey: "corretor" });
});

after(async () => {
  delete process.env.SETTLEMENT_PROVIDER_MODE_BANK;
  // `billing_ledger` e `guardrail_ledger` são append-only: o tenant de teste fica, como nos outros contratos.
  const ignore = () => undefined;
  await prismaGlobal.$executeRaw`DELETE FROM tenant_billing_account WHERE tenant_id = ${tenantId}`.catch(ignore);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id = ${tenantId}`.catch(ignore);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_roles WHERE tenant_id = ${tenantId}`.catch(ignore);
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } }).catch(ignore);
  await prismaGlobal.user.deleteMany({ where: { tenantId } }).catch(ignore);
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } }).catch(ignore);
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } }).catch(ignore);
  await prismaGlobal.$disconnect();
});

const read = (token: string) => request.get("/api/front-door/billing").set("Authorization", `Bearer ${token}`);
const createAccount = (token: string, body: Record<string, unknown>) =>
  request.post("/api/front-door/billing/account").set("Authorization", `Bearer ${token}`).send(body);
const pay = (token: string, body: Record<string, unknown>) =>
  request.post("/api/front-door/billing/first-payment").set("Authorization", `Bearer ${token}`).send(body);

test("sem conta: mostra os quatro planos com os preços atuais; corretor não cria nem paga", async () => {
  const founder = await read(tokens.founder);
  assert.equal(founder.status, 200);
  assert.equal(founder.body.data.account, null);
  assert.equal(founder.body.data.accountActive, false);
  assert.equal(founder.body.data.canManage, true);
  assert.equal(founder.body.data.paymentMode, "simulated");
  assert.deepEqual(
    founder.body.data.plans.map((plan: { code: string; monthlyPriceCents: number }) => [plan.code, plan.monthlyPriceCents]),
    [["solo", 49_000], ["starter", 149_000], ["growth", 399_000], ["scale", 990_000]],
  );
  assert.equal(JSON.stringify(founder.body).includes("score"), false, "nunca mostra score");

  assert.equal((await read(tokens.corretor)).body.data.canManage, false);
  const denied = await createAccount(tokens.corretor, { planCode: "starter", confirmed: true });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FRONT_DOOR_BILLING_FORBIDDEN");
  assert.equal((await pay(tokens.founder, { confirmed: true })).body.error.code, "FRONT_DOOR_BILLING_ACCOUNT_REQUIRED");
});

test("criar conta exige confirmação explícita e plano da lista; conta existente não muda", async () => {
  assert.equal((await createAccount(tokens.founder, { planCode: "starter" })).status, 400, "sem confirmação nada é criado");
  assert.equal((await createAccount(tokens.founder, { planCode: "enterprise", confirmed: true })).status, 400);
  assert.equal((await read(tokens.founder)).body.data.account, null);

  const created = await createAccount(tokens.founder, { planCode: "solo", confirmed: true });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.outcome, "created");
  assert.equal(created.body.data.account.planCode, "solo");
  assert.equal(created.body.data.account.status, "active");

  const again = await createAccount(tokens.founder, { planCode: "scale", confirmed: true });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.outcome, "already_exists");
  assert.equal(again.body.data.account.planCode, "solo", "a conversa não troca o plano");

  const audit = await prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId, eventType: "billing.account.created" } });
  assert.equal(audit.length, 1);

  const facts = await collectVerticalAccessScoreFacts({ prisma, tenantId, workspaceId });
  const reasons = scoreVerticalAccess(facts).reasons;
  assert.equal(reasons.find((reason) => reason.rule === "conta_billing_ativa")?.ok, true, "a conta criada conta no score");
});

test("primeira mensalidade: simulada, valor zero no ledger, uma só vez e fora do score", async () => {
  assert.equal((await pay(tokens.founder, {})).status, 400, "sem confirmação nada é pago");
  assert.equal((await pay(tokens.corretor, { confirmed: true })).status, 403);

  process.env.SETTLEMENT_PROVIDER_MODE_BANK = "full";
  const notConnected = await pay(tokens.founder, { confirmed: true });
  assert.equal(notConnected.status, 409, "em modo full não há integração real");
  assert.equal(notConnected.body.error.code, "FRONT_DOOR_PAYMENT_NOT_CONNECTED");
  delete process.env.SETTLEMENT_PROVIDER_MODE_BANK;

  const paid = await pay(tokens.founder, { confirmed: true });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.data.outcome, "paid");
  assert.equal(paid.body.data.payment.mode, "simulated");
  assert.match(paid.body.data.payment.description, /Primeira mensalidade Solo R\$ 490,00 — pagamento simulado, sem cobrança real/);

  const again = await pay(tokens.founder, { confirmed: true });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.outcome, "already_paid");

  const ledger = await prismaGlobal.$queryRaw<Array<{ type: string; amount_cents: number }>>`
    SELECT type, amount_cents FROM billing_ledger WHERE tenant_id = ${tenantId}
  `;
  assert.deepEqual(ledger, [{ type: "adjustment", amount_cents: 0 }], "um único evento, sem dinheiro inexistente");

  const facts = await collectVerticalAccessScoreFacts({ prisma, tenantId, workspaceId });
  assert.equal(facts.succeededPayments90d, 0, "pagamento simulado não conta como pagamento confirmado");
  assert.equal((await read(tokens.founder)).body.data.firstPayment.mode, "simulated");
});
