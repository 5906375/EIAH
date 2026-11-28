import test from "node:test";
import assert from "node:assert/strict";
import {
  createPendingWorkTracker,
  createScopeKeyer,
  isFrontDoorWaiting,
  trackAsyncMethods,
  trackDecision,
} from "./frontDoorPendingWork";

// Comportamento do estado compartilhado de espera do Front Door. Promessas controladas, sem timers e sem nome de agente/vertical.
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test("solicitações têm identidade própria: uma terminar não oculta outra pendente", async () => {
  const tracker = createPendingWorkTracker(() => "conversa-1");
  const a = deferred<string>();
  const b = deferred<string>();
  const pa = tracker.track(() => a.promise);
  const pb = tracker.track(() => b.promise);
  assert.equal(tracker.pendingCount(), 2);
  b.resolve("b"); // a MAIS NOVA termina primeiro: a mais antiga continua pendente
  await pb;
  assert.equal(tracker.pendingCount(), 1);
  a.resolve("a");
  await pa;
  assert.equal(tracker.pendingCount(), 0);
});

test("a mais antiga terminando depois da mais nova também não apaga a mais nova", async () => {
  const tracker = createPendingWorkTracker(() => "conversa-1");
  const a = deferred<string>();
  const b = deferred<string>();
  const pa = tracker.track(() => a.promise);
  const pb = tracker.track(() => b.promise);
  a.resolve("a");
  await pa;
  assert.equal(tracker.pendingCount(), 1, "a mais nova segue pendente");
  b.resolve("b");
  await pb;
  assert.equal(tracker.pendingCount(), 0);
});

test("erro e rejeição encerram a espera e o erro chega a quem chamou", async () => {
  const tracker = createPendingWorkTracker(() => "conversa-1");
  const gate = deferred<string>();
  const pending = tracker.track(() => gate.promise);
  assert.equal(tracker.pendingCount(), 1);
  gate.reject(new Error("falha sintética"));
  await assert.rejects(pending, /falha sintética/);
  assert.equal(tracker.pendingCount(), 0);
});

test("trabalho que lança de forma síncrona não deixa espera pendurada", async () => {
  const tracker = createPendingWorkTracker(() => "conversa-1");
  await assert.rejects(tracker.track((() => { throw new Error("síncrono"); }) as () => Promise<never>), /síncrono/);
  assert.equal(tracker.pendingCount(), 0);
});

test("troca de conversa: a espera da anterior deixa de contar na hora e o fim tardio dela não afeta a atual", async () => {
  let scope = "conversa-1";
  const tracker = createPendingWorkTracker(() => scope);
  const antiga = deferred<string>();
  const pAntiga = tracker.track(() => antiga.promise);
  assert.equal(tracker.pendingCount(), 1);
  scope = "conversa-2";
  assert.equal(tracker.pendingCount(), 0, "a conversa nova começa sem espera herdada");
  const atual = deferred<string>();
  const pAtual = tracker.track(() => atual.promise);
  assert.equal(tracker.pendingCount(), 1);
  antiga.resolve("tardia");
  await pAntiga;
  assert.equal(tracker.pendingCount(), 1, "resposta tardia da conversa anterior não encerra a espera da atual");
  atual.resolve("ok");
  await pAtual;
  assert.equal(tracker.pendingCount(), 0);
});

test("voltar a um escopo anterior não ressuscita solicitação já podada", async () => {
  let scope = "A";
  const tracker = createPendingWorkTracker(() => scope);
  const gate = deferred<string>();
  const pending = tracker.track(() => gate.promise);
  scope = "B";
  tracker.begin()(); // qualquer início na nova conversa poda as do escopo antigo
  scope = "A";
  assert.equal(tracker.pendingCount(), 0, "a espera de A foi descartada ao trocar de conversa");
  gate.resolve("x");
  await pending;
});

test("end é idempotente e a assinatura é notificada só quando o estado muda", () => {
  const tracker = createPendingWorkTracker(() => "c");
  const notifications: number[] = [];
  const unsubscribe = tracker.subscribe(() => notifications.push(tracker.pendingCount()));
  const end = tracker.begin();
  end();
  end();
  end();
  assert.deepEqual(notifications, [1, 0], "um início e um fim; chamadas repetidas de end não notificam");
  unsubscribe();
  tracker.begin();
  assert.deepEqual(notifications, [1, 0], "depois de cancelar a assinatura não notifica mais");
});

