# F1.4 — Front Door Mobile Recurring Smoke Minimal Implementation

## Resumo
- Objetivo: implementar um smoke recorrente mínimo e determinístico para o front door mobile IMOB, com saída JSON por viewport e sem screenshots.
- Escopo: criação de um único script local Playwright em `scripts/`, reaproveitando o padrão histórico de smokes `.mjs` sem tocar em runtime, engine, APIs, contracts, apps ou CI.
- Status: implementado localmente/evidenciado
- Não conectado ao CI nesta etapa.
- Não declara DONE amplo.

## Contexto
- F1.0: estabeleceu o baseline mobile/render-only do front door IMOB.
- F1.1: validou `390px`, `768px` e `1024px` por reaproveitamento documental, deixando `360px` como `blocked`.
- F1.2: fechou o gap de `360px` com captura real em `360x740`.
- F1.3: concluiu que havia valor real em um smoke recorrente pequeno, mas sem promover diretamente os `smoke-9-*` ao CI por drift histórico e acoplamento de ambiente.

## Decisão `.mjs` vs `.ts`
- Decisão: `.mjs`
- Justificativa: o padrão específico de smoke Playwright/browser do repositório continua sendo `.mjs`, enquanto o padrão `.ts` se concentra em checks de governança/documentação (`check*.ts`).
- Evidência de padrão:
  - `scripts/smoke-9-3-2.mjs`
  - `scripts/smoke-9-4-1.mjs`
  - `scripts/smoke-9-4-2.mjs`
  - `scripts/smoke-9-4-3.mjs`
  - `scripts/smoke-9-5.mjs`
- Por que `check*.ts` não foi usado como padrão dominante para este caso:
  - F1.4 não é um check documental/governança; é um smoke Playwright/browser de front door.
  - Não existe smoke Playwright atual em TypeScript no repositório.
  - Adotar `.ts` aqui não eliminaria o problema real de disponibilidade do Playwright fora do `package.json`.
- Por que `.tsx` não se aplica:
  - o script não usa JSX nem precisa carregar componentes React.

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-00-front-door-mobile-responsiveness-baseline-audit-2026-07-13.md`
- `ops/evidence/latest/f1-01-front-door-mobile-snapshots-render-only-2026-07-14.md`
- `ops/evidence/latest/f1-02-front-door-360px-direct-snapshot-render-only-2026-07-14.md`
- `ops/evidence/latest/f1-03-front-door-mobile-recurring-visual-gate-proposal-2026-07-14.md`
- `package.json`
- `.github/workflows/ci.yml`
- `scripts/smoke-9-3-2.mjs`
- `scripts/smoke-9-4-1.mjs`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx`
- `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Implementação
- Script criado: `scripts/smoke-f1-4-front-door-mobile.mjs`
- Comando manual:
  - `node scripts/smoke-f1-4-front-door-mobile.mjs`
  - opcional com base URL explícita: `F1_FRONT_DOOR_BASE_URL=http://127.0.0.1:5173 node scripts/smoke-f1-4-front-door-mobile.mjs`
- URL base:
  - default: `http://127.0.0.1:5173`
  - override: `F1_FRONT_DOOR_BASE_URL`
- Rota:
  - default: `/app/imob/chat`
  - override opcional: `F1_FRONT_DOOR_ROUTE`
- Viewports:
  - `360x740`
  - `390x844`
  - `768x1024`
  - `1024x768`
- Assertions:
  - `document.scrollWidth <= document.clientWidth`
  - composer/textarea visível
  - vertical selector presente
  - vertical selector sem overflow crítico
  - conteúdo principal presente
  - badge `Contexto IMOB` presente
  - `PILOTO CONTROLADO` ausente
  - toggle `Resumo do intake` visível
  - estado aberto do toggle sem overflow horizontal
- Exit code esperado:
  - `0` se todos os viewports passarem
  - `1` se qualquer viewport falhar ou se Playwright não estiver disponível

