import "./support/testInfraEnv.js";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalDLQ, runAtivoUniversalQueue } from "@eiah/core";
import {
  FIN_SCOPES,
  FIN_TABLE,
  assertDisposableDatabaseForFaultInjection,
  insertFinancialDesignationForTest,
  installAuditFailureTrigger,
  installUsageFailureTrigger,
  removeAuditFailureTrigger,
  removeUsageFailureTrigger,
  revokeFinancialDesignationForTest,
  type DesignationState,
  type FinRole,
  type FinScope,
} from "./support/billingFinancialAuthorityFixture";

/**
 * EIAH-GOV-BILLING-002 — contrato de autorização financeira (AUTHZ-FIN-1, proposta) para as 3 escritas financeiras:
 *   PATCH /api/billing/tenant/quotas
 *   PATCH /api/billing/tenant/workspaces/:id/grant
 *   POST  /api/billing/tenant/adjustment
 * Especificação: docs/ops/billing-financial-authority-spec.md.
 *
 * CLASSIFICAÇÃO (nenhuma asserção foi afrouxada para obter verde):
 *   [GUARD]   comportamento que JÁ vale e não pode regredir (passa hoje).
 *   [P0-RED]  comportamento exigido pelo contrato e AINDA NÃO implementado: falha hoje, de propósito, e é a prova do P0.
 *             BILLING-003 só termina quando nenhum [P0-RED] falha e nenhum [GUARD] regride.
 *   [TWO-PERSON] substitutos HTTP (BILLING-003 §5) dos 5 cenários de AJUSTE que presumiam sucesso por UM holder. O contrato vigente
 *             exige aprovação por DOIS atores distintos e esse mecanismo não está ratificado: a rota segue em
 *             403 BILLING_ADJUSTMENT_APPROVAL_REQUIRED, sem mutação. A cobertura POSITIVA (sucesso, autoria dupla, replay, atomicidade,
 *             auditoria) vive em billing-financial-adjustment.service.test.ts e a cobertura HTTP positiva está PENDENTE do mecanismo
 *             de dois atores (ver docs/ops/billing-financial-authority-spec.md §8). Nenhum skip/todo foi usado.
 *
 * Dados 100 % sintéticos; exige PostgreSQL/Redis descartáveis. Os testes de falha injetada exigem
 * BILLING_P0_FAULT_INJECTION=disposable.
 */

type Ep = "quotas" | "grant" | "adjustment";
const EPS: Ep[] = ["quotas", "grant", "adjustment"];

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const ids = {
  T: `bfa-t-${suffix}`,
  X: `bfa-x-${suffix}`,
  A: `bfa-wsa-${suffix}`,
  B: `bfa-wsb-${suffix}`,
  XA: `bfa-xws-${suffix}`,
};
const ADJUST_CAP = 100_000;
const SECRET_MARK = `bfa-secret-${suffix}`;

let request: ReturnType<typeof supertest>;
let uploadsDir = "";
const users: Record<string, string> = {};
const tokens: Record<string, string> = {};
const designations: Record<string, string> = {};
let seq = 0;

type PersonSpec = {
  tenantId: string;
  workspaceId: string;
  role?: string | null; // null = sem vínculo
  designations?: Array<{ scope: FinScope; role?: FinRole; limits?: Record<string, unknown>; state?: DesignationState; tenantId?: string }>;
};

async function mkPerson(key: string, spec: PersonSpec) {
  const userId = `bfa-u-${key}-${suffix}`;
  users[key] = userId;
  await prismaGlobal.user.create({ data: { id: userId, tenantId: spec.tenantId, email: `${userId}@example-test.internal`, displayName: key } });
  if (spec.role !== null) {
    await ensureWorkspaceMembershipForUser({ tenantId: spec.tenantId, workspaceId: spec.workspaceId, userId, roleKey: spec.role ?? "corretor" });
  }
  tokens[key] = `tk-${SECRET_MARK}-${key}`;
  await prismaGlobal.apiToken.create({
    data: { token: tokens[key], tenantId: spec.tenantId, workspaceId: spec.workspaceId, userId, description: `bfa ${key}`, revoked: false },
  });
  for (const [i, d] of (spec.designations ?? []).entries()) {
    designations[`${key}:${i}`] = await insertFinancialDesignationForTest(prismaGlobal, {
      tenantId: d.tenantId ?? spec.tenantId,
      userId,
      scope: d.scope,
      role: d.role,
      limits: d.limits,
      state: d.state,
    });
  }
  return userId;
}

