import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";

import { PrismaClient, closePrismaResources } from "@repo/db";
import type { ImobPropertyCaptureRequest } from "@eiah/contracts";

import { PropertyCaptureActiveError, hasActivePropertyCapture, openPropertyCapture, PROPERTY_CAPTURE_SESSION } from "../services/imob/imobChatConversationManagement";
import { resolveImobPropertyGuidedCapture, withGuidedPropertySave } from "../services/imob/intake/imobPropertyGuidedCapture";
import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import { assertDisposableDatabase, openPgClient, prisma, seedScope, type Scope } from "./support/verticalEvaluationRealDb";

/**
 * Validação transacional REAL da admissão da interpretação única da coleta guiada de imóvel (PostgreSQL real, sem dublê do banco).
 *
 * Exercita a implementação de produção (`resolveImobPropertyGuidedCapture` + `withPropertyCaptureLock` + `MemoryEvent`). Só o TRANSPORTE do
 * provider é um dublê determinístico, sem rede, que conta quantas invocações foram autorizadas.
 *
 * Instâncias independentes: `prismaGlobal` (A), um PrismaClient com pool `pg` próprio (B) e um terceiro, criado depois do consumo (C).
 * Cada transação concorrente ocupa uma sessão PostgreSQL distinta. A ordem é provocada por um segurador do advisory lock numa conexão
 * `pg` independente e por consulta ao SERVIDOR (`pg_locks`), sem sleeps como prova.
 *
 * Só roda contra banco DESCARTÁVEL (mesma guarda dos demais testes de integração reais). NÃO prova isolamento entre PROCESSOS do sistema
 * operacional, provider real, rota HTTP nem navegador. Procedimento: seção "Validação transacional isolada" de
 * ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md. Execução: TSX_TSCONFIG_PATH=tsconfig.base.json NODE_ENV=test
 * node --import tsx --test --test-concurrency=1 --test-force-exit <este arquivo>, com DATABASE_URL e EIAH_DISPOSABLE_INFRA=1 do executor descartável.
 */
assertDisposableDatabase();

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const dbRequire = createRequire(path.join(repoRoot, "packages/db/package.json"));
const { Pool } = dbRequire("pg") as { Pool: new (config: { connectionString: string }) => { end(): Promise<void> } };
const { PrismaPg } = dbRequire("@prisma/adapter-pg") as { PrismaPg: new (pool: unknown) => unknown };

type Db = PrismaClient;
const extraResources: Array<() => Promise<void>> = [];
/** Instância independente: PrismaClient + pool `pg` próprios (sessões PostgreSQL distintas das de `prismaGlobal`). */
function independentInstance(): Db {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) as never, log: ["error"] });
  extraResources.push(async () => { await client.$disconnect(); await pool.end(); });
  return client;
}
const A = prisma as unknown as Db;
const B = independentInstance();
after(async () => {
  // Evidência de concorrência efetiva: nº de sessões que o SERVIDOR viu esperando o advisory lock em cada sincronização.
  console.log(`LOCK-WAIT-EVIDENCE observacoes=${JSON.stringify(lockWaitObservations)} maximo=${Math.max(0, ...lockWaitObservations)}`);
  for (const dispose of extraResources.splice(0)) await dispose();
  await closePrismaResources();
});

type CaptureScope = { tenantId: string; workspaceId: string; userId: string };
const scopeOf = (s: Scope, user: "requester" | "other" = "requester"): CaptureScope => ({ tenantId: s.tenantId, workspaceId: s.workspaceId, userId: s[user] });
const origin = (formId: string) => ({ formId, contextRef: "v1:it-ctx", draftVersion: 0, threadId: "it-thread", caseId: null });
type Guided = NonNullable<ImobPropertyCaptureRequest["guided"]>;
const guidedRequest = (formId: string, guided: Guided, message = "Cadastrar imóvel", extra: Partial<ImobPropertyCaptureRequest> = {}) =>
  ({ message, operation: "property.create", step: "editing_form", draft: {}, history: [], origin: origin(formId), guided, ...extra }) as ImobPropertyCaptureRequest;
/** Encerramento por referência explícita: sem origem, com revisão/rascunho possivelmente antigos. */
const byRef = (action: "cancel" | "pause", sessionRef: string, revision = 0, extra: Partial<ImobPropertyCaptureRequest> = {}) =>
  ({ message: action, operation: "property.create", step: "editing_form", draft: {}, history: [], guided: { action, sessionRef, revision }, ...extra }) as ImobPropertyCaptureRequest;
const MODEL_PROPOSAL = JSON.stringify({ intent: "continue", confidence: 0.95, changes: [{ field: "bedrooms", value: "2", evidence: "dois quartos", correction: false }] });

// ─── Dublê do transporte: sem rede; registra quantas invocações foram AUTORIZADAS (chegaram ao transporte) ───────────────
function transportDouble(behavior: () => Promise<string> = async () => MODEL_PROPOSAL) {
  const state = { invoked: 0 };
  return { state, interpret: async () => { state.invoked += 1; return behavior(); } };
}
type Transport = ReturnType<typeof transportDouble>;
const engine = (db: Db, scope: CaptureScope, transport: Transport, timeoutMs = 2_000) =>
  (request: ImobPropertyCaptureRequest) => resolveImobPropertyGuidedCapture(request, { prisma: db, scope, timeoutMs, interpret: transport.interpret });

