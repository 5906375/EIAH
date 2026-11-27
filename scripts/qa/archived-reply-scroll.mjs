import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180 (QA_BASE_URL sobrescreve). Saída: QA_OUT.
// QA_MODE=before: o defeito precisa ser REPRODUZIDO (resposta estruturada do IMOB fora da área visível); QA_MODE=after (padrão): corrigido.
//
// Rolagem do Front Door (/app/chat) para respostas estruturadas do IMOB inseridas por appendStructured (ex.: "listar imóveis arquivados").
// Fluxo REAL do launcher (digitar -> handoff -> resolve-turn -> card) sobre a página real. Fixtures 100% sintéticas, nenhuma escrita real:
//  - toda rota /api/** é atendida por mock local (route.fulfill); nada sai para a rede;
//  - só são toleradas as escritas de avaliação/consulta abaixo (handoff v2 e resolve-turn são leituras governadas, telemetria da página);
//  - qualquer outra escrita reprova o teste; hosts fora de localhost reprovam o teste.
const mode = process.env.QA_MODE === 'before' ? 'before' : 'after';
const out = process.env.QA_OUT || 'docs/evidence/front-door-archived-reply-scroll';
const base = process.env.QA_BASE_URL || 'http://localhost:5180';
// Escritas que o próprio Front Door dispara no fluxo (persistência do histórico e estado sombra do launcher). Aqui todas são
// atendidas pelo mock e nunca chegam a um servidor; ficam registradas em `requests` no resultado.
const ALLOWED_WRITES = new Set(['POST /api/chat/vertical-handoff', 'POST /api/imob/chat/resolve-turn', 'POST /api/helpdesk/telemetry', 'POST /api/imob/chat/runtime-shadow-state', 'POST /api/imob/chat/conversations']);
const TITLE = 'Imóveis arquivados';
const QUESTION = 'listar imóveis arquivados';
await mkdir(out, { recursive: true });

const session = { tenantId: 'tenant-scroll', workspaceId: 'workspace-scroll', userId: 'user-scroll', activeDomain: 'imob', availableDomains: ['core', 'imob'], entitlements: { IMOB_INSTALLED: true }, productInstallations: [{ product: 'IMOB' }], verticals: [{ verticalId: 'IMOB', activeDomain: 'imob', label: 'IMOB', enabled: true, frontDoorSurface: 'chat' }], roles: [], branding: { brandName: 'EIAH', workspaceLabel: 'Workspace sintético' }, experience: { roleProfile: 'workspace_admin', primaryNavigation: [], landingPath: '/app/chat' } };
const handoff = { ok: true, data: { ok: true, handoff: { version: 'chat.vertical_handoff.v2', handoffId: 'fixture', vertical: { id: 'imob', label: 'IMOB', registryVersion: 'fixture' }, capability: { id: 'crm.forms', mode: 'requires_write' }, outcome: 'allowed', reasonCode: 'VERTICAL_HANDOFF_ALLOWED', presentation: { source: 'operational', variant: 'chat_card' } } } };
const turn = (rows) => ({ ok: true, data: { mode: 'consult', action: 'crm.property.list', threadLabel: 'Imóvel', conversationState: { mode: 'consult', pendingSlot: 'none', resultOffset: 0, slots: {}, operational: null },
  presentation: { text: `Encontrei ${rows} imóvel(is) arquivado(s) neste workspace.\nConsulta somente leitura: imóveis arquivados saem das listas ativas e o histórico fica guardado.`, owner: 'Corretor', nextStep: 'Consulta somente leitura; nenhum imóvel foi alterado.', dedupeKey: 'crm.property.list:archived',
    card: { title: TITLE, lines: Array.from({ length: rows }, (_, i) => `Unidade ${301 + i} | locacao | Cidade Exemplo | arquivado em 11/11/2026 | Proprietário: Sem proprietário vinculado`), ctas: [] } } } });

