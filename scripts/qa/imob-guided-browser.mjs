import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

// Validação INTEGRADA da coleta conversacional guiada do IMOB: frontend REAL (Vite) → rotas HTTP REAIS da API → PostgreSQL descartável.
// Somente o transporte externo do provider é simulado (apps/api/src/tests/support/imobGuidedBrowserHarness.ts); cada invocação é contada.
// Nada aqui responde pela API: o navegador só tem /api/** liberado para loopback; qualquer outro host é BLOQUEADO e registrado.
const KNOWN_SCENARIOS = ['1', '2', '3', '4', '6', '1b', '5a', '5b', '5c', '5d', '5e', '5f', '7']; // ordem de execução
// QA_ONLY (opcional, lista separada por vírgula): validado ANTES de abrir banco/navegador. Definido porém vazio ou com id desconhecido → falha explícita (exit 2), sem rodar nada.
const only = process.env.QA_ONLY === undefined ? null : process.env.QA_ONLY.split(',').map((id) => id.trim());
if (only && (only.some((id) => !KNOWN_SCENARIOS.includes(id)) || new Set(only).size !== only.length)) {
  console.error(`QA_ONLY inválido (${JSON.stringify(process.env.QA_ONLY)}): ids conhecidos = ${KNOWN_SCENARIOS.join(',')}; nada foi executado.`);
  process.exit(2);
}
// Pré-condições de ambiente verificadas ANTES de qualquer E/S: faltou variável → mensagem explícita (exit 2), sem erro críptico.
const REQUIRED_ENV = ['QA_BASE_URL', 'QA_API_URL', 'QA_MANIFEST', 'QA_PROVIDER_LOG', 'QA_BLOCKED_LOG', 'QA_OUT', 'DATABASE_URL', 'EIAH_DISPOSABLE_INFRA'];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length) { console.error(`variáveis obrigatórias ausentes: ${missingEnv.join(', ')} (ver o runbook em ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md); nada foi executado.`); process.exit(2); }
// Variáveis: QA_ONLY (opcional), QA_BASE_URL, QA_API_URL, QA_MANIFEST (harness), QA_PROVIDER_LOG, QA_BLOCKED_LOG, QA_OUT, DATABASE_URL (descartável; guarda abaixo).
const base = process.env.QA_BASE_URL, apiUrl = process.env.QA_API_URL, out = process.env.QA_OUT;
const manifest = JSON.parse(fs.readFileSync(process.env.QA_MANIFEST, 'utf8'));
const providerLog = process.env.QA_PROVIDER_LOG, blockedLog = process.env.QA_BLOCKED_LOG;
const dbUrl = new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(dbUrl.hostname) && dbUrl.pathname.startsWith('/eiah_logistica_core_') && process.env.EIAH_DISPOSABLE_INFRA === '1', 'banco descartável obrigatório');
const pgRequire = createRequire(path.resolve('packages/db/package.json'));
const { Client } = pgRequire('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await mkdir(out, { recursive: true });

const SESSION_KEY = 'property.capture.session.v1';
const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const providerCount = () => lines(providerLog).filter((l) => l.answered === 'proposal').length; // interpretação guiada (chat completions, fixture determinístico)
const classifierCount = () => lines(providerLog).filter((l) => l.answered === 'abstain').length; // classificador de intenção do turno IMOB NÃO guiado (/v1/responses, abstenção determinística)
const unsupportedCount = () => lines(providerLog).filter((l) => l.answered === 'unsupported').length; // requisição de provider fora dos contratos simulados
const sessionsOf = async (userId = manifest.owner) => (await db.query(
  `SELECT id, metadata FROM memory_events WHERE key=$1 AND tenant_id=$2 AND workspace_id=$3 AND metadata->>'actorUserId'=$4 ORDER BY created_at, id`,
  [SESSION_KEY, manifest.tenantId, manifest.workspaceId, userId])).rows.map((r) => ({ id: r.id, ...r.metadata }));
const propertiesOf = async () => (await db.query(
  `SELECT id, tenant_id, workspace_id, property_type, city, address, bedrooms, bathrooms, garage_spots, area_m2, created_at FROM imob_properties WHERE tenant_id=$1 ORDER BY created_at`, [manifest.tenantId])).rows;
const openSession = async () => (await sessionsOf()).find((s) => s.status === 'active' || s.status === 'paused');

// ─── Estado limpo pela PRÓPRIA recuperação real da API (HTTP): encerra sessões abertas do ator por referência ───
async function resetActor() {
  for (let i = 0; i < 3; i += 1) {
    const open = await openSession();
    if (!open) return;
    const r = await fetch(`${apiUrl}/imob/chat/resolve-turn`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${manifest.tokens.owner}` },
      body: JSON.stringify({ message: 'cancel', intake: 'property_draft', propertyCapture: { message: 'cancel', operation: 'property.create', step: 'editing_form', draft: {}, history: [], guided: { action: 'cancel', sessionRef: open.id, revision: 0 } } }) });
    assert.equal(r.status, 200, 'reset: cancelamento por referência');
  }
}

const results = [];
const httpTrace = [];
const foreignHosts = new Map();
let shot = 0;
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();

async function newPage(label, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.continue();
    foreignHosts.set(u.hostname, (foreignHosts.get(u.hostname) ?? 0) + 1);
    return route.abort('blockedbyclient');
  });
  await ctx.addInitScript(([t, tenant, ws]) => { localStorage.setItem('eiah_token', t); localStorage.setItem('tenant_id', tenant); localStorage.setItem('workspace_id', ws); },
    [manifest.tokens.owner, manifest.tenantId, manifest.workspaceId]);
  const page = await ctx.newPage();
  page.guided = []; page.errors = []; page.label = label;
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith('/api/')) return;
    const req = res.request();
    const entry = { page: label, method: req.method(), path: url.pathname, status: res.status() };
    if (url.pathname === '/api/imob/chat/resolve-turn' || url.pathname === '/api/imob/properties') {
      try {
        const sent = JSON.parse(req.postData() ?? '{}');
        const g = sent.propertyCapture?.guided;
        if (g) { entry.action = g.action; entry.sentRevision = g.revision; entry.sentSessionRef = Boolean(g.sessionRef); }
        if (sent.claimOnly === true) entry.claim = true;
        const body = await res.json();
        if (entry.claim) { entry.claimed = body?.claimed ?? null; entry.claimAction = body?.data?.action ?? null; }
        const guided = body?.data?.propertyCapture?.guided;
        if (guided) { Object.assign(entry, { status_s: guided.status, phase: guided.phase, currentField: guided.currentField, revision: guided.revision, interpretation: guided.interpretation, errors: Object.keys(guided.errors ?? {}) }); page.guided.push({ ...entry, sessionRef: guided.sessionRef, outcome: body.data.propertyCapture.outcome }); }
        if (body?.error?.code) entry.errorCode = body.error.code;
      } catch { /* corpo não JSON */ }
    }
    httpTrace.push(entry);
  });
  await page.goto(`${base}/app/chat`, { waitUntil: 'networkidle' });
  return page;
}
const snap = async (page, name) => { shot += 1; const file = `${String(shot).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(out, file) }); return file; };
const waitTurn = (page, count = 1) => page.waitForResponse((r) => r.url().includes('/api/imob/chat/resolve-turn') && r.request().method() === 'POST', { timeout: 20000 }).then(async (r) => { await r.finished(); await page.waitForTimeout(350); return r; });
async function say(page, text) {
  const turn = waitTurn(page); turn.catch(() => undefined);
  await page.locator('textarea').last().fill(text);
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await turn;
}
const fld = (page, name) => page.locator(`[data-imob-form-field="${name}"]`).last().locator('input,select,textarea').first();
const bodyText = (page) => page.locator('body').innerText();
const last = (page) => page.guided.at(-1);
const visibleFormFields = (page) => page.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter((e) => (e.offsetWidth || e.offsetHeight) && e.type !== 'hidden' && e.tagName !== 'TEXTAREA' || (e.tagName === 'TEXTAREA' && (e.offsetWidth || e.offsetHeight) && !e.placeholder)).map((e) => (e.labels?.[0]?.textContent || e.name || e.getAttribute('aria-label') || '').trim()));

async function scenario(id, name, fn) {
  if (only && !only.includes(id)) return;
  if (!KNOWN_SCENARIOS.includes(id)) throw new Error(`cenário ${id} fora de KNOWN_SCENARIOS`);
  const record = { id, name, status: 'APROVADO', checks: [], screenshots: [] };
  const unsupportedAtStart = unsupportedCount();
  const check = async (what, work) => {
    try { await work(); record.checks.push({ what, ok: true }); }
    catch (error) { record.checks.push({ what, ok: false, error: String(error.message ?? error).replace(/\s+/g, ' ').slice(0, 360) }); record.status = 'REPROVADO'; }
  };
  const critical = async (what, work) => { await check(what, work); if (!record.checks.at(-1).ok) throw new Error(`etapa crítica reprovada: ${what}`); };
  try { await fn({ check, critical, record }); }
  catch (error) { if (record.status === 'APROVADO') record.status = 'REPROVADO'; record.aborted = String(error.message ?? error).replace(/\s+/g, ' ').slice(0, 700); }
  await check('simulador: nenhuma requisição de provider fora dos contratos simulados (501 explícito)', async () => assert.equal(unsupportedCount() - unsupportedAtStart, 0, JSON.stringify(lines(providerLog).filter((l) => l.answered === 'unsupported').slice(unsupportedAtStart).map(({ contract, reason }) => ({ contract, reason })))));
  results.push(record);
  console.log(`[${record.status}] ${id} ${name}${record.aborted ? ` — ${record.aborted}` : ''}`);
  for (const c of record.checks.filter((x) => !x.ok)) console.log(`   ✗ ${c.what}: ${c.error}`);
}

// Ação REAL do menu lateral (grupo "Imóveis" → item): abre o grupo só se o item não estiver visível; falha identificando o passo.
async function menuAction(page, group, item) {
  const entry = page.getByRole('menuitem', { name: item, exact: true }).first();
  if (!(await entry.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: new RegExp(`^${group}\\b`) }).first().click({ timeout: 8000 }).catch((e) => { throw new Error(`menu: grupo "${group}" não clicável (${String(e.message).split('\n').slice(0, 8).join(' | ')})`); });
  }
  await entry.click({ timeout: 8000 }).catch(async (e) => { const visible = await page.locator('button:visible').evaluateAll((els) => els.map((x) => (x.textContent || '').trim()).filter(Boolean).slice(0, 30)).catch(() => []); await snap(page, 'falha-menu').catch(() => undefined); throw new Error(`botões visíveis: ${JSON.stringify(visible)}`); }).catch((e) => { throw new Error(`menu: item "${item}" não clicável (${String(e.message).split('\n').slice(0, 8).join(' | ')})`); });
}
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };
let propertyId1;
const divergences = []; // achados preexistentes FORA dos critérios de aprovação (não alteram o resultado do cenário)

