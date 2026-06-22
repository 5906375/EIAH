# IMOB Chat Workbench — Fase 9.4.3 Sidebar History Scroll Containment

Data: 2026-06-19  
Status: EVIDENCIADO  
Escopo: contenção vertical do histórico de conversas da sidebar esquerda do IMOB Workbench, preservando Product Shell 9.4, densidade mobile 9.4.1 e chat lane 9.4.2.

## Causa da altura excessiva encontrada

O problema não estava só no `overflow-y-auto` da lista. A causa real foi uma combinação de dois pontos:

- o frame imersivo da rota `/app/imob/chat` ainda não estava fechado em uma altura de viewport; o wrapper superior podia crescer com o conteúdo;
- na lateral esquerda, o slot da sidebar e a seção do histórico precisavam de containment explícito (`min-h-0`, `overflow-hidden`, blocos `shrink-0`) para impedir que a lista longa empurrasse o grid inteiro.

Na prática, quando o histórico crescia, a altura acabava subindo até o shell inteiro em vez de ficar isolada no scroller da lista.

## Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/App.tsx` | A rota IMOB passou a usar frame imersivo com `h-screen min-h-screen overflow-hidden` e `main` com `min-h-0 overflow-hidden`, fixando a altura útil ao viewport. |
| `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx` | `aside` esquerdo e `main` ganharam `min-h-0`, permitindo shrink correto dentro do grid. |
| `apps/web/src/pages/app/imob/chat.tsx` | Sidebar IMOB com containment explícito: wrapper `overflow-hidden`, blocos superiores `shrink-0`, seção do histórico com `overflow-hidden` e scroller `flex-1 min-h-0 overflow-y-auto`. |
| `scripts/smoke-9-4-3.mjs` | Smoke Playwright da fase 9.4.3, com stress visual sanitizado do histórico longo e screenshots em 6 resoluções. |
| `docs/ops/evidence/latest/phase-9-4-3-sidebar-history-scroll-containment/phase-9-4-3-sidebar-history-scroll-containment.md` | Evidência desta fase. |
| `docs/EVIDENCE_INDEX.md` | Índice atualizado para a evidência criada. |

## Ajustes aplicados

- `App.tsx`
  - wrapper IMOB: `relative z-10 flex h-screen min-h-screen flex-col overflow-hidden`
  - `main` IMOB: `flex w-full min-h-0 flex-1 flex-col overflow-hidden p-0`
- `VerticalWorkbenchShell.tsx`
  - `aside` esquerdo: `min-h-0`
  - slot principal: `min-h-0`
- `chat.tsx`
  - sidebar root:
    - `min-w-0`
    - `overflow-hidden`
  - bloco `IMOB Workspace`: `shrink-0`
  - bloco de ações/busca/operações: `shrink-0`
  - seção `Conversas recentes`:
    - container: `flex min-h-0 flex-1 flex-col overflow-hidden`
    - scroller: `flex-1 min-h-0 overflow-y-auto`

## Handlers e props preservados

Sem alteração de lógica nos pontos exigidos:

- `handleNewConversation`
- `setShowThreadPanel`
- `conversationSearch` / `setConversationSearch`
- `loadConversation`
- `ThreadPanel`
- `onSelectThread`
- `onClearSelection`
- `resolveDashboardHref`
- `resolveRunHref`
- `resolveReconciliationHref`
- `filteredConversations`
- `activeThreadCount`
- `shouldShowThreadPanel`

Nenhuma regra foi movida para `ChatAgentLauncher`.

## Validação de runtime

### Browser smoke real com stress visual

```bash
node scripts/smoke-9-4-3.mjs
```

Resultado: **32/32 checks OK**

O smoke usou runtime local-docker real em `http://127.0.0.1:5173/app/imob/chat` e, no desktop, injetou cards sanitizados extras no DOM da lista apenas para stress visual do histórico, sem alterar dados ou handlers da aplicação.

### Métricas principais

- `1440×900`
  - `shell = 602 / 602`
  - `sidebar = 602 / 602`
  - `listScroller = 181 / 1766`
  - `textareaY = 497`
- `1600×900`
  - `shell = 602 / 602`
  - `listScroller = 181 / 1766`
- `1920×1080`
  - `shell = 782 / 782`
  - `listScroller = 361 / 1766`
- `2048×1152`
  - `shell = 854 / 854`
  - `listScroller = 433 / 1766`
- `390×844`
  - `visibleAsides = 0`
  - `textareaY = 673`
- `375×667`
  - `visibleAsides = 0`
  - `textareaY = 512`

Leitura:

- o shell não cresce mais junto com o histórico;
- a lista de conversas passa a rolar internamente;
- o composer permanece visível;
- o painel direito continua alinhado;
- o smoke rodou com `devicePixelRatio = 1`, equivalente a zoom 100% no headless usado para a evidência.

## Screenshots por resolução

Arquivos em `docs/ops/evidence/latest/phase-9-4-3-sidebar-history-scroll-containment/`:

- `after-1440x900.png`
- `after-1600x900.png`
- `after-1920x1080.png`
- `after-2048x1152.png`
- `after-390x844.png`
- `after-375x667.png`
- `smoke-results-9-4-3.json`

## Testes focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: **5/5 arquivos pass**, exit `0`

## Grep anti-hardcode

Comando bruto exigido:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Leitura:

- o comando bruto continua retornando apenas fixtures e ids artificiais de arquivos de teste;
- nenhuma ocorrência relevante nos arquivos de produção alterados desta fase.

Verificação focada:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchShell.tsx \
  apps/web/src/features/workbench/VerticalWorkbenchShell.tsx \
  apps/web/src/features/workbench/WorkbenchPanelCard.tsx
```

Resultado: **0 ocorrências**

## Gate documental

```bash
pnpm check:evidence-index
```

Resultado: `ok: true`

## Invariantes preservadas

- Product Shell 9.4 preservado
- mobile density 9.4.1 preservada
- chat lane 9.4.2 preservado
- sidebar visual 9.3.3 preservada
- backend não alterado
- auth/entitlement não alterados
- worker não alterado
- storage/draft/retention/observability não alterados
- `VerticalWorkbenchShell` preservado
- `WorkbenchPanelCard` preservado
- `ChatAgentLauncher` intocado
- nenhuma rota nova
- nenhum dado do mock hardcoded
- nenhum `stage/status/journeyType` novo
- status operacional permanece **PILOTO CONTROLADO**
- object storage real permanece **NO-GO**
- multi-instância permanece **NO-GO**

## Conclusão

A Fase 9.4.3 ficou evidenciada. O histórico longo da sidebar esquerda deixa de esticar o IMOB Workbench: o shell permanece contido ao viewport, a lista de conversas rola internamente, o chat central não ganha canvas vertical excessivo e o painel direito segue alinhado.
