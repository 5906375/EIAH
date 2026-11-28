import "./support/testInfraEnv.js";
import assert from "node:assert/strict";
import test from "node:test";

import { getProductProvisionedAgents } from "@eiah/core/catalog/workspaceAgentProvisioning";
import { activateProductInstallationCore } from "../services/products/productActivation";
import { readVerticalAccess, requestVerticalAccessCore } from "../services/products/verticalAccessApproval";
import { acceptEvaluationTermsCore, decideEvaluationGrantCore } from "../services/products/verticalEvaluation";
import {
  buildEvaluationTerms,
  evaluateEvaluationOffer,
  evaluationActionCatalog,
  EVALUATION_MANDATORY_DECISIONS,
  EVALUATION_OFFER_CONFIG_ENV,
  EVALUATION_OFFER_FLAG_ENV,
  hashEvaluationTerms,
  resolveEvaluationOfferState,
  type EvaluationDeps,
  type EvaluationOfferConfig,
  type EvaluationTerms,
} from "../services/products/verticalEvaluationContract";

/**
 * Testes de SERVIÇO com dublês INJETADOS (prisma simulado em memória, relógio controlado, oferta por fixture). Provam ordem e
 * condições das operações (trava, releitura, UPDATE condicional, ausência de escrita quando bloqueado). NÃO provam SQL contra o
 * Postgres, o Prisma real, rotas autenticadas nem comportamento em staging: isso exige o banco real (integração).
 */