test("trackAsyncMethods: assíncronos viram espera; síncronos e valores passam direto", async () => {
  const tracker = createPendingWorkTracker(() => "c");
  const gate = deferred<boolean>();
  const forms = trackAsyncMethods({
    label: "formulário",
    salvar: () => gate.promise,
    abrir: () => "aberto",
  }, tracker.track);
  assert.equal(forms.label, "formulário");
  assert.equal(forms.abrir(), "aberto");
  assert.equal(tracker.pendingCount(), 0, "método síncrono não gera espera");
  const pending = forms.salvar();
  assert.equal(tracker.pendingCount(), 1);
  gate.resolve(true);
  assert.equal(await pending, true);
  assert.equal(tracker.pendingCount(), 0);
});

test("trackAsyncMethods: método assíncrono que rejeita encerra a espera e propaga o erro", async () => {
  const tracker = createPendingWorkTracker(() => "c");
  const forms = trackAsyncMethods({ falhar: async () => { throw new Error("recusado"); } }, tracker.track);
  await assert.rejects(forms.falhar(), /recusado/);
  assert.equal(tracker.pendingCount(), 0);
});

test("decisão do turno: a espera cobre a avaliação e passa SEM intervalo para o encaminhamento (mensagens intermediárias não a encerram)", async () => {
  const tracker = createPendingWorkTracker(() => "c");
  const handover = { release: () => {} };
  const avaliacao = deferred<{ verticalHandoffForwardInput?: string }>();
  const pending = trackDecision(tracker, handover, () => avaliacao.promise);
  assert.equal(tracker.pendingCount(), 1, "a espera inicial da avaliação do handoff conta");
  const counts: number[] = [];
  tracker.subscribe(() => counts.push(tracker.pendingCount()));
  avaliacao.resolve({ verticalHandoffForwardInput: "consulta qualquer" });
  await pending;
  assert.equal(tracker.pendingCount(), 1, "entre a decisão e o encaminhamento a espera não some");
  assert.ok(!counts.includes(0), "nunca chegou a zero no meio do caminho");
  // Mensagens intermediárias (aviso de handoff, card) são digitadas aqui; o launcher solta a ponte ao disparar o encaminhamento.
  const encaminhamento = tracker.begin();
  handover.release();
  assert.equal(tracker.pendingCount(), 1, "o encaminhamento já pendente sustenta a espera");
  encaminhamento();
  assert.equal(tracker.pendingCount(), 0);
});

test("decisão do turno: a espera já existe enquanto a cadeia ainda é computada (begin antes de decide)", async () => {
  const tracker = createPendingWorkTracker(() => "c");
  const gate = deferred<null>();
  const observedDuringDecide: number[] = [];
  const pending = trackDecision(tracker, { release: () => {} }, async () => {
    observedDuringDecide.push(tracker.pendingCount()); // dentro da cadeia, a espera já conta
    return gate.promise;
  });
  assert.deepEqual(observedDuringDecide, [1]);
  assert.equal(tracker.pendingCount(), 1);
  gate.resolve(null);
  await pending;
  assert.equal(tracker.pendingCount(), 0);
});

test("decisão do turno sem encaminhamento: a espera termina com a decisão; erro também termina", async () => {
  const tracker = createPendingWorkTracker(() => "c");
  const handover = { release: () => {} };
  assert.equal(await trackDecision(tracker, handover, async () => null), null);
  assert.equal(tracker.pendingCount(), 0);
  await assert.rejects(trackDecision(tracker, handover, () => Promise.reject(new Error("avaliação falhou"))), /avaliação falhou/);
  assert.equal(tracker.pendingCount(), 0);
});

test("ponte do handover é solta em qualquer saída do turno (finally)", async () => {
  const tracker = createPendingWorkTracker(() => "c");
  const handover = { release: () => {} };
  await trackDecision(tracker, handover, async () => ({ verticalHandoffForwardInput: "qualquer" }));
  assert.equal(tracker.pendingCount(), 1);
  handover.release();
  handover.release(); // idempotente
  assert.equal(tracker.pendingCount(), 0);
});

