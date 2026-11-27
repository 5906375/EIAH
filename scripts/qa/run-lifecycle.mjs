import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180 (QA_BASE_URL sobrescreve). Saída: QA_OUT. Filtros opcionais: QA_ONLY (ex.: R1,I2).
//
// Ciclo de vida das execuções (runs) e intake contextual do Front Door (/app/chat) sobre o launcher REAL. Tudo sintético e LOCAL:
//  - toda rota /api/** é atendida por mock (route.fulfill): SSE, polling, estado da run, cancelamento e o intake; nenhum provider, nenhuma rede;
//  - só são toleradas as escritas de ALLOWED; qualquer outra (inclusive criar conta de billing, pagar, ativar) é bloqueada (403) e reprova o cenário;
//  - os "providers" e o servidor são dublês: isto NÃO é validação em staging e NÃO prova a causa de nenhum travamento real.
const out = process.env.QA_OUT || 'docs/evidence/front-door-intake-lifecycle';
const base = process.env.QA_BASE_URL || 'http://localhost:5180';
const ALLOWED = new Set(['POST /api/runs', 'POST /api/session', 'POST /api/front-door/intake', 'POST /api/helpdesk/telemetry', 'POST /api/helpdesk/session']);
const CANCEL = /^POST \/api\/runs\/(run-\d+)\/cancel$/;
const RUN_QUESTION = 'não tem como começar gratuita ?'; // sem decisão local: vira run (diagnóstico do Front Door)
const RESULT = 'RESPOSTA_SINTETICA_DO_CICLO_DE_VIDA';
const CATALOG_ANSWER = 'Segundo o catálogo atual, não há plano gratuito nem período de teste registrado. (resposta sintética composta do catálogo)';
const plans = [
  { code: 'solo', label: 'Solo', monthlyPriceCents: 49000, includedUsers: 3, includedRuns: 1500 },
  { code: 'starter', label: 'Starter B2B', monthlyPriceCents: 149000, includedUsers: 10, includedRuns: 5000 },
];