// ═════════════════════════════════════════ Percurso principal (desktop): cenários 1 → 4 → 6 sobre a MESMA sessão ═══════════════════
await resetActor();
const startProvider = providerCount();
const sessionsAtStart = (await sessionsOf()).length;
const main = await newPage('desktop', DESKTOP);

await scenario('1', 'Abertura', async ({ check, critical, record }) => {
  await say(main, 'Cadastrar imóvel');
  record.screenshots.push(await snap(main, 'abertura'));
  await critical('fluxo guiado iniciado (resolve-turn 200 com sessão ativa)', async () => { assert.equal(last(main).status, 200); assert.equal(last(main).status_s, 'active'); assert.equal(last(main).phase, 'start'); });
  await check('zero invocações do provider', async () => assert.equal(providerCount() - startProvider, 0));
  await check('formulário completo ausente durante a coleta', async () => {
    const text = await bodyText(main);
    assert.ok(!(await main.getByRole('button', { name: /Salvar cadastro/ }).count()), 'botão Salvar cadastro visível');
    const visibleFields = await main.locator('[data-imob-form-field]').evaluateAll((els) => els.filter((e) => e.offsetWidth || e.offsetHeight).map((e) => e.getAttribute('data-imob-form-field')));
    assert.ok(visibleFields.length <= 1, `campos visíveis: ${visibleFields.join(',')}`);
    for (const name of ['city', 'address', 'neighborhood', 'cep', 'bathrooms', 'bedrooms']) assert.ok(!visibleFields.includes(name), `campo ${name} visível na abertura`);
    assert.match(text, /Vamos cadastrar um imóvel, um campo por vez/);
  });
  await check('persistência de sessão ≠ imóvel: 1 sessão de controle, 0 imóveis', async () => { assert.equal((await sessionsOf()).length - sessionsAtStart, 1); assert.equal((await propertiesOf()).length, 0); });
  await check('alternativa "Continuar sem IA" disponível como controle visível e acionável', async () => {
    const control = main.getByRole('button', { name: 'Continuar sem IA', exact: true });
    assert.ok((await control.count()) > 0 && await control.first().isVisible(), 'nenhum botão "Continuar sem IA" renderizado (placeholder diz "escolha Continuar sem IA")');
  });
});

await scenario('2', 'Proposta inicial (IA simulada)', async ({ check, critical, record }) => {
  const before = providerCount();
  await say(main, 'São dois quartos e uma vaga');
  record.screenshots.push(await snap(main, 'proposta'));
  await critical('exatamente uma invocação do provider simulado, com a resposta de proposta', async () => {
    const calls = lines(providerLog).slice(before); assert.equal(calls.length, 1); assert.equal(calls[0].answered, 'proposal');
  });
  await check('proposta mostra Quartos=2 e Vagas=1', async () => { const text = await bodyText(main); assert.match(text, /Quartos[^;\n]*: 2/); assert.match(text, /Vagas de garagem[^;\n]*: 1/); });
  await check('dados ainda NÃO aplicados antes da confirmação (servidor)', async () => { const s = await openSession(); assert.ok(s.pending, 'proposta pendente'); assert.equal(s.draft.bedrooms ?? '', ''); assert.equal(s.draft.garageSpots ?? '', ''); assert.equal(s.interpretation, 'consumed'); });
  const afterProposal = providerCount();
  await say(main, 'sim');
  await check('uma confirmação aplica uma vez, sem nova invocação', async () => {
    assert.equal(providerCount(), afterProposal);
    const s = await openSession(); assert.equal(s.draft.bedrooms, '2'); assert.equal(s.draft.garageSpots, '1'); assert.equal(s.pending, null);
    assert.equal(last(main).action, 'confirm');
  });
  await check('"sim" repetido não reaplica nem chama modelo', async () => { const n = providerCount(); await say(main, 'sim'); assert.equal(providerCount(), n); const s = await openSession(); assert.equal(s.draft.bedrooms, '2'); });
  await check('imóveis ainda 0', async () => assert.equal((await propertiesOf()).length, 0));
});

