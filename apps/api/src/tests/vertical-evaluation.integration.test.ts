import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { closePrismaResources } from "@repo/db";
import { closeRunEventsTransport } from "../services/runEvents";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { imobRouter } from "../routes/imob";
import { marketplaceRouter } from "../routes/marketplace";
import { uploadsRouter } from "../routes/uploads";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { readFrontDoorAccessOptions } from "../services/frontDoorAccess";
import { acceptEvaluationTermsCore, declineEvaluationTerms, decideEvaluationGrantCore, readEvaluationGrantGate } from "../services/products/verticalEvaluation";
import { activateProductInstallation, activateProductInstallationCore, ensureTenantProductInstallationTable } from "../services/products/productActivation";
import {
  decideVerticalAccess, ensureVerticalAccessStore, readVerticalAccess, readVerticalUsage, requestVerticalAccess, requestVerticalAccessCore, resolveVerticalUsage,
} from "../services/products/verticalAccessApproval";
import { PRODUCTION_EVALUATION_DEPS, evaluationRequestContextSchema } from "../services/products/verticalEvaluationContract";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import {
  DAY, IMOB_ACTIONS, T0, assertDisposableDatabase, controlledClock, eventsOf, installationOf, noticeCount, policyActionsOf, prisma,
  pgTsToIso, rawApproval, seedScope, type Scope,
} from "./support/verticalEvaluationRealDb";

// Integração REAL da avaliação gratuita IMOB: Prisma real → PostgreSQL real (descartável) e rotas autenticadas (supertest).
// A oferta habilitada existe SÓ nas fixtures deste arquivo (`controlledClock().deps`); a composição de produção segue desligada.
assertDisposableDatabase();

const CONTEXT = evaluationRequestContextSchema.parse({ problem: "Organizar cadastro de imóveis", teamSize: 3, expectedOutcome: "Cadastros completos" });
const TERMS_INPUT = { durationDays: 7, allowedActions: [...IMOB_ACTIONS], closureMode: "somente_leitura" as const };
const sql = prisma;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;

/** Percorre pedido → decisão → aceite (sem ativar). */
async function reachAccepted(scope: Scope, clock: ReturnType<typeof controlledClock>, input: Record<string, unknown> = TERMS_INPUT) {
  const requested = await requestVerticalAccessCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester, channel: "chat", evaluation: CONTEXT }, clock.deps);
  assert.equal(requested.outcome, "requested");
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const decided = await decideEvaluationGrantCore({ prisma, approvalId, adminEmail: `${scope.admin}@example.com`, adminUserId: scope.admin, decision: "aprovar", note: "Synthetic", input }, clock.deps);
  assert.equal(decided.ok, true, JSON.stringify(decided));
  const termsHash = (decided as { termsHash: string }).termsHash;
  const accepted = await acceptEvaluationTermsCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, termsHash }, clock.deps);
  assert.deepEqual(accepted, { ok: true, outcome: "accepted" });
  return { approvalId, termsHash };
}
async function reachActive(scope: Scope, clock: ReturnType<typeof controlledClock>, input: Record<string, unknown> = TERMS_INPUT) {
  const reached = await reachAccepted(scope, clock, input);
  const activated = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(activated.ok, true, JSON.stringify(activated));
  return reached;
}
// Uso efetivo em um instante (mesma regra de `readVerticalUsage`, que não recebe `now`): leitura efetiva + `resolveVerticalUsage`.
const usageAt = async (scope: Scope, now: Date) => resolveVerticalUsage(await readVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", now }));
const accessAt = (scope: Scope, now: Date) => readVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", now });

before(async () => {
  await ensureVerticalAccessStore(prisma);
  await ensureTenantProductInstallationTable(prisma);
});
after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS; else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS eval_it_fail_install_trg ON tenant_product_installations");
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS eval_it_fail_install()");
  await closeRunEventsTransport();
  await closePrismaResources();
});

