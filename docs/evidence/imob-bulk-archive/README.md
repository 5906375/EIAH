# Arquivamento múltiplo de imóveis (Front Door IMOB) — 2026-11-11

Seleção explícita de vários imóveis, revisão do lote exato sem escrita, confirmação humana, execução sequencial e resultado por imóvel. Cada arquivamento reaproveita `DELETE /imob/properties/:id` (bloqueio por caso/locação, tenant/workspace e auditoria do servidor), sem endpoint novo e sem migration. Não há atomicidade nem rollback: o que já foi arquivado permanece arquivado. Arquivar imóvel não arquiva nem altera proprietário.

Execuções reais (códigos de saída e corroboração em `exit-codes.txt`):
- Suíte focal web: 241 testes, 241 aprovados (`unit-tests.log`), incluindo os 17 testes de integração novos do fluxo (prévia sem escrita, 3 arquivamentos, 1 sucesso + 2 bloqueios, falha parcial e retomada só dos pendentes, duplo clique, 403, 404, troca de workspace/sessão antes e durante a execução, interrupção, mensagem restaurada, falha ao carregar a lista) e os do cadastro múltiplo já existentes. Depois do ajuste de pluralização do botão, `propertyBulkArchive.test.ts` foi reexecutado: 24 aprovados (`unit-tests-panel-after-plural-fix.log`); a suíte focal completa não foi reexecutada depois desse ajuste.
- API: `imob-crm-mutation-service.test.ts` com 3 testes novos de `archiveProperty` (só o imóvel pedido, bloqueio por caso/locação sem rastro de escrita, isolamento tenant/workspace e idempotência): 25 aprovados (`api-tests.log`).
- Build `apps/web`: exit 0 (`build.log`).
- `tsc --noEmit`: exit 2, com 64 diagnósticos (`typecheck.log`). **Não foi medida uma linha de base na `main` limpa; portanto a preexistência desses diagnósticos não está comprovada.** O que está comprovado: o conjunto de diagnósticos (sem número de linha) é idêntico entre a medição feita antes dos testes e a final; nenhum está em arquivo criado por esta entrega nem cita símbolo adicionado por ela; os 11 de `chat.tsx` (`proof`, `dedupeKey`, `sc`) ficam longe da única linha alterada nesse arquivo (a prop `onBulkArchive`).
- Gates: `check:orphan-tests` (blockingOrphanCount 0), `check:chat-launcher-render-only` (sem violações) e `check:front-door-single-surface` (`ok: true`, porém `conformant: false`, baseline legado do gate); os três rodaram antes dos dois últimos ajustes (CSS escopado e pluralização), que não tocam launcher, testes registrados nem rotas.
- Teste visual permanente `scripts/qa/property-bulk-archive.mjs` (Chromium; 320×700, 390×844, 1024×768 e 1440×900), resultados em `browser-results.json`:
  - painel real e reducers reais com fixtures sintéticas: seleção/desmarcação com contador `aria-live`, busca preservando a seleção e sinalizando o que ficou fora do filtro, revisão sem escrita, confirmação explícita, resultado parcial com imóvel bloqueado preservado e retomada só do pendente;
  - alvos de toque no mobile (≤639 px): botões e busca com 44 px, label clicável do checkbox com 59,2 px, sem overflow horizontal, sem texto só-leitor repetindo texto visível, todo checkbox com nome acessível;
  - desktop (≥640 px): botões com 30,8 px e busca com 32,4 px, como nos demais formulários IMOB (a regra de 44 px é só mobile).

Rede do teste visual: toda rota `/api/**` é atendida por mock local; a única escrita tolerada é `POST /api/helpdesk/telemetry` (telemetria da própria página, mockada); mutações em `/api/imob/*` reprovam o teste (0 ocorrências nas quatro viewports). Como o `route` cobre só `/api/**`, a página carregou fontes de `fonts.googleapis.com` e `fonts.gstatic.com`; nenhum host da EIAH foi acessado.

Fixtures: imóveis, proprietários, sessão e API sintéticos; o resultado "1 arquivado · 1 bloqueado · 1 com falha" é simulado pelos reducers no navegador. Capturas: `01-busca-com-selecao-oculta`, `02-selecao-3`, `03-revisao` (inclui o botão de confirmação HITL), `04-resultado-parcial` e `05-retomada-revisao`, cada uma em 320, 390, 1024 e 1440 px. Em `05-retomada-revisao` a linha "verificando…" é limitação da fixture: o runtime real consulta a elegibilidade, que o teste visual não monta.

Não comprova backend real, CI, staging nem produção. Nenhum arquivamento real foi executado. Status parcial.

Reprodução: Vite em apps/web com `VITE_API_URL=http://localhost:5180/api` e `--port 5180`; `node scripts/qa/property-bulk-archive.mjs` com Chromium instalado para Playwright (`QA_BASE_URL` e `QA_OUT` opcionais).