const HOLD_LIMITS = (state?: DesignationState) => ({ scope: FIN_SCOPES.limits, state });
const HOLD_ADJUST = (state?: DesignationState, limits: Record<string, unknown> = { maxAdjustmentCents: ADJUST_CAP }) => ({ scope: FIN_SCOPES.adjust, state, limits });
const BOTH = [HOLD_LIMITS(), HOLD_ADJUST()];

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "eiah-bfa-"));
  process.env.NODE_ENV = "test";
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.STORAGE_PROVIDER = "local";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.createMany({ data: [{ id: ids.T, name: ids.T }, { id: ids.X, name: ids.X }] });
  await prismaGlobal.workspace.createMany({
    data: [
      { id: ids.A, tenantId: ids.T, name: "WS-A" },
      { id: ids.B, tenantId: ids.T, name: "WS-B" },
      { id: ids.XA, tenantId: ids.X, name: "WS-XA" },
    ],
  });

  const T = ids.T, A = ids.A;
  // Autoridade comprovada (designação ativa) — o papel do vínculo é deliberadamente "corretor": o papel não concede nada.
  await mkPerson("holderLimits", { tenantId: T, workspaceId: A, designations: [HOLD_LIMITS()] });
  await mkPerson("holderAdjust", { tenantId: T, workspaceId: A, designations: [HOLD_ADJUST()] });
  await mkPerson("holderAdjustNoCap", { tenantId: T, workspaceId: A, designations: [HOLD_ADJUST(undefined, {})] });
  await mkPerson("limitsRevoked", { tenantId: T, workspaceId: A, designations: [HOLD_LIMITS("revoked")] });
  await mkPerson("adjustRevoked", { tenantId: T, workspaceId: A, designations: [HOLD_ADJUST("revoked")] });
  await mkPerson("limitsExpired", { tenantId: T, workspaceId: A, designations: [HOLD_LIMITS("expired")] });
  await mkPerson("adjustExpired", { tenantId: T, workspaceId: A, designations: [HOLD_ADJUST("expired")] });
  await mkPerson("grantor", {
    tenantId: T,
    workspaceId: A,
    designations: [{ scope: FIN_SCOPES.limits, role: "grantor" }, { scope: FIN_SCOPES.adjust, role: "grantor", limits: { maxAdjustmentCents: ADJUST_CAP } }],
  });
  // Sem designação: nenhum papel, inclusive Founder, produz autoridade.
  await mkPerson("founder", { tenantId: T, workspaceId: A, role: "founder" });
  await mkPerson("corretor", { tenantId: T, workspaceId: A, role: "corretor" });
  await mkPerson("otherWorkspace", { tenantId: T, workspaceId: ids.B, role: "corretor" });
  // Designação ativa, mas SEM vínculo / com vínculo revogado: o vínculo ativo é pré-condição.
  await mkPerson("noMembership", { tenantId: T, workspaceId: A, role: null, designations: BOTH });
  await mkPerson("revokedMembership", { tenantId: T, workspaceId: A, designations: BOTH });
  await prismaGlobal.$executeRawUnsafe(`UPDATE eiah_workspace_memberships SET status = 'revoked' WHERE user_id = $1 AND workspace_id = $2`, users.revokedMembership, A);
  // Tenant externo.
  await mkPerson("externalHolder", { tenantId: ids.X, workspaceId: ids.XA, designations: BOTH });
  await mkPerson("externalFounder", { tenantId: ids.X, workspaceId: ids.XA, role: "founder" });
  await mkPerson("externalWithForeignDesignation", {
    tenantId: ids.X,
    workspaceId: ids.XA,
    designations: [{ scope: FIN_SCOPES.limits, tenantId: ids.T }, { scope: FIN_SCOPES.adjust, tenantId: ids.T, limits: { maxAdjustmentCents: ADJUST_CAP } }],
  });
  // Token técnico: sem pessoa associada.
  tokens.service = `tk-${SECRET_MARK}-service`;
  await prismaGlobal.apiToken.create({ data: { token: tokens.service, tenantId: T, workspaceId: A, description: "bfa service", revoked: false } });
  // Tokens inválidos.
  tokens.revoked = `tk-${SECRET_MARK}-revoked`;
  await prismaGlobal.apiToken.create({ data: { token: tokens.revoked, tenantId: T, workspaceId: A, userId: users.holderLimits, description: "bfa revoked", revoked: true } });
  tokens.expired = `tk-${SECRET_MARK}-expired`;
  await prismaGlobal.apiToken.create({
    data: { token: tokens.expired, tenantId: T, workspaceId: A, userId: users.holderLimits, description: "bfa expired", revoked: false, expiresAt: new Date(Date.now() - 3_600_000) },
  });
});

