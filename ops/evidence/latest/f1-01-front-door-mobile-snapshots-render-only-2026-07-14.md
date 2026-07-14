# F1.1 — Front Door Mobile Snapshots / Render-only Validation

## Resumo
- Objetivo: registrar evidência visual/documental do comportamento mobile do front door IMOB por breakpoint, em escopo estritamente render-only.
- Escopo: auditoria documental com reaproveitamento de estrutura existente de smoke Playwright, evidências históricas já versionadas e testes render-only atuais.
- Status: parcial/evidenciado

## Arquivos lidos

### Normativos
- `CODEX.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-00-front-door-mobile-responsiveness-baseline-audit-2026-07-13.md`

### Código inspecionado
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx`
- `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx` (localização/confirmação apenas, sem alteração)

### Evidências e estrutura histórica reaproveitada
- `docs/ops/evidence/latest/phase-9-3-1-responsive-hardening/phase-9-3-1-responsive-hardening.md`
- `docs/ops/evidence/latest/phase-9-4-1-mobile-product-shell-density/phase-9-4-1-mobile-product-shell-density.md`
- `docs/ops/evidence/latest/phase-9-4-2-desktop-composition-chat-lane-width/phase-9-4-2-desktop-composition-chat-lane-width.md`
- `docs/ops/evidence/latest/phase-9-4-3-sidebar-history-scroll-containment/phase-9-4-3-sidebar-history-scroll-containment.md`
- `scripts/smoke-9-3-2.mjs`
- `scripts/smoke-9-4-1.mjs`

## Estrutura existente reaproveitada

O repositório já possui caminho consolidado para evidência visual/mobile do front door IMOB:

- scripts Playwright versionados em `scripts/smoke-9-*.mjs`;
- screenshots e JSONs em `docs/ops/evidence/latest/phase-9-*`;
- teste SSR/render-only focal em `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`.

Reuso aplicado nesta F1.1:

- a convenção de viewport e captura histórica da Fase 9 foi tratada como baseline reaproveitável;
- a semântica visual atual foi revalidada no código e no teste render-only atual;
- nenhum script, workflow, dependência, config ou pasta nova foi criada.

## Ambiente
- Branch: `main`
- Commit: `943af72`
- Data: `2026-07-14`
- Browser/viewport ou método de inspeção:
  - inspeção estática de código;
  - releitura de evidências Playwright históricas já versionadas;
  - teste SSR/render-only atual.
- URL/rota: `/app/imob/chat`
- Comandos usados:
  - `git status --short`
  - `git branch --show-current && git rev-parse --short HEAD`
  - `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Observação sobre a prova visual reaproveitada

As evidências históricas de `phase-9-3.1`, `phase-9-4.1`, `phase-9-4.2` e `phase-9-4.3` continuam úteis para provar:

- presença de viewport auditado;
- ausência de quebra estrutural severa do layout;
- visibilidade do composer/textarea;
- colapso da sidebar/painel contextual em mobile;
- contenção do shell e da lista de histórico.

Porém, elas não podem ser tratadas como prova semântica integral do estado atual porque:

- parte delas ainda menciona o rótulo antigo `PILOTO CONTROLADO`;
- parte delas reflete grids anteriores (`280px/.../360px`) já substituídos pelo shell atual;
- F1.1 revalida o estado atual do badge/contexto no código e no teste SSR.

## Breakpoints auditados

| Breakpoint | Resultado | Observações |
|---|---|---|
| 360px | blocked | Não há snapshot/versionamento reaproveitável específico em `360px` no ciclo atual; existe baseline próxima em `375×667`, mas F1.1 não extrapola isso como prova completa de `360px`. |
| 390px | pass | Evidência histórica reaproveitável em `390×844` (`phase-9-3-1`, `phase-9-4-2`, `phase-9-4-3`) mostra textarea visível, sidebar colapsada e mobile preservado. Estado semântico atual do badge foi revalidado no código atual como neutro `Contexto IMOB`. |
| 768px | pass | Evidência histórica reaproveitável em `768×1024` (`phase-9-3-1`, `phase-9-3-2`, `phase-9-4-1`) mostra correção do empilhamento e visibilidade do composer. O shell atual mantém `xl:hidden` para o painel contextual mobile e grid `lg:grid-cols-[208px,minmax(0,1fr)]` a partir de larguras maiores. |
| 1024px | pass | Evidência histórica reaproveitável em `1024×768` (`phase-9-3-1`) mostra breakpoint `lg` funcionando sem esmagar o chat. O código atual mantém o shell responsivo e o teste SSR continua travando a presença do grid `lg`/`xl`. |

## Componentes verificados