const catalog = [...evaluationActionCatalog()];
const CONFIG: EvaluationOfferConfig = {
  vertical: "IMOB", maxDurationDays: 30, allowedActions: catalog.slice(0, 2), closureModes: ["somente_leitura", "bloqueio_total"],
  conditions: { version: "c1", text: "Condições de teste." },
};
const ENV = { [EVALUATION_OFFER_FLAG_ENV]: "true", [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify(CONFIG) };
const ratified = EVALUATION_MANDATORY_DECISIONS.map((decision) => ({ ...decision, status: "ratified" as const }));
const ENABLED = evaluateEvaluationOffer({ env: ENV, decisions: ratified });
const BLOCKED = resolveEvaluationOfferState(ENV); // configuração completa, decisões obrigatórias reais pendentes
const SCOPE = { tenantId: "t1", workspaceId: "w1" };
const T = (minute: number) => new Date(Date.UTC(2026, 10, 13, 12, minute, 0));
const DAY = 86_400_000;

function clockOf(...instants: Date[]) {
  let index = 0;
  return () => instants[Math.min(index++, instants.length - 1)]!;
}
const deps = (offer = ENABLED, clock = clockOf(T(0))): EvaluationDeps => ({ offer: () => offer, clock });

function makeTerms(over: Partial<EvaluationTerms> = {}): EvaluationTerms {
  const built = buildEvaluationTerms({
    scope: SCOPE, requestedByUserId: "u-req",
    requestContext: { problem: "p", teamSize: 4, expectedOutcome: "o" },
    input: { durationDays: 10, allowedActions: [catalog[0]], closureMode: "somente_leitura" },
    decidedBy: "admin:a", decidedAt: T(0), offer: CONFIG,
  });
  assert.ok(built.ok);
  return { ...built.terms, ...over };
}

function dbRow(over: Record<string, unknown> = {}) {
  const terms = makeTerms();
  const hash = hashEvaluationTerms(terms);
  return {
    id: "ap1", ...SCOPE, vertical: "IMOB", status: "pre_ativacao", source: "request", revocationMode: null,
    requestedByUserId: "u-req", requestedAt: T(0), decidedBy: "admin:a", decidedAt: T(1), note: null, score: 55, recommendation: "revisar",
    scoreReasons: null, scoreRuleVersion: null, updatedAt: T(1), requestContext: { problem: "p", teamSize: 4, expectedOutcome: "o" },
    grantKind: "evaluation", grantTerms: terms, grantTermsHash: hash, grantAcceptedBy: "u-req", grantAcceptedAt: T(2), grantAcceptedHash: hash,
    grantStartedAt: null, grantValidUntil: null, grantClosedReason: null, evaluationUsedAt: null,
    ...over,
  };
}

type Call = { kind: "exec" | "query" | "ddl"; sql: string; values: unknown[] };

function fakePrisma(handlers: {
  /** Linhas para `SELECT ... FROM vertical_access_approvals`: `lock` = com FOR UPDATE; senão leitura simples/por id. */
  row?: (kind: "lock" | "read") => Record<string, unknown> | null;
  /** Linhas de `tenant_product_installations`. */
  installation?: () => Record<string, unknown> | null;
  /** Retorno (linhas afetadas) por trecho do SQL; padrão 1. */
  affected?: (sql: string) => number | undefined;
}) {
  const calls: Call[] = [];
  const policies: Array<{ actionName: string; allowed: boolean }> = [];
  const agentMetadata: Array<{ agent: string; version: string }> = getProductProvisionedAgents("IMOB").map((agent) => ({ agent: agent.agentKey, version: "1.0.0" }));
  const assignments: Array<Record<string, unknown>> = [];
  const sqlOf = (strings: TemplateStringsArray) => strings.join("?").replace(/\s+/g, " ").trim();
  const client: Record<string, unknown> = {
    calls,
    policies,
    $executeRawUnsafe: async (sql: string) => { calls.push({ kind: "ddl", sql, values: [] }); return 0; },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlOf(strings);
      calls.push({ kind: "exec", sql, values });
      return handlers.affected?.(sql) ?? 1;
    },
    $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
      const compact = sql.replace(/\s+/g, " ");
      calls.push({ kind: "query", sql: compact, values });
      if (/FROM vertical_access_approvals/.test(compact)) {
        const row = handlers.row?.(/FOR UPDATE/.test(compact) ? "lock" : "read") ?? null;
        return row ? [row] : [];
      }
      return [];
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlOf(strings);
      calls.push({ kind: "query", sql, values });
      if (/FROM tenant_product_installations/.test(sql)) {
        const installation = handlers.installation?.() ?? null;
        return installation ? [installation] : [];
      }
      return [];
    },
    $transaction: async (work: (tx: unknown) => unknown) => work(client),
    tenantActionPolicy: { findMany: async () => [], create: async ({ data }: { data: { actionName: string; allowed: boolean } }) => { policies.push(data); return data; } },
    // mesmos formatos que o provisionamento real consulta (ver workspace-agent-provisioning.test.ts): metadados com versão por agente
    agentMetadata: {
      findUnique: async ({ where }: { where: { agent: string } }) => agentMetadata.find((item) => item.agent === where.agent) ?? null,
      findMany: async () => agentMetadata.map((item) => ({ agent: item.agent })),
      create: async ({ data }: { data: { agent: string; version: string } }) => { agentMetadata.push(data); return data; },
    },
    agentProfile: { findUnique: async () => null, findMany: async () => [] },
    workspaceAgentAssignment: {
      findMany: async () => assignments,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `a${assignments.length + 1}`, signedByUserId: null, signedAt: null, signatureRef: null, ...data }; assignments.push(row); return row; },
    },
  };
  return client as typeof client & { calls: Call[]; policies: typeof policies };
}

const writes = (calls: Call[], pattern: RegExp) => calls.filter((call) => call.kind === "exec" && pattern.test(call.sql));
const INSTALLED = { tenantId: "t1", workspaceId: "w1", product: "IMOB", status: "active", activatedAt: T(0), activatedByUserId: "u-req" };
const activationParams = (prisma: unknown) => ({ prisma: prisma as never, ...SCOPE, userId: "u-req", product: "IMOB" as const });