after(async () => {
  await removeAuditFailureTrigger(prismaGlobal);
  await removeUsageFailureTrigger(prismaGlobal);
  await prismaGlobal.$executeRawUnsafe(`ALTER TABLE IF EXISTS ${FIN_TABLE}_off RENAME TO ${FIN_TABLE}`).catch(() => undefined);
  // Limpeza em melhor esforço: o guardrail_audit_ledger referencia o tenant sem cascade; o banco é descartável.
  try {
    await prismaGlobal.apiToken.deleteMany({ where: { tenantId: { in: [ids.T, ids.X] } } });
  } catch { /* melhor esforço */ }
  await Promise.race([closePrismaResources().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  finalizeHttpContractCleanup();
  for (const q of [imobRunCompletedQueue, runAtivoUniversalQueue, runAtivoUniversalDLQ]) {
    await Promise.race([(q as any).close().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  }
  if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
});

// ───────────────────────────── helpers ─────────────────────────────

const COMMON = () => ({ reason: "Ajuste sintético BILLING-002", evidenceRef: "FIN-TEST-001", confirmed: true });
function validBody(ep: Ep, overrides: Record<string, unknown> = {}) {
  const base =
    ep === "quotas"
      ? { monthlyRunsLimit: 111, monthlyCostCentsLimit: 22_222, softLimitPct: 70, hardLimitPct: 90 }
      : ep === "grant"
        ? { enabled: true, localRunLimit: 5, localCostCentsLimit: 500 }
        : { amountCents: 1500, currency: "BRL", workspaceId: ids.A, requestId: `bfa-req-${suffix}-${++seq}` };
  return { ...base, ...COMMON(), ...overrides };
}
function pathOf(ep: Ep, workspaceId: string = ids.A) {
  return ep === "quotas" ? "/api/billing/tenant/quotas" : ep === "grant" ? `/api/billing/tenant/workspaces/${workspaceId}/grant` : "/api/billing/tenant/adjustment";
}
const SCOPE_OF: Record<Ep, FinScope> = { quotas: FIN_SCOPES.limits, grant: FIN_SCOPES.limits, adjustment: FIN_SCOPES.adjust };
const EVENT_OF: Record<Ep, string> = { quotas: "billing.quota.updated", grant: "billing.workspace_grant.updated", adjustment: "billing.adjustment.applied" };
const HOLDER_OF: Record<Ep, string> = { quotas: "holderLimits", grant: "holderLimits", adjustment: "holderAdjust" };

async function call(ep: Ep, token: string | null, body: unknown, opts: { headers?: Record<string, string>; path?: string } = {}) {
  const url = opts.path ?? pathOf(ep);
  let req = ep === "adjustment" ? request.post(url) : request.patch(url);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  for (const [k, v] of Object.entries(opts.headers ?? {})) req = req.set(k, v);
  return req.send(body as object);
}

async function snapTenant(tenantId: string) {
  const q = (sql: string) => prismaGlobal.$queryRawUnsafe(sql, tenantId) as Promise<unknown[]>;
  return {
    policy: await q(`SELECT * FROM tenant_quota_policy WHERE tenant_id = $1 ORDER BY id`),
    grants: await q(`SELECT * FROM workspace_quota_grant WHERE tenant_id = $1 ORDER BY id`),
    ledger: await q(`SELECT * FROM billing_ledger WHERE tenant_id = $1 ORDER BY id`),
    usage: await q(`SELECT * FROM tenant_quota_usage WHERE tenant_id = $1 ORDER BY id`),
    account: await q(`SELECT * FROM tenant_billing_account WHERE tenant_id = $1 ORDER BY id`),
  };
}
async function successAudits(tenantId: string) {
  const rows = (await prismaGlobal.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type IN ('billing.quota.updated','billing.workspace_grant.updated','billing.adjustment.applied')`,
    tenantId,
  )) as Array<{ c: number }>;
  return Number(rows[0]?.c ?? 0);
}
async function state() {
  const json = JSON.stringify({ T: await snapTenant(ids.T), X: await snapTenant(ids.X) }, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return { data: json, audits: (await successAudits(ids.T)) + (await successAudits(ids.X)) };
}
async function usageCost(tenantId: string) {
  const rows = (await prismaGlobal.$queryRawUnsafe(`SELECT COALESCE(SUM(cost_cents),0)::int AS c FROM tenant_quota_usage WHERE tenant_id = $1`, tenantId)) as Array<{ c: number }>;
  return Number(rows[0]?.c ?? 0);
}

type Deny = { status: number; code: string; headers?: Record<string, string>; body?: unknown; path?: string };
async function expectDenied(ep: Ep, token: string | null, deny: Deny) {
  const before = await state();
  const res = await call(ep, token, deny.body ?? validBody(ep), { headers: deny.headers, path: deny.path });
  const after = await state();
  const problems: string[] = [];
  if (res.status !== deny.status) problems.push(`status ${res.status} (esperado ${deny.status})`);
  if (res.body?.error?.code !== deny.code) problems.push(`code ${res.body?.error?.code ?? "—"} (esperado ${deny.code})`);
  if (before.data !== after.data) problems.push("MUTAÇÃO financeira detectada numa negativa");
  if (before.audits !== after.audits) problems.push("evento de SUCESSO financeiro registrado numa negativa");
  assert.ok(problems.length === 0, problems.join(" | "));
}

const guard = (name: string, fn: () => Promise<void>) => it(`[GUARD] ${name}`, fn);
const red = (name: string, fn: () => Promise<void>) => it(`[P0-RED] ${name}`, fn);
const twoPerson = (name: string, fn: () => Promise<void>) => it(`[TWO-PERSON] ${name}`, fn);
/** Rotas de limites (cotas e concessão): um holder de `billing.limits.manage` basta. O ajuste é tratado à parte (dois atores). */
const LIMITS_EPS: Ep[] = ["quotas", "grant"];
const APPROVAL_REQUIRED = { status: 403, code: "BILLING_ADJUSTMENT_APPROVAL_REQUIRED" } as const;

// ───────────────────────────── 1. Identidade e token (já vale) ─────────────────────────────

for (const ep of EPS) {
  guard(`${ep}: sem token → 401 UNAUTHORIZED, sem mutação`, () => expectDenied(ep, null, { status: 401, code: "UNAUTHORIZED" }));
  guard(`${ep}: token inexistente → 401 UNAUTHORIZED, sem mutação`, () => expectDenied(ep, `tk-${SECRET_MARK}-nao-existe`, { status: 401, code: "UNAUTHORIZED" }));
  guard(`${ep}: token revogado → 401 UNAUTHORIZED, sem mutação`, () => expectDenied(ep, tokens.revoked, { status: 401, code: "UNAUTHORIZED" }));
  guard(`${ep}: token expirado → 401 TOKEN_EXPIRED, sem mutação`, () => expectDenied(ep, tokens.expired, { status: 401, code: "TOKEN_EXPIRED" }));
  guard(`${ep}: delegação inexistente nunca eleva nem libera → 403 DELEGATION_MISSING, sem mutação`, () =>
    expectDenied(ep, tokens[HOLDER_OF[ep]], { status: 403, code: "DELEGATION_MISSING", headers: { "x-delegation-id": `deleg-${suffix}` } }));
}

// ───────────────────────────── 2. Autoridade financeira (P0) ─────────────────────────────

for (const ep of EPS) {
  red(`${ep}: usuário autenticado sem designação (corretor) → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.corretor, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: Founder sem designação não tem autoridade implícita → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.founder, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: token técnico sem userId → 403 BILLING_IDENTITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.service, { status: 403, code: "BILLING_IDENTITY_REQUIRED" }));
  red(`${ep}: designação ativa mas SEM vínculo no workspace → 403 BILLING_MEMBERSHIP_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.noMembership, { status: 403, code: "BILLING_MEMBERSHIP_REQUIRED" }));
  red(`${ep}: designação ativa mas vínculo REVOGADO → 403 BILLING_MEMBERSHIP_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.revokedMembership, { status: 403, code: "BILLING_MEMBERSHIP_REQUIRED" }));
  red(`${ep}: usuário de outro workspace do mesmo tenant, sem designação → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.otherWorkspace, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: Founder de tenant externo, sem designação → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.externalFounder, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: designação de OUTRO tenant não vale no tenant do token → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.externalWithForeignDesignation, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: designação revogada → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens[ep === "adjustment" ? "adjustRevoked" : "limitsRevoked"], { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: designação expirada → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens[ep === "adjustment" ? "adjustExpired" : "limitsExpired"], { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: autoridade de OUTRO escopo (insuficiente) → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens[ep === "adjustment" ? "holderLimits" : "holderAdjust"], { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: grantor não exerce a autoridade que concede (separação de funções) → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
    expectDenied(ep, tokens.grantor, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));
  red(`${ep}: negativa por falta de autoridade é registrada (melhor esforço) em billing.authority.denied`, async () => {
    const res = await call(ep, tokens.corretor, validBody(ep));
    assert.equal(res.status, 403, JSON.stringify(res.body));
    const rows = (await prismaGlobal.$queryRawUnsafe(
      `SELECT metadata FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type = 'billing.authority.denied' ORDER BY created_at DESC LIMIT 1`,
      ids.T,
    )) as Array<{ metadata: any }>;
    assert.ok(rows[0], "nenhum evento billing.authority.denied");
    assert.equal(rows[0].metadata?.actorUserId, users.corretor);
    assert.ok(!JSON.stringify(rows[0].metadata).includes(SECRET_MARK), "token vazou para o audit");
  });
}

// Tenant externo COM autoridade própria: o isolamento por tenant já vale e não pode regredir.
guard(`grant: holder do tenant externo mirando workspace de OUTRO tenant → 404 WORKSPACE_NOT_FOUND, sem mutação`, () =>
  expectDenied("grant", tokens.externalHolder, { status: 404, code: "WORKSPACE_NOT_FOUND" }));
guard(`adjustment: holder do tenant externo com workspaceId de OUTRO tenant → 404 WORKSPACE_NOT_FOUND, sem mutação`, () =>
  expectDenied("adjustment", tokens.externalHolder, { status: 404, code: "WORKSPACE_NOT_FOUND" }));
guard(`quotas: holder do tenant externo só altera o PRÓPRIO tenant (tenant T intacto)`, async () => {
  const serialize = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  const before = serialize(await snapTenant(ids.T));
  const res = await call("quotas", tokens.externalHolder, validBody("quotas"));
  const after = serialize(await snapTenant(ids.T));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(before, after, "tenant T foi alterado por token de outro tenant");
});

// ───────────────────────────── 3. Validação do corpo (autoridade já comprovada) ─────────────────────────────

for (const ep of EPS) {
  const holder = HOLDER_OF[ep];
  for (const field of ["reason", "evidenceRef"] as const) {
    red(`${ep}: sem ${field} → 400 INVALID_PAYLOAD, sem mutação`, () => {
      const body: Record<string, unknown> = validBody(ep);
      delete body[field];
      return expectDenied(ep, tokens[holder], { status: 400, code: "INVALID_PAYLOAD", body });
    });
  }
  red(`${ep}: confirmed ausente → 400 INVALID_PAYLOAD, sem mutação`, () => {
    const body: Record<string, unknown> = validBody(ep);
    delete body.confirmed;
    return expectDenied(ep, tokens[holder], { status: 400, code: "INVALID_PAYLOAD", body });
  });
  red(`${ep}: confirmed=false → 400 INVALID_PAYLOAD, sem mutação`, () =>
    expectDenied(ep, tokens[holder], { status: 400, code: "INVALID_PAYLOAD", body: validBody(ep, { confirmed: false }) }));
  red(`${ep}: campo extra (tenantId no corpo) → 400 INVALID_PAYLOAD, sem mutação`, () =>
    expectDenied(ep, tokens[holder], { status: 400, code: "INVALID_PAYLOAD", body: validBody(ep, { tenantId: ids.X }) }));
}
red(`adjustment: sem requestId (idempotência obrigatória) → 400 INVALID_PAYLOAD, sem mutação`, () => {
  const body: Record<string, unknown> = validBody("adjustment");
  delete body.requestId;
  return expectDenied("adjustment", tokens.holderAdjust, { status: 400, code: "INVALID_PAYLOAD", body });
});
red(`adjustment: moeda diferente de BRL → 400 INVALID_PAYLOAD, sem mutação`, () =>
  expectDenied("adjustment", tokens.holderAdjust, { status: 400, code: "INVALID_PAYLOAD", body: validBody("adjustment", { currency: "USD" }) }));
guard(`adjustment: amountCents=0 → 400 INVALID_AMOUNT (contrato existente), sem mutação`, () =>
  expectDenied("adjustment", tokens.holderAdjust, { status: 400, code: "INVALID_AMOUNT", body: validBody("adjustment", { amountCents: 0 }) }));
guard(`quotas: soft > hard → 400 INVALID_LIMITS (contrato existente), sem mutação`, () =>
  expectDenied("quotas", tokens.holderLimits, { status: 400, code: "INVALID_LIMITS", body: validBody("quotas", { softLimitPct: 95, hardLimitPct: 50 }) }));
guard(`grant: workspace inexistente → 404 WORKSPACE_NOT_FOUND (contrato existente), sem mutação`, () =>
  expectDenied("grant", tokens.holderLimits, { status: 404, code: "WORKSPACE_NOT_FOUND", path: pathOf("grant", `ws-nao-existe-${suffix}`) }));
guard(`adjustment: workspaceId inexistente → 404 WORKSPACE_NOT_FOUND (contrato existente), sem mutação`, () =>
  expectDenied("adjustment", tokens.holderAdjust, { status: 404, code: "WORKSPACE_NOT_FOUND", body: validBody("adjustment", { workspaceId: `ws-nao-existe-${suffix}` }) }));
red(`adjustment: acima do teto da designação → 403 BILLING_LIMIT_EXCEEDED, sem mutação`, () =>
  expectDenied("adjustment", tokens.holderAdjust, { status: 403, code: "BILLING_LIMIT_EXCEEDED", body: validBody("adjustment", { amountCents: ADJUST_CAP + 1 }) }));
red(`adjustment: designação sem teto válido (política inválida) → 403 BILLING_AUTHORITY_REQUIRED, sem mutação`, () =>
  expectDenied("adjustment", tokens.holderAdjustNoCap, { status: 403, code: "BILLING_AUTHORITY_REQUIRED" }));

// ───────────────────────────── 4. Sucesso autorizado, autoria e auditoria ─────────────────────────────

async function lastAudit(eventType: string) {
  const rows = (await prismaGlobal.$queryRawUnsafe(
    `SELECT metadata, workspace_id FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT 1`,
    ids.T,
    eventType,
  )) as Array<{ metadata: any; workspace_id: string | null }>;
  return rows[0] ?? null;
}

for (const ep of LIMITS_EPS) {
  red(`${ep}: identidade com autoridade comprovada → sucesso + efeito + auditoria com autoria e sem segredo`, async () => {
    const holder = HOLDER_OF[ep];
    const body = validBody(ep);
    const auditsBefore = await successAudits(ids.T);
    const res = await call(ep, tokens[holder], body);
    const problems: string[] = [];
    const expected = ep === "adjustment" ? 201 : 200;
    if (res.status !== expected) problems.push(`status ${res.status} (esperado ${expected}): ${JSON.stringify(res.body)}`);
    if (res.body?.ok !== true) problems.push("resposta sem ok:true");
    if ((await successAudits(ids.T)) !== auditsBefore + 1) problems.push("esperava exatamente 1 evento de sucesso financeiro novo");
    const ev = await lastAudit(EVENT_OF[ep]);
    const meta = ev?.metadata ?? {};
    if (!ev) problems.push(`evento ${EVENT_OF[ep]} ausente`);
    else {
      if (meta.contractRef !== "AUTHZ-FIN-1") problems.push("contractRef");
      if (meta.actorUserId !== users[holder]) problems.push("actorUserId");
      if (!meta.tokenId || String(meta.tokenId).includes(SECRET_MARK)) problems.push("tokenId ausente ou é o próprio token");
      if (meta.designationId !== designations[`${holder}:0`]) problems.push("designationId");
      if (meta.scope !== SCOPE_OF[ep]) problems.push("scope");
      if (meta.reason !== COMMON().reason) problems.push("reason");
      if (meta.evidenceRef !== COMMON().evidenceRef) problems.push("evidenceRef");
      if (meta.outcome !== "applied") problems.push("outcome");
      if (ep !== "adjustment" && !(meta.before !== undefined && meta.after !== undefined)) problems.push("before/after");
      if (ep === "adjustment") {
        if (meta.requestId !== (body as any).requestId) problems.push("requestId");
        if (meta.ledgerEntryId !== res.body?.data?.ledger?.id) problems.push("ledgerEntryId");
        if (meta.amountCents !== 1500) problems.push("amountCents");
      }
      if (JSON.stringify(ev).includes(SECRET_MARK)) problems.push("TOKEN vazou para o audit");
    }
    assert.ok(problems.length === 0, problems.join(" | "));
  });

  red(`${ep}: revogação vale na chamada seguinte (sem cache)`, async () => {
    const key = `fresh-${ep}-${++seq}`;
    await mkPerson(key, { tenantId: ids.T, workspaceId: ids.A, designations: [ep === "adjustment" ? HOLD_ADJUST() : HOLD_LIMITS()] });
    const first = await call(ep, tokens[key], validBody(ep));
    assert.equal(first.status, ep === "adjustment" ? 201 : 200, `1ª chamada com autoridade deveria passar: ${JSON.stringify(first.body)}`);
    await revokeFinancialDesignationForTest(prismaGlobal, designations[`${key}:0`]);
    await expectDenied(ep, tokens[key], { status: 403, code: "BILLING_AUTHORITY_REQUIRED" });
  });
}

// ───────────────────────────── 5. Replay, atomicidade e falhas ─────────────────────────────

for (const ep of LIMITS_EPS) {
  red(`${ep}: falha ao gravar a auditoria → 503 BILLING_AUDIT_UNAVAILABLE e NENHUMA mutação`, async () => {
    await installAuditFailureTrigger(prismaGlobal);
    try {
      await expectDenied(ep, tokens[HOLDER_OF[ep]], { status: 503, code: "BILLING_AUDIT_UNAVAILABLE" });
    } finally {
      await removeAuditFailureTrigger(prismaGlobal);
    }
  });
}

for (const ep of EPS) {
  red(`${ep}: registro de designações indisponível → 503 BILLING_AUTHORITY_CHECK_UNAVAILABLE (fail-closed) e NENHUMA mutação`, async () => {
    await assertDisposableDatabaseForFaultInjection(prismaGlobal);
    await prismaGlobal.$executeRawUnsafe(`ALTER TABLE ${FIN_TABLE} RENAME TO ${FIN_TABLE}_off`);
    try {
      await expectDenied(ep, tokens[HOLDER_OF[ep]], { status: 503, code: "BILLING_AUTHORITY_CHECK_UNAVAILABLE" });
    } finally {
      await prismaGlobal.$executeRawUnsafe(`ALTER TABLE ${FIN_TABLE}_off RENAME TO ${FIN_TABLE}`);
    }
  });
}

// ───────────────────────────── 6. Ajuste: substitutos HTTP do contrato de DOIS atores (BILLING-003 §5) ─────────────────────────────
//
// MAPEAMENTO dos 5 cenários originais do BILLING-002 (presumiam sucesso por UM holder) → substitutos abaixo:
//   O1 "adjustment: identidade com autoridade comprovada → sucesso + efeito + auditoria com autoria e sem segredo"  (201, 1 evento billing.adjustment.applied)
//      → S1. Positivo preservado em billing-financial-adjustment.service.test.ts ("duas pessoas distintas ... autoria dupla e sem segredo").
//   O2 "adjustment: revogação vale na chamada seguinte (sem cache)"                                                    (1ª chamada 201; depois da revogação, 403)
//      → S2 (a propriedade "sem cache" continua provada por HTTP: o código muda de APPROVAL_REQUIRED para AUTHORITY_REQUIRED).
//   O3 "adjustment: replay do mesmo requestId → 200 inserted:false, 1 linha no ledger e uso incrementado UMA vez"      (201 depois 200)
//      → S3. Positivo preservado no serviço (replay sequencial e concorrente).
//   O4 "adjustment: falha ao gravar a auditoria → 503 BILLING_AUDIT_UNAVAILABLE e NENHUMA mutação"
//      → S4. Positivo preservado no serviço (rollback + retry).
//   O5 "adjustment: falha ao atualizar o uso de cota → 503 BILLING_WRITE_UNAVAILABLE e o ledger NÃO fica com a linha"
//      → S5. Positivo preservado no serviço (rollback + retry).
// PENDENTE (cobertura HTTP positiva do ajuste aprovado): sucesso 201, replay 200/inserted:false, 503 de auditoria e de escrita por HTTP.
// Só podem ser escritos quando existir o mecanismo de aprovação por dois atores ratificado e a rota o utilizar.

async function lastDenial(reasonCode: string) {
  const rows = (await prismaGlobal.$queryRawUnsafe(
    `SELECT metadata FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type = 'billing.authority.denied' AND metadata->>'reasonCode' = $2 ORDER BY created_at DESC LIMIT 1`,
    ids.T,
    reasonCode,
  )) as Array<{ metadata: any }>;
  return rows[0]?.metadata ?? null;
}

twoPerson(`adjustment [S1, orig. O1]: holder com autoridade válida → 403 BILLING_ADJUSTMENT_APPROVAL_REQUIRED, sem mutação nem evento de sucesso; a negativa é auditada com o autor correto e sem segredo`, async () => {
  await expectDenied("adjustment", tokens.holderAdjust, APPROVAL_REQUIRED);
  const meta = await lastDenial("ADJUSTMENT_TWO_PERSON_APPROVAL_NOT_AVAILABLE");
  assert.ok(meta, "negativa de aprovação não foi auditada");
  assert.equal(meta.actorUserId, users.holderAdjust);
  assert.equal(meta.scope, FIN_SCOPES.adjust);
  assert.equal(meta.outcome, "denied");
  assert.equal(meta.contractRef, "AUTHZ-FIN-1");
  assert.ok(!JSON.stringify(meta).includes(SECRET_MARK), "token vazou para o audit");
});

twoPerson(`adjustment [S2, orig. O2]: revogação vale na chamada seguinte (sem cache): 403 APPROVAL_REQUIRED antes, 403 BILLING_AUTHORITY_REQUIRED depois, sempre sem mutação`, async () => {
  const key = `fresh-adjustment-${++seq}`;
  await mkPerson(key, { tenantId: ids.T, workspaceId: ids.A, designations: [HOLD_ADJUST()] });
  await expectDenied("adjustment", tokens[key], APPROVAL_REQUIRED);
  await revokeFinancialDesignationForTest(prismaGlobal, designations[`${key}:0`]);
  await expectDenied("adjustment", tokens[key], { status: 403, code: "BILLING_AUTHORITY_REQUIRED" });
});

twoPerson(`adjustment [S3, orig. O3]: replay do mesmo requestId por HTTP nunca grava: duas chamadas → 403 APPROVAL_REQUIRED, 0 linha no ledger e uso inalterado`, async () => {
  const body = validBody("adjustment", { amountCents: 777 });
  const usage0 = await usageCost(ids.T);
  await expectDenied("adjustment", tokens.holderAdjust, { ...APPROVAL_REQUIRED, body });
  await expectDenied("adjustment", tokens.holderAdjust, { ...APPROVAL_REQUIRED, body });
  const rows = (await prismaGlobal.$queryRawUnsafe(`SELECT id FROM billing_ledger WHERE tenant_id = $1 AND request_id = $2`, ids.T, (body as any).requestId)) as unknown[];
  assert.equal(rows.length, 0, "a rota gravou lançamento sem aprovação");
  assert.equal(await usageCost(ids.T), usage0, "a rota alterou o uso sem aprovação");
});

twoPerson(`adjustment [S4, orig. O4]: com a auditoria indisponível a rota continua negando: 403 APPROVAL_REQUIRED, sem mutação e sem 5xx (a falha do registro de negativa nunca vira permissão)`, async () => {
  await installAuditFailureTrigger(prismaGlobal);
  try {
    await expectDenied("adjustment", tokens.holderAdjust, APPROVAL_REQUIRED);
  } finally {
    await removeAuditFailureTrigger(prismaGlobal);
  }
});

twoPerson(`adjustment [S5, orig. O5]: com o uso de cota indisponível a rota continua negando: 403 APPROVAL_REQUIRED e o ledger NÃO recebe linha`, async () => {
  await installUsageFailureTrigger(prismaGlobal);
  try {
    await expectDenied("adjustment", tokens.holderAdjust, APPROVAL_REQUIRED);
  } finally {
    await removeUsageFailureTrigger(prismaGlobal);
  }
});