const KNOWN = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'I1', 'I2', 'I3', 'I4', 'I5'];
const only = (process.env.QA_ONLY ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const badOnly = only.filter((x) => !KNOWN.includes(x));
if (badOnly.length || ((process.env.QA_ONLY ?? '').trim() && !only.length)) { console.error(`Filtro inválido: QA_ONLY=${process.env.QA_ONLY}. Cenários: ${KNOWN.join(',')}.`); process.exit(2); }
const want = (id) => !only.length || only.includes(id);
await mkdir(out, { recursive: true });

const session = { tenantId: 'tenant-wait', workspaceId: 'workspace-wait', userId: 'user-wait', activeDomain: 'core', availableDomains: ['core'], entitlements: {}, productInstallations: [], verticals: [], roles: [], branding: { brandName: 'EIAH', workspaceLabel: 'Workspace sintético' }, experience: { roleProfile: 'workspace_admin', primaryNavigation: [], landingPath: '/app/chat' } };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const until = async (condition, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (condition()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`tempo esgotado: ${label}`); };
const sse = (events) => ({ status: 200, body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') });
const ev = (type, payload = {}, id = `${type}-${Math.random().toString(36).slice(2, 8)}`, runId = 'run-1') => ({ id, runId, type, payload });

// `stream(runId, n)`: resposta do SSE (uma promessa do teste segura a conexão); `events`: lotes devolvidos pelo polling; `runStatus`: estado persistido da run.
async function open(browser, { clock = false, seedBilling = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const ctx = { blocked: [], foreign: new Set(), errors: [], runPosts: [], cancelPosts: [], cancelStatus: 200, streams: [], stream: null, eventBatches: [], eventsStatus: 200, eventCalls: 0, runGets: 0, runState: { 'run-1': 'running' }, intakeCalls: [], intakeGate: null, intakeResponse: null, billingWrites: 0 };
  page.on('pageerror', (e) => ctx.errors.push(`${e.message} @ ${String(e.stack ?? '').split('\n').slice(1, 3).join(' | ').slice(0, 220)}`));
  if (process.env.QA_DEBUG) page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  if (clock) await page.clock.install();
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), async (route) => { ctx.foreign.add(new URL(route.request().url()).hostname); await route.abort(); });
  await page.addInitScript(([billing]) => {
    localStorage.setItem('eiah_token', 'synthetic-fixture'); localStorage.setItem('tenant_id', 'tenant-wait'); localStorage.setItem('workspace_id', 'workspace-wait'); localStorage.setItem('active_domain', 'core');
    localStorage.setItem('eiah:greeted:tenant-wait:workspace-wait', '1');
    const key = 'eiah:chat:tenant-wait:workspace-wait:EIAH:default';
    if (sessionStorage.getItem(key)) return; // recarregar preserva a conversa (e o acompanhamento) guardados
    const messages = [{ id: 'user-seed', role: 'user', content: 'Conversa sintética anterior', status: 'done' }, { id: 'seed-0', role: 'assistant', content: 'Histórico sintético 0: conversa anterior.', status: 'done' }];
    if (billing) messages.push({ id: 'assistant-billing-offer', role: 'assistant', content: 'Ótimo! Estes são os planos disponíveis. Qual combina mais com a sua imobiliária?', status: 'done', presentationSnapshot: billing });
    sessionStorage.setItem(key, JSON.stringify({ messages, runId: null }));
  }, [seedBilling ? { routeIntent: 'help', quickReplies: [], frontDoorBilling: { status: 'offer', plans }, verticalActivation: { status: 'access_request_proposed', verticalId: 'imob' } } : null]);
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const key = `${req.method()} ${path}`;
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (/\/front-door\/billing\/(account|first-payment)$/.test(path) && req.method() !== 'GET') ctx.billingWrites += 1;
    if (req.method() !== 'GET' && !ALLOWED.has(key) && !CANCEL.test(key)) { ctx.blocked.push(key); return json({ ok: false, error: { code: 'BLOCKED_BY_QA' } }, 403); }
    if (key === 'POST /api/runs') { const id = `run-${ctx.runPosts.push(JSON.parse(req.postData() || '{}'))}`; ctx.runState[id] ??= 'running'; return json({ ok: true, data: { id, workspaceId: 'workspace-wait', agent: 'EIAH', status: 'pending' }, queued: true }, 202); }
    const cancel = CANCEL.exec(key);
    if (cancel) { ctx.cancelPosts.push(cancel[1]); return json(ctx.cancelStatus === 409 ? { ok: false, error: { code: 'RUN_ALREADY_FINISHED' } } : ctx.cancelStatus >= 500 ? { ok: false } : { ok: true, data: { id: cancel[1] } }, ctx.cancelStatus); }
    if (key === 'POST /api/front-door/intake') {
      const n = ctx.intakeCalls.push(JSON.parse(req.postData() || '{}'));
      if (ctx.intakeGate) { const gate = ctx.intakeGate; ctx.intakeGate = null; await gate.promise; }
      const response = ctx.intakeResponse ? await ctx.intakeResponse(ctx.intakeCalls[n - 1], n) : { status: 200, data: { outcome: 'answered', content: CATALOG_ANSWER, endsContext: false } };
      return json(response.status && response.status !== 200 ? { ok: false } : { ok: true, data: response.data }, response.status ?? 200);
    }
    if (/\/cost-breakdown$|\/billing\/reconciliation/.test(path)) return json({ ok: false }, 404); // custo da run não faz parte destes cenários
    const stream = /^\/api\/runs\/(run-\d+)\/stream$/.exec(path);
    if (stream) {
      const n = ctx.streams.push(stream[1]);
      const reply = ctx.stream ? await ctx.stream(stream[1], n) : sse([]);
      return route.fulfill({ status: reply.status, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: reply.body });
    }
    if (/^\/api\/runs\/(run-\d+)\/events$/.test(path)) {
      ctx.eventCalls += 1;
      if (ctx.eventsStatus >= 500) return json({ ok: false }, ctx.eventsStatus);
      return json({ items: ctx.eventBatches.shift() ?? [] });
    }
    const runGet = /^\/api\/runs\/(run-\d+)$/.exec(path);
    if (runGet && req.method() === 'GET') {
      ctx.runGets += 1; const status = ctx.runState[runGet[1]] ?? 'running';
      return json({ id: runGet[1], workspaceId: 'workspace-wait', agent: 'EIAH', status, userId: 'user-wait', errorCode: status === 'blocked' ? 'USER_CANCELLED' : null, response: status === 'success' ? RESULT : null });
    }
    const body = req.method() !== 'GET' ? { ok: true, data: { id: 'mock' } } : path.endsWith('/session/context') ? { ok: true, data: session } : path.endsWith('/help/eiah/query') ? { ok: true, data: { hits: [] } } : { ok: false, data: null, items: [] };
    await route.fulfill({ json: body });
  });
  await page.goto(`${base}/app/chat`, { waitUntil: 'domcontentloaded' });
  const surface = page.getByTestId('launcher-conversation-surface');
  await surface.getByText('Histórico sintético 0', { exact: false }).first().waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.getSessionState?.().userId === 'user-wait', null, { timeout: 30000 });
  return { page, ctx, surface, waiting: page.getByTestId('front-door-waiting') };
}
const ask = async (page, text) => { await page.locator('.front-door-composer textarea').last().fill(text); await page.getByRole('button', { name: /^Enviar(?: mensagem)?$/i }).click(); };
const clean = (ctx, label) => {
  assert.deepEqual(ctx.blocked, [], `${label}: escrita inesperada ${JSON.stringify(ctx.blocked)}`);
  assert.equal(ctx.billingWrites, 0, `${label}: consulta/ciclo de vida não pode criar conta nem pagar`);
  assert.deepEqual([...ctx.foreign].filter((h) => !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(h)), [], `${label}: host externo inesperado`);
  assert.deepEqual(ctx.errors, [], `${label}: erros de runtime ${JSON.stringify(ctx.errors).slice(0, 300)}`);
};
// A resposta é DIGITADA aos poucos: só vale como entregue quando o fim do texto (marcador) já está na conversa, n vezes.
const MARKER = 'resposta sintética composta do catálogo';
const answersDelivered = (page, n) => page.waitForFunction(([marker, total]) => document.body.innerText.split(marker).length - 1 >= total, [MARKER, n], { timeout: 30000 });
const settleFrames = async (page, frames = 12) => { for (let i = 0; i < frames; i += 1) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); };
const count = (surface, text) => surface.getByText(text, { exact: false }).count();
const startRun = async (h, gate = deferred()) => {
  h.ctx.stream = async () => { await gate.promise; return gate.reply ?? sse([]); };
  await ask(h.page, RUN_QUESTION);
  await h.waiting.waitFor({ timeout: 30000 });
  await until(() => h.ctx.streams.length >= 1, 'SSE conectado');
  await h.page.getByRole('button', { name: 'Cancelar execução' }).waitFor({ timeout: 15000 });
  return gate;
};
const release = (gate, reply) => { gate.reply = reply; gate.resolve(); };