// ─── Ativação ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("ativação: relê e trava a concessão DENTRO da transação; o início do prazo é o instante capturado DEPOIS da trava", async () => {
  const prisma = fakePrisma({ row: () => dbRow(), installation: () => INSTALLED });
  // 1ª leitura do relógio = checagem prévia (T0); 2ª = depois da trava (T7): é o início efetivo.
  const result = await activateProductInstallationCore(activationParams(prisma), deps(ENABLED, clockOf(T(0), T(7))));
  assert.equal(result.ok, true, JSON.stringify(result, (_k, v) => (v instanceof Error ? v.message : v)));
  const order = prisma.calls.map((call) => (call.kind === "query" && /FOR UPDATE/.test(call.sql) ? "lock" : call.kind === "exec" && /SET status = 'aprovado'/.test(call.sql) ? "start" : call.kind === "exec" && /INSERT INTO tenant_product_installations/.test(call.sql) ? "install" : null)).filter(Boolean);
  assert.deepEqual(order, ["lock", "start", "install"]);
  const [start] = writes(prisma.calls, /SET status = 'aprovado'/);
  assert.ok(start);
  const dates = start!.values.filter((value): value is Date => value instanceof Date);
  assert.equal(dates[0]!.getTime(), T(7).getTime(), "grant_started_at = instante após a trava");
  assert.equal(dates[1]!.getTime(), T(7).getTime() + 10 * DAY, "valid_until = início + duração dos termos");
  assert.deepEqual(prisma.policies.map((policy) => policy.actionName), [catalog[0]], "só o subconjunto aceito, dentro do catálogo");
});

test("ativação: mudança concorrente dos termos entre a checagem e a trava NEGA e não escreve nada", async () => {
  const changed = makeTerms({ durationDays: 20 });
  const prisma = fakePrisma({
    // a leitura simples ainda vê os termos aceitos; a releitura com trava já vê termos novos (reproposta) com o aceite antigo
    row: (kind) => (kind === "lock" ? dbRow({ grantTerms: changed, grantTermsHash: hashEvaluationTerms(changed) }) : dbRow()),
    installation: () => INSTALLED,
  });
  const result = await activateProductInstallationCore(activationParams(prisma), deps(ENABLED, clockOf(T(0), T(7))));
  assert.deepEqual({ ok: result.ok, code: (result as { code?: string }).code, reason: (result as { reason?: string }).reason }, { ok: false, code: "VERTICAL_NOT_APPROVED", reason: "accepted_hash_mismatch" });
  assert.equal(writes(prisma.calls, /vertical_access_approvals|tenant_product_installations/).length, 0);
  assert.equal(prisma.policies.length, 0);
});

test("ativação: configuração incompleta ou decisões obrigatórias pendentes (chamada interna) não concedem nada", async () => {
  for (const offer of [BLOCKED, resolveEvaluationOfferState({}), evaluateEvaluationOffer({ env: { [EVALUATION_OFFER_FLAG_ENV]: "true" }, decisions: ratified })]) {
    const prisma = fakePrisma({ row: () => dbRow(), installation: () => INSTALLED });
    const result = await activateProductInstallationCore(activationParams(prisma), deps(offer));
    assert.equal((result as { reason?: string }).reason, "offer_unavailable");
    assert.equal(writes(prisma.calls, /./).length, 0, "nenhuma escrita");
  }
});

test("ativação: aprovação humana sem aceite não ativa", async () => {
  const prisma = fakePrisma({ row: () => dbRow({ grantAcceptedAt: null, grantAcceptedHash: null, grantAcceptedBy: null }), installation: () => null });
  const result = await activateProductInstallationCore(activationParams(prisma), deps());
  assert.equal((result as { reason?: string }).reason, "terms_not_accepted");
  assert.equal(writes(prisma.calls, /./).length, 0);
});