// ─── 1. Oferta desligada na composição de PRODUÇÃO ──────────────────────────────────────────────────────────────────
test("oferta desligada: pedido de avaliação (composição de produção) não grava nada; pedido padrão segue", async () => {
  assert.notEqual(PRODUCTION_EVALUATION_DEPS.offer().state, "enabled", "a composição de produção NÃO está habilitada neste processo");
  const scope = await seedScope("off");
  const result = await requestVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester, evaluation: CONTEXT });
  assert.deepEqual(result, { outcome: "evaluation_unavailable" });
  assert.equal(await rawApproval(scope), null, "nenhuma linha gravada");

  // Mesmo com flag e configuração válidas no ambiente real do processo, as decisões obrigatórias reais seguem pendentes ⇒ bloqueado.
  const saved = { flag: process.env.EIAH_VERTICAL_EVALUATION_ENABLED, cfg: process.env.EIAH_VERTICAL_EVALUATION_CONFIG };
  process.env.EIAH_VERTICAL_EVALUATION_ENABLED = "true";
  process.env.EIAH_VERTICAL_EVALUATION_CONFIG = JSON.stringify({ vertical: "IMOB", maxDurationDays: 30, allowedActions: [...IMOB_ACTIONS], closureModes: ["somente_leitura"], conditions: { version: "v1", text: "t" } });
  try {
    assert.equal(PRODUCTION_EVALUATION_DEPS.offer().state, "blocked");
    const again = await requestVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester, evaluation: CONTEXT });
    assert.deepEqual(again, { outcome: "evaluation_unavailable" });
    assert.equal(await rawApproval(scope), null);
  } finally {
    if (saved.flag === undefined) delete process.env.EIAH_VERTICAL_EVALUATION_ENABLED; else process.env.EIAH_VERTICAL_EVALUATION_ENABLED = saved.flag;
    if (saved.cfg === undefined) delete process.env.EIAH_VERTICAL_EVALUATION_CONFIG; else process.env.EIAH_VERTICAL_EVALUATION_CONFIG = saved.cfg;
  }

  const standard = await requestVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester });
  assert.equal(standard.outcome, "requested");
  const row = await rawApproval(scope);
  assert.equal(row?.grant_kind, null, "pedido padrão: sem grant");
  assert.equal(row?.status, "aguardando_humano");
});