const browser = await chromium.launch({ headless: true });
const results = []; const failures = [];
const scenario = async (id, run) => {
  if (!want(id)) return;
  const h = await open(browser, id.startsWith('I') ? { seedBilling: true } : { clock: ['R8', 'R9', 'R11'].includes(id) });
  const row = { id, status: 'PASSED' };
  try { await run(h); clean(h.ctx, id); } catch (error) {
    row.status = 'FAILED'; row.message = String(error.message).split('\n').slice(0, 6).join(' ').slice(0, 400); failures.push(`${id}: ${row.message}`);
    await h.page.screenshot({ path: `${out}/failure-${id}.png` }).catch(() => undefined);
  } finally { await h.page.close(); }
  results.push(row);
};

// ---------- Ciclo de vida da run ----------
await scenario('R1', async ({ page, ctx, surface, waiting }) => { // conclusão por SSE; duplicados e tardios ignorados; resultado carregado antes de encerrar a espera
  const h = { page, ctx, surface, waiting };
  const gate = await startRun(h);
  assert.equal(await waiting.count(), 1);
  assert.equal(await waiting.innerText(), 'Buscando informação...');
  ctx.runState['run-1'] = 'success';
  const completed = ev('run.completed', { status: 'success' }, 'evt-completed');
  release(gate, sse([ev('run.enqueued'), ev('run.started'), ev('run.orchestrator.finished'), completed, completed, ev('run.failed', { errorCode: 'TARDIO' }, 'evt-late-failed')]));
  await surface.getByText(RESULT, { exact: false }).first().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
  await settleFrames(page);
  assert.equal(await count(surface, RESULT), 1, 'o resultado aparece uma única vez (evento duplicado ignorado)');
  assert.equal(await count(surface, 'A execução falhou'), 0, 'evento terminal tardio e contraditório é ignorado');
  assert.equal(ctx.runGets, 1, 'o resumo foi buscado uma vez');
});
await scenario('R2', async (h) => { // falha por SSE: mensagem explícita só com código estruturado, indicador some, a conversa destrava
  const gate = await startRun(h);
  release(gate, sse([ev('run.started'), ev('run.failed', { status: 'error', message: 'detalhe interno: senha=SEGREDO123', errorCode: 'PROVIDER_UNAVAILABLE' })]));
  await h.surface.getByText('A execução falhou e nenhum resultado foi concluído (código: PROVIDER_UNAVAILABLE)', { exact: false }).first().waitFor({ timeout: 20000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
  assert.equal(await count(h.surface, 'SEGREDO123'), 0, 'mensagem livre do servidor não vai para a conversa');
  h.ctx.stream = null;
  await ask(h.page, RUN_QUESTION); await until(() => h.ctx.runPosts.length === 2, 'segundo envio liberado depois da falha');
});
await scenario('R3', async (h) => { // cancelamento: pedido enviado ≠ confirmado; sem duplo pedido; confirmação pelo servidor encerra
  const gate = await startRun(h);
  await h.page.getByRole('button', { name: 'Cancelar execução' }).click();
  await until(() => h.ctx.cancelPosts.length === 1, 'pedido de cancelamento');
  await h.surface.getByText('O servidor aceitou o pedido de cancelamento', { exact: false }).first().waitFor({ timeout: 10000 });
  const requested = h.page.getByRole('button', { name: 'Cancelamento solicitado' });
  await requested.waitFor({ timeout: 10000 });
  assert.equal(await requested.isDisabled(), true, 'sem pedido duplicado');
  assert.equal(await h.waiting.count(), 1, 'pedido enviado NÃO encerra a espera: só o servidor confirma');
  assert.equal(await count(h.surface, 'O servidor confirmou o cancelamento'), 0);
  release(gate, sse([ev('run.cancel_requested', { reasonCode: 'USER_CANCELLED' }), ev('run.cancelled', { reasonCode: 'USER_CANCELLED' })]));
  await h.surface.getByText('O servidor confirmou o cancelamento', { exact: false }).first().waitFor({ timeout: 20000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
  assert.equal(h.ctx.cancelPosts.length, 1);
});
await scenario('R4', async (h) => { // cancelamento recusado (409, run já terminou): diz isso e confirma o desfecho real pelo estado persistido
  const gate = await startRun(h); h.ctx.cancelStatus = 409; h.ctx.runState['run-1'] = 'success'; void gate;
  await h.page.getByRole('button', { name: 'Cancelar execução' }).click();
  await h.surface.getByText('já tinha terminado', { exact: false }).first().waitFor({ timeout: 10000 });
  await h.surface.getByText(RESULT, { exact: false }).first().waitFor({ timeout: 15000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
});
await scenario('R5', async (h) => { // falha do pedido de cancelamento: a execução continua, o botão volta e pode repetir
  await startRun(h); h.ctx.cancelStatus = 500;
  await h.page.getByRole('button', { name: 'Cancelar execução' }).click();
  await h.surface.getByText('Não consegui enviar o pedido de cancelamento', { exact: false }).first().waitFor({ timeout: 10000 });
  assert.equal(await h.waiting.count(), 1, 'a espera continua: nada foi cancelado');
  const again = h.page.getByRole('button', { name: 'Cancelar execução' });
  await again.waitFor({ timeout: 10000 }); assert.equal(await again.isDisabled(), false);
});
await scenario('R6', async (h) => { // parar de aguardar é local: NÃO cancela no servidor; resultado tardio não reabre a espera
  const gate = await startRun(h);
  await h.page.getByRole('button', { name: 'Parar de aguardar' }).click();
  await h.surface.getByText('Parei de aguardar aqui', { exact: false }).first().waitFor({ timeout: 10000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 10000 });
  assert.equal(h.ctx.cancelPosts.length, 0, 'interromper a espera não cancela a execução no servidor');
  h.ctx.runState['run-1'] = 'success';
  release(gate, sse([ev('run.completed')]));
  await settleFrames(h.page, 40);
  assert.equal(await h.waiting.count(), 0); assert.equal(await count(h.surface, RESULT), 0, 'resultado tardio, depois de parar de aguardar, é ignorado');
});
await scenario('R7', async (h) => { // polling quando o SSE cai: evento terminal pelo polling
  h.ctx.stream = async () => ({ status: 500, body: '' });
  h.ctx.runState['run-1'] = 'success';
  h.ctx.eventBatches = [[ev('run.started')], [ev('run.completed')]];
  await ask(h.page, RUN_QUESTION);
  await h.surface.getByText(RESULT, { exact: false }).first().waitFor({ timeout: 30000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
  assert.ok(h.ctx.eventCalls >= 1, 'o polling foi usado');
  assert.equal(await count(h.surface, RESULT), 1);
});
await scenario('R8', async (h) => { // limite de espera: para de aguardar SEM cancelar; se o estado persistido já é terminal, conclui com o resultado
  await startRun(h);
  await h.page.clock.fastForward(121000);
  await h.surface.getByText('Ainda não recebi o resultado desta execução', { exact: false }).first().waitFor({ timeout: 15000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 10000 });
  assert.equal(h.ctx.cancelPosts.length, 0, 'timeout de acompanhamento NÃO é cancelamento no servidor');
  assert.ok(h.ctx.runGets >= 1, 'antes de desistir, consultou o estado real da run');
});
await scenario('R9', async (h) => { // limite de espera com a run já concluída no servidor: entrega o resultado em vez de dizer que expirou
  await startRun(h); h.ctx.runState['run-1'] = 'success';
  await h.page.clock.fastForward(121000);
  await h.surface.getByText(RESULT, { exact: false }).first().waitFor({ timeout: 15000 });
  assert.equal(await count(h.surface, 'Ainda não recebi o resultado'), 0);
});
await scenario('R10', async (h) => { // nova conversa com run em andamento: cancelamento PEDIDO, aviso explícito, eventos tardios não vazam
  const gate = await startRun(h);
  const sidebar = h.page.getByRole('complementary', { name: 'Workspace e operações' });
  const toggle = sidebar.getByRole('button', { name: /^Painel do workspace/ });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await sidebar.getByRole('button', { name: 'Nova conversa' }).click();
  await until(() => h.ctx.cancelPosts.length === 1, 'cancelamento pedido ao abrir nova conversa');
  await h.surface.getByText('pedi o cancelamento da execução da conversa anterior e o servidor aceitou o pedido', { exact: false }).first().waitFor({ timeout: 10000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 10000 });
  h.ctx.runState['run-1'] = 'success';
  release(gate, sse([ev('run.completed')]));
  await settleFrames(h.page, 40);
  assert.equal(await count(h.surface, RESULT), 0, 'resultado da conversa anterior não aparece na nova');
  assert.equal(h.ctx.runGets, 0, 'nem sequer foi buscado');
});
await scenario('R11', async (h) => { // servidor inalcançável (SSE e polling): para de aguardar COM aviso, sem cancelar
  h.ctx.stream = async () => ({ status: 500, body: '' }); h.ctx.eventsStatus = 503;
  await ask(h.page, RUN_QUESTION);
  await h.page.getByRole('button', { name: 'Parar de aguardar' }).waitFor({ timeout: 15000 });
  for (let i = 0; i < 4; i += 1) { await h.page.clock.fastForward(4100); await settleFrames(h.page, 4); }
  await h.surface.getByText('Perdi a conexão com o servidor', { exact: false }).first().waitFor({ timeout: 15000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 10000 });
  assert.equal(h.ctx.cancelPosts.length, 0);
});
await scenario('R12', async (h) => { // recarregar com a run ainda em andamento: retoma o acompanhamento e entrega o resultado
  const gate = await startRun(h);
  const second = deferred(); h.ctx.stream = async () => { await second.promise; return second.reply ?? sse([]); };
  await h.page.reload({ waitUntil: 'domcontentloaded' });
  await h.page.getByRole('button', { name: 'Cancelar execução' }).waitFor({ timeout: 30000 });
  assert.equal(await h.waiting.count(), 1, 'a espera foi retomada, não abandonada');
  h.ctx.runState['run-1'] = 'success';
  release(second, sse([ev('run.completed')]));
  await h.surface.getByText(RESULT, { exact: false }).first().waitFor({ timeout: 20000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
  void gate;
});
await scenario('R13', async (h) => { // recarregar depois que a run terminou (falhou): o desfecho é dito, sem espera
  await startRun(h);
  h.ctx.runState['run-1'] = 'error';
  await h.page.reload({ waitUntil: 'domcontentloaded' });
  await h.surface.getByText('A execução falhou e nenhum resultado foi concluído', { exact: false }).first().waitFor({ timeout: 30000 });
  assert.equal(await h.waiting.count(), 0);
});
await scenario('R14', async (h) => { // troca real de usuário com run acompanhada: NADA é cancelado com a credencial do contexto novo (descarte local) e a espera não vaza
  const gate = await startRun(h);
  await h.page.evaluate(() => window.updateSession({ userId: 'user-other' }));
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 10000 });
  await settleFrames(h.page, 20);
  assert.equal(h.ctx.cancelPosts.length, 0, 'sem pedido de cancelamento com a credencial do contexto novo');
  h.ctx.runState['run-1'] = 'success'; release(gate, sse([ev('run.completed')]));
  await settleFrames(h.page, 40);
  assert.equal(await count(h.surface, RESULT), 0, 'o resultado do contexto antigo não aparece no novo');
});

// ---------- Intake contextual na escolha de plano ----------
const planButtons = (page) => page.getByRole('button', { name: 'Escolher' });
await scenario('I1', async (h) => { // perguntas equivalentes → intake (sem run, sem efeito); estado e botões preservados
  const phrases = ['não tem como começar gratuita ?', 'Existe algum período de teste?', 'Posso começar sem pagar?', 'tem desconto pra ONG?'];
  await planButtons(h.page).first().waitFor({ timeout: 20000 });
  for (const [index, phrase] of phrases.entries()) {
    const gate = deferred(); h.ctx.intakeGate = gate;
    await ask(h.page, phrase);
    await h.waiting.waitFor({ timeout: 15000 });
    await until(() => h.ctx.intakeCalls.length === index + 1, 'intake chamado');
    assert.equal(await h.waiting.innerText(), 'Buscando informação...', 'a espera do intake usa o indicador compartilhado');
    gate.resolve();
    await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
    await answersDelivered(h.page, index + 1);
    await planButtons(h.page).first().waitFor({ timeout: 15000 });
    assert.equal(await planButtons(h.page).count(), plans.length, 'os botões dos planos continuam disponíveis depois da resposta');
  }
  assert.deepEqual(h.ctx.intakeCalls.map((c) => c.message), phrases, 'cada pergunta literal chegou ao intake');
  assert.deepEqual(h.ctx.intakeCalls[0].context, { verticalId: 'imob', step: 'offer' });
  assert.equal(h.ctx.runPosts.length, 0, 'nenhuma run: o intake responde no contexto');
  await answersDelivered(h.page, phrases.length);
  assert.equal(await count(h.surface, 'não há plano gratuito nem período de teste registrado'), phrases.length);
  assert.equal(await h.page.getByRole('button', { name: 'Mudar de assunto' }).count(), 1, 'saída explícita oferecida na última resposta');
  await h.page.screenshot({ path: `${out}/intake-answer-390.png` });
});
await scenario('I2', async (h) => { // contexto sobrevive a perguntas intermediárias: escolher plano continua funcionando e a consulta não contrata
  await planButtons(h.page).first().waitFor({ timeout: 20000 });
  let delivered = 0;
  for (const phrase of ['posso pagar depois?', 'qual a diferença entre os planos?']) {
    await ask(h.page, phrase);
    await answersDelivered(h.page, ++delivered);
    await planButtons(h.page).first().waitFor({ timeout: 15000 });
  }
  assert.equal(h.ctx.intakeCalls.length, 2);
  await planButtons(h.page).first().click(); // escolha explícita, pelo botão
  await h.surface.getByText('O plano **Solo** custa', { exact: false }).or(h.surface.getByText('Boa escolha', { exact: false })).first().waitFor({ timeout: 15000 });
  assert.equal(h.ctx.intakeCalls.length, 2, 'o botão não passa pelo intake');
  assert.equal(h.ctx.billingWrites, 0, 'escolher o plano só pede confirmação: nada foi criado nem pago');
});
await scenario('I3', async (h) => { // provider indisponível / erro HTTP: desfecho explícito, sem condição comercial inventada, etapa preservada
  await planButtons(h.page).first().waitFor({ timeout: 20000 });
  h.ctx.intakeResponse = async () => ({ status: 200, data: { outcome: 'unavailable', content: 'Não consegui interpretar sua pergunta agora: o serviço de interpretação está indisponível. Nada foi alterado e eu não vou supor condições comerciais. Você pode tentar de novo ou continuar pelos botões.', endsContext: false } });
  await ask(h.page, 'não tem como começar gratuita ?');
  await h.surface.getByText('Nada foi alterado e eu não vou supor condições comerciais', { exact: false }).first().waitFor({ timeout: 15000 });
  h.ctx.intakeResponse = async () => ({ status: 503 });
  await ask(h.page, 'Posso começar sem pagar?');
  await until(() => h.ctx.intakeCalls.length === 2, 'segunda chamada');
  await h.page.waitForFunction(() => document.body.innerText.split('Nada foi alterado e eu não vou supor condições comerciais').length >= 3, null, { timeout: 15000 });
  assert.equal(await count(h.surface, 'gratuito'), 0, 'nenhuma condição comercial inventada');
  await planButtons(h.page).first().waitFor({ timeout: 15000 });
  assert.equal(h.ctx.runPosts.length, 0);
});
await scenario('I4', async (h) => { // mudar de assunto é explícito: botão encerra a etapa e reconhece a transição; depois o intake não intercepta
  await planButtons(h.page).first().waitFor({ timeout: 20000 });
  await ask(h.page, 'qual a previsão do tempo?');
  const leave = h.page.getByRole('button', { name: 'Mudar de assunto' });
  await leave.waitFor({ timeout: 15000 });
  await leave.click();
  await h.surface.getByText('encerrei a escolha de plano', { exact: false }).first().waitFor({ timeout: 15000 });
  assert.equal(await planButtons(h.page).count(), 0, 'sem botões de plano depois de encerrar');
  const before = h.ctx.intakeCalls.length;
  await ask(h.page, 'oi, tudo bem?');
  await settleFrames(h.page, 40);
  assert.equal(h.ctx.intakeCalls.length, before, 'etapa encerrada: o intake não intercepta mais');
});
await scenario('I5', async (h) => { // saída pedida em linguagem natural (interpretada pelo provider): encerra a etapa; nada criado, contratado ou pago
  await planButtons(h.page).first().waitFor({ timeout: 20000 });
  h.ctx.intakeResponse = async () => ({ status: 200, data: { outcome: 'leave', content: 'Certo, encerrei a escolha de plano. Nada foi criado, contratado ou pago. Sobre o que você quer falar?', endsContext: true } });
  await ask(h.page, 'deixa pra lá, quero falar de outra coisa');
  await h.surface.getByText('Nada foi criado, contratado ou pago', { exact: false }).first().waitFor({ timeout: 15000 });
  await h.page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
  assert.equal(await planButtons(h.page).count(), 0);
});

await browser.close();
const partial = only.length > 0;
const executed = results.map((r) => r.id);
const expected = only.length ? KNOWN.filter((id) => only.includes(id)) : KNOWN;
assert.deepEqual(executed, expected, 'cenários executados');
await writeFile(`${out}/browser-results.json`, JSON.stringify({ fixture: 'API, SSE, polling, cancelamento e intake 100% mockados; sem provider; execução LOCAL (não é validação em staging)', suite: partial ? 'PARCIAL (filtrada)' : 'COMPLETA', filters: { QA_ONLY: only }, executed, failures, results }, null, 2) + '\n');
assert.deepEqual(failures, [], `cenários reprovados: ${failures.join(' | ')}`);
console.log(`${partial ? 'PARCIAL (filtrada)' : 'COMPLETA'}: ${executed.length} cenário(s) [${executed.join(',')}] PASS`);