const NOTICE = { id: 'notice-1', vertical: 'LOGISTICA', kind: 'aprovado', message: 'Aviso sintético: a liberação da vertical foi concluída neste workspace.', createdAt: '2026-11-11T12:00:00Z' };
const formTurn = { ok: true, data: { mode: 'consult', action: 'crm.owner.create', threadLabel: 'Proprietário', conversationState: { mode: 'consult', pendingSlot: 'none', resultOffset: 0, slots: {}, operational: null },
  presentation: { text: 'Preencha os campos abaixo para continuar o cadastro do proprietário.', owner: 'Corretor', nextStep: 'Preencher o cadastro.', dedupeKey: 'crm.owner.create',
    form: { entity: 'proprietario', action: 'create', label: 'Cadastrar proprietário — exemplo sintético', description: 'Campos compartilhados dos formulários IMOB.', submitTarget: 'imob.owners.create',
      fields: Array.from({ length: 14 }, (_, i) => ({ name: `campo${i}`, label: `Campo sintético ${i}`, type: 'text', value: '' })), actions: [{ id: 'cancel', label: 'Cancelar', kind: 'secondary' }, { id: 'submit', label: 'Salvar cadastro', kind: 'primary' }] } } } };

async function open(browser, { width, height, rows, gate, form, notices, noticeGate }) {
  const page = await browser.newPage({ viewport: { width, height } });
  // before: neutraliza SÓ o efeito novo do launcher na resposta do módulo servido pelo Vite (equivale ao comportamento anterior).
  if (mode === 'before') await page.route('**/src/components/agents/ChatAgentLauncher.tsx*', async (route) => {
    const response = await route.fetch(); const code = await response.text();
    assert.ok(code.includes('if (destination !== null)'), 'efeito de rolagem não encontrado no módulo servido');
    await route.fulfill({ response, body: code.replace('if (destination !== null)', 'if (false)') });
  });
  const ctx = { requests: {}, blocked: [], foreign: new Set(), errors: [] };
  page.on('pageerror', (e) => ctx.errors.push(e.message));
  // Nada sai da máquina: toda requisição a host fora de localhost é ABORTADA e registrada (as fontes do index.html são as únicas toleradas).
  await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), async (route) => { ctx.foreign.add(new URL(route.request().url()).hostname); await route.abort(); });
  await page.addInitScript(() => {
    localStorage.setItem('eiah_token', 'synthetic-scroll-fixture'); localStorage.setItem('tenant_id', 'tenant-scroll'); localStorage.setItem('workspace_id', 'workspace-scroll'); localStorage.setItem('active_domain', 'imob');
    localStorage.setItem('eiah:greeted:tenant-scroll:workspace-scroll', '1');
    const messages = [{ id: 'user-seed', role: 'user', content: 'Conversa sintética anterior', status: 'done' }];
    for (let i = 0; i < 14; i++) messages.push({ id: `seed-${i}`, role: 'assistant', content: `Histórico sintético ${i}: ${'Conteúdo anterior da conversa para exigir rolagem. '.repeat(5)}`, status: 'done' });
    sessionStorage.setItem('eiah:chat:tenant-scroll:workspace-scroll:EIAH:default', JSON.stringify({ messages, runId: null }));
  });
  let turns = 0;
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const key = `${req.method()} ${path}`;
    ctx.requests[key] = (ctx.requests[key] ?? 0) + 1;
    if (req.method() !== 'GET' && !ALLOWED_WRITES.has(key)) { ctx.blocked.push(key); await route.fulfill({ status: 403, json: { ok: false, error: { code: 'BLOCKED_BY_QA' } } }); return; }
    if (key === 'POST /api/imob/chat/resolve-turn') { turns += 1; if (gate && turns === 1) await gate; await route.fulfill({ json: form ? formTurn : turn(rows) }); return; }
    if (key === 'GET /api/vertical-access/notices' && notices) { if (noticeGate) await noticeGate; await route.fulfill({ json: { ok: true, data: { notices } } }); return; }
    const body = req.method() !== 'GET' ? (key === 'POST /api/chat/vertical-handoff' ? handoff : { ok: true, data: { id: 'mock' } })
      : path.endsWith('/session/context') ? { ok: true, data: session } : { ok: false, data: null, items: [] };
    await route.fulfill({ json: body });
  });
  await page.goto(`${base}/app/chat`, { waitUntil: 'domcontentloaded' });
  const surface = page.getByTestId('launcher-conversation-surface');
  await surface.getByText('Histórico sintético 0', { exact: false }).first().waitFor({ timeout: 60000 });
  return { page, surface, ctx };
}
const send = async (page, text) => {
  await page.locator('.front-door-composer textarea').last().fill(text);
  await page.getByRole('button', { name: /^Enviar(?: mensagem)?$/i }).click();
};
const replies = (page, count, marker = TITLE) => page.waitForFunction(([title, n]) => [...document.querySelectorAll('[data-message-id]')].filter((el) => el.textContent.includes(title)).length >= n, [marker, count], { timeout: 60000 });
const reply = (surface, marker = TITLE) => surface.evaluate((el, title) => {
  const node = [...el.querySelectorAll('[data-message-id]')].filter((n) => n.textContent.includes(title)).at(-1);
  if (!node) return null;
  const s = el.getBoundingClientRect(); const r = node.getBoundingClientRect();
  return { top: Math.round(r.top - s.top), bottom: Math.round(r.bottom - s.top), height: Math.round(r.height), view: el.clientHeight, scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight };
}, marker);
// Legível: cabe inteiro na área visível ou, se for mais alto que ela, o INÍCIO (título) está visível.
const readable = (m) => m.top >= -1 && (m.height <= m.view ? m.bottom <= m.view + 1 : m.top <= 24);
const expectReadable = (m, label) => {
  if (mode === 'before') assert.equal(readable(m), false, `${label}: defeito deveria ser reproduzido ${JSON.stringify(m)}`);
  else assert.equal(readable(m), true, `${label}: resposta fora da área visível ${JSON.stringify(m)}`);
};
const clean = (ctx, label) => {
  assert.deepEqual(ctx.blocked, [], `${label}: escrita inesperada`);
  assert.deepEqual([...ctx.foreign].filter((h) => !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(h)), [], `${label}: host externo inesperado (abortado)`);
  assert.deepEqual(ctx.errors, [], `${label}: erros de runtime`);
};

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [[320, 700], [390, 844], [1440, 900]]) {
    const row = { width, mode, scenarios: {} };
    // A) resposta curta (4 imóveis) com o leitor no fim; E) hidratação do histórico não rola sozinha.
    { const { page, surface, ctx } = await open(browser, { width, height, rows: 4 });
      const initial = await surface.evaluate((el) => el.scrollTop); await page.waitForTimeout(600);
      assert.equal(await surface.evaluate((el) => el.scrollTop), initial, 'hidratação do histórico não pode rolar sozinha');
      await send(page, QUESTION); await replies(page, 1); await page.waitForTimeout(900);
      const m = await reply(surface); row.scenarios.A = m; expectReadable(m, `A ${width}`);
      await page.screenshot({ path: `${out}/${mode}-A-${width}.png` }); clean(ctx, `A ${width}`); row.requests = ctx.requests; await page.close(); }
    // B) resposta alta (120 imóveis, maior que a viewport em qualquer largura): o início precisa estar legível.
    { const { page, surface, ctx } = await open(browser, { width, height, rows: 120 });
      await send(page, QUESTION); await replies(page, 1); await page.waitForTimeout(900);
      const m = await reply(surface); row.scenarios.B = m; expectReadable(m, `B ${width}`); assert.ok(m.height > m.view, 'B precisa ser mais alto que a viewport');
      await page.screenshot({ path: `${out}/${mode}-B-${width}.png` }); clean(ctx, `B ${width}`); await page.close(); }
    // C) leitor acima quando a resposta chega: a posição manual é preservada. D) nova mensagem do usuário retoma o acompanhamento.
    { let release; const gate = new Promise((resolve) => { release = resolve; });
      const { page, surface, ctx } = await open(browser, { width, height, rows: 4, gate });
      await send(page, QUESTION);
      await surface.getByText('Negócios.', { exact: false }).first().waitFor({ timeout: 60000 });
      await surface.hover({ position: { x: 8, y: 8 } }); await page.mouse.wheel(0, -900); await page.waitForTimeout(400);
      const held = await surface.evaluate((el) => ({ top: Math.round(el.scrollTop), gap: el.scrollHeight - el.scrollTop - el.clientHeight }));
      assert.ok(held.gap > 48, `leitor deveria estar acima do fim ${JSON.stringify(held)}`);
      release(); await replies(page, 1); await page.waitForTimeout(900);
      const kept = await surface.evaluate((el) => Math.round(el.scrollTop));
      assert.ok(Math.abs(kept - held.top) <= 2, `rolagem manual preservada ${held.top} -> ${kept}`);
      row.scenarios.C = { held: held.top, kept };
      await send(page, QUESTION); await replies(page, 2); await page.waitForTimeout(900);
      const m = await reply(surface); row.scenarios.D = m; expectReadable(m, `D ${width}`);
      await page.screenshot({ path: `${out}/${mode}-D-${width}.png` }); clean(ctx, `C/D ${width}`); await page.close(); }
    // E) aviso de OUTRA vertical (Logística) chega logo após a hidratação, com o leitor no topo: nada rola sozinho.
    { const { page, surface, ctx } = await open(browser, { width, height, notices: [NOTICE] });
      await page.waitForTimeout(1200);
      assert.equal(await surface.evaluate((el) => Math.round(el.scrollTop)), 0, `E ${width}: aviso na hidratação não pode rolar sozinho`);
      row.scenarios.E = { scrollTop: 0 }; clean(ctx, `E ${width}`); await page.close(); }
    // F) o mesmo aviso (nada específico do IMOB) chega com o leitor no fim: precisa ficar visível.
    { let releaseNotice; const noticeGate = new Promise((resolve) => { releaseNotice = resolve; });
      const { page, surface, ctx } = await open(browser, { width, height, notices: [NOTICE], noticeGate });
      await surface.evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(400);
      releaseNotice(); await replies(page, 1, 'Aviso sintético'); await page.waitForTimeout(900);
      const m = await reply(surface, 'Aviso sintético'); row.scenarios.F = m; expectReadable(m, `F ${width}`);
      await page.screenshot({ path: `${out}/${mode}-F-${width}.png` }); clean(ctx, `F ${width}`); await page.close(); }
    // G) formato diferente do card de lista: formulário do IMOB (alto em mobile); o início (título) precisa estar legível.
    { const { page, surface, ctx } = await open(browser, { width, height, form: true });
      await send(page, 'cadastrar proprietário'); await replies(page, 1, 'Preencha os campos abaixo'); await page.waitForTimeout(900);
      const m = await reply(surface, 'Preencha os campos abaixo'); row.scenarios.G = m; expectReadable(m, `G ${width}`);
      await page.screenshot({ path: `${out}/${mode}-G-${width}.png` }); clean(ctx, `G ${width}`); await page.close(); }
    results.push(row);
  }
  await writeFile(`${out}/browser-results-${mode}.json`, JSON.stringify({ mode, fixture: 'sessão e API sintéticas, tudo mockado, nenhuma escrita real', results }, null, 2) + '\n');
  console.log(`${results.length} larguras PASS (mode=${mode})`);
} finally { await browser.close(); }
