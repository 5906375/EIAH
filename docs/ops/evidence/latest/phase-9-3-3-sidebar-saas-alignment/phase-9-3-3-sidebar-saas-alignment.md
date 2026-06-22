# IMOB Chat Workbench — Fase 9.3.3 IMOB Sidebar SaaS Alignment

Data: 2026-06-19  
Status: EVIDENCIADO  
Escopo: modernização visual apenas da sidebar esquerda de `/app/imob/chat`, preservando Product Shell da 9.3.2, responsividade da 9.3.1, auth/entitlement da 9.2 e todo o fluxo de chat existente.

## Causa da aparência antiga

A sidebar anterior estava visualmente densa por três fatores combinados:

- header escuro com copy operacional demais (`Conversas e operações`);
- bloco de ações e busca pouco hierarquizado, com separadores secos e cards pesados;
- lista/empty state com cartões escuros grandes e estados ativos pouco distintos.

O efeito era uma lateral com excesso de peso visual, scroll longo e competição com a área central clara.

## Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/pages/app/imob/chat.tsx` | Refino visual da sidebar IMOB: header, stats, ações, busca, lista e empty state, sem alterar handlers nem fluxo. |
| `scripts/smoke-9-3-3.mjs` | Smoke Playwright dedicado da fase 9.3.3 para validar sidebar e gerar screenshots. |
| `docs/ops/evidence/latest/phase-9-3-3-sidebar-saas-alignment/phase-9-3-3-sidebar-saas-alignment.md` | Evidência desta fase. |
| `docs/EVIDENCE_INDEX.md` | Índice atualizado para apontar à evidência criada. |

## Ajustes aplicados na sidebar

- Bloco `IMOB Workspace` ficou mais leve, com título `Conversas do intake`, copy curta e stats em cards menores.
- Botões `+ Nova conversa` e `Ver operações` passaram para pills mais limpas e menos pesadas.
- Busca ganhou micro-hierarquia própria (`Busca rápida`) e um campo visualmente mais estável.
- A seção de operações agora aparece dentro de um container discreto quando aberta, sem alterar `ThreadPanel`.
- A lista de conversas recebeu:
  - heading `Conversas recentes`;
  - cards com borda/sombra mais suaves;
  - badge `Ativa` para a conversa selecionada;
  - empty state mais leve.
- O fundo escuro e a largura de `280px` foram preservados, mas com menor densidade visual.

## Handlers e props preservados

Os seguintes pontos foram mantidos sem alteração de lógica:

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

Nenhuma regra foi movida para `ChatAgentLauncher`. Nenhum handoff, seleção, engine ou backend foi alterado.

## Validação executada

### Testes focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: **5/5 arquivos pass**, exit `0`

### Browser smoke real

```bash
node scripts/smoke-9-3-3.mjs
```

Resultado: **22/22 checks OK**

Checks centrais:

- `IMOB Workspace` presente
- `Conversas do intake` presente
- título antigo `Conversas e operações` ausente
- `Busca rápida` presente
- `Conversas recentes` presente
- botões `Nova conversa` e `Ver operações` presentes
- sidebar desktop visível com `width = 280`
- textarea continua visível no viewport em todas as resoluções
- sidebar continua oculta abaixo de `lg`, preservando a hardening responsiva da 9.3.1

### Screenshots capturadas

Arquivos em `docs/ops/evidence/latest/phase-9-3-3-sidebar-saas-alignment/`:

- `after-1440x900.png`
- `after-1280x800.png`
- `after-768x1024.png`
- `after-390x844.png`
- `smoke-results-9-3-3.json`

## Grep anti-hardcode

Comando bruto exigido:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Leitura:

- houve ocorrências apenas em fixtures de teste preexistentes, principalmente em `*.test.tsx`;
- nenhuma ocorrência nos arquivos de produção alterados da sidebar.

Verificação focada nos arquivos de produção alterados:

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/App.tsx \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob/ImobWorkbenchShell.tsx \
  apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx \
  apps/web/src/features/workbench/VerticalWorkbenchShell.tsx
```

Resultado: **0 ocorrências**

## Gate documental

```bash
pnpm check:evidence-index
```

Resultado: `ok: true`

## Invariantes preservadas

- Product Shell da 9.3.2 preservado
- responsividade da 9.3.1 preservada
- auth/entitlement da 9.2 preservados
- backend não alterado
- worker não alterado
- storage/draft/retention/observability não alterados
- `VerticalWorkbenchShell` preservado
- `WorkbenchPanelCard` preservado
- nenhuma rota nova criada
- nenhum destino inventado
- nenhum dado do mock hardcoded como dado real
- PII não aparece
- status operacional permanece **PILOTO CONTROLADO**

## Conclusão

A Fase 9.3.3 ficou evidenciada. A sidebar esquerda do IMOB Workbench passou a comunicar melhor um padrão SaaS limpo, com menos peso visual e menor competição com o chat central, preservando integralmente os handlers, a lógica conversacional e os gates operacionais já consolidados.
