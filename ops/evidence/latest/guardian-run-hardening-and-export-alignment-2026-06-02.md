# Guardian run hardening and export alignment — 2026-06-02

## Objetivo

Corrigir três regressões observadas no fluxo do `guardian` sem alterar layout visual ou responsividade:

1. impedir `success` falso quando a saída do modelo for truncada;
2. reduzir duplicação do payload gerado a partir de recipes no self-service;
3. impedir que export/preview use artefato `runAtivoUniversal` genérico incompatível com o run real.

## Causa observada

- O worker persistia `status: success` mesmo quando `choices[0].finish_reason === "length"`.
- O prefill do `guardian` repetia o mesmo bloco longo em `notes`, `evidence`, `rawPayload` e `executionInput`, inflando contexto.
- O `RunViewer` priorizava `reporting.runAtivoUniversal.pdfHtml/landingHtml` sem validar aderência ao agente, permitindo export genérico de pitch em runs do `guardian`.

## Mudanças aplicadas

### 1. Hardening do worker

- Novo utilitário: `apps/api/src/workers/runWorkerOutputValidation.ts`
- Integração no worker: `apps/api/src/workers/runWorker.ts`
- Regra aplicada:
  - se a resposta do provedor vier com `finish_reason === "length"`, o fluxo interrompe antes da finalização de sucesso;
  - o run segue para o caminho de erro do worker em vez de registrar `success` falso.

### 2. Deduplicação do prefill do Guardian

- Arquivo: `apps/web/src/pages/self-service/recipePrefill.ts`
- Ajuste:
  - `notes` continua recebendo o contexto operacional completo da recipe;
  - `evidence` passa a usar resumo/provas concisas, sem copiar o bloco inteiro de instruções quando não existir seção explícita de evidência.

### 3. Alinhamento do export/run viewer

- Arquivo: `apps/web/src/components/runs/RunViewer.tsx`
- Ajustes:
  - o viewer/export ignora `runAtivoUniversal` para `guardian` quando o HTML aparenta ser artefato genérico de pitch;
  - o fallback local passa a prevalecer nesses casos;
  - o relatório do `guardian` deixa de injetar links genéricos de Figma/Canva e usa apenas referências compatíveis.

## Testes e validação

Executado com sucesso:

- `TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/run-worker-output-validation.test.ts`
- `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/self-service/recipePrefill.test.ts`
- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`

## Risco residual

- A validação de truncamento está focada no formato OpenAI-style (`choices[].finish_reason`). Outros providers com convenção diferente ainda dependem de extensão futura do util.
- O filtro de compatibilidade do `runAtivoUniversal` foi mantido estreito e específico para `guardian`, para evitar regressão em outros agentes.