test("ativação repetida: só é sucesso com instalação ATIVA e grant válido; instalação inativa reinstala sem tocar no grant", async () => {
  const startedAt = T(10);
  const activeRow = dbRow({ status: "aprovado", grantStartedAt: startedAt, grantValidUntil: new Date(startedAt.getTime() + 10 * DAY) });
  // instalação ativa + grant válido: idempotente, nenhuma escrita
  const idempotent = fakePrisma({ row: () => activeRow, installation: () => INSTALLED });
  assert.equal((await activateProductInstallationCore(activationParams(idempotent), deps(ENABLED, clockOf(T(20))))).ok, true);
  assert.equal(writes(idempotent.calls, /./).length, 0);
  // instalação INATIVA + grant válido: a existência da instalação não basta; reinstala, sem reiniciar nem estender o grant
  const inactive = fakePrisma({ row: () => activeRow, installation: () => ({ ...INSTALLED, status: "inactive" }) });
  await activateProductInstallationCore(activationParams(inactive), deps(ENABLED, clockOf(T(20), T(21))));
  assert.equal(writes(inactive.calls, /SET status = 'aprovado'/).length, 0, "não reinicia o prazo");
  assert.equal(writes(inactive.calls, /INSERT INTO tenant_product_installations/).length, 1, "reinstala");
  // grant VENCIDO + instalação ativa: não é sucesso
  const expired = fakePrisma({ row: () => activeRow, installation: () => INSTALLED });
  const denied = await activateProductInstallationCore(activationParams(expired), deps(ENABLED, clockOf(new Date(startedAt.getTime() + 11 * DAY))));
  assert.equal(denied.ok, false);
});

test("ativação: conflito concorrente só é sucesso idempotente com instalação ATIVA e grant efetivamente válido", async () => {
  let activated = false;
  const startedAt = T(8);
  const row = () => (activated ? dbRow({ status: "aprovado", grantStartedAt: startedAt, grantValidUntil: new Date(startedAt.getTime() + 10 * DAY) }) : dbRow());
  const lostRace = (installation: () => Record<string, unknown> | null) =>
    fakePrisma({
      row: (kind) => (kind === "lock" ? dbRow() : row()),
      installation,
      affected: (sql) => {
        if (/SET status = 'aprovado'/.test(sql)) { activated = true; return 0; } // outro processo ativou primeiro
        return undefined;
      },
    });
  activated = false;
  const ok = await activateProductInstallationCore(activationParams(lostRace(() => INSTALLED)), deps(ENABLED, clockOf(T(0), T(7), T(9))));
  assert.equal(ok.ok, true, "instalação ativa + grant válido");
  activated = false;
  const noInstallation = await activateProductInstallationCore(activationParams(lostRace(() => null)), deps(ENABLED, clockOf(T(0), T(7), T(9))));
  assert.deepEqual({ ok: noInstallation.ok, reason: (noInstallation as { reason?: string }).reason }, { ok: false, reason: "activation_conflict" }, "a existência do grant sem instalação não basta");
  activated = false;
  const inactiveInstallation = await activateProductInstallationCore(activationParams(lostRace(() => ({ ...INSTALLED, status: "inactive" }))), deps(ENABLED, clockOf(T(0), T(7), T(9))));
  assert.equal(inactiveInstallation.ok, false, "instalação inativa não basta");
});

test("ativação: acesso sem grant de avaliação segue o caminho legado (aprovado ativa; demais negam)", async () => {
  const legacy = fakePrisma({ row: () => dbRow({ grantKind: null, grantTerms: null, grantTermsHash: null, status: "aprovado", grantAcceptedHash: null, grantAcceptedAt: null }), installation: () => INSTALLED });
  const result = await activateProductInstallationCore(activationParams(legacy), deps(BLOCKED));
  assert.equal(result.ok, true, `oferta bloqueada não afeta acesso pago/existente: ${JSON.stringify(result, (_k, v) => (v instanceof Error ? v.message : v))}`);
  assert.equal(writes(legacy.calls, /SET status = 'aprovado'/).length, 0, "não toca em linhas de liberação");
  const denied = fakePrisma({ row: () => dbRow({ grantKind: null, status: "recusado" }), installation: () => null });
  assert.equal((await activateProductInstallationCore(activationParams(denied), deps())).ok, false);
});

