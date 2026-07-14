# F1.2 — Front Door 360px Direct Snapshot / Render-only Gap Closure

## Resumo
- Objetivo: gerar prova direta e atualizada do comportamento do front door IMOB em `360px`, fechando o gap deixado por F1.1.
- Escopo: captura real em browser headless do front door IMOB em viewport `360×740`, sem alterar runtime, engine, contratos, APIs, side effects ou `ChatAgentLauncher`.
- Status: evidenciado para `360px`
- Não declara fechamento operacional amplo.

## Contexto
- F1.0: estabeleceu o baseline documental da responsividade mobile do front door como `parcial/evidenciado`.
- F1.1: validou documentalmente `390px`, `768px` e `1024px`, mas deixou `360px` como `blocked` por falta de prova direta atualizada.
- Gap remanescente: `360px` estava `blocked`.

## Arquivos lidos

### Normativos
- `CODEX.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-00-front-door-mobile-responsiveness-baseline-audit-2026-07-13.md`
- `ops/evidence/latest/f1-01-front-door-mobile-snapshots-render-only-2026-07-14.md`

### Código inspecionado
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx`
- `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

### Estrutura operacional inspecionada
- `docker-compose.dev.yml`
- `scripts/smoke-9-3-2.mjs`
- `scripts/smoke-9-4-1.mjs`
- `docs/ops/evidence/latest/phase-9-3-1-responsive-hardening/phase-9-3-1-responsive-hardening.md`
- `docs/ops/evidence/latest/phase-9-4-1-mobile-product-shell-density/phase-9-4-1-mobile-product-shell-density.md`
- `docs/ops/evidence/latest/phase-9-4-2-desktop-composition-chat-lane-width/phase-9-4-2-desktop-composition-chat-lane-width.md`
- `docs/ops/evidence/latest/phase-9-4-3-sidebar-history-scroll-containment/phase-9-4-3-sidebar-history-scroll-containment.md`

## Estrutura existente reaproveitada

Estrutura reaproveitada:

- convenção de smoke/captura em Playwright já existente nos scripts `smoke-9-*`;
- convenção de provas visuais históricas em `docs/ops/evidence/latest/phase-9-*`;
- mesma rota/local tokenização usada nas evidências anteriores do IMOB front door;
- teste render-only focal já existente em `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`.

Declaração explícita:

- nenhum script novo foi criado;
- nenhuma dependência nova foi criada;
- nenhuma infraestrutura nova de screenshot foi criada.

## Ambiente
- Branch: `main`
- Commit: `4134394`
- Data: `2026-07-14`
- Browser: Chromium headless via Playwright
- Viewport: `360×740`
- Device scale factor: `1`
- URL/rota: `http://127.0.0.1:5173/app/imob/chat`
- Comando usado ou método de captura:
  - subida local do ambiente existente via `docker compose -f docker-compose.dev.yml up -d api web`;
  - captura direta ad hoc com `node --input-type=module -e ...` reaproveitando o Playwright já presente no ambiente local;
  - segunda captura ad hoc para validar o estado aberto do toggle contextual mobile.

## Prova direta 360px

| Item | Resultado | Observações |
|---|---|---|
| Viewport 360px executado | pass | Captura real concluída em `360×740`, `deviceScaleFactor=1`, URL final `http://127.0.0.1:5173/app/imob/chat`. |
| Sem overflow horizontal crítico | pass | `clientWidth=360`, `scrollWidth=360`, `horizontalOverflow=false` tanto no estado fechado quanto no aberto do painel contextual. |
| Conteúdo principal visível | pass | O estado capturado continha conteúdo principal do front door (`hasMainContent=true`) e composer visível dentro do viewport. |
| Cards principais | pass | O estado inicial capturado não expôs card de erro/quebra; o front door manteve conteúdo principal navegável e o painel contextual pôde ser aberto sem overflow. |
| Formulários visíveis, se houver | pass | `textarea.top=650`, `textarea.bottom=690`, `visible=true`; botão `Enviar` presente na lista de botões visíveis. |
| VerticalSelectorBar | pass | Seletor presente, `wrapped='wrap'`, `selector.width=56`, sem overflow crítico associado. |
| ReactiveContextPanel/toggle mobile | pass | Botão `Resumo do intake` visível no estado fechado; após clique, o estado aberto mostrou `toggleOpenLabel=true`, conteúdo contextual visível e `horizontalOverflow=false`. |
| Badge Contexto IMOB | pass | `hasContextBadge=true`; o código atual também confirma o rótulo neutro `Contexto IMOB`. |
| Sem copy rollout/pilot indevida | pass | `hasPilotCopy=false` no estado fechado e no aberto. |

