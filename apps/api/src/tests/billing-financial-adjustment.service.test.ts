import "./support/testInfraEnv.js";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import { applyApprovedFinancialAdjustment } from "../services/financialBillingWrites";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalDLQ, runAtivoUniversalQueue } from "@eiah/core";
import {
  FIN_SCOPES,
  installAuditFailureTrigger,
  installUsageFailureTrigger,
  insertFinancialDesignationForTest,
  removeAuditFailureTrigger,
  removeUsageFailureTrigger,
  type DesignationState,
  type FinScope,
} from "./support/billingFinancialAuthorityFixture";

/**
 * EIAH-GOV-BILLING-003 — o ajuste financeiro APROVADO por duas pessoas distintas (serviço `applyApprovedFinancialAdjustment`).
 * A rota `POST /api/billing/tenant/adjustment` permanece NEGADA por padrão até a ratificação do mecanismo de duas pessoas; este
 * arquivo prova, em PostgreSQL descartável e com transações reais, que o ponto de execução que a aprovação futura vai chamar é
 * atômico, idempotente, auditado e não concede autoridade a ninguém. Dados sintéticos; nenhum gatilho/constraint é desligado.
 */

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const ids = { T: `bfs-t-${suffix}`, X: `bfs-x-${suffix}`, A: `bfs-wsa-${suffix}`, XA: `bfs-xws-${suffix}` };
const CAP = 100_000;
const SECRET_MARK = `bfs-secret-${suffix}`;

let request: ReturnType<typeof supertest>;
let uploadsDir = "";
let seq = 0;
const users: Record<string, string> = {};
const tokens: Record<string, string> = {};

async function mkPerson(
  key: string,
  spec: { tenantId?: string; workspaceId?: string; role?: string | null; designations?: Array<{ scope: FinScope; state?: DesignationState; limits?: Record<string, unknown> }> },
) {
  const tenantId = spec.tenantId ?? ids.T;
  const workspaceId = spec.workspaceId ?? ids.A;
  const userId = `bfs-u-${key}-${suffix}`;
  users[key] = userId;
  await prismaGlobal.user.create({ data: { id: userId, tenantId, email: `${userId}@example-test.internal`, displayName: key } });
  if (spec.role !== null) await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey: spec.role ?? "corretor" });
  tokens[key] = `tk-${SECRET_MARK}-${key}`;
  await prismaGlobal.apiToken.create({ data: { token: tokens[key], tenantId, workspaceId, userId, description: `bfs ${key}`, revoked: false } });
  for (const d of spec.designations ?? []) {
    await insertFinancialDesignationForTest(prismaGlobal, { tenantId, userId, scope: d.scope, state: d.state, limits: d.limits });
  }
}
const ADJ = (state?: DesignationState, limits: Record<string, unknown> = { maxAdjustmentCents: CAP }) => ({ scope: FIN_SCOPES.adjust, state, limits });

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "eiah-bfs-"));
  process.env.NODE_ENV = "test";
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.STORAGE_PROVIDER = "local";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.createMany({ data: [{ id: ids.T, name: ids.T }, { id: ids.X, name: ids.X }] });
  await prismaGlobal.workspace.createMany({
    data: [{ id: ids.A, tenantId: ids.T, name: "WS-A" }, { id: ids.XA, tenantId: ids.X, name: "WS-XA" }],
  });
  await mkPerson("proposer", { designations: [ADJ()] });
  await mkPerson("approver", { designations: [ADJ()] });
  await mkPerson("lowCap", { designations: [ADJ(undefined, { maxAdjustmentCents: 500 })] });
  await mkPerson("noDesignation", {});
  await mkPerson("revoked", { designations: [ADJ("revoked")] });
  await mkPerson("expired", { designations: [ADJ("expired")] });
  await mkPerson("noMembership", { role: null, designations: [ADJ()] });
  await mkPerson("limitsOnly", { designations: [{ scope: FIN_SCOPES.limits }] });
  await mkPerson("founder", { role: "founder" });
  await mkPerson("externalApprover", { tenantId: ids.X, workspaceId: ids.XA, designations: [ADJ()] });
});