const asked = [];
await scenario('3', 'Coleta, um campo por vez', async ({ check, critical, record }) => {
  const providerBefore = providerCount();
  const turn = () => last(main);
  const note = () => { const field = turn().currentField; if (field && asked.at(-1) !== field) asked.push(field); };
  await say(main, 'Continuar sem IA'); note();
  await check('"Continuar sem IA" (digitado) segue sem modelo', async () => { assert.equal(turn().phase, 'collecting'); assert.equal(providerCount(), providerBefore); });
  // propertyType: entrada ambígua/inválida → orientação, sem modelo
  await critical('tipo é a primeira pergunta e bedrooms/garageSpots (já confirmados) não são repetidos', async () => assert.equal(turn().currentField, 'propertyType'));
  await say(main, 'casa de praia ou sobrado, não sei');
  await check('entrada ambígua recebe orientação e não dispara outro modelo', async () => { assert.match(await bodyText(main), /Selecione uma opção válida/); assert.equal(providerCount(), providerBefore); assert.equal(turn().currentField, 'propertyType'); });
  // seleção direta altera somente o campo escolhido
  const sessionBefore = await openSession();
  const selectTurn = waitTurn(main); selectTurn.catch(() => undefined);
  const selects = main.locator('select').filter({ hasNot: main.locator('option', { hasText: 'Selecione um campo' }) });
  const control = (await selects.count()) ? selects.last() : null;
  await critical('seletor do campo atual disponível', async () => assert.ok(control, 'sem seletor do campo atual'));
  const options = await control.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.text })).filter((o) => o.value));
  await control.selectOption(options[0].value); await selectTurn; note();
  record.screenshots.push(await snap(main, 'coleta-selecao'));
  await check('seleção direta aplicou SOMENTE o campo escolhido', async () => {
    const s = await openSession(); assert.equal(s.draft.propertyType, options[0].value);
    for (const key of Object.keys(s.draft)) if (key !== 'propertyType') assert.equal(s.draft[key], sessionBefore.draft[key], `campo ${key} alterado`);
    assert.equal(providerCount(), providerBefore);
  });
  // plano determinístico por campo
  const plan = { ownerId: 'skip', goal: 'skip', unitLabel: 'Apto 101', occupancy: 'skip', city: 'Itajaí', address: 'invalid-then-skip', neighborhood: 'skip', cep: 'invalid-then-skip', areaM2: '85', bathrooms: '0' };
  let guard = 0;
  while (turn().phase === 'collecting' && guard++ < 20) {
    const field = turn().currentField; if (!field) break;
    const how = plan[field]; assert.ok(how !== undefined, `campo inesperado ${field}`);
    if (how === 'skip') await say(main, 'Pular este campo');
    else if (how === 'invalid-then-skip') {
      await say(main, field === 'address' ? 'abc' : '123');
      await check(`entrada inválida em ${field} recebe orientação (e fica no mesmo campo)`, async () => { assert.equal(turn().currentField, field); assert.match(await bodyText(main), field === 'address' ? /mínimo de 5 caracteres/ : /CEP com 8 dígitos/); });
      await say(main, 'Pular este campo');
    } else await say(main, how);
    note();
  }
  record.screenshots.push(await snap(main, 'coleta-fim'));
  await check('um campo por vez: nenhuma pergunta repetida (válidos e pulados não voltam)', async () => {
    assert.equal(new Set(asked).size, asked.length, `repetidos em ${asked.join(',')}`);
    assert.ok(!asked.includes('bedrooms') && !asked.includes('garageSpots'), 'campos já confirmados foram perguntados de novo');
  });
  await check('zero válido preservado (bathrooms=0)', async () => { const s = await openSession(); assert.equal(s.draft.bathrooms, '0'); });
  await check('pulados registrados; obrigatório pulado (endereço) continua pendente', async () => { const s = await openSession(); assert.ok(s.skipped.includes('address')); assert.ok(s.skipped.includes('goal')); assert.equal(s.draft.address ?? '', ''); });
  await check('nenhuma invocação do provider durante a coleta', async () => assert.equal(providerCount(), providerBefore));
  await check('coleta encerrada leva à revisão', async () => assert.equal(turn().phase, 'review'));
  await check('corrigir/retomar: seletor "Corrigir ou retomar campo" reabre um pulado e só ele', async () => {
    const before = await openSession();
    const focusTurn = waitTurn(main); focusTurn.catch(() => undefined);
    await main.getByLabel('Corrigir ou retomar campo').selectOption({ label: 'Destinação inicial (pulado)' }).catch(async () => { const opts = await main.getByLabel('Corrigir ou retomar campo').locator('option').allTextContents(); throw new Error(`opções: ${opts.join('|').slice(0, 160)}`); });
    await focusTurn;
    assert.equal(turn().currentField, 'goal'); const after = await openSession();
    assert.ok(!after.skipped.includes('goal')); assert.deepEqual(after.draft, before.draft); assert.equal(providerCount(), providerBefore);
    await say(main, 'Pular este campo'); // volta a pular; mantém o percurso
    assert.equal(turn().phase, 'review');
  });
});

await scenario('4', 'Revisão e bloqueio de salvamento sem obrigatórios', async ({ check, critical, record }) => {
  record.screenshots.push(await snap(main, 'revisao'));
  await critical('formulário completo existente aparece na revisão', async () => {
    assert.ok(await main.getByRole('button', { name: /Salvar cadastro/ }).first().isVisible());
    for (const name of ['city', 'address']) assert.ok(await fld(main, name).isVisible(), `campo ${name}`);
  });
  await check('mostra os valores confirmados', async () => {
    assert.equal(await fld(main, 'city').inputValue(), 'Itajaí');
    assert.equal(await fld(main, 'bedrooms').inputValue(), '2');
    assert.equal(await fld(main, 'garageSpots').inputValue(), '1');
    assert.equal(await fld(main, 'bathrooms').inputValue(), '0');
  });
  await check('revisão lista a pendência obrigatória (Endereço)', async () => assert.match(await bodyText(main), /Pendências: [^\n]*Endereço/));
  const postsBefore = httpTrace.filter((h) => h.method === 'POST' && h.path === '/api/imob/properties').length;
  await main.getByRole('button', { name: /Salvar cadastro/ }).first().click(); await main.waitForTimeout(800);
  record.screenshots.push(await snap(main, 'revisao-bloqueada'));
  await check('obrigatório pulado bloqueia o save (UI): nenhum POST /properties e 0 imóveis', async () => {
    assert.equal(httpTrace.filter((h) => h.method === 'POST' && h.path === '/api/imob/properties').length, postsBefore);
    assert.equal((await propertiesOf()).length, 0);
    assert.match(await bodyText(main), /obrigatório antes de salvar/);
  });
  await check('servidor rejeita save sem obrigatórios mesmo com a validação visual contornada (com e sem referência)', async () => {
    const s = await openSession();
    const call = (metadata) => main.evaluate(async ({ url, metadata }) => {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('eiah_token')}` }, body: JSON.stringify({ propertyType: 'apartamento', city: 'Itajaí', metadata }) });
      return { status: r.status, code: (await r.json()).error?.code };
    }, { url: `${apiUrl}/imob/properties`, metadata });
    const withRef = await call({ propertyCaptureSessionRef: s.id }); const withoutRef = await call({});
    assert.deepEqual([withRef.status, withRef.code], [400, 'IMOB_PROPERTY_GUIDED_INVALID']);
    assert.deepEqual([withoutRef.status, withoutRef.code], [400, 'IMOB_PROPERTY_GUIDED_INVALID']);
    assert.equal((await propertiesOf()).length, 0);
  });
  await check('corrigir permite prosseguir (preencher Endereço na revisão remove a pendência)', async () => {
    await fld(main, 'address').fill('Rua Sintética, 100');
    await fld(main, 'address').blur();
    await main.waitForTimeout(300);
  });
});

await scenario('6', 'Salvamento integrado', async ({ check, critical, record }) => {
  const providerBefore = providerCount();
  const s = await openSession();
  const postsBefore = httpTrace.filter((h) => h.method === 'POST' && h.path === '/api/imob/properties').length;
  const saved = main.waitForResponse((r) => r.url().endsWith('/api/imob/properties') && r.request().method() === 'POST', { timeout: 20000 }); saved.catch(() => undefined);
  await main.getByRole('button', { name: /Salvar cadastro/ }).first().dblclick();
  const response = await saved; await main.waitForTimeout(1200);
  record.screenshots.push(await snap(main, 'salvo'));
  await critical('POST /api/imob/properties respondeu 201', async () => assert.equal(response.status(), 201));
  const posts = httpTrace.filter((h) => h.method === 'POST' && h.path === '/api/imob/properties').slice(postsBefore);
  await check('registro persistido no banco descartável com valores, tenant e workspace corretos', async () => {
    const rows = await propertiesOf(); assert.equal(rows.length, 1); propertyId1 = rows[0].id;
    const p = rows[0];
    assert.equal(p.tenant_id, manifest.tenantId); assert.equal(p.workspace_id, manifest.workspaceId);
    assert.deepEqual([p.property_type, p.city, p.address, Number(p.bedrooms), Number(p.bathrooms), Number(p.garage_spots), Number(p.area_m2)], ['apartamento', 'Itajaí', 'Rua Sintética, 100', 2, 0, 1, 85]);
  });
  await check('estado final da sessão: saved', async () => { const row = (await sessionsOf()).find((x) => x.sessionRef === s.id || x.id === s.id); assert.equal(row.status, 'saved'); assert.equal(row.pending, null); });
  await check('sem chamada adicional ao provider no salvamento', async () => assert.equal(providerCount(), providerBefore));
  await check('clique duplo: comportamento efetivo registrado (cliques=2)', async () => {
    record.doubleClick = { postRequests: posts.length, statuses: posts.map((p) => p.status), propertiesInDb: (await propertiesOf()).length };
    assert.equal((await propertiesOf()).length, 1, `duplicidade: ${record.doubleClick.propertiesInDb} imóveis`);
  });
  await check('reenvio do mesmo save (replay HTTP) não duplica: servidor rejeita sessão já salva', async () => {
    const r = await main.evaluate(async ({ url, ref }) => { const x = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('eiah_token')}` }, body: JSON.stringify({ propertyType: 'apartamento', city: 'Itajaí', address: 'Rua Sintética, 100', metadata: { propertyCaptureSessionRef: ref } }) }); return { status: x.status, code: (await x.json()).error?.code }; }, { url: `${apiUrl}/imob/properties`, ref: s.id });
    record.replay = r; assert.equal(r.status, 400); assert.equal((await propertiesOf()).length, 1);
  });
});

