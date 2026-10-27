import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

import { commercialAuthorityRouter } from "../routes/commercialAuthority";
import { profileRouter } from "../routes/profile";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureWorkspaceMembershipForUser, ensureWorkspaceResponsibilityStore } from "../services/workspaceResponsibility";

// Controles da identidade administrativa da plataforma (PostgreSQL descartável, e-mails sintéticos).
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local logistics database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();

const id = randomUUID();
const tenantA = `a6-ta-${id}`, tenantB = `a6-tb-${id}`, wsA = `a6-wa-${id}`, wsB = `a6-wb-${id}`;
const adminEmail = `a6-admin-${id}@example.com`; // lista de administradores (minúscula)
const mixedAdminEmail = `A6-Mixed-${id}@Example.com`; // linha real do administrador, com caixa diferente da lista
const futureAdminEmail = `a6-future-${id}@example.com`; // administrador ainda sem conta
// segundo par de e-mails: o teste DESEJADO precisa de e-mails ainda não ocupados pela caracterização anterior
const mixedAdmin2Email = `A6-Mixed2-${id}@Example.com`;
const futureAdmin2Email = `a6-future2-${id}@example.com`;
const U = { admin: `admin-${id}`, mixedAdmin: `mixedadmin-${id}`, mixedAdmin2: `mixedadmin2-${id}`, plain: `plain-${id}`, a3: `a3-${id}`, a4: `a4-${id}`, a4todo: `a4todo-${id}`, a5: `a5-${id}`, a5todo: `a5todo-${id}`, a6: `a6-${id}` };
const tk = (name: string) => `syn-${name}-${id}`;
const auth = (token: string) => `Bearer ${token}`;
const app = express();
app.use(express.json());
app.use("/api/commercial-authority", commercialAuthorityRouter);
app.use("/api", verticalAccessRouter, profileRouter);
const request = supertest(app);
const adminQueue = (name: string) => request.get("/api/admin/vertical-approvals").set("Authorization", auth(tk(name)));
const changeEmail = (name: string, email: string) => request.put("/api/profile/me").set("Authorization", auth(tk(name))).send({ email });
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const adminList = `${adminEmail},${mixedAdminEmail.toLowerCase()},${futureAdminEmail},${mixedAdmin2Email.toLowerCase()},${futureAdmin2Email}`;

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = adminList;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantA, name: "A6 A" }, { id: tenantB, name: "A6 B" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId: tenantA, name: "A" }, { id: wsB, tenantId: tenantB, name: "B" }] });
  const rows: Array<[string, string, string, string]> = [
    [U.admin, adminEmail, tenantA, wsA], [U.mixedAdmin, mixedAdminEmail, tenantA, wsA], [U.mixedAdmin2, mixedAdmin2Email, tenantA, wsA], [U.plain, `a6-plain-${id}@example.com`, tenantB, wsB],
    [U.a3, `a6-a3-${id}@example.com`, tenantB, wsB], [U.a4, `a6-a4-${id}@example.com`, tenantB, wsB], [U.a4todo, `a6-a4todo-${id}@example.com`, tenantB, wsB],
    [U.a5, `a6-a5-${id}@example.com`, tenantB, wsB], [U.a5todo, `a6-a5todo-${id}@example.com`, tenantB, wsB], [U.a6, `a6-a6-${id}@example.com`, tenantB, wsB],
  ];
  await prismaGlobal.user.createMany({ data: rows.map(([userId, email, tenantId]) => ({ id: userId, tenantId, email })) });
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  for (const [userId, , tenantId, workspaceId] of rows) await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey: "corretor" });
  await prismaGlobal.apiToken.createMany({ data: rows.map(([userId, , tenantId, workspaceId], index) => ({ token: tk(Object.keys(U)[index]!), tenantId, workspaceId, userId })) });
});
after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS; else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

test("A1/A2 — controle: usuário comum não vê a fila de administração (404); administrador da lista vê (200)", async () => {
  assert.equal((await adminQueue("plain")).status, 404);
  assert.equal((await adminQueue("admin")).status, 200);
  assert.equal((await adminQueue("mixedAdmin")).status, 200, "a comparação da lista ignora caixa");
});

test("A3 — colisão EXATA com a conta do administrador: a troca de e-mail é recusada e o usuário não vira administrador", async () => {
  const res = await changeEmail("a3", adminEmail);
  assert.notEqual(res.status, 200, `troca recusada (${res.status})`);
  assert.equal((await adminQueue("a3")).status, 404);
  const row = await prismaGlobal.user.findUnique({ where: { id: U.a3 }, select: { email: true } });
  assert.equal(row!.email, `a6-a3-${id}@example.com`, "e-mail inalterado");
});

test("A6 — o e-mail do PERFIL não é a fonte: `eiah_user_profiles` não tem coluna de e-mail; só `users.email` conta", async () => {
  const columns = await prismaGlobal.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_name='eiah_user_profiles'`;
  assert.ok(columns.length > 0, "tabela criada pelo perfil");
  assert.equal(columns.some((c) => c.column_name === "email"), false, "a premissa do enunciado (profiles.email) não se confirma: a fonte editável é users.email");
});

test("A7 — a identidade administrativa NÃO produz autoridade comercial: o administrador da lista não consegue conceder designação", async (t) => {
  // o administrador legítimo da lista tenta nomear a si mesmo grantor no próprio workspace
  const designationsBefore = Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", tenantA).catch(() => [{ n: 0n }]))[0]!.n);
  const res = await request.post("/api/commercial-authority/designations").set("Authorization", auth(tk("admin")))
    .send({ decision: "grant", beneficiaryUserId: U.admin, role: "grantor", validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), evidenceRef: "a6-synthetic-self-grant" });
  t.diagnostic(`A7 status=${res.status} code=${res.body?.error?.code ?? "-"}`);
  assert.ok([401, 403, 404, 409, 422].includes(res.status), `concessão negada (${res.status})`);
  assert.equal(res.status === 200 || res.status === 201, false);
  const designationsAfter = Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>("SELECT COUNT(*)::bigint AS n FROM eiah_commercial_authority_designations WHERE tenant_id = $1", tenantA).catch(() => [{ n: 0n }]))[0]!.n);
  assert.equal(designationsAfter, designationsBefore, "nenhuma designação criada");
});
