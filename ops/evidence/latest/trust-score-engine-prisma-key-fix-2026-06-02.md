# Trust Score Engine Prisma Key Fix — 2026-06-02

## Objetivo

Corrigir o drift entre o `trustScoreEngine` e o schema Prisma do modelo `AgentTrustScore`, removendo o erro:

- `Unknown argument tenantId_workspaceId_agentId`

## Causa raiz

O schema nomeia a chave única composta de `AgentTrustScore` como:

- `unique_trustscore_agent`

O serviço `apps/api/src/services/trustScoreEngine.ts` ainda consultava e fazia `upsert` com o selector legado:

- `tenantId_workspaceId_agentId`

Isso fazia o Prisma falhar durante a atualização de confiança observada após runs bem-sucedidos do `guardian`.

## Mudança aplicada

- extraído helper `buildTrustScoreWhereUnique(tenantId, workspaceId, agentId)`
- `findUnique` e `upsert` do `trustScoreEngine` passaram a usar `unique_trustscore_agent`
- adicionada cobertura focada em `apps/api/src/tests/trust-score-engine.test.ts`

## Validação

Comando executado:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/trust-score-engine.test.ts
```

Resultado esperado:

- o helper resolve o selector composto com o nome canônico do schema
- o serviço deixa de depender de nome antigo embutido em múltiplos pontos

## Impacto

- sem alteração de layout visual ou responsividade
- correção restrita ao backend de governança cognitiva
- reduz ruído operacional em runs que atualizam `agentTrustScore`