// ─── Pedido ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("pedido de avaliação: oferta desligada/bloqueada (chamada interna) não grava nada", async () => {
  for (const offer of [BLOCKED, resolveEvaluationOfferState({})]) {
    const prisma = fakePrisma({ row: () => null });
    const result = await requestVerticalAccessCore({ prisma: prisma as never, ...SCOPE, vertical: "IMOB", userId: "u-req", evaluation: { problem: "p", teamSize: 3, expectedOutcome: "o" } }, deps(offer));
    assert.deepEqual(result, { outcome: "evaluation_unavailable" });
    assert.equal(prisma.calls.length, 0, "nem leitura nem escrita");
  }
});

test("novo pedido após avaliação ENCERRADA mantém a restrição (modo efetivo gravado) e arquiva o grant; não restaura acesso", async () => {
  const startedAt = T(10);
  const expiredRow = dbRow({ status: "aprovado", grantStartedAt: startedAt, grantValidUntil: new Date(startedAt.getTime() + 10 * DAY), evaluationUsedAt: startedAt });
  const prisma = fakePrisma({ row: () => expiredRow });
  const after = new Date(startedAt.getTime() + 11 * DAY);
  await requestVerticalAccessCore({ prisma: prisma as never, ...SCOPE, vertical: "IMOB", userId: "u-req" }, deps(ENABLED, clockOf(after)));
  const update = writes(prisma.calls, /SET status = 'pendente'/)[0];
  assert.ok(update, "UPDATE do novo pedido");
  assert.ok(update!.values.includes("somente_leitura"), "revocation_mode = modo efetivo do encerramento (a linha crua ainda dizia aprovado)");
  assert.match(update!.sql, /status IN \('recusado', 'revogado', 'encerrado'\)/);
  // a leitura do grant vencido persistiu o fechamento (evento próprio); o evento do PEDIDO é o que carrega o grant arquivado
  const events = writes(prisma.calls, /INSERT INTO vertical_access_approval_events/);
  assert.ok(events.some((event) => event.values.some((value) => typeof value === "string" && value.includes("\"reason\":\"expired\""))), "fechamento persistido com motivo");
  assert.ok(events.some((event) => event.values.some((value) => typeof value === "string" && value.includes("archivedGrant"))), "histórico: grant anterior arquivado no evento do pedido");
  // e uma NOVA avaliação não se repete
  const again = await requestVerticalAccessCore({ prisma: fakePrisma({ row: () => expiredRow }) as never, ...SCOPE, vertical: "IMOB", userId: "u-req", evaluation: { problem: "p", teamSize: 3, expectedOutcome: "o" } }, deps(ENABLED, clockOf(after)));
  assert.equal(again.outcome, "evaluation_already_used");
});

test("pedido sobre acesso aprovado/pago nunca reescreve a linha", async () => {
  const paid = dbRow({ grantKind: null, status: "aprovado", grantTerms: null, grantTermsHash: null, grantAcceptedHash: null });
  const prisma = fakePrisma({ row: () => paid });
  const result = await requestVerticalAccessCore({ prisma: prisma as never, ...SCOPE, vertical: "IMOB", userId: "u-req", evaluation: { problem: "p", teamSize: 3, expectedOutcome: "o" } }, deps());
  assert.equal(result.outcome, "already_approved");
  assert.equal(writes(prisma.calls, /vertical_access_approvals/).length, 0);
});

