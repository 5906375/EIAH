# IMOB captacao intake flow fix — 2026-07-02

## Data

- 2026-07-03

## Objetivo

- corrigir o drift de UI no fluxo de captação/cadastro de imóvel que exibia labels técnicos (`propertyType`, `goal`, `city`, `address`) e podia renderizar CTAs duplicados no mesmo turno quando `message.form` e `slotCollection` coexistiam;
- manter a arquitetura `agent-driven`, sem mover regra cognitiva para `ChatAgentLauncher`;
- não ativar `pilot` nem `small`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `CLAUDE.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/crm/imobCrmPropertyGoals.ts`
- `apps/api/src/services/imob/crm/imobCrmPropertyTypes.ts`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Arquivos alterados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx`
- `apps/web/src/features/workbench/vertical-chat/imobChatPresentationGuards.ts`
- `apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.test.tsx`

## Drift confirmado

- `ImobSlotCollectionCard` não possuía metadados para `propertyType`, `goal`, `cep`, `city` e `address`, então o fallback renderizava a key bruta.
- `chat.tsx` podia renderizar o `message.form` do turno e, no mesmo turno, outro `ImobSlotCollectionCard` vindo de `pendingExecution` ou `message.slotCollection`, duplicando coleta e CTA.
- o badge local ainda continha string visual inadequada no header do chat; foi mantido rótulo neutro `Contexto IMOB`.

## Correção aplicada

- adicionados labels humanos para campos de captação de imóvel no `ImobSlotCollectionCard`;
- criado guardrail leve `imobChatPresentationGuards.ts` para bloquear renderização de `slotCollection` quando o turno já possui `message.form`;
- aplicado o guardrail tanto no card de `pendingExecution` quanto no card vindo de `message.slotCollection`;
- preservada a coleta estruturada do engine e o `ChatAgentLauncher` permaneceu intocado;
- nenhum estado de `pilot` foi inventado ou ativado.

## Saída real dos testes/checks

### Teste focado do card/guardrail

```text
$ TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.test.tsx
TAP version 13
# Subtest: apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.test.tsx
ok 1 - apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.test.tsx
  ---
  duration_ms: 376.927596
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 387.988154
```

### Regressão focada do painel contextual IMOB

```text
$ TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
TAP version 13
# Subtest: apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
ok 1 - apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
  ---
  duration_ms: 374.830934
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 385.597591
```

### Grep final de copy/labels

```text
$ rg -n "PILOTO CONTROLADO|Piloto controlado|propertyType|goal|city|address" apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx apps/web/src/features/imob/ImobWorkbenchShell.tsx apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx
apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx:45:  propertyType: { label: "Tipo",                type: "text",   placeholder: "Ex: apartamento, casa, sala comercial" },
apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx:46:  goal:         { label: "Finalidade",          type: "select", options: [{ value: "venda", label: "Venda" }, { value: "locacao", label: "Locação" }, { value: "aluguel_por_temporada", label: "Aluguel por temporada" }] },
apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx:48:  city:         { label: "Cidade",              type: "text",   placeholder: "Ex: Itapema" },
apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.tsx:49:  address:      { label: "Endereço",            type: "text",   placeholder: "Rua, número" },
```

Leitura do grep:

- não restou `Piloto controlado` nos arquivos auditados;
- `propertyType`, `goal`, `city` e `address` permanecem apenas como chaves internas de mapeamento, não como copy crua de UI validada pelo teste.

## Confirmações de escopo

- `ChatAgentLauncher` não foi alterado.
- backend e engine IMOB não foram alterados neste PR.
- `pilot` não foi ativado.
- `small` não foi ativado.
- nenhuma UX nova foi promovida; houve apenas correção de drift visual/render-only no frontend IMOB.

## Gaps pendentes

- a evidência permanece focada em renderização/frontend; não houve execução browser E2E do fluxo completo de captação neste PR;
- o fluxo legado de compat no backend continua merecendo auditoria separada se voltar a emitir labels cruas fora do `message.form`.

## Status conservador

- correção do drift de labels/duplicação: `evidenciado`
- pilot operacional IMOB: `parcial`
- small rollout: `proposta`
