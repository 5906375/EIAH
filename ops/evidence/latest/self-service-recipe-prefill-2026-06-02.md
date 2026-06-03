# Self-service Recipe Prefill — 2026-06-02

## Objetivo

Permitir que recipes homologadas sirvam como ponto de continuidade real para os agentes ofertados no `self-service`, reaproveitando resumo e instruções publicadas no formulário do agente.

## Ajuste aplicado

- `Abrir no self-service` agora navega com `recipeId`
- o router passa a abrir o formulário genérico para agentes com `fields/buildPrompt`
- recipes vinculadas aparecem em destaque acima do formulário
- novo helper `apps/web/src/pages/self-service/recipePrefill.ts` distribui contexto da recipe em campos do agente

## Estratégia de prefill

- heurística comum:
  - extrai seções como `Objetivo:` e `Escopo:`
  - monta contexto operacional com título, resumo e instruções
  - preenche campos genéricos como `context`, `notes`, `question`, `desiredOutcome`
- refinamento para `guardian`:
  - infere `requestType`
  - separa `objective`
  - envia instruções operacionais para `evidence` e `notes`

## Validação

- `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/self-service/recipePrefill.test.ts`
- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`

## Resultado

Recipes do workspace passam a funcionar como continuidade operacional no formulário do agente, em vez de apenas vitrine de catálogo.
