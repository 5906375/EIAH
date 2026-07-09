# Evidência real — guard de batch para market scan ambíguo (2026-07-08)

## Escopo

Correção mínima para impedir que `rootSemanticIntent.composedIntents` promovam uma frase única de captação ambígua para `crm.batch.intake` sem sinal estrutural real de lote.

Arquivos alterados:

- `apps/api/src/services/imob/crm/imobCrmTurnBatch.ts`
- `apps/api/src/tests/imob.crm-turn-batch.test.ts`
- `apps/api/src/tests/imob-crm-turn-engine.test.ts`

Arquivos explicitamente não alterados:

- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/imobIntentCatalog.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/routes/imob.ts`
- feature `workspace_case_list`

## Correção aplicada

O extractor de lote passou a aceitar `semanticComposedIntents` como batch apenas quando a mensagem também carrega sinal estrutural real de lote, como:

- múltiplas linhas não vazias
- lista numerada
- bullets
- separadores fortes (`;` ou `|`)
- mais de um comando operacional textual explícito

Com isso, a frase:

```text
Quero captar um imóvel para comprar, vender, locação em Itajaí e Camboriú em Santa Catarina
```

deixa de abrir `crm.batch.intake` só porque o classificador semântico retornou múltiplos intents compostos.

## Diff resumido

```text
 apps/api/src/services/imob/crm/imobCrmTurnBatch.ts | 22 ++++++-
 apps/api/src/tests/imob-crm-turn-engine.test.ts    | 43 ++++++++++++
 apps/api/src/tests/imob.crm-turn-batch.test.ts     | 77 ++++++++++++++++++++++
 3 files changed, 141 insertions(+), 1 deletion(-)
```

## Testes executados

### `node --import tsx --test apps/api/src/tests/imob.crm-turn-batch.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob-crm-turn-engine.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob-turn-resolver.test.ts`

```text
# pass 1
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob.semantic-intent-resolver.test.ts`

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

Resultado real:

```text
# tests 8
# pass 6
# fail 1
# skipped 1
```

Mudança material no subtest 5:

- o bloqueio original por classificação indevida em `crm.batch.intake` deixou de ocorrer
- o subtest passou pelas asserções de:
  - `action = "crm.market_scan.offer"`
  - `conversationState.operational.flow = "property.market_scan"`

Falha residual atual:

```text
Expected values to be strictly equal:
+ actual - expected

+ undefined
- true
```

Ponto da falha:

- `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts:344`

Interpretação:

- a divergência de batch foi corrigida
- o bloqueio remanescente do contract test passou a ser a ausência do CTA `Fazer varredura de mercado` nesse nível end-to-end
- isso já é uma segunda frente, distinta da decisão de batch isolada nesta sessão

## Status

- subcorreção de classificação de batch: `evidenciada`
- contract test HTTP completo: `parcial/evidenciado`