// ─── 2. Fluxo legado (sem grant) com Prisma real ────────────────────────────────────────────────────────────────────
test("legado sem grant: pedido → decisão → ativação (produção) → uso pleno; nunca encerra por tempo; colunas do grant ficam nulas", async () => {
  const scope = await seedScope("legacy");
  const requested = await requestVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester });
  assert.equal(requested.outcome, "requested");
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const early = await activateProductInstallation({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" });
  assert.equal(early.ok, false, "sem liberação aprovada nada é ativado");
  assert.equal((await installationOf(scope)).length, 0);
  const decided = await decideVerticalAccess({ prisma, approvalId, adminEmail: `${scope.admin}@example.com`, decision: "aprovar", note: "Synthetic" });
  assert.equal(decided.ok, true);
  const activated = await activateProductInstallation({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" });
  assert.equal(activated.ok, true);
  const row = await rawApproval(scope);
  assert.deepEqual([row?.status, row?.grant_kind, row?.grant_started_at, row?.grant_valid_until, row?.evaluation_used_at], ["aprovado", null, null, null, null]);
  assert.equal(await usageAt(scope, T0), "full");
  assert.equal(await usageAt(scope, new Date(T0.getTime() + 3650 * DAY)), "full", "sem grant não há validade: 10 anos depois continua pleno");
  assert.equal((await readEvaluationGrantGate({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId })).applies, false);
  assert.equal((await rawApproval(scope))?.status, "aprovado", "leitura futura não fecha linha legada");
  assert.equal((await installationOf(scope))[0]?.status, "active");
  assert.deepEqual((await policyActionsOf(scope)).map((p) => p.actionName), [...IMOB_ACTIONS].sort(), "ativação padrão: políticas padrão do IMOB");
});

// ─── 3. Ciclo completo com relógio controlado ───────────────────────────────────────────────────────────────────────
test("ciclo: pedido → decisão → aceite → ativação → uso → fim; nenhum uso/autorização antes da ativação nem depois do fim", async () => {
  const scope = await seedScope("cycle");
  const clock = controlledClock();
  const gate = (now: Date) => readEvaluationGrantGate({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, now });

  const requested = await requestVerticalAccessCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester, channel: "chat", evaluation: CONTEXT }, clock.deps);
  assert.equal(requested.outcome, "requested");
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  assert.notEqual(await usageAt(scope, T0), "full", "pedido aberto não é uso pleno");
  assert.equal((await gate(T0)).allowed, false);

  // ativar antes da decisão e antes do aceite: negado, sem instalação
  const tooEarly = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(tooEarly.ok, false);
  assert.equal((await installationOf(scope)).length, 0);

  const decided = await decideEvaluationGrantCore({ prisma, approvalId, adminEmail: `${scope.admin}@example.com`, adminUserId: scope.admin, decision: "aprovar", note: "Synthetic", input: TERMS_INPUT }, clock.deps);
  assert.equal(decided.ok, true);
  const termsHash = (decided as { termsHash: string }).termsHash;
  assert.equal((await rawApproval(scope))?.status, "pre_ativacao");
  assert.notEqual(await usageAt(scope, T0), "full", "termos propostos não liberam uso");
  const notAccepted = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.deepEqual([notAccepted.ok, (notAccepted as { reason?: string }).reason], [false, "terms_not_accepted"]);

  // aceite de outro usuário e com hash errado: negados
  const wrongUser = await acceptEvaluationTermsCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.other, termsHash }, clock.deps);
  assert.deepEqual(wrongUser, { ok: false, code: "NOT_REQUESTER" });
  const wrongHash = await acceptEvaluationTermsCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, termsHash: "0".repeat(64) }, clock.deps);
  assert.deepEqual(wrongHash, { ok: false, code: "TERMS_MISMATCH" });
  assert.equal((await rawApproval(scope))?.grant_accepted_hash, null);

  const accepted = await acceptEvaluationTermsCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, termsHash }, clock.deps);
  assert.deepEqual(accepted, { ok: true, outcome: "accepted" });
  assert.equal((await rawApproval(scope))?.status, "pre_ativacao", "aceite não ativa");
  assert.equal((await rawApproval(scope))?.grant_started_at, null);
  assert.notEqual(await usageAt(scope, T0), "full", "aceite não libera uso");
  assert.equal((await gate(T0)).allowed, false);
  assert.equal((await installationOf(scope)).length, 0);

  // ativação: o início do prazo é o da ativação (relógio após o aceite), não o do pedido
  clock.advance(3 * 3_600_000);
  const startedAt = clock.now();
  const activated = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(activated.ok, true, JSON.stringify(activated));
  const validUntil = new Date(startedAt.getTime() + 7 * DAY);
  const active = await accessAt(scope, startedAt);
  assert.equal(active?.status, "aprovado");
  assert.equal(active?.grantStartedAt?.toISOString(), startedAt.toISOString());
  assert.equal(active?.grantValidUntil?.toISOString(), validUntil.toISOString());
  assert.equal(await usageAt(scope, startedAt), "full");
  assert.deepEqual(await gate(startedAt), { applies: true, allowed: true, usage: "full" });
  assert.equal((await installationOf(scope))[0]?.status, "active");
  assert.deepEqual((await policyActionsOf(scope)).map((p) => p.actionName), [...IMOB_ACTIONS].sort(), "políticas = exatamente as ações aceitas");

  // repetição da ativação é idempotente: não reinicia nem estende
  clock.advance(DAY);
  const again = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(again.ok, true);
  assert.equal(pgTsToIso((await rawApproval(scope))?.grant_valid_until ?? null), validUntil.toISOString(), "validade inalterada");

  // fim: 1 ms antes ainda é pleno; no instante da validade encerra; modo dos termos = somente leitura
  assert.equal(await usageAt(scope, new Date(validUntil.getTime() - 1)), "full");
  const ended = await accessAt(scope, validUntil);
  assert.equal(ended?.status, "encerrado");
  assert.equal(await usageAt(scope, validUntil), "read_only");
  assert.deepEqual(await gate(validUntil), { applies: true, allowed: false, usage: "read_only" });
  const closedRow = await rawApproval(scope);
  assert.deepEqual([closedRow?.status, closedRow?.revocation_mode, closedRow?.grant_closed_reason], ["encerrado", "somente_leitura", "expired"], "fechamento persistido");
  const events = await eventsOf(approvalId);
  assert.equal(events.filter((e) => e.to_status === "encerrado").length, 1);
  assert.equal(await noticeCount(approvalId, "avaliacao_encerrada"), 1);
  assert.equal(events.filter((e) => e.detail?.stage === "activated").length, 1);

  // depois do fim: não reativa, não se aceita de novo e a avaliação usada não se repete
  const reactivate = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, { ...clock.deps, clock: () => validUntil });
  assert.equal(reactivate.ok, false);
  const repeat = await requestVerticalAccessCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester, evaluation: CONTEXT }, { ...clock.deps, clock: () => validUntil });
  assert.equal(repeat.outcome, "evaluation_already_used");
  assert.equal((await rawApproval(scope))?.status, "encerrado", "pedido repetido não reescreve a linha");
  assert.equal((await readVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", now: validUntil }))?.evaluationUsedAt instanceof Date, true);
  assert.equal((await installationOf(scope))[0]?.status, "active", "o encerramento da avaliação não remove a instalação; o uso é governado pelo acesso efetivo");
});

