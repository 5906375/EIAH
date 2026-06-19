# IMOB Chat Workbench — Fase 9.0 Multi-Vertical Visual Foundation

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: consolidacao da base visual multi-vertical do Workbench, aplicada primeiro ao IMOB

## Objetivo

Registrar a consolidacao de uma fundacao visual reutilizavel para Workbench multi-vertical, mantendo o IMOB como primeira vertical ativa e preservando o chat central, o painel contextual render-only, os CTAs seguros e os fallbacks ja existentes.

## Estrutura reutilizada

Rotas e superficies existentes consultadas:

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/dashboard.tsx`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/web/src/features/imob/ThreadPanel.tsx`
- `apps/web/src/features/imob/ImobChatWidgets.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`

Padroes reaproveitados:

- rota existente `/app/imob/chat`;
- shell funcional do chat IMOB ja em producao de piloto;
- `extractImobWorkbenchIntakeContext` para projetar contexto real;
- quick actions ja existentes do rodape;
- painel contextual render-only;
- deeplinks seguros para `Command Center`, `Funil` e `RunArchive`;
- padroes de `verticalId`, `tenantId` e `workspaceId` ja existentes no frontend.

## Componentes novos ou consolidados

Componentes criados nesta fase:

- `apps/web/src/features/workbench/VerticalWorkbenchShell.tsx`
- `apps/web/src/features/workbench/WorkbenchPanelCard.tsx`

Componentes ajustados para usar a nova base:

- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobIntakeSummaryPanel.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`

## O que a fase mudou visualmente

- sidebar IMOB mantida escura e mais coesa com a identidade da vertical;
- area central movida para superficie clara, com header `Document Intake / IMOB v2.1`;
- painel direito mantido claro, com cards brancos e hierarquia operacional mais limpa;
- quick actions mantidas proximas ao input, agora em card proprio;
- cards do intake e do painel contextual padronizados pela nova base;
- toggle mobile/tablet do painel contextual preservado na fundacao generica;
- mensagem explicita de base pronta para futuras verticais sem mover logica de negocio para a UI.

## Validacao por renderizacao sanitizada

Base de validacao usada:

- renderizacao estatica dos componentes reais em `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`;
- validacao do shell em tres colunas, copy principal e badge de piloto;
- validacao dos estados `loading`, `empty`, `error` e `ready`;
- validacao dos CTAs seguros e do fallback de Dossie;
- validacao de ausencia de PII por padroes de CPF e e-mail.

Indicadores observados na renderizacao:

- `IMOB Conversation Workbench`
- `Document Intake / IMOB v2.1`
- `Painel contextual`
- `Piloto controlado`
- `Abrir contexto no Command Center`
- `Abrir Funil deste caso`
- `Abrir execução no RunArchive`
- `Dossiê indisponível neste piloto`

## Verificacao de integridade de dados

Grep executado sobre os arquivos do shell/contexto:

```bash
rg -n "João|Maria|850\\.000|matricula_imovel_12345|contrato_compra_venda\\.pdf|apartamento 101" \
  apps/web/src/pages/app/imob/chat.tsx \
  apps/web/src/features/imob \
  apps/web/src/features/workbench
```

Leitura:

- nenhum dos hardcodes proibidos apareceu nos arquivos alterados desta fase;
- houve apenas ocorrencias preexistentes de `Mariana` em testes antigos fora do shell/workbench ajustado;
- nenhum dado do mock foi promovido a fonte real.

## Testes focados

Comando executado:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado:

- `5/5` arquivos de teste passaram com exit `0`;
- cards de intake seguiram renderizando;
- shell e painel contextual seguiram render-only;
- CTAs e fallbacks permaneceram seguros;
- nenhuma regressao de PII foi observada.

## Gate documental

Comando executado:

```bash
pnpm check:evidence-index
```

Resultado:

- `ok: true`

## Invariantes preservadas

- `ChatAgentLauncher` nao recebeu logica nova de negocio
- backend nao foi alterado
- worker nao foi alterado
- storage provider nao foi alterado
- draft store nao foi alterado
- retention cleanup nao foi alterado
- observability nao foi alterada
- nenhum destino/rota foi inventado
- nenhum dado do mock foi hardcoded como dado real
- PII nao aparece
- status permanece `PILOTO CONTROLADO`