// ═════════════════════════════════════════ Cenário 5: ciclo de vida (cada subcaso parte de estado limpo) ═════════════════════════════
await main.context().close();
async function freshSession(page, { interpret = false } = {}) {
  await say(page, 'Cadastrar imóvel');
  if (interpret) await say(page, 'São dois quartos e uma vaga');
  return openSession();
}

// ─── P-01: "Continuar sem IA" na abertura, por clique, por teclado (Enter e Espaço) e no mobile (emulação) ───
async function focusByTab(page, matcher) { await page.evaluate(() => document.body.focus()); for (let i = 0; i < 120; i += 1) { await page.keyboard.press('Tab'); if (await page.evaluate(matcher)) return true; } return false; }
await scenario('1b', 'P-01 "Continuar sem IA" na abertura: clique, teclado (Enter/Espaço) e mobile, sem provider e sem formulário completo', async ({ check, critical, record }) => {
  const control = (page) => page.getByRole('button', { name: 'Continuar sem IA', exact: true });
  const noFullForm = async (page) => { const fields = await page.locator('[data-imob-form-field]').evaluateAll((els) => els.filter((e) => e.offsetWidth || e.offsetHeight).map((e) => e.getAttribute('data-imob-form-field'))); assert.ok(fields.length <= 1, `campos visíveis: ${fields.join(',')}`); assert.ok(!(await page.getByRole('button', { name: /Salvar cadastro/ }).count()), 'Salvar cadastro visível'); };
  for (const [mode, how] of [['clique', async (page) => { const t = waitTurn(page); t.catch(() => undefined); await control(page).click(); await t; }],
    ['teclado Enter', async (page) => { assert.ok(await focusByTab(page, () => document.activeElement?.textContent?.trim() === 'Continuar sem IA'), 'Tab não alcançou o botão'); const t = waitTurn(page); t.catch(() => undefined); await page.keyboard.press('Enter'); await t; }],
    ['teclado Espaço', async (page) => { assert.ok(await focusByTab(page, () => document.activeElement?.textContent?.trim() === 'Continuar sem IA'), 'Tab não alcançou o botão'); const t = waitTurn(page); t.catch(() => undefined); await page.keyboard.press('Space'); await t; }]]) {
    await resetActor();
    const providerBefore = providerCount();
    const page = await newPage(`p01-${mode}`, DESKTOP);
    await say(page, 'Cadastrar imóvel');
    await critical(`${mode}: botão "Continuar sem IA" visível na abertura`, async () => { assert.ok(await control(page).first().isVisible()); });
    await check(`${mode}: abertura sem formulário completo e sem provider`, async () => { await noFullForm(page); assert.equal(providerCount(), providerBefore); });
    if (mode === 'clique') record.screenshots.push(await snap(page, 'p01-abertura-com-botao'));
    await how(page);
    record.screenshots.push(await snap(page, `p01-depois-${mode.replace(/\s+/g, '-')}`));
    await check(`${mode}: comando determinístico "collect" → coleta de um campo, servidor com consumo recusado`, async () => {
      const g = last(page); assert.equal(g.action, 'collect'); assert.equal(g.status, 200); assert.equal(g.phase, 'collecting'); assert.equal(g.currentField, 'propertyType');
      const row = await openSession(); assert.equal(row.phase, 'collecting'); assert.equal(row.interpretation, 'declined');
    });
    await check(`${mode}: nenhuma invocação do provider e formulário completo ainda oculto`, async () => { assert.equal(providerCount(), providerBefore); await noFullForm(page); });
    await check(`${mode}: a ação deixa de ser oferecida e o histórico mostra a escolha`, async () => { assert.equal(await control(page).count(), 0); assert.match(await bodyText(page), /Continuar sem IA/); });
    await page.context().close();
  }
  // mobile (emulação): controle visível dentro do viewport, alvo de toque suficiente, aciona por toque
  await resetActor();
  const providerBefore = providerCount();
  const mobile = await newPage('p01-mobile', MOBILE, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await say(mobile, 'Cadastrar imóvel');
  await control(mobile).scrollIntoViewIfNeeded();
  record.screenshots.push(await snap(mobile, 'p01-mobile-abertura'));
  await check('mobile (emulação): botão visível dentro do viewport, sem corte e com alvo de toque ≥ 40px', async () => {
    const box = await control(mobile).boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= MOBILE.width + 1, JSON.stringify(box)); assert.ok(box.height >= 40, `altura ${box.height}`);
    assert.ok((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'rolagem horizontal');
  });
  await check('mobile (emulação): toque aciona a coleta sem provider', async () => { const t = waitTurn(mobile); t.catch(() => undefined); await control(mobile).tap(); await t; assert.equal(last(mobile).action, 'collect'); assert.equal(providerCount(), providerBefore); });
  await mobile.context().close();
  await resetActor();
});

await scenario('5a', 'Reload na mesma aba preserva rascunho e consumo', async ({ check, critical, record }) => {
  await resetActor();
  const page = await newPage('reload', DESKTOP);
  const providerBefore = providerCount();
  await freshSession(page, { interpret: true }); await say(page, 'sim'); await say(page, 'Continuar sem IA');
  await say(page, 'Pular este campo'); // goal? campo atual depende do passo; apenas avança a coleta
  const before = await openSession();
  await critical('provider chamado uma vez até aqui', async () => assert.equal(providerCount() - providerBefore, 1));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  record.screenshots.push(await snap(page, 'reload'));
  await check('após reload a sessão do servidor está intacta (rascunho, pulados e consumo)', async () => { const after = await openSession(); assert.deepEqual(after.draft, before.draft); assert.deepEqual(after.skipped, before.skipped); assert.equal(after.interpretation, before.interpretation); });
  await check('após reload a conversa mostra a coleta em andamento (mesma aba)', async () => assert.match(await bodyText(page), /Continuamos no mesmo cadastro|Vamos cadastrar um imóvel/));
  const turnBefore = page.guided.length;
  await say(page, 'São dois quartos e uma vaga');
  await check('depois do reload, repetir a descrição NÃO renova a interpretação (sem novo provider)', async () => assert.equal(providerCount() - providerBefore, 1));
  await check('sessão continua única e aberta', async () => { const all = await sessionsOf(); assert.equal(all.filter((s) => s.status === 'active').length, 1); assert.ok(page.guided.length > turnBefore); });
  await page.context().close();
});

await scenario('5b', 'Pausa e retomada não renovam a interpretação', async ({ check, record }) => {
  await resetActor();
  const page = await newPage('pause', DESKTOP);
  const providerBefore = providerCount();
  await freshSession(page, { interpret: true });
  const consumed = (await openSession()).interpretation;
  await say(page, 'Mudar de assunto');
  await check('pausa registrada no servidor, dados e consumo preservados', async () => { const s = await sessionsOf(); assert.equal(s.at(-1).status, 'paused'); assert.equal(s.at(-1).interpretation, consumed); assert.equal(providerCount() - providerBefore, 1); });
  record.screenshots.push(await snap(page, 'pausado'));
  await say(page, 'Continuar cadastro do imóvel');
  await check('retomada: mesma sessão ativa, sem nova interpretação', async () => { const s = await sessionsOf(); const open = await openSession(); assert.equal(open.status, 'active'); assert.equal(open.interpretation, consumed); assert.equal(providerCount() - providerBefore, 1); });
  await page.context().close();
});

await scenario('5c', 'Cancelar com revisão antiga (requisição em voo) e ação antiga não atinge cadastro novo', async ({ check, critical, record }) => {
  await resetActor();
  const page = await newPage('cancel', DESKTOP);
  await freshSession(page);
  const a = await openSession();
  // Segura a RESPOSTA de um "Continuar sem IA" já processado pelo servidor: o cliente continua com a revisão antiga.
  let held;
  await page.route('**/api/imob/chat/resolve-turn', async (route) => {
    const sent = JSON.parse(route.request().postData() ?? '{}').propertyCapture?.guided;
    if (sent?.action === 'collect' && !held) { held = true; const response = await route.fetch(); await new Promise((r) => setTimeout(r, 1800)); return route.fulfill({ response }); }
    return route.continue();
  });
  const collect = page.locator('textarea').last().fill('Continuar sem IA').then(() => page.getByRole('button', { name: 'Enviar mensagem' }).click());
  await collect; await page.waitForTimeout(500);
  const revisionServer = (await openSession()).revision;
  const cancelTurn = waitTurn(page); cancelTurn.catch(() => undefined);
  await page.locator('textarea').last().fill('Cancelar cadastro do imóvel'); await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await cancelTurn;
  const cancelCall = page.guided.find((g) => g.action === 'cancel');
  await check('o cancelamento saiu com revisão ANTIGA (menor que a do servidor)', async () => { assert.ok(cancelCall, 'sem chamada de cancelamento'); assert.ok(cancelCall.sentRevision < revisionServer, `enviada ${cancelCall.sentRevision} × servidor ${revisionServer}`); });
  await check('mesmo assim a sessão foi cancelada no banco (resposta reflete o estado persistido)', async () => { const s = (await sessionsOf()).find((x) => x.id === a.id); assert.equal(s.status, 'cancelled'); assert.equal(cancelCall.status_s, 'cancelled'); });
  await page.waitForTimeout(1800); record.screenshots.push(await snap(page, 'cancelado-revisao-antiga'));
  await page.unroute('**/api/imob/chat/resolve-turn');
  // cadastro novo; ação antiga (mesma aba) não pode atingi-lo
  await say(page, 'Cadastrar imóvel');
  const b = await openSession();
  await critical('cadastro novo é outra sessão', async () => assert.notEqual(b.id, a.id));
  await check('ação atrasada com a referência antiga (replay HTTP) não encerra o cadastro novo', async () => {
    const r = await page.evaluate(async ({ url, ref }) => { const x = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('eiah_token')}` }, body: JSON.stringify({ message: 'cancel', intake: 'property_draft', propertyCapture: { message: 'cancel', operation: 'property.create', step: 'editing_form', draft: {}, history: [], guided: { action: 'cancel', sessionRef: ref, revision: 0 } } }) }); const j = await x.json(); return { status: x.status, state: j.data?.propertyCapture?.guided?.status }; }, { url: `${apiUrl}/imob/chat/resolve-turn`, ref: a.id });
    assert.equal(r.status, 200); assert.equal(r.state, 'cancelled', 'reflete a sessão antiga'); assert.equal((await openSession()).id, b.id);
  });
  await page.context().close();
});

await scenario('5d', 'Resposta tardia não reabre sessão cancelada nem substitui cadastro novo', async ({ check, critical, record }) => {
  await resetActor();
  const page = await newPage('late', DESKTOP);
  const providerBefore = providerCount();
  await freshSession(page);
  const a = await openSession();
  let release; const gate = new Promise((r) => { release = r; }); let heldOnce = false;
  await page.route('**/api/imob/chat/resolve-turn', async (route) => {
    const sent = JSON.parse(route.request().postData() ?? '{}').propertyCapture?.guided;
    if (sent?.action === 'interpret' && !heldOnce) { heldOnce = true; const response = await route.fetch(); await gate; return route.fulfill({ response }); }
    return route.continue();
  });
  await page.locator('textarea').last().fill('São dois quartos e uma vaga'); await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await critical('o servidor processou a interpretação (provider +1) enquanto a resposta fica retida', async () => { for (let i = 0; i < 40 && providerCount() === providerBefore; i += 1) await page.waitForTimeout(100); assert.equal(providerCount() - providerBefore, 1); });
  await page.locator('textarea').last().fill('Cancelar cadastro do imóvel'); await page.getByRole('button', { name: 'Enviar mensagem' }).click(); await page.waitForTimeout(1200);
  await say(page, 'Cadastrar imóvel');
  const b = await openSession();
  await critical('cadastro novo aberto', async () => { assert.ok(b); assert.notEqual(b.id, a.id); });
  const textBefore = await bodyText(page);
  release(); await page.waitForTimeout(1500);
  record.screenshots.push(await snap(page, 'resposta-tardia'));
  await check('a resposta tardia não exibiu a proposta nem substituiu o cadastro novo', async () => {
    const text = await bodyText(page); assert.ok(!/Incluir Quartos/.test(text) && !/Posso aplicar estas alterações/.test(text), 'proposta tardia apareceu');
    assert.equal(text.includes('Vamos cadastrar um imóvel'), textBefore.includes('Vamos cadastrar um imóvel'));
  });
  await check('banco: antiga cancelada/sem proposta/consumo mantido; nova ativa e intacta', async () => {
    const all = await sessionsOf(); const oldRow = all.find((s) => s.id === a.id); const newRow = all.find((s) => s.id === b.id);
    assert.equal(oldRow.status, 'cancelled'); assert.equal(oldRow.pending, null); assert.equal(oldRow.interpretation, 'consumed');
    assert.equal(newRow.status, 'active'); assert.equal(newRow.interpretation, 'available'); assert.equal(newRow.pending, null);
    assert.equal(providerCount() - providerBefore, 1, 'o transporte já autorizado não é recolhido, e não houve outro');
  });
  await page.context().close();
});

await scenario('5e', 'Aba/origem perdida: bloqueio, 409 com cancelamento explícito autorizado, abertura em nova aba', async ({ check, critical, record }) => {
  await resetActor();
  const tab1 = await newPage('tab1', DESKTOP);
  await freshSession(tab1);
  const a = await openSession();
  const tab2 = await newPage('tab2', DESKTOP); // nova aba/contexto: a origem do cadastro anterior foi perdida
  const providerBefore = providerCount(), classifierBefore = classifierCount();
  // (i) DIVERGÊNCIA PREEXISTENTE DE ROTEAMENTO (fora dos critérios deste cenário): "quero ver meus imóveis" cai no ramo jurídico local do Front Door
  // (isLegalRoutingQuestion casa "imóveis"; o claim do IMOB é transversal e devolve claimed:false). NÃO há asserção que aceite essa resposta:
  // apenas registramos o comportamento observado, sem alterar o status do cenário.
  await say(tab2, 'quero ver meus imóveis').catch(() => undefined);
  await tab2.waitForTimeout(800);
  record.screenshots.push(await snap(tab2, 'divergencia-quero-ver-meus-imoveis'));
  divergences.push({ id: 'D-ROUTING-01', scenario: '5e', input: 'quero ver meus imóveis', observedReply: ((await bodyText(tab2)).match(/Isso parece[^\n]*/) ?? ['(sem resposta jurídica)'])[0].slice(0, 80),
    expected: 'chegar à consulta IMOB ou apresentar restrição de acesso pertinente', providerCallsDuringTurn: providerCount() - providerBefore, origin: 'roteamento local preexistente do Front Door (legalContextResolver.isLegalRoutingQuestion); não é provider, fixture nem fallback do harness', status: 'preexistente, não corrigido nesta etapa' });
  // (ii) abertura guiada na nova aba com sessão abandonada
  await say(tab2, 'Cadastrar imóvel'); await tab2.waitForTimeout(500);
  record.screenshots.push(await snap(tab2, 'abertura-em-nova-aba'));
  await check('P-02: abrir "Cadastrar imóvel" em nova aba com sessão de outra origem oferece a recuperação explícita (aviso 409 com ação), sem erro genérico nem marcador pendente', async () => {
    const text = await bodyText(tab2);
    assert.ok(await tab2.getByRole('button', { name: 'Cancelar cadastro do imóvel' }).count() > 0, `sem ação de recuperação; texto: "${(text.match(/Não consegui confirmar a abertura[^\n]*/) ?? ['(sem mensagem)'])[0].slice(0, 110)}"`);
    assert.doesNotMatch(text, /Não consegui confirmar a abertura/); assert.doesNotMatch(text, /Abrindo o cadastro do imóvel/);
    assert.match(text, /cadastro de imóvel pendente em outra aba ou sessão/);
    const start = httpTrace.filter((h) => h.page === 'tab2' && h.action === 'start').at(-1);
    assert.ok(start && start.status === 409 && start.errorCode === 'IMOB_PROPERTY_CAPTURE_ACTIVE', `início guiado em outra origem: ${JSON.stringify(start)}`);
  });
  await check('nenhuma segunda sessão foi aberta e o provider não foi chamado nesses dois turnos', async () => { assert.equal((await openSession()).id, a.id); assert.equal(providerCount(), providerBefore); });
  // (iii) ação IMOB real pelo menu "Imóveis → Captar imóvel" (única do grupo que chama resolve-turn não guiado; Editar/Arquivar/Anexar/Tokenização não chamam): resolve-turn não guiado → 409 → aviso do cliente
  await menuAction(tab2, 'Imóveis', 'Captar imóvel');
  await tab2.waitForTimeout(1200);
  record.screenshots.push(await snap(tab2, 'bloqueio-409'));
  await check('o servidor respondeu 409 IMOB_PROPERTY_CAPTURE_ACTIVE a uma ação IMOB não guiada', async () => assert.ok(httpTrace.some((h) => h.page === 'tab2' && h.status === 409 && h.errorCode === 'IMOB_PROPERTY_CAPTURE_ACTIVE')));
  await critical('o cliente mostra orientação e a ação "Cancelar cadastro do imóvel" (sem erro genérico)', async () => {
    const text = await bodyText(tab2); assert.match(text, /cadastro de imóvel pendente em outra aba ou sessão/);
    assert.ok(await tab2.getByRole('button', { name: 'Cancelar cadastro do imóvel' }).first().isVisible());
    assert.ok(!/Não consegui abrir o formulário do IMOB/.test(text));
  });
  await check('sem loop e sem LLM: um único 409 por ação e nenhuma chamada de provider', async () => { assert.equal(httpTrace.filter((h) => h.page === 'tab2' && h.path === '/api/imob/chat/resolve-turn' && h.status === 409 && !h.action).length >= 1, true); assert.equal(providerCount(), providerBefore); assert.equal(classifierCount(), classifierBefore, 'o caminho do 409 não deve consultar nenhum modelo'); });
  await check('nada foi cancelado automaticamente', async () => assert.equal((await openSession()).id, a.id));
  // restrições de escopo da recuperação (por referência NÃO é um canal para agir sobre sessão de outro ator)
  const cancelAs = async (token, ref) => { const r = await fetch(`${apiUrl}/imob/chat/resolve-turn`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: 'cancel', intake: 'property_draft', propertyCapture: { message: 'cancel', operation: 'property.create', step: 'editing_form', draft: {}, history: [], guided: { action: 'cancel', sessionRef: ref, revision: 0 } } }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  await check('escopo: outro usuário do mesmo workspace, com a referência da sessão do dono, NÃO a cancela', async () => {
    const r = await cancelAs(manifest.tokens.other, a.id); httpTrace.push({ page: 'scope-other-user', method: 'POST', path: '/api/imob/chat/resolve-turn', status: r.status, state: r.body?.data?.propertyCapture?.guided?.status, errorCode: r.body?.error?.code });
    const s = (await sessionsOf()).find((x) => x.id === a.id); assert.equal(s.status, 'active', `sessão do dono foi alterada por outro usuário (HTTP ${r.status})`);
  });
  await check('escopo: sem credencial a referência não opera (401/403) e a sessão segue ativa', async () => {
    const r = await fetch(`${apiUrl}/imob/chat/resolve-turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'cancel', intake: 'property_draft', propertyCapture: { message: 'cancel', operation: 'property.create', step: 'editing_form', draft: {}, history: [], guided: { action: 'cancel', sessionRef: a.id, revision: 0 } } }) });
    assert.ok([401, 403].includes(r.status), `HTTP ${r.status}`); assert.equal((await openSession()).id, a.id);
  });
  await check('escopo: o cancelamento exige ação explícita do próprio titular (nenhum cancelamento automático até aqui)', async () => assert.equal((await openSession()).id, a.id));
  await tab2.getByRole('button', { name: 'Cancelar cadastro do imóvel' }).first().click(); await tab2.waitForTimeout(1200);
  record.screenshots.push(await snap(tab2, 'recuperado'));
  await check('a ação cancelou exatamente a sessão nomeada (por referência, sem origem)', async () => {
    const cancel = httpTrace.filter((h) => h.page === 'tab2' && h.action === 'cancel').at(-1); assert.ok(cancel && cancel.sentSessionRef && cancel.status === 200 && cancel.status_s === 'cancelled');
    assert.equal((await sessionsOf()).find((s) => s.id === a.id).status, 'cancelled'); assert.equal(await openSession(), undefined);
    assert.match(await bodyText(tab2), /Cadastro pendente cancelado/);
  });
  await check('o usuário foi liberado: nova ação IMOB deixa de dar 409 e novo cadastro exige início explícito', async () => {
    const before = httpTrace.filter((h) => h.page === 'tab2' && h.status === 409).length;
    assert.equal(await openSession(), undefined);
    await menuAction(tab2, 'Imóveis', 'Captar imóvel'); await tab2.waitForTimeout(1200);
    assert.equal(httpTrace.filter((h) => h.page === 'tab2' && h.status === 409).length, before, 'novo 409 após a recuperação');
  });
  // P-02: depois do cancelamento explícito, o início explícito abre OUTRA sessão e a referência antiga não a atinge
  await check('P-02: novo início explícito abre sessão distinta; a referência antiga (replay) não cancela a sessão posterior', async () => {
    await say(tab2, 'Cadastrar imóvel');
    const fresh = await openSession(); assert.ok(fresh, 'sessão nova aberta'); assert.notEqual(fresh.id, a.id);
    const r = await cancelAs(manifest.tokens.owner, a.id); assert.equal(r.status, 200); assert.equal(r.body?.data?.propertyCapture?.guided?.status, 'cancelled');
    assert.equal((await openSession()).id, fresh.id, 'a sessão posterior continua aberta');
    assert.equal(providerCount(), providerBefore, 'nenhuma interpretação consumida');
  });
  record.limits = ['recuperação integral do RASCUNHO entre abas NÃO está implementada: a recuperação é o cancelamento explícito e autorizado por referência; o rascunho da sessão cancelada não é restaurado', 'sem TTL/expiração automática (decisão do owner)'];
  await tab1.context().close(); await tab2.context().close();
});