## Evidência visual
- Caminho do screenshot/asset versionado: **nenhum criado**
- Método usado:
  - captura direta determinística via browser headless;
  - auditoria registrada por JSON bruto de medição do DOM/viewport;
  - sem criar nova árvore de assets, porque a tarefa pedia o menor caminho reaproveitável possível.

Saída real da captura principal:

```json
{
  "url": "http://127.0.0.1:5173/app/imob/chat",
  "viewport": {
    "width": 360,
    "height": 740
  },
  "deviceScaleFactor": 1,
  "document": {
    "clientWidth": 360,
    "scrollWidth": 360,
    "clientHeight": 740,
    "scrollHeight": 740
  },
  "horizontalOverflow": false,
  "textarea": {
    "top": 650,
    "bottom": 690,
    "left": 60,
    "right": 257,
    "width": 198,
    "visible": true
  },
  "selector": {
    "top": 46,
    "right": 67,
    "width": 56,
    "wrapped": "wrap"
  },
  "toggle": {
    "top": 709,
    "bottom": 737,
    "visible": true
  },
  "hasContextBadge": true,
  "contextBadgeCount": 21,
  "hasPilotCopy": false,
  "hasShell": false,
  "hasMainContent": true,
  "buttons": [
    "←Voltar",
    "Threads ativas0",
    "+ Nova conversa",
    "Ver operações",
    "Conversas recentes0",
    "IMOB",
    "Captar imóvel",
    "Gerar proposta",
    "Iniciar contrato",
    "+",
    "Enviar",
    "Resumo do intakeMostrar"
  ]
}
```

Saída real da validação do estado aberto do painel contextual:

```json
{
  "horizontalOverflow": false,
  "scrollWidth": 360,
  "clientWidth": 360,
  "bodyHasContextPanelContent": true,
  "toggleOpenLabel": true,
  "hasPilotCopy": false
}
```

## Alterações realizadas
- Nenhuma alteração de código; evidência documental/render-only apenas.
- Nenhuma alteração de comportamento.

## Prova de isolamento

Confirmações:

- Sem alterações em `ChatAgentLauncher`.
- Sem alterações em engine.
- Sem alterações em APIs.
- Sem alterações em contracts.
- Sem alterações em packages.
- Sem alterações em scripts/workflows.
- Sem alterações em `package.json` ou `pnpm-lock.yaml`.
- Sem billing/entitlement/ledger/receipts/approvals.
- Sem side effects externos.

Observação:

- houve apenas uso local do `docker compose` já existente para subir `api` e `web` e permitir a captura real da rota; isso não alterou arquivos do repositório nem executou side effects externos.

## Checks executados

### Captura direta 360px
- `curl -I --max-time 5 http://127.0.0.1:5173/app/imob/chat`
  - inicialmente falhou com `EXIT:7` antes da subida do ambiente;
  - após `docker compose -f docker-compose.dev.yml up -d api web`, a rota ficou disponível para captura Playwright real.

### Playwright launch check
```text
PLAYWRIGHT_LAUNCH_OK
```

### `pnpm check:evidence-index`
```json
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 180758,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 489
}
```

### `pnpm check:w4-non-regression`
```json
{
  "ok": true,
  "check": "check:w4-non-regression",
  "gates": {
    "hardMetricsGo": true,
    "nonRegressionGo": true,
    "reasons": []
  },
  "metrics": {
    "moduleActivationSuccessRatePct": 100,
    "moduleActivationP95Seconds": 8,
    "timeToFirstRunP95Minutes": 14,
    "receiptCoveragePct": 100,
    "crossTenantAuthFailures": 0,
    "duplicateSideEffects": 0
  }
}
```

### `pnpm check:docs-link-integrity`
```json
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

### `git diff --check`
- sem saída

### `git diff -- .github/workflows package.json pnpm-lock.yaml packages scripts`
- sem saída

### `git diff -- apps`
- sem saída

## Riscos remanescentes
- O gap de prova direta de `360px` ficou fechado nesta etapa.
- Isso não equivale a gate recorrente automatizado de snapshot.
- Ainda não existe, nesta F1.2, um artefato screenshot versionado específico de `360px`; a prova ficou baseada em captura direta determinística e medições do DOM.
- Se o projeto exigir prova visual contínua por asset versionado ou automação recorrente dedicada de `360px`, isso deve ir para uma frente futura separada, não para esta tarefa.

## Conclusão
- Status final: evidenciado para `360px`
- Pode substituir o `blocked` da F1.1 para `360px`: **sim**
- Não declara DONE amplo sem gate recorrente/evidência suficiente.
