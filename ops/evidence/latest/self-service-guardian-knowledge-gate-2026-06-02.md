# Self-service Guardian Knowledge Gate — 2026-06-02

## Objetivo

Remover a falha de promoção de recipes do `guardian` no `self-service` quando o backend bloqueava o run com `knowledge_required_source_missing`.

## Causa raiz

O `self-service` enviava apenas `rawPayload` no metadata do run.

A knowledge gate do backend resolve fontes determinísticas a partir de chaves como:

- `metadata.executionInput`
- `metadata.previousRuns`
- `metadata.billingLedger`
- `metadata.resolvedKnowledge.*`

`rawPayload` sozinho não era lido pela gate, então o `guardian` entrava em fail-closed apesar de o formulário já conter contexto operacional relevante.

## Ajuste aplicado

- `apps/web/src/pages/self-service/components/AgentFormShell.tsx`
  - passa a enviar `metadata.executionInput`
  - preserva `rawPayload` com o mesmo conteúdo para compatibilidade
- `apps/web/src/pages/self-service/components/RunStatusCard.tsx`
  - passa a mostrar resumo explícito quando o run falha por `knowledge_required_source_missing`

## Resultado esperado

- o preview continua funcionando
- a promoção continua assíncrona
- o worker passa a receber `executionInput` canônico para resolver fontes determinísticas
- se ainda houver bloqueio, a UI explica o motivo em linguagem operacional

## Validação

- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`