test("modo bloqueio_total nos termos: ao fim o uso é bloqueado", async () => {
  const scope = await seedScope("block");
  const clock = controlledClock();
  await reachActive(scope, clock, { ...TERMS_INPUT, durationDays: 2, closureMode: "bloqueio_total" });
  const end = new Date(T0.getTime() + 2 * DAY);
  assert.equal(await usageAt(scope, new Date(end.getTime() - 1)), "full");
  assert.equal(await usageAt(scope, end), "blocked");
  assert.equal((await rawApproval(scope))?.revocation_mode, "bloqueio_total");
});

// ─── 4. Termos inconsistentes ⇒ bloqueio total ────────────────────────────────────────────────────────────────────
test("termos inconsistentes (adulterados no banco): bloqueio total mesmo com modo somente_leitura nos termos; fechamento persistido uma vez", async () => {
  const scope = await seedScope("tamper");
  const clock = controlledClock();
  const { approvalId } = await reachActive(scope, clock);
  assert.equal(await usageAt(scope, clock.now()), "full");
  // adulteração: duração diferente da que gerou o hash
  await sql.$executeRaw`UPDATE vertical_access_approvals SET grant_terms = jsonb_set(grant_terms, '{durationDays}', '365') WHERE id = ${approvalId}`;
  const effective = await accessAt(scope, clock.now());
  assert.equal(effective?.status, "encerrado");
  assert.equal(effective?.grantClosedReason, "terms_invalid");
  assert.equal(await usageAt(scope, clock.now()), "blocked");
  const row = await rawApproval(scope);
  assert.deepEqual([row?.status, row?.revocation_mode, row?.grant_closed_reason], ["encerrado", "bloqueio_total", "terms_invalid"]);
  await accessAt(scope, clock.now());
  assert.equal((await eventsOf(approvalId)).filter((e) => e.to_status === "encerrado").length, 1, "fechado uma única vez");
  assert.equal((await readEvaluationGrantGate({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, now: clock.now() })).allowed, false);
  const reactivate = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(reactivate.ok, false);
});

