# F1.0 — Front door mobile responsiveness baseline audit

## Data
2026-07-13

## Objetivo
Registrar a auditoria inicial de baseline da responsividade mobile do front door, no recorte autorizado por F0.59:

- front door mobile;
- responsividade;
- render-only;
- sem regra nova no `ChatAgentLauncher`;
- sem runtime novo;
- sem side effects externos.

## Escopo e isolamento
- Esta etapa foi estritamente documental/audit-only.
- Nenhum arquivo em `apps/**`, `packages/**`, `scripts/**`, workflows, runtime, engine, contratos, schema Prisma, migrations ou `ChatAgentLauncher` foi alterado.
- `release.yml` produtivo permaneceu intocado.

## CODEX.md e base normativa
- `CODEX.md` lido antes da execução: **sim**
- `AGENTS.md` relido para confirmar a regra `agent-driven`.
- `docs/architecture/agent-chat-runtime.md` relido para confirmar `ChatAgentLauncher` como camada `render-only`.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` relido como roadmap canônico vigente.

## Pré-condições confirmadas

### F0.59 está em `main`
Saída real:

```text
cb5a858 Merge pull request #261 from 5906375/f0-59-f0-to-f1-transition-readiness-decision
037b3e1 docs(ci): document F0 to F1 transition readiness decision
7ff3965 Merge pull request #260 from 5906375/f0-58-layer-b-controlled-validation-proposal-template
553db5b docs(ci): document layer b controlled validation proposal template
6c2489d Merge pull request #259 from 5906375/f0-57-layer-b-controlled-validation-pr-entry-criteria
9928685 docs(ci): document layer b controlled validation PR entry criteria
1f16c58 Merge pull request #258 from 5906375/f0-56-layer-b-controlled-validation-readiness-closure
6f62d78 docs(ci): document layer b controlled validation readiness closure
f1677fa Merge pull request #257 from 5906375/f0-55-layer-b-promotion-preconditions-decision-matrix
215e5cf docs(ci): document layer b promotion preconditions decision matrix
```

### F1 só está autorizada no recorte mobile/front door/render-only
Achados documentais:

- `ops/evidence/latest/f0-59-f0-to-f1-transition-readiness-decision-2026-07-13.md` registra `F1_CAN_START = true` apenas como `front_door_mobile_responsiveness_render_only`.
- `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md:61` define:

```text
| F1 - Mobile responsive | Garantir que cards, CTAs, proof e formularios degradam bem em telas pequenas | Criar snapshots/testes web de presentation em mobile; nenhum schema/runtime novo |
```

- `docs/architecture/agent-chat-runtime.md` preserva o `ChatAgentLauncher` como superfície de renderização.

## Arquivos lidos/inspecionados
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-59-f0-to-f1-transition-readiness-decision-2026-07-13.md`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`
- `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx`
- `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`
- `apps/web/src/features/imob/ThreadPanel.tsx`

## Baseline auditado

### 1. Composição atual do front door IMOB
O `apps/web/src/pages/app/imob/chat.tsx` compõe o front door com:

- `ImobWorkbenchShell`;
- `VerticalSelectorBar`;
- `ReactiveContextPanel`.

Trechos inspecionados:

```text
apps/web/src/pages/app/imob/chat.tsx:69:import { ImobWorkbenchShell } from "@/features/imob/ImobWorkbenchShell";
apps/web/src/pages/app/imob/chat.tsx:71:import { VerticalSelectorBar } from "@/features/workbench/vertical-chat/VerticalSelectorBar";
apps/web/src/pages/app/imob/chat.tsx:72:import { ReactiveContextPanel } from "@/features/workbench/vertical-chat/ReactiveContextPanel";
apps/web/src/pages/app/imob/chat.tsx:6127:      isContextPanelOpen={showWorkbenchContextPanel}
apps/web/src/pages/app/imob/chat.tsx:6128:      onToggleContextPanel={() => setShowWorkbenchContextPanel((prev) => !prev)}
```

Conclusão:

- o front door já centraliza a apresentação mobile/contextual no shell;
- não há evidência, nesta auditoria, de regra cognitiva nova empurrada para `ChatAgentLauncher`.

### 2. Baseline responsivo encontrado no shell
`apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` já contém:

- grid desktop/XL explícita;
- toggle mobile do painel contextual;
- ação de retorno;
- colapsamento do painel contextual fora de `xl`.

Trechos relevantes:

```text
lg:grid-cols-[208px,minmax(0,1fr)]
xl:grid-cols-[216px,minmax(760px,920px),272px]
2xl:grid-cols-[224px,minmax(820px,980px),280px]
```

```text
xl:hidden
{isContextPanelOpen ? "Ocultar" : "Mostrar"}
{isContextPanelOpen ? <div className="border-t border-white/10">{contextPanel}</div> : null}
```

Conclusão:

- existe baseline real de degradação mobile do painel contextual;
- a implementação atual é render-only e centrada no shell, não em regras de negócio.

### 3. Baseline de contexto visual atual
`apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx` usa rótulo neutro:

```text
Contexto IMOB
Resumo do intake
```

O badge atual é informativo e não comunica rollout/pilot operacional.

### 4. Baseline de teste já existente
`apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx` já cobre:

```text
renders the current shell grid, mobile toggle and back action when provided
```

Com asserts para:

```text
xl:grid-cols-[216px,minmax(760px,920px),272px]
lg:grid-cols-[208px,minmax(0,1fr)]
>Voltar<
Ocultar|Mostrar
```

Também há cobertura do contexto neutro:

```text
shows neutral IMOB context badge and panel header
```

Conclusão:

- o repositório já possui evidência parcial de responsividade render-only;
- o baseline existe, mas ainda não está consolidado como auditoria própria de F1.

### 5. Estado do roteamento contextual
`apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx` mantém fallback visual simples:

```text
Fallback sempre para IMOB — comportamento atual preservado.
```

Conclusão:

- o componente apenas roteia painel por vertical;
- não foi encontrada lógica cognitiva nova de front door mobile.

## Lacunas confirmadas
- Ainda não existe, antes desta F1.0, uma evidência dedicada e indexada só para baseline mobile do front door.
- A cobertura atual encontrada é estrutural/render-only, mas não constitui ainda correção visual nem bateria dedicada de snapshots mobile.
- O baseline mostra presença de shell responsivo e toggle contextual; não prova sozinho que todos os cards/formulários do front door já estejam ideais em telas pequenas.

## Decisão conservadora
- F1 pode prosseguir apenas no recorte já autorizado por F0.59.
- Esta auditoria **não** autoriza alteração de runtime, engine, contratos, `ChatAgentLauncher`, release, publish ou side effects externos.
- O estado correto desta etapa é `parcial/evidenciado`.

## Checks executados e saídas reais

### `pnpm check:evidence-index`
```json
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 180039,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 488
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

## Prova de isolamento
- Nenhum diff em `apps/**`
- Nenhum diff em `packages/**`
- Nenhum diff em `scripts/**`
- Nenhum diff em `.github/workflows/**`
- Nenhum diff em `release.yml`
- Nenhum diff em `ChatAgentLauncher`
- Nenhum side effect externo executado

## Riscos remanescentes
- O baseline atual comprova estrutura responsiva parcial, não otimização final para todos os estados mobile do front door.
- Há risco residual de overflow/densidade visual em cards específicos ainda não auditados por snapshot mobile dedicado.
- A próxima etapa de F1 deve permanecer estritamente render-only e focada em apresentação/testes visuais.

## Status
Status: parcial/evidenciado
