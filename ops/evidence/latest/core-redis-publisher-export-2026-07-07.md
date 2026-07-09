# Core Redis Publisher Export — 2026-07-07

## Data

- 2026-07-07

## Escopo

- corrigir apenas o bloqueio de packaging do subpath `@eiah/core/events/redisPublisher`
- não alterar feature IMOB `workspace_case_list`
- não alterar `ChatAgentLauncher.tsx`
- não alterar contract test HTTP real para mascarar Postgres/Redis

## Alteração aplicada

Arquivo alterado:

- `packages/core/package.json`

Mudança realizada:

- adição do export específico `./events/redisPublisher`

Trecho aplicado:

```json
"./events/redisPublisher": {
  "import": "./dist/events/redisPublisher.js",
  "types": "./dist/events/redisPublisher.d.ts"
}
```

## Pré-condição confirmada

Artefatos já existentes no build:

- `packages/core/dist/events/redisPublisher.js`
- `packages/core/dist/events/redisPublisher.d.ts`

Conclusão:

- não foi necessário alterar `packages/core/tsup.config.ts`

## Isolamento de escopo

### `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx`

Resultado:

- diff vazio

Leitura:

- `ChatAgentLauncher.tsx` permaneceu intocado

### `git diff -- packages/core/package.json`

Resultado relevante:

```diff
+    "./events/redisPublisher": {
+      "import": "./dist/events/redisPublisher.js",
+      "types": "./dist/events/redisPublisher.d.ts"
+    },
```

## Verificação mínima de import

Comando executado no contexto real de `apps/api`:

```bash
node --import tsx -e "import('@eiah/core/events/redisPublisher').then(() => console.log('IMPORT_OK')).catch((err) => { console.error(err); process.exit(1); })"
```

Resultado:

```text
IMPORT_OK
```

Leitura:

- `ERR_PACKAGE_PATH_NOT_EXPORTED` deixou de ser o bloqueador observado para esse subpath

## Contract test amplo

Comando executado:

```bash
node --import tsx --test apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts
```

Resultado observado:

- o teste iniciou com `TAP version 13`
- não concluiu dentro da janela observada no ambiente atual

Leitura conservadora:

- o bloqueio de packaging deixou de ser o bloqueador principal
- permanece bloqueio residual de `sandbox/runtime`

## Bloqueios residuais

- dependência real de Postgres local em `127.0.0.1:5433`
- Redis local potencialmente envolvido no bootstrap/teardown do teste
- o teste continua sendo HTTP/contract real com Prisma e cleanup reais

## Status conservador

- packaging `@eiah/core/events/redisPublisher`: `corrigido/evidenciado`
- import mínimo do subpath: `evidenciado`
- `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts`: `parcial`
- bloqueio remanescente: `sandbox/runtime`
- não declarar `DONE`