// ─── 5. Restrições do banco ───────────────────────────────────────────────────────────────────────────────────────────
test("restrições reais do PostgreSQL: grant sem termos/aceite/validade e status/kind fora do domínio são rejeitados", async () => {
  const scope = await seedScope("checks");
  const insert = (status: string, kind: string | null, extra = "") => sql.$executeRawUnsafe(
    `INSERT INTO vertical_access_approvals (id, tenant_id, workspace_id, vertical, status, source, grant_kind, created_at, updated_at ${extra ? "," + extra.split("=")[0] : ""})
     VALUES ('${randomUUID()}', '${scope.tenantId}', '${scope.workspaceId}', 'IMOB', '${status}', 'request', ${kind ? `'${kind}'` : "NULL"}, NOW(), NOW() ${extra ? "," + extra.split("=")[1] : ""})`,
  );
  await assert.rejects(() => insert("aprovado", "evaluation"), /check|violates/i, "aprovado com grant sem termos/aceite/início/validade");
  await assert.rejects(() => insert("pre_ativacao", "evaluation"), /check|violates/i, "pre_ativacao sem termos e hash");
  await assert.rejects(() => insert("aprovado", "outro"), /check|violates/i, "grant_kind fora do domínio");
  await assert.rejects(() => insert("status_inexistente", null), /check|violates/i, "status fora do domínio");
  assert.equal(await rawApproval(scope), null, "nada foi gravado pelas tentativas rejeitadas");
});

// ─── 6. Pedidos abertos preservados; avaliação usada não se repete ─────────────────────────────────────────────────────
test("pedido aberto (inclusive pre_ativacao) e aprovado não são reescritos por novo pedido; recusado pode pedir de novo", async () => {
  const clock = controlledClock();
  const open = await seedScope("open");
  const first = await requestVerticalAccessCore({ prisma, tenantId: open.tenantId, workspaceId: open.workspaceId, vertical: "IMOB", userId: open.requester, evaluation: CONTEXT }, clock.deps);
  assert.equal(first.outcome, "requested");
  const before = await rawApproval(open);
  const eventsBefore = (await eventsOf(before!.id)).length;
  for (const evaluation of [CONTEXT, null]) {
    const again = await requestVerticalAccessCore({ prisma, tenantId: open.tenantId, workspaceId: open.workspaceId, vertical: "IMOB", userId: open.other, evaluation }, clock.deps);
    assert.equal(again.outcome, "already_requested");
  }
  assert.deepEqual(await rawApproval(open), before, "linha idêntica (inclusive updated_at e solicitante)");
  assert.equal((await eventsOf(before!.id)).length, eventsBefore);

  const pre = await seedScope("pre");
  await reachAccepted(pre, clock);
  const preBefore = await rawApproval(pre);
  const preAgain = await requestVerticalAccessCore({ prisma, tenantId: pre.tenantId, workspaceId: pre.workspaceId, vertical: "IMOB", userId: pre.requester, evaluation: CONTEXT }, clock.deps);
  assert.equal(preAgain.outcome, "already_requested");
  assert.deepEqual(await rawApproval(pre), preBefore, "pre_ativacao (termos aceitos) não é reescrito");

  const paid = await seedScope("paid");
  const standard = await requestVerticalAccess({ prisma, tenantId: paid.tenantId, workspaceId: paid.workspaceId, vertical: "IMOB", userId: paid.requester });
  await decideVerticalAccess({ prisma, approvalId: (standard as { approval: { id: string } }).approval.id, adminEmail: `${paid.admin}@example.com`, decision: "aprovar", note: "Synthetic" });
  const paidBefore = await rawApproval(paid);
  const paidAgain = await requestVerticalAccessCore({ prisma, tenantId: paid.tenantId, workspaceId: paid.workspaceId, vertical: "IMOB", userId: paid.requester, evaluation: CONTEXT }, clock.deps);
  assert.equal(paidAgain.outcome, "already_approved");
  assert.deepEqual(await rawApproval(paid), paidBefore, "direito legado aprovado preservado");

  // recusado (pela EIAH) pode pedir de novo
  const refused = await seedScope("refused");
  const req = await requestVerticalAccessCore({ prisma, tenantId: refused.tenantId, workspaceId: refused.workspaceId, vertical: "IMOB", userId: refused.requester, evaluation: CONTEXT }, clock.deps);
  const refusal = await decideEvaluationGrantCore({ prisma, approvalId: (req as { approval: { id: string } }).approval.id, adminEmail: `${refused.admin}@example.com`, adminUserId: refused.admin, decision: "recusar", note: "Fora do perfil (synthetic)" }, clock.deps);
  assert.equal(refusal.ok, true);
  assert.equal((await rawApproval(refused))?.status, "recusado");
  assert.notEqual(await usageAt(refused, T0), "full");
  const retry = await requestVerticalAccessCore({ prisma, tenantId: refused.tenantId, workspaceId: refused.workspaceId, vertical: "IMOB", userId: refused.requester, evaluation: CONTEXT }, clock.deps);
  assert.equal(retry.outcome, "requested", "recusa não consome a avaliação");
});

