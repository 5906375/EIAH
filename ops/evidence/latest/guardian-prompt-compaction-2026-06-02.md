# Guardian prompt compaction — 2026-06-02

## Objetivo

Reduzir risco de `llm_output_truncated` no fluxo do `guardian` por meio de compactação do input e de instruções de output mais curtas, sem alterar layout visual/responsividade.

## Problema observado

- o preview estabilizou na faixa de `~8.1 KB` de entrada;
- o `guardian` ainda recebia `notes` longas e repetitivas;
- o prompt solicitava plano extenso demais para um contexto já pesado pelo `systemPrompt` do agente;
- isso voltava a produzir `llm_output_truncated`.

## Mudanças aplicadas

### 1. Compactação do prefill

Arquivo:
- `apps/web/src/pages/self-service/recipePrefill.ts`

Ajuste:
- `notes` do `guardian` deixam de carregar a recipe inteira;
- passam a sintetizar no máximo cinco bullets operacionais curtos:
  - resumo do contexto
  - exigência de `tenantId/workspaceId`
  - `/health`
  - rollback
  - WAF/evidências, quando detectados

### 2. Compactação do prompt do Guardian

Arquivo:
- `apps/web/src/pages/self-service/config.ts`

Ajuste:
- `buildPrompt(...)` passou a:
  - truncar campos longos;
  - transformar `evidence` em checklist compacto;
  - reduzir `notes` para observações operacionais resumidas;
  - pedir `JSON curto`;
  - limitar a resposta a no máximo 1 recomendação priorizada;
  - limitar `proximos_passos` a no máximo 7 itens.

## Impacto esperado

- menos texto repetido no `prompt`;
- menor pressão sobre tokens de entrada e saída;
- menor probabilidade de truncamento;
- mesmo fluxo funcional e mesma UI.

## Observação sobre bytes x tokens

- `bytes` no preview são apenas estimativa do corpo serializado;
- não equivalem diretamente a tokens do modelo;
- como referência prática, `~8.1 KB` costuma representar algo como `~2k–2.7k` tokens de texto bruto, mas o consumo real pode ser maior por causa de:
  - `systemPrompt`
  - metadados adicionais
  - serialização interna do provider
  - tokens em cache

## Validação executada

- `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/self-service/recipePrefill.test.ts`
- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`

## Próximo passo operacional

Gerar novo `shadow preview` e promover nova execução do `guardian` para confirmar:

1. queda do input estimado;
2. ausência de `llm_output_truncated`;
3. manutenção do conteúdo útil na recomendação final.
