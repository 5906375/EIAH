import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

import { closePrismaResources } from "@repo/db";

import { acceptEvaluationTermsCore, declineEvaluationTerms, decideEvaluationGrantCore } from "../services/products/verticalEvaluation";
import { activateProductInstallationCore, ensureTenantProductInstallationTable } from "../services/products/productActivation";
import { ensureVerticalAccessStore, readVerticalAccess, requestVerticalAccessCore } from "../services/products/verticalAccessApproval";
import { evaluationRequestContextSchema } from "../services/products/verticalEvaluationContract";
import {
  DAY, IMOB_ACTIONS, T0, assertDisposableDatabase, controlledClock, eventsOf, holdRowLock, installationOf, noticeCount, openPgClient,
  pgTsToIso, policyActionsOf, prisma, rawApproval, seedScope, waitUntilBlocked, type Scope,
} from "./support/verticalEvaluationRealDb";

// Concorrência REAL: sessões independentes do PostgreSQL (pool do Prisma + conexões `pg` próprias). A ordem é determinística:
// uma conexão independente segura o `FOR UPDATE` da linha; cada operação concorrente só é liberada depois de o SERVIDOR
// reportar que ela está bloqueada no lock (`pg_stat_activity.wait_event_type = 'Lock'`) — sem sleeps como prova.
assertDisposableDatabase();

const CONTEXT = evaluationRequestContextSchema.parse({ problem: "Organizar cadastro de imóveis", teamSize: 3, expectedOutcome: "Cadastros completos" });
const TERMS = { durationDays: 7, allowedActions: [...IMOB_ACTIONS], closureMode: "somente_leitura" as const };

const clock = controlledClock();
const request = (scope: Scope, evaluation: typeof CONTEXT | null = CONTEXT, deps = clock.deps, userId = scope.requester) =>
  requestVerticalAccessCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", userId, channel: "chat", evaluation }, deps);
const propose = (scope: Scope, approvalId: string, input: Record<string, unknown> = TERMS) =>
  decideEvaluationGrantCore({ prisma, approvalId, adminEmail: `${scope.admin}@example.com`, adminUserId: scope.admin, decision: "aprovar", note: "Synthetic", input }, clock.deps);