| Componente | Resultado | Observações |
|---|---|---|
| ImobWorkbenchShell | pass | Continua sendo wrapper de copy/layout sobre `VerticalWorkbenchShell`, sem lógica cognitiva. Mantém `backLabel: "Voltar"`, `statusLabel: "Contexto IMOB"` e `panelToggleLabel: "Resumo do intake"`. |
| VerticalSelectorBar | pass | Continua render-only, com `flex flex-wrap` e pills por vertical. Não comunica rollout/pilot. |
| ReactiveContextPanel | pass | Continua wrapper simples: roteia `legal` ou cai em `ImobWorkbenchContextPanel`; comentário explícito de fallback IMOB preservado. |
| VerticalWorkbenchShell | pass | Mantém estrutura responsiva central: grid desktop/XL, painel contextual `xl:hidden` com toggle `Ocultar/Mostrar` em mobile. |
| Cards principais | minor | O código atual mostra header, access gate, banner de rascunho, painel contextual e cards de estado (`loading/error/empty/ready`). A cobertura visual atual é suficiente para baseline parcial, mas não fecha ainda todos os estados de card com snapshot atualizado por breakpoint. |
| Formulários visíveis | minor | O composer atual (`textarea`, botão `Enviar`, menu de anexo) existe e o teste/evidências históricas provam visibilidade do textarea em viewports-chave. Ainda não há snapshot atualizado desta F1.1 para todos os formulários/variantes em `360px`. |
| Badge Contexto IMOB | pass | O estado atual no código é neutro: `Contexto IMOB` no header e no painel. Não há `PILOTO CONTROLADO` no front door inspecionado. |

## Prova de isolamento

Confirmação explícita:

- Sem alterações em `ChatAgentLauncher`.
- Sem alterações em engine.
- Sem alterações em APIs.
- Sem alterações em contracts.
- Sem alterações em scripts/workflows.
- Sem alterações em `package.json` ou `pnpm-lock.yaml`.
- Sem side effects.

Também foi confirmado:

- `git diff -- .github/workflows package.json pnpm-lock.yaml apps packages scripts` deve permanecer sem saída nesta tarefa;
- a localização de `ChatAgentLauncher` permanece em `apps/web/src/components/agents/ChatAgentLauncher.tsx`, mas ele não participa do layout específico auditado em `/app/imob/chat`.

## Achados

### pass
- O shell atual continua render-only e responsivo por composição (`chat.tsx` -> `ImobWorkbenchShell` -> `VerticalWorkbenchShell`).
- O painel contextual mobile continua controlado por toggle visual (`Ocultar/Mostrar`) e não por lógica cognitiva.
- O badge/contexto atual foi revalidado como neutro `Contexto IMOB`.
- O teste SSR focal passou no estado atual do repositório.

### minor
- Há boa cobertura histórica reaproveitável para `390px`, `768px` e `1024px`, mas ela é heterogênea e parte dela antecede o drift visual corrigido do badge.
- Os cards principais e formulários estão presentes e parcialmente cobertos, mas F1.1 não gera novo snapshot automatizado próprio por breakpoint.

### needs-fix
- Nenhum `needs-fix` estrutural novo foi comprovado nesta auditoria documental.

### blocked
- `360px` não tem evidência direta reaproveitável e atualizada nesta rodada. O estado correto é `blocked` para prova específica deste breakpoint, não falha confirmada de layout.

## Limites

- Esta evidência não fecha visual completo do front door mobile.
- Esta evidência não cria gate recorrente novo de snapshot.
- Esta evidência não substitui um ciclo futuro com snapshots/Playwright atualizados especificamente após o drift visual do badge.
- Se forem necessárias correções visuais, elas devem entrar em `F1.2` render-only separada.

## Checks

### Teste render-only focal

```text
TAP version 13
# Subtest: apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
ok 1 - apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
1..1
# tests 1
# pass 1
# fail 0
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
- Deve permanecer sem saída após o diff documental desta F1.1.

### `git diff -- .github/workflows package.json pnpm-lock.yaml apps packages scripts`
- Resultado esperado: sem saída.

## Conclusão

F1.1 fica **parcial/evidenciado**:

- existe estrutura real e reaproveitável de snapshots/smoke Playwright para o front door IMOB;
- o estado atual do código preserva a arquitetura render-only e o badge neutro `Contexto IMOB`;
- `390px`, `768px` e `1024px` têm baseline documental suficiente para leitura conservadora de `pass`;
- `360px` permanece sem prova direta atualizada nesta rodada, portanto `blocked`;
- não houve alteração em runtime, engine, `ChatAgentLauncher`, apps, packages, scripts, workflows, `package.json` ou `pnpm-lock.yaml`.
