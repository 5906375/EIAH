# Guardian export and score alignment — 2026-06-02

## Objetivo

Fechar a rodada focada em:

1. export HTML/PDF coerente para `guardian`;
2. unificação visual de `score` e `diagnóstico` no viewer/export.

## Problemas observados

- o export ainda herdava partes de `pitch/campaign`, incluindo subtítulo e chips indevidos;
- `guardian` podia ser interpretado como `campaign form` por causa de campos genéricos como `notes`;
- a recomendação no viewer mostrava `Score 0.35` ao lado de outro badge `Score 0.00`, que na prática era delta nulo;
- hero/export e viewer podiam divergir na leitura do `diagnostico`.

## Mudanças aplicadas

Arquivo principal:
- `apps/web/src/components/runs/RunViewer.tsx`

### Export Guardian

- `extractCampaignForm(...)` agora ignora payloads que claramente pertencem ao `guardian`;
- `renderSummaryBlock(...)` usa resumo probatório dedicado quando o agente é `guardian`;
- `renderAgentSignature(...)` passou a renderizar bloco próprio do `guardian` com:
  - rota alvo
  - objetivo
  - checklist probatório
  - PII / termos sensíveis
  - FinOps
- `buildFallbackSummary(...)` e `buildGuardianSummaryMarkup(...)` reduzem texto longo e limpam o checklist;
- o export deixa de cair no fallback visual de campanha para o `guardian`.

### Score e diagnóstico

- `extractDiagnosticPayload(...)` centraliza a leitura do diagnóstico com preferência pelo payload final/otimizado;
- hero do export usa a mesma origem de diagnóstico do viewer;
- delta de score agora só aparece quando há diferença material (`>= 0.01`);
- badge duplicado com delta zero deixa de ser exibido.

## Efeito esperado

- export claro/HTML do `guardian` deixa de mostrar contexto de pitch/campaign;
- `Resumo probatório` substitui o resumo genérico onde aplicável;
- score principal e delta deixam de parecer valores conflitantes;
- o diagnóstico do export e do viewer passa a usar a mesma base.

## Validação

- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`