// ─── Fechamento regular (validade) ──────────────────────────────────────────────────────────────────────────────────
test("fechamento: relê com trava, reavalia e só fecha a VERSÃO avaliada do grant; grant renovado não é fechado por avaliação antiga", async () => {
  const startedAt = T(10);
  const validUntil = new Date(startedAt.getTime() + 10 * DAY);
  const stale = dbRow({ status: "aprovado", grantStartedAt: startedAt, grantValidUntil: validUntil });
  const after = new Date(validUntil.getTime() + 1000);
  // (a) mesma versão: fecha, com versão (hash, início, validade) e condição de vencimento no UPDATE; evento + aviso
  const same = fakePrisma({ row: () => stale });
  const read = await readVerticalAccess({ prisma: same as never, ...SCOPE, vertical: "IMOB", now: after });
  assert.equal(read?.status, "encerrado", "a negação vale mesmo antes da escrita");
  const close = writes(same.calls, /SET status = 'encerrado'/)[0];
  assert.ok(close);
  assert.match(close!.sql, /grant_terms_hash IS NOT DISTINCT FROM/);
  assert.match(close!.sql, /grant_started_at IS NOT DISTINCT FROM/);
  assert.match(close!.sql, /grant_valid_until IS NOT DISTINCT FROM/);
  assert.match(close!.sql, /grant_valid_until <=/);
  assert.equal(writes(same.calls, /INSERT INTO vertical_access_approval_events/).length, 1);
  // (b) a releitura com trava já vê um grant RENOVADO e válido: nada é fechado
  const renewedUntil = new Date(after.getTime() + 5 * DAY);
  const renewed = fakePrisma({ row: (kind) => (kind === "lock" ? dbRow({ status: "aprovado", grantStartedAt: new Date(after.getTime() - 1000), grantValidUntil: renewedUntil }) : stale) });
  await readVerticalAccess({ prisma: renewed as never, ...SCOPE, vertical: "IMOB", now: after });
  assert.equal(writes(renewed.calls, /SET status = 'encerrado'/).length, 0);
  // (c) o UPDATE não altera nenhuma linha (outro processo fechou antes): sem evento duplicado
  const raced = fakePrisma({ row: () => stale, affected: (sql) => (/SET status = 'encerrado'/.test(sql) ? 0 : undefined) });
  await readVerticalAccess({ prisma: raced as never, ...SCOPE, vertical: "IMOB", now: after });
  assert.equal(writes(raced.calls, /INSERT INTO vertical_access_approval_events/).length, 0);
  // (d) falha de escrita não reabre o acesso
  const failing = fakePrisma({ row: () => stale });
  (failing as unknown as { $transaction: unknown }).$transaction = async () => { throw new Error("db down"); };
  assert.equal((await readVerticalAccess({ prisma: failing as never, ...SCOPE, vertical: "IMOB", now: after }))?.status, "encerrado");
});

// ─── Decisão e aceite: concorrência e idempotência ──────────────────────────────────────────────────────────────────
const decisionParams = (prisma: unknown) => ({
  prisma: prisma as never, approvalId: "ap1", adminEmail: "a@eiah.test", adminUserId: "u-admin", decision: "aprovar" as const,
  input: { durationDays: 10, allowedActions: [catalog[0]], closureMode: "somente_leitura" },
});
const awaiting = () => dbRow({ status: "aguardando_humano", grantTerms: null, grantTermsHash: null, grantAcceptedAt: null, grantAcceptedHash: null, grantAcceptedBy: null });

test("decisão: aprovar propõe termos (pre_ativacao, sem aceite, sem ativação); oferta bloqueada não concede; UPDATE condicional", async () => {
  const prisma = fakePrisma({ row: () => awaiting() });
  const result = await decideEvaluationGrantCore(decisionParams(prisma), deps(ENABLED, clockOf(T(3))));
  assert.equal(result.ok && result.outcome, "terms_proposed");
  const update = writes(prisma.calls, /SET status = 'pre_ativacao'/)[0];
  assert.ok(update);
  assert.match(update!.sql, /grant_accepted_at = NULL/);
  assert.match(update!.sql, /WHERE id = \? AND status = \?::text AND grant_accepted_at IS NULL AND grant_kind = 'evaluation'/);
  assert.equal(writes(prisma.calls, /tenant_product_installations/).length, 0, "aprovar não instala nada");
  const blocked = fakePrisma({ row: () => awaiting() });
  assert.deepEqual(await decideEvaluationGrantCore(decisionParams(blocked), deps(BLOCKED)), { ok: false, code: "OFFER_UNAVAILABLE" });
  assert.equal(writes(blocked.calls, /./).length, 0);
});

