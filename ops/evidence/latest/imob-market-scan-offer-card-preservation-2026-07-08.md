# Evidência real — preservação do card canônico de market scan offer (2026-07-08)

## Escopo

Subcorreção mínima no engine para preservar a surface canônica de `presentation.card` quando:

- o `resolveImobTurn()` base já produziu um card canônico;
- o resultado registration-aware perdeu esse card;
- não existe surface substitutiva mais forte, como `presentation.blocks`.

Arquivos alterados:

- `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts`
- `apps/api/src/tests/imob-crm-turn-engine.test.ts`

Arquivos não alterados nesta etapa:

- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/crm/imobCrmTurnBatch.ts`
- `apps/api/src/services/imob/imobIntentCatalog.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- feature `workspace_case_list`

## Correção aplicada

No `imobCrmTurnEngine`:

1. `preserveCanonicalOperationalSurface(...)` passou a considerar `presentation.card` canônico, além de `form`, quando o turno adaptado não traz `card` nem `blocks`.
2. A mesma preservação foi reaplicada depois de `applyResponsibleLabelToResolvedTurn(...)` e `normalizeLeadQualifyResolution(...)`, para não perder a surface durante transforms intermediários do engine.
3. O clear de card legado em `applyImobCrmCopyStateToResolution(...)` deixou de remover `card` no variant `collecting_fields` quando o fluxo não usa `form`. Isso preserva o caso canônico de `property.market_scan`, que é collecting sem form e com card orientador.

## Payload E2E antes/depois

### Antes da correção

Payload real capturado no runtime HTTP do primeiro `resolve-turn`:

```json
{
  "action": "crm.market_scan.offer",
  "flow": "property.market_scan",
  "card": null,
  "blocks": null,
  "quickReplies": [
    "fazer varredura de mercado",
    "cadastrar imóvel específico",
    "mostrar bloqueios do caso"
  ]
}
```

Leitura:

- `action` e `flow` já estavam corretos
- o CTA existia apenas de forma degradada em `quickReplies`
- `presentation.card.ctas` não sobrevivia ao engine end-to-end

### Depois da correção

Payload real capturado no runtime HTTP do primeiro `resolve-turn`:

```json
{
  "action": "crm.market_scan.offer",
  "flow": "property.market_scan",
  "card": {
    "title": "Escolha como seguir",
    "lines": [
      "Cidades detectadas: Camboriú, Itajaí",
      "Finalidades detectadas: compra, locacao, venda",
      "Tipo de imóvel ainda não informado.",
      "Quantidade de quartos ainda não informada.",
      "Faixa de valor ainda não informada.",
      "A varredura de mercado continua governada e não cria imóvel, lead ou proprietário."
    ],
    "actionsLayout": "inline",
    "ctas": [
      {
        "id": "market-scan-start",
        "label": "Fazer varredura de mercado",
        "kind": "primary",
        "action": "send_suggested_message",
        "nextMessage": "fazer varredura de mercado"
      },
      {
        "id": "market-scan-specific-property",
        "label": "Cadastrar imóvel específico",
        "kind": "secondary",
        "action": "send_suggested_message",
        "nextMessage": "cadastrar imóvel específico"
      }
    ]
  },
  "quickReplies": [
    "fazer varredura de mercado",
    "cadastrar imóvel específico",
    "mostrar bloqueios do caso"
  ]
}
```

Leitura:

- `presentation.card` voltou a existir no payload E2E
- o CTA alvo reapareceu em `presentation.card.ctas[0]`
- as `quickReplies` corretas foram preservadas

## Testes executados

### `node --import tsx --test apps/api/src/tests/imob-turn-resolver.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob-crm-turn-engine.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob.crm-turn-batch.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob-crm-workspace-case-list.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob.chat.workspace-case-list-route.test.ts`

```text
# pass 1
# fail 0
```

### `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx`

```text
[sem diff]
```

## Contract test real

Comando:

```bash
node --import tsx --test apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts
```

Resultado desta etapa:

- a falha anterior da linha 344 foi corrigida
- o subtest 5 avançou além da verificação do CTA inicial

Bloqueios residuais agora observados:

1. Falha funcional posterior no mesmo subtest:

- `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts:388`
- `selectionCta` não encontrado após o passo de scan

2. Falha de cleanup no hook `after`:

- FK em `imob_market_scan_runs_workspace_id_fkey`
- o teardown atual do contract test não apaga `imob_market_scan_runs` antes de `workspace.deleteMany`

Resumo observado:

```text
# tests 8
# pass 6
# fail 1
# skipped 1
```

Com um `hookFailed` adicional no teardown do arquivo.

## Observação operacional

Uma captura auxiliar de payload E2E deixou resíduos temporários no banco local porque o cleanup auxiliar falhou primeiro por FK e a tentativa seguinte de limpeza explícita foi rejeitada fora do sandbox. Isso não altera o diagnóstico funcional desta evidência, mas recomenda cleanup manual/local antes de novas rodadas de inspeção ad hoc.

## Status

- subcorreção de preservação do card canônico: `evidenciada`
- contract test HTTP completo: `parcial/evidenciado`
- bloqueios remanescentes: seleção pós-scan e cleanup do teardown do próprio contract test