// ─── Leitura CRUA do estado persistido (independente do código sob teste) ─────────────────────────────────────────────────
type Persisted = { status: string; interpretation: string; revision: number; phase: string; pending: unknown; sessionRef: string };
async function persisted(sessionRef: string): Promise<Persisted> {
  const rows = await A.$queryRaw<Array<{ metadata: Persisted }>>`SELECT metadata FROM memory_events WHERE id = ${sessionRef}`;
  assert.equal(rows.length, 1, "linha de controle existe");
  return rows[0]!.metadata;
}
async function rowCount(scope: CaptureScope) {
  const rows = await A.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM memory_events
    WHERE tenant_id = ${scope.tenantId} AND workspace_id = ${scope.workspaceId} AND key = ${PROPERTY_CAPTURE_SESSION} AND metadata->>'actorUserId' = ${scope.userId}`;
  return rows[0]!.n;
}
const fingerprint = async (sessionRef: string) => createHash("sha256").update(JSON.stringify(await persisted(sessionRef))).digest("hex");

// ─── Sincronização determinística pelo servidor ───────────────────────────────────────────────────────────────────────────
/** Segura o MESMO advisory lock de produção numa conexão independente (sem o limite de 5 s das transações interativas do Prisma). */
async function holdAdmissionLock(scope: CaptureScope) {
  const client = await openPgClient();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [`property-capture:${scope.tenantId}:${scope.workspaceId}:${scope.userId}`]);
  return { release: async () => { await client.query("COMMIT"); await client.end(); } };
}
const lockWaitObservations: number[] = [];
/** Espera (com limite) até o SERVIDOR reportar `count` sessões ESPERANDO advisory lock. Prova que a equivalência da chave do lock também se verifica aqui. */
async function waitForLockWaiters(count: number, timeoutMs = 10_000) {
  const monitor = await openPgClient();
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      const { rows } = await monitor.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
         WHERE l.locktype = 'advisory' AND NOT l.granted AND a.datname = current_database()`);
      if ((rows[0]?.n ?? 0) >= count) { lockWaitObservations.push(rows[0]!.n); return rows[0]!.n; }
      if (Date.now() > deadline) throw new Error(`timeout esperando ${count} sessões no advisory lock (vistas: ${rows[0]?.n ?? 0}) — a chave do lock de produção mudou?`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally { await monitor.end(); }
}
/** Verdadeiro se o advisory lock da sessão está LIVRE agora (nenhuma transação de admissão aberta). */
async function admissionLockIsFree(scope: CaptureScope) {
  const client = await openPgClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS ok", [`property-capture:${scope.tenantId}:${scope.workspaceId}:${scope.userId}`]);
    await client.query("ROLLBACK");
    return rows[0]!.ok;
  } finally { await client.end(); }
}
const deferred = <T = void>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
async function open(db: Db, scope: CaptureScope, transport: Transport, formId: string) {
  const result = await engine(db, scope, transport)(guidedRequest(formId, { action: "start" }));
  assert.ok(result.guided?.sessionRef, "sessão aberta");
  assert.equal(result.guided.interpretation, "available");
  return { sessionRef: result.guided.sessionRef!, revision: result.guided.revision };
}
const interpretCommand = (sessionRef: string, revision: number): Guided => ({ action: "interpret", sessionRef, revision });
const interpretMessage = "Tem dois quartos.";

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
test("0. equivalência da chave do lock: o segurador independente bloqueia a admissão de produção", async () => {
  const scope = scopeOf(await seedScope("lk"));
  const transport = transportDouble();
  const holder = await holdAdmissionLock(scope);
  const pending = engine(A, scope, transport)(guidedRequest("f-lock", { action: "start" }));
  assert.equal(await waitForLockWaiters(1), 1, "a abertura de produção espera pelo MESMO advisory lock");
  assert.equal(await rowCount(scope), 0, "nada persistido enquanto o lock está retido");
  await holder.release();
  const result = await pending;
  assert.ok(result.guided?.sessionRef);
  assert.equal(transport.state.invoked, 0, "abrir nunca invoca o transporte");
});

