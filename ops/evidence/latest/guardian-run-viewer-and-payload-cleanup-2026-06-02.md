# Guardian run viewer and payload cleanup — 2026-06-02

## Objetivo

Fechar quatro ajustes no fluxo do `guardian` após o hardening inicial:

1. remover o `Resumo estratégico` genérico herdado de `campaign` no viewer;
2. reduzir duplicação entre `metadata.form`, `executionInput` e `rawPayload`;
3. corrigir a leitura/exibição de `exploracao_pct`;
4. exibir evidências do `guardian` como contexto/checklist probatório em vez de placeholders genéricos.

## Problema observado

- O viewer ainda detectava `metadata.form` do `guardian` como `campaign form`, exibindo campos como `Público-alvo`, `Orçamento` e `KPIs`.
- O self-service enviava o mesmo conteúdo longo em múltiplos lugares do payload.
- O badge de exploração exibia valores inconsistentes (`0%` e `100%`) pela combinação de fonte e cálculo inadequados.
- O contexto de evidências do `guardian` não era mostrado de forma útil na área principal do run.

## Mudanças aplicadas

### 1. Viewer do run

Arquivo: `apps/web/src/components/runs/RunViewer.tsx`

- `extractCampaignForm(...)` agora só retorna formulário válido quando campos reais de campanha estão presentes.
- `guardian` deixa de cair no fallback de `campaign`.
- Novo bloco `Contexto probatório` com:
  - rota alvo
  - objetivo
  - checklist probatório
  - FinOps
  - PII / termos sensíveis
  - observações adicionais

### 2. Diagnóstico

Arquivo: `apps/web/src/components/runs/RunViewer.tsx`

- leitura centralizada de `diagnostico` com preferência por payload final/otimizado;
- remoção da duplicidade `Exploração: X% • Exploração: Y%`;
- badge passa a mostrar um único valor consistente.

### 3. Payload do self-service

Arquivo: `apps/web/src/pages/self-service/components/AgentFormShell.tsx`

- `executionInput` passa a priorizar `metadata.form`, que é o shape realmente útil para gate/execução;
- `rawPayload` só segue quando for diferente de `executionInput`;
- isso reduz redundância serializada sem quebrar o contrato atual.

### 4. Export/fallback do Guardian

Arquivo: `apps/web/src/components/runs/RunViewer.tsx`

- o fallback de resumo do `guardian` deixa de ser tratado como campanha;
- o report passa a usar visão compatível com contexto probatório quando necessário.

## Validação

- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`
- `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/self-service/recipePrefill.test.ts`

## Resultado esperado

- o `guardian` não mostra mais resumo genérico de campanha;
- o bloco técnico e o viewer central exibem contexto operacional coerente com o agente;
- o payload do self-service fica menor e menos redundante;
- o badge de exploração deixa de mostrar porcentagens contraditórias.