test("isFrontDoorWaiting: trabalho rastreado ou run ainda sem texto; run com texto em streaming deixa de mostrar", () => {
  assert.equal(isFrontDoorWaiting({ pendingCount: 0, isStreaming: false, hasStreamingMessage: false }), false);
  assert.equal(isFrontDoorWaiting({ pendingCount: 1, isStreaming: false, hasStreamingMessage: false }), true);
  assert.equal(isFrontDoorWaiting({ pendingCount: 0, isStreaming: true, hasStreamingMessage: false }), true, "run aguardando a primeira resposta (antigo “Pensando...”)");
  assert.equal(isFrontDoorWaiting({ pendingCount: 0, isStreaming: true, hasStreamingMessage: true }), false, "transição para o streaming");
  assert.equal(isFrontDoorWaiting({ pendingCount: 1, isStreaming: true, hasStreamingMessage: true }), true, "trabalho rastreado pendente continua mostrando");
});

test("independência de agente/vertical: o mesmo mecanismo serve a qualquer origem de solicitação", async () => {
  const tracker = createPendingWorkTracker(() => "mesma-conversa");
  // Nomes arbitrários: o estado não conhece agente nem vertical; só identidade e conversa.
  const origens = ["vertical-a", "vertical-b", "logistica", "agente-sem-vertical"];
  const gates = origens.map(() => deferred<void>());
  const pendentes = origens.map((_origem, i) => tracker.track(() => gates[i].promise));
  assert.equal(tracker.pendingCount(), origens.length);
  for (const [i, gate] of gates.entries()) {
    gate.resolve();
    await pendentes[i];
    assert.equal(tracker.pendingCount(), origens.length - i - 1);
  }
  // A decisão com encaminhamento é tratada pelo campo genérico, seja qual for a vertical que o preencheu.
  for (const forward of ["consulta imob", "consulta logística", "consulta de outra vertical"]) {
    const handover = { release: () => {} };
    await trackDecision(tracker, handover, async () => ({ verticalHandoffForwardInput: forward }));
    assert.equal(tracker.pendingCount(), 1, forward);
    handover.release();
    assert.equal(tracker.pendingCount(), 0, forward);
  }
});

// Escopo com sessão: o mesmo cálculo do launcher (geração da conversa + chave que separa hidratação, troca real e logout/remoção).
function sessionScope() {
  const keyer = createScopeKeyer();
  const state = { generation: 0, user: undefined as string | undefined, token: undefined as string | undefined, agent: undefined as string | undefined };
  const tracker = createPendingWorkTracker(() => `${state.generation}:${keyer({ user: state.user, session: state.token ? "active" : undefined, agent: state.agent })}`);
  return { state, tracker, keyer };
}

test("escopo: hidratação inicial da sessão não esconde a solicitação que acabou de começar", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; // sessão ativa, usuário ainda não hidratado
  const gate = deferred<string>();
  const pending = tracker.track(() => gate.promise);
  assert.equal(tracker.pendingCount(), 1);
  state.user = "u1"; // hidratação: ausente → definido
  state.agent = "agente-a";
  assert.equal(tracker.pendingCount(), 1, "hidratação não é troca de contexto");
  gate.resolve("ok");
  await pending;
  assert.equal(tracker.pendingCount(), 0);
});

test("escopo: troca real de usuário não herda pendências anteriores e o fim tardio delas não afeta o contexto novo", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; state.user = "u1";
  const antiga = deferred<string>();
  const pAntiga = tracker.track(() => antiga.promise);
  assert.equal(tracker.pendingCount(), 1);
  state.user = "u2"; // troca real
  assert.equal(tracker.pendingCount(), 0, "o contexto novo começa sem pendência herdada");
  const nova = deferred<string>();
  const pNova = tracker.track(() => nova.promise);
  assert.equal(tracker.pendingCount(), 1);
  antiga.resolve("tardia"); await pAntiga;
  assert.equal(tracker.pendingCount(), 1, "fim tardio da anterior não encerra a atual");
  nova.resolve("ok"); await pNova;
  assert.equal(tracker.pendingCount(), 0);
});