test("1. duas solicitações concorrentes (instâncias A e B) para a mesma sessão: somente uma admissão", async () => {
  const scope = scopeOf(await seedScope("c1"));
  const transport = transportDouble();
  const { sessionRef, revision } = await open(A, scope, transport, "f-1");
  const holder = await holdAdmissionLock(scope);
  const first = engine(A, scope, transport)(guidedRequest("f-1", interpretCommand(sessionRef, revision), interpretMessage));
  await waitForLockWaiters(1);
  const second = engine(B, scope, transport)(guidedRequest("f-1", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(await waitForLockWaiters(2), 2, "as duas instâncias esperam o lock no servidor");
  assert.equal(transport.state.invoked, 0, "nenhum transporte autorizado enquanto o lock está retido");
  await holder.release();
  const results = await Promise.all([first, second]);
  assert.equal(transport.state.invoked, 1, "exatamente um transporte autorizado");
  assert.equal(results.filter((result) => result.outcome === "proposed").length, 1, "só uma resposta traz a proposta da IA");
  assert.equal(results.filter((result) => result.guided?.synchronized).length, 1, "a outra apenas sincroniza o estado vigente");
  const row = await persisted(sessionRef);
  assert.equal(row.interpretation, "consumed");
  assert.equal(await rowCount(scope), 1);
});

test("2. repetição após consumo: nenhuma nova admissão (revisão vigente ou antiga)", async () => {
  const scope = scopeOf(await seedScope("c2"));
  const transport = transportDouble();
  const { sessionRef, revision } = await open(A, scope, transport, "f-2");
  await engine(A, scope, transport)(guidedRequest("f-2", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(transport.state.invoked, 1);
  const current = (await persisted(sessionRef)).revision;
  await engine(B, scope, transport)(guidedRequest("f-2", interpretCommand(sessionRef, current), interpretMessage));
  await engine(A, scope, transport)(guidedRequest("f-2", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(transport.state.invoked, 1, "nem a revisão vigente nem a antiga renovam a interpretação");
  assert.equal((await persisted(sessionRef)).interpretation, "consumed");
});

test("3. nova instância/processo após consumo: o consumo permanece", async () => {
  const scope = scopeOf(await seedScope("c3"));
  const transport = transportDouble();
  const { sessionRef, revision } = await open(A, scope, transport, "f-3");
  await engine(A, scope, transport)(guidedRequest("f-3", interpretCommand(sessionRef, revision), interpretMessage));
  const fresh = independentInstance(); // criada DEPOIS do consumo: sem estado em memória do processo anterior
  const current = (await persisted(sessionRef)).revision;
  await engine(fresh, scope, transport)(guidedRequest("f-3", interpretCommand(sessionRef, current), interpretMessage));
  const reopened = await engine(fresh, scope, transport)(guidedRequest("f-3", { action: "start" }));
  assert.equal(transport.state.invoked, 1);
  assert.equal(reopened.guided?.sessionRef, sessionRef, "mesma sessão");
  assert.equal(reopened.guided?.interpretation, "consumed");
  assert.equal(await rowCount(scope), 1);
});

test("4. falha após o commit da admissão e antes do transporte: consumo permanece; zero nova tentativa", async () => {
  const scope = scopeOf(await seedScope("c4"));
  const transport = transportDouble(async () => { throw new Error("falha sintética antes do despacho"); });
  const { sessionRef, revision } = await open(A, scope, transport, "f-4");
  const failed = await engine(A, scope, transport)(guidedRequest("f-4", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(failed.outcome, "unavailable");
  assert.equal(transport.state.invoked, 1);
  const row = await persisted(sessionRef);
  assert.equal(row.interpretation, "consumed", "o consumo foi persistido antes do transporte");
  await engine(B, scope, transport)(guidedRequest("f-4", interpretCommand(sessionRef, row.revision), interpretMessage));
  assert.equal(transport.state.invoked, 1, "nenhuma nova tentativa depois da falha");
});

test("5. timeout/resultado desconhecido: nenhuma renovação; resposta tardia não altera o estado", async () => {
  const scope = scopeOf(await seedScope("c5"));
  const late = deferred<string>();
  const transport = transportDouble(() => late.promise);
  const { sessionRef, revision } = await open(A, scope, transport, "f-5");
  const timedOut = await resolveImobPropertyGuidedCapture(guidedRequest("f-5", interpretCommand(sessionRef, revision), interpretMessage),
    { prisma: A, scope, timeoutMs: 50, interpret: transport.interpret });
  assert.equal(timedOut.outcome, "timeout");
  const before = await fingerprint(sessionRef);
  assert.equal((await persisted(sessionRef)).interpretation, "consumed");
  late.resolve(MODEL_PROPOSAL); // resposta tardia do transporte: ninguém a aplica
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await fingerprint(sessionRef), before, "estado persistido idêntico após a resposta tardia");
  await engine(B, scope, transport)(guidedRequest("f-5", interpretCommand(sessionRef, (await persisted(sessionRef)).revision), interpretMessage));
  assert.equal(transport.state.invoked, 1, "o timeout não renova a oportunidade");
});

test("6. rollback da admissão: nenhum transporte autorizado e nenhum consumo persistido", async () => {
  const scope = scopeOf(await seedScope("c6"));
  const transport = transportDouble();
  const { sessionRef, revision } = await open(A, scope, transport, "f-6");
  const before = await persisted(sessionRef);
  // Falha injetada DEPOIS da escrita real do `update` e ainda dentro da transação: o PostgreSQL deve desfazer a escrita.
  const injected = { fired: 0 };
  const faulty = independentInstance().$extends({ query: { memoryEvent: { async update({ args, query }) {
    await query(args);
    injected.fired += 1;
    throw new Error("falha injetada após a escrita, antes do commit");
  } } } }) as unknown as Db;
  const result = await resolveImobPropertyGuidedCapture(guidedRequest("f-6", interpretCommand(sessionRef, revision), interpretMessage),
    { prisma: faulty, scope, timeoutMs: 2_000, interpret: transport.interpret });
  assert.equal(injected.fired, 1, "a falha foi realmente injetada dentro da transação (a extensão alcança o cliente transacional)");
  assert.equal(transport.state.invoked, 0, "sem commit, nenhum transporte autorizado");
  assert.equal(result.guided?.interpretation, "blocked", "degradação sem autorização de interpretação");
  assert.deepEqual(await persisted(sessionRef), before, "linha idêntica à anterior: a escrita foi revertida");
  await engine(A, scope, transport)(guidedRequest("f-6", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(transport.state.invoked, 1, "a admissão legítima posterior ainda é possível exatamente uma vez");
});

test("7a. cancelamento DEPOIS da admissão e com o transporte em voo: o transporte autorizado não é recolhido; a resposta tardia não reativa", async () => {
  const scope = scopeOf(await seedScope("c7a"));
  const gate = deferred<string>();
  const dispatched = deferred();
  const transport = transportDouble(async () => { dispatched.resolve(); return gate.promise; });
  const { sessionRef, revision } = await open(A, scope, transport, "f-7a");
  const inflight = engine(A, scope, transport)(guidedRequest("f-7a", interpretCommand(sessionRef, revision), interpretMessage));
  await dispatched.promise; // admissão já confirmada (commit) e transporte despachado
  const cancelled = await engine(B, scope, transport)(guidedRequest("f-7a", { action: "cancel" }, "Cancelar cadastro do imóvel"));
  assert.equal(cancelled.guided?.status, "cancelled");
  gate.resolve(MODEL_PROPOSAL);
  const late = await inflight;
  assert.equal(transport.state.invoked, 1, "o transporte já autorizado completou; o sistema não promete cancelá-lo");
  assert.equal(late.proposal ?? null, null, "a proposta tardia não é entregue");
  const row = await persisted(sessionRef);
  assert.equal(row.status, "cancelled");
  assert.equal(row.pending, null);
  assert.equal(row.interpretation, "consumed");
});

test("7b. cancelamento ANTES da admissão: nenhuma admissão; sessão encerrada não é reaberta", async () => {
  const scope = scopeOf(await seedScope("c7b"));
  const transport = transportDouble();
  const { sessionRef, revision } = await open(A, scope, transport, "f-7b");
  assert.equal(await hasActivePropertyCapture(A, scope), true, "filtro JSON do PostgreSQL enxerga a sessão ativa do ator");
  await engine(A, scope, transport)(guidedRequest("f-7b", { action: "cancel" }, "Cancelar cadastro do imóvel"));
  const after = await engine(B, scope, transport)(guidedRequest("f-7b", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(transport.state.invoked, 0);
  assert.equal(after.proposal ?? null, null);
  assert.equal((await persisted(sessionRef)).status, "cancelled");
  assert.equal(await hasActivePropertyCapture(A, scope), false);
});

for (const kind of ["por origem (sem sessionRef)", "por referência (sem origem, revisão antiga)"] as const) {
  test(`7c. cancelamento ${kind} e admissão concorrentes: resultado coerente com a ordem transacional (qualquer ordem)`, async () => {
    const scope = scopeOf(await seedScope(kind.startsWith("por origem") ? "c7c" : "c7cr"));
    const transport = transportDouble();
    const { sessionRef, revision } = await open(A, scope, transport, "f-7c");
    const holder = await holdAdmissionLock(scope);
    const admission = engine(A, scope, transport)(guidedRequest("f-7c", interpretCommand(sessionRef, revision), interpretMessage));
    await waitForLockWaiters(1);
    const cancel = engine(B, scope, transport)(kind.startsWith("por origem") ? guidedRequest("f-7c", { action: "cancel" }, "Cancelar cadastro do imóvel") : byRef("cancel", sessionRef, revision));
    await waitForLockWaiters(2);
    await holder.release();
    const [interpreted, cancelled] = await Promise.all([admission, cancel]);
    const row = await persisted(sessionRef);
    assert.equal(row.status, "cancelled", "o cancelamento prevalece em qualquer ordem");
    assert.equal(row.pending, null, "nenhuma proposta fica pendente num cadastro cancelado");
    assert.equal(cancelled.guided?.status, "cancelled");
    assert.ok(transport.state.invoked <= 1);
    if (transport.state.invoked === 1) assert.equal(row.interpretation, "consumed", "admissão antes do cancelamento: consumo registrado");
    else assert.equal(row.interpretation, "available", "cancelamento antes da admissão: nada consumido, nada transportado");
    assert.equal(interpreted.proposal ?? null, null, "a proposta nunca é entregue a um cadastro cancelado");
  });
}

test("7d. cancelar/pausar com revisão antiga (F-02): valida a sessão, não exige a última revisão, não aplica rascunho antigo e é idempotente", async () => {
  const scope = scopeOf(await seedScope("c7d"));
  const transport = transportDouble();
  const { sessionRef, revision } = await open(A, scope, transport, "f-7d");
  await engine(A, scope, transport)(guidedRequest("f-7d", { action: "collect", sessionRef, revision })); // a revisão avança
  const paused = await engine(B, scope, transport)(byRef("pause", sessionRef, revision, { draft: { city: "Antiga" } }));
  assert.equal(paused.guided?.status, "paused");
  const afterPause = await persisted(sessionRef);
  assert.equal(afterPause.status, "paused");
  assert.equal((afterPause as unknown as { draft: Record<string, string> }).draft.city, undefined, "rascunho antigo não é aplicado");
  await engine(A, scope, transport)(byRef("pause", sessionRef, 0));
  assert.equal((await persisted(sessionRef)).revision, afterPause.revision, "pausa repetida é idempotente");
  const cancelled = await engine(B, scope, transport)(byRef("cancel", sessionRef, revision));
  assert.equal(cancelled.guided?.status, "cancelled");
  const afterCancel = await persisted(sessionRef);
  await engine(A, scope, transport)(byRef("cancel", sessionRef, 0));
  assert.equal((await persisted(sessionRef)).revision, afterCancel.revision, "cancelamento repetido é idempotente");
  const reactivate = await engine(A, scope, transport)(byRef("pause", sessionRef));
  assert.equal(reactivate.guided?.status, "cancelled", "estado terminal não é reativado");
  assert.equal(transport.state.invoked, 0);
});

test("12. recuperação (F-01): origem perdida; encerra só a sessão nomeada, com escopo validado; ação atrasada não atinge o cadastro novo", async () => {
  const s = await seedScope("c12");
  const scope = scopeOf(s);
  const transport = transportDouble();
  const lost = await open(A, scope, transport, "f-lost");
  assert.deepEqual(await openPropertyCapture(A, scope), { sessionRef: lost.sessionRef, status: "active" }, "filtro JSON real localiza a sessão aberta do ator");
  await assert.rejects(engine(B, scope, transport)(guidedRequest("f-new-tab", { action: "start" })), (error: unknown) => error instanceof PropertyCaptureActiveError
    && error.open.sessionRef === lost.sessionRef && error.open.status === "active", "P-02: outra origem não inicia nem substitui; recebe o conflito com a referência da sessão aberta");
  // Escopos/atores alheios com a referência correta não a encerram.
  const foreign = [{ ...scope, userId: s.other }, { ...scope, tenantId: `${s.tenantId}-x` }];
  for (const other of foreign) assert.equal((await engine(B, other, transport)(byRef("cancel", lost.sessionRef))).guided, undefined);
  assert.equal((await persisted(lost.sessionRef)).status, "active");
  assert.equal((await engine(B, scope, transport)(byRef("cancel", lost.sessionRef, 42))).guided?.status, "cancelled");
  assert.equal(await openPropertyCapture(A, scope, true), null, "sessão terminal não bloqueia");
  const fresh = await open(A, scope, transport, "f-new-tab");
  assert.notEqual(fresh.sessionRef, lost.sessionRef);
  const late = await engine(B, scope, transport)(byRef("cancel", lost.sessionRef));
  assert.equal(late.guided?.status, "cancelled", "resposta reflete o estado persistido da sessão antiga");
  assert.equal((await persisted(fresh.sessionRef)).status, "active", "cadastro novo intacto");
  assert.equal((await persisted(fresh.sessionRef)).interpretation, "available");
  assert.equal(transport.state.invoked, 0);
});

test("13. revisão alterada durante o transporte (F-03): sincronização preserva a proposta; mudança real a descarta sem nova interpretação", async () => {
  const scope = scopeOf(await seedScope("c13"));
  // (a) sincronização sem mudança de dados enquanto o transporte está em voo
  const releaseA = deferred<string>(); const dispatchedA = deferred();
  const transportA = transportDouble(async () => { dispatchedA.resolve(); return releaseA.promise; });
  const a = await open(A, scope, transportA, "f-13a");
  const inflightA = engine(A, scope, transportA)(guidedRequest("f-13a", interpretCommand(a.sessionRef, a.revision), interpretMessage));
  await dispatchedA.promise;
  const rev = (await persisted(a.sessionRef)).revision;
  await engine(B, scope, transportA)(guidedRequest("f-13a", { action: "sync", sessionRef: a.sessionRef, revision: rev }));
  assert.ok((await persisted(a.sessionRef)).revision > rev);
  releaseA.resolve(MODEL_PROPOSAL);
  const kept = await inflightA;
  assert.equal(kept.outcome, "proposed");
  assert.ok((await persisted(a.sessionRef)).pending, "proposta ainda válida preservada");
  await engine(A, scope, transportA)(byRef("cancel", a.sessionRef));
  // (b) mudança real do contexto enquanto o transporte está em voo
  const releaseB = deferred<string>(); const dispatchedB = deferred();
  const transportB = transportDouble(async () => { dispatchedB.resolve(); return releaseB.promise; });
  const b = await open(A, scope, transportB, "f-13b");
  const inflightB = engine(A, scope, transportB)(guidedRequest("f-13b", interpretCommand(b.sessionRef, b.revision), interpretMessage));
  await dispatchedB.promise;
  await engine(B, scope, transportB)(guidedRequest("f-13b", { action: "set", sessionRef: b.sessionRef, revision: (await persisted(b.sessionRef)).revision, field: "propertyType", value: "apartamento" }));
  releaseB.resolve(MODEL_PROPOSAL);
  const discarded = await inflightB;
  assert.equal(discarded.outcome, "clarify"); assert.equal(discarded.proposal ?? null, null);
  const row = await persisted(b.sessionRef);
  assert.equal(row.pending, null); assert.equal(row.interpretation, "consumed");
  await engine(A, scope, transportB)(guidedRequest("f-13b", interpretCommand(b.sessionRef, row.revision), interpretMessage, { draft: { propertyType: "apartamento" } }));
  assert.equal(transportB.state.invoked, 1, "sem segunda interpretação");
});

test("8. sessões e escopos distintos: isolamento, sem acesso cruzado e sem bloqueio entre atores", async () => {
  const s1 = await seedScope("c8a");
  const s2 = await seedScope("c8b");
  const sameWorkspaceOtherActor = scopeOf(s1, "other");
  const principal = scopeOf(s1);
  const transport = transportDouble();
  const mine = await open(A, principal, transport, "f-8a");
  const theirs = await open(B, sameWorkspaceOtherActor, transport, "f-8b");
  const foreign = await open(A, scopeOf(s2), transport, "f-8c");
  assert.equal(new Set([mine.sessionRef, theirs.sessionRef, foreign.sessionRef]).size, 3);
  // Outro workspace do MESMO tenant.
  const otherWorkspaceId = `${s1.workspaceId}-b`;
  await A.workspace.create({ data: { id: otherWorkspaceId, tenantId: s1.tenantId, name: "Synthetic second workspace" } });
  const inOtherWorkspace = await open(A, { ...principal, workspaceId: otherWorkspaceId }, transport, "f-8d");
  assert.notEqual(inOtherWorkspace.sessionRef, mine.sessionRef);

  const untouched = await fingerprint(theirs.sessionRef);
  const crossActor = await engine(A, principal, transport)(guidedRequest("f-8a", interpretCommand(theirs.sessionRef, theirs.revision), interpretMessage));
  const crossTenant = await engine(A, scopeOf(s2), transport)(guidedRequest("f-8c", interpretCommand(mine.sessionRef, mine.revision), interpretMessage));
  assert.equal(transport.state.invoked, 0, "referência de outro ator/escopo nunca autoriza transporte");
  assert.equal(crossActor.guided, undefined);
  assert.equal(crossTenant.guided, undefined);
  assert.equal(await fingerprint(theirs.sessionRef), untouched, "sessão alheia intacta");

  // O lock é por ator: reter o de `principal` não bloqueia `other`.
  const holder = await holdAdmissionLock(principal);
  const concurrent = engine(B, sameWorkspaceOtherActor, transport)(guidedRequest("f-8b", interpretCommand(theirs.sessionRef, theirs.revision), interpretMessage));
  const finished = await Promise.race([concurrent.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("blocked"), 5_000))]);
  assert.equal(finished, "done", "outro ator não é bloqueado pelo lock do ator principal");
  await holder.release();
  assert.equal(transport.state.invoked, 1);
  assert.equal((await persisted(mine.sessionRef)).interpretation, "available", "a sessão do principal continua intacta");
});

test("9. repetição da abertura com a mesma origem: mesma sessão e mesmo consumo (inclusive concorrente)", async () => {
  const scope = scopeOf(await seedScope("c9"));
  const transport = transportDouble();
  const holder = await holdAdmissionLock(scope);
  const first = engine(A, scope, transport)(guidedRequest("f-9", { action: "start" }));
  await waitForLockWaiters(1);
  const second = engine(B, scope, transport)(guidedRequest("f-9", { action: "start" }));
  await waitForLockWaiters(2);
  await holder.release();
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1.guided?.sessionRef, r2.guided?.sessionRef, "as duas aberturas concorrentes convergem para uma sessão");
  assert.equal(await rowCount(scope), 1);
  const sessionRef = r1.guided!.sessionRef!;
  assert.equal((await persisted(sessionRef)).interpretation, "available", "abrir não consome");
  await engine(A, scope, transport)(guidedRequest("f-9", interpretCommand(sessionRef, (await persisted(sessionRef)).revision), interpretMessage));
  const reopened = await engine(B, scope, transport)(guidedRequest("f-9", { action: "start" }));
  assert.equal(reopened.guided?.sessionRef, sessionRef);
  assert.equal(reopened.guided?.interpretation, "consumed", "mesmo consumo após a reabertura");
  assert.equal(await rowCount(scope), 1);
  assert.equal(transport.state.invoked, 1);
});

test("10. a transação da admissão termina antes do transporte (advisory lock livre no despacho)", async () => {
  const scope = scopeOf(await seedScope("c10"));
  let freeAtDispatch: boolean | undefined;
  const transport = transportDouble(async () => { freeAtDispatch = await admissionLockIsFree(scope); return MODEL_PROPOSAL; });
  const { sessionRef, revision } = await open(A, scope, transport, "f-10");
  await engine(A, scope, transport)(guidedRequest("f-10", interpretCommand(sessionRef, revision), interpretMessage));
  assert.equal(transport.state.invoked, 1);
  assert.equal(freeAtDispatch, true, "nenhuma transação de admissão aberta durante a chamada externa");
});

// ─── Complementar (fora dos 9 casos mínimos): salvamento na mesma transação do controle, com createProperty real ───────────────
test("11. salvamento guiado: imóvel e sessão `saved` na mesma transação; falha após a inserção reverte ambos; reenvio não duplica", async () => {
  const s = await seedScope("c11");
  const scope = scopeOf(s);
  const transport = transportDouble();
  // Recuperação sem sessionRef cria a sessão já na revisão com os obrigatórios preenchidos (sem LLM).
  const draft = { propertyType: "apartamento", city: "Itajaí", address: "Rua Sintética, 100" };
  const reviewed = await engine(A, scope, transport)(guidedRequest("f-11", { action: "review", revision: 0 }, "Revisar cadastro", { draft }));
  const sessionRef = reviewed.guided!.sessionRef!;
  assert.equal((await persisted(sessionRef)).phase, "review");
  const input = { ...draft, metadata: { propertyCaptureSessionRef: sessionRef } };
  const count = async () => (await A.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM imob_properties WHERE tenant_id = ${s.tenantId}`)[0]!.n;
  const create = (client: Db) => new ImobCrmMutationService(client as never).createProperty({ ...scope }, input as never);

  await assert.rejects(withGuidedPropertySave(A, scope, input, async (client) => { await create(client); throw new Error("falha após a inserção"); }), /falha após a inserção/);
  assert.equal(await count(), 0, "inserção revertida");
  assert.equal((await persisted(sessionRef)).status, "active", "sessão não marcada como salva");

  const saved = await withGuidedPropertySave(A, scope, input, create);
  assert.equal(saved.status, "created");
  assert.equal(await count(), 1);
  assert.equal((await persisted(sessionRef)).status, "saved");
  const again = await withGuidedPropertySave(B, scope, input, create);
  assert.equal(again.status, "guided_invalid", "reenvio da mesma sessão não duplica");
  assert.equal(await count(), 1);
  assert.equal(transport.state.invoked, 0, "o salvamento nunca chama LLM");
  // Sem sessão guiada aberta (a anterior está `saved`), o salvamento legado/lote continua funcionando. A consistência entre a
  // autorização legada e a abertura concorrente é verificada no teste 14, não por "esperar ou não o lock".
  const legacy = await withGuidedPropertySave(A, scope, { propertyType: "casa", city: "Itajaí", address: "Rua Legada, 200" }, (client) => new ImobCrmMutationService(client as never)
    .createProperty({ ...scope }, { propertyType: "casa", city: "Itajaí", address: "Rua Legada, 200" } as never));
  assert.equal(legacy.status, "created");
  assert.equal(await count(), 2);
});

// ─── F-04: corrida entre o save LEGADO (autorização por leitura, gravação sem lock) e a abertura guiada concorrente ─────────────
// CONTRATO esperado (definido antes do resultado; critério = ordem serial válida, não "o que o código faz hoje"):
//  P1. Ponto de autorização do save legado = a leitura de `openPropertyCapture` dentro de `withGuidedPropertySave` (snapshot READ COMMITTED).
//  P2. Uma abertura guiada CONFIRMADA (commit) antes dessa leitura DEVE bloquear o save legado (não pode contornar a validação guiada).
//  P3. Se a abertura confirma DEPOIS da leitura e antes da gravação, o estado final deve ser o de uma ordem serial válida
//      (legado, depois abertura): o save legado é independente da sessão, não a altera e não ganha capacidade que não teria sem ela.
//  P4. Depois que a sessão é visível, todo novo save legado é bloqueado; a sessão e o consumo não são afetados pelo save legado.
// NÃO asserido (decisão do owner, apenas observado e registrado): o invariante forte "nenhum save legado COMMITA enquanto há sessão aberta".
const legacyInput = { propertyType: "casa", city: "Itajaí", address: "Rua Legada, 200" };
const legacyCreate = (scope: CaptureScope) => (client: Db) => new ImobCrmMutationService(client as never).createProperty({ ...scope }, legacyInput as never);
const propertyCount = async (tenantId: string) => (await A.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM imob_properties WHERE tenant_id = ${tenantId}`)[0]!.n;
async function sessionFacts(scope: CaptureScope) {
  const rows = await A.$queryRaw<Array<{ id: string; xmin: string; status: string; interpretation: string; revision: number }>>`
    SELECT id, xmin::text AS xmin, metadata->>'status' AS status, metadata->>'interpretation' AS interpretation, (metadata->>'revision')::int AS revision
    FROM memory_events WHERE tenant_id = ${scope.tenantId} AND workspace_id = ${scope.workspaceId} AND key = ${PROPERTY_CAPTURE_SESSION} AND metadata->>'actorUserId' = ${scope.userId}`;
  return rows;
}
const propertyXmin = async (tenantId: string) => (await A.$queryRaw<Array<{ xmin: string }>>`SELECT xmin::text AS xmin FROM imob_properties WHERE tenant_id = ${tenantId}`)[0]?.xmin;

test("14a. F-04 legado autorizado ANTES da abertura e gravando DEPOIS: equivale à ordem serial (legado, abertura); depois da abertura visível o legado é bloqueado", async (t) => {
  const s = await seedScope("c14a");
  const scope = scopeOf(s);
  const transport = transportDouble();
  const timeline: string[] = [];
  const atWrite = deferred(), go = deferred();
  const legacy = withGuidedPropertySave(A, scope, legacyInput, async (client) => {
    timeline.push("L: leitura de autorização viu 0 sessões abertas"); atWrite.resolve(); await go.promise;
    const created = await legacyCreate(scope)(client as Db); timeline.push("L: gravação do imóvel confirmada"); return created;
  });
  await atWrite.promise; // L já foi autorizado e está PAUSADO antes de gravar, sem reter nenhum lock
  assert.equal((await sessionFacts(scope)).length, 0); assert.equal(await propertyCount(s.tenantId), 0);
  const opened = await engine(B, scope, transport)(guidedRequest("f-14a", { action: "start" }));
  timeline.push("S: abertura guiada confirmada (commit)");
  const during = await sessionFacts(scope);
  assert.equal(during.length, 1); assert.equal(during[0]!.status, "active");
  assert.equal(await propertyCount(s.tenantId), 0, "no instante da abertura o imóvel legado ainda não existe");
  go.resolve();
  const created = await legacy;
  assert.equal(created.status, "created");
  timeline.push("fim");
  const after = await sessionFacts(scope);
  const sessionTx = BigInt(during[0]!.xmin), propertyTx = BigInt((await propertyXmin(s.tenantId))!);
  assert.ok(propertyTx > sessionTx, "a gravação legada começou depois do commit da sessão (txid maior)");
  // P3: estado final == execução serial (legado, abertura) em outro escopo
  const serial = await seedScope("c14a-serial"); const serialScope = scopeOf(serial);
  await withGuidedPropertySave(A, serialScope, legacyInput, legacyCreate(serialScope));
  await engine(A, serialScope, transportDouble())(guidedRequest("f-14a-s", { action: "start" }));
  const norm = async (sc: CaptureScope, tenantId: string) => ({ properties: await propertyCount(tenantId), sessions: (await sessionFacts(sc)).map(({ status, interpretation, revision }) => ({ status, interpretation, revision })) });
  assert.deepEqual(await norm(scope, s.tenantId), await norm(serialScope, serial.tenantId), "mesmo estado da ordem serial (legado, abertura)");
  assert.equal(after[0]!.interpretation, "available", "o save legado não consumiu nem alterou a sessão");
  // P2/P4: depois da sessão visível, novo save legado é bloqueado
  const blocked = await withGuidedPropertySave(A, scope, legacyInput, legacyCreate(scope));
  assert.equal(blocked.status, "guided_invalid");
  assert.equal(await propertyCount(s.tenantId), 1);
  assert.equal(transport.state.invoked, 0);
  t.diagnostic(`F-04 observação: o imóvel legado foi confirmado com a sessão ${opened.guided?.status} aberta (invariante forte não asserido). Linha do tempo: ${timeline.join(" → ")}`);
});

test("14b. F-04 abertura confirmada ANTES da autorização legada: o save legado é bloqueado (ordem serial abertura, legado)", async () => {
  const s = await seedScope("c14b");
  const scope = scopeOf(s);
  await engine(B, scope, transportDouble())(guidedRequest("f-14b", { action: "start" }));
  let wrote = 0;
  const rejected = await withGuidedPropertySave(A, scope, legacyInput, async (client) => { wrote += 1; return legacyCreate(scope)(client as Db); });
  assert.equal(rejected.status, "guided_invalid"); assert.equal(wrote, 0, "a gravação legada nem foi tentada");
  assert.equal(await propertyCount(s.tenantId), 0);
  // paused também bloqueia
  const [session] = await sessionFacts(scope);
  await engine(A, scope, transportDouble())(byRef("pause", session!.id));
  assert.equal((await withGuidedPropertySave(A, scope, legacyInput, legacyCreate(scope))).status, "guided_invalid");
  assert.equal(await propertyCount(s.tenantId), 0);
});

test("14c. F-04 corrida livre (12 rodadas, duas instâncias, sem pausa artificial): todo desfecho é uma ordem serial válida", async (t) => {
  const outcomes = { legadoCriou: 0, legadoBloqueado: 0 };
  for (let round = 0; round < 12; round += 1) {
    const s = await seedScope(`c14c${round}`);
    const scope = scopeOf(s);
    const [legacy, opened] = await Promise.all([
      withGuidedPropertySave(A, scope, legacyInput, legacyCreate(scope)),
      engine(B, scope, transportDouble())(guidedRequest(`f-14c-${round}`, { action: "start" })),
    ]);
    const sessions = await sessionFacts(scope);
    assert.equal(sessions.length, 1, `rodada ${round}: a sessão sempre existe`);
    assert.equal(sessions[0]!.status, "active"); assert.equal(sessions[0]!.interpretation, "available");
    assert.ok(opened.guided?.sessionRef);
    const properties = await propertyCount(s.tenantId);
    if (legacy.status === "created") { assert.equal(properties, 1); outcomes.legadoCriou += 1; }
    else { assert.equal(legacy.status, "guided_invalid"); assert.equal(properties, 0); outcomes.legadoBloqueado += 1; }
  }
  t.diagnostic(`F-04 corrida livre: ${JSON.stringify(outcomes)} (ambos os desfechos são ordens seriais válidas; nenhum desfecho inconsistente)`);
});


test("15. P-02 início de outra origem em PostgreSQL real: conflito com a referência do servidor, restrito ao escopo; mesma origem retoma; nada é cancelado nem renovado", async () => {
  const s = await seedScope("c15");
  const scope = scopeOf(s);
  const transport = transportDouble();
  const a = await open(A, scope, transport, "f-A");
  const before = await fingerprint(a.sessionRef), rowsBefore = await rowCount(scope);
  // outra origem, de instâncias distintas, no estado ativo e depois no pausado: conflito nomeia a sessão e o estado
  for (const db of [A, B]) {
    await assert.rejects(engine(db, scope, transport)(guidedRequest("f-B", { action: "start" })), (error: unknown) => error instanceof PropertyCaptureActiveError
      && error.open.sessionRef === a.sessionRef && error.open.status === "active");
    // recuperação sem referência (collect) a partir de outra origem: mesmo conflito
    await assert.rejects(engine(db, scope, transport)(guidedRequest("f-B", { action: "collect" })), PropertyCaptureActiveError);
  }
  assert.equal(await rowCount(scope), rowsBefore, "nenhuma segunda sessão");
  assert.equal(await fingerprint(a.sessionRef), before, "sessão aberta intacta: não cancelada, renovada nem alterada");
  // mesma origem: retomada preservada (mesma sessão, sem nova admissão)
  const resumed = await engine(B, scope, transport)(guidedRequest("f-A", { action: "start" }));
  assert.equal(resumed.guided?.sessionRef, a.sessionRef); assert.equal(await rowCount(scope), rowsBefore);
  // outro usuário do mesmo tenant e outro tenant: sem conflito, abrem a própria sessão (a referência nunca vaza entre escopos)
  for (const other of [{ ...scope, userId: s.other }, { ...scope, tenantId: `${s.tenantId}-x` }]) {
    const own = await engine(B, other, transport)(guidedRequest("f-B", { action: "start" }));
    assert.equal(own.guided?.status, "active"); assert.notEqual(own.guided?.sessionRef, a.sessionRef);
  }
  assert.equal(await fingerprint(a.sessionRef), before, "a sessão do primeiro escopo segue intacta");
  // pausada: o conflito informa o estado pausado; a referência recebida cancela exatamente essa sessão
  assert.equal((await engine(A, scope, transport)(byRef("pause", a.sessionRef))).guided?.status, "paused");
  await assert.rejects(engine(B, scope, transport)(guidedRequest("f-B", { action: "start" })), (error: unknown) => error instanceof PropertyCaptureActiveError && error.open.status === "paused");
  assert.equal((await engine(B, scope, transport)(byRef("cancel", a.sessionRef))).guided?.status, "cancelled");
  const fresh = await open(A, scope, transport, "f-B");
  const stale = await engine(B, scope, transport)(byRef("cancel", a.sessionRef));
  assert.equal(stale.guided?.sessionRef, a.sessionRef, "a resposta reflete a sessão antiga (já encerrada)");
  assert.equal((await persisted(fresh.sessionRef)).status, "active", "referência antiga não cancela a sessão posterior");
  assert.equal(transport.state.invoked, 0, "nenhuma interpretação foi consumida ou chamada");
});
