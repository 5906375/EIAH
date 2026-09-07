# Prova técnica — P2002 e concorrência da Alternativa A (Radar → MKT)

Harness experimental, isolado do produto. Não faz parte da entrega
Radar → MKT e não deve ser copiado para `packages/db`/`apps/api`.

## O que é real vs. simulado

- **Schema** (`prisma/schema.prisma`): experimental, banco descartável próprio.
  Não existe em `packages/db/prisma/schema.prisma` (produção).
- **`service.ts`**: reprodução fiel do mecanismo corrigido (transação única,
  catch externo, classificador antes da recuperação, releitura fora da
  transação). `createRunFixtureRecord` substitui `createRunRecord` real
  (mesma ideia, sem a lógica de atribuição de agente). `reauthorizeSignalForward`
  é um **stub explícito** — sempre autoriza; não comprova autorização
  integrada (`checkScopePermission`/`requireScope`/AUTHZ-RUNS ficam fora
  do escopo desta prova).
- **`classifier.ts`**: implementação real, construída a partir do erro
  REAL capturado em `capture-error.ts` (ver `ERROR_SHAPE.md`) — não é mais
  uma implementação pendente.

## Infraestrutura usada

- PostgreSQL 16.11 descartável, container `eiah-signalforward-poc-pg`,
  porta 5544, sem volume persistente, sem dados de produção/staging.
- `@prisma/client@7.2.0` + `@prisma/adapter-pg@7.2.0` (idêntico ao baseline
  `11805d1934573281e2787c2442b546c172b76947`).

## Como reproduzir

```bash
docker run --rm -d --name eiah-signalforward-poc-pg \
  -e POSTGRES_PASSWORD=poc_only_local -e POSTGRES_DB=signalforward_poc \
  -p 5544:5432 pgvector/pgvector:pg16

export POC_DATABASE_URL="postgresql://postgres:poc_only_local@localhost:5544/signalforward_poc"

# gerar client + aplicar schema experimental
node_modules/.bin/prisma generate --schema ./prisma/schema.prisma   # (a partir desta pasta, via symlink de node_modules)
node_modules/.bin/prisma db push --schema ./prisma/schema.prisma --accept-data-loss

# capturar o formato real do erro (evidência já registrada em ERROR_SHAPE.md)
node_modules/.bin/tsx capture-error.ts

# rodar a suíte completa
node_modules/.bin/tsx --test tests/*.test.ts
```

## Limite explícito

Esta prova demonstra classificação correta do P2002, recuperação após
rollback, e unicidade de solicitação/destino sob concorrência REAL
(comprovada por observação de locks, não por Promise.all). Não demonstra
autorização integrada, recuperação banco/fila, proteção completa do worker,
interface, nem o funcionamento ponta a ponta Radar → MKT.