test("decisão e aceite: UPDATE sem linha afetada vira CONFLICT, sem evento nem aviso", async () => {
  const lost = fakePrisma({ row: () => awaiting(), affected: () => 0 });
  assert.deepEqual(await decideEvaluationGrantCore(decisionParams(lost), deps()), { ok: false, code: "CONFLICT" });
  assert.equal(writes(lost.calls, /INSERT INTO vertical_access_approval_events|vertical_access_notices/).length, 0);
  const proposed = dbRow({ grantAcceptedAt: null, grantAcceptedHash: null, grantAcceptedBy: null });
  const hash = proposed.grantTermsHash as string;
  const acceptLost = fakePrisma({ row: () => proposed, affected: () => 0 });
  assert.deepEqual(await acceptEvaluationTermsCore({ prisma: acceptLost as never, ...SCOPE, userId: "u-req", termsHash: hash }, deps()), { ok: false, code: "CONFLICT" });
  assert.equal(writes(acceptLost.calls, /INSERT INTO vertical_access_approval_events/).length, 0);
});

test("aceite: idempotente para o mesmo hash/usuário, só do solicitante, só do hash vigente, e NÃO ativa (nenhuma instalação)", async () => {
  const proposed = dbRow({ grantAcceptedAt: null, grantAcceptedHash: null, grantAcceptedBy: null });
  const hash = proposed.grantTermsHash as string;
  const ok = fakePrisma({ row: () => proposed });
  assert.deepEqual(await acceptEvaluationTermsCore({ prisma: ok as never, ...SCOPE, userId: "u-req", termsHash: hash }, deps(ENABLED, clockOf(T(4)))), { ok: true, outcome: "accepted" });
  assert.equal(writes(ok.calls, /tenant_product_installations|SET status = 'aprovado'/).length, 0, "aceitar não ativa nem libera uso");
  assert.equal(writes(ok.calls, /SET grant_accepted_by/).length, 1);
  const again = fakePrisma({ row: () => dbRow() });
  assert.deepEqual(await acceptEvaluationTermsCore({ prisma: again as never, ...SCOPE, userId: "u-req", termsHash: hash }, deps()), { ok: true, outcome: "already_accepted" });
  assert.equal(writes(again.calls, /./).length, 0);
  assert.equal((await acceptEvaluationTermsCore({ prisma: fakePrisma({ row: () => proposed }) as never, ...SCOPE, userId: "u-outro", termsHash: hash }, deps()) as { code?: string }).code, "NOT_REQUESTER");
  assert.equal((await acceptEvaluationTermsCore({ prisma: fakePrisma({ row: () => proposed }) as never, ...SCOPE, userId: "u-req", termsHash: "d".repeat(64) }, deps()) as { code?: string }).code, "TERMS_MISMATCH");
  assert.equal((await acceptEvaluationTermsCore({ prisma: fakePrisma({ row: () => proposed }) as never, ...SCOPE, userId: "u-req", termsHash: hash }, deps(BLOCKED)) as { code?: string }).code, "OFFER_UNAVAILABLE");
});

// ─── Pedido: integração do planejador com o fluxo real ──────────────────────────────────────────────────────────────
const standardRequest = (prisma: unknown, clock = clockOf(T(30))) =>
  requestVerticalAccessCore({ prisma: prisma as never, ...SCOPE, vertical: "IMOB", userId: "u-req" }, deps(ENABLED, clock));
const evaluationRequest = (prisma: unknown, offer = ENABLED, clock = clockOf(T(30))) =>
  requestVerticalAccessCore({ prisma: prisma as never, ...SCOPE, vertical: "IMOB", userId: "u-req", evaluation: { problem: "p", teamSize: 3, expectedOutcome: "o" } }, deps(offer, clock));

test("pedido: pedido ABERTO (inclusive pre_ativacao) nunca é reescrito, com ou sem avaliação", async () => {
  for (const status of ["pendente", "em_analise", "aguardando_humano", "pre_ativacao"]) {
    for (const request of [standardRequest, evaluationRequest]) {
      const prisma = fakePrisma({ row: () => dbRow({ status }) });
      const result = await request(prisma);
      assert.equal(result.outcome, "already_requested", status);
      assert.equal(writes(prisma.calls, /vertical_access_approvals|vertical_access_approval_events/).length, 0, `${status}: nenhuma escrita`);
    }
  }
});