test("recusa pelo solicitante antes da ativação: volta a recusado, nada ativado, avaliação não marcada como usada", async () => {
  const scope = await seedScope("decline");
  const clock = controlledClock();
  await reachAccepted(scope, clock);
  const declined = await declineEvaluationTerms({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester });
  assert.deepEqual(declined, { ok: true, outcome: "declined" });
  const row = await rawApproval(scope);
  assert.deepEqual([row?.status, row?.grant_started_at, row?.evaluation_used_at, row?.grant_closed_reason], ["recusado", null, null, "declined_by_requester"]);
  const activate = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(activate.ok, false);
  assert.equal((await installationOf(scope)).length, 0);
});

// ─── 7. Atomicidade ───────────────────────────────────────────────────────────────────────────────────────────────────
test("atomicidade: falha real na gravação da instalação não deixa o grant ativado (rollback completo)", async () => {
  const scope = await seedScope("atomic");
  const clock = controlledClock();
  const { approvalId } = await reachAccepted(scope, clock);
  // Gatilho REAL no banco descartável, restrito a este tenant: a instalação falha DEPOIS de o grant ser ativado na mesma transação.
  await sql.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION eval_it_fail_install() RETURNS trigger AS $$
    BEGIN
      IF NEW.tenant_id = '${scope.tenantId}' THEN RAISE EXCEPTION 'synthetic installation failure'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await sql.$executeRawUnsafe("DROP TRIGGER IF EXISTS eval_it_fail_install_trg ON tenant_product_installations");
  await sql.$executeRawUnsafe("CREATE TRIGGER eval_it_fail_install_trg BEFORE INSERT OR UPDATE ON tenant_product_installations FOR EACH ROW EXECUTE FUNCTION eval_it_fail_install()");
  const before = await rawApproval(scope);
  const eventsBefore = (await eventsOf(approvalId)).length;
  const result = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(result.ok, false);
  assert.equal((result as { code: string }).code, "WORKSPACE_AGENT_PROVISIONING_FAILED");
  assert.deepEqual(await rawApproval(scope), before, "grant continua pre_ativacao, sem início, validade nem uso (linha idêntica)");
  assert.equal((await eventsOf(approvalId)).length, eventsBefore, "nenhum evento 'activated'");
  assert.equal((await installationOf(scope)).length, 0);
  assert.equal((await policyActionsOf(scope)).length, 0, "nenhuma política provisionada");
  assert.notEqual(await usageAt(scope, clock.now()), "full");
  // removido o defeito, a MESMA aceitação ativa normalmente (nada ficou inconsistente)
  await sql.$executeRawUnsafe("DROP TRIGGER IF EXISTS eval_it_fail_install_trg ON tenant_product_installations");
  const retry = await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps);
  assert.equal(retry.ok, true);
  assert.equal((await rawApproval(scope))?.status, "aprovado");
});