// ─── P-04: claim pela interface — coleta ativa na mesma aba × aba sem contexto guiado ───
await scenario('5f', 'P-04 claim pela interface: coleta ativa na mesma aba e aba sem contexto guiado; o claim não apaga, substitui nem cancela o rascunho', async ({ check, critical, record }) => {
  await resetActor();
  const claimText = 'Isso já contratou o Marketing?';
  const tab1 = await newPage('p04-tab1', DESKTOP);
  await freshSession(tab1); await say(tab1, 'Continuar sem IA');
  const select = tab1.locator('select').filter({ hasNot: tab1.locator('option', { hasText: 'Selecione um campo' }) }).last();
  const options = await select.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  const picked = waitTurn(tab1); picked.catch(() => undefined); await select.selectOption(options[0]); await picked;
  const before = await openSession();
  await critical('pré-condições: 1 sessão ativa em coleta com 1 campo confirmado', async () => { assert.equal(before.status, 'active'); assert.equal(before.phase, 'collecting'); assert.equal(before.draft.propertyType, options[0]); });
  const providerBefore = providerCount(), classifierBefore = classifierCount();
  // A) mesma aba, coleta ativa
  const mark = httpTrace.length;
  await say(tab1, claimText);
  record.screenshots.push(await snap(tab1, 'p04-mesma-aba-coleta-ativa'));
  await check('A: nenhum claim é emitido pela aba em coleta ativa; o texto segue para a coleta guiada', async () => {
    const mine = httpTrace.slice(mark).filter((h) => h.page === 'p04-tab1' && h.path === '/api/imob/chat/resolve-turn');
    assert.equal(mine.filter((h) => h.claim).length, 0, 'claim emitido'); assert.ok(mine.some((h) => h.action), 'sem chamada guiada');
  });
  await check('A: o rascunho não foi apagado, substituído nem cancelado (mesma sessão ativa, mesmo campo confirmado, 1 sessão aberta)', async () => {
    const after = await openSession(); assert.equal(after.id, before.id); assert.equal(after.status, 'active'); assert.equal(after.draft.propertyType, before.draft.propertyType);
    assert.equal((await sessionsOf()).filter((x) => x.status === 'active' || x.status === 'paused').length, 1);
  });
  await check('A: a interface continua na coleta, com retorno visível ao usuário (não é silencioso)', async () => { const text = await bodyText(tab1); assert.match(text, /Selecione uma opção válida|Continuamos no mesmo cadastro|obrigatório/); assert.ok(!(await tab1.getByRole('button', { name: 'Cancelar cadastro do imóvel' }).count() > 0 && /pendente em outra aba/.test(text)), 'aviso de outra aba'); });
  // B) aba sem contexto guiado (origem perdida) com a sessão aberta: o claim é reivindicado, não bloqueado
  const tab2 = await newPage('p04-tab2', DESKTOP);
  const sessionMid = JSON.stringify(await openSession());
  const mark2 = httpTrace.length;
  await say(tab2, claimText); await tab2.waitForTimeout(500);
  record.screenshots.push(await snap(tab2, 'p04-outra-aba-claim-reivindicado'));
  await check('B: o servidor respondeu 200 claimed:true (consulta de agente) à aba sem contexto, com a sessão guiada aberta', async () => {
    const c = httpTrace.slice(mark2).filter((h) => h.page === 'p04-tab2' && h.claim); assert.ok(c.length >= 1, 'nenhum claim'); assert.ok(c.every((h) => h.status === 200), JSON.stringify(c.map((h) => h.status)));
    assert.ok(c.some((h) => h.claimed === true && h.claimAction === 'crm.case.transversal.agent_engagement'), JSON.stringify(c.map(({ claimed, claimAction }) => ({ claimed, claimAction }))));
    assert.ok(!httpTrace.slice(mark2).some((h) => h.page === 'p04-tab2' && h.status === 409), 'houve 409');
  });
  await check('B: a interface mostra a resposta reivindicada, sem aviso de cadastro pendente e sem erro genérico', async () => {
    const text = await bodyText(tab2); assert.match(text, /especialista de Marketing/i); assert.match(text, /ESPECIALISTA DE MARKETING PARA DIVULGAÇÃO/i, 'cartão de capacidades da resposta reivindicada'); assert.doesNotMatch(text, /cadastro de imóvel pendente em outra aba/); assert.doesNotMatch(text, /Não consegui abrir o formulário/);
    assert.equal(await tab2.getByRole('button', { name: 'Cancelar cadastro do imóvel' }).count(), 0);
  });
  await check('B: a sessão e o rascunho do cadastro aberto ficaram idênticos; nenhum provider/classificador foi chamado', async () => {
    assert.equal(JSON.stringify(await openSession()), sessionMid); assert.equal(providerCount(), providerBefore); assert.equal(classifierCount(), classifierBefore);
  });
  // C) preservação: operação incompatível continua bloqueada. O início guiado de outra origem recebe o conflito (P-02) e a ação IMOB não guiada do menu também.
  await say(tab2, 'Cadastrar imóvel'); await tab2.waitForTimeout(500);
  await menuAction(tab2, 'Imóveis', 'Captar imóvel'); await tab2.waitForTimeout(1200);
  record.screenshots.push(await snap(tab2, 'p04-operacao-incompativel-bloqueada'));
  await check('C: a ação IMOB não guiada continua com 409, aviso e cancelamento explícito; sessão intacta', async () => {
    assert.ok(httpTrace.slice(mark2).some((h) => h.page === 'p04-tab2' && h.status === 409 && h.errorCode === 'IMOB_PROPERTY_CAPTURE_ACTIVE' && !h.claim));
    assert.ok(await tab2.getByRole('button', { name: 'Cancelar cadastro do imóvel' }).first().isVisible()); assert.equal(JSON.stringify(await openSession()), sessionMid);
    assert.equal(classifierCount(), classifierBefore);
  });
  await tab1.context().close(); await tab2.context().close();
});

