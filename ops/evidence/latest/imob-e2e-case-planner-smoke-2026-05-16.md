# IMOB E2E Case Planner Smoke — 2026-05-16

## Escopo

Validação focada do incremento PR8 do Chat IMOB:
- `recipeId` sai do cliente web e chega ao contrato de `/imob/chat/resolve-turn`;
- recipe IMOB homologada parametriza `missionContext`;
- planner conduz missão `capture_seasonal_property`;
- perguntas humanas reais não geram loop de CTA;
- ações resolvidas são suprimidas;
- `property.link_owner` vira próxima ação quando owner e property existem sem vínculo;
- `case.review` permanece recuperação válida.

## Comandos executados

```bash
pnpm --filter @eiah/api exec tsx --test src/tests/imob-human-questions.e2e.test.ts src/tests/imob-tenant-recipe-context.test.ts src/tests/imob-recipe-planner-integration.test.ts src/tests/imob-mission-inheritance.test.ts src/tests/imob-crm-turn-engine.test.ts
```

Resultado: `41/41` testes passando.

```bash
pnpm --filter @eiah/web exec tsx --test src/features/imob/imobApiClient.test.ts
```

Resultado: `2/2` testes passando.

## Evidência de comportamento

Cobertura automatizada adicionada:
- `apps/api/src/tests/imob-human-questions.e2e.test.ts`
- `apps/api/src/tests/imob-tenant-recipe-context.test.ts`
- `apps/api/src/tests/imob-recipe-planner-integration.test.ts`
- `apps/web/src/features/imob/imobApiClient.test.ts`

Invariantes cobertas:
- owner ausente gera `owner.create`;
- owner resolvido suprime `owner.create`;
- property resolvida suprime `property.create`;
- owner + property sem vínculo gera `property.link_owner`;
- vínculo concluído avança para `documents.collect`;
- `case.review` permanece disponível como recuperação;
- `recipeId` não cria regra na UI, apenas parametriza o backend.

## Limite

Esta evidência cobre contrato, engine, planner e cliente web de forma focada. Ela ainda não é um teste browser full-flow clicando no catálogo, abrindo o chat e salvando registros reais via UI.
