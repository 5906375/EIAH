# Signal Forwarding (Radar → MKT) — adaptação da cadeia real

Etapa interna da entrega Radar → MKT. Usa `createRunRecord`/`assertWorkspaceAgentEnabled`
reais (não fixtures) dentro de uma transação única (`prisma.$transaction`), e
`checkScopePermission` real (fail-closed) para autorização.

Ver `signalForwardingService.ts` para o aviso completo sobre o escopo
`runs.execute` usado (provisório, não é integração da frente AUTHZ-RUNS/R0A).

## Rodar os testes (banco descartável)

Os testes usam conexões diretas via `pg`/`@prisma/adapter-pg` para observar
`pg_stat_activity` (prova de concorrência real). Como `apps/api` não declara
essas dependências diretamente, crie o symlink local (não commitado,
`.gitignore` já cobre `node_modules`) antes de rodar:

```bash
ln -s ../../../../../../packages/db/node_modules \
  apps/api/src/services/signalForward/__tests__/node_modules

export DATABASE_URL="postgresql://<usuario>:<senha>@<host>:<porta>/<banco_descartavel>"
node_modules/.bin/tsx --test apps/api/src/services/signalForward/__tests__/*.test.ts
```

**Nunca aponte `DATABASE_URL` para banco compartilhado, staging ou produção.**

## Não pronto para produção

Autorização usa um nome de escopo provisório; recuperação banco/fila,
proteção do worker e interface não são cobertas por estes testes.
