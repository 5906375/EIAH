import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180 (QA_BASE_URL sobrescreve). Saída: QA_OUT.
//
// Indicador de espera "Buscando informação..." compartilhado do Front Door (/app/chat), independente de agente ou vertical.
// Fluxo REAL do launcher (digitar -> handoff -> resolve-turn) sobre a página real. Fixtures 100% sintéticas, nenhuma escrita real:
//  - toda rota /api/** é atendida por mock local (route.fulfill); o resolve-turn é segurado por uma promessa controlada pelo teste
//    (nenhum timer simula progresso: o indicador acompanha a solicitação pendente de verdade);
//  - só são toleradas as escritas abaixo (avaliação/consulta governadas e persistência de histórico do próprio front door, todas mockadas);
//  - qualquer outra escrita reprova o teste; hosts fora de localhost são ABORTADOS (só as fontes do index.html são toleradas).
const out = process.env.QA_OUT || 'docs/evidence/front-door-waiting-indicator';
const base = process.env.QA_BASE_URL || 'http://localhost:5180';
const ALLOWED_WRITES = new Set(['POST /api/chat/vertical-handoff', 'POST /api/imob/chat/resolve-turn', 'POST /api/imob/owners', 'POST /api/helpdesk/telemetry', 'POST /api/imob/chat/runtime-shadow-state', 'POST /api/imob/chat/conversations']);
// Filtros opcionais para depuração (QA_ONLY=A,V  QA_WIDTHS=320). Valores inválidos encerram com erro; execução filtrada é registrada como PARCIAL.
const KNOWN_SCENARIOS = ['H', 'R', 'E', 'C', 'L', 'A', 'V', 'Q', 'Q2', 'F', 'X', 'C2']; const KNOWN_WIDTHS = [320, 390, 1440];
const parseList = (name) => (process.env[name] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const only = parseList('QA_ONLY'); const onlyWidths = parseList('QA_WIDTHS').map(Number);
const invalid = [...only.filter((x) => !KNOWN_SCENARIOS.includes(x)).map((x) => `QA_ONLY=${x}`), ...onlyWidths.filter((x) => !KNOWN_WIDTHS.includes(x)).map((x) => `QA_WIDTHS=${x}`)];
for (const name of ['QA_ONLY', 'QA_WIDTHS']) if ((process.env[name] ?? '').trim() && !parseList(name).length) invalid.push(`${name}=${process.env[name]}`);
if (invalid.length) { console.error(`Filtro inválido: ${invalid.join(', ')}. Cenários: ${KNOWN_SCENARIOS.join(',')}. Larguras: ${KNOWN_WIDTHS.join(',')}.`); process.exit(2); }
let currentRow = null; // cenários efetivamente executados na largura corrente
const want = (id) => { const run = !only.length || only.includes(id); if (run) currentRow.executed.push(id); return run; };
const LABEL = 'Buscando informação...';
const TITLE = 'Imóveis arquivados';
const QUESTION = 'listar imóveis arquivados';
await mkdir(out, { recursive: true });

const session = { tenantId: 'tenant-wait', workspaceId: 'workspace-wait', userId: 'user-wait', activeDomain: 'imob', availableDomains: ['core', 'imob'], entitlements: { IMOB_INSTALLED: true }, productInstallations: [{ product: 'IMOB' }], verticals: [{ verticalId: 'IMOB', activeDomain: 'imob', label: 'IMOB', enabled: true, frontDoorSurface: 'chat' }], roles: [], branding: { brandName: 'EIAH', workspaceLabel: 'Workspace sintético' }, experience: { roleProfile: 'workspace_admin', primaryNavigation: [], landingPath: '/app/chat' } };
// Contrato consumido por requestVerticalHandoff: a resposta repete vertical, capacidade e modo pedidos (o app rejeita se divergirem).
// O mock responde conforme o pedido (imob ou log): o indicador não depende de qual vertical é.
const handoffFor = (body) => ({ ok: true, data: { ok: true, handoff: { version: 'chat.vertical_handoff.v2', handoffId: `fixture-${body.verticalId}`, vertical: { id: body.verticalId, label: body.verticalId === 'log' ? 'Logística & Comex' : 'IMOB', registryVersion: 'fixture' }, capability: { id: body.capabilityId, mode: body.mode }, outcome: 'allowed', reasonCode: 'VERTICAL_HANDOFF_ALLOWED', presentation: { source: 'operational', variant: 'chat_card' } } } });
// Sem capabilityId (caso da Logística) o app consulta o registro antes: GET /chat/vertical-registry (version, verticals[].status/capabilities[].allowedModes).
const REGISTRY = { ok: true, data: { version: 'vertical.registry.v1', verticals: [{ id: 'log', status: 'enabled', capabilities: [{ id: 'knowledge.search', allowedModes: ['read_only'] }] }, { id: 'imob', status: 'enabled', capabilities: [{ id: 'crm.forms', allowedModes: ['requires_write'] }] }] } };
// Formulário de cadastro de proprietário como o app o consome (isOwnerCreateForm exige submitTarget; buildOwnerCreateRequest lê ownerName/ownerPhone/ownerEmail).
const OWNER_FORM = { id: 'assistant-form', role: 'assistant', content: 'Preencha os campos abaixo para continuar o cadastro. (Formulário sintético.)', status: 'done', imobStructured: { id: 'structured-form', form: { entity: 'proprietario', action: 'create', label: 'Cadastrar proprietário', description: 'Dados do proprietário', submitTarget: 'imob.owners.create', fields: [{ name: 'ownerName', label: 'Nome completo', type: 'text', required: true, value: '' }, { name: 'ownerPhone', label: 'Telefone', type: 'text', value: '' }, { name: 'ownerEmail', label: 'Email', type: 'text', value: '' }], actions: [{ id: 'submit', label: 'Salvar cadastro', kind: 'primary' }, { id: 'cancel', label: 'Cancelar', kind: 'secondary' }] }, text: 'Formulário sintético.', card: { title: 'Prévia de teste', lines: ['Nenhum cadastro real executado.'] } } };
const LOG_QUESTION = 'Quero consultar a devolução de um contêiner.';
const turn = (label) => ({ ok: true, data: { mode: 'consult', action: 'crm.property.list', threadLabel: 'Imóvel', conversationState: { mode: 'consult', pendingSlot: 'none', resultOffset: 0, slots: {}, operational: null },
  presentation: { text: `${label}: encontrei 4 imóvel(is) arquivado(s) neste workspace.`, owner: 'Corretor', nextStep: 'Consulta somente leitura.', dedupeKey: 'crm.property.list:archived',
    card: { title: TITLE, lines: Array.from({ length: 4 }, (_, i) => `Unidade ${301 + i} | locacao | Cidade Exemplo | arquivado em 11/11/2026 | Proprietário: Sem proprietário vinculado`), ctas: [] } } } });
let lastOpen = null; // diagnóstico: última página aberta, para registrar o estado quando um cenário falha
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// `gates`: uma promessa por solicitação ao resolve-turn (na ordem); `ownersGate`: o salvar do formulário. A avaliação do handoff é segurada armando `ctx.handoffGate`
// ANTES do envio (segura só a próxima avaliação); o registro de verticais só responde com `ctx.registry = true` (senão a entrada da página não dispara handoff).
// `fail`: a 1a solicitação responde 500; `reduced`: prefers-reduced-motion; `form`: semeia um formulário de cadastro na conversa.
async function open(browser, { width, height, gates = [], ownersGate = null, fail = false, reduced = false, history = 14, form = false }) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const ctx = { blocked: [], foreign: new Set(), errors: [], resolveCalls: [], handoffCalls: [], ownerCalls: 0, handoffGate: null, registry: false };
  lastOpen = { page, ctx };
  page.on('pageerror', (e) => ctx.errors.push(e.message));
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), async (route) => { ctx.foreign.add(new URL(route.request().url()).hostname); await route.abort(); });
  await page.addInitScript(([n, formMessage]) => {
    localStorage.setItem('eiah_token', 'synthetic-wait-fixture'); localStorage.setItem('tenant_id', 'tenant-wait'); localStorage.setItem('workspace_id', 'workspace-wait'); localStorage.setItem('active_domain', 'imob');
    localStorage.setItem('eiah:greeted:tenant-wait:workspace-wait', '1');
    const messages = [{ id: 'user-seed', role: 'user', content: 'Conversa sintética anterior', status: 'done' }];
    for (let i = 0; i < n; i++) messages.push({ id: `seed-${i}`, role: 'assistant', content: `Histórico sintético ${i}: ${'Conteúdo anterior da conversa para exigir rolagem. '.repeat(5)}`, status: 'done' });
    if (formMessage) messages.push(formMessage);
    sessionStorage.setItem('eiah:chat:tenant-wait:workspace-wait:EIAH:default', JSON.stringify({ messages, runId: null }));
  }, [history, form ? OWNER_FORM : null]);
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const key = `${req.method()} ${path}`;
    if (process.env.QA_DEBUG) console.log('REQ', key);
    if (req.method() !== 'GET' && !ALLOWED_WRITES.has(key)) { ctx.blocked.push(key); await route.fulfill({ status: 403, json: { ok: false, error: { code: 'BLOCKED_BY_QA' } } }); return; }
    if (key === 'POST /api/imob/chat/resolve-turn') {
      const index = ctx.resolveCalls.push(JSON.parse(req.postData() || '{}').message) - 1;
      if (gates[index]) await gates[index].promise;
      if (fail && index === 0) { await route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_SYNTHETIC' } } }); return; }
      await route.fulfill({ json: turn(`resposta ${index + 1}`) }); return;
    }
    if (key === 'POST /api/chat/vertical-handoff') {
      const requested = JSON.parse(req.postData() || '{}');
      ctx.handoffCalls.push(requested.verticalId);
      const held = ctx.handoffGate; ctx.handoffGate = null; // segura só a próxima avaliação, a armada pelo teste (nunca a sonda de autoridade do carregamento)
      if (held) await held.promise;
      await route.fulfill({ json: handoffFor(requested) }); return;
    }
    if (key === 'POST /api/imob/owners') { // salvar do formulário: exclusivamente mock, segurado pelo teste
      ctx.ownerCalls += 1;
      if (ownersGate) await ownersGate.promise;
      await route.fulfill({ status: 201, json: { ok: true, data: { id: 'owner-fixture', name: 'Pessoa de demonstração' } } }); return;
    }
    const body = req.method() !== 'GET' ? { ok: true, data: { id: 'mock' } }
      : path.endsWith('/session/context') ? { ok: true, data: session }
      : path.endsWith('/chat/vertical-registry') && ctx.registry ? REGISTRY
      : path === '/api/imob/owners' ? { ok: true, data: { items: [] } }
      : { ok: false, data: null, items: [] };
    await route.fulfill({ json: body });
  });
  await page.goto(`${base}/app/chat`, { waitUntil: 'domcontentloaded' });
  const surface = page.getByTestId('launcher-conversation-surface');
  await surface.getByText('Histórico sintético 0', { exact: false }).first().waitFor({ timeout: 60000 });
  // Prontidão por estado real do app, sem timer: (1) a sessão hidratou (store de sessão: userId do contexto) e (2) a sonda de autoridade do IMOB (useImobAuthority,
  // que no carregamento chama o handoff e REINICIA ao hidratar o usuário) já deu veredito para o escopo atual (a barra de ações do IMOB só existe com veredito
  // permitido). Isso comprova que a sonda não vai mais consumir portões nem entrar na contagem base; não prova ausência de outra rede.
  await page.waitForFunction(() => window.getSessionState?.().userId === 'user-wait', null, { timeout: 30000 });
  await page.locator('button', { hasText: /^Proprietários/ }).first().waitFor({ state: 'attached', timeout: 30000 });
  return { page, surface, ctx, waiting: page.getByTestId('front-door-waiting') };
}
const send = async (page, text) => { if (process.env.QA_DEBUG) console.log('SEND', text); await page.locator('.front-door-composer textarea').last().fill(text); await page.getByRole('button', { name: /^Enviar(?: mensagem)?$/i }).click(); };
const replyCount = (page) => page.evaluate((title) => [...document.querySelectorAll('[data-message-id]')].filter((el) => el.textContent.includes(title)).length, TITLE);
const waitReplies = (page, n) => page.waitForFunction(([title, count]) => [...document.querySelectorAll('[data-message-id]')].filter((el) => el.textContent.includes(title)).length >= count, [TITLE, n], { timeout: 60000 });
const handoffDone = (surface) => surface.getByText('Negócios.', { exact: false }).first().waitFor({ timeout: 60000 });
const box = (surface, selector) => surface.evaluate((el, sel) => {
  const node = sel === 'last-reply' ? [...el.querySelectorAll('[data-message-id]')].filter((n) => n.textContent.includes('Imóveis arquivados')).at(-1) : el.querySelector(sel);
  if (!node) return null; const s = el.getBoundingClientRect(); const r = node.getBoundingClientRect();
  return { top: Math.round(r.top - s.top), bottom: Math.round(r.bottom - s.top), height: Math.round(r.height * 10) / 10, width: Math.round(r.width * 10) / 10, view: el.clientHeight };
}, selector);
const inside = (m) => m.top >= -1 && m.bottom <= m.view + 1;
const readable = (m) => m.top >= -1 && (m.height <= m.view ? m.bottom <= m.view + 1 : m.top <= 24);
const clean = (ctx, label) => {
  assert.deepEqual(ctx.blocked, [], `${label}: escrita inesperada`);
  assert.deepEqual([...ctx.foreign].filter((h) => !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(h)), [], `${label}: host externo inesperado (abortado)`);
  assert.deepEqual(ctx.errors, [], `${label}: erros de runtime`);
};
// Presença do indicador. Instalado ANTES da ação e desconectado ao fim do cenário. Cada mutação do DOM registra se o indicador existe.
const watchPresence = (page) => page.evaluate(() => { const log = []; const record = () => log.push(!!document.querySelector('[data-testid="front-door-waiting"]')); record(); const observer = new MutationObserver(record); observer.observe(document.body, { childList: true, subtree: true }); window.__presence = { log, stop: () => observer.disconnect() }; });
const presenceLog = (page) => page.evaluate(() => window.__presence.log.slice());
const stopPresence = (page) => page.evaluate(() => window.__presence.stop());
// Antes de liberar a resposta final: o indicador TEM de ter aparecido (ausência total reprova) e, desde então, nunca sumiu. Devolve a marca da liberação.
const assertHeldUntilRelease = async (page, label) => { const log = await presenceLog(page); const first = log.indexOf(true); assert.ok(first >= 0, `${label}: o indicador nunca apareceu`); assert.ok(log.slice(first).every(Boolean), `${label}: o indicador sumiu durante a espera controlada`); return log.length; };
// Depois da liberação, separadamente: a remoção foi observada APÓS a marca e o estado final é sem indicador.
const assertRemovedAfter = async (page, label, mark) => { const log = await presenceLog(page); assert.ok(log.slice(mark).includes(false), `${label}: remoção não observada depois da liberação`); assert.equal(log.at(-1), false, `${label}: indicador ainda presente no fim`); assert.equal(await page.getByTestId('front-door-waiting').count(), 0, `${label}: indicador ainda no DOM`); };
const until = async (condition, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (condition()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`tempo esgotado: ${label}`); };
const sample = async (page, ms = 2300, every = 120) => {
  const samples = []; const end = Date.now() + ms;
  while (Date.now() < end) { samples.push(await page.evaluate(() => { const l = document.querySelector('.front-door-waiting-label'); const w = document.querySelector('[data-testid="front-door-waiting"]'); if (!l || !w) return null; const st = getComputedStyle(l); const r = w.getBoundingClientRect(); return { opacity: parseFloat(st.opacity), animationName: st.animationName, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 }; })); await page.waitForTimeout(every); }
  return samples;
};

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = []; // cenários que reprovaram (registrados no JSON antes de a execução falhar)
// Janela explícita de observação (quadros de animação). NÃO é sinal determinístico de término de nenhuma cadeia: só limita por quanto tempo o teste olha.
const observe = async (page, frames) => { for (let i = 0; i < frames; i += 1) await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve()))); };
const OBSERVATION_FRAMES = 90;
try {
  for (const [width, height] of [[320, 700], [390, 844], [1440, 900]].filter(([w]) => !onlyWidths.length || onlyWidths.includes(w))) {
    const row = { width, scenarios: {}, executed: [] }; currentRow = row;
    // H) transição completa + estado único + posição: consulta -> handoff IMOB -> espera com indicador -> resposta final sem indicador.
    if (want('H')) { const gate = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [gate] });
      const composerBefore = await page.locator('.front-door-composer').boundingBox();
      assert.equal(await waiting.count(), 0, 'sem indicador antes de enviar');
      await watchPresence(page);
      await send(page, QUESTION); await handoffDone(surface);
      await waiting.waitFor({ timeout: 30000 });
      // intermediários (handoff + card de contexto IMOB) já visíveis e o indicador continua: é a solicitação pendente, não o texto, que o sustenta.
      assert.equal(await waiting.count(), 1, 'um único indicador');
      assert.equal(await waiting.getAttribute('role'), 'status');
      assert.equal(await waiting.innerText(), LABEL, 'texto exato');
      assert.equal(await surface.getByText('Pensando...', { exact: false }).count(), 0, 'sem segundo indicador para a mesma solicitação');
      assert.equal(await surface.evaluate((el) => { const w = el.querySelector('[data-testid="front-door-waiting"]'); return [...el.querySelectorAll('[data-message-id]')].every((m) => m.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING); }), true, 'o indicador vem depois do handoff e do card de contexto');
      await page.waitForTimeout(500);
      assert.equal(await waiting.count(), 1, 'intermediários não encerram a espera');
      assert.equal(await replyCount(page), 0, 'a resposta final ainda não chegou');
      const mw = await box(surface, '[data-testid="front-door-waiting"]'); assert.ok(inside(mw), `indicador visível para quem está no fim ${JSON.stringify(mw)}`);
      const composerWhile = await page.locator('.front-door-composer').boundingBox();
      assert.deepEqual([composerWhile.x, composerWhile.y, composerWhile.width, composerWhile.height], [composerBefore.x, composerBefore.y, composerBefore.width, composerBefore.height], 'o campo de entrada não muda de espaço');
      row.scenarios.H = { indicator: mw };
      await page.screenshot({ path: `${out}/waiting-${width}.png` });
      // pulsação: opacidade varia sem sumir; layout (largura/altura) constante durante a animação
      const samples = (await sample(page)).filter(Boolean); const ops = samples.map((s) => s.opacity);
      assert.ok(samples.length >= 10, `amostras suficientes: ${samples.length}`);
      assert.ok(Math.min(...ops) >= 0.5 && Math.max(...ops) <= 1, `opacidade entre 0,5 e 1: ${Math.min(...ops)}..${Math.max(...ops)}`);
      assert.ok(Math.max(...ops) - Math.min(...ops) >= 0.2, `pulsa de verdade: variação ${Math.max(...ops) - Math.min(...ops)}`);
      assert.ok(samples.every((s) => s.animationName === 'front-door-waiting-pulse'), 'animação ativa em movimento normal');
      assert.ok(samples.every((s) => s.width === samples[0].width && s.height === samples[0].height), 'layout constante durante a pulsação');
      row.scenarios.pulse = { min: Math.min(...ops), max: Math.max(...ops), samples: samples.length, size: [samples[0].width, samples[0].height] };
      const holdMark = await assertHeldUntilRelease(page, `H ${width}`);
      gate.resolve(); await waitReplies(page, 1); await page.waitForTimeout(700);
      assert.equal(await waiting.count(), 0, 'sem indicador depois da resposta');
      await assertRemovedAfter(page, `H ${width}`, holdMark); await stopPresence(page);
      const reply = await box(surface, 'last-reply'); assert.ok(readable(reply), `resposta final visível ${JSON.stringify(reply)}`); row.scenarios.H.reply = reply;
      clean(ctx, `H ${width}`); await page.close(); }
    // R) movimento reduzido: texto estático (sem animação), mesmo conteúdo e role.
    if (want('R')) { const gate = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [gate], reduced: true });
      await send(page, QUESTION); await handoffDone(surface); await waiting.waitFor({ timeout: 30000 });
      const samples = (await sample(page, 1000)).filter(Boolean);
      assert.ok(samples.every((s) => s.animationName === 'none' && s.opacity === 1), `movimento reduzido: sem animação ${JSON.stringify(samples[0])}`);
      assert.equal(await waiting.innerText(), LABEL); assert.equal(await waiting.getAttribute('role'), 'status');
      row.scenarios.R = { animationName: samples[0].animationName, opacity: samples[0].opacity };
      await page.screenshot({ path: `${out}/waiting-reduced-${width}.png` });
      gate.resolve(); await waitReplies(page, 1); await page.waitForTimeout(500); assert.equal(await waiting.count(), 0);
      clean(ctx, `R ${width}`); await page.close(); }
    // E) erro: o indicador some e a mensagem de erro aparece.
    if (want('E')) { const { page, surface, ctx, waiting } = await open(browser, { width, height, fail: true });
      await send(page, QUESTION);
      await surface.getByText('Não consegui abrir o formulário do IMOB', { exact: false }).waitFor({ timeout: 60000 }); await page.waitForTimeout(500);
      assert.equal(await waiting.count(), 0, 'erro encerra a espera');
      assert.equal(await replyCount(page), 0);
      row.scenarios.E = { waiting: 0 }; clean(ctx, `E ${width}`); await page.close(); }
    // C) troca de conversa durante a espera: limpa a espera; a resposta atrasada da conversa anterior não aparece nem reabre a espera.
    if (want('C')) { const g1 = deferred(); const g2 = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [g1, g2] });
      await send(page, QUESTION); await handoffDone(surface); await waiting.waitFor({ timeout: 30000 });
      const sidebar = page.getByRole('complementary', { name: 'Workspace e operações' });
      const toggle = sidebar.getByRole('button', { name: /^Painel do workspace/ });
      if (width < 1024 && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      await sidebar.getByRole('button', { name: 'Nova conversa' }).click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 10000 });
      g1.resolve(); await page.waitForTimeout(900);
      assert.equal(await waiting.count(), 0, 'a resposta atrasada não reabre a espera');
      assert.equal(await replyCount(page), 0, 'a resposta atrasada da conversa anterior não aparece');
      // nova conversa: o ciclo funciona de novo e só a resposta atual aparece
      await send(page, QUESTION); await handoffDone(surface); await waiting.waitFor({ timeout: 30000 });
      assert.equal(await waiting.count(), 1);
      g2.resolve(); await waitReplies(page, 1); await page.waitForTimeout(600);
      assert.equal(await waiting.count(), 0); assert.equal(await replyCount(page), 1, 'só a resposta da conversa atual');
      assert.equal(await surface.getByText('resposta 1:', { exact: false }).count(), 0, 'a resposta atrasada (1a solicitação) nunca é mostrada');
      assert.equal(await surface.getByText('resposta 2:', { exact: false }).count(), 1, 'a resposta da conversa atual é a 2a solicitação');
      row.scenarios.C = { stale: 0, current: 1, calls: ctx.resolveCalls.length }; clean(ctx, `C ${width}`); await page.close(); }
    // L) leitor acima ao surgir o indicador: a posição não muda quando o indicador aparece nem quando some junto com a resposta.
    if (want('L')) { const gate = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [gate] });
      await send(page, QUESTION); await surface.getByText('Sigo com o IMOB', { exact: false }).first().waitFor({ timeout: 60000 });
      await surface.hover({ position: { x: 8, y: 8 } }); await page.mouse.wheel(0, -900); await page.waitForTimeout(300);
      const held = await surface.evaluate((el) => Math.round(el.scrollTop));
      await waiting.waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
      const withIndicator = await surface.evaluate((el) => ({ top: Math.round(el.scrollTop), gap: el.scrollHeight - el.scrollTop - el.clientHeight }));
      assert.ok(withIndicator.gap > 48, `leitor acima do fim ${JSON.stringify(withIndicator)}`);
      assert.ok(Math.abs(withIndicator.top - held) <= 2, `indicador não move quem lê acima ${held} -> ${withIndicator.top}`);
      gate.resolve(); await waitReplies(page, 1); await page.waitForTimeout(700);
      assert.equal(await waiting.count(), 0);
      const after = await surface.evaluate((el) => Math.round(el.scrollTop)); assert.ok(Math.abs(after - held) <= 2, `resposta não move quem lê acima ${held} -> ${after}`);
      row.scenarios.L = { held, withIndicator: withIndicator.top, after }; clean(ctx, `L ${width}`); await page.close(); }
    // A) avaliação inicial do handoff: a espera nasce com a mensagem do usuário, ANTES de qualquer mensagem do assistente, e atravessa o aviso de handoff até a resposta.
    if (want('A')) { const hg = deferred(); const gate = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [gate] });
      const base = ctx.handoffCalls.length; ctx.handoffGate = hg; await watchPresence(page); await send(page, QUESTION);
      await waiting.waitFor({ timeout: 30000 }); await until(() => ctx.handoffCalls.length === base + 1, 'avaliação do handoff iniciada');
      assert.equal(await waiting.count(), 1); assert.equal(await waiting.innerText(), LABEL);
      assert.equal(await surface.getByText('Sigo com o IMOB', { exact: false }).count(), 0, 'o aviso de handoff ainda não existe: esta é a espera da avaliação');
      assert.equal(ctx.resolveCalls.length, 0, 'nada é encaminhado antes do handoff'); await page.waitForTimeout(400); assert.equal(await waiting.count(), 1);
      await page.screenshot({ path: `${out}/waiting-handoff-eval-${width}.png` });
      hg.resolve(); await handoffDone(surface); await until(() => ctx.resolveCalls.length === 1, 'consulta encaminhada'); await page.waitForTimeout(400);
      assert.equal(await waiting.count(), 1, 'aviso de handoff e card intermediários não encerram a espera'); assert.equal(await replyCount(page), 0);
      const mark = await assertHeldUntilRelease(page, `A ${width}`);
      gate.resolve(); await waitReplies(page, 1); await page.waitForTimeout(600);
      await assertRemovedAfter(page, `A ${width}`, mark); await stopPresence(page);
      row.scenarios.A = { handoffCalls: ctx.handoffCalls.slice(base), resolveCalls: ctx.resolveCalls.length }; clean(ctx, `A ${width}`); await page.close(); }
    // V) outra vertical (Logística): sem encaminhamento ao IMOB; a espera cobre a avaliação do handoff e some quando o aviso aparece. Mesmo componente, mesmo estado.
    if (want('V')) { const hg = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height });
      const base = ctx.handoffCalls.length; ctx.handoffGate = hg; ctx.registry = true; const before = await page.locator('[data-message-id]').count(); await watchPresence(page); await send(page, LOG_QUESTION);
      await waiting.waitFor({ timeout: 30000 }); await until(() => ctx.handoffCalls.length === base + 1, 'avaliação do handoff iniciada');
      assert.deepEqual(ctx.handoffCalls.slice(base), ['log'], 'o handoff avaliado é o da Logística'); assert.equal(await waiting.count(), 1); assert.equal(await waiting.innerText(), LABEL);
      assert.equal(ctx.resolveCalls.length, 0, 'nada vai ao resolvedor do IMOB'); await page.waitForTimeout(400); assert.equal(await waiting.count(), 1);
      await page.screenshot({ path: `${out}/waiting-other-vertical-${width}.png` });
      const mark = await assertHeldUntilRelease(page, `V ${width}`);
      hg.resolve();
      await page.waitForFunction((n) => !document.querySelector('[data-testid="front-door-waiting"]') && document.querySelectorAll('[data-message-id]').length >= n, before + 2, { timeout: 30000 });
      await assertRemovedAfter(page, `V ${width}`, mark); await stopPresence(page);
      assert.ok(await surface.getByText(/Logística/).count() >= 1, 'o aviso do handoff da Logística foi apresentado'); assert.equal(ctx.resolveCalls.length, 0);
      row.scenarios.V = { handoffCalls: ctx.handoffCalls.slice(base), resolveCalls: 0 }; clean(ctx, `V ${width}`); await page.close(); }
    // Q) concorrência: duas solicitações na mesma conversa; a mais antiga terminar não oculta a mais nova pendente.
    if (want('Q')) { const g1 = deferred(); const g2 = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [g1, g2] });
      await watchPresence(page); await send(page, QUESTION); await handoffDone(surface); await waiting.waitFor({ timeout: 30000 });
      await send(page, QUESTION); await until(() => ctx.resolveCalls.length === 2, 'duas solicitações pendentes'); await page.waitForTimeout(300);
      assert.equal(await waiting.count(), 1, 'um único indicador para as duas');
      g1.resolve(); await page.waitForTimeout(900);
      assert.equal(await waiting.count(), 1, 'a mais antiga terminou: a mais nova continua pendente e a espera continua visível'); assert.equal(await replyCount(page), 0, 'a resposta da solicitação superada não aparece');
      const mark = await assertHeldUntilRelease(page, `Q ${width}`);
      g2.resolve(); await waitReplies(page, 1); await page.waitForTimeout(600);
      await assertRemovedAfter(page, `Q ${width}`, mark); await stopPresence(page);
      assert.equal(await replyCount(page), 1); assert.equal(await surface.getByText('resposta 2:', { exact: false }).count(), 1); assert.equal(await surface.getByText('resposta 1:', { exact: false }).count(), 0);
      row.scenarios.Q = { calls: ctx.resolveCalls.length, replies: 1 }; clean(ctx, `Q ${width}`); await page.close(); }
    // Q2) concorrência invertida: a mais NOVA responde primeiro; a mais antiga ainda pendente mantém a espera até terminar.
    if (want('Q2')) { const g1 = deferred(); const g2 = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [g1, g2] });
      await watchPresence(page); await send(page, QUESTION); await handoffDone(surface); await waiting.waitFor({ timeout: 30000 });
      await send(page, QUESTION); await until(() => ctx.resolveCalls.length === 2, 'duas solicitações pendentes'); await page.waitForTimeout(300);
      g2.resolve(); await waitReplies(page, 1); await page.waitForTimeout(700);
      assert.equal(await replyCount(page), 1, 'a resposta da mais nova já está na conversa');
      assert.equal(await waiting.count(), 1, 'a mais nova terminou, mas a mais antiga ainda está pendente: a espera não some');
      const mark = await assertHeldUntilRelease(page, `Q2 ${width}`);
      g1.resolve(); await page.waitForTimeout(900);
      await assertRemovedAfter(page, `Q2 ${width}`, mark); await stopPresence(page);
      assert.equal(await replyCount(page), 1, 'a resposta superada continua descartada');
      row.scenarios.Q2 = { calls: ctx.resolveCalls.length, replies: 1 }; clean(ctx, `Q2 ${width}`); await page.close(); }
    // F) formulário: salvar é espera assíncrona (não é consulta textual); some quando a confirmação aparece.
    if (want('F')) { const g = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, ownersGate: g, form: true });
      const input = surface.locator('[data-imob-form-field="ownerName"] input'); await input.waitFor({ timeout: 30000 }); await input.fill('Pessoa de demonstração');
      assert.equal(await waiting.count(), 0, 'sem espera antes de salvar'); await watchPresence(page);
      await surface.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
      await waiting.waitFor({ timeout: 30000 }); await until(() => ctx.ownerCalls === 1, 'salvar chegou ao mock'); await page.waitForTimeout(400);
      assert.equal(await waiting.count(), 1); assert.equal(await waiting.innerText(), LABEL);
      await page.screenshot({ path: `${out}/waiting-form-${width}.png` });
      const mark = await assertHeldUntilRelease(page, `F ${width}`);
      g.resolve(); await surface.getByText('Cadastrar imóvel deste proprietário', { exact: false }).first().waitFor({ timeout: 30000 }); await page.waitForTimeout(600);
      await assertRemovedAfter(page, `F ${width}`, mark); await stopPresence(page);
      row.scenarios.F = { ownerCalls: ctx.ownerCalls }; clean(ctx, `F ${width}`); await page.close(); }
    // X) troca REAL de contexto (usuário, pelo store de sessão do app) com avaliação do handoff retida. Exigências: o contexto novo não herda a espera; voltar ao usuário
    // anterior não a ressuscita; e, quando a decisão antiga é liberada, ela NÃO reativa a espera, NÃO encaminha a consulta antiga e NÃO insere a resposta antiga na
    // conversa atual. Reprova se houver vazamento de estado entre contextos (mesmo que o indicador suma depois). Gates liberados em finally; a falha fica registrada.
    // LIMITAÇÃO: não há sinal observável confiável no navegador do término da cadeia antiga (o caminho de descarte não faz sincronização nem requisição própria);
    // por isso o teste visual usa uma JANELA DE OBSERVAÇÃO de quadros, que não é determinística e não prova a conclusão da cadeia. A conclusão com promessa controlada
    // é sustentada pelos testes unitários (frontDoorPendingWork.test.ts: decisão tardia e ponte de escopo de origem). Aqui se espera AUSÊNCIA contínua do indicador.
    if (want('X')) { const hg = deferred(); const gate = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [gate] });
      try {
        const base = ctx.handoffCalls.length; ctx.handoffGate = hg; await send(page, QUESTION);
        await waiting.waitFor({ timeout: 30000 }); await until(() => ctx.handoffCalls.length === base + 1, 'avaliação do handoff retida');
        assert.equal(await waiting.count(), 1, 'espera visível antes da troca');
        await page.evaluate(() => window.updateSession({ userId: 'user-other' }));
        await page.waitForFunction(() => window.getSessionState().userId === 'user-other' && !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
        await observe(page, 8); assert.equal(await waiting.count(), 0, 'o contexto novo não herda a espera da solicitação anterior');
        await page.evaluate(() => window.updateSession({ userId: 'user-wait' }));
        await page.waitForFunction(() => window.getSessionState().userId === 'user-wait', null, { timeout: 15000 });
        await observe(page, 8); assert.equal(await waiting.count(), 0, 'voltar ao usuário anterior não ressuscita a espera de antes da troca');
        await watchPresence(page); // ausência confirmada: a partir daqui nenhum registro pode indicar presença do indicador
        hg.resolve(); await observe(page, OBSERVATION_FRAMES);
        const presence = await presenceLog(page); assert.ok(presence.length >= 1 && presence.every((present) => present === false), `o indicador não pode reaparecer na janela de observação (${presence.filter(Boolean).length} registro(s) com presença)`);
        assert.equal(await waiting.count(), 0, 'a continuação obsoleta não reativa a espera no contexto atual');
        assert.equal(ctx.resolveCalls.length, 0, 'a consulta antiga não é encaminhada no contexto atual');
        assert.equal(await surface.getByText('Sigo com o IMOB', { exact: false }).count(), 0, 'o aviso/resposta antigos não entram na conversa atual');
        assert.equal(await replyCount(page), 0, 'nenhuma resposta antiga na conversa atual');
        clean(ctx, `X ${width}`); row.scenarios.X = { status: 'PASSED', observation: `janela de ${OBSERVATION_FRAMES} quadros (não determinística)` };
      } catch (error) {
        await page.screenshot({ path: `${out}/failure-X-${width}.png` }).catch(() => undefined);
        row.scenarios.X = { status: 'FAILED', message: String(error.message).split('\n')[0], resolveCalls: ctx.resolveCalls.length, waiting: await waiting.count().catch(() => null), observation: `janela de ${OBSERVATION_FRAMES} quadros (não determinística)` };
        failures.push(`X ${width}: ${row.scenarios.X.message}`);
      } finally { await stopPresence(page).catch(() => undefined); hg.resolve(); gate.resolve(); await page.close(); } }
    // C2) troca de CONVERSA (Nova conversa) com a avaliação do handoff retida: mesma exigência de isolamento do X, pela geração da conversa. Mesma limitação de observação.
    if (want('C2')) { const hg = deferred(); const gate = deferred(); const { page, surface, ctx, waiting } = await open(browser, { width, height, gates: [gate] });
      try {
        const base = ctx.handoffCalls.length; ctx.handoffGate = hg; await send(page, QUESTION);
        await waiting.waitFor({ timeout: 30000 }); await until(() => ctx.handoffCalls.length === base + 1, 'avaliação do handoff retida');
        const sidebar = page.getByRole('complementary', { name: 'Workspace e operações' });
        const toggle = sidebar.getByRole('button', { name: /^Painel do workspace/ });
        if (width < 1024 && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
        await sidebar.getByRole('button', { name: 'Nova conversa' }).click();
        await page.waitForFunction(() => !document.querySelector('[data-testid="front-door-waiting"]'), null, { timeout: 15000 });
        await observe(page, 8); assert.equal(await waiting.count(), 0, 'a conversa nova não herda a espera');
        await watchPresence(page); hg.resolve(); await observe(page, OBSERVATION_FRAMES);
        const presence = await presenceLog(page); assert.ok(presence.length >= 1 && presence.every((present) => present === false), `o indicador não pode reaparecer na conversa nova (${presence.filter(Boolean).length} registro(s) com presença)`);
        assert.equal(ctx.resolveCalls.length, 0, 'a consulta antiga não é encaminhada à conversa nova');
        assert.equal(await surface.getByText('Sigo com o IMOB', { exact: false }).count(), 0, 'o aviso antigo não entra na conversa nova');
        assert.equal(await replyCount(page), 0, 'nenhuma resposta antiga na conversa nova');
        clean(ctx, `C2 ${width}`); row.scenarios.C2 = { status: 'PASSED', observation: `janela de ${OBSERVATION_FRAMES} quadros (não determinística)` };
      } catch (error) {
        await page.screenshot({ path: `${out}/failure-C2-${width}.png` }).catch(() => undefined);
        row.scenarios.C2 = { status: 'FAILED', message: String(error.message).split('\n')[0], resolveCalls: ctx.resolveCalls.length, waiting: await waiting.count().catch(() => null), observation: `janela de ${OBSERVATION_FRAMES} quadros (não determinística)` };
        failures.push(`C2 ${width}: ${row.scenarios.C2.message}`);
      } finally { await stopPresence(page).catch(() => undefined); hg.resolve(); gate.resolve(); await page.close(); } }
    results.push(row);
  }
  // Pelo menos um cenário e uma largura; e o que rodou tem de ser exatamente o que foi pedido (sem filtro = tudo, nas três larguras).
  const expectedScenarios = only.length ? KNOWN_SCENARIOS.filter((id) => only.includes(id)) : KNOWN_SCENARIOS;
  const expectedWidths = onlyWidths.length ? KNOWN_WIDTHS.filter((w) => onlyWidths.includes(w)) : KNOWN_WIDTHS;
  assert.ok(results.length >= 1 && expectedScenarios.length >= 1, 'ao menos uma largura e um cenário');
  assert.deepEqual(results.map((r) => r.width), expectedWidths, 'larguras executadas');
  for (const r of results) assert.deepEqual([...r.executed].sort(), [...expectedScenarios].sort(), `cenários executados em ${r.width}`);
  const partial = only.length > 0 || onlyWidths.length > 0;
  await writeFile(`${out}/browser-results.json`, JSON.stringify({ fixture: 'sessão e API sintéticas, tudo mockado, execução LOCAL (não é validação em staging)',
    suite: partial ? 'PARCIAL (execução filtrada; não representa a suíte completa)' : 'COMPLETA', filters: { QA_ONLY: only, QA_WIDTHS: onlyWidths },
    executedWidths: results.map((r) => r.width), executedScenarios: expectedScenarios, failures, results }, null, 2) + '\n');
  assert.deepEqual(failures, [], `cenários reprovados: ${failures.join(' | ')}`);
  console.log(`${partial ? 'PARCIAL (filtrada)' : 'COMPLETA'}: ${results.length} largura(s) [${expectedWidths.join(',')}], cenários [${expectedScenarios.join(',')}] PASS`);
} catch (error) {
  if (lastOpen) {
    const { page, ctx } = lastOpen;
    console.error('DIAG', JSON.stringify({ errors: ctx.errors, blocked: ctx.blocked, handoffCalls: ctx.handoffCalls, resolveCalls: ctx.resolveCalls, ownerCalls: ctx.ownerCalls, waiting: await page.getByTestId('front-door-waiting').count().catch(() => null) }));
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => undefined);
  }
  throw error;
} finally { await browser.close(); }