Observações de robustez:
- o script fecha o browser em `finally`;
- emite JSON mesmo em falha;
- tenta `import("playwright")` primeiro;
- se o pacote não estiver no grafo do repo, faz fallback mínimo para o cache local `~/.npm/_npx`, evitando hardcode absoluto de `/home/jusall/.npm/_npx/...`;
- não escreve arquivos por padrão e não depende de screenshots.

## Saída do smoke

Saída real da execução bem-sucedida:

```json
{
  "ok": true,
  "check": "f1-4-front-door-mobile-smoke",
  "baseUrl": "http://127.0.0.1:5173",
  "route": "/app/imob/chat",
  "viewports": [
    {
      "name": "mobile-360",
      "width": 360,
      "height": 740,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 360,
      "scrollWidth": 360,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    },
    {
      "name": "mobile-390",
      "width": 390,
      "height": 844,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 390,
      "scrollWidth": 390,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    },
    {
      "name": "tablet-768",
      "width": 768,
      "height": 1024,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 768,
      "scrollWidth": 768,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    },
    {
      "name": "tablet-1024",
      "width": 1024,
      "height": 768,
      "pageUrl": "http://127.0.0.1:5173/app/imob/chat",
      "clientWidth": 1024,
      "scrollWidth": 1024,
      "horizontalOverflow": false,
      "composerVisible": true,
      "selectorPresent": true,
      "selectorOverflow": false,
      "toggleVisible": true,
      "toggleOpenOk": true,
      "hasContextBadge": true,
      "hasPilotCopy": false,
      "hasMainContent": true,
      "ok": true,
      "reasons": []
    }
  ]
}
```

## Decisão de CI
- CI não alterado.
- Workflow não alterado.
- Package scripts não alterados.
- Promoção para CI deve ser F1.5 ou PR separado após estabilidade local.

## Prova de isolamento
- Sem alteração em `ChatAgentLauncher`.
- Sem alteração em engine.
- Sem alteração em runtime.
- Sem alteração em APIs/contracts.
- Sem alteração em `apps/**`.
- Sem alteração em `packages/**`.
- Sem alteração em workflows.
- Sem alteração em `package.json`/`pnpm-lock.yaml`.
- Sem dependência nova.
- Sem side effects externos.

## Checks executados

### Novo smoke
Comando:

```bash
node scripts/smoke-f1-4-front-door-mobile.mjs
```

Observação:
- a primeira tentativa no sandbox falhou ao lançar o Chromium headless;
- a execução real evidenciada foi repetida fora do sandbox do host para permitir o launch do browser contra `127.0.0.1:5173`.

Resultado real: `ok: true`, `exit 0`.

### `pnpm check:evidence-index`
```json
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 183889,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 494
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

### `git diff --check`
- sem saída

### `git diff -- .github/workflows package.json pnpm-lock.yaml apps packages`
- sem saída

### `git diff -- scripts`
- sem saída nesta etapa, porque `git diff` não lista arquivo novo ainda não rastreado.
- prova complementar real do escopo em `scripts/`:

```text
git status --short
 M docs/EVIDENCE_INDEX.md
?? ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md
?? scripts/smoke-f1-4-front-door-mobile.mjs
```

```text
git ls-files --others --exclude-standard scripts ops/evidence/latest docs/EVIDENCE_INDEX.md
ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md
scripts/smoke-f1-4-front-door-mobile.mjs
```

## Riscos remanescentes
- Gate ainda não está no CI.
- Pode haver flakiness se o ambiente local não estiver pronto.
- Playwright precisa estar disponível; sem dependência formal no repo, o fallback para cache local continua sendo uma limitação controlada.
- Sem screenshot asset, por decisão de prova determinística inicial.
- O smoke é anti-regressão local inicial, não DONE amplo.

## Conclusão
- Status final: implementado localmente/evidenciado
- Próxima ação recomendada: estabilizar algumas execuções locais adicionais e só então decidir uma F1.5 dedicada para promoção opcional ao CI.
- Não declara DONE amplo.