after(async () => {
  await removeAuditFailureTrigger(prismaGlobal);
  await removeUsageFailureTrigger(prismaGlobal);
  try {
    await prismaGlobal.apiToken.deleteMany({ where: { tenantId: { in: [ids.T, ids.X] } } });
  } catch { /* melhor esforço: o banco é descartável */ }
  await Promise.race([closePrismaResources().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  finalizeHttpContractCleanup();
  for (const q of [imobRunCompletedQueue, runAtivoUniversalQueue, runAtivoUniversalDLQ]) {
    await Promise.race([(q as any).close().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  }
  if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
});

// ───────────────────────────── helpers ─────────────────────────────

const actor = (key: string, tenantId = ids.T, workspaceId = ids.A) => ({ tenantId, workspaceId, userId: users[key], tokenId: `tokid-${key}` });
const req = (overrides: Record<string, unknown> = {}) => ({
  amountCents: 1500,
  currency: "BRL",
  workspaceId: ids.A,
  requestId: `bfs-req-${suffix}-${++seq}`,
  reason: "Ajuste sintético BILLING-003",
  evidenceRef: "FIN-SVC-001",
  ...overrides,
});
const run = (proposer: string, approver: string, request: Record<string, unknown>, extra: { tenantId?: string; approverActor?: ReturnType<typeof actor>; approvalRef?: string } = {}) =>
  applyApprovedFinancialAdjustment(prismaGlobal, {
    tenantId: extra.tenantId ?? ids.T,
    approval: { proposer: actor(proposer), approver: extra.approverActor ?? actor(approver), approvalRef: extra.approvalRef ?? "APPR-SVC-001" },
    request,
  });

async function counts() {
  const q = async (sql: string, ...params: unknown[]) => Number(((await prismaGlobal.$queryRawUnsafe(sql, ...params)) as Array<{ c: number }>)[0]?.c ?? 0);
  return {
    ledger: await q(`SELECT count(*)::int AS c FROM billing_ledger WHERE tenant_id = $1`, ids.T),
    usage: await q(`SELECT COALESCE(SUM(cost_cents),0)::int AS c FROM tenant_quota_usage WHERE tenant_id = $1`, ids.T),
    audit: await q(`SELECT count(*)::int AS c FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type = 'billing.adjustment.applied'`, ids.T),
  };
}
async function expectFailure(result: any, status: number, code: string, before: Awaited<ReturnType<typeof counts>>) {
  const after = await counts();
  const problems: string[] = [];
  if (result.ok !== false) problems.push("esperava falha");
  if (result.status !== status) problems.push(`status ${result.status} (esperado ${status})`);
  if (result.code !== code) problems.push(`code ${result.code} (esperado ${code})`);
  if (JSON.stringify(before) !== JSON.stringify(after)) problems.push(`MUTAÇÃO: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  assert.ok(problems.length === 0, problems.join(" | "));
}

// ───────────────────────────── sucesso, autoria e auditoria ─────────────────────────────

it("[SERVICE] duas pessoas distintas com autoridade → lançamento + uso + auditoria na mesma transação, com autoria dupla e sem segredo", async () => {
  const before = await counts();
  const r = req({ amountCents: 1500 });
  const result: any = await run("proposer", "approver", r);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.inserted, true);
  const after = await counts();
  assert.deepEqual(after, { ledger: before.ledger + 1, usage: before.usage + 1500, audit: before.audit + 1 });
  const rows = (await prismaGlobal.$queryRawUnsafe(
    `SELECT metadata FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type = 'billing.adjustment.applied' ORDER BY created_at DESC LIMIT 1`,
    ids.T,
  )) as Array<{ metadata: any }>;
  const meta = rows[0].metadata;
  assert.equal(meta.contractRef, "AUTHZ-FIN-1");
  assert.equal(meta.proposerUserId, users.proposer);
  assert.equal(meta.approverUserId, users.approver);
  assert.notEqual(meta.proposerUserId, meta.approverUserId);
  assert.equal(meta.actorUserId, users.approver);
  assert.equal(meta.approvalRef, "APPR-SVC-001");
  assert.equal(meta.requestId, r.requestId);
  assert.equal(meta.ledgerEntryId, result.ledger.id);
  assert.equal(meta.amountCents, 1500);
  assert.equal(meta.outcome, "applied");
  const serialized = JSON.stringify(meta);
  assert.ok(!serialized.includes(SECRET_MARK), "token vazou para o audit");
  assert.ok(!/authorization|bearer|password|secret|jwt/i.test(Object.keys(meta).join(",")), "chave sensível no audit");
});

it("[SERVICE] crédito (valor negativo) reduz o uso uma única vez", async () => {
  const before = await counts();
  const result: any = await run("proposer", "approver", req({ amountCents: -300 }));
  assert.equal(result.ok, true, JSON.stringify(result));
  const after = await counts();
  assert.deepEqual(after, { ledger: before.ledger + 1, usage: before.usage - 300, audit: before.audit + 1 });
});

// ───────────────────────────── autoridade e independência ─────────────────────────────

const denial = (name: string, proposer: string, approver: string, status: number, code: string, tweak?: Record<string, unknown>) =>
  it(`[SERVICE] ${name} → ${status} ${code}, sem mutação`, async () => {
    const before = await counts();
    await expectFailure(await run(proposer, approver, req(tweak)), status, code, before);
  });

denial("a mesma pessoa propõe e aprova", "proposer", "proposer", 403, "BILLING_APPROVER_NOT_INDEPENDENT");
denial("aprovador sem designação (vínculo ativo, papel corretor)", "proposer", "noDesignation", 403, "BILLING_AUTHORITY_REQUIRED");
denial("aprovador Founder sem designação (sem privilégio implícito)", "proposer", "founder", 403, "BILLING_AUTHORITY_REQUIRED");
denial("proponente sem designação", "noDesignation", "approver", 403, "BILLING_AUTHORITY_REQUIRED");
denial("aprovador com designação revogada", "proposer", "revoked", 403, "BILLING_AUTHORITY_REQUIRED");
denial("aprovador com designação expirada", "proposer", "expired", 403, "BILLING_AUTHORITY_REQUIRED");
denial("aprovador com designação mas sem vínculo", "proposer", "noMembership", 403, "BILLING_MEMBERSHIP_REQUIRED");
denial("aprovador com autoridade de OUTRO escopo (limites)", "proposer", "limitsOnly", 403, "BILLING_AUTHORITY_REQUIRED");
denial("valor acima do MENOR dos dois tetos", "proposer", "lowCap", 403, "BILLING_LIMIT_EXCEEDED", { amountCents: 501 });
denial("valor zero", "proposer", "approver", 400, "INVALID_AMOUNT", { amountCents: 0 });
denial("moeda diferente de BRL", "proposer", "approver", 400, "INVALID_PAYLOAD", { currency: "USD" });
denial("workspace inexistente", "proposer", "approver", 404, "WORKSPACE_NOT_FOUND", { workspaceId: `ws-nao-existe-${suffix}` });
it("[SERVICE] sem requestId → 400 INVALID_PAYLOAD, sem mutação", async () => {
  const before = await counts();
  const r: Record<string, unknown> = req();
  delete r.requestId;
  await expectFailure(await run("proposer", "approver", r), 400, "INVALID_PAYLOAD", before);
});
it("[SERVICE] aprovador de OUTRO tenant não vale → 403 BILLING_AUTHORITY_REQUIRED, sem mutação", async () => {
  const before = await counts();
  const result = await run("proposer", "externalApprover", req(), { approverActor: actor("externalApprover", ids.X, ids.XA) });
  await expectFailure(result, 403, "BILLING_AUTHORITY_REQUIRED", before);
});

// ───────────────────────────── idempotência ─────────────────────────────

it("[SERVICE] replay sequencial do mesmo requestId → inserted:false, 1 linha, uso e auditoria NÃO se repetem", async () => {
  const r = req({ amountCents: 777 });
  const before = await counts();
  const first: any = await run("proposer", "approver", r);
  const mid = await counts();
  const second: any = await run("proposer", "approver", r);
  const after = await counts();
  assert.equal(first.ok, true);
  assert.equal(first.inserted, true);
  assert.equal(second.ok, true);
  assert.equal(second.inserted, false);
  assert.equal(second.ledger.id, first.ledger.id);
  assert.deepEqual(mid, { ledger: before.ledger + 1, usage: before.usage + 777, audit: before.audit + 1 });
  assert.deepEqual(after, mid, "o replay alterou ledger, uso ou auditoria");
});

it("[SERVICE] replay CONCORRENTE (6 chamadas simultâneas) → exatamente 1 lançamento, uso somado uma vez, 1 evento", async () => {
  const r = req({ amountCents: 400 });
  const before = await counts();
  const results: any[] = await Promise.all(Array.from({ length: 6 }, () => run("proposer", "approver", r)));
  const after = await counts();
  assert.ok(results.every((x) => x.ok === true), JSON.stringify(results.filter((x) => !x.ok)));
  assert.equal(results.filter((x) => x.inserted === true).length, 1, "mais de uma inserção para o mesmo requestId");
  assert.equal(new Set(results.map((x) => x.ledger.id)).size, 1);
  assert.deepEqual(after, { ledger: before.ledger + 1, usage: before.usage + 400, audit: before.audit + 1 });
});

// ───────────────────────────── atomicidade (falhas reais de PostgreSQL) ─────────────────────────────

it("[SERVICE] falha ao gravar a auditoria → 503 BILLING_AUDIT_UNAVAILABLE e ledger/uso/auditoria intactos; o retry posterior funciona", async () => {
  const r = req({ amountCents: 222 });
  const before = await counts();
  await installAuditFailureTrigger(prismaGlobal);
  try {
    await expectFailure(await run("proposer", "approver", r), 503, "BILLING_AUDIT_UNAVAILABLE", before);
  } finally {
    await removeAuditFailureTrigger(prismaGlobal);
  }
  const retry: any = await run("proposer", "approver", r);
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(retry.inserted, true, "a tentativa falha deixou resíduo que bloqueou o retry");
  assert.deepEqual(await counts(), { ledger: before.ledger + 1, usage: before.usage + 222, audit: before.audit + 1 });
});

it("[SERVICE] falha ao atualizar o uso de cota → 503 BILLING_WRITE_UNAVAILABLE e o lançamento NÃO permanece (transação única); o retry posterior funciona", async () => {
  const r = req({ amountCents: 333 });
  const before = await counts();
  await installUsageFailureTrigger(prismaGlobal);
  try {
    await expectFailure(await run("proposer", "approver", r), 503, "BILLING_WRITE_UNAVAILABLE", before);
  } finally {
    await removeUsageFailureTrigger(prismaGlobal);
  }
  const retry: any = await run("proposer", "approver", r);
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(retry.inserted, true);
  assert.deepEqual(await counts(), { ledger: before.ledger + 1, usage: before.usage + 333, audit: before.audit + 1 });
});

// ───────────────────────────── a ROTA segue negada (nenhum bypass) ─────────────────────────────

const routeBody = () => ({ ...req(), confirmed: true });
async function routeDenied(token: string, expectedStatus: number, expectedCode: string) {
  const before = await counts();
  const res = await request.post("/api/billing/tenant/adjustment").set("Authorization", `Bearer ${token}`).send(routeBody());
  const after = await counts();
  assert.equal(res.status, expectedStatus, JSON.stringify(res.body));
  assert.equal(res.body?.error?.code, expectedCode);
  assert.deepEqual(after, before, "a rota alterou dados financeiros");
}

it("[SERVICE] a rota de ajuste com UM holder autorizado segue negada: 403 BILLING_ADJUSTMENT_APPROVAL_REQUIRED, sem mutação", () =>
  routeDenied(tokens.approver, 403, "BILLING_ADJUSTMENT_APPROVAL_REQUIRED"));

it("[SERVICE] nenhum sinalizador de ambiente, NODE_ENV ou cabeçalho libera o ajuste pela rota", async () => {
  const names = [
    "BILLING_ALLOW_ADJUSTMENT", "BILLING_ADJUSTMENT_ENABLED", "BILLING_ADJUSTMENT_SINGLE_HOLDER", "EIAH_BILLING_ADJUSTMENT_OVERRIDE",
    "BILLING_P0_FAULT_INJECTION_ALLOW_ADJUSTMENT", "ALLOW_BILLING_ADJUSTMENT",
  ];
  const saved = names.map((n) => [n, process.env[n]] as const);
  for (const n of names) process.env[n] = "true";
  try {
    await routeDenied(tokens.approver, 403, "BILLING_ADJUSTMENT_APPROVAL_REQUIRED");
    const before = await counts();
    const res = await request
      .post("/api/billing/tenant/adjustment")
      .set("Authorization", `Bearer ${tokens.approver}`)
      .set("x-billing-adjustment-override", "true")
      .set("x-force-adjustment", "1")
      .send(routeBody());
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body?.error?.code, "BILLING_ADJUSTMENT_APPROVAL_REQUIRED");
    assert.deepEqual(await counts(), before);
  } finally {
    for (const [n, v] of saved) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  }
});

it("[SERVICE] Founder e token sem designação continuam negados pela rota, sem mutação", async () => {
  await routeDenied(tokens.founder, 403, "BILLING_AUTHORITY_REQUIRED");
  await routeDenied(tokens.noDesignation, 403, "BILLING_AUTHORITY_REQUIRED");
});