const accept = (scope: Scope, termsHash: string) => acceptEvaluationTermsCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, termsHash }, clock.deps);
const activate = (scope: Scope, deps = clock.deps) => activateProductInstallationCore({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester, product: "IMOB" }, deps);
const read = (scope: Scope, now: Date) => readVerticalAccess({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB", now });

async function toAccepted(label: string) {
  const scope = await seedScope(label);
  const requested = await request(scope);
  assert.equal(requested.outcome, "requested");
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const decided = await propose(scope, approvalId);
  assert.equal(decided.ok, true);
  const termsHash = (decided as { termsHash: string }).termsHash;
  assert.deepEqual(await accept(scope, termsHash), { ok: true, outcome: "accepted" });
  return { scope, approvalId, termsHash };
}
async function toActive(label: string, input: Record<string, unknown> = TERMS) {
  const scope = await seedScope(label);
  const requested = await request(scope);
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const decided = await propose(scope, approvalId, input);
  const termsHash = (decided as { termsHash: string }).termsHash;
  await accept(scope, termsHash);
  assert.equal((await activate(scope)).ok, true);
  return { scope, approvalId, termsHash };
}

before(async () => {
  await ensureVerticalAccessStore(prisma);
  await ensureTenantProductInstallationTable(prisma);
});
after(async () => { await closePrismaResources(); });

// ─── 1. Duas ativações simultâneas ──────────────────────────────────────────────────────────────────────────────────
test("duas ativações simultâneas: ambas bloqueadas no lock; efeito único (um início, uma instalação, um evento, políticas sem duplicata)", async () => {
  const { scope, approvalId } = await toAccepted("act2");
  const holder = await holdRowLock(approvalId);
  // relógios distintos: a ativação que vencer o lock define o início; o da segunda NÃO pode reiniciar nem estender
  const first = activate(scope, { ...clock.deps, clock: () => new Date(T0.getTime() + 1_000) });
  await waitUntilBlocked(1);
  const second = activate(scope, { ...clock.deps, clock: () => new Date(T0.getTime() + 9_000) });
  assert.equal(await waitUntilBlocked(2), 2, "as duas ativações estão esperando o lock no servidor");
  assert.equal((await rawApproval(scope))?.status, "pre_ativacao", "nada ativou enquanto o lock está retido");
  await holder.release("rollback");
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  const row = await rawApproval(scope);
  assert.equal(row?.status, "aprovado");
  assert.equal(row?.grant_started_at, "2026-03-10 12:00:01", "início = relógio da ativação vencedora (FIFO do lock)");
  assert.equal(row?.grant_valid_until, "2026-03-17 12:00:01");
  const events = await eventsOf(approvalId);
  assert.equal(events.filter((e) => e.detail?.stage === "activated").length, 1, "um único evento de ativação");
  assert.equal((await installationOf(scope)).length, 1);
  assert.deepEqual((await policyActionsOf(scope)).map((p) => p.actionName), [...IMOB_ACTIONS].sort(), "políticas sem duplicata");
});

// ─── 2. Termos/aceite alterados antes da ativação ─────────────────────────────────────────────────────────────────────
// Depois do aceite o serviço NÃO permite reproposta (só decline/ativação). A revalidação dentro da transação de ativação é
// provada alterando a versão por uma TRANSAÇÃO INDEPENDENTE (a que reescreveria termos/aceite) entre a leitura e o lock.
for (const variant of ["aceite limpo e novo hash", "novo hash com aceite antigo", "aceite apontando para hash antigo"] as const) {
  test(`versão alterada por outra transação antes da ativação (${variant}): a versão antiga NÃO ativa`, async () => {
    const { scope, approvalId, termsHash: oldHash } = await toAccepted(`mutate-${variant.length}`);
    const newHash = "f".repeat(64);
    const holder = await holdRowLock(approvalId);
    const activation = activate(scope); // leu a versão antiga aceita, passou na checagem rápida e espera o lock da linha
    await waitUntilBlocked(1);
    const sqlByVariant = {
      "aceite limpo e novo hash": "UPDATE vertical_access_approvals SET grant_terms_hash = $2, grant_accepted_by = NULL, grant_accepted_at = NULL, grant_accepted_hash = NULL, updated_at = NOW() WHERE id = $1",
      "novo hash com aceite antigo": "UPDATE vertical_access_approvals SET grant_terms_hash = $2, updated_at = NOW() WHERE id = $1",
      "aceite apontando para hash antigo": "UPDATE vertical_access_approvals SET grant_accepted_hash = $2, updated_at = NOW() WHERE id = $1",
    } as const;
    await holder.client.query(sqlByVariant[variant], [approvalId, newHash]);
    await holder.release("commit");
    const result = await activation;
    assert.equal(result.ok, false, JSON.stringify(result));
    const row = await rawApproval(scope);
    assert.deepEqual([row?.status, row?.grant_started_at, row?.evaluation_used_at], ["pre_ativacao", null, null], "nada iniciou");
    assert.equal((await installationOf(scope)).length, 0, "nenhuma instalação");
    assert.equal((await policyActionsOf(scope)).length, 0, "nenhuma política");
    assert.equal((await eventsOf(approvalId)).filter((e) => e.detail?.stage === "activated").length, 0);
    assert.notEqual(oldHash, newHash);
  });
}

test("reproposta (antes do aceite) concorrente ao aceite da versão antiga: o aceite antigo é recusado; só a versão nova, depois de aceita, ativa", async () => {
  const scope = await seedScope("reprop-accept");
  const requested = await request(scope);
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const v1 = await propose(scope, approvalId);
  const oldHash = (v1 as { termsHash: string }).termsHash;
  const holder = await holdRowLock(approvalId);
  const reproposal = propose(scope, approvalId, { ...TERMS, durationDays: 5 }); // 1º na fila
  await waitUntilBlocked(1);
  const staleAccept = accept(scope, oldHash); // 2º: o solicitante aceita a versão que acabou de ser substituída
  await waitUntilBlocked(2);
  await holder.release("rollback");
  const [decision, accepted] = await Promise.all([reproposal, staleAccept]);
  assert.equal(decision.ok, true, JSON.stringify(decision));
  const newHash = (decision as { termsHash: string }).termsHash;
  assert.notEqual(newHash, oldHash);
  assert.deepEqual(accepted, { ok: false, code: "TERMS_MISMATCH" }, "aceite da versão antiga não vale para a nova");
  assert.equal((await rawApproval(scope))?.grant_accepted_hash, null);
  assert.equal((await activate(scope)).ok, false, "sem aceite da versão vigente não ativa");
  assert.deepEqual(await accept(scope, newHash), { ok: true, outcome: "accepted" });
  assert.equal((await activate(scope)).ok, true);
  assert.equal((await rawApproval(scope))?.grant_terms_hash, newHash);
});

test("recusa do solicitante concorrente à ativação: a ativação enfileirada depois é negada; nada ativado", async () => {
  const { scope, approvalId } = await toAccepted("declinerace");
  const holder = await holdRowLock(approvalId);
  const decline = declineEvaluationTerms({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.requester });
  await waitUntilBlocked(1);
  const activation = activate(scope);
  await waitUntilBlocked(2);
  await holder.release("rollback");
  const [declined, activated] = await Promise.all([decline, activation]);
  assert.deepEqual(declined, { ok: true, outcome: "declined" });
  assert.equal(activated.ok, false);
  const row = await rawApproval(scope);
  assert.deepEqual([row?.status, row?.grant_started_at, row?.evaluation_used_at], ["recusado", null, null]);
  assert.equal((await installationOf(scope)).length, 0);
});

test("ordem inversa: ativação primeiro e reproposta depois — a reproposta é negada (grant já ativo) e não reescreve o grant", async () => {
  const { scope, approvalId, termsHash } = await toAccepted("activefirst");
  const holder = await holdRowLock(approvalId);
  const activation = activate(scope);
  await waitUntilBlocked(1);
  const reproposal = propose(scope, approvalId, { ...TERMS, durationDays: 3 });
  await waitUntilBlocked(2);
  await holder.release("rollback");
  const [activated, decision] = await Promise.all([activation, reproposal]);
  assert.equal(activated.ok, true);
  assert.deepEqual([decision.ok, (decision as { code?: string }).code], [false, "NOT_AWAITING_DECISION"]);
  const row = await rawApproval(scope);
  assert.deepEqual([row?.status, row?.grant_terms_hash, row?.grant_accepted_hash], ["aprovado", termsHash, termsHash]);
});

// ─── 3. Renovação/alteração do grant entre a leitura e o UPDATE do pedido ───────────────────────────────────────────────
test("grant renovado entre a leitura (encerrado) e o UPDATE do pedido: a nova versão NÃO é sobrescrita", async () => {
  const { scope, approvalId } = await toActive("renew");
  const afterEnd = new Date(T0.getTime() + 8 * DAY); // validade (7 dias) vencida; a linha crua ainda é `aprovado`
  assert.equal((await rawApproval(scope))?.status, "aprovado");
  const eventsBefore = await eventsOf(approvalId);
  const holder = await holdRowLock(approvalId);
  // pedido PADRÃO (não de avaliação) lê o grant como encerrado e tenta fechar/reescrever: fica bloqueado no lock da linha
  const standardRequest = request(scope, null, { ...clock.deps, clock: () => afterEnd });
  await waitUntilBlocked(1);
  // transação concorrente RENOVA o grant (nova validade e novo início) e confirma
  const renewedStart = new Date(afterEnd.getTime() - 1_000);
  const renewedUntil = new Date(afterEnd.getTime() + 30 * DAY);
  await holder.client.query(
    "UPDATE vertical_access_approvals SET grant_started_at = $2::timestamp, grant_valid_until = $3::timestamp, updated_at = NOW() WHERE id = $1",
    [approvalId, renewedStart.toISOString(), renewedUntil.toISOString()],
  );
  await holder.release("commit");
  const result = await standardRequest;
  assert.equal(result.outcome, "already_approved", JSON.stringify(result));
  const row = await rawApproval(scope);
  assert.equal(row?.status, "aprovado", "a versão renovada permanece aprovada");
  assert.equal(pgTsToIso(row?.grant_valid_until ?? null), renewedUntil.toISOString(), "validade renovada preservada");
  const events = await eventsOf(approvalId);
  assert.equal(events.length, eventsBefore.length, "nenhum evento novo: o pedido não reescreveu a linha");
  assert.equal(events.filter((e) => e.to_status === "pendente").length, eventsBefore.filter((e) => e.to_status === "pendente").length, "nenhum novo pedido gravado");
  assert.equal(events.filter((e) => e.to_status === "encerrado").length, 0, "nem fechou a versão nova");
  assert.equal(await noticeCount(approvalId, "avaliacao_encerrada"), 0);
});

test("controle: sem renovação, o mesmo pedido padrão sobre grant encerrado reescreve a linha normalmente (o guard não bloqueia o caso legítimo)", async () => {
  const { scope, approvalId } = await toActive("noreneW");
  const afterEnd = new Date(T0.getTime() + 8 * DAY);
  const result = await request(scope, null, { ...clock.deps, clock: () => afterEnd });
  assert.equal(result.outcome, "requested");
  const row = await rawApproval(scope);
  assert.equal(row?.status, "aguardando_humano");
  assert.equal(row?.grant_terms_hash, null, "grant anterior limpo da linha (histórico no evento)");
  const events = await eventsOf(approvalId);
  assert.equal(events.filter((e) => e.to_status === "encerrado").length, 1);
  assert.equal(events.filter((e) => e.to_status === "pendente").length, 2, "pedido original + a reescrita");
  assert.ok(events.some((e) => (e.detail as { archivedGrant?: unknown } | null)?.archivedGrant), "grant anterior arquivado no evento");
});

// ─── 4. Fechamentos simultâneos ───────────────────────────────────────────────────────────────────────────────────────────
test("fechamentos simultâneos: 4 leituras vencidas ao mesmo tempo ⇒ uma transição, um evento e um aviso", async () => {
  const { scope, approvalId } = await toActive("close4");
  const afterEnd = new Date(T0.getTime() + 8 * DAY);
  const holder = await holdRowLock(approvalId);
  const readers = [0, 1, 2, 3].map(() => read(scope, afterEnd));
  assert.equal(await waitUntilBlocked(4), 4, "as 4 leituras tentam fechar e esperam no lock");
  await holder.release("rollback");
  const results = await Promise.all(readers);
  for (const row of results) assert.equal(row?.status, "encerrado", "todas veem o acesso encerrado");
  const events = await eventsOf(approvalId);
  assert.equal(events.filter((e) => e.to_status === "encerrado").length, 1, "evento de encerramento uma única vez");
  assert.equal(await noticeCount(approvalId, "avaliacao_encerrada"), 1, "aviso uma única vez");
  const row = await rawApproval(scope);
  assert.deepEqual([row?.status, row?.revocation_mode, row?.grant_closed_reason], ["encerrado", "somente_leitura", "expired"]);
});

// ─── 5. Pedido concorrente ──────────────────────────────────────────────────────────────────────────────────────────────
test("pedidos concorrentes sobre acesso aprovado e sobre pedido aberto: ninguém reescreve a linha", async () => {
  const { scope: active, approvalId } = await toActive("req-active");
  const before = await rawApproval(active);
  const eventsBefore = (await eventsOf(approvalId)).length;
  const results = await Promise.all([0, 1, 2, 3].map((i) => request(active, i % 2 ? CONTEXT : null, clock.deps, i % 2 ? active.other : active.requester)));
  for (const r of results) assert.equal(r.outcome, "already_approved");
  assert.deepEqual(await rawApproval(active), before);
  assert.equal((await eventsOf(approvalId)).length, eventsBefore);

  const open = await seedScope("req-open");
  const first = await request(open);
  assert.equal(first.outcome, "requested");
  const openBefore = await rawApproval(open);
  const openEvents = (await eventsOf(openBefore!.id)).length;
  const again = await Promise.all([0, 1, 2, 3].map((i) => request(open, i % 2 ? CONTEXT : null, clock.deps, i % 2 ? open.other : open.requester)));
  for (const r of again) assert.equal(r.outcome, "already_requested");
  assert.deepEqual(await rawApproval(open), openBefore);
  assert.equal((await eventsOf(openBefore!.id)).length, openEvents);
});

test("pedidos concorrentes sobre pedido recusado: exatamente uma reescrita; as demais veem o pedido aberto", async () => {
  const scope = await seedScope("req-refused");
  const first = await request(scope);
  const approvalId = (first as { approval: { id: string } }).approval.id;
  const refusal = await decideEvaluationGrantCore({ prisma, approvalId, adminEmail: `${scope.admin}@example.com`, adminUserId: scope.admin, decision: "recusar", note: "Fora do perfil (synthetic)" }, clock.deps);
  assert.equal(refusal.ok, true);
  const holder = await holdRowLock(approvalId);
  const racers = [0, 1, 2].map((i) => request(scope, CONTEXT, clock.deps, i === 0 ? scope.requester : scope.other));
  assert.equal(await waitUntilBlocked(3), 3, "os 3 pedidos disputam a linha recusada");
  await holder.release("rollback");
  const outcomes = (await Promise.all(racers)).map((r) => r.outcome).sort();
  assert.deepEqual(outcomes, ["already_requested", "already_requested", "requested"].sort(), "uma reescrita, duas leituras do pedido aberto");
  assert.equal((await rawApproval(scope))?.status, "aguardando_humano");
  const events = await eventsOf(approvalId);
  assert.equal(events.filter((e) => e.to_status === "pendente").length, 2, "pedido original + uma única reescrita");
});

// ─── 6. Corrida de INSERT (primeiro pedido) ─────────────────────────────────────────────────────────────────────────────
test("primeiros pedidos simultâneos (sem linha prévia): um grava, os demais releem e recebem already_requested; sem 23505 ao solicitante", async () => {
  for (const kind of ["padrão", "avaliação", "misto"] as const) {
    const scope = await seedScope(`insert-${kind}`);
    const pick = (i: number) => (kind === "padrão" ? null : kind === "avaliação" ? CONTEXT : i % 2 ? CONTEXT : null);
    const results = await Promise.all([0, 1, 2, 3].map((i) => request(scope, pick(i), clock.deps, i % 2 ? scope.other : scope.requester)));
    assert.deepEqual(results.map((r) => r.outcome).sort(), ["already_requested", "already_requested", "already_requested", "requested"], `${kind}: exatamente um pedido gravado`);
    const rows = await prisma.$queryRaw<Array<{ id: string; n: number; has_context: boolean }>>`
      SELECT id, count(*) OVER ()::int AS n, (request_context IS NOT NULL) AS has_context
      FROM vertical_access_approvals WHERE tenant_id = ${scope.tenantId} AND workspace_id = ${scope.workspaceId} AND vertical = 'IMOB'`;
    assert.equal(rows.length, 1, `${kind}: uma única linha por escopo`);
    const row = await rawApproval(scope);
    assert.equal(row?.status, "aguardando_humano", `${kind}: a linha única termina aguardando decisão`);
    assert.equal(row?.grant_kind === "evaluation", rows[0]?.has_context, `${kind}: tipo e contexto do pedido são coerentes (o do vencedor)`);
    // Só o vencedor grava eventos: um `pendente` e um `aguardando_humano`
    const events = await eventsOf(rows[0]!.id);
    assert.equal(events.filter((e) => e.to_status === "pendente").length, 1, `${kind}: um evento de pedido`);
    assert.equal(events.filter((e) => e.to_status === "aguardando_humano").length, 1, `${kind}: uma pontuação`);
    // Todas as respostas devolvem a MESMA linha
    for (const r of results) assert.equal((r as { approval: { id: string } }).approval.id, rows[0]!.id);
  }
});

test("outras violações de unicidade NÃO são suprimidas: colisão da chave primária (escopo diferente) continua falhando com 23505", async () => {
  const a = await seedScope("pk-a");
  const b = await seedScope("pk-b");
  const original = crypto.randomUUID;
  const fixed = original.call(crypto);
  let armed: string | null = null;
  crypto.randomUUID = ((...args: []) => { if (armed) { const value = armed; armed = null; return value; } return original.apply(crypto, args); }) as typeof crypto.randomUUID;
  try {
    armed = fixed;
    assert.equal((await request(a)).outcome, "requested");
    assert.equal(armed, null, "o primeiro id gerado pelo pedido é o do approval (hipótese do teste)");
    armed = fixed; // o mesmo id para OUTRO escopo ⇒ colide na PK, não no índice do escopo
    await assert.rejects(() => request(b), /23505/);
    assert.equal(armed, null);
  } finally {
    crypto.randomUUID = original;
  }
  assert.equal(await rawApproval(b), null, "nada foi gravado no escopo que colidiu na PK");
  assert.equal((await rawApproval(a))?.id, fixed);
});

// ─── 7. Conexões independentes: sanidade do próprio mecanismo ───────────────────────────────────────────────────────────────
test("mecanismo: o segurador do lock é uma sessão distinta das do pool e o monitor enxerga o bloqueio no servidor", async () => {
  const scope = await seedScope("mech");
  const requested = await request(scope);
  const approvalId = (requested as { approval: { id: string } }).approval.id;
  const holder = await holdRowLock(approvalId);
  const monitor = await openPgClient();
  const pids = await monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const held = await holder.client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  assert.notEqual(pids.rows[0]?.pid, held.rows[0]?.pid, "sessões independentes");
  const blocked = decideEvaluationGrantCore({ prisma, approvalId, adminEmail: `${scope.admin}@example.com`, adminUserId: scope.admin, decision: "recusar", note: "Synthetic" }, clock.deps);
  assert.equal(await waitUntilBlocked(1), 1);
  const waiting = await monitor.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND locktype = 'transactionid' OR (NOT granted AND locktype = 'tuple')");
  assert.ok((waiting.rows[0]?.n ?? 0) >= 1, "pg_locks mostra espera por lock");
  await holder.release("rollback");
  await monitor.end();
  assert.equal((await blocked).ok, true);
});