test("escopo: troca real de agente e de conversa (geração) também isolam", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; state.user = "u1"; state.agent = "agente-a";
  const a = deferred<string>(); const pa = tracker.track(() => a.promise);
  state.agent = "agente-b";
  assert.equal(tracker.pendingCount(), 0, "agente trocado");
  const b = deferred<string>(); const pb = tracker.track(() => b.promise);
  assert.equal(tracker.pendingCount(), 1);
  state.generation += 1; // nova conversa
  assert.equal(tracker.pendingCount(), 0, "conversa trocada");
  a.resolve("x"); b.resolve("y"); await Promise.all([pa, pb]);
  assert.equal(tracker.pendingCount(), 0);
});

test("escopo: logout/invalidação invalida pendências e voltar ao mesmo usuário não as ressuscita", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; state.user = "u1";
  const antiga = deferred<string>();
  const pAntiga = tracker.track(() => antiga.promise);
  assert.equal(tracker.pendingCount(), 1);
  state.token = undefined; state.user = undefined; // logout (clearSession)
  assert.equal(tracker.pendingCount(), 0, "logout invalida");
  state.token = "t2"; state.user = "u1"; // login de novo, mesmo usuário: contexto NOVO (hidratação após a remoção)
  assert.equal(tracker.pendingCount(), 0, "retorno ao usuário anterior não ressuscita a pendência de antes do logout");
  const nova = deferred<string>(); const pNova = tracker.track(() => nova.promise);
  assert.equal(tracker.pendingCount(), 1);
  antiga.resolve("tardia"); await pAntiga;
  assert.equal(tracker.pendingCount(), 1, "fim tardio da sessão anterior não afeta a nova");
  nova.resolve("ok"); await pNova;
  assert.equal(tracker.pendingCount(), 0);
});

test("escopo: remoção do usuário com sessão ativa também invalida; rotação de token não", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; state.user = "u1";
  const gate = deferred<string>(); const pending = tracker.track(() => gate.promise);
  state.token = "t2"; // rotação de token: continua sessão ativa
  assert.equal(tracker.pendingCount(), 1, "rotação de token não é troca de contexto");
  state.user = undefined; // remoção efetiva do usuário
  assert.equal(tracker.pendingCount(), 0, "remoção invalida");
  state.user = "u1";
  assert.equal(tracker.pendingCount(), 0, "retorno ao usuário anterior não ressuscita");
  gate.resolve("x"); await pending;
});

test("chave de escopo só avança: nunca repete um valor antigo", () => {
  const keyer = createScopeKeyer();
  const keys = [keyer({ user: undefined }), keyer({ user: "u1" }), keyer({ user: "u2" }), keyer({ user: "u1" }), keyer({ user: undefined }), keyer({ user: "u1" })];
  assert.equal(keys[0], keys[1], "hidratação mantém a chave");
  assert.deepEqual(new Set(keys.slice(1)).size, 4, "u1 → u2 → u1 → ausente → u1: cada troca/remoção gera chave nova, sem repetir");
});

test("decisão tardia: a ponte do handoff nasce no escopo de origem e não cria espera no contexto novo", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; state.user = "u1";
  const handover = { release: () => {} };
  const avaliacao = deferred<{ verticalHandoffForwardInput?: string }>();
  const decisao = trackDecision(tracker, handover, () => avaliacao.promise);
  assert.equal(tracker.pendingCount(), 1);
  state.user = "u2"; // troca real enquanto a avaliação está pendente
  assert.equal(tracker.pendingCount(), 0);
  const atual = deferred<string>(); const pAtual = tracker.track(() => atual.promise);
  assert.equal(tracker.pendingCount(), 1, "a solicitação do contexto novo");
  avaliacao.resolve({ verticalHandoffForwardInput: "consulta qualquer" }); // decisão tardia tenta criar a ponte
  await decisao;
  assert.equal(tracker.pendingCount(), 1, "a ponte tardia nasceu fora do contexto atual: não soma espera");
  handover.release();
  assert.equal(tracker.pendingCount(), 1, "soltar a ponte tardia não encerra a espera da solicitação atual");
  atual.resolve("ok"); await pAtual;
  assert.equal(tracker.pendingCount(), 0);
});

test("decisão tardia na MESMA conversa: a ponte conta normalmente", async () => {
  const { state, tracker } = sessionScope();
  state.token = "t1"; state.user = "u1";
  const handover = { release: () => {} };
  await trackDecision(tracker, handover, async () => ({ verticalHandoffForwardInput: "qualquer" }));
  assert.equal(tracker.pendingCount(), 1);
  handover.release();
  assert.equal(tracker.pendingCount(), 0);
});
