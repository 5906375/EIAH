# Drift de testes tenantGuard após adoção de Prisma extension

Data: 2026-07-24
Baseline: `main@0fb2b279224460f72aae54e46b7ab15b1b2a4ec2`
Classificação: dívida técnica preexistente, separada do gate Neon

## Evidência observada

O comando local:

```bash
pnpm --filter @repo/db test
```

terminou com agregação `pass 1`, `fail 3`. Os arquivos afetados são:

- `packages/db/src/__tests__/tenantGuard.test.ts`;
- `packages/db/src/__tests__/tenantIsolation.integration.test.ts`;
- `packages/db/src/middleware/tenantGuard.test.ts`.

As falhas ocorrem antes das asserções com:

```text
t.$extends is not a function
```

## Hipótese de causa

`packages/db/src/middleware/tenantGuard.ts` atualmente retorna uma Prisma
extension construída com `Prisma.defineExtension`. Os testes afetados ainda
tratam o retorno como o middleware legado e fornecem doubles sem `$extends`.
Isso indica drift entre a API atual da extensão e a forma de instalação
exercitada pelos testes.

Esta é uma hipótese baseada na inspeção local e no erro observado; não houve
correção do `tenantGuard` nesta entrega.

## Impacto

- a suíte ampla de `@repo/db` permanece vermelha;
- regressões fora do recorte selecionado podem ficar sem sinal agregado;
- usar a suíte ampla como required check agora bloquearia todos os PRs por
  uma incompatibilidade de harness preexistente.

## Por que não bloqueia o gate Neon selecionado

O workflow Neon executa diretamente
`packages/db/src/__tests__/toolContractUnique.integration.test.ts` contra a
URL efêmera e executa, separadamente, migration status, integridade
migration/schema e o classificador do schema diff. O erro de `$extends` não é
alcançado por esse teste focado e não pertence ao lifecycle da migration
validada.

Isso não transforma a suíte ampla em verde nem encerra a dívida. Apenas
mantém a falha conhecida fora do required check específico enquanto ela é
tratada em frente própria.

## Recomendação de correção

Em PR separado:

1. atualizar os testes para instanciar um Prisma client compatível e aplicar
   a extension via `$extends`, ou extrair a decisão pura do guard para testes
   unitários sem mock incompleto do client;
2. preservar testes de isolamento multi-tenant contra banco real;
3. executar `pnpm --filter @repo/db test` até ficar integralmente verde;
4. depois considerar promover a suíte ampla a gate adicional do preview.

Nenhuma issue remota foi criada nesta revisão porque o cliente GitHub local
não está autenticado. Este arquivo é o registro rastreável solicitado até que
uma issue possa ser aberta.