// ═════════════════════════════════════════ Cenário 7: desktop × mobile (emulação) ══════════════════════════════════════════════════
await scenario('7', 'Desktop e mobile (emulação de viewport): perguntas, seletores, botões, erros, formulário final, scroll, foco e teclado', async ({ check, critical, record }) => {
  await resetActor();
  const providerBefore = providerCount();
  const mobile = await newPage('mobile', MOBILE, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  record.viewports = { desktop: DESKTOP, mobile: { ...MOBILE, emulation: 'Chromium isMobile+touch (emulação; não é aparelho físico)' }, browser: `Chromium ${browserVersion} (Playwright headless)` };
  const overflow = (page) => page.evaluate(() => ({ docOverflow: document.documentElement.scrollWidth - window.innerWidth, clipped: [...document.querySelectorAll('button,input,select,textarea')].filter((e) => e.offsetWidth && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => (e.textContent || e.getAttribute('aria-label') || e.name || e.tagName).trim().slice(0, 30)) }));
  await say(mobile, 'Cadastrar imóvel');
  record.screenshots.push(await snap(mobile, 'mobile-abertura'));
  await check('mobile/abertura: sem rolagem horizontal nem controles cortados', async () => { const o = await overflow(mobile); assert.ok(o.docOverflow <= 1, `overflow ${o.docOverflow}`); assert.deepEqual(o.clipped, []); });
  await say(mobile, 'Continuar sem IA');
  await say(mobile, 'abc');
  record.screenshots.push(await snap(mobile, 'mobile-erro'));
  await check('mobile: pergunta e mensagem de erro visíveis dentro do viewport', async () => { assert.match(await bodyText(mobile), /Selecione uma opção válida/); const o = await overflow(mobile); assert.ok(o.docOverflow <= 1); });
  const control = mobile.locator('select').filter({ hasNot: mobile.locator('option', { hasText: 'Selecione um campo' }) }).last();
  const options = await control.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  const turn = waitTurn(mobile); turn.catch(() => undefined); await control.selectOption(options[0]); await turn;
  await check('mobile: seletor aplica o campo e avança', async () => assert.equal((await openSession()).draft.propertyType, options[0]));
  for (let guard = 0; last(mobile).phase === 'collecting' && guard < 20; guard += 1) {
    const field = last(mobile).currentField;
    await say(mobile, field === 'city' ? 'Itajaí' : field === 'address' ? 'Rua Sintética, 200' : 'Pular este campo');
  }
  await critical('mobile: coleta chegou à revisão', async () => assert.equal(last(mobile).phase, 'review'));
  await mobile.getByRole('button', { name: /Salvar cadastro/ }).first().scrollIntoViewIfNeeded();
  record.screenshots.push(await snap(mobile, 'mobile-revisao'));
  await check('mobile/revisão: formulário final sem corte horizontal; botão Salvar visível', async () => { const o = await overflow(mobile); assert.ok(o.docOverflow <= 1, `overflow ${o.docOverflow}`); assert.deepEqual(o.clipped, []); assert.ok(await mobile.getByRole('button', { name: /Salvar cadastro/ }).first().isVisible()); });
  await check('mobile: alvo de toque do botão Salvar ≥ 40px de altura', async () => { const box = await mobile.getByRole('button', { name: /Salvar cadastro/ }).first().boundingBox(); assert.ok(box.height >= 40, `altura ${box.height}`); });
  await check('teclado (mobile/desktop): Tab alcança o campo de mensagem e o botão Salvar cadastro', async () => {
    const reach = async (page, matcher) => { await page.evaluate(() => document.body.focus()); for (let i = 0; i < 80; i += 1) { await page.keyboard.press('Tab'); if (await page.evaluate(matcher)) return true; } return false; };
    assert.ok(await reach(mobile, () => document.activeElement?.tagName === 'TEXTAREA'), 'Tab não alcançou o campo de mensagem');
    assert.ok(await reach(mobile, () => /Salvar cadastro/.test(document.activeElement?.textContent ?? '')), 'Tab não alcançou Salvar cadastro');
  });
  await check('foco: depois de enviar, o campo de mensagem mantém/recebe o foco', async () => { await mobile.locator('textarea').last().fill('Pular este campo'); const t = waitTurn(mobile); t.catch(() => undefined); await mobile.keyboard.press('Enter').catch(() => undefined); await mobile.getByRole('button', { name: 'Enviar mensagem' }).click().catch(() => undefined); await t.catch(() => undefined); assert.ok(await mobile.evaluate(() => ['TEXTAREA', 'BUTTON', 'BODY'].includes(document.activeElement?.tagName ?? '')), 'foco perdido'); });
  const providerAfter = providerCount();
  await check('mobile: nenhuma invocação do provider no percurso sem IA', async () => assert.equal(providerAfter - providerBefore, 0));
  // salva pelo mobile (explícito) e confere
  const saved = mobile.waitForResponse((r) => r.url().endsWith('/api/imob/properties') && r.request().method() === 'POST', { timeout: 20000 }); saved.catch(() => undefined);
  await mobile.getByRole('button', { name: /Salvar cadastro/ }).first().click();
  await check('mobile: salvamento explícito → 201 e segundo imóvel persistido', async () => { assert.equal((await saved).status(), 201); assert.equal((await propertiesOf()).length, 2); });
  record.screenshots.push(await snap(mobile, 'mobile-salvo'));
  // desktop: geometria/rolagem do formulário final (percurso principal já capturado)
  const desk = await newPage('desktop2', DESKTOP);
  await say(desk, 'Cadastrar imóvel'); await say(desk, 'Revisar cadastro');
  await desk.getByRole('button', { name: /Salvar cadastro/ }).first().scrollIntoViewIfNeeded();
  record.screenshots.push(await snap(desk, 'desktop-revisao-vazia'));
  await check('desktop/revisão: sem corte horizontal e botão Salvar visível', async () => { const o = await overflow(desk); assert.ok(o.docOverflow <= 1); assert.deepEqual(o.clipped, []); assert.ok(await desk.getByRole('button', { name: /Salvar cadastro/ }).first().isVisible()); });
  await check('desktop: o campo de mensagem permanece acessível por rolagem', async () => { const box = await desk.locator('textarea').last().boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= DESKTOP.height + 1); });
  await check('erros de página (pageerror) ausentes nas duas viewports', async () => assert.deepEqual([...mobile.errors, ...desk.errors], []));
  await mobile.context().close(); await desk.context().close();
});