// ─── 8. Datas, validade e cast `::timestamp` com Prisma real ─────────────────────────────────────────────────────────
test("datas: valores gravados em hora UTC (timestamp sem fuso), idênticos ao instante injetado, independentes do fuso do processo e do servidor", async () => {
  const scope = await seedScope("dates");
  const clock = controlledClock(new Date("2026-06-30T23:59:59.999Z")); // virada de dia/mês: expõe deslocamento de fuso
  const { approvalId } = await reachActive(scope, clock, { ...TERMS_INPUT, durationDays: 1 });
  const row = await rawApproval(scope);
  assert.equal(row?.grant_started_at, "2026-06-30 23:59:59.999", "texto armazenado = UTC literal");
  assert.equal(row?.grant_valid_until, "2026-07-01 23:59:59.999");
  const tz = await sql.$queryRaw<Array<{ tz: string }>>`SHOW TimeZone`;
  const access = await accessAt(scope, clock.now());
  assert.equal(access?.grantStartedAt?.toISOString(), "2026-06-30T23:59:59.999Z", `leitura Prisma = instante injetado (TZ do processo=${process.env.TZ}, TimeZone do servidor=${tz[0]?.tz})`);
  assert.equal(access?.grantValidUntil?.toISOString(), "2026-07-01T23:59:59.999Z");
  // fronteira exata contra o SQL de fechamento (`grant_valid_until <= $now::timestamp`)
  const edge = new Date("2026-07-01T23:59:59.999Z");
  assert.equal(await usageAt(scope, new Date(edge.getTime() - 1)), "full");
  assert.equal((await rawApproval(scope))?.status, "aprovado");
  assert.equal(await usageAt(scope, edge), "read_only");
  assert.equal((await rawApproval(scope))?.status, "encerrado", "UPDATE de fechamento com cast ::timestamp casou na fronteira exata");
  assert.equal((await eventsOf(approvalId)).filter((e) => e.to_status === "encerrado").length, 1);
});

// ─── 9. Rotas autenticadas, front door e gate de uso (identidades e permissões de teste) ────────────────────────────────
const id = randomUUID().slice(0, 8);
type Actor = { token: string; userId: string };
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter, chatVerticalsRouter, uploadsRouter);
app.use("/api/imob", imobRouter);
const request = supertest(app);
const auth = (actor: Actor) => `Bearer ${actor.token}`;

async function seedRouteScope(label: string, role: "founder" | "corretor" = "founder") {
  const scope = await seedScope(label);
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = [previousAdmins, `${scope.admin}@example.com`].filter(Boolean).join(",");
  await ensureWorkspaceMembershipForUser({ tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.admin, roleKey: role });
  const mk = (userId: string, name: string): Actor => ({ userId, token: `syn-ev-${name}-${scope.tenantId}-${id}` });
  const requester = mk(scope.requester, "req"), admin = mk(scope.admin, "adm");
  await prisma.apiToken.createMany({ data: [requester, admin].map((actor) => ({ token: actor.token, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: actor.userId })) });
  return { scope, requester, admin };
}
const imobRead = (actor: Actor) => request.get("/api/imob/owners").set("Authorization", auth(actor));
const upload = (actor: Actor) => request.post("/api/uploads").set("Authorization", auth(actor)).field("agentSlug", "imob").attach("files", Buffer.from("documento sintético"), { filename: "doc.txt", contentType: "text/plain" });

test("rotas: com a oferta de PRODUÇÃO desligada, pedido de avaliação e decisão/ativação de grant não concedem nada", async () => {
  const { scope, requester, admin } = await seedRouteScope("routes-off");
  const rejected = await request.post("/api/vertical-access/request").set("Authorization", auth(requester)).send({ vertical: "IMOB", channel: "chat", evaluation: { ...CONTEXT, confirmed: true } });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.error.code, "EVALUATION_OFFER_UNAVAILABLE");
  assert.equal(await rawApproval(scope), null);

  // uma linha de avaliação preparada com a composição de teste: as rotas de produção não a decidem nem a ativam
  const clock = controlledClock(new Date());
  const requested = await requestVerticalAccessCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId: scope.requester, channel: "chat", evaluation: CONTEXT }, clock.deps);
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const decision = await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", auth(admin)).send({ decision: "aprovar", note: "Synthetic", evaluation: TERMS_INPUT });
  assert.equal(decision.status, 409, JSON.stringify(decision.body));
  assert.equal(decision.body.error.code, "EVALUATION_OFFER_UNAVAILABLE");
  assert.equal((await rawApproval(scope))?.status, "aguardando_humano");
  const activate = await request.post("/api/marketplace/installations/activate").set("Authorization", auth(requester)).send({ product: "IMOB" });
  assert.equal(activate.status, 403);
  assert.equal((await installationOf(scope)).length, 0);
  assert.equal((await imobRead(requester)).status, 403, "pedido aberto: sem acesso às APIs do IMOB");
});

