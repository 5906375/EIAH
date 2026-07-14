# F1.3 — Front Door Mobile Recurring Visual Gate Proposal

## Resumo
- Objetivo: avaliar se as evidências manuais F1.0-F1.2 do front door mobile IMOB devem evoluir para um gate recorrente/smoke visual reutilizável.
- Escopo: proposta documental sobre reaproveitamento de Playwright/smokes/evidências existentes, sem implementação de CI nesta etapa.
- Status: proposta

## Contexto F1.0-F1.2
- F1.0: estabeleceu o baseline documental de responsividade mobile/render-only do front door IMOB e confirmou o shell atual como composição visual sem lógica nova no `ChatAgentLauncher`.
- F1.1: reaproveitou estrutura histórica `phase-9-*` e leitura do código atual para validar `390px`, `768px` e `1024px`, mantendo `360px` como `blocked` por falta de prova direta atualizada.
- F1.2: fechou o gap específico de `360px` com captura direta em `360x740`, sem overflow horizontal, com composer visível, toggle contextual funcional e badge neutro `Contexto IMOB`.
- Gap remanescente: não há falha visual imediata comprovada; o ponto em aberto é recorrência/anti-regressão, hoje dependente de evidências manuais e reaproveitamento ad hoc.

## Arquivos lidos

### Normativos e contexto
- `CODEX.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`

### Evidências F1 reaproveitadas
- `ops/evidence/latest/f1-00-front-door-mobile-responsiveness-baseline-audit-2026-07-13.md`
- `ops/evidence/latest/f1-01-front-door-mobile-snapshots-render-only-2026-07-14.md`
- `ops/evidence/latest/f1-02-front-door-360px-direct-snapshot-render-only-2026-07-14.md`

### Código e estrutura inspecionados
- `scripts/smoke-9-3-2.mjs`
- `scripts/smoke-9-4-1.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/ops/evidence/latest/phase-9-1-1-visual-smoke`
- `docs/ops/evidence/latest/phase-9-3-1-responsive-hardening`
- `docs/ops/evidence/latest/phase-9-3-2-product-shell-alignment`
- `docs/ops/evidence/latest/phase-9-4-1-mobile-product-shell-density`
- `docs/ops/evidence/latest/phase-9-4-2-desktop-composition-chat-lane-width`
- `docs/ops/evidence/latest/phase-9-4-3-sidebar-history-scroll-containment`
- `docs/ops/evidence/latest/phase-9-5-vertical-selector-legal-specialist`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx`
- `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Inventário de estrutura existente

| Item | Existe? | Reaproveitável? | Observações |
|---|---:|---:|---|
| `scripts/smoke-9-3-2.mjs` | sim | parcial | Já usa Playwright e múltiplos viewports, mas contém asserts/copys antigos como `Piloto controlado` e classes de grid já superadas; não deve ser promovido direto para gate atual sem refino. |
| `scripts/smoke-9-4-1.mjs` | sim | parcial | Já percorre viewports mobile/tablet e gera evidência, mas ainda carrega semântica histórica do shell antigo e screenshot-first; útil como referência de fluxo, não como gate pronto. |
| Playwright local | sim | parcial | Há uso real e comprovado no ambiente local via scripts `smoke-9-*` e na captura ad hoc de F1.2, mas o caminho atual é acoplado ao ambiente local e não é base portátil suficiente sem pequena normalização futura. |
| Evidências `phase-9-*` | sim | sim | Há baseline versionado de shell mobile, densidade e scroll containment; serve como histórico de viewport/assertions mínimas e convenção de saída. |
| Teste render-only IMOB | sim | sim | `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx` já trava sinais estáveis do shell/grid/toggle/badge neutro e reduz risco de drift sem tocar runtime. |

Observação adicional de integração:

- `package.json` expõe hoje `check:imob-frontdoor-regression`.
- `.github/workflows/ci.yml` já executa esse gate.
- Esse gate atual valida regressão documental/render-only, mas não executa uma matriz recorrente de viewport mobile com asserts visuais/DOM equivalentes a F1.0-F1.2.

## Proposta de gate recorrente futuro

Proposta mínima para uma F1.4 dedicada, ainda sem executar nesta etapa:

- rota: `/app/imob/chat`
- viewports:
  - `360x740`
  - `390x844`
  - `768x1024`
  - `1024x768`
- assertions:
  - `document.scrollWidth <= document.clientWidth`
  - composer visível
  - selector sem overflow crítico
  - toggle contextual visível
  - toggle aberto sem overflow
  - badge `Contexto IMOB` presente
  - `hasPilotCopy=false`
- saída esperada:
  - JSON determinístico por viewport
  - screenshot opcional somente se um padrão futuro for explicitamente aprovado

Leitura prática:

- o gate deve privilegiar asserts de layout/semântica estável do DOM, não screenshot como prova primária;
- o estado aberto do toggle contextual deve ser medido explicitamente em mobile;
- o rótulo neutro `Contexto IMOB` deve permanecer como invariante até existir estado governado real de rollout.

## Decisão de valor

Escolha: **Recomendar F1.4 implementation.**

Justificativa:

- F1.0-F1.2 já fecharam o gap de baseline e de `360px`; o próximo risco real é regressão silenciosa de layout mobile.
- O repositório já possui material reaproveitável suficiente para uma implementação pequena: convenção `phase-9-*`, fluxo Playwright existente, viewports conhecidos e teste render-only focal.
- Não vale promover os scripts atuais diretamente porque eles ainda carregam acoplamentos históricos, copy antiga e dependência de ambiente local; isso reforça a necessidade de uma F1.4 pequena e isolada, não de CI imediato nesta F1.3.
- Manter apenas evidência manual aumenta o risco de drift visual entre mudanças futuras de shell/context panel e a cobertura efetiva do mobile front door.

## Riscos e mitigação
- Flakiness visual: preferir JSON determinístico e asserts DOM/layout antes de screenshot pixel-perfect.
- Custo de CI: manter eventual F1.4 primeiro como script/manual ou gate leve; promoção a CI só em PR separado.
- Dependência de ambiente local: remover na futura implementação o acoplamento ao path local observado nos `smoke-9-*`.
- Screenshots frágeis: deixá-los opcionais e auxiliares, não como critério único de verde.
- Falso positivo por DOM assertion incompleta: combinar `scrollWidth`, composer, selector, toggle aberto e badge neutro no mesmo ciclo.
- Drift se gate não entrar em CI: documentar desde já a recomendação de evolução futura, mas sem forçar CI antes de estabilizar o script.

## Escopo de F1.4, se recomendado
- Criar um script único e pequeno reaproveitando o Playwright já usado no repositório.
- Não introduzir dependência nova.
- Não tocar em `ChatAgentLauncher`.
- Não tocar em engine/runtime.
- Não gerar side effects externos.
- Produzir JSON determinístico por viewport e, no máximo, screenshots opcionais sob aprovação explícita.
- Conectar ao CI apenas em PR futuro separado, depois de provar estabilidade local.

## Prova de isolamento
- Sem alteração em `ChatAgentLauncher`.
- Sem alteração em engine.
- Sem alteração em runtime.
- Sem alteração em APIs/contracts.
- Sem alteração em apps/packages/scripts/workflows/package/lock.
- Sem side effects externos.

## Checks executados

### `pnpm check:evidence-index`
```json
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 183079,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 492
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

### `git diff -- .github/workflows package.json pnpm-lock.yaml apps packages scripts`
- sem saída

## Conclusão
- Status final: proposta
- Próxima ação recomendada: abrir uma F1.4 pequena para normalizar um smoke mobile recorrente baseado em JSON determinístico, reaproveitando Playwright existente sem CI obrigatório no primeiro passo.
- Não declara DONE amplo.