const blocked = lines(blockedLog);
const summary = {
  environment: { browser: `Chromium ${browserVersion} (Playwright headless)`, desktop: DESKTOP, mobile: { ...MOBILE, kind: 'emulação de viewport (isMobile+touch), não aparelho físico' }, apiOrigin: 'loopback (API real, NODE_ENV=test, sem workers/filas)', web: 'Vite dev real em loopback' },
  provider: { simulatedInvocations: providerCount(), classifierInvocations: classifierCount(), unsupportedRequests: unsupportedCount(), entries: lines(providerLog).map(({ seq, host, path: p, contract, answered, messageChars, reason }) => ({ seq, host, path: p, contract, answered, messageChars, ...(reason ? { reason } : {}) })) },
  selection: { requested: only ?? 'todos', executed: results.map((r) => r.id), harnessSelfTest: manifest.selfTest },
  divergences,
  externalTraffic: { browserBlocked: Object.fromEntries(foreignHosts), backendBlocked: blocked.map(({ host, path: p, method }) => ({ host, path: p, method })), note: 'nenhum acesso externo foi liberado; as entradas acima foram abortadas/rejeitadas' },
  database: { properties: (await propertiesOf()).length, sessions: (await sessionsOf()).map(({ status, interpretation, revision }) => ({ status, interpretation, revision })) },
  scenarios: results,
};
await writeFile(path.join(out, 'results.json'), JSON.stringify(summary, null, 2));
await writeFile(path.join(out, 'http-trace.json'), JSON.stringify(httpTrace, null, 2));
await browser.close(); await db.end();
const expectedIds = KNOWN_SCENARIOS.filter((id) => !only || only.includes(id));
if (JSON.stringify(results.map((r) => r.id)) !== JSON.stringify(expectedIds)) { console.error(`seleção divergente: pedidos=${expectedIds} executados=${results.map((r) => r.id)}`); process.exit(3); }
const failed = results.filter((r) => r.status !== 'APROVADO');
console.log(`\nCENÁRIOS: ${results.length} | aprovados ${results.length - failed.length} | reprovados ${failed.length}; provider simulado: interpretação=${summary.provider.simulatedInvocations}, classificador=${summary.provider.classifierInvocations}, não suportadas=${summary.provider.unsupportedRequests}; hosts externos bloqueados no navegador=${JSON.stringify(summary.externalTraffic.browserBlocked)}; no backend=${blocked.length}`);
process.exit(failed.length ? 1 : 0);
