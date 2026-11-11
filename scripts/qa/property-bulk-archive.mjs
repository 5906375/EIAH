import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180 (QA_BASE_URL sobrescreve). Saída: QA_OUT (padrão abaixo).
//
// "Arquivar imóveis" (seleção múltipla): monta o painel REAL (ImobPropertyBulkArchivePanel) com os reducers REAIS
// (propertyBulkArchive.ts) sobre a página real do Front Door. Fixtures 100% sintéticas, nenhuma escrita:
//  - toda rota /api/** é atendida por mock local (route.fulfill); nenhuma chamada sai para a rede;
//  - a única escrita tolerada é POST /api/helpdesk/telemetry (telemetria de rota da própria página, também mockada);
//  - qualquer outra requisição que não seja GET reprova o teste, e mutações em /api/imob/* têm verificação própria;
//  - requisições a hosts da EIAH (onrender.com/eiah) reprovam o teste.
// A integração com a API (DELETE por imóvel, sucesso parcial, sessão) é coberta por createImobStructuredForms.test.ts.
const out = process.env.QA_OUT || 'docs/evidence/imob-bulk-archive';
const base = process.env.QA_BASE_URL || 'http://localhost:5180';
const ALLOWED_NON_GET = new Set(['POST /api/helpdesk/telemetry']);
const FORBIDDEN_HOST = /onrender\.com|eiah/i;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [[320, 700], [390, 844], [1024, 768], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const requests = {};
    const blocked = [];
    const foreignHosts = new Set();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      if (!['localhost', '127.0.0.1'].includes(host)) foreignHosts.add(host);
    });
    await page.addInitScript(() => {
      localStorage.setItem('eiah_token', 'synthetic-ui-fixture');
      localStorage.setItem('tenant_id', 'tenant-test');
      localStorage.setItem('workspace_id', 'workspace-test');
      const messages = [
        { id: 'user-qa', role: 'user', content: 'Arquivar imóvel', status: 'done' },
        { id: 'assistant-qa', role: 'assistant', content: 'Escolha os imóveis que você quer arquivar. Nada é arquivado antes da sua confirmação.', status: 'done' },
      ];
      sessionStorage.setItem('eiah:chat:tenant-test:workspace-test:EIAH:default', JSON.stringify({ messages, runId: null }));
      localStorage.setItem('eiah:greeted:tenant-test:workspace-test', '1');
    });
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const key = `${req.method()} ${new URL(req.url()).pathname}`;
      requests[key] = (requests[key] ?? 0) + 1;
      if (req.method() !== 'GET' && !ALLOWED_NON_GET.has(key)) {
        blocked.push(key);
        await route.fulfill({ status: 403, json: { ok: false, error: { code: 'BLOCKED_BY_QA' } } });
        return;
      }
      const session = { tenantId: 'tenant-test', workspaceId: 'workspace-test', activeDomain: 'core', availableDomains: ['core'], entitlements: {}, productInstallations: [], verticals: [], roles: [], branding: { brandName: 'EIAH', workspaceLabel: 'Workspace de teste' }, experience: { roleProfile: 'workspace_admin', primaryNavigation: [], landingPath: '/app/chat' } };
      const url = req.url();
      const body = req.method() !== 'GET' ? { ok: true, data: { id: 'mock-telemetry' } }
        : url.includes('/session/context') ? { ok: true, data: session }
        : url.includes('/plans/quotas') ? { ok: true, data: { percent: 37, monthUsageCents: 12345, softLimitCents: 20000, hardLimitCents: 40000 } }
        : url.includes('/billing/tenant/summary') ? { ok: true, data: { byWorkspace: [{ workspaceId: 'workspace-test', costCents: 12345, runs: 7 }] } }
        : { ok: false, data: null, items: [] };
      await route.fulfill({ json: body });
    });
    await page.goto(`${base}/app/chat`, { waitUntil: 'domcontentloaded' });
    const surface = page.getByTestId('launcher-conversation-surface');
    await surface.getByText('Arquivar imóvel', { exact: true }).waitFor({ timeout: 60000 });

    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { ImobPropertyBulkArchivePanel } = await import('/src/features/imob/structured/ImobPropertyBulkArchivePanel.tsx');
      const M = await import('/src/pages/app/imob/propertyBulkArchive.ts');
      const mk = (id, unit, owner, address, extra = {}) => ({ id, tenantId: 't', workspaceId: 'w', ownerId: owner?.id ?? null, owner, propertyType: 'kitnet', goal: 'locacao', address, city: 'Cidade Exemplo', neighborhood: null, bedrooms: null, bathrooms: null, areaM2: null, garageSpots: null, askingPriceCents: null, description: null, status: 'ready', pendingItems: null, createdAt: '', updatedAt: '', metadata: { externalPropertyRef: unit }, ...extra });
      const longOwner = { id: 'o3', name: 'Proprietário Sintético com Nome Bastante Longo para Testar Quebra de Linha em Telas Estreitas' };
      const items = [
        mk('p1', 'Kitnet 301', { id: 'o1', name: 'Proprietário Sintético A' }, 'Rua Sintética, 100'),
        mk('p2', 'Kitnet 302', { id: 'o2', name: 'Proprietário Sintético B' }, 'Rua Sintética, 100'),
        mk('p3', 'Kitnet 303', null, 'Rua Sintética, 100'),
        mk('p4', 'Apto 101', { id: 'o1', name: 'Proprietário Sintético A' }, 'Av. Sintética Muito Comprida do Centro Histórico, 12345, Bloco B, Torre 2', { propertyType: 'apartamento' }),
        mk('p5', 'Casa 7', longOwner, 'Travessa Exemplo, 9'),
        mk('p6', 'Sala 12', null, 'Rua Comercial, 55', { propertyType: 'sala_comercial' }),
        mk('p7', 'Kitnet 401', { id: 'o2', name: 'Proprietário Sintético B' }, 'Rua Sintética, 200'),
        mk('p8', 'Kitnet 402', null, 'Rua Sintética, 200'),
      ];
      window.__qaConfirms = 0;
      function App() {
        const [state, setState] = React.useState(() => M.loadedBulkArchiveState(M.initialBulkArchiveState(), items));
        window.__qaState = state;
        const onEvent = (e) => {
          if (e.type === 'confirm') window.__qaConfirms += 1;
          setState((cur) => {
            switch (e.type) {
              case 'toggle': return M.toggleBulkArchiveSelection(cur, e.propertyId);
              case 'query': return M.setBulkArchiveQuery(cur, e.value);
              case 'select_visible': return M.selectVisibleBulkArchive(cur);
              case 'clear': return M.clearBulkArchiveSelection(cur);
              case 'back': return M.backToBulkArchiveSelection(cur);
              case 'review': return M.applyBulkArchiveEligibility(M.enterBulkArchiveReview(cur), new Set(['p2']));
              case 'confirm': {
                // Resultado simulado (sem rede): 1º arquivado, 2º bloqueado por dependência, 3º falha operacional.
                let s = M.startBulkArchiveRun(cur);
                const plan = ['archived', 'blocked', 'failed'];
                s.reviewedIds.forEach((id, i) => { s = M.recordBulkArchiveOutcome(s, id, plan[i] ?? 'not_processed'); });
                return M.finishBulkArchiveRun(s, null);
              }
              case 'retry_pending': {
                // A lista recarregada já não traz o arquivado (p1); bloqueado e arquivado não voltam à fila.
                const fresh = items.map((item) => (item.id === 'p1' ? { ...item, status: 'archived' } : item));
                return M.prepareBulkArchiveRetry(cur, fresh);
              }
              default: return cur;
            }
          });
        };
        return React.createElement(ImobPropertyBulkArchivePanel, { messageId: 'qa', state, onEvent });
      }
      const host = document.createElement('div');
      host.id = 'qa-bulk-archive-host';
      document.querySelector('.front-door-reading-column').append(host);
      createRoot(host).render(React.createElement(App));
    });

    const panel = page.locator('#qa-bulk-archive-host [data-imob-bulk-archive]');
    await panel.waitFor();
    const stage = () => panel.getAttribute('data-imob-bulk-archive');
    const state = () => page.evaluate(() => window.__qaState);
    const screenshots = [];
    const shot = async (name) => { await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/${name}-${width}.png` }); screenshots.push(`${name}-${width}.png`); };
    const noOverflow = async (label) => {
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
      assert.ok(m.doc <= m.view + 1, `${label}: overflow horizontal da página (${m.doc} > ${m.view})`);
      const box = await panel.boundingBox();
      assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${label}: painel fora da viewport`);
    };
    // Leitores de tela: nenhum texto só-leitor (sr-only) pode repetir texto já visível no painel.
    const noRedundantScreenReaderText = async (label) => {
      const redundant = await panel.evaluate((root) => {
        const sr = [...root.querySelectorAll('.sr-only')].map((el) => el.textContent.trim()).filter(Boolean);
        const clone = root.cloneNode(true);
        clone.querySelectorAll('.sr-only').forEach((el) => el.remove());
        const visible = clone.textContent.replace(/\s+/g, ' ');
        return sr.filter((text) => visible.includes(text.replace(/\s+/g, ' ')));
      });
      assert.deepEqual(redundant, [], `${label}: texto sr-only repete texto visível`);
    };

    // 1) Seleção inicial: nada selecionado, nada confirmado
    assert.equal(await stage(), 'select');
    assert.equal(await panel.getByRole('checkbox').count(), 8);
    assert.ok(await panel.getByText('Sem proprietário vinculado').first().isVisible());
    assert.ok(await panel.getByRole('button', { name: 'Revisar arquivamento' }).isDisabled(), 'sem seleção não revisa');
    const unnamed = await panel.getByRole('checkbox').evaluateAll((boxes) => boxes.filter((box) => !(box.closest('label')?.textContent ?? '').trim()).length);
    assert.equal(unnamed, 0, 'todo checkbox tem nome acessível (label)');
    await noRedundantScreenReaderText('seleção');
    await noOverflow('seleção vazia');

    await panel.getByRole('checkbox', { name: /Kitnet 301/ }).check();
    await panel.getByRole('checkbox', { name: /Kitnet 302/ }).check();
    await panel.getByRole('checkbox', { name: /Kitnet 303/ }).check();
    assert.match(await panel.getByRole('status').first().innerText(), /3 selecionados/);
    await panel.getByRole('checkbox', { name: /Kitnet 302/ }).uncheck();
    assert.match(await panel.getByRole('status').first().innerText(), /2 selecionados/);
    await panel.getByRole('checkbox', { name: /Kitnet 302/ }).check();

    // 2) Busca: filtra sem perder a seleção e sinaliza o que ficou fora do filtro
    await panel.getByRole('searchbox').fill('apto');
    assert.equal(await panel.getByRole('checkbox').count(), 1);
    assert.match(await panel.getByRole('status').first().innerText(), /3 selecionados \(3 fora do filtro atual\)/);
    await shot('01-busca-com-selecao-oculta'); await noOverflow('busca');
    await panel.getByRole('searchbox').fill('');
    assert.equal(await panel.getByRole('checkbox').count(), 8);

    // 3) Alvos de toque: elemento efetivamente clicável (label do checkbox, botões, busca); o <input> é informativo.
    const targets = {
      'input do checkbox (informativo)': panel.getByRole('checkbox', { name: /Kitnet 301/ }),
      'label clicável do checkbox': panel.locator('label').filter({ has: page.getByRole('checkbox', { name: /Kitnet 301/ }) }).first(),
      'botão Revisar arquivamento': panel.getByRole('button', { name: 'Revisar arquivamento' }),
      'botão Selecionar os exibidos': panel.getByRole('button', { name: /Selecionar os/ }),
      'botão Limpar seleção': panel.getByRole('button', { name: 'Limpar seleção' }),
      'botão Cancelar': panel.getByRole('button', { name: 'Cancelar' }),
      'campo de busca': panel.getByRole('searchbox'),
    };
    const touchTargets = {};
    for (const [name, loc] of Object.entries(targets)) {
      const b = await loc.boundingBox();
      touchTargets[name] = Math.round(b.height * 10) / 10;
      if (width < 640 && !name.includes('informativo')) assert.ok(b.height >= 43.5, `alvo de toque ≥44px no mobile: ${name} = ${b.height}`);
    }
    await shot('02-selecao-3'); await noOverflow('seleção 3');

    // 4) Revisão HITL: nada confirmado, nada arquivado, texto de elegibilidade sem duplicação
    assert.equal(await page.evaluate(() => window.__qaConfirms), 0);
    await panel.getByRole('button', { name: 'Revisar arquivamento' }).click();
    assert.equal(await stage(), 'review');
    assert.deepEqual((await state()).outcomes, {}, 'a revisão não arquiva nada');
    assert.equal(await page.evaluate(() => window.__qaConfirms), 0, 'revisar não confirma');
    assert.ok(await panel.getByText(/Nada foi arquivado ainda/).isVisible());
    assert.equal(await panel.getByRole('button', { name: 'Confirmar arquivamento de 3 imóveis' }).count(), 1);
    assert.equal(await panel.getByText(/Há caso ou locação ligados/).count(), 1, 'elegibilidade (caso ligado) aparece uma única vez');
    assert.equal(await panel.getByText(/Sem caso ligado conhecido/).count(), 2, 'elegibilidade (sem caso) aparece uma vez por imóvel');
    assert.equal(await panel.getByRole('checkbox').count(), 0);
    assert.equal(await panel.locator('.sr-only').count(), 0, 'a revisão não tem texto só-leitor redundante');
    await noRedundantScreenReaderText('revisão');
    await shot('03-revisao'); await noOverflow('revisão');
    await panel.getByRole('button', { name: 'Voltar à seleção' }).click();
    assert.equal(await panel.getByRole('checkbox', { name: /Kitnet 301/ }).isChecked(), true, 'voltar preserva a seleção');
    await panel.getByRole('button', { name: 'Revisar arquivamento' }).click();

    // 5) Confirmação explícita → resultado parcial simulado, bloqueado preservado
    await panel.getByRole('button', { name: 'Confirmar arquivamento de 3 imóveis' }).click();
    assert.equal(await page.evaluate(() => window.__qaConfirms), 1);
    assert.equal(await stage(), 'result');
    assert.match(await panel.getByRole('status').first().innerText(), /1 arquivado · 1 bloqueado · 0 não processados · 1 com falha/);
    assert.ok(await panel.getByText('Kitnet 302 — bloqueado por dependência (locação ou caso ligado)').isVisible());
    assert.equal((await state()).outcomes.p2, 'blocked');
    assert.ok(await panel.getByRole('button', { name: 'Tentar de novo o imóvel pendente' }).isVisible(), 'só o pendente (falha) é retomável');
    await noRedundantScreenReaderText('resultado');
    await shot('04-resultado-parcial'); await noOverflow('resultado');

    // 6) Retomada: só o pendente volta, exige nova confirmação; arquivado e bloqueado ficam de fora
    await panel.getByRole('button', { name: 'Tentar de novo o imóvel pendente' }).click();
    assert.equal(await stage(), 'review');
    const retry = await state();
    assert.deepEqual(retry.reviewedIds, ['p3']);
    assert.equal(retry.outcomes.p1, 'archived');
    assert.equal(retry.outcomes.p2, 'blocked');
    assert.equal(await page.evaluate(() => window.__qaConfirms), 1, 'a retomada não confirma sozinha');
    assert.equal(await panel.getByRole('button', { name: 'Confirmar arquivamento de 1 imóvel' }).count(), 1);
    await shot('05-retomada-revisao'); await noOverflow('retomada');

    // Rede: tudo mockado; nenhuma mutação IMOB; só a telemetria da página é escrita tolerada; nada para hosts EIAH.
    const imobMutations = Object.keys(requests).filter((key) => key.startsWith('DELETE ') || (!key.startsWith('GET ') && key.includes('/api/imob/')));
    assert.deepEqual(imobMutations, [], 'nenhuma mutação IMOB');
    assert.deepEqual(blocked, [], `requisições de escrita inesperadas: ${blocked.join(', ')}`);
    assert.deepEqual([...foreignHosts].filter((host) => FORBIDDEN_HOST.test(host)), [], 'nenhuma requisição a host da EIAH');
    assert.deepEqual(pageErrors, [], 'sem erros de página');
    results.push({
      width, height, status: 'pass', touchTargetsPx: touchTargets, screenshots,
      interceptedRequests: requests, blockedRequests: blocked, externalHosts: [...foreignHosts], pageErrors,
      checks: ['seleção/desmarcação com contador aria-live', 'busca preserva seleção e sinaliza ocultos', 'revisão sem escrita e sem confirmação', 'elegibilidade sem duplicação para leitores de tela', 'confirmação explícita', 'resultado parcial com bloqueado preservado', 'retomada só do pendente com nova confirmação', 'alvos de toque ≥44px no mobile', 'sem overflow horizontal'],
    });
    await page.close();
  }
  await writeFile(`${out}/browser-results.json`, JSON.stringify({ fixture: 'painel real + reducers reais, dados sintéticos, API 100% mockada, sem mutações IMOB', results }, null, 2) + '\n');
  console.log(`${results.length} viewports PASS (${results.map((r) => r.width).join(', ')})`);
} finally { await browser.close(); }
