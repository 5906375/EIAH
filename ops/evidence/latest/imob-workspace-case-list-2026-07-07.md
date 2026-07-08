# IMOB Workspace Case List — 2026-07-07

## Data

- 2026-07-07

## Escopo

- introduzir o intent conversacional `workspace_case_list`
- reaproveitar a capability existente de CRM `GET /imob/cases` via `ImobCrmRepository(prisma).listCases(...)`
- retornar leitura governada de lista de casos do workspace sem criar serviço paralelo
- evitar duplicação de `Próximo passo` no fallback de card canônico do chat IMOB

## Arquivos alterados

- `apps/api/src/services/imob/imobIntentCatalog.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/api/src/tests/imob-intent-catalog.test.ts`
- `apps/api/src/tests/imob-crm-workspace-case-list.test.ts`
- `apps/api/src/tests/imob.chat.workspace-case-list-route.test.ts`
- `apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts`

## Reuso confirmado

Ponto exato reaproveitado:

- `apps/api/src/routes/imobCrmRouter.ts`
- rota `GET /cases`
- chamada existente: `new ImobCrmRepository(prisma).listCases({ tenantId, workspaceId }, { flow, status })`

Aplicação no chat:

- `apps/api/src/routes/imob.ts` detecta `workspace_case_list`
- a resposta usa a mesma capability `ImobCrmRepository(prisma).listCases(...)`
- a adaptação para linguagem governada fica em `buildWorkspaceCaseListConsult(...)`
- não foi criado serviço paralelo de leitura de casos

## Checks reais executados

### `node --import tsx --test apps/api/src/tests/imob-intent-catalog.test.ts apps/api/src/tests/imob-crm-workspace-case-list.test.ts apps/api/src/tests/imob.chat.workspace-case-list-route.test.ts apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts`

```text
TAP version 13
# Subtest: apps/api/src/tests/imob-crm-workspace-case-list.test.ts
ok 1 - apps/api/src/tests/imob-crm-workspace-case-list.test.ts
# Subtest: apps/api/src/tests/imob-intent-catalog.test.ts
ok 2 - apps/api/src/tests/imob-intent-catalog.test.ts
# Subtest: apps/api/src/tests/imob.chat.workspace-case-list-route.test.ts
ok 3 - apps/api/src/tests/imob.chat.workspace-case-list-route.test.ts
# Subtest: apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts
ok 4 - apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts
1..4
# pass 4
# fail 0
```

### `node --import tsx --test apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts`

```text
not ok - hookFailed
error: Package subpath './events/redisPublisher' is not defined by "exports" in @eiah/core
error: connect EPERM 127.0.0.1:5433
```

Leitura conservadora:

- o contrato HTTP amplo não foi validado neste ambiente por bloqueio externo de runtime/import/export e acesso ao Postgres local
- a cobertura desta passada ficou ancorada em intent, helper governado, prova de reuso da capability e regressão de render

## Resultado observado

- intent novo reconhecido: `workspace_case_list`
- frases cobertas:
  - `mostre-me a lista dos códigos`
  - `listar códigos`
  - `ver casos`
  - `listar meus casos`
  - `mostrar casos recentes`
- reuso da capability confirmado por teste de rota-fonte
- `ChatAgentLauncher.tsx` permaneceu intocado
- o fallback de card canônico do chat agora suprime `Próximo passo recomendado` quando `presentation.nextStep` ou `presentation.suggestedNextAction` já existem

## Status conservador

- implementação: `parcial`
- evidência: `evidenciado`
- contrato HTTP amplo do fluxo: `não validado neste ambiente`
- conclusão: não declarar `DONE`