test("pedido: termos INCONSISTENTES (linha crua ainda 'aprovado', validade futura) encerram e o novo pedido mantém o bloqueio total", async () => {
  const startedAt = T(10);
  const broken = dbRow({ status: "aprovado", grantAcceptedHash: null, grantStartedAt: startedAt, grantValidUntil: new Date(startedAt.getTime() + 10 * DAY), evaluationUsedAt: startedAt });
  const prisma = fakePrisma({ row: () => broken });
  const result = await standardRequest(prisma, clockOf(T(11)));
  assert.equal(result.outcome, "requested", "o pedido padrão após o encerramento é possível (continuidade humana)");
  const update = writes(prisma.calls, /SET status = 'pendente'/)[0];
  assert.ok(update, "o UPDATE foi emitido (antes desta correção nenhuma cláusula o cobria)");
  assert.ok(update!.values.includes("bloqueio_total"), "revocation_mode = bloqueio total (inconsistência nunca devolve uso pleno)");
  assert.ok(update!.values.includes("encerrado"), "a guarda declara que a leitura efetiva foi 'encerrado'");
  assert.ok(update!.values.includes(broken.grantTermsHash), "guarda por versão: hash");
  assert.ok(update!.values.some((value) => value instanceof Date && value.getTime() === startedAt.getTime()), "guarda por versão: início");
  assert.match(update!.sql, /grant_terms_hash IS NOT DISTINCT FROM/);
  assert.match(update!.sql, /grant_valid_until IS NOT DISTINCT FROM/);
});

test("pedido: se a linha mudou depois da leitura, o resultado segue o planejador (não um rótulo genérico)", async () => {
  // o UPDATE não altera nada porque, entre a leitura e a escrita, o acesso passou a APROVADO (pago)
  let reads = 0;
  const paid = dbRow({ grantKind: null, status: "aprovado", grantTerms: null, grantTermsHash: null, grantAcceptedHash: null, grantAcceptedAt: null });
  const prisma = fakePrisma({ row: () => (reads++ === 0 ? dbRow({ status: "recusado", grantKind: null }) : paid), affected: (sql) => (/SET status = 'pendente'/.test(sql) ? 0 : undefined) });
  assert.equal((await standardRequest(prisma)).outcome, "already_approved");
  // ou passou a aberto
  reads = 0;
  const open = fakePrisma({ row: () => (reads++ === 0 ? dbRow({ status: "recusado", grantKind: null }) : dbRow({ status: "aguardando_humano", grantKind: null })), affected: (sql) => (/SET status = 'pendente'/.test(sql) ? 0 : undefined) });
  assert.equal((await standardRequest(open)).outcome, "already_requested");
  // linha ainda pedível mas o UPDATE não a alterou: falha explícita
  const stuck = fakePrisma({ row: () => dbRow({ status: "recusado", grantKind: null }), affected: (sql) => (/SET status = 'pendente'/.test(sql) ? 0 : undefined) });
  await assert.rejects(() => standardRequest(stuck), /VERTICAL_ACCESS_WRITE_FAILED/);
});

test("pedido: acesso SEM grant segue o fluxo legado (recusado/revogado reabrem; modo de revogação mantido)", async () => {
  for (const [status, mode] of [["recusado", null], ["revogado", "somente_leitura"], ["revogado", "bloqueio_total"]] as const) {
    const prisma = fakePrisma({ row: () => dbRow({ grantKind: null, grantTerms: null, grantTermsHash: null, grantAcceptedHash: null, grantAcceptedAt: null, status, revocationMode: mode }) });
    const result = await standardRequest(prisma);
    assert.equal(result.outcome, "requested", `${status}/${mode}`);
    const update = writes(prisma.calls, /SET status = 'pendente'/)[0]!;
    assert.ok(update.values.includes(mode), "o modo de revogação anterior é mantido");
    assert.equal(update.values.includes(null) || mode === null, true);
  }
});