test("rotas: legado aprovado sem grant — ativação pelo Marketplace e acesso às APIs preservados", async () => {
  const { scope, requester, admin } = await seedRouteScope("routes-legacy");
  const requested = await request.post("/api/vertical-access/request").set("Authorization", auth(requester)).send({ vertical: "IMOB", channel: "marketplace" });
  assert.equal(requested.status, 201);
  const approvalId = (await rawApproval(scope))!.id;
  const decided = await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", auth(admin)).send({ decision: "aprovar", note: "Synthetic" });
  assert.equal(decided.status, 200);
  assert.equal((await imobRead(requester)).status, 403, "aprovado mas não instalado");
  assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(requester)).send({ product: "IMOB" })).status, 200);
  assert.equal((await imobRead(requester)).status, 200);
  assert.equal((await upload(requester)).status < 300, true);
  const options = await readFrontDoorAccessOptions({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester });
  assert.equal(options.allowed, true, "front door: vertical aprovada permite convidar");
});

test("rotas: grant — nada antes da ativação; leitura e escrita conforme o modo ao fim; front door acompanha a validade (cast ::timestamp, fuso do servidor ≠ UTC)", async () => {
  for (const mode of ["somente_leitura", "bloqueio_total"] as const) {
    const { scope, requester } = await seedRouteScope(`routes-${mode}`);
    const clock = controlledClock(new Date());
    const { approvalId } = await reachAccepted(scope, clock, { ...TERMS_INPUT, closureMode: mode });
    // antes da ativação (termos aceitos): nenhuma leitura, escrita nem convite
    assert.equal((await imobRead(requester)).status, 403, `${mode}: pre_ativacao não lê`);
    assert.equal((await upload(requester)).status, 403, `${mode}: pre_ativacao não escreve`);
    assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(requester)).send({ product: "IMOB" })).status, 403, "ativação de produção continua negada (oferta desligada)");
    assert.equal((await readFrontDoorAccessOptions({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester })).allowed, false);
    // ativação (composição de teste) ⇒ leitura e escrita liberadas
    assert.equal((await activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, clock.deps)).ok, true);
    assert.equal((await imobRead(requester)).status, 200, `${mode}: ativo lê`);
    assert.equal((await upload(requester)).status < 300, true, `${mode}: ativo escreve`);
    assert.equal((await readFrontDoorAccessOptions({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester })).allowed, true);
    // fim por validade (fixture de banco: a rota usa o relógio real): início 3 h atrás e validade 1 h atrás (validade > início, senão os termos seriam inconsistentes). Um deslocamento de fuso de 3 h do cast
    // `::timestamp` faria o front door ainda enxergar o grant como válido.
    await prisma.$executeRaw`UPDATE vertical_access_approvals SET grant_started_at = (NOW() AT TIME ZONE 'UTC') - interval '3 hours', grant_valid_until = (NOW() AT TIME ZONE 'UTC') - interval '1 hour' WHERE id = ${approvalId}`;
    assert.equal((await readFrontDoorAccessOptions({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester })).allowed, false, `${mode}: front door não conta grant vencido (mesmo sem fechamento persistido)`);
    assert.equal((await rawApproval(scope))?.status, "aprovado", "fechamento ainda não persistido: o negado vem da leitura efetiva");
    const read = await imobRead(requester);
    if (mode === "somente_leitura") assert.equal(read.status, 200, "somente leitura: continua lendo");
    else assert.equal(read.status, 403, "bloqueio total: não lê");
    assert.equal((await upload(requester)).status, 403, `${mode}: não escreve depois do fim`);
    assert.equal((await rawApproval(scope))?.status, "encerrado", "a leitura efetiva persistiu o fechamento");
    // também vale para frescor: validade 1 h à frente conta
    await prisma.$executeRaw`UPDATE vertical_access_approvals SET status = 'aprovado', grant_valid_until = (NOW() AT TIME ZONE 'UTC') + interval '1 hour', revocation_mode = NULL, grant_closed_reason = NULL WHERE id = ${approvalId}`;
    assert.equal((await readFrontDoorAccessOptions({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester })).allowed, true, `${mode}: validade futura conta`);
  }
});
